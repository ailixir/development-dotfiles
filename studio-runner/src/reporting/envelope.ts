/**
 * The `POST /v1/runs` job envelope (AC-3, AC-6, architecture §8.4).
 *
 * Envelope validation is **default-deny on keys**, the same posture the artifact validator takes
 * on syntax. An unknown top-level key is a rejection, not an ignored extra. That is what makes
 * AC-3 hold for a callback field nobody enumerated: `callbackUrl` is refused because it is not on
 * the accepted list, and `reportingEndpoint` would be refused for the same reason tomorrow. The
 * named callback keys below exist only to return a clearer code, not to do the catching.
 *
 * The callback destination is deployment configuration (`STUDIO_RUNNER_CALLBACK_BASE_URL`). A job
 * cannot influence where a report goes, because nothing in this type ever reaches a URL.
 */

/** Immutable identity of the attempt this job is. None of it is derived or defaulted. */
export interface JobIdentity {
  readonly executionId: string;
  readonly attemptId: string;
  readonly revisionId: string;
  readonly artifactHash: string;
}

export interface JobConfiguration {
  readonly browser: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly timeoutSeconds: number;
  readonly waitStrategy: string;
}

export interface JobDeadlines {
  /** Milliseconds from admission within which the browser must start (§8.5, 30 s). */
  readonly admittedStartMs: number;
  /** Total browser runtime cap in milliseconds (§8.5, 120 s). */
  readonly totalRuntimeMs: number;
}

export interface JobEnvelope extends JobIdentity {
  readonly artifact: unknown;
  readonly source: readonly string[];
  readonly configuration: JobConfiguration;
  readonly csi: string;
  readonly references: { readonly variables: readonly string[]; readonly secrets: readonly string[] };
  /** Ephemeral. Held in memory for the run and cleared on every exit path (AC-21). */
  readonly resolvedVars: Readonly<Record<string, string>>;
  /** Ephemeral. Never written to scratch, a retry buffer or a report body (AC-21). */
  readonly resolvedSecrets: Readonly<Record<string, string>>;
  readonly deadlines: JobDeadlines;
  /** Server-derived. The runner never invents or accepts an arbitrary key (architecture §8.4). */
  readonly videoKey: string;
  readonly manifestKey: string;
}

/** Every key a job body may carry. Anything else is a rejection. */
const ACCEPTED_JOB_KEYS = new Set([
  'executionId',
  'attemptId',
  'revisionId',
  'artifactHash',
  'artifact',
  'source',
  'configuration',
  'csi',
  'references',
  'resolvedVars',
  'resolvedSecrets',
  'deadlines',
  'videoKey',
  'manifestKey',
]);

/**
 * Keys that get a specific code rather than the generic unknown-key one, because a job trying to
 * name its own callback is worth saying out loud in the audit log (AC-3).
 */
const CALLBACK_SHAPED_KEYS = [
  'callbackUrl',
  'callbackUri',
  'callback',
  'callbackHost',
  'callbackPort',
  'reportUrl',
  'reportingUrl',
  'apiUrl',
  'apiBaseUrl',
  'host',
  'port',
  'endpoint',
  'webhook',
  'webhookUrl',
];

export const ENVELOPE_CODES = {
  notObject: 'JOB_NOT_OBJECT',
  unknownKey: 'JOB_UNKNOWN_KEY',
  callbackNotPermitted: 'JOB_CALLBACK_NOT_PERMITTED',
  missingField: 'JOB_FIELD_MISSING',
  invalidField: 'JOB_FIELD_INVALID',
} as const;

export interface EnvelopeProblem {
  readonly code: string;
  /** Key name only. A value never appears in a problem, so problems are safe to log (AC-20). */
  readonly field: string;
}

export type EnvelopeResult =
  | { readonly ok: true; readonly job: JobEnvelope }
  | { readonly ok: false; readonly problems: readonly EnvelopeProblem[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function stringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validateConfiguration(value: unknown, problems: EnvelopeProblem[]): boolean {
  if (!isRecord(value)) {
    problems.push({ code: ENVELOPE_CODES.invalidField, field: 'configuration' });
    return false;
  }
  const viewport = value.viewport;
  const ok =
    nonEmptyString(value.browser) &&
    nonEmptyString(value.waitStrategy) &&
    positiveInteger(value.timeoutSeconds) &&
    isRecord(viewport) &&
    positiveInteger(viewport.width) &&
    positiveInteger(viewport.height);
  if (!ok) problems.push({ code: ENVELOPE_CODES.invalidField, field: 'configuration' });
  return ok;
}

function validateDeadlines(value: unknown, problems: EnvelopeProblem[]): boolean {
  if (!isRecord(value)) {
    problems.push({ code: ENVELOPE_CODES.invalidField, field: 'deadlines' });
    return false;
  }
  const ok = positiveInteger(value.admittedStartMs) && positiveInteger(value.totalRuntimeMs);
  if (!ok) problems.push({ code: ENVELOPE_CODES.invalidField, field: 'deadlines' });
  return ok;
}

function validateReferences(value: unknown, problems: EnvelopeProblem[]): boolean {
  if (!isRecord(value)) {
    problems.push({ code: ENVELOPE_CODES.invalidField, field: 'references' });
    return false;
  }
  const ok = stringArray(value.variables) && stringArray(value.secrets);
  if (!ok) problems.push({ code: ENVELOPE_CODES.invalidField, field: 'references' });
  return ok;
}

/**
 * Parses and validates a job body.
 *
 * Pure and allocation-bounded: it opens nothing, launches nothing and reserves nothing. It runs
 * before the capacity slot is taken (AC-6), so an invalid job never consumes capacity and never
 * reaches the admission endpoint.
 */
export function validateEnvelope(body: unknown): EnvelopeResult {
  const problems: EnvelopeProblem[] = [];

  if (!isRecord(body)) {
    return { ok: false, problems: [{ code: ENVELOPE_CODES.notObject, field: '<body>' }] };
  }

  // ── Default-deny on keys. A callback field is caught here whether or not it was predicted. ──
  for (const key of Object.keys(body)) {
    if (ACCEPTED_JOB_KEYS.has(key)) continue;
    const callbackShaped = CALLBACK_SHAPED_KEYS.some(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
    problems.push({
      code: callbackShaped ? ENVELOPE_CODES.callbackNotPermitted : ENVELOPE_CODES.unknownKey,
      field: key,
    });
  }

  for (const field of ['executionId', 'attemptId', 'revisionId', 'artifactHash', 'csi', 'videoKey', 'manifestKey'] as const) {
    if (!nonEmptyString(body[field])) {
      problems.push({
        code: body[field] === undefined ? ENVELOPE_CODES.missingField : ENVELOPE_CODES.invalidField,
        field,
      });
    }
  }

  if (!stringArray(body.source)) {
    problems.push({ code: ENVELOPE_CODES.invalidField, field: 'source' });
  }
  if (body.artifact === undefined) {
    problems.push({ code: ENVELOPE_CODES.missingField, field: 'artifact' });
  }
  if (!stringRecord(body.resolvedVars)) {
    problems.push({ code: ENVELOPE_CODES.invalidField, field: 'resolvedVars' });
  }
  if (!stringRecord(body.resolvedSecrets)) {
    problems.push({ code: ENVELOPE_CODES.invalidField, field: 'resolvedSecrets' });
  }

  validateConfiguration(body.configuration, problems);
  validateDeadlines(body.deadlines, problems);
  validateReferences(body.references, problems);

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, job: body as unknown as JobEnvelope };
}

/**
 * Every value the run could materialise, for the redactor (AC-20).
 *
 * This is the only bulk read of secret material on the server side, mirroring the executor's
 * `ValueResolver.knownValues`, and its result is handed straight to `createRedactor`.
 */
export function knownValuesOf(job: JobEnvelope): readonly string[] {
  return [...Object.values(job.resolvedVars), ...Object.values(job.resolvedSecrets)].filter(
    (value) => value.length > 0,
  );
}
