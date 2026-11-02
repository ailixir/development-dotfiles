/**
 * Strict readers of everything a gate verdict depends on: the public Studio API, the action ledger and
 * the model-attempt rows. Every reader THROWS StatusShapeError on a missing field, a wrong type or an
 * unknown enum value. There are no optional-chaining defaults on a field a verdict reads: a missing
 * field must make the run INVALID, never pass silently.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { APIRequestContext } from '@playwright/test';

export class StatusShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatusShapeError';
  }
}

export const STEP_LEARNING_LIMIT_MS = 120_000;

/** Query brackets on one monotonic clock, never backend completion timestamps. */
export interface LearningProgress {
  sessionId: string;
  testId: string;
  sourceRevision: string;
  configurationRevision: string;
  stepIds: string[];
  stepIndex: number;
  state: string;
}
export interface LearningReceipt extends LearningProgress {
  runId: string;
  clockId: string;
  attempt: number;
  requestStartMs: number;
  responseEndMs: number;
}
export interface LearningTiming {
  schemaVersion: 1;
  method: 'CONSERVATIVE_MONOTONIC';
  runId: string;
  testId: string;
  clockId: string;
  ceilingMs: 120000;
  receipts: LearningReceipt[];
  failure: { code: 'STEP_LEARNING_TIMEOUT' | 'TIMING_EVIDENCE_INVALID'; atMs: number } | null;
}
export interface LearningInterval {
  stepId: string;
  ordinal: number;
  startLowerMs: number;
  completionUpperMs: number | null;
  elapsedUpperMs: number | null;
}

export function newLearningTiming(runId: string, testId: string, clockId: string): LearningTiming {
  return { schemaVersion: 1, method: 'CONSERVATIVE_MONOTONIC', runId, testId, clockId, ceilingMs: STEP_LEARNING_LIMIT_MS, receipts: [], failure: null };
}

export function parseLearningProgress(raw: unknown): LearningProgress {
  const stepIds = arr(raw, 'stepIds');
  if (stepIds.length === 0 || !stepIds.every((id) => typeof id === 'string' && id !== '') || new Set(stepIds).size !== stepIds.length) throw new StatusShapeError('invalid learning step identities');
  const stepIndex = int(raw, 'stepIndex');
  if (stepIndex < 0 || stepIndex > stepIds.length) throw new StatusShapeError('invalid learning step index');
  return { sessionId: str(raw, 'sessionId'), testId: str(raw, 'testId'), sourceRevision: str(raw, 'sourceRevision'), configurationRevision: str(raw, 'configurationRevision'), stepIds: stepIds as string[], stepIndex, state: str(raw, 'state') };
}

/** Rebuild bounds from raw receipts. Retry sessions retain the earliest activation of each step. */
export function learningIntervals(timing: LearningTiming): LearningInterval[] {
  let starts: (number | null)[] = [], completed: (number | null)[] = [];
  let previous: LearningReceipt | undefined;
  const seenSessions = new Set<string>();
  for (const receipt of timing.receipts) {
    const first = timing.receipts[0];
    if (first === undefined) break;
    parseLearningProgress(receipt);
    if (receipt.runId !== timing.runId || receipt.clockId !== timing.clockId || receipt.testId !== timing.testId || receipt.sourceRevision !== first.sourceRevision || receipt.configurationRevision !== first.configurationRevision || JSON.stringify(receipt.stepIds) !== JSON.stringify(first.stepIds)) throw new StatusShapeError('crossed learning identity');
    if (!Number.isInteger(receipt.attempt) || receipt.attempt < 1 || !Number.isFinite(receipt.requestStartMs) || !Number.isFinite(receipt.responseEndMs) || receipt.requestStartMs < 0 || receipt.responseEndMs < receipt.requestStartMs || (previous !== undefined && (receipt.requestStartMs < previous.responseEndMs || receipt.requestStartMs <= previous.requestStartMs))) throw new StatusShapeError('invalid monotonic learning receipt');
    const sameSession = previous?.sessionId === receipt.sessionId;
    if (sameSession && (receipt.attempt !== previous?.attempt || receipt.stepIndex < previous.stepIndex)) throw new StatusShapeError('learning progress moved backwards');
    if (!sameSession) {
      if (seenSessions.has(receipt.sessionId) || (previous !== undefined && receipt.attempt <= previous.attempt)) throw new StatusShapeError('duplicate or crossed learning session');
      seenSessions.add(receipt.sessionId);
      completed = receipt.stepIds.map(() => null);
    }
    if (starts.length === 0) starts = receipt.stepIds.map((_, i) => i === 0 ? 0 : null);
    // A query's REQUEST start predates its snapshot. Its response end cannot be a start bound.
    const lower = sameSession && previous !== undefined ? previous.requestStartMs : 0;
    for (let i = 0; i <= Math.min(receipt.stepIndex, receipt.stepIds.length - 1); i += 1) {
      if (starts[i] === null) starts[i] = lower;
    }
    for (let i = 0; i < receipt.stepIndex; i += 1) if (completed[i] === null) completed[i] = receipt.responseEndMs;
    previous = receipt;
  }
  return (timing.receipts[0]?.stepIds ?? []).map((stepId, ordinal) => ({ stepId, ordinal, startLowerMs: starts[ordinal] ?? 0, completionUpperMs: completed[ordinal] ?? null, elapsedUpperMs: completed[ordinal] === null || completed[ordinal] === undefined ? null : completed[ordinal] - (starts[ordinal] ?? 0) }));
}

export function learningDeadlineMs(timing: LearningTiming): number | null {
  const last = timing.receipts.at(-1);
  if (last === undefined) return STEP_LEARNING_LIMIT_MS;
  if (last.stepIndex === last.stepIds.length) return null;
  return (learningIntervals(timing)[last.stepIndex]?.startLowerMs ?? 0) + STEP_LEARNING_LIMIT_MS;
}

/** Irrevocable; callers persist this result BEFORE sending best-effort cancellation. */
export function recordLearningReceipt(timing: LearningTiming, receipt: LearningReceipt): void {
  timing.receipts.push(receipt);
  try {
    const intervals = learningIntervals(timing);
    if (intervals.some((step) => step.elapsedUpperMs !== null && step.elapsedUpperMs > STEP_LEARNING_LIMIT_MS) || (learningDeadlineMs(timing) ?? Infinity) < receipt.responseEndMs) timing.failure ??= { code: 'STEP_LEARNING_TIMEOUT', atMs: receipt.responseEndMs };
  } catch {
    timing.failure ??= { code: 'TIMING_EVIDENCE_INVALID', atMs: receipt.responseEndMs };
  }
}

export async function expireLearningTiming(timing: LearningTiming, nowMs: number, persist: () => void, cancel: () => Promise<void>): Promise<boolean> {
  const deadline = learningDeadlineMs(timing);
  if (timing.failure === null && (deadline === null || nowMs <= deadline)) return false;
  timing.failure ??= { code: 'STEP_LEARNING_TIMEOUT', atMs: nowMs };
  persist();
  await cancel();
  return true;
}

/** Strict current evidence boundary; absent evidence stays absent, never defaulted to zero. */
export function parseLearningTiming(raw: unknown): LearningTiming {
  if (int(raw, 'schemaVersion') !== 1 || str(raw, 'method') !== 'CONSERVATIVE_MONOTONIC' || int(raw, 'ceilingMs') !== STEP_LEARNING_LIMIT_MS) throw new StatusShapeError('invalid learning timing policy');
  const timing = newLearningTiming(str(raw, 'runId'), str(raw, 'testId'), str(raw, 'clockId'));
  timing.receipts = arr(raw, 'receipts').map((entry) => {
    const start = at(entry, 'requestStartMs'), end = at(entry, 'responseEndMs');
    if (typeof start !== 'number' || typeof end !== 'number') throw new StatusShapeError('invalid learning receipt bracket');
    return { ...parseLearningProgress(entry), runId: str(entry, 'runId'), clockId: str(entry, 'clockId'), attempt: int(entry, 'attempt'), requestStartMs: start, responseEndMs: end };
  });
  const failure = at(raw, 'failure');
  if (failure !== null) {
    const atMs = at(failure, 'atMs');
    if (typeof atMs !== 'number' || !Number.isFinite(atMs) || atMs < 0) throw new StatusShapeError('invalid learning failure time');
    timing.failure = { code: oneOf(failure, 'code', ['STEP_LEARNING_TIMEOUT', 'TIMING_EVIDENCE_INVALID'] as const), atMs };
  }
  learningIntervals(timing);
  return timing;
}

export function learningTimingProblems(timing: LearningTiming | undefined, expected: { runId?: string; testId: string | null; sourceRevision: number; configurationRevision: number; stepIds: string[]; sessionId: string | null }): string[] {
  if (timing === undefined) return ['UNKNOWN per-step learning timing coverage'];
  try {
    parseLearningTiming(timing);
    const last = timing.receipts.at(-1), intervals = learningIntervals(timing);
    const reasons: string[] = [];
    if (timing.failure !== null) reasons.push(timing.failure.code);
    if ((expected.runId !== undefined && timing.runId !== expected.runId) || timing.testId !== expected.testId || last?.sessionId !== expected.sessionId || last?.sourceRevision !== String(expected.sourceRevision) || last.configurationRevision !== String(expected.configurationRevision) || JSON.stringify(last.stepIds) !== JSON.stringify(expected.stepIds)) reasons.push('UNKNOWN crossed per-step learning identity');
    if (last?.state !== 'SUCCEEDED' || last.stepIndex !== expected.stepIds.length || intervals.length !== expected.stepIds.length || intervals.some((step) => step.completionUpperMs === null)) reasons.push('UNKNOWN incomplete per-step learning coverage');
    if (intervals.some((step) => step.elapsedUpperMs !== null && step.elapsedUpperMs > STEP_LEARNING_LIMIT_MS)) reasons.push('STEP_LEARNING_TIMEOUT: conservative upper bound exceeds120000ms');
    // Recheck every prefix, so removing a stored failure cannot hide an earlier overrun.
    const prefix = newLearningTiming(timing.runId, timing.testId, timing.clockId);
    for (const receipt of timing.receipts) recordLearningReceipt(prefix, receipt);
    if (prefix.failure !== null && timing.failure === null) reasons.push(prefix.failure.code);
    return reasons;
  } catch {
    return ['UNKNOWN invalid per-step learning timing'];
  }
}

function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur) || !(part in (cur as Record<string, unknown>))) {
      throw new StatusShapeError(`missing field ${path}`);
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function str(obj: unknown, path: string): string {
  const v = at(obj, path);
  if (typeof v !== 'string' || v === '') throw new StatusShapeError(`${path} must be a non-empty string`);
  return v;
}

function strOrNull(obj: unknown, path: string): string | null {
  const v = at(obj, path);
  if (v === null) return null;
  if (typeof v !== 'string') throw new StatusShapeError(`${path} must be a string or null`);
  return v;
}

function int(obj: unknown, path: string): number {
  const v = at(obj, path);
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new StatusShapeError(`${path} must be an integer`);
  return v;
}

function intOrNull(obj: unknown, path: string): number | null {
  const v = at(obj, path);
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new StatusShapeError(`${path} must be an integer or null`);
  return v;
}

function arr(obj: unknown, path: string): unknown[] {
  const v = at(obj, path);
  if (!Array.isArray(v)) throw new StatusShapeError(`${path} must be an array`);
  return v;
}

function oneOf<T extends string>(obj: unknown, path: string, allowed: readonly T[]): T {
  const v = str(obj, path);
  if (!(allowed as readonly string[]).includes(v)) throw new StatusShapeError(`${path} has unknown value ${v}`);
  return v as T;
}

// ---- GET /api/v1/studio/guided-sessions/latest ----------------------------------------------

export const LATEST_STATES = ['SUCCEEDED', 'PUBLICATION_CONFLICT', 'FAILED', 'UNKNOWN_OUTCOME', 'CANCELLED', 'EXPIRED'] as const;

export interface LatestAttempt {
  testId: string;
  sessionId: string;
  state: (typeof LATEST_STATES)[number];
  startedAt: string;
  errorCode: string | null;
}

export function parseLatestAttempts(json: unknown): LatestAttempt[] {
  if (int(json, 'schemaVersion') !== 3) throw new StatusShapeError('latest-attempts schemaVersion must be 3');
  return arr(json, 'attempts').map((a) => {
    at(a, 'explanation');
    return {
      testId: str(a, 'testId'),
      sessionId: str(a, 'sessionId'),
      state: oneOf(a, 'state', LATEST_STATES),
      startedAt: str(a, 'startedAt'),
      errorCode: strOrNull(a, 'errorCode'),
    };
  });
}

// ---- GET /api/v1/studio/guided-sessions/{id} -------------------------------------------------

export interface SessionView {
  sessionId: string;
  testId: string;
  state: string;
  counters: { actions: number; observations: number; modelProposals: number; modelInputTokens: number; modelOutputTokens: number };
}

export function parseSession(json: unknown): SessionView {
  return {
    sessionId: str(json, 'session.sessionId'),
    testId: str(json, 'session.testId'),
    state: str(json, 'session.state'),
    counters: {
      actions: int(json, 'session.counters.actions'),
      observations: int(json, 'session.counters.observations'),
      modelProposals: int(json, 'session.counters.modelProposals'),
      modelInputTokens: int(json, 'session.counters.modelInputTokens'),
      modelOutputTokens: int(json, 'session.counters.modelOutputTokens'),
    },
  };
}

// ---- GET /api/v1/studio/executions -----------------------------------------------------------

export interface ExecutionSnap {
  revisionId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  passedStepIndices: number[];
  executionId: string;
  testId: string;
  status: string;
  errorCode: string | null;
  acceptedAt: string;
  durationMs: number | null;
  triggerSource: string;
  /** 'NONE' only when the snapshot carries `video: null`. */
  videoStatus: string;
  replayFailureCode: string | null;
  stepResults: number;
}

export function parseExecution(json: unknown): ExecutionSnap {
  const video = at(json, 'video');
  const replayFailure = at(json, 'replayFailure');
  return {
    revisionId: strOrNull(json, 'revisionId'),
    startedAt: strOrNull(json, 'startedAt'),
    endedAt: strOrNull(json, 'endedAt'),
    passedStepIndices: arr(json, 'stepResults').filter((r) => str(r,'status') === 'PASS').map((r) => int(r,'stepIndex')),
    executionId: str(json, 'executionId'),
    testId: str(json, 'testId'),
    status: str(json, 'status'),
    errorCode: strOrNull(json, 'errorCode'),
    acceptedAt: str(json, 'acceptedAt'),
    durationMs: intOrNull(json, 'durationMs'),
    triggerSource: str(json, 'triggerSource'),
    videoStatus: video === null ? 'NONE' : str(json, 'video.status'),
    replayFailureCode: replayFailure === null ? null : str(json, 'replayFailure.code'),
    stepResults: arr(json, 'stepResults').length,
  };
}

export function parseExecutionList(json: unknown): { data: ExecutionSnap[]; totalElements: number } {
  return { data: arr(json, 'data').map(parseExecution), totalElements: int(json, 'totalElements') };
}

export const TERMINAL_EXECUTION = /^(PASSED|FAILED|ERROR|CANCELLED|STALE)$/;

// ---- action ledger (psql) --------------------------------------------------------------------

export const LEDGER_STATES = ['ADMITTED', 'REVOKED', 'DISPATCHING', 'SUCCEEDED', 'FAILED', 'UNKNOWN_OUTCOME'] as const;

export interface LedgerRow {
  stepId: string;
  ordinal: number;
  attemptOrdinal: number;
  state: (typeof LEDGER_STATES)[number];
  /** document.dispatchCount: 1 exactly for DISPATCHING, SUCCEEDED, FAILED and UNKNOWN_OUTCOME. */
  dispatched: 0 | 1;
  outcome: string | null;
}

export function parseLedgerRows(rows: unknown[]): LedgerRow[] {
  return rows.map((r) => {
    const state = oneOf(r, 'state', LEDGER_STATES);
    const dispatched = int(r, 'dispatched');
    if (dispatched !== 0 && dispatched !== 1) throw new StatusShapeError('ledger dispatched must be 0 or 1');
    const shouldDispatch = state !== 'ADMITTED' && state !== 'REVOKED';
    if ((dispatched === 1) !== shouldDispatch) throw new StatusShapeError(`ledger state ${state} contradicts dispatchCount ${dispatched}`);
    return {
      stepId: str(r, 'step_id'),
      ordinal: int(r, 'ordinal'),
      attemptOrdinal: int(r, 'attempt_ordinal'),
      state,
      dispatched,
      outcome: strOrNull(r, 'outcome'),
    };
  });
}

// ---- step receipts (psql) ----------------------------------------------------------------------

/** Mirrors contracts/v3/step-receipt.schema.json; status.test.ts compares this list with the schema enum. */
export const STEP_RECEIPT_CLOSED_CODES = [
  'INVALID_CONTRACT',
  'PROFILE_MISMATCH',
  'AUTHORIZATION_EXPIRED',
  'POLICY_REFUSED',
  'TARGET_DRIFT',
  'READ_REFUSED',
  'REFERENCE_REFUSED',
  'ASSERTION_FAILED',
  'CANCELLED',
  'TIMEOUT',
  'OUTCOME_UNKNOWN',
  'INTERNAL_ERROR',
  'LOGIN_REQUIRED',
  'PASSWORD_CONTROL_READ_REFUSED',
  'REFERENCE_MISMATCH',
  'NAVIGATION_HTTP_ERROR',
] as const;

/** One effectful Playwright call of a step: the bare method name (for example goto) and whether it returned. */
export interface StepEffect {
  method: string;
  completed: boolean;
}

export interface StepReceipt {
  closedCode: (typeof STEP_RECEIPT_CLOSED_CODES)[number] | null;
  stepHash: string;
  fenceCrossed: boolean;
  effects: StepEffect[];
  effectsTruncated: boolean;
  offscreen: boolean;
}

function bool(obj: unknown, path: string): boolean {
  const v = at(obj, path);
  if (typeof v !== 'boolean') throw new StatusShapeError(`${path} must be a boolean`);
  return v;
}

function closedKeys(obj: unknown, keys: readonly string[], where: string): void {
  for (const key of keys) at(obj, key);
  const extra = Object.keys(obj as Record<string, unknown>).filter((key) => !keys.includes(key));
  if (extra.length > 0) throw new StatusShapeError(`${where} has unexpected field ${extra[0] ?? ''}`);
}

/** Strict: exactly the step-receipt schema, plus the schema-implied rule that an effect needs a crossed fence. */
export function parseStepReceipt(raw: unknown): StepReceipt {
  closedKeys(raw, ['closedCode', 'stepHash', 'fenceCrossed', 'effects', 'effectsTruncated', 'offscreen'], 'step receipt');
  const closedCode = at(raw, 'closedCode') === null ? null : oneOf(raw, 'closedCode', STEP_RECEIPT_CLOSED_CODES);
  const stepHash = str(raw, 'stepHash');
  if (!/^[a-f0-9]{64}$/.test(stepHash)) throw new StatusShapeError('stepHash must be 64 lowercase hex characters');
  const fenceCrossed = bool(raw, 'fenceCrossed');
  const list = arr(raw, 'effects');
  if (list.length > 64) throw new StatusShapeError('effects holds more than 64 entries');
  const effects = list.map((entry) => {
    closedKeys(entry, ['method', 'completed'], 'effect');
    const method = str(entry, 'method');
    if (method.length > 64) throw new StatusShapeError('effect method is longer than 64 characters');
    return { method, completed: bool(entry, 'completed') };
  });
  if (!fenceCrossed && effects.length > 0) throw new StatusShapeError('effects listed although the fence was not crossed');
  return { closedCode, stepHash, fenceCrossed, effects, effectsTruncated: bool(raw, 'effectsTruncated'), offscreen: bool(raw, 'offscreen') };
}

/** The learning receipt of one ledger row (studio_guided_actions.receipt, written with the outcome). */
export interface AttemptReceipt {
  /** SC008 writes ordinal 0 and attempt_ordinal 0 for every step; steps differ only by step_id. */
  stepId: string;
  ordinal: number;
  attemptOrdinal: number;
  dispatchCount: 0 | 1;
  receipt: StepReceipt | null;
}

export function parseAttemptReceipts(rows: unknown[]): AttemptReceipt[] {
  return rows.map((r) => {
    const dispatchCount = int(r, 'dispatch_count');
    if (dispatchCount !== 0 && dispatchCount !== 1) throw new StatusShapeError('dispatch_count must be 0 or 1');
    return { stepId: str(r, 'step_id'), ordinal: int(r, 'ordinal'), attemptOrdinal: int(r, 'attempt_ordinal'), dispatchCount, receipt: at(r, 'receipt') === null ? null : parseStepReceipt(at(r, 'receipt')) };
  });
}

/** One entry per ledger row of the session. null (never an empty list) when the source is absent or unreadable. */
export function learningReceipts(cfg: PsqlConfig, sessionId: string): AttemptReceipt[] | null {
  const id = safeId(sessionId);
  try {
    return parseAttemptReceipts(
      psqlJson(
        cfg,
        `select row_to_json(t) from (select step_id, ordinal, attempt_ordinal, (document->>'dispatchCount')::int as dispatch_count, receipt ` +
          `from studio_guided_actions where session_id='${id}' order by ordinal, attempt_ordinal) t`,
      ),
    );
  } catch {
    return null;
  }
}

/** The authored step ids of a session in order (document.sourceSteps); a step's index is its position here. */
export function sessionStepIds(cfg: PsqlConfig, sessionId: string): string[] {
  const rows = psqlJson(cfg, `select row_to_json(t) from (select array(select step->>'stepId' from jsonb_array_elements(document->'sourceSteps') step) as step_ids from studio_guided_sessions where session_id='${safeId(sessionId)}') t`, 10_000);
  if (rows.length !== 1) throw new StatusShapeError(`expected exactly one session row, found ${rows.length}`);
  const ids = arr(rows[0], 'step_ids');
  if (ids.length === 0 || !ids.every((id) => typeof id === 'string' && id !== '') || new Set(ids).size !== ids.length) throw new StatusShapeError('invalid session step ids');
  return ids as string[];
}

// ---- lifecycle: head pointers and proof receipts (psql) -----------------------------------------

/** ui_tests.candidate_revision_id (recorded, awaiting its proof) and confirmed_revision_id (proven). */
export interface HeadPointers {
  candidate: string | null;
  confirmed: string | null;
}

export function parseHeadPointers(rows: unknown[]): HeadPointers {
  if (rows.length !== 1) throw new StatusShapeError(`expected exactly one ui_tests row, found ${rows.length}`);
  return { candidate: strOrNull(rows[0], 'candidate'), confirmed: strOrNull(rows[0], 'confirmed') };
}

export function readHeadPointers(cfg: PsqlConfig, testId: string): HeadPointers {
  return parseHeadPointers(psqlJson(cfg, `select row_to_json(t) from (select candidate_revision_id::text as candidate, confirmed_revision_id::text as confirmed from ui_tests where id='${safeId(testId)}'::uuid) t`, 10_000));
}

export const PROOF_ROW_STATUSES = ['PASSED', 'FAILED', 'NOT_RUN'] as const;

/** One studio_step_receipts row: the proof's verdict on one step of a revision. */
export interface StepReceiptRow {
  revisionId: string;
  stepOrdinal: number;
  proofExecutionId: string;
  status: (typeof PROOF_ROW_STATUSES)[number];
  stepHash: string | null;
  receipt: StepReceipt | null;
}

export function parseStepReceiptRows(rows: unknown[]): StepReceiptRow[] {
  return rows.map((r) => ({
    revisionId: str(r, 'revision_id'),
    stepOrdinal: int(r, 'step_ordinal'),
    proofExecutionId: str(r, 'proof_execution_id'),
    status: oneOf(r, 'status', PROOF_ROW_STATUSES),
    stepHash: strOrNull(r, 'step_hash'),
    receipt: at(r, 'receipt') === null ? null : parseStepReceipt(at(r, 'receipt')),
  }));
}

export function stepReceiptRows(cfg: PsqlConfig, revisionId: string): StepReceiptRow[] {
  return parseStepReceiptRows(
    psqlJson(
      cfg,
      `select row_to_json(t) from (select revision_id::text as revision_id, step_ordinal, proof_execution_id::text as proof_execution_id, status, step_hash, receipt ` +
        `from studio_step_receipts where revision_id='${safeId(revisionId)}'::uuid order by step_ordinal) t`,
      10_000,
    ),
  );
}

// ---- model attempts (psql) -------------------------------------------------------------------

export const ATTEMPT_STATUSES = ['RESERVED', 'CALLING', 'APPLIED', 'REJECTED', 'SUPERSEDED', 'UNKNOWN_CALL'] as const;

export interface AttemptRow {
  kind: string;
  attemptNumber: number;
  status: (typeof ATTEMPT_STATUSES)[number];
  rejectionReason: string | null;
  /** The diagnostics Gate of a refusal (column rejection_gate), for example STEP_SYNTAX. */
  rejectionGate: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  updatedAt: string;
}

export function parseAttemptRows(rows: unknown[]): AttemptRow[] {
  return rows.map((r) => ({
    kind: str(r, 'kind'),
    attemptNumber: int(r, 'attempt_number'),
    status: oneOf(r, 'status', ATTEMPT_STATUSES),
    rejectionReason: strOrNull(r, 'rejection_reason'),
    rejectionGate: strOrNull(r, 'rejection_gate'),
    inputTokens: intOrNull(r, 'input_tokens'),
    outputTokens: intOrNull(r, 'output_tokens'),
    createdAt: str(r, 'created_at'),
    updatedAt: str(r, 'updated_at'),
  }));
}

export const attemptDurationMs = (a: AttemptRow): number => Date.parse(a.updatedAt) - Date.parse(a.createdAt);

// ---- psql access -----------------------------------------------------------------------------

const SAFE_ID = /^[A-Za-z0-9_.-]{1,256}$/;
export function safeId(value: string): string {
  if (!SAFE_ID.test(value)) throw new StatusShapeError(`unsafe identifier ${JSON.stringify(value.slice(0, 40))}`);
  return value;
}

export interface PsqlConfig {
  psql: string;
  port: string;
}

export function psqlConfigFromEnv(): PsqlConfig {
  const port = process.env.CHECKS_GATE_PGPORT;
  if (port === undefined || !/^\d{2,5}$/.test(port)) throw new Error('CHECKS_GATE_PGPORT must be the embedded Postgres port');
  return { psql: process.env.CHECKS_GATE_PSQL ?? '/opt/homebrew/bin/psql', port };
}

const psqlArgs = (cfg: PsqlConfig): string[] => ['-h', '127.0.0.1', '-p', cfg.port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-At'];
// Zonky's local defaults, not a secret.
const psqlEnv = (): NodeJS.ProcessEnv => ({ ...process.env, PGPASSWORD: 'postgres' });

/** Runs a query whose rows are produced with row_to_json and returns the parsed objects. */
export function psqlJson(cfg: PsqlConfig, sql: string, timeoutMs?: number): unknown[] {
  const out = execFileSync(cfg.psql, [...psqlArgs(cfg), '-c', sql], { env: psqlEnv(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...(timeoutMs === undefined ? {} : { timeout: Math.max(1, Math.ceil(timeoutMs)) }) });
  return out
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as unknown);
}

export function learningSessionIds(cfg: PsqlConfig, testId: string): string[] {
  return psqlJson(cfg, `select row_to_json(t) from (select session_id as id from studio_guided_sessions where test_id='${safeId(testId)}') t`, 10_000).map((row) => str(row, 'id'));
}

/** Current progress, including running sessions omitted by the terminal-only latest-attempt API. */
export function readLearningProgress(cfg: PsqlConfig, testId: string, prior: readonly string[], timeoutMs: number): LearningProgress | null {
  const excluded = prior.length === 0 ? '' : ` and session_id not in (${prior.map((id) => `'${safeId(id)}'`).join(',')})`;
  const rows = psqlJson(cfg, `select row_to_json(t) from (select session_id as "sessionId",test_id as "testId",document->'scope'->>'sourceRevision' as "sourceRevision",document->'scope'->>'configurationRevision' as "configurationRevision",array(select step->>'stepId' from jsonb_array_elements(document->'sourceSteps') step) as "stepIds",coalesce((progress->>'stepIndex')::int,0) as "stepIndex",state from studio_guided_sessions where test_id='${safeId(testId)}'${excluded}) t`, timeoutMs);
  if (rows.length > 1) throw new StatusShapeError('multiple new learning sessions in one attempt');
  return rows.length === 0 ? null : parseLearningProgress(rows[0]);
}

export function psqlScalar(cfg: PsqlConfig, sql: string): string {
  return execFileSync(cfg.psql, [...psqlArgs(cfg), '-c', sql], { env: psqlEnv(), encoding: 'utf8' }).trim();
}

export function ledgerRows(cfg: PsqlConfig, sessionId: string): LedgerRow[] {
  const id = safeId(sessionId);
  return parseLedgerRows(
    psqlJson(
      cfg,
      `select row_to_json(t) from (select step_id, ordinal, attempt_ordinal, ` +
        `document->>'state' as state, (document->>'dispatchCount')::int as dispatched, document->>'outcomeCode' as outcome ` +
        `from studio_guided_actions where session_id='${id}' order by ordinal, attempt_ordinal) t`,
    ),
  );
}

export function attemptRows(cfg: PsqlConfig, sessionId: string): AttemptRow[] {
  const id = safeId(sessionId);
  return parseAttemptRows(
    psqlJson(
      cfg,
      `select row_to_json(t) from (select kind, attempt_number, status, rejection_reason, rejection_gate, input_tokens, output_tokens, ` +
        `created_at, updated_at from studio_guided_model_attempts where session_id='${id}' order by created_at) t`,
    ),
  );
}

/** Number of model-attempt rows over every session of one test. */
export function attemptCountForTest(cfg: PsqlConfig, testId: string): number {
  const id = safeId(testId);
  return Number(
    psqlScalar(
      cfg,
      `select count(*) from studio_guided_model_attempts a join studio_guided_sessions s on s.session_id=a.session_id where s.test_id::text='${id}'`,
    ),
  );
}

export function listPublicTables(cfg: PsqlConfig): string[] {
  return psqlScalar(
    cfg,
    `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`,
  )
    .split('\n')
    .filter((t) => t !== '');
}

/** Dumps one table as one JSON object per line; returns the row count and the byte size. */
export function dumpTable(cfg: PsqlConfig, table: string, file: string): { rows: number; bytes: number } {
  const name = safeId(table);
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, 'w');
  try {
    const result = spawnSync(cfg.psql, [...psqlArgs(cfg), '-c', `select row_to_json(t) from public."${name}" t`], {
      env: psqlEnv(),
      stdio: ['ignore', fd, 'pipe'],
    });
    if (result.status !== 0) throw new Error(`psql dump of ${name} failed with status ${String(result.status)}`);
  } finally {
    closeSync(fd);
  }
  const bytes = statSync(file).size;
  const text = readFileSync(file, 'utf8');
  return { rows: text === '' ? 0 : text.split('\n').filter((l) => l !== '').length, bytes };
}

// ---- API reads (Playwright request context, shares the browser's session cookie) -----------------

export async function getJson(request: APIRequestContext, path: string): Promise<unknown> {
  const response = await request.get(path);
  if (!response.ok()) throw new Error(`GET ${path} answered ${response.status()}`);
  return (await response.json()) as unknown;
}

export async function latestAttempt(request: APIRequestContext, testId: string): Promise<LatestAttempt | null> {
  const list = parseLatestAttempts(await getJson(request, `/api/v1/studio/guided-sessions/latest?testId=${encodeURIComponent(testId)}`));
  return list.find((a) => a.testId === testId) ?? null;
}

export async function readSession(request: APIRequestContext, sessionId: string): Promise<SessionView> {
  return parseSession(await getJson(request, `/api/v1/studio/guided-sessions/${encodeURIComponent(sessionId)}`));
}

export async function listExecutions(request: APIRequestContext, testId: string): Promise<ExecutionSnap[]> {
  const params = `testId=${encodeURIComponent(testId)}&sort=acceptedAt,asc&size=100`;
  const result = parseExecutionList(await getJson(request, `/api/v1/studio/executions?${params}`));
  if (result.totalElements !== result.data.length || result.data.some((e) => e.testId !== testId) || new Set(result.data.map((e) => e.executionId)).size !== result.data.length) throw new StatusShapeError('execution list incomplete, crossed or duplicate');
  return result.data;
}
