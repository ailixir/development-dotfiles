/**
 * The run surface (ADR-001 §3: `src/run/` is 10.12/10.13).
 *
 * The real browser launch, the killable child, the Playwright adapter, the recording lifecycle,
 * the run-scoped clock and the runner error-code set. `src/run/browser.ts` is the only module
 * that imports Playwright and is **not** re-exported here: nothing outside the child needs it,
 * and an export is an invitation.
 */
export { createChildBrowserLauncher, createChildOwnedAdapter, createForkSpawner, assertNoCodeLoadingKeys, isCodeLoadingEnvKey, CODE_LOADING_ENV_PREFIXES, INHERITED_ENV_KEYS, DEFAULT_CHILD_MODULE_PATH, LaunchFailure } from './launcher.js';
export type {
  ChildLauncherOptions,
  ChildProcessHandle,
  ChildSpawner,
  ChildSpawnRequest,
} from './launcher.js';
export {
  RUNNER_ERROR_CODES,
  RUNNER_ERROR_CODE_VALUES,
  RUN_FAILURE_KINDS,
  errorCodeFor,
  resultFor,
} from './errors.js';
export type { RunFailureKind, RunFailureResult, RunnerErrorCode } from './errors.js';
export { takeRunOrigin, systemOriginSource, takeProcessOriginForFalsification } from './timeline.js';
export type { OriginSource, RunOrigin } from './timeline.js';
export {
  evidenceFor,
  hasWebmHeader,
  MIN_PLAYABLE_RECORDING_BYTES,
  WEBM_MAGIC,
} from './recording.js';
export type { RecordingObservation, RecordingOutcome, RunnerEvidenceState } from './recording.js';
export { isSandboxFailure, SANDBOX_DISABLING_FLAG_SUFFIXES } from './sandbox.js';
export { canEnumerateProcessTree, readProcessTable } from './tree.js';
export type { ProcessRow } from './tree.js';
export { SCRATCH_SUBDIRECTORIES } from './scratchLayout.js';
export {
  PROTOCOL_CODES,
  PROTOCOL_VERSION,
  SOURCE_SHAPED_KEYS,
  parseChildMessage,
  parseExecuteMessage,
  parseLaunchMessage,
} from './protocol.js';
export type {
  ChildMessage,
  ExecuteMessage,
  LaunchMessage,
  ParentMessage,
  ProtocolStep,
} from './protocol.js';
export { attachChildRuntime, failureKindOf } from './childRuntime.js';
export type { ChildChannel, ChildRuntimeDependencies } from './childRuntime.js';
export { createPlaywrightAdapter, compileMatcher } from './playwrightAdapter.js';
export type { LocatorLike, PageLike, QueryRoot } from './playwrightAdapter.js';
export type { BrowserFactory, BrowserHandle, BrowserLaunchRequest } from './browserFactory.js';
