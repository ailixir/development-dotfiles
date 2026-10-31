import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import Ajv from 'ajv';
import { GATE_DIR } from './common.ts';
import {
  STEP_RECEIPT_CLOSED_CODES,
  StatusShapeError,
  learningReceipts,
  sessionStepIds,
  parseAttemptReceipts,
  parseAttemptRows,
  parseHeadPointers,
  parseStepReceipt,
  parseStepReceiptRows,
  parseExecutionList,
  parseLatestAttempts,
  parseLedgerRows,
  parseSession,
  expireLearningTiming,
  learningDeadlineMs,
  learningIntervals,
  learningSessionIds,
  learningTimingProblems,
  newLearningTiming,
  parseLearningTiming,
  recordLearningReceipt,
} from './status.ts';
import type { LearningReceipt } from './status.ts';

const V3 = join(GATE_DIR, '../../../docs/specs/studio-observed-authoring/contracts/v3');
const UUID = '0b6a2f4e-5c1d-4e8a-9f3b-7a1c2d3e4f50';
const TS = '2026-10-27T12:00:00Z';

const timingReceipt = (over: Partial<LearningReceipt> = {}): LearningReceipt => ({ runId: 'rg-20261027-1', clockId: 'clock', testId: 't', sessionId: 'session1', sourceRevision: '1', configurationRevision: '2', stepIds: ['a', 'b', 'c'], attempt: 1, state: 'OBSERVING', stepIndex: 0, requestStartMs: 1000, responseEndMs: 2000, ...over });
const timingExpected = { runId: 'rg-20261027-1', testId: 't', sourceRevision: 1, configurationRevision: 2, stepIds: ['a', 'b', 'c'], sessionId: 'session1' };

test('actual session-ID reader requests JSON rows from psql rather than parsing raw UUID text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-reader-'));
  try {
    const psql = join(dir, 'psql');
    writeFileSync(psql, `#!/usr/bin/env node\nconst sql=process.argv.at(-1);if(!/^select row_to_json\\(t\\) from \\(select session_id as id from studio_guided_sessions where test_id='[a-z0-9-]+'\\) t$/.test(sql))process.exit(9);process.stdout.write(JSON.stringify({id:'${UUID}'})+'\\n');\n`, { mode: 0o700 });
    assert.deepEqual(learningSessionIds({ psql, port: '1' }, UUID), [UUID]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('learning brackets preserve request-start lower bounds and cover skipped contiguous steps', () => {
  const t = newLearningTiming('rg-20261027-1', 't', 'clock');
  recordLearningReceipt(t, timingReceipt());
  recordLearningReceipt(t, timingReceipt({ stepIndex: 2, requestStartMs: 90_000, responseEndMs: 91_000 }));
  assert.deepEqual(learningIntervals(t).map((s) => [s.startLowerMs, s.completionUpperMs]), [[0, 91_000], [1000, 91_000], [1000, null]]);
  assert.equal(learningDeadlineMs(t), 121_000, 'response-end is never an activation lower bound');
  recordLearningReceipt(t, timingReceipt({ stepIndex: 3, state: 'SUCCEEDED', requestStartMs: 120_000, responseEndMs: 121_000 }));
  assert.deepEqual(learningTimingProblems(t, timingExpected), []);
  assert.equal(learningIntervals(t)[2]?.elapsedUpperMs, 120_000);
  const over = structuredClone(t);over.receipts[2]!.responseEndMs += 1;
  assert.ok(learningTimingProblems(over, timingExpected).some((s) => s.includes('STEP_LEARNING_TIMEOUT')));
});

test('whole learning <=120000 bounds every completed step without manufacturing exact event times', () => {
  const t = newLearningTiming('rg-20261027-1', 't', 'clock');
  recordLearningReceipt(t, timingReceipt({ stepIndex: 3, state: 'SUCCEEDED', requestStartMs: 119_000, responseEndMs: 120_000 }));
  assert.deepEqual(learningIntervals(t).map((s) => s.elapsedUpperMs), [120_000, 120_000, 120_000]);
  assert.deepEqual(learningTimingProblems(t, timingExpected), []);
  assert.ok(learningTimingProblems(undefined, timingExpected)[0]?.includes('UNKNOWN'));
});

test('polls, clarification and a retried session cannot reset starts or erase an earlier timeout', () => {
  const t = newLearningTiming('rg-20261027-1', 't', 'clock');
  recordLearningReceipt(t, timingReceipt());
  recordLearningReceipt(t, timingReceipt({ state: 'AWAITING_CLARIFICATION', requestStartMs: 60_000, responseEndMs: 61_000 }));
  assert.equal(learningDeadlineMs(t), 120_000);
  recordLearningReceipt(t, timingReceipt({ sessionId: 'session2', attempt: 2, requestStartMs: 90_000, responseEndMs: 91_000 }));
  assert.equal(learningDeadlineMs(t), 120_000);
  recordLearningReceipt(t, timingReceipt({ sessionId: 'session2', attempt: 2, state: 'SUCCEEDED', stepIndex: 3, requestStartMs: 120_000, responseEndMs: 120_001 }));
  assert.equal(t.failure?.code, 'STEP_LEARNING_TIMEOUT');
  assert.ok(learningTimingProblems(t, { ...timingExpected, sessionId: 'session2' }).includes('STEP_LEARNING_TIMEOUT'));
});

test('strict timing rejects negative, duplicate, backwards and crossed clock/run/revision/step evidence', () => {
  for (const change of [{ requestStartMs: -1 }, { responseEndMs: 999 }, { clockId: 'other' }, { runId: 'rg-other' }, { sourceRevision: '9' }, { stepIds: ['a', 'a', 'c'] }]) {
    const t = newLearningTiming('rg-20261027-1', 't', 'clock');
    recordLearningReceipt(t, timingReceipt());
    t.receipts.push(timingReceipt({ requestStartMs: 3000, responseEndMs: 4000, ...change }));
    assert.throws(() => parseLearningTiming(t), StatusShapeError);
  }
  const duplicate = newLearningTiming('rg-20261027-1', 't', 'clock');
  duplicate.receipts = [timingReceipt(), timingReceipt()];
  assert.throws(() => parseLearningTiming(duplicate), StatusShapeError);
});

test('watchdog persists terminal failure before cancellation; late success cannot clear it', async () => {
  const t = newLearningTiming('rg-20261027-1', 't', 'clock'), events: string[] = [];
  assert.equal(await expireLearningTiming(t, 120_000, () => events.push('persist'), async () => { events.push('cancel'); }), false);
  await expireLearningTiming(t, 120_001, () => { assert.equal(t.failure?.code, 'STEP_LEARNING_TIMEOUT');events.push('persist'); }, async () => { events.push('cancel'); });
  assert.deepEqual(events, ['persist', 'cancel']);
  recordLearningReceipt(t, timingReceipt({ stepIndex: 3, state: 'SUCCEEDED', requestStartMs: 120_002, responseEndMs: 120_003 }));
  assert.equal(t.failure?.atMs, 120_001);
});

// Formats are not validated (the uuid and date-time schemas carry their own pattern constraints).
const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
for (const name of readdirSync(V3).filter((n) => n.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(readFileSync(join(V3, name), 'utf8')) as object);
const validator = (file: string) => {
  const id = (JSON.parse(readFileSync(join(V3, file), 'utf8')) as { $id: string }).$id;
  const fn = ajv.getSchema(id);
  assert.ok(fn, `schema ${file} not loaded`);
  return fn;
};

const latestFixture = () => ({
  schemaVersion: 3,
  attempts: [{ testId: UUID, sessionId: 's-1', state: 'FAILED', startedAt: TS, errorCode: 'TARGET_MISMATCH', explanation: null }],
});
const sessionFixture = () => ({
  schemaVersion: 3,
  session: {
    schemaVersion: 3,
    sessionId: 's-1',
    testId: UUID,
    state: 'FAILED',
    expiresAt: TS,
    counters: { actions: 1, observations: 2, modelProposals: 3, modelInputTokens: 4000, modelOutputTokens: 500, sanitizedEvidenceBytes: 10 },
    progress: { stepCount: 2, activeStep: null },
  },
  result: null,
});
// The execution snapshot has no JSON schema; this fixture is built from ExecutionSnapshotDto.java.
const executionFixture = () => ({
  executionId: UUID,
  testId: UUID,
  testName: 'Release gate',
  csiId: '178672',
  revisionId: UUID,
  status: 'PASSED',
  errorCode: null,
  acceptedAt: TS,
  startedAt: TS,
  endedAt: TS,
  durationMs: 4200,
  stepResults: [{ stepIndex: 0,status:'PASS' }, { stepIndex: 1,status:'PASS' }],
  logs: [],
  logsTruncated: false,
  video: { status: 'AVAILABLE', error: null, expiresAt: null, partial: false },
  videoPath: '/x',
  runtime: {},
  revision: 3,
  streamComplete: true,
  triggerSource: 'AFTER_LEARN',
  scheduleId: null,
  scheduledAt: null,
  replayFailure: null,
});

test('the fixtures are valid against the v3 schemas', () => {
  const latest = validator('latest-attempts.schema.json');
  assert.equal(latest(latestFixture()), true, JSON.stringify(latest.errors));
  const session = validator('session-view.schema.json');
  assert.equal(session(sessionFixture()), true, JSON.stringify(session.errors));
});

test('valid fixtures parse', () => {
  assert.equal(parseLatestAttempts(latestFixture())[0]?.errorCode, 'TARGET_MISMATCH');
  assert.equal(parseSession(sessionFixture()).counters.modelProposals, 3);
  const exec = parseExecutionList({ data: [executionFixture()], page: 0, size: 20, totalElements: 1, totalPages: 1 });
  assert.equal(exec.data[0]?.videoStatus, 'AVAILABLE');
  assert.equal(exec.data[0]?.stepResults, 2);
});

function withoutField(source: unknown, path: string): unknown {
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  const parts = path.split('.');
  let cur: Record<string, unknown> | unknown[] = copy;
  for (const p of parts.slice(0, -1)) cur = (Array.isArray(cur) ? cur[Number(p)] : cur[p]) as Record<string, unknown>;
  delete (cur as Record<string, unknown>)[parts[parts.length - 1] as string];
  return copy;
}

test('every required field is required: removing one throws', () => {
  for (const path of ['schemaVersion', 'attempts.0.testId', 'attempts.0.sessionId', 'attempts.0.state', 'attempts.0.startedAt', 'attempts.0.errorCode', 'attempts.0.explanation']) {
    assert.throws(() => parseLatestAttempts(withoutField(latestFixture(), path)), StatusShapeError, path);
  }
  for (const path of ['session.sessionId', 'session.testId', 'session.state', 'session.counters', 'session.counters.actions', 'session.counters.modelProposals', 'session.counters.modelInputTokens', 'session.counters.modelOutputTokens', 'session.counters.observations']) {
    assert.throws(() => parseSession(withoutField(sessionFixture(), path)), StatusShapeError, path);
  }
  const listWithout = (field: string) => ({ data: [withoutField(executionFixture(), field)], totalElements: 1 });
  for (const field of ['executionId', 'testId', 'status', 'errorCode', 'acceptedAt', 'durationMs', 'triggerSource', 'video', 'replayFailure', 'stepResults']) {
    assert.throws(() => parseExecutionList(listWithout(field)), StatusShapeError, field);
  }
  assert.throws(() => parseExecutionList({ data: [] }), StatusShapeError);
});

test('wrong types and unknown enum values throw', () => {
  const bad = latestFixture();
  (bad.attempts[0] as { state: string }).state = 'SOMETHING_ELSE';
  assert.throws(() => parseLatestAttempts(bad), StatusShapeError);
  const nullTrigger = executionFixture() as unknown as Record<string, unknown>;
  nullTrigger.triggerSource = null;
  assert.throws(() => parseExecutionList({ data: [nullTrigger], totalElements: 1 }), StatusShapeError);
});

const ledgerRow = (over: Record<string, unknown> = {}) => ({ step_id: UUID, ordinal: 0, attempt_ordinal: 0, state: 'SUCCEEDED', dispatched: 1, outcome: 'OK', ...over });

test('ledger rows: dispatch is consistent with state, and no operation kind is read', () => {
  const rows = parseLedgerRows([ledgerRow(), ledgerRow({ ordinal: 1 }), ledgerRow({ state: 'REVOKED', dispatched: 0, outcome: null })]);
  assert.equal(rows[2]?.dispatched, 0);
  assert.equal('kind' in (rows[0] as object), false);
  assert.throws(() => parseLedgerRows([ledgerRow({ state: 'ADMITTED', dispatched: 1 })]), StatusShapeError);
  assert.throws(() => parseLedgerRows([ledgerRow({ state: 'SUCCEEDED', dispatched: 0 })]), StatusShapeError);
  assert.throws(() => parseLedgerRows([ledgerRow({ state: 'WHATEVER' })]), StatusShapeError);
  for (const field of ['step_id', 'ordinal', 'attempt_ordinal', 'state', 'dispatched', 'outcome']) {
    assert.throws(() => parseLedgerRows([withoutField(ledgerRow(), field)]), StatusShapeError, field);
  }
});

const HASH = 'a'.repeat(64);
const receipt = (over: Record<string, unknown> = {}) => ({ closedCode: null, stepHash: HASH, fenceCrossed: true, effects: [{ method: 'goto', completed: true }], effectsTruncated: false, offscreen: false, ...over });

test('the receipt parser accepts exactly the step-receipt schema shape', () => {
  assert.deepEqual(parseStepReceipt(receipt()).effects, [{ method: 'goto', completed: true }]);
  assert.equal(parseStepReceipt(receipt({ closedCode: 'OUTCOME_UNKNOWN', effects: [{ method: 'selectOption', completed: false }] })).closedCode, 'OUTCOME_UNKNOWN');
  assert.equal(parseStepReceipt(receipt({ fenceCrossed: false, effects: [] })).fenceCrossed, false);
  assert.equal(parseStepReceipt(receipt({ effects: Array.from({ length: 64 }, () => ({ method: 'click', completed: true })) })).effects.length, 64);
  const bad: [string, Record<string, unknown>][] = [
    ['a closedCode outside the enum', { closedCode: 'TARGET_MISMATCH' }],
    ['a stepHash that is not hex64', { stepHash: 'A'.repeat(64) }],
    ['a short stepHash', { stepHash: 'abc' }],
    ['more than 64 effects', { effects: Array.from({ length: 65 }, () => ({ method: 'click', completed: true })) }],
    ['an effect without a boolean completed', { effects: [{ method: 'goto', completed: 'yes' }] }],
    ['an effect without completed', { effects: [{ method: 'goto' }] }],
    ['an effect with an extra field', { effects: [{ method: 'goto', completed: true, offscreen: true }] }],
    ['an effect method over 64 characters', { effects: [{ method: 'x'.repeat(65), completed: true }] }],
    ['an empty effect method', { effects: [{ method: '', completed: true }] }],
    ['fenceCrossed false with effects', { fenceCrossed: false }],
    ['a non-boolean fenceCrossed', { fenceCrossed: 1 }],
    ['an extra field', { extra: 1 }],
  ];
  for (const [label, over] of bad) assert.throws(() => parseStepReceipt(receipt(over)), StatusShapeError, label);
  for (const field of ['closedCode', 'stepHash', 'fenceCrossed', 'effects', 'effectsTruncated', 'offscreen']) assert.throws(() => parseStepReceipt(withoutField(receipt(), field)), StatusShapeError, field);
  assert.throws(() => parseStepReceipt(null), StatusShapeError);
  assert.throws(() => parseStepReceipt([]), StatusShapeError);
});

test('the parser closed-code list equals the repo schema enum (drift test)', () => {
  const schema = JSON.parse(readFileSync(join(V3, 'step-receipt.schema.json'), 'utf8')) as { properties: { closedCode: { oneOf: { enum?: string[] }[] } } };
  const fromSchema = schema.properties.closedCode.oneOf.flatMap((branch) => branch.enum ?? []);
  assert.deepEqual([...STEP_RECEIPT_CLOSED_CODES], fromSchema);
  const validate = validator('step-receipt.schema.json');
  for (const sample of [receipt(), receipt({ closedCode: 'TIMEOUT' }), receipt({ closedCode: 'TARGET_MISMATCH' }), receipt({ effects: [{ method: 'goto' }] }), withoutField(receipt(), 'offscreen')]) {
    let parsed = true;
    try { parseStepReceipt(sample); } catch { parsed = false; }
    assert.equal(parsed, validate(sample), JSON.stringify(sample));
  }
});

test('learning receipt entries: one per ledger row, a null receipt only for an undispatched row shape', () => {
  const rows = parseAttemptReceipts([
    { step_id: 'step-0', ordinal: 0, attempt_ordinal: 0, dispatch_count: 1, receipt: receipt() },
    { step_id: 'step-1', ordinal: 0, attempt_ordinal: 0, dispatch_count: 0, receipt: null },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.receipt?.effects[0]?.method, 'goto');
  assert.equal(rows[1]?.receipt, null);
  assert.deepEqual(rows.map((r) => [r.stepId, r.ordinal, r.attemptOrdinal]), [['step-0', 0, 0], ['step-1', 0, 0]]);
  assert.throws(() => parseAttemptReceipts([{ ordinal: 0, attempt_ordinal: 0, dispatch_count: 1, receipt: null }]), StatusShapeError, 'step_id is required');
  assert.throws(() => parseAttemptReceipts([{ step_id: 'step-0', ordinal: 0, attempt_ordinal: 0, dispatch_count: 2, receipt: null }]), StatusShapeError);
  assert.throws(() => parseAttemptReceipts([{ step_id: 'step-0', ordinal: 0, attempt_ordinal: 0, dispatch_count: 1, receipt: receipt({ stepHash: 'x' }) }]), StatusShapeError);
  assert.throws(() => parseAttemptReceipts([{ step_id: 'step-0', ordinal: 0, attempt_ordinal: 0, dispatch_count: 1 }]), StatusShapeError);
});

test('learningReceipts reads through psql and returns null, never an empty list, when the source is unreadable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-psql-'));
  try {
    const script = (name: string, body: string): string => {
      const path = join(dir, name);
      writeFileSync(path, `#!/bin/sh\n${body}\n`);
      chmodSync(path, 0o755);
      return path;
    };
    const line = JSON.stringify({ step_id: 'step-0', ordinal: 0, attempt_ordinal: 0, dispatch_count: 1, receipt: receipt() });
    const ok = learningReceipts({ psql: script('ok', `echo '${line}'`), port: '1' }, UUID);
    assert.equal(ok?.length, 1);
    assert.equal(learningReceipts({ psql: script('nocolumn', 'echo "ERROR: column \\"receipt\\" does not exist" >&2; exit 1'), port: '1' }, UUID), null);
    assert.equal(learningReceipts({ psql: script('garbage', 'echo not-json'), port: '1' }, UUID), null);
    assert.equal(learningReceipts({ psql: script('badreceipt', `echo '${JSON.stringify({ step_id: 'step-0', ordinal: 0, attempt_ordinal: 0, dispatch_count: 1, receipt: receipt({ closedCode: 'NOPE' }) })}'`), port: '1' }, UUID), null);
    assert.deepEqual(learningReceipts({ psql: script('empty', 'true'), port: '1' }, UUID), [], 'a session without ledger rows is an empty list, an unreadable source is null');
    assert.throws(() => learningReceipts({ psql: '/bin/true', port: '1' }, "x'; drop table y"), StatusShapeError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sessionStepIds reads the authored step order and refuses duplicates or an empty list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-steps-'));
  try {
    const say = (name: string, body: unknown): { psql: string; port: string } => {
      const path = join(dir, name);
      writeFileSync(path, `#!/bin/sh\necho '${JSON.stringify(body)}'\n`);
      chmodSync(path, 0o755);
      return { psql: path, port: '1' };
    };
    assert.deepEqual(sessionStepIds(say('ok', { step_ids: ['a', 'b'] }), UUID), ['a', 'b']);
    assert.throws(() => sessionStepIds(say('dup', { step_ids: ['a', 'a'] }), UUID), StatusShapeError);
    assert.throws(() => sessionStepIds(say('empty', { step_ids: [] }), UUID), StatusShapeError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('head pointers and proof receipt rows are strict', () => {
  assert.deepEqual(parseHeadPointers([{ candidate: UUID, confirmed: null }]), { candidate: UUID, confirmed: null });
  assert.throws(() => parseHeadPointers([]), StatusShapeError);
  assert.throws(() => parseHeadPointers([{ candidate: null, confirmed: null }, { candidate: null, confirmed: null }]), StatusShapeError);
  assert.throws(() => parseHeadPointers([{ candidate: null }]), StatusShapeError);
  const proofRow = { revision_id: UUID, step_ordinal: 0, proof_execution_id: UUID, status: 'PASSED', step_hash: HASH, receipt: receipt({ fenceCrossed: false, effects: [] }) };
  assert.equal(parseStepReceiptRows([proofRow])[0]?.status, 'PASSED');
  assert.equal(parseStepReceiptRows([{ ...proofRow, status: 'NOT_RUN', step_hash: null, receipt: null }])[0]?.receipt, null);
  assert.throws(() => parseStepReceiptRows([{ ...proofRow, status: 'DONE' }]), StatusShapeError);
  assert.throws(() => parseStepReceiptRows([withoutField(proofRow, 'receipt')]), StatusShapeError);
  assert.throws(() => parseStepReceiptRows([{ ...proofRow, receipt: receipt({ stepHash: 'x' }) }]), StatusShapeError);
});

test('attempt rows are strict', () => {
  const row = { kind: 'STEP_CODE', attempt_number: 1, status: 'REJECTED', rejection_reason: 'INVALID_CONTRACT', rejection_gate: 'STEP_SYNTAX', input_tokens: null, output_tokens: null, created_at: TS, updated_at: TS };
  assert.equal(parseAttemptRows([row])[0]?.rejectionReason, 'INVALID_CONTRACT');
  assert.equal(parseAttemptRows([row])[0]?.rejectionGate, 'STEP_SYNTAX');
  assert.throws(() => parseAttemptRows([withoutField(row, 'rejection_gate')]), StatusShapeError);
  assert.throws(() => parseAttemptRows([{ ...row, status: 'DONE' }]), StatusShapeError);
  assert.throws(() => parseAttemptRows([withoutField(row, 'rejection_reason')]), StatusShapeError);
});
