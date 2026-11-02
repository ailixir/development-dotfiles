/**
 * The frames between the guided runtime and its per-session browser child (SC008-E15).
 *
 * One forked child per learning session holds the browser, the observation session and the step code; the server keeps the runtime
 * (context, journal, callbacks, recording settlement). Everything that crosses is data, and the set of frames is closed:
 *
 *   server -> child   7 requests `{ kind: 'request', id, op }`: launch, current, observe, withhold, commitCapture, step, close
 *                     notices `fence-ack`, `fence-nack` (the answer to a fence request) and `abort`
 *   child  -> server  replies `{ kind: 'reply', id, ok, ... }` and the notices `fence` (a request), `recording-ready`, `lost`, `finalized`
 *
 * The child runs a page the author does not control and step code a model wrote, so every frame it sends is untrusted data. This file is
 * the one place that decides what a valid frame is: {@link parseChildFrame} (envelope and notices), {@link parseReplyValue} (the payload of a
 * reply, by the request it answers) and {@link parseParentFrame} (the child's side, which only checks that it can act on the frame). Any
 * violation is a {@link GuidedProtocolViolation}; the launcher kills the child and ends the session. A forged frame can only harm its own session.
 *
 * Errors cross as closed codes (never text); {@link decodeError} rebuilds the runner's own classes on the server so its `instanceof` and
 * message tests keep working. A secret value travels only in a `step` request, and only on a dispatch.
 */
import { OriginNotAllowed } from '../allowedDomains.js';
import type { StepReceipt } from '../executor/observedOperations.js';
import { validate } from '../guided/contracts.js';
import type { ExecutionEvidence, Observation } from '../guided/types.js';
import { hashObserved, isRecord } from '../validator/observedReferencePolicy.js';
import { CLOSED_ACTION_CODES, CLOSED_REPLAY_REASONS, ClosedActionError } from './closedError.js';
import type { ClosedActionCode } from './closedError.js';
import type { GuidedDocumentTarget, GuidedLaunchPhase, GuidedLossReason, GuidedStepRequest, GuidedStepResult } from './guidedBrowser.js';
import type { ObservationConfig, ObservationExport, ObservationFocus } from './observationTypes.js';
import { exportObservation, MAX_OBSERVATION_BYTES } from './observationSanitizer.js';
import type { SecretUseStatus } from './secretUse.js';
import { MAX_EFFECTS } from './stepCodeBinding.js';
import type { BrowserPreferenceEvidence } from './scratchLayout.js';

export class GuidedProtocolViolation extends Error {
  constructor() {
    super('PROTOCOL');
    this.name = 'GuidedProtocolViolation';
  }
}

function violation(): never { throw new GuidedProtocolViolation(); }
function demand(condition: unknown): asserts condition { if (!condition) violation(); }

// ---------------------------------------------------------------------------------------------------------------------
// Frame types

export const GUIDED_CHILD_OPS = ['launch', 'current', 'observe', 'withhold', 'commitCapture', 'step', 'close'] as const;
export type GuidedChildOp = (typeof GUIDED_CHILD_OPS)[number];

interface Envelope<Op extends GuidedChildOp> { readonly kind: 'request'; readonly id: number; readonly op: Op }
export interface LaunchFrame extends Envelope<'launch'> {
  readonly config: ObservationConfig;
  readonly contextId: string;
  readonly recording: { readonly dir: string; readonly size: { readonly width: number; readonly height: number } } | null;
  readonly deadlineEpochMs: number;
}
export interface CurrentFrame extends Envelope<'current'> { readonly target: GuidedDocumentTarget }
export interface ObserveFrame extends Envelope<'observe'> {
  readonly maxBytes?: number; readonly settle: boolean; readonly focus?: ObservationFocus; readonly deadlineMs?: number;
}
export interface WithholdFrame extends Envelope<'withhold'> { readonly values: readonly string[] }
export interface CommitCaptureFrame extends Envelope<'commitCapture'> { readonly value: string }
export interface StepFrame extends Envelope<'step'> { readonly step: GuidedStepRequest }
export interface CloseFrame extends Envelope<'close'> { readonly finalizeMs: number }
export type GuidedChildRequest = LaunchFrame | CurrentFrame | ObserveFrame | WithholdFrame | CommitCaptureFrame | StepFrame | CloseFrame;

export type GuidedParentFrame =
  | GuidedChildRequest
  | { readonly kind: 'fence-ack'; readonly req: number }
  | { readonly kind: 'fence-nack'; readonly req: number }
  | { readonly kind: 'abort' };

export type GuidedChildErrorCode = ClosedActionCode | (typeof CLOSED_REPLAY_REASONS)[number] | 'ORIGIN_NOT_ALLOWED';

export type GuidedChildFrame =
  | { readonly kind: 'reply'; readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly kind: 'reply'; readonly id: number; readonly ok: false; readonly code: GuidedChildErrorCode; readonly host?: string; readonly phase?: GuidedLaunchPhase }
  | { readonly kind: 'fence'; readonly req: number }
  | { readonly kind: 'recording-ready'; readonly recording: boolean }
  | { readonly kind: 'lost'; readonly reason: GuidedLossReason }
  | { readonly kind: 'finalized'; readonly finalized: boolean; readonly videoPath: string | null };

export interface LaunchReply { readonly evidence: ExecutionEvidence; readonly preferenceEvidence?: BrowserPreferenceEvidence; readonly scratchDirectory: string }
export interface CloseReply { readonly orderly: boolean; readonly recorded: boolean; readonly videoPath: string | null }

// ---------------------------------------------------------------------------------------------------------------------
// Primitives

const MAX_TEXT = 8192;
const MAX_PATH = 4096;
const isString = (value: unknown, max = MAX_TEXT): value is string => typeof value === 'string' && value.length <= max;
const isInt = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const isStringArray = (value: unknown, maxItems: number): value is string[] => Array.isArray(value) && value.length <= maxItems && value.every(item => isString(item, 4096));

/** The record has exactly the required keys and, besides them, only keys from `optional`. */
function shaped(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  demand(isRecord(value));
  const keys = Object.keys(value);
  demand(required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key)));
  return value;
}

function stringMap(value: unknown, maxEntries: number, maxValue = 65_536): Record<string, string> {
  demand(isRecord(value) && Object.keys(value).length <= maxEntries);
  for (const [key, item] of Object.entries(value)) demand(isString(key, 256) && isString(item, maxValue));
  return value as Record<string, string>;
}

/** What an observation reply may weigh (one frame), derived once at launch from the context limits: max(observation cap, 256 KiB) + 64 KiB. */
export function guidedFrameCap(limits: ObservationConfig['limits']): number {
  return Math.max(limits?.bytes ?? MAX_OBSERVATION_BYTES, 256 * 1024) + 64 * 1024;
}

// ---------------------------------------------------------------------------------------------------------------------
// Errors

const ERROR_CODES: ReadonlySet<string> = new Set<string>([...CLOSED_ACTION_CODES, ...CLOSED_REPLAY_REASONS, 'ORIGIN_NOT_ALLOWED']);
const ACTION_CODES: ReadonlySet<string> = new Set<string>(CLOSED_ACTION_CODES);
/** Only a host name may reach a diagnostic line: letters, digits and the separators of a host or an IP literal. */
const HOST_PATTERN = /^[A-Za-z0-9.:[\]_-]{1,253}$/u;
const LAUNCH_PHASES: ReadonlySet<string> = new Set(['PROFILE', 'PROCESS', 'PROBE', 'STARTUP_PAGE', 'APP_PAGE', 'BLANK_DOCUMENT']);
const LOSS_REASONS: ReadonlySet<string> = new Set(['PAGE_CRASH', 'BROWSER_DISCONNECTED']);

/** The closed code a thrown value crosses as: the runner's own closed classes by their code, anything else (Playwright text included) as CONTEXT_LOST. */
export function encodeError(error: unknown): { code: GuidedChildErrorCode; host?: string } {
  if (error instanceof OriginNotAllowed) return HOST_PATTERN.test(error.host) ? { code: 'ORIGIN_NOT_ALLOWED', host: error.host } : { code: 'CONTEXT_LOST' };
  const code: unknown = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && ERROR_CODES.has(code) && code !== 'ORIGIN_NOT_ALLOWED') return { code: code as GuidedChildErrorCode };
  if (error instanceof Error && ERROR_CODES.has(error.message) && error.message !== 'ORIGIN_NOT_ALLOWED') return { code: error.message as GuidedChildErrorCode };
  return { code: 'CONTEXT_LOST' };
}

/** The error the server throws for a code the child reported: the class the runtime's tests look at, with message === code. */
export function decodeError(code: GuidedChildErrorCode, host?: string): Error {
  if (code === 'ORIGIN_NOT_ALLOWED') return new OriginNotAllowed(host ?? 'unknown');
  if (ACTION_CODES.has(code)) return new ClosedActionError(code as ClosedActionCode);
  return new Error(code);
}

// ---------------------------------------------------------------------------------------------------------------------
// Child frames (untrusted)

/** Validates one frame from the child. `cap` is {@link guidedFrameCap} of the session; the size is measured after Node's own parse. */
export function parseChildFrame(raw: unknown, cap: number): GuidedChildFrame {
  demand(isRecord(raw) && Buffer.byteLength(JSON.stringify(raw), 'utf8') <= cap);
  switch (raw.kind) {
    case 'reply': {
      demand(isInt(raw.id, 1) && typeof raw.ok === 'boolean');
      if (raw.ok) {
        shaped(raw, ['kind', 'id', 'ok', 'value']);
        return { kind: 'reply', id: raw.id, ok: true, value: raw.value };
      }
      shaped(raw, ['kind', 'id', 'ok', 'code'], ['host', 'phase']);
      const { code, host, phase } = raw;
      demand(typeof code === 'string' && ERROR_CODES.has(code));
      demand((code === 'ORIGIN_NOT_ALLOWED') === (host !== undefined) && (host === undefined || (typeof host === 'string' && HOST_PATTERN.test(host))));
      demand(phase === undefined || (typeof phase === 'string' && LAUNCH_PHASES.has(phase)));
      return { kind: 'reply', id: raw.id, ok: false, code: code as GuidedChildErrorCode, ...(host === undefined ? {} : { host }), ...(phase === undefined ? {} : { phase: phase as GuidedLaunchPhase }) };
    }
    case 'fence':
      shaped(raw, ['kind', 'req']);
      demand(isInt(raw.req, 1));
      return { kind: 'fence', req: raw.req };
    case 'recording-ready':
      shaped(raw, ['kind', 'recording']);
      demand(typeof raw.recording === 'boolean');
      return { kind: 'recording-ready', recording: raw.recording };
    case 'lost':
      shaped(raw, ['kind', 'reason']);
      demand(typeof raw.reason === 'string' && LOSS_REASONS.has(raw.reason));
      return { kind: 'lost', reason: raw.reason as GuidedLossReason };
    case 'finalized':
      shaped(raw, ['kind', 'finalized', 'videoPath']);
      demand(typeof raw.finalized === 'boolean' && (raw.videoPath === null || isString(raw.videoPath, MAX_PATH)));
      return { kind: 'finalized', finalized: raw.finalized, videoPath: raw.videoPath };
    default:
      return violation();
  }
}

/** What the server knows about the request a reply answers: the reply is judged against it, never against itself. */
export type ReplyContext =
  | { readonly op: 'launch'; readonly sessionId: string; readonly contextId: string; readonly directory: string }
  | { readonly op: 'current' }
  | { readonly op: 'observe'; readonly sessionId: string; readonly scopeHash: string; readonly maxBytes: number }
  | { readonly op: 'withhold' }
  | { readonly op: 'commitCapture' }
  | { readonly op: 'step'; readonly request: GuidedStepRequest }
  | { readonly op: 'close' };

export function parseReplyValue(context: ReplyContext & { readonly op: 'launch' }, value: unknown): LaunchReply;
export function parseReplyValue(context: ReplyContext & { readonly op: 'current' }, value: unknown): boolean;
export function parseReplyValue(context: ReplyContext & { readonly op: 'observe' }, value: unknown): ObservationExport;
export function parseReplyValue(context: ReplyContext & { readonly op: 'withhold' | 'commitCapture' }, value: unknown): null;
export function parseReplyValue(context: ReplyContext & { readonly op: 'step' }, value: unknown): GuidedStepResult;
export function parseReplyValue(context: ReplyContext & { readonly op: 'close' }, value: unknown): CloseReply;
export function parseReplyValue(context: ReplyContext, value: unknown): unknown;
export function parseReplyValue(context: ReplyContext, value: unknown): LaunchReply | boolean | ObservationExport | GuidedStepResult | CloseReply | null {
  switch (context.op) {
    case 'launch': return launchReply(context, value);
    case 'current': demand(typeof value === 'boolean'); return value;
    case 'observe': return observeReply(context, value);
    case 'withhold':
    case 'commitCapture': demand(value === null); return null;
    case 'step': return stepReply(context.request, value);
    case 'close': return closeReply(value);
  }
}

function launchReply(context: Extract<ReplyContext, { op: 'launch' }>, value: unknown): LaunchReply {
  const reply = shaped(value, ['evidence', 'scratchDirectory'], ['preferenceEvidence']);
  const evidence = shaped(reply.evidence, ['kind', 'sessionId', 'contextId', 'creationId', 'documentId', 'bootstrapId', 'url', 'origin', 'generation']);
  demand(evidence.kind === 'initialBlank' && evidence.sessionId === context.sessionId && evidence.contextId === context.contextId);
  demand([evidence.creationId, evidence.documentId, evidence.bootstrapId].every(id => isString(id, 256) && id !== ''));
  demand(evidence.url === 'about:blank' && evidence.origin === null && evidence.generation === 0);
  // The child reports where its scratch is; it must be inside the directory the server made for it.
  demand(isString(reply.scratchDirectory, MAX_PATH) && reply.scratchDirectory.startsWith(`${context.directory}/`) && !reply.scratchDirectory.includes('..'));
  let preferenceEvidence: BrowserPreferenceEvidence | undefined;
  if (reply.preferenceEvidence !== undefined) {
    const prefs = shaped(reply.preferenceEvidence, ['channel', 'browserVersion', 'activeProfilePath', 'executablePath', 'effective']);
    demand(prefs.channel === 'chromium' && isString(prefs.browserVersion, 256) && isString(prefs.activeProfilePath, MAX_PATH) && isString(prefs.executablePath, MAX_PATH));
    shaped(prefs.effective, ['credentialsEnableService', 'autofillProfileEnabled', 'autofillCreditCardEnabled', 'restoreOnStartup']);
    preferenceEvidence = prefs as unknown as BrowserPreferenceEvidence;
  }
  return { evidence: evidence as unknown as ExecutionEvidence, scratchDirectory: reply.scratchDirectory, ...(preferenceEvidence === undefined ? {} : { preferenceEvidence }) };
}

function observeReply(context: Extract<ReplyContext, { op: 'observe' }>, value: unknown): ObservationExport {
  const reply = shaped(value, ['observation']);
  // The same contract check the child ran, repeated here: the server never trusts the child's word that it did.
  let observation: Observation;
  try { observation = validate<Observation>('observation', reply.observation); } catch { return violation(); }
  demand(observation.sessionId === context.sessionId && observation.scopeHash === context.scopeHash);
  // Canonical form, hash and the byte cap are the server's own computation.
  try { return exportObservation(observation, context.maxBytes); } catch { return violation(); }
}

const RECEIPT_CLOSED_CODES: ReadonlySet<string> = new Set([
  'INVALID_CONTRACT', 'PROFILE_MISMATCH', 'AUTHORIZATION_EXPIRED', 'POLICY_REFUSED', 'TARGET_DRIFT', 'READ_REFUSED', 'REFERENCE_REFUSED', 'ASSERTION_FAILED',
  'CANCELLED', 'TIMEOUT', 'OUTCOME_UNKNOWN', 'INTERNAL_ERROR', 'LOGIN_REQUIRED', 'PASSWORD_CONTROL_READ_REFUSED', 'REFERENCE_MISMATCH', 'NAVIGATION_HTTP_ERROR',
]);
const SECRET_USE: ReadonlySet<string> = new Set(['USED', 'NOT_USED', 'REFUSED']);

function stepReply(request: GuidedStepRequest, value: unknown): GuidedStepResult {
  const reply = shaped(value, ['receipt', 'captured', 'fenceReached', 'secretUse'], ['matchCount', 'syntax']);
  const receipt = shaped(reply.receipt, ['closedCode', 'stepHash', 'fenceCrossed', 'effects', 'effectsTruncated', 'offscreen']);
  demand(receipt.closedCode === null || (typeof receipt.closedCode === 'string' && RECEIPT_CLOSED_CODES.has(receipt.closedCode)));
  // The receipt names the code the server sent; a child that ran something else cannot say it ran this.
  demand(receipt.stepHash === hashObserved(request.operation));
  demand(typeof receipt.fenceCrossed === 'boolean' && typeof receipt.effectsTruncated === 'boolean' && typeof receipt.offscreen === 'boolean');
  demand(Array.isArray(receipt.effects) && receipt.effects.length <= MAX_EFFECTS);
  for (const effect of receipt.effects as unknown[]) {
    const entry = shaped(effect, ['method', 'completed']);
    demand(isString(entry.method, 128) && typeof entry.completed === 'boolean');
  }
  const captured = stringMap(reply.captured, request.operation.captures.length, 4096);
  demand(Object.keys(captured).every(id => request.operation.captures.includes(id)));
  demand(typeof reply.fenceReached === 'boolean');
  demand(reply.matchCount === undefined || isInt(reply.matchCount, 0, 1_000_000));
  let syntax: { line: number; column: number } | undefined;
  if (reply.syntax !== undefined) {
    const position = shaped(reply.syntax, ['line', 'column']);
    demand(isInt(position.line, 1, 1_000_000) && isInt(position.column, 1, 1_000_000));
    syntax = { line: position.line, column: position.column };
  }
  demand(isRecord(reply.secretUse));
  for (const [id, status] of Object.entries(reply.secretUse)) demand(request.secretIds.includes(id) && typeof status === 'string' && SECRET_USE.has(status));
  return {
    receipt: receipt as unknown as StepReceipt, captured, fenceReached: reply.fenceReached,
    ...(reply.matchCount === undefined ? {} : { matchCount: reply.matchCount }), ...(syntax === undefined ? {} : { syntax }),
    secretUse: reply.secretUse as Record<string, SecretUseStatus>,
  };
}

function closeReply(value: unknown): CloseReply {
  const reply = shaped(value, ['orderly', 'recorded', 'videoPath']);
  demand(typeof reply.orderly === 'boolean' && typeof reply.recorded === 'boolean' && (reply.videoPath === null || isString(reply.videoPath, MAX_PATH)));
  return { orderly: reply.orderly, recorded: reply.recorded, videoPath: reply.videoPath };
}

// ---------------------------------------------------------------------------------------------------------------------
// Parent frames (the child checks that it can act on them)

const STEP_MODES: ReadonlySet<unknown> = new Set(['prepare', 'dispatch']);
const USE_KINDS: ReadonlySet<unknown> = new Set(['input', 'secret', 'binding']);

function stepRequest(value: unknown): GuidedStepRequest {
  const step = shaped(value, ['mode', 'coordinate', 'operation', 'inputs', 'vars', 'secretIds', 'deadlineEpochMs'], ['secrets']);
  demand(STEP_MODES.has(step.mode) && typeof step.deadlineEpochMs === 'number' && Number.isFinite(step.deadlineEpochMs));
  const coordinate = shaped(step.coordinate, ['stepId', 'ordinal']);
  demand(isString(coordinate.stepId, 256) && isInt(coordinate.ordinal, 0, 1000));
  const operation = shaped(step.operation, ['kind', 'code', 'captures', 'uses', 'sourceHash']);
  demand(operation.kind === 'step' && isString(operation.code, 1_048_576) && isStringArray(operation.captures, 64) && isString(operation.sourceHash, 128));
  demand(Array.isArray(operation.uses) && operation.uses.length <= 256);
  for (const use of operation.uses as unknown[]) { const entry = shaped(use, ['kind', 'id']); demand(USE_KINDS.has(entry.kind) && isString(entry.id, 256)); }
  stringMap(step.inputs, 256, 1_048_576);
  stringMap(step.vars, 256, 1_048_576);
  demand(isStringArray(step.secretIds, 256));
  if (step.secrets !== undefined) {
    demand(step.mode === 'dispatch' && isRecord(step.secrets) && Object.keys(step.secrets).length <= 256);
    for (const held of Object.values(step.secrets)) { const entry = shaped(held, ['value', 'allowedOrigins']); demand(isString(entry.value, 4096) && isStringArray(entry.allowedOrigins, 64)); }
  }
  return step as unknown as GuidedStepRequest;
}

/** Validates one frame from the server. */
export function parseParentFrame(raw: unknown): GuidedParentFrame {
  demand(isRecord(raw));
  switch (raw.kind) {
    case 'fence-ack':
    case 'fence-nack':
      shaped(raw, ['kind', 'req']);
      demand(isInt(raw.req, 1));
      return { kind: raw.kind, req: raw.req };
    case 'abort':
      shaped(raw, ['kind']);
      return { kind: 'abort' };
    case 'request': break;
    default: return violation();
  }
  demand(isInt(raw.id, 1) && typeof raw.op === 'string' && (GUIDED_CHILD_OPS as readonly string[]).includes(raw.op));
  const id = raw.id;
  switch (raw.op as GuidedChildOp) {
    case 'launch': {
      shaped(raw, ['kind', 'id', 'op', 'config', 'contextId', 'recording', 'deadlineEpochMs']);
      const config = shaped(raw.config, ['sessionId', 'scopeHash', 'allowedDomains', 'knownSecrets'], ['limits']);
      demand(isString(config.sessionId, 256) && isString(config.scopeHash, 128) && isStringArray(config.allowedDomains, 4096) && isStringArray(config.knownSecrets, 64));
      if (config.limits !== undefined) {
        const limits = shaped(config.limits, [], ['outlineBytes', 'bytes', 'milliseconds']);
        demand(Object.values(limits).every(limit => isInt(limit, 1)));
      }
      demand(isString(raw.contextId, 256) && typeof raw.deadlineEpochMs === 'number' && Number.isFinite(raw.deadlineEpochMs));
      if (raw.recording !== null) {
        const recording = shaped(raw.recording, ['dir', 'size']);
        const size = shaped(recording.size, ['width', 'height']);
        demand(isString(recording.dir, MAX_PATH) && isInt(size.width, 1, 16_384) && isInt(size.height, 1, 16_384));
      }
      return raw as unknown as LaunchFrame;
    }
    case 'current': {
      shaped(raw, ['kind', 'id', 'op', 'target']);
      const target = isRecord(raw.target) ? raw.target : violation();
      if (target.kind === 'blank') shaped(target, ['kind']);
      else {
        shaped(target, ['kind', 'documentId', 'generation', 'origin']);
        demand(target.kind === 'document' && isString(target.documentId, 256) && isInt(target.generation) && isString(target.origin, 2048));
      }
      return raw as unknown as CurrentFrame;
    }
    case 'observe': {
      shaped(raw, ['kind', 'id', 'op', 'settle'], ['maxBytes', 'focus', 'deadlineMs']);
      demand(typeof raw.settle === 'boolean' && (raw.maxBytes === undefined || isInt(raw.maxBytes, 1)) && (raw.deadlineMs === undefined || (typeof raw.deadlineMs === 'number' && Number.isFinite(raw.deadlineMs))));
      if (raw.focus !== undefined) { const focus = shaped(raw.focus, ['stepText', 'targetIntents']); demand(isString(focus.stepText, 65_536) && isStringArray(focus.targetIntents, 256)); }
      return raw as unknown as ObserveFrame;
    }
    case 'withhold':
      shaped(raw, ['kind', 'id', 'op', 'values']);
      demand(isStringArray(raw.values, 4096));
      return { kind: 'request', id, op: 'withhold', values: raw.values };
    case 'commitCapture':
      shaped(raw, ['kind', 'id', 'op', 'value']);
      demand(isString(raw.value, 65_536));
      return { kind: 'request', id, op: 'commitCapture', value: raw.value };
    case 'step':
      shaped(raw, ['kind', 'id', 'op', 'step']);
      return { kind: 'request', id, op: 'step', step: stepRequest(raw.step) };
    case 'close':
      shaped(raw, ['kind', 'id', 'op', 'finalizeMs']);
      demand(isInt(raw.finalizeMs, 0, 600_000));
      return { kind: 'request', id, op: 'close', finalizeMs: raw.finalizeMs };
  }
}
