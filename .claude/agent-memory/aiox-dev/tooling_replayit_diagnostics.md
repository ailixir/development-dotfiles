---
name: tooling-replayit-diagnostics
description: GuidedPublicationReplayIT / GuidedPlanningIntegrationTest diagnosis aids - order dependencies, failed-test state files, TRACE capture cost, budget metrics file
metadata:
  type: project
---

Learned in STUDIO-OBS-012A baseline-residual lane (2026-10-13):

1. ReplayIT uses `@TestMethodOrder(OrderAnnotation)`. Order(1) `actualLearningPublishesWithoutEffects...` registers CSI-123 and the fixture user; a single later case run alone fails with `ui_tests_csi_id_fkey`. Always include the Order(1) case when rerunning one case.
2. A failed ReplayIT case writes `failed-test-state-*.json`, `failed-test-cleanup-*.json`, `c5-numeric-evidence.json` and `guided.log` into `$TMPDIR/obs007-joined-<n>/` (path printed in the assertion text). These give session state, action ledger, model attempts and C5 grant timing without adding prints.
3. One failed case with unconfirmed teardown latches `cleanupUnconfirmed`; every later case fails at BeforeEach line ~1265 in 0.2 s. Count those as cascade, then rerun them without the first failure.
4. C5 capture sets ROOT logging to TRACE and streams the output through a synchronized canary scanner (about 200 MB per pool case). Before the 05:15 SecretMasker linearization (2026-10-13), this ate the 30 s production replay-grant TTL (`AUTHORIZATION_EXPIRED` mapped to `AUTHORIZATION_REVOKED`).
   - After it, JFR measured the grant age at the final check at about 11.4 s under load 5-7.
   - The volume source is networknt's DEBUG `validate(...)` call. The cost is SecretMasker (about 73%) plus the scanner (about 22%). See [[tooling-jfr-attribution]].
   - The result still depends on load.
5. GuidedPlanningIntegrationTest writes `/tmp/studio-obs005-joined-metrics.json` on success. The 2026-10-09 file (pre-OBS-007 contract hash 60d57376...) shows 8 proposals = 121589 reserved input bytes against the 128000 ceiling.

6. Before calling a long ReplayIT case a flake, check for host sleep: `pmset -g log | grep -E '\b(Sleep|DarkWake)\b'` over the case window (case start = suite timestamp + earlier case times). On 2026-10-13 the laptop idle-slept 11:03-13:20Z during root's full check: Vault-outage took 1771 s; Java nanoTime and Node timers stall in sleep, wall-clock TTLs do not. `pmset -g assertions` shows whether caffeinate is holding the machine awake.
7. On macOS JDK 21, `ProcessHandle.destroyForcibly()` returns true for a zombie and false once the pid is reaped. Chromium children exit by themselves when the primary browser is killed, so "kill refused" right after an isAlive check is usually the reap race (C6 kind 3, fixed 2026-10-13 with `p8KillRefusedWhileAlive`).

8. Since R8 (2026-10-13), `ordinary.log` `run.cancel_requested` carries `source` + `recorded`. `source:"control-window", recorded:false` = the runner missed a 1 s secret control window itself (load/stall), not a cancel anyone requested. Grep it first when a secret case ends CANCELLED unexpectedly.
9. C6 kind 1 (`actualPublishedNativePasswordStepDeadlinePreservesUnknownEffect`) is the most load-sensitive case: under load ~7 (Zoom + replayd) it failed 2 of 5 full runs by two different mechanisms (post-Ready control-window miss; preload producer ACK `sent 4/acked 3 failed:true`), and passed in isolation (Order 1 + kind 1, ~1.5 min) twice. Full class ~17-19 min. Budget for an extra full run when "2 consecutive green" is the gate.

10. The runner log does not record a FINAL's errorCode/errorMessage. The class TEMP keeps the runner's object store, though: `objects/studio/<csi>/<test>/<execution>/<attempt>.result.json` has outcome, errorCode, errorMessage, browserStartedAt and endedAt. On 2026-10-13 (dex-r10) it showed that r8 C-run3 kind 1 was RUN_ERROR/INTERNAL_ERROR, not the TIMEOUT the architect had inferred. failed-test-state `elapsed_ms` (ended_at - started_at) tells a short pre-Ready end apart from a launch-wait expiry.

11. Scratch-only runner tap that worked (dex-r10, 2026-10-13; scripts in scratchpad/dex-r10):
   - Init script: exclude the repo IT from compileTestJava by absolute path and `source()` a patched scratch copy.
   - The child is forked via an entry named `recorded-child.mjs.<x>.mjs`. The test finds its child by a command-line substring.
   - The entry calls `module.register` with a load hook that rewrites dist `childRuntime.js` in memory only. `browser.js` is the hashed file, so leave it alone.
   - Never add `process.on('message')` in a child preload: the first listener starts IPC reading and swallows the launch frame.
   - Wrapping the spawner `handle.kill` with a stack tells the protocol-violation kill apart from the performStop kill.

12. Since R10-rev2 (dex-r10b, 2026-10-13), the class TEMP holds permanent value-free IPC attribution:
   - `ordinary-ipc-parent.jsonl` has one line per ordinary child: kinds received, result code and Result3 schema-valid, kill labels (`violation-catch` / `performStop-grace` / `other`), exit, loop delay, and per-read `controlReads` `[ms, stall, publishOverlap, killOverlap]`.
   - `ordinary-ipc-child.jsonl` has readySent, resultSent and the result code.
   - The producer-2 sample now has +7 I2 keys.
   - Read these first for a C6 INTERNAL_ERROR or control-window miss. Clean runs showed kind-1 read max 32-44 ms once the producer-2 publish went async.
13. Pre-check JS changes in the Java text blocks without running the IT: emulate text blocks in Python (strip indentation, `\<newline>` joins, `\\` becomes `\`, then `.formatted`) and run `node --check`. Byte-compare producers 1/3 against the pre-edit file. Scripts: `scratchpad/dex-r10b/jsgen.py` and `smoke.py`.

**Why:** these took hours to rediscover. Concurrent lanes load the machine, so timing-bound cases look like flakes.

**How to apply:** use them before adding temporary DIAG prints, and label load-sensitive results as such. Related: [[tooling-gradle-focused-runs]].
