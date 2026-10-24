import { isAbsolute, relative, resolve } from 'node:path';
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
export const PERMITTED_DESTINATIONS = ['callback-api', 'object-store', 'target-page'];
/**
 * The complete accepted surface. Adding a key here is the only way to add configuration, which
 * makes the review question "does this key give the runner a new credential or a new
 * destination?" a single-file question.
 */
const KEY_SPECS = {
    OBSERVED_VALIDATION_ENABLED: { field: 'observedValidationEnabled', kind: 'boolean', required: false, fallback: false },
    OBSERVED_REPLAY_ENABLED: { field: 'observedReplayEnabled', kind: 'boolean', required: false, fallback: false },
    OBSERVED_CATALOG_FILE: { field: 'observedCatalogFile', kind: 'string', required: false, fallback: '' },
    OBSERVED_POLICY_FILE: { field: 'observedPolicyFile', kind: 'string', required: false, fallback: '' },
    OBSERVED_IMAGE_DIGEST: { field: 'observedImageDigest', kind: 'string', required: false, fallback: '' },
    PORT: { field: 'port', kind: 'integer', required: false, fallback: 8080, min: 0, max: 65535 },
    HOST: { field: 'host', kind: 'string', required: false, fallback: '0.0.0.0' },
    POOL_SIZE: { field: 'poolSize', kind: 'integer', required: false, fallback: 1, min: 1 },
    INSTANCE_ID: { field: 'runnerInstanceId', kind: 'string', required: false },
    SERVICE_IDENTITY: { field: 'serviceIdentityToken', kind: 'string', required: true },
    CALLBACK_IDENTITY: { field: 'callbackIdentityToken', kind: 'string', required: true },
    CALLBACK_BASE_URL: { field: 'callbackBaseUrl', kind: 'string', required: true },
    SCRATCH_DIR: { field: 'scratchDir', kind: 'string', required: false, fallback: '/tmp/studio-runner' },
    OBJECT_STORE_DIR: {
        field: 'objectStoreDir',
        kind: 'string',
        required: false,
        fallback: '/tmp/studio-runner-objects',
    },
    OBJECT_STORE_PROVIDER: {
        field: 'objectStoreProvider',
        kind: 'string',
        required: false,
        fallback: 'filesystem',
    },
    OBJECT_STORE_ENDPOINT: {
        field: 'objectStoreEndpoint',
        kind: 'string',
        required: false,
        fallback: '',
    },
    OBJECT_STORE_REGION: {
        field: 'objectStoreRegion',
        kind: 'string',
        required: false,
        fallback: '',
    },
    OBJECT_STORE_BUCKET: {
        field: 'objectStoreBucket',
        kind: 'string',
        required: false,
        fallback: '',
    },
    OBJECT_STORE_FORCE_PATH_STYLE: {
        field: 'objectStoreForcePathStyle',
        kind: 'boolean',
        required: false,
        fallback: false,
    },
    OBJECT_STORE_CREDENTIALS_DIRECTORY: {
        field: 'objectStoreCredentialsDirectory',
        kind: 'string',
        required: false,
        fallback: '',
    },
    OBJECT_STORE_ACCESS_KEY_ID_FILE: {
        field: 'objectStoreAccessKeyIdFile',
        kind: 'string',
        required: false,
        fallback: '',
    },
    OBJECT_STORE_SECRET_ACCESS_KEY_FILE: {
        field: 'objectStoreSecretAccessKeyFile',
        kind: 'string',
        required: false,
        fallback: '',
    },
    OBJECT_STORE_MAX_ATTEMPTS: {
        field: 'objectStoreMaxAttempts',
        kind: 'integer',
        required: false,
        fallback: 3,
        min: 1,
    },
    OBJECT_STORE_WINDOW_MS: {
        field: 'objectStoreWindowMs',
        kind: 'integer',
        required: false,
        fallback: 15_000,
        min: 1,
    },
    OBJECT_STORE_BACKOFF_MS: {
        field: 'objectStoreBackoffMs',
        kind: 'integer',
        required: false,
        fallback: 250,
        min: 0,
    },
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
    // ADR-002 §26.3 item 3: a per-image setting whose default is `0`. See the field's documentation
    // for the rule that decides when a measured value may replace it.
    SEEK_ORIGIN_CALIBRATION_MS: {
        field: 'seekOriginCalibrationMs',
        kind: 'integer',
        required: false,
        fallback: 0,
        min: 0,
    },
    // The two server limits a job is clamped to (§5.2 "configurable within server limits", AC-6).
    // They go through `KEY_SPECS` like everything else, so the loader stays fail-closed and there is
    // no way to raise a maximum that is not an enumerated key.
    MAX_TOTAL_RUNTIME_MS: {
        field: 'maxTotalRuntimeMs',
        kind: 'integer',
        required: false,
        fallback: 120_000,
        min: 1,
    },
    // Equal to the authoring/contract maximum (timeoutSeconds ≤ 120, openapi TestConfiguration, v3
    // replay-profile). Observed jobs bind timeoutSeconds into configurationHash, so the runner refuses
    // (LIMIT_EXCEEDED) rather than clamps; a ceiling below the contract maximum would make published
    // tests unrunnable (STUDIO-OBS-015 G, aria-g-ruling01). The total-runtime cap, not this key,
    // bounds a run.
    MAX_STEP_TIMEOUT_MS: {
        field: 'maxStepTimeoutMs',
        kind: 'integer',
        required: false,
        fallback: 120_000,
        min: 120_000,
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
    // ── The one listener (STUDIO-OBS-009 AC-1, AC-3; ruling A3; drop D1.0 section 2.3). ──────────
    // Required in every deployment, guided or not: there is no plaintext listener in any
    // configuration. They are validated by `loadListenerConfig`, not by `loadConfig`, so the
    // replay-only configuration tests keep their minimal environment.
    TLS_KEY_FILE: { field: 'tlsKeyFile', kind: 'string', required: true },
    TLS_CERT_FILE: { field: 'tlsCertFile', kind: 'string', required: true },
    TLS_CA_FILE: { field: 'tlsCaFile', kind: 'string', required: true },
    CONTROLLER_CERTIFICATE_FINGERPRINT256: {
        field: 'controllerCertificateFingerprint256',
        kind: 'string',
        required: true,
    },
    // ── Guided mode is configuration of this one process (ruling A2.2). ──────────────────────────
    // The switch is the only key with a default. Every other `GUIDED_*` key is required when it is
    // true and refused when it is not (`loadGuidedConfig`). There is no capacity key (code constant
    // 1, A2.3) and no policy-hash key (context-bound, A2.4).
    GUIDED_ENABLED: { field: 'guidedEnabled', kind: 'boolean', required: false, fallback: false },
    GUIDED_WORKER_ID: { field: 'workerId', kind: 'string', required: false },
    GUIDED_JOURNAL_DIR: { field: 'journalDirectory', kind: 'string', required: false },
    GUIDED_CONTROLLER_ISSUER: { field: 'controllerIssuer', kind: 'string', required: false },
    GUIDED_CONTROLLER_SUBJECT: { field: 'controllerSubject', kind: 'string', required: false },
    GUIDED_CONTROLLER_PUBLIC_KEY_FILE: {
        field: 'controllerPublicKeyFile',
        kind: 'string',
        required: false,
    },
    GUIDED_CALLBACK_BASE_URL: { field: 'callbackBaseUrl', kind: 'string', required: false },
    GUIDED_CALLBACK_TOKEN_FILE: { field: 'callbackTokenFile', kind: 'string', required: false },
};
/** The four listener keys (every deployment). Parsed by {@link loadListenerConfig} only. */
const LISTENER_SUFFIXES = [
    'TLS_KEY_FILE',
    'TLS_CERT_FILE',
    'TLS_CA_FILE',
    'CONTROLLER_CERTIFICATE_FINGERPRINT256',
];
/** The switch. Not a "guided key": the guided keys are every other `GUIDED_` name. */
const GUIDED_SWITCH = 'GUIDED_ENABLED';
/**
 * The guided keys: exactly the names that start `GUIDED_`, other than the switch. A prefix test
 * rather than a list, so "when false, any guided key present is refused" cannot drift from the
 * table above.
 */
const GUIDED_KEY_SUFFIXES = Object.keys(KEY_SPECS).filter((suffix) => suffix.startsWith('GUIDED_') && suffix !== GUIDED_SWITCH);
/** The keys `loadConfig` parses: the replay server's own, before the listener and guided sets. */
const RUNNER_SUFFIXES = Object.keys(KEY_SPECS).filter((suffix) => !LISTENER_SUFFIXES.includes(suffix) && !suffix.startsWith('GUIDED_'));
/** Every accepted fully-qualified environment variable name. */
export const ACCEPTED_KEYS = Object.keys(KEY_SPECS)
    .map((suffix) => `${CONFIG_PREFIX}${suffix}`)
    .sort();
/** Raised when configuration is rejected. Carries every problem, not just the first. */
export class ConfigurationError extends Error {
    problems;
    constructor(problems) {
        super(`Runner configuration rejected:\n  - ${problems.join('\n  - ')}`);
        this.name = 'ConfigurationError';
        this.problems = problems;
    }
}
/** A generated instance id when none is configured; stable for the life of the process (AC-7). */
function generateInstanceId() {
    return `runner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function parseInteger(name, raw, min, problems, max) {
    if (!/^\d+$/u.test(raw.trim())) {
        problems.push(`${name} must be a non-negative integer; got ${JSON.stringify(raw)}.`);
        return min;
    }
    const value = Number(raw.trim());
    if (value < min) {
        problems.push(`${name} must be >= ${String(min)}; got ${String(value)}.`);
        return min;
    }
    if (max !== undefined && value > max) {
        problems.push(`${name} must be <= ${String(max)}; got ${String(value)}.`);
        return min;
    }
    return value;
}
function parseBoolean(name, raw, problems) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true')
        return true;
    if (normalized === 'false')
        return false;
    problems.push(`${name} must be true or false; got ${JSON.stringify(raw)}.`);
    return false;
}
/** Fail closed on the unknown key: every `STUDIO_RUNNER_*` name must be enumerated. */
function refuseUnknownKeys(env, problems) {
    // This is the clause that catches the driver nobody predicted: it does not ask what the key
    // *is*, only whether it was enumerated.
    const unknown = Object.keys(env)
        .filter((key) => key.startsWith(CONFIG_PREFIX))
        .filter((key) => !(key.slice(CONFIG_PREFIX.length) in KEY_SPECS))
        .sort();
    for (const key of unknown) {
        problems.push(`${key} is not a configuration key this runner accepts. The runner holds no database, ` +
            'vault, CSI or LLM credential (architecture §9.2); an unrecognised key in its namespace ' +
            'is refused rather than ignored. Accepted keys: ' +
            ACCEPTED_KEYS.join(', '));
    }
}
/** Reads the enumerated keys named by `suffixes` through their one {@link KEY_SPECS} entry. */
function parseKeys(env, suffixes, problems) {
    const draft = {};
    for (const suffix of suffixes) {
        const spec = KEY_SPECS[suffix];
        if (spec === undefined)
            throw new Error(`Unenumerated configuration key ${suffix}.`);
        const name = `${CONFIG_PREFIX}${suffix}`;
        const raw = env[name];
        const provided = raw !== undefined && raw.trim() !== '';
        if (!provided) {
            if (spec.required) {
                problems.push(`${name} is required and was not provided.`);
                continue;
            }
            if (spec.fallback !== undefined)
                draft[spec.field] = spec.fallback;
            continue;
        }
        draft[spec.field] =
            spec.kind === 'integer'
                ? parseInteger(name, raw, spec.min ?? 0, problems, spec.max)
                : spec.kind === 'boolean'
                    ? parseBoolean(name, raw, problems)
                    : raw.trim();
    }
    return draft;
}
/** The object-store rules, shared by the replay runner and the guided worker (one source). */
function validateObjectStore(draft, problems) {
    const objectStoreProvider = draft.objectStoreProvider;
    if (objectStoreProvider !== 'filesystem' && objectStoreProvider !== 'local' && objectStoreProvider !== 's3') {
        problems.push(`${CONFIG_PREFIX}OBJECT_STORE_PROVIDER must be filesystem or s3 (local is an alias of filesystem); got ${JSON.stringify(objectStoreProvider)}.`);
    }
    if (objectStoreProvider === 's3') {
        if (!draft.objectStoreBucket || !draft.objectStoreRegion) {
            problems.push(`S3 requires ${CONFIG_PREFIX}OBJECT_STORE_BUCKET and ${CONFIG_PREFIX}OBJECT_STORE_REGION.`);
        }
        if (typeof draft.objectStoreEndpoint === 'string' && draft.objectStoreEndpoint !== '') {
            validateObjectStoreEndpoint(draft.objectStoreEndpoint, problems);
        }
        const accessKeyIdFile = draft.objectStoreAccessKeyIdFile !== '';
        const secretAccessKeyFile = draft.objectStoreSecretAccessKeyFile !== '';
        if (accessKeyIdFile !== secretAccessKeyFile) {
            problems.push(`${CONFIG_PREFIX}OBJECT_STORE_ACCESS_KEY_ID_FILE and ${CONFIG_PREFIX}OBJECT_STORE_SECRET_ACCESS_KEY_FILE must be set together.`);
        }
        if (accessKeyIdFile && draft.objectStoreCredentialsDirectory !== '') {
            problems.push(`${CONFIG_PREFIX}OBJECT_STORE_CREDENTIALS_DIRECTORY and the explicit credential files are mutually exclusive.`);
        }
    }
    if (objectStoreProvider === 'filesystem' || objectStoreProvider === 'local') {
        const scratch = resolve(String(draft.scratchDir));
        const objects = resolve(String(draft.objectStoreDir));
        const contains = (parent, child) => {
            const rel = relative(parent, child);
            return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
        };
        if (contains(scratch, objects) || contains(objects, scratch)) {
            problems.push('Object storage and scratch directories must be disjoint; scratch is deleted on restart.');
        }
    }
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
export function loadConfig(env) {
    const problems = [];
    refuseUnknownKeys(env, problems);
    const draft = parseKeys(env, RUNNER_SUFFIXES, problems);
    // Stable for the life of the process either way (AC-7): configured when the deployment names
    // the instance, generated once here when it does not.
    if (typeof draft.runnerInstanceId !== 'string' || draft.runnerInstanceId === '') {
        draft.runnerInstanceId = generateInstanceId();
    }
    const callbackBaseUrl = draft.callbackBaseUrl;
    if (typeof callbackBaseUrl === 'string') {
        let parsed = null;
        try {
            parsed = new URL(callbackBaseUrl);
        }
        catch {
            parsed = null;
        }
        if (parsed === null) {
            problems.push(`${CONFIG_PREFIX}CALLBACK_BASE_URL is not an absolute URL.`);
        }
        else if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '') {
            // AC-3: no credential in a URL or query string, ever — not even the configured one.
            problems.push(`${CONFIG_PREFIX}CALLBACK_BASE_URL must carry no userinfo and no query string; ` +
                'credentials travel in headers (AC-3, architecture §9.2).');
        }
    }
    validateObjectStore(draft, problems);
    if (problems.length > 0)
        throw new ConfigurationError(problems);
    return draft;
}
/**
 * The evidence keys (STUDIO-OBS-013 AC-3, AR-1 R3/R13): the object store, the recording geometry
 * and the seek-origin calibration. The guided worker reads exactly these from the same enumerated
 * `STUDIO_RUNNER_*` namespace, so a guided recording uses the store, the size and the origin rule
 * replay uses and there is no second set of evidence settings. `SCRATCH_DIR` is included only so
 * the filesystem store keeps its disjointness rule.
 */
export const EVIDENCE_CONFIG_KEYS = [
    'SCRATCH_DIR',
    'OBJECT_STORE_DIR',
    'OBJECT_STORE_PROVIDER',
    'OBJECT_STORE_ENDPOINT',
    'OBJECT_STORE_REGION',
    'OBJECT_STORE_BUCKET',
    'OBJECT_STORE_FORCE_PATH_STYLE',
    'OBJECT_STORE_CREDENTIALS_DIRECTORY',
    'OBJECT_STORE_ACCESS_KEY_ID_FILE',
    'OBJECT_STORE_SECRET_ACCESS_KEY_FILE',
    'OBJECT_STORE_MAX_ATTEMPTS',
    'OBJECT_STORE_WINDOW_MS',
    'OBJECT_STORE_BACKOFF_MS',
    'RECORDING_WIDTH',
    'RECORDING_HEIGHT',
    'SEEK_ORIGIN_CALIBRATION_MS',
];
/**
 * Loads only the {@link EVIDENCE_CONFIG_KEYS}, with the same specs, fallbacks and object-store
 * rules as {@link loadConfig}, and the same fail-closed refusal of an unenumerated key. Keys that
 * only the replay server needs (identities, callback URL) are neither required nor read here.
 *
 * @throws ConfigurationError on any problem, exactly as {@link loadConfig} does.
 */
export function loadEvidenceConfig(env) {
    const problems = [];
    refuseUnknownKeys(env, problems);
    const draft = parseKeys(env, EVIDENCE_CONFIG_KEYS, problems);
    validateObjectStore(draft, problems);
    if (problems.length > 0)
        throw new ConfigurationError(problems);
    return draft;
}
/** 32 upper-case hex byte pairs joined by `:` (`X509Certificate.fingerprint256`). Nothing is normalised. */
const FINGERPRINT_256 = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/u;
/**
 * Loads only the four listener keys. All four are required in every deployment, guided or not: there
 * is no plaintext listener in any configuration. A problem names the key and never the value.
 *
 * @throws ConfigurationError on any problem, exactly as {@link loadConfig} does.
 */
export function loadListenerConfig(env) {
    const problems = [];
    refuseUnknownKeys(env, problems);
    const draft = parseKeys(env, LISTENER_SUFFIXES, problems);
    for (const suffix of ['TLS_KEY_FILE', 'TLS_CERT_FILE', 'TLS_CA_FILE']) {
        const value = draft[KEY_SPECS[suffix]?.field ?? ''];
        if (typeof value === 'string' && !isAbsolute(value)) {
            problems.push(`${CONFIG_PREFIX}${suffix} must be an absolute path.`);
        }
    }
    const fingerprint = draft.controllerCertificateFingerprint256;
    if (typeof fingerprint === 'string' && !FINGERPRINT_256.test(fingerprint)) {
        problems.push(`${CONFIG_PREFIX}CONTROLLER_CERTIFICATE_FINGERPRINT256 must be 32 upper-case hex byte pairs joined by ':' (the form Node prints).`);
    }
    if (problems.length > 0)
        throw new ConfigurationError(problems);
    return draft;
}
function isHttpsOriginOnly(raw) {
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' && url.username === '' && url.password === '' && url.search === '' && url.hash === '';
    }
    catch {
        return false;
    }
}
/** Whether `a` and `b` are the same path or one contains the other (lexical, after `resolve`). */
export function pathsOverlap(a, b) {
    const contains = (parent, child) => {
        const rel = relative(parent, child);
        return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    };
    return contains(a, b) || contains(b, a);
}
/**
 * Loads only the guided keys. Cross-field rules, all fail-closed:
 *
 * 1. the switch true: every guided key is required;
 * 2. the switch false or absent: any non-empty `STUDIO_RUNNER_GUIDED_*` key is refused;
 * 3. the journal directory is disjoint from `SCRATCH_DIR` and `OBJECT_STORE_DIR` (scratch is cleared
 *    at every start, which would erase the journal; `main` repeats the test after `realpath`);
 * 4. the guided callback URL is https with no userinfo, query or fragment (checked here, at
 *    startup, rather than at the first callback).
 *
 * @throws ConfigurationError on any problem, exactly as {@link loadConfig} does.
 */
export function loadGuidedConfig(env) {
    const problems = [];
    refuseUnknownKeys(env, problems);
    const switchDraft = parseKeys(env, [GUIDED_SWITCH], problems);
    const present = (suffix) => {
        const raw = env[`${CONFIG_PREFIX}${suffix}`];
        return raw !== undefined && raw.trim() !== '';
    };
    if (switchDraft.guidedEnabled !== true) {
        for (const suffix of GUIDED_KEY_SUFFIXES) {
            if (present(suffix)) {
                problems.push(`${CONFIG_PREFIX}${suffix} is set but ${CONFIG_PREFIX}${GUIDED_SWITCH} is not true; a guided key without the switch is refused.`);
            }
        }
        if (problems.length > 0)
            throw new ConfigurationError(problems);
        return { enabled: false };
    }
    const draft = parseKeys(env, GUIDED_KEY_SUFFIXES, problems);
    for (const suffix of GUIDED_KEY_SUFFIXES) {
        if (!present(suffix)) {
            problems.push(`${CONFIG_PREFIX}${suffix} is required when ${CONFIG_PREFIX}${GUIDED_SWITCH} is true.`);
        }
    }
    const text = (field) => {
        const value = draft[field];
        return typeof value === 'string' ? value : '';
    };
    const workerId = text('workerId');
    if (workerId !== '' && workerId.length > 256) {
        problems.push(`${CONFIG_PREFIX}GUIDED_WORKER_ID must be at most 256 characters.`);
    }
    if (text('controllerSubject').length > 256) {
        problems.push(`${CONFIG_PREFIX}GUIDED_CONTROLLER_SUBJECT must be at most 256 characters.`);
    }
    for (const suffix of ['GUIDED_JOURNAL_DIR', 'GUIDED_CONTROLLER_PUBLIC_KEY_FILE', 'GUIDED_CALLBACK_TOKEN_FILE']) {
        const value = text(KEY_SPECS[suffix]?.field ?? '');
        if (value !== '' && !isAbsolute(value))
            problems.push(`${CONFIG_PREFIX}${suffix} must be an absolute path.`);
    }
    const callbackBaseUrl = text('callbackBaseUrl');
    if (callbackBaseUrl !== '' && !isHttpsOriginOnly(callbackBaseUrl)) {
        problems.push(`${CONFIG_PREFIX}GUIDED_CALLBACK_BASE_URL must be an absolute https URL with no userinfo, query or fragment.`);
    }
    const journal = text('journalDirectory');
    if (journal !== '' && isAbsolute(journal)) {
        const roots = parseKeys(env, ['SCRATCH_DIR', 'OBJECT_STORE_DIR'], []);
        for (const [name, root] of [['SCRATCH_DIR', roots.scratchDir], ['OBJECT_STORE_DIR', roots.objectStoreDir]]) {
            if (typeof root === 'string' && pathsOverlap(resolve(journal), resolve(root))) {
                problems.push(`${CONFIG_PREFIX}GUIDED_JOURNAL_DIR must be disjoint from ${CONFIG_PREFIX}${name}; scratch is deleted on restart.`);
            }
        }
    }
    if (problems.length > 0)
        throw new ConfigurationError(problems);
    return {
        enabled: true,
        workerId,
        journalDirectory: journal,
        controllerIssuer: text('controllerIssuer'),
        controllerSubject: text('controllerSubject'),
        controllerPublicKeyFile: text('controllerPublicKeyFile'),
        callbackBaseUrl,
        callbackTokenFile: text('callbackTokenFile'),
    };
}
function validateObjectStoreEndpoint(endpoint, problems) {
    try {
        const parsed = new URL(endpoint);
        const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
        if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
            problems.push(`${CONFIG_PREFIX}OBJECT_STORE_ENDPOINT must use https (http is allowed only for loopback tests).`);
        }
        if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
            problems.push(`${CONFIG_PREFIX}OBJECT_STORE_ENDPOINT must carry no credentials, query string, or fragment.`);
        }
    }
    catch {
        problems.push(`${CONFIG_PREFIX}OBJECT_STORE_ENDPOINT must be an absolute URL.`);
    }
}
//# sourceMappingURL=config.js.map