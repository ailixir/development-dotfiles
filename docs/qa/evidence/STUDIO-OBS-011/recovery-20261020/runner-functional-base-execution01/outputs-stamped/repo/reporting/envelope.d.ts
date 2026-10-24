/**
 * The internal run envelope: the evidence and reporting metadata of one admitted run.
 *
 * Since STUDIO-OBS-012A AC-3 nothing on the wire is parsed into this type. `POST /v2/runs` accepts
 * the closed observed job (`replay-job` schema) and the coordinator projects it into a
 * `JobEnvelope` for the report, evidence and manifest paths; the artifact-1 envelope validator
 * (`validateEnvelope`, reference correspondence, `secretOrigins` canonicalisation) was deleted with
 * the artifact-1 run route. The callback destination is deployment configuration
 * (`STUDIO_RUNNER_CALLBACK_BASE_URL`); nothing in this type ever reaches a URL.
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
    readonly viewport: {
        readonly width: number;
        readonly height: number;
    };
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
    readonly configuration: JobConfiguration;
    readonly csi: string;
    readonly references: {
        readonly variables: readonly string[];
        readonly secrets: readonly string[];
    };
    /** Ephemeral. Never written to scratch, a retry buffer or a report body (AC-21). */
    readonly resolvedSecrets: Readonly<Record<string, string>>;
    readonly deadlines: JobDeadlines;
    /** Server-derived. The runner never invents or accepts an arbitrary key (architecture §8.4). */
    readonly videoKey: string;
    readonly manifestKey: string;
}
/**
 * The closed key set of the artifact-1 `RunJob` body, kept as data only.
 *
 * Nothing validates against it any more (STUDIO-OBS-012A AC-3). It survives because one guard
 * still reads it: AC-16b's gate-shut tripwire in `test/run/canary.test.ts`, which asserts no
 * destination-policy key was added to the job. (`test/contract.test.ts` now drives the observed
 * job and no longer imports it.)
 */
export declare const ACCEPTED_JOB_KEYS: Set<string>;
