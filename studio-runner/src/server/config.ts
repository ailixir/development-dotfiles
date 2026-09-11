/**
 * Runner configuration (AC-22c, architecture §8.5).
 *
 * **The loader is fail-closed by enumeration.** Every key the runner accepts is listed in
 * {@link ACCEPTED_KEYS}; any `STUDIO_RUNNER_*` variable that is not on that list is a startup
 * failure, not an ignored extra. That is the third leg of the isolation gate: a database URL, a
 * vault address, a CSI endpoint or an LLM gateway key cannot be "configured but unused", because
 * the process refuses to start when one is present. A credential the process never reads cannot
 * leak; a credential the process refuses to accept cannot even be mounted by mistake.
 *
 * The namespace prefix exists so the enumeration is meaningful. The process environment is full
 * of variables the runner has nothing to do with (`PATH`, `HOME`, `NODE_ENV`); rejecting those
 * would be absurd. Rejecting an *unrecognised key inside the runner's own namespace* is exactly
 * the signal worth failing on — it is someone trying to configure this process.
 */

/** Environment namespace. Only keys with this prefix are the runner's to accept or reject. */
export const CONFIG_PREFIX = 'STUDIO_RUNNER_';

/**
 * Destination classes the runner may talk to (AC-3, architecture §9.2). This list is the
 * complement to the dependency allowlist: the allowlist stops the runner linking a client, this
 * stops it being pointed somewhere new. There is no fourth entry and no key that would add one.
 */
export const PERMITTED_DESTINATIONS = ['callback-api', 'object-store', 'target-page'] as const;

export interface RunnerConfig {
  /** TCP port for the internal server. `0` asks the OS for a free port (tests). */
  readonly port: number;
  /** Bind address; internal ClusterIP only, never a public interface. */
  readonly host: string;
  /** Concurrent runs this pod admits. ADR-001 §9 starts at 1. */
  readonly poolSize: number;
  /** Stable for the process; identifies this instance in every admission (AC-7). */
  readonly runnerInstanceId: string;
  /** Inbound service identity the four internal routes require (AC-2a). */
  readonly serviceIdentityToken: string;
  /** Outbound service identity presented to the API. Never appears in a URL (AC-3). */
  readonly callbackIdentityToken: string;
  /** The one configured callback destination. A job may never supply one (AC-3). */
  readonly callbackBaseUrl: string;
  /** Per-run scratch root, cleared at startup and on every exit path (AC-12, AC-21). */
  readonly scratchDir: string;
  /** Admission HTTP timeout; §8.5 starting value 10 s. */
  readonly admissionTimeoutMs: number;
  /** Bounded window for terminal delivery retries (AC-17). */
  readonly terminalDeliveryWindowMs: number;
  /** Maximum terminal delivery attempts, including the first (AC-17). */
  readonly terminalDeliveryMaxAttempts: number;
  /** Base backoff between terminal delivery attempts, before jitter (AC-17). */
  readonly terminalDeliveryBackoffMs: number;
  /** Wall-clock bound on one `POST /v1/validate` call (AC-4). */
  readonly validateTimeoutMs: number;
  /** Maximum accepted request body, checked while reading (AC-5). */
  readonly maxRequestBodyBytes: number;
  /** `Retry-After` seconds returned with a capacity `429` (AC-10). */
  readonly retryAfterSeconds: number;
  /** Grace given to an in-flight run to deliver its terminal report on drain (AC-12). */
  readonly drainTimeoutMs: number;
  /**
   * Recording geometry, in pixels (10.12 AC-7, architecture §6.1).
   *
   * Explicit rather than implicit: §6.1 requires the text needed for evidence to stay readable,
   * and an implicit library default is a number nobody chose. The starting value matches the
   * default viewport; §8.5 says to tune it against staging measurements, and SPK-06 phase A is
   * where the recommendation comes from.
   */
  readonly recordingWidth: number;
  readonly recordingHeight: number;
  /** Bound on the browser launch handshake. A child that never reports a start has failed. */
  readonly browserLaunchTimeoutMs: number;
  /** Per-operation wall-clock bound handed to the adapter (§8.5 starting value, 30 s). */
  readonly stepTimeoutMs: number;
  /** Grace given to a browser child asked to stop before it is killed. */
  readonly browserStopTimeoutMs: number;
  /** Outbound payload bounds (AC-19). */
  readonly maxReportSteps: number;
  readonly maxReportLogEntries: number;
  readonly maxReportLogEntryLength: number;
  readonly maxReportBodyBytes: number;
}

/** One accepted key: its environment suffix, how to read it, and whether it is required. */
interface KeySpec {
  readonly field: keyof RunnerConfig;
  readonly kind: 'string' | 'integer';
  readonly required: boolean;
  readonly fallback?: string | number;
  readonly min?: number;
}

/**
 * The complete accepted surface. Adding a key here is the only way to add configuration, which
 * makes the review question "does this key give the runner a new credential or a new
 * destination?" a single-file question.
 */
const KEY_SPECS: Readonly<Record<string, KeySpec>> = {
  PORT: { field: 'port', kind: 'integer', required: false, fallback: 8080, min: 0 },
  HOST: { field: 'host', kind: 'string', required: false, fallback: '0.0.0.0' },
  POOL_SIZE: { field: 'poolSize', kind: 'integer', required: false, fallback: 1, min: 1 },
  INSTANCE_ID: { field: 'runnerInstanceId', kind: 'string', required: false },
  SERVICE_IDENTITY: { field: 'serviceIdentityToken', kind: 'string', required: true },
  CALLBACK_IDENTITY: { field: 'callbackIdentityToken', kind: 'string', required: true },
  CALLBACK_BASE_URL: { field: 'callbackBaseUrl', kind: 'string', required: true },
  SCRATCH_DIR: { field: 'scratchDir', kind: 'string', required: false, fallback: '/tmp/studio-runner' },
  ADMISSION_TIMEOUT_MS: {
    field: 'admissionTimeoutMs',
    kind: 'integer',
    required: false,
    fallback: 10_000,
    min: 1,
  },
  TERMINAL_DELIVERY_WINDOW_MS: {
    field: 'terminalDeliveryWindowMs',
    kind: 'integer',
    required: false,
    fallback: 30_000,
    min: 1,
  },
  TERMINAL_DELIVERY_MAX_ATTEMPTS: {
    field: 'terminalDeliveryMaxAttempts',
    kind: 'integer',
    required: false,
    fallback: 5,
    min: 1,
  },
  TERMINAL_DELIVERY_BACKOFF_MS: {
    field: 'terminalDeliveryBackoffMs',
    kind: 'integer',
    required: false,
    fallback: 250,
    min: 0,
  },
  VALIDATE_TIMEOUT_MS: {
    field: 'validateTimeoutMs',
    kind: 'integer',
    required: false,
    fallback: 5_000,
    min: 1,
  },
  MAX_REQUEST_BODY_BYTES: {
    field: 'maxRequestBodyBytes',
    kind: 'integer',
    required: false,
    fallback: 256 * 1024,
    min: 1,
  },
  RETRY_AFTER_SECONDS: {
    field: 'retryAfterSeconds',
    kind: 'integer',
    required: false,
    fallback: 5,
    min: 0,
  },
  DRAIN_TIMEOUT_MS: {
    field: 'drainTimeoutMs',
    kind: 'integer',
    required: false,
    fallback: 150_000,
    min: 0,
  },
  RECORDING_WIDTH: {
    field: 'recordingWidth',
    kind: 'integer',
    required: false,
    fallback: 1280,
    min: 1,
  },
  RECORDING_HEIGHT: {
    field: 'recordingHeight',
    kind: 'integer',
    required: false,
    fallback: 720,
    min: 1,
  },
  BROWSER_LAUNCH_TIMEOUT_MS: {
    field: 'browserLaunchTimeoutMs',
    kind: 'integer',
    required: false,
    fallback: 60_000,
    min: 1,
  },
  STEP_TIMEOUT_MS: {
    field: 'stepTimeoutMs',
    kind: 'integer',
    required: false,
    fallback: 30_000,
    min: 1,
  },
  BROWSER_STOP_TIMEOUT_MS: {
    field: 'browserStopTimeoutMs',
    kind: 'integer',
    required: false,
    fallback: 5_000,
    min: 1,
  },
  MAX_REPORT_STEPS: {
    field: 'maxReportSteps',
    kind: 'integer',
    required: false,
    fallback: 100,
    min: 1,
  },
  MAX_REPORT_LOG_ENTRIES: {
    field: 'maxReportLogEntries',
    kind: 'integer',
    required: false,
    fallback: 200,
    min: 1,
  },
  MAX_REPORT_LOG_ENTRY_LENGTH: {
    field: 'maxReportLogEntryLength',
    kind: 'integer',
    required: false,
    fallback: 400,
    min: 1,
  },
  MAX_REPORT_BODY_BYTES: {
    field: 'maxReportBodyBytes',
    kind: 'integer',
    required: false,
    fallback: 512 * 1024,
    min: 1,
  },
};

/** Every accepted fully-qualified environment variable name. */
export const ACCEPTED_KEYS: readonly string[] = Object.keys(KEY_SPECS)
  .map((suffix) => `${CONFIG_PREFIX}${suffix}`)
  .sort();

/** Raised when configuration is rejected. Carries every problem, not just the first. */
export class ConfigurationError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Runner configuration rejected:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigurationError';
    this.problems = problems;
  }
}

/** A generated instance id when none is configured; stable for the life of the process (AC-7). */
function generateInstanceId(): string {
  return `runner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseInteger(name: string, raw: string, min: number, problems: string[]): number {
  if (!/^\d+$/u.test(raw.trim())) {
    problems.push(`${name} must be a non-negative integer; got ${JSON.stringify(raw)}.`);
    return min;
  }
  const value = Number(raw.trim());
  if (value < min) {
    problems.push(`${name} must be >= ${String(min)}; got ${String(value)}.`);
    return min;
  }
  return value;
}

/**
 * Loads and validates configuration from an environment-shaped record.
 *
 * Takes the environment as a parameter rather than reading `process.env` so the rejection
 * behaviour is testable without mutating global state, and so `main.ts` remains the only place
 * that touches the real process.
 *
 * @throws ConfigurationError when a required key is missing, a value is unreadable, or **any**
 * unrecognised `STUDIO_RUNNER_*` key is present.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): RunnerConfig {
  const problems: string[] = [];

  // ── Fail closed on the unknown key. This is the clause that catches the driver nobody
  //    predicted: it does not ask what the key *is*, only whether it was enumerated. ──────────
  const unknown = Object.keys(env)
    .filter((key) => key.startsWith(CONFIG_PREFIX))
    .filter((key) => !(key.slice(CONFIG_PREFIX.length) in KEY_SPECS))
    .sort();
  for (const key of unknown) {
    problems.push(
      `${key} is not a configuration key this runner accepts. The runner holds no database, ` +
        'vault, CSI or LLM credential (architecture §9.2); an unrecognised key in its namespace ' +
        'is refused rather than ignored. Accepted keys: ' +
        ACCEPTED_KEYS.join(', '),
    );
  }

  const draft: Record<string, string | number> = {};
  for (const [suffix, spec] of Object.entries(KEY_SPECS)) {
    const name = `${CONFIG_PREFIX}${suffix}`;
    const raw = env[name];
    const provided = raw !== undefined && raw.trim() !== '';

    if (!provided) {
      if (spec.required) {
        problems.push(`${name} is required and was not provided.`);
        continue;
      }
      if (spec.fallback !== undefined) draft[spec.field] = spec.fallback;
      continue;
    }

    draft[spec.field] =
      spec.kind === 'integer'
        ? parseInteger(name, raw, spec.min ?? 0, problems)
        : raw.trim();
  }

  // Stable for the life of the process either way (AC-7): configured when the deployment names
  // the instance, generated once here when it does not.
  if (typeof draft.runnerInstanceId !== 'string' || draft.runnerInstanceId === '') {
    draft.runnerInstanceId = generateInstanceId();
  }

  const callbackBaseUrl = draft.callbackBaseUrl;
  if (typeof callbackBaseUrl === 'string') {
    let parsed: URL | null = null;
    try {
      parsed = new URL(callbackBaseUrl);
    } catch {
      parsed = null;
    }
    if (parsed === null) {
      problems.push(`${CONFIG_PREFIX}CALLBACK_BASE_URL is not an absolute URL.`);
    } else if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '') {
      // AC-3: no credential in a URL or query string, ever — not even the configured one.
      problems.push(
        `${CONFIG_PREFIX}CALLBACK_BASE_URL must carry no userinfo and no query string; ` +
          'credentials travel in headers (AC-3, architecture §9.2).',
      );
    }
  }

  if (problems.length > 0) throw new ConfigurationError(problems);
  return draft as unknown as RunnerConfig;
}
