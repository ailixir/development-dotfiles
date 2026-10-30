import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import Ajv from 'ajv';
import { GATE_DIR } from './common.ts';
import {
  OPERATION_KINDS,
  StatusShapeError,
  operationKindsFromSchema,
  parseAttemptRows,
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

const ledgerRow = (over: Record<string, unknown> = {}) => ({ step_id: UUID, ordinal: 0, attempt_ordinal: 0, kind: 'click', value_kind: null, state: 'SUCCEEDED', dispatched: 1, outcome: 'OK', ...over });

test('the operation kinds are derived from the action schema', () => {
  const kinds = operationKindsFromSchema(JSON.parse(readFileSync(join(V3, 'action.schema.json'), 'utf8')));
  for (const k of ['click', 'check', 'uncheck', 'hover', 'fill', 'press', 'selectOption', 'navigate']) assert.ok(kinds.has(k), k);
  assert.ok(!kinds.has('secretRef') && !kinds.has('authoredLiteral'), 'value kinds are not operation kinds');
  assert.ok(OPERATION_KINDS.has('click') && OPERATION_KINDS.has('selectOption'));
});

test('ledger rows: kind is validated against the closed set and dispatch is consistent with state', () => {
  const rows = parseLedgerRows([ledgerRow(), ledgerRow({ kind: 'fill', value_kind: 'secretRef', ordinal: 1 }), ledgerRow({ kind: 'selectOption', state: 'REVOKED', dispatched: 0, outcome: null })]);
  assert.equal(rows[1]?.valueKind, 'secretRef');
  assert.equal(rows[2]?.dispatched, 0);
  for (const kind of ['Click', 'tap', 'CLICK', 'select', 'secretRef']) assert.throws(() => parseLedgerRows([ledgerRow({ kind })]), StatusShapeError, kind);
  assert.throws(() => parseLedgerRows([ledgerRow({ kind: null })]), StatusShapeError);
  assert.throws(() => parseLedgerRows([ledgerRow({ state: 'ADMITTED', dispatched: 1 })]), StatusShapeError);
  assert.throws(() => parseLedgerRows([ledgerRow({ state: 'SUCCEEDED', dispatched: 0 })]), StatusShapeError);
  assert.throws(() => parseLedgerRows([ledgerRow({ state: 'WHATEVER' })]), StatusShapeError);
  for (const field of ['step_id', 'ordinal', 'attempt_ordinal', 'value_kind', 'state', 'dispatched', 'outcome']) {
    assert.throws(() => parseLedgerRows([withoutField(ledgerRow(), field)]), StatusShapeError, field);
  }
});

test('attempt rows are strict', () => {
  const row = { kind: 'NEXT_ACTION', attempt_number: 1, status: 'REJECTED', rejection_reason: 'INVALID_CONTRACT', rejection_gate: 'NEXT_TARGET_INTENT', intent_path: null, input_tokens: null, output_tokens: null, created_at: TS, updated_at: TS };
  assert.equal(parseAttemptRows([row])[0]?.rejectionReason, 'INVALID_CONTRACT');
  assert.equal(parseAttemptRows([row])[0]?.rejectionGate, 'NEXT_TARGET_INTENT');
  assert.throws(() => parseAttemptRows([withoutField(row, 'rejection_gate')]), StatusShapeError);
  assert.throws(() => parseAttemptRows([withoutField(row, 'intent_path')]), StatusShapeError);
  assert.throws(() => parseAttemptRows([{ ...row, status: 'DONE' }]), StatusShapeError);
  assert.throws(() => parseAttemptRows([withoutField(row, 'rejection_reason')]), StatusShapeError);
});
