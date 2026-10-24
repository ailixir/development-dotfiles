/**
 * Public surface of the studio runner package.
 *
 * Story 10.6 added the internal HTTP server and the admission/reporting clients; the observed
 * replay family (`/v2/validate-observed`, `/v2/runs`) is served behind the same seams. The
 * artifact-1 validator, executor and compatibility check were deleted by STUDIO-OBS-012A AC-3,
 * and with them the artifact-1 version constants this entry used to re-export.
 */
export * from './executor/index.js';
export * from './compat/index.js';
export * from './server/index.js';
export * from './reporting/index.js';
//# sourceMappingURL=index.js.map