/**
 * AC-11a, AC-12, AC-13, AC-16 and AC-7a — the deferred halves, recorded as live skips.
 *
 * The observed cases in this file drove the artifact-1 launch (a legacy launch message and an
 * operation list) against real pinned Chromium and enumerated the process tree afterwards. That
 * launch path was deleted by STUDIO-OBS-012A AC-3 and the cases with it. The observed launcher's
 * process tree is enumerated against real Chromium in
 * `test/fixtures-tier/observed-bootstrap-process-tree.test.ts`, and its kill, grace and drain
 * paths are composed at the spawn seam in `test/server/cancel.test.ts`,
 * `test/server/deadline-outcome.test.ts` and `test/server/hung-child.test.ts`.
 */
import { describe, it } from 'vitest';

// ── Deferrals: recorded as live skips naming their owners, never as passes ────────────────────

describe('deferred criteria — skipped, not passed', () => {
  it.skip('AC-5b — the runner total sits inside the API recovery deadline (story 10.19, gated with 10.18)', () => {
    // The runner's cap plus the stop grace plus the terminal delivery window must be demonstrated
    // to fit inside the API's §5.4 recovery deadline **against the deployed configuration**, so a
    // run this story kills is reconciled from its own `FINAL` rather than racing the running
    // reaper into `ERROR / STALE`. Locally this story asserts the arithmetic against its own
    // configured values and nothing more; the deployed values are 10.18's and the integrated proof
    // is 10.19's. Skipped, never passed.
  });

  it.skip('AC-7b — nothing the API persists carries the canary (story 10.19, with 10.17)', () => {
    // Progress rows, the persisted snapshot, structured log storage and the terminal result
    // manifest — 10.14's object and 10.17's real secret material. The runner can only assert on
    // what leaves it, which AC-7a does; the other half needs the API and a vault. Skipped, never
    // passed.
  });

  it.skip('AC-11b — the six paths inside the pinned image under PID-1 reaping (ED-05 / story 10.18)', () => {
    // `readOnlyRootFilesystem: true`, `emptyDir` scratch, `emptyDir{medium: Memory}` /dev/shm, and
    // zombie reaping by the image's entry point (§9.3). Reaping is a property of the image, not of
    // this package: a developer machine cannot create the condition and this story does not claim
    // it. Skipped, never passed.
    //
    // **Which of the six paths this file observes, and which it composes** (QA MED-1). Two are
    // observed here by enumerating real pids: **success** and the **runtime-deadline kill**. Three
    // more — step failure, run fault and drain — reach the *identical* `child.kill()` in
    // `src/run/launcher.ts`, which is the `signalProcessTree` call the two observed paths prove,
    // so composing them from the unit tier's `child.killed` / `pool.inUse` / `scratch.list()`
    // assertions is sound.
    //
    // **The launch-failure path is the exception and is named rather than implied.** It has no
    // `session.run` at all: `launcher.launch` throws before it returns, the coordinator's
    // `RunFailure` propagates before `terminate` is ever registered, and the tree is reaped
    // through the launch-timeout branch — `child.kill()` inside `launch`, reached from
    // `awaitReady` expiring rather than from a deadline. It therefore does **not** compose from
    // the two observed paths: it is a different call site with a different trigger, proven today
    // only in the unit tier (`test/run/launcher.test.ts`, the `BROWSER_LAUNCH_FAILED` cases) and
    // never by pid observation against a real browser. Whoever closes AC-11b in the image should
    // drive it explicitly rather than assume it is covered.
  });

});
