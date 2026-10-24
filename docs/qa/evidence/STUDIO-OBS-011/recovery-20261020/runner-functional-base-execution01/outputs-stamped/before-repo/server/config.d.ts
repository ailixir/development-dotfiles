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
export declare const CONFIG_PREFIX = "STUDIO_RUNNER_";
/**
 * Destination classes the runner may talk to (AC-3, architecture §9.2). This list is the
 * complement to the dependency allowlist: the allowlist stops the runner linking a client, this
 * stops it being pointed somewhere new. There is no fourth entry and no key that would add one.
 */
export declare const PERMITTED_DESTINATIONS: readonly ["callback-api", "object-store", "target-page"];
export interface RunnerConfig {
    readonly observedValidationEnabled: boolean;
    readonly observedReplayEnabled: boolean;
    readonly observedCatalogFile: string;
    readonly observedPolicyFile: string;
    readonly observedImageDigest: string;
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
    /**
     * Explicit provider; remote deployment selects s3. `filesystem` (alias `local`) is for local
     * runs and for a shared volume.
     */
    readonly objectStoreProvider: 'filesystem' | 'local' | 's3';
    /** Persistent evidence directory, disjoint from scratch. */
    readonly objectStoreDir: string;
    readonly objectStoreBucket: string;
    readonly objectStoreRegion: string;
    /** S3-compatible (Sonic) endpoint. Empty selects the SDK's default AWS endpoint resolution. */
    readonly objectStoreEndpoint: string;
    readonly objectStoreForcePathStyle: boolean;
    /** Mounted directory with `accessKeyId`, `secretAccessKey` and optional `sessionToken`. */
    readonly objectStoreCredentialsDirectory: string;
    /** Explicit mounted credential files; an alternative to the directory above, never both. */
    readonly objectStoreAccessKeyIdFile: string;
    readonly objectStoreSecretAccessKeyFile: string;
    /** Attempts per object, the first included. Bounded on both axes with the window below. */
    readonly objectStoreMaxAttempts: number;
    /**
     * Wall-clock window for the **whole** evidence phase — video and manifest together.
     *
     * It sits between `reporter.settled()` and `runScratch.clear()`, which is the window the video
     * file exists in (story 10.14 AC-3, AC-5). Not inside the terminal delivery window: story 10.13
     * moved the scratch clear ahead of delivery on purpose, so the two are consecutive and disjoint.
     */
    readonly objectStoreWindowMs: number;
    /** Base backoff between attempts; linear, because the window is the real bound. */
    readonly objectStoreBackoffMs: number;
    /** Admission HTTP timeout; §8.5 starting value 10 s. */
    readonly admissionTimeoutMs: number;
    /** Bounded window for terminal delivery retries (AC-17). */
    readonly terminalDeliveryWindowMs: number;
    /** Maximum terminal delivery attempts, including the first (AC-17). */
    readonly terminalDeliveryMaxAttempts: number;
    /** Base backoff between terminal delivery attempts, before jitter (AC-17). */
    readonly terminalDeliveryBackoffMs: number;
    /** Wall-clock bound on one `POST /v2/validate-observed` call (AC-4); capped at 15 s there. */
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
    /**
     * The seek-origin calibration, in milliseconds (story 10.32, ADR-002 §26.3 items 2-4, O-20).
     *
     * Added to the run origin's monotonic zero inside `takeRunOrigin` (`src/run/timeline.ts`), so
     * every later step reading is this many milliseconds smaller. It corrects the
     * readiness-to-first-frame gap AC-12c leaves to staging. It never goes into the API contract
     * (§11.7 item 1) and never into a test bound. The only route to the child is the launch message.
     *
     * **The default is `0`, and this story sets no other value.** A non-zero value is per image and
     * comes only from **SPK-06 phase B** (`docs/architecture/studio-staging-spikes.md`), measured on
     * the pinned image in staging and recorded, with the measurements behind it, in
     * `docs/qa/spikes/SPK-06/` (§26.3 item 3). A laptop-derived value is forbidden (§26.3 item 5).
     *
     * **When a measured gap may be written here (§26.3 item 4).** Add the constant only if the
     * staging gap (a) has the same sign on every measured step and (b) has a median larger than its
     * run-to-run spread. Otherwise apply nothing and use SPK-06's fallback: report the measured
     * tolerance and state the calibration limit. No code checks this rule. The runner only ever sees
     * the one configured number, so the decision belongs to SPK-06 phase B and not to a runtime check.
     *
     * **No non-zero value may be applied until @architect rules on ESC-3.** Under a non-zero value
     * a reading taken within this many milliseconds of readiness is negative, against the contract's
     * `minimum: 0`, and `browserStartedAt` no longer names the instant the zero denotes.
     */
    readonly seekOriginCalibrationMs: number;
    /**
     * The **server limit** on total browser runtime (§5.2, §8.5 starting value 120 s).
     *
     * §5.2: total browser runtime is "configurable within server limits". The job envelope carries
     * `deadlines.totalRuntimeMs`, and the effective cap is `min(job, this)` — a job asking for less
     * gets less, a job asking for ten minutes gets this. Enumerated here rather than read from the
     * job so the fail-closed loader still owns every number the runner obeys (AC-6).
     */
    readonly maxTotalRuntimeMs: number;
    /**
     * The **server limit** on the per-step timeout: the per-step ceiling, fixed at the contract
     * maximum 120 s (aria-g-ruling01).
     *
     * `stepTimeoutMs` above is the default used when a job names none; this is the per-step ceiling
     * for a job's `configuration.timeoutSeconds`. Observed jobs above it are refused, never clamped.
     * The loader refuses a lower value.
     */
    readonly maxStepTimeoutMs: number;
    /** Outbound payload bounds (AC-19). */
    readonly maxReportSteps: number;
    readonly maxReportLogEntries: number;
    readonly maxReportLogEntryLength: number;
    readonly maxReportBodyBytes: number;
}
/** Every accepted fully-qualified environment variable name. */
export declare const ACCEPTED_KEYS: readonly string[];
/** Raised when configuration is rejected. Carries every problem, not just the first. */
export declare class ConfigurationError extends Error {
    readonly problems: readonly string[];
    constructor(problems: readonly string[]);
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
export declare function loadConfig(env: Readonly<Record<string, string | undefined>>): RunnerConfig;
/**
 * The evidence keys (STUDIO-OBS-013 AC-3, AR-1 R3/R13): the object store, the recording geometry
 * and the seek-origin calibration. The guided worker reads exactly these from the same enumerated
 * `STUDIO_RUNNER_*` namespace, so a guided recording uses the store, the size and the origin rule
 * replay uses and there is no second set of evidence settings. `SCRATCH_DIR` is included only so
 * the filesystem store keeps its disjointness rule.
 */
export declare const EVIDENCE_CONFIG_KEYS: readonly ["SCRATCH_DIR", "OBJECT_STORE_DIR", "OBJECT_STORE_PROVIDER", "OBJECT_STORE_ENDPOINT", "OBJECT_STORE_REGION", "OBJECT_STORE_BUCKET", "OBJECT_STORE_FORCE_PATH_STYLE", "OBJECT_STORE_CREDENTIALS_DIRECTORY", "OBJECT_STORE_ACCESS_KEY_ID_FILE", "OBJECT_STORE_SECRET_ACCESS_KEY_FILE", "OBJECT_STORE_MAX_ATTEMPTS", "OBJECT_STORE_WINDOW_MS", "OBJECT_STORE_BACKOFF_MS", "RECORDING_WIDTH", "RECORDING_HEIGHT", "SEEK_ORIGIN_CALIBRATION_MS"];
export type EvidenceConfig = Pick<RunnerConfig, 'scratchDir' | 'objectStoreDir' | 'objectStoreProvider' | 'objectStoreEndpoint' | 'objectStoreRegion' | 'objectStoreBucket' | 'objectStoreForcePathStyle' | 'objectStoreCredentialsDirectory' | 'objectStoreAccessKeyIdFile' | 'objectStoreSecretAccessKeyFile' | 'objectStoreMaxAttempts' | 'objectStoreWindowMs' | 'objectStoreBackoffMs' | 'recordingWidth' | 'recordingHeight' | 'seekOriginCalibrationMs'>;
/**
 * Loads only the {@link EVIDENCE_CONFIG_KEYS}, with the same specs, fallbacks and object-store
 * rules as {@link loadConfig}, and the same fail-closed refusal of an unenumerated key. Keys that
 * only the replay server needs (identities, callback URL) are neither required nor read here.
 *
 * @throws ConfigurationError on any problem, exactly as {@link loadConfig} does.
 */
export declare function loadEvidenceConfig(env: Readonly<Record<string, string | undefined>>): EvidenceConfig;
/**
 * The one listener's configuration (STUDIO-OBS-009 AC-3; ruling A3; drop D1.0 section 2.3).
 *
 * The paths are read once at startup by `readListenerMaterial` (`src/server/server.ts`); the
 * fingerprint is the SHA-256 of the backend's client certificate in the form Node prints it, and is
 * the only controller identity the listener pins (second factor: the service bearer).
 */
export interface ListenerConfig {
    readonly tlsKeyFile: string;
    readonly tlsCertFile: string;
    readonly tlsCaFile: string;
    readonly controllerCertificateFingerprint256: string;
}
/**
 * Loads only the four listener keys. All four are required in every deployment, guided or not: there
 * is no plaintext listener in any configuration. A problem names the key and never the value.
 *
 * @throws ConfigurationError on any problem, exactly as {@link loadConfig} does.
 */
export declare function loadListenerConfig(env: Readonly<Record<string, string | undefined>>): ListenerConfig;
/**
 * Guided mode as configuration of the one process (ruling A2.2). `enabled: false` carries nothing:
 * with the switch off, any guided key present is refused ("no half configuration"), so a disabled
 * runner never holds guided material.
 */
export type GuidedConfig = {
    readonly enabled: false;
} | {
    readonly enabled: true;
    /** Must equal the backend's `studio.guided-authoring.translation.worker-id`. */
    readonly workerId: string;
    readonly journalDirectory: string;
    readonly controllerIssuer: string;
    readonly controllerSubject: string;
    readonly controllerPublicKeyFile: string;
    /** Its own https-only key; never derived from the replay `CALLBACK_BASE_URL` (A2.2). */
    readonly callbackBaseUrl: string;
    readonly callbackTokenFile: string;
};
/** Whether `a` and `b` are the same path or one contains the other (lexical, after `resolve`). */
export declare function pathsOverlap(a: string, b: string): boolean;
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
export declare function loadGuidedConfig(env: Readonly<Record<string, string | undefined>>): GuidedConfig;
