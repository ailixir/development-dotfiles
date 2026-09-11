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

/**
 * Every key a job body may carry. Anything else is a rejection.
 *
 * Exported since story 10.17 so that AC-16b's gate-shut tripwire can assert over **this** set
 * rather than over a hand-built test fixture (QA LOW-2). A tripwire that iterates a fixture is a
 * statement about the fixture; adding `targetPolicy` here left it green.
 */
export const ACCEPTED_JOB_KEYS = new Set([
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
  /** A reference the artifact may name, for which the job supplied no value (AC-3). */
  referenceNotResolved: 'JOB_REFERENCE_NOT_RESOLVED',
  /** A value the artifact cannot name. A value with no declaration should not be here (AC-3). */
  resolvedNotDeclared: 'JOB_RESOLVED_NOT_DECLARED',
  /** The same name declared, or supplied, as both a variable and a secret (AC-3). */
  referenceCrossedType: 'JOB_REFERENCE_CROSSED_TYPE',
} as const;

/**
 * Reference/value correspondence (AC-3, §4.5, §9.2).
 *
 * Before story 10.17 this check did not exist. `resolvedVars` and `resolvedSecrets` were checked
 * to be string records and their keys were **never compared to `references`** — so a job declaring
 * a secret and supplying no value was admitted, took a capacity slot, launched Chromium, and died
 * mid-step with `Secret "LOGIN_PW" was not resolved for this run.` in front of a real application.
 * The epic's acceptance bullet is *"unauthorized or missing reference prevents browser launch"*,
 * and this is where that becomes true: correspondence is part of envelope validation, which runs
 * as step 1 of `submit`, before `pool.tryAcquire()`, before admission and before any process.
 *
 * Four conditions, and the third and fourth are not symmetry for its own sake:
 *
 * 1. every declared secret id has a key in `resolvedSecrets`;
 * 2. every declared variable name has a key in `resolvedVars`;
 * 3. **no resolved key is undeclared, in either map.** A value the artifact cannot name is a value
 *    that should not be in this process at all — it can be read by nothing, so its only possible
 *    effect is to be leaked;
 * 4. a secret id appearing among the variables, or the reverse, is a refusal. The two maps mean
 *    different things — only one of them is a secret whose *position* the validator restricts —
 *    and a name that is both makes the artifact's own reference check ambiguous.
 *
 * Every problem carries the reference **name** and never the value, exactly as every other
 * envelope problem does, which is what makes the whole `detail` array safe to log.
 */
function validateCorrespondence(
  references: { readonly variables: readonly string[]; readonly secrets: readonly string[] },
  resolvedVars: Readonly<Record<string, string>>,
  resolvedSecrets: Readonly<Record<string, string>>,
  problems: EnvelopeProblem[],
): void {
  const declaredVariables = new Set(references.variables);
  const declaredSecrets = new Set(references.secrets);

  for (const name of declaredVariables) {
    if (declaredSecrets.has(name)) {
      problems.push({ code: ENVELOPE_CODES.referenceCrossedType, field: name });
    }
  }
  for (const name of declaredVariables) {
    if (!Object.hasOwn(resolvedVars, name)) {
      problems.push({ code: ENVELOPE_CODES.referenceNotResolved, field: name });
    }
  }
  for (const name of declaredSecrets) {
    if (!Object.hasOwn(resolvedSecrets, name)) {
      problems.push({ code: ENVELOPE_CODES.referenceNotResolved, field: name });
    }
  }
  for (const name of Object.keys(resolvedVars)) {
    if (declaredSecrets.has(name) && !declaredVariables.has(name)) {
      problems.push({ code: ENVELOPE_CODES.referenceCrossedType, field: name });
    } else if (!declaredVariables.has(name)) {
      problems.push({ code: ENVELOPE_CODES.resolvedNotDeclared, field: name });
    }
  }
  for (const name of Object.keys(resolvedSecrets)) {
    if (declaredVariables.has(name) && !declaredSecrets.has(name)) {
      problems.push({ code: ENVELOPE_CODES.referenceCrossedType, field: name });
    } else if (!declaredSecrets.has(name)) {
      problems.push({ code: ENVELOPE_CODES.resolvedNotDeclared, field: name });
    }
  }
}

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
  const referencesOk = validateReferences(body.references, problems);

  // Correspondence needs all three shapes to have been established first; a malformed `references`
  // or a non-record resolved map has already been reported and comparing their keys would add
  // noise rather than a second fact.
  if (referencesOk && stringRecord(body.resolvedVars) && stringRecord(body.resolvedSecrets)) {
    validateCorrespondence(
      body.references as { variables: string[]; secrets: string[] },
      body.resolvedVars,
      body.resolvedSecrets,
      problems,
    );
  }

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
