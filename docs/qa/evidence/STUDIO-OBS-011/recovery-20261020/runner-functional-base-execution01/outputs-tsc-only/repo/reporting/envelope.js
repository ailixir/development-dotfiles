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
/**
 * The closed key set of the artifact-1 `RunJob` body, kept as data only.
 *
 * Nothing validates against it any more (STUDIO-OBS-012A AC-3). It survives because one guard
 * still reads it: AC-16b's gate-shut tripwire in `test/run/canary.test.ts`, which asserts no
 * destination-policy key was added to the job. (`test/contract.test.ts` now drives the observed
 * job and no longer imports it.)
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
    'referencePolicy',
    'secretOrigins',
]);
//# sourceMappingURL=envelope.js.map