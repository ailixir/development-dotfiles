/**
 * The run surface (ADR-001 §3: `src/run/` is 10.12/10.13).
 *
 * The real browser launch, the killable child, the recording lifecycle, the run-scoped clock and
 * the runner error-code set. `src/run/browser.ts` is the only module
 * that imports Playwright and is **not** re-exported here: nothing outside the child needs it,
 * and an export is an invitation.
 */
export { createChildBrowserLauncher, createForkSpawner, assertNoCodeLoadingKeys, isCodeLoadingEnvKey, CODE_LOADING_ENV_PREFIXES, INHERITED_ENV_KEYS, DEFAULT_CHILD_MODULE_PATH } from './launcher.js';
export { RUNNER_ERROR_CODES, RUNNER_ERROR_CODE_VALUES, RUN_FAILURE_KINDS, errorCodeFor, resultFor, } from './errors.js';
export { takeRunOrigin, systemOriginSource } from './timeline.js';
export { evidenceFor, hasWebmHeader, MIN_PLAYABLE_RECORDING_BYTES, WEBM_MAGIC, } from './recording.js';
export { isSandboxFailure, SANDBOX_DISABLING_FLAG_SUFFIXES } from './sandbox.js';
export { canEnumerateProcessTree, readProcessTable } from './tree.js';
export { SCRATCH_SUBDIRECTORIES } from './scratchLayout.js';
export { attachChildRuntime } from './childRuntime.js';
//# sourceMappingURL=index.js.map