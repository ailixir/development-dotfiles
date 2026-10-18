# STUDIO-OBS-015 final `check` attempt02: failure diagnosis (Dex-D8)

Scope: read-only on backend/, frontend/, studio-runner/, tools/, docs/specs/, .github/. No Gradle, no signals. Evidence copied to `raw/`. Labels: **verified** = read or ran it; **inferred** = reasoning from verified facts.

## 1. What actually failed (verified)

Source: `backend-final-check-attempt02.log` lines 104-155 and 3009, and the `:test` XML (`raw/TEST-*.xml`). All 20 failures are in the `:test` task (log line 5650 `> Task :test FAILED`). The `guidedIncrementalTest` task was still running and passing when I looked. The four "incremental lane" names in the brief are **`:test`-lane failures**: they are the cascade victims `incrementalSecret*` / `actualIncrementalSecretPrefix*`, not failures of the incremental task.

| Group | Count | Message |
|---|---|---|
| ReplayIT `actualPoolDefiniteRefusalThenFreshSecretAttemptResolvesRotatedValue` (the only root failure in ReplayIT) | 1 | `:27128` `[actual P3 ordinary terminal status] expected: "PASSED" but was: "ERROR"` |
| ReplayIT, 18 tests that ran after it | 18 | `:3730` `[prior failed-test actual worker teardown was not confirmed; inspect cleanup evidence] Expecting value to be false but was true` |
| `ObservationPolicyIT.originsOutsideTheTrustedPolicyAreInvalidAtWriteAndIncompatibleAtStart` | 1 | `DuplicateKeyException ... studio_guided_policies_csi_id_application_id_environment_id_key; Key (csi_id, application_id, environment_id)=(61139, studio-fixture, Production) already exists` |

The ReplayIT run ran 27 tests green (including the two password-count tests that attempt01 failed), the 605 s crash/reaper test, then this one.

## 2. `:3730` is a latch, not a symptom per se (verified)

`cleanupUnconfirmed` (ReplayIT :3714) is set when the failed-test teardown cannot confirm worker closure. `beginOwnedSessionTracking` (:3727-3730) refuses to start any later test while it is true (instance state is evidently class-scoped, since it carried over). The first failure's suppressed exceptions are `Actual owned P3 cleanup remains unconfirmed` and `Actual ordinary cleanup wait exceeds deadline` (p3CleanupSnapshot :24161), then `C4 actual owner closure remains unconfirmed`. This is by design ("block later bodies if actual teardown is unknown", :3917-3918). Net: one real failure plus 18 quarantined tests. The independent evidence for this is test-28's own cleanup JSON: both guided sessions `CONFIRMED`, `allActualTeardownsConfirmed:false` (the ordinary side was the unconfirmed one).

## 3. Root cause of the first failure `:27128`

`p3AwaitExecution` at :22086 is `p3AwaitExecution(blocker, "PASSED")`. The failing execution is the **pool-capacity blocker** `8872d589-9abd-4db4-9de9-2f35e33d6602` (a registration-mode run that the fixture deliberately holds in the runner's initial-context hook so the second run gets the 429).

Verified timeline (runner `ordinary.log`, `ordinary-ipc-*.jsonl`, owned-worker-generations, execution snapshot in `raw/runtime-temp/`):
- 22:18:30.377Z fresh runner started (poolSize 1); 22:18:38.365Z the blocker's child process (pid 49123) spawned, browser descendants 38.6-39.4Z.
- The test got **past** `Files.exists(initial-context-check-entered)` (:21994, 15 s wait) and past the 429 refusal assertions (:22040-22066), so the child launched Chromium, entered `checkInitial`, and the test then wrote `pause:false` (:22018). Total blocker elapsed 1620 ms.
- Child IPC: `received:["result"]`, `readySent:false`, `resultErrorCode:"INTERNAL_ERROR"`, exit 0. No `ready`, no `run.browser_started` log line for it. The runner maps any non-`ObservedRefusal` throw in the child launch path (`childRuntime.ts` dispatch catch, `replayError`) to `INTERNAL_ERROR` and the exception text is not logged anywhere I could find.

What can throw a plain error between "entered the hook" and "Ready"? The hook itself:
`while(state().pause) await sleep(20); if(state().fail) return false; return handle();` where `state()` is `JSON.parse(fs.readFileSync(initial-context-state.json))` (ReplayIT :32617-32623). The writer is `Files.writeString(path, json)`, which is open-with-TRUNCATE_EXISTING then write. A 20 ms poll that lands between the truncate and the write reads `""` and `JSON.parse("")` throws `SyntaxError: Unexpected end of JSON input`, which becomes `INTERNAL_ERROR` before Ready. The other code in that window (`guard.check()`, `blankMatches()`) throws a refusal or swallows errors (`browser.ts:183-186`, `:222`), so a plain error from there is unlikely.

Reproduction (`raw/race-repro/RESULTS.txt`): same polling (20 ms, node v23.10.0) against 60,000 writes with the current writer: **318 empty reads, 0.53% of writes observed by a poll**. Same run with stage-and-`ATOMIC_MOVE`: **0**. The same file already writes its other polled state atomically (revocation state :26165-26180, private values :31080-31094), which is the precedent for the fix.

Confidence: **probable, not proven.** The exception text of the child was not captured, so I cannot show the `SyntaxError` for this instance. Facts that fit: failure occurs only inside the one unpause window; the hook is the only plain-throwing code there; the same blocker passed in fix01-full-test02, final-gates01, w5-w01 and attempt01 (at about 0.5% per run a single failure in 5 is unremarkable). Facts that I cannot rule out: another transient child fault in that window. I checked and excluded the hypotheses below.

## 4. Hypotheses from the brief

| Hyp | Verdict | Evidence |
|---|---|---|
| (a) ASM probe / jacoco line tables | Refuted | The two password-count pin tests that failed in attempt01 pass in attempt02 (log lines 91-92). No failure is a pin assertion. |
| (b) `refusePasswordFieldCount` extraction changed behaviour | Refuted for this failure | Failing run is ordinary replay (runner INTERNAL_ERROR, no model/validator involved); blocker is a registration page with no password field. |
| (c) Date/time (UTC midnight, daily caps) | Refuted | Failure at 22:18Z, 5 h 40 m before UTC midnight; no date-keyed logic on this path (failure originates in the runner child). |
| (d) Vault fake state leakage | Refuted | `:3730` cascade comes from `cleanupUnconfirmed`, not vault state; first failure is not a vault assertion. |
| (e) Something global behind ObservationPolicyIT | Refuted: independent | See section 5. |
| env: host load | Not evidenced | Host had little free memory at 19:08 EDT (~120 MB free pages, many Chrome/claude processes), but I have no reading for 18:18 and the child reached the hook, so launch pressure is not the failure point. |

## 5. `ObservationPolicyIT`: independent random-data collision (verified code, inferred collision partner)

`ObservationPolicyIT.setUp()` (:73) picks `csi = 61000 + Math.random()*900` per test; 11 tests share one database and `studio_guided_policies` is unique on `(csi, application, environment)`. The failing test inserts directly via `repository.insertPolicy(id, csi, APP, ENV, OWNER)` (:209) with `61139/studio-fixture/Production`; another test in the same class drew 61139 earlier. Probability of any pair colliding is about 1-exp(-C(11,2)/900) = 5.9% per run (computed, not measured). No other test file contains `61139` or a `61xxx` policy CSI (grep). Passed in attempt01 and fix01-full-test02. The test timing (0.876 s class) shows it ran independently of ReplayIT. It is a pre-existing flake of an untracked file, unrelated to the w7 change and to ReplayIT.

## 6. Fix (`fix.patch`, `git apply --check -p0` from repo root: OK)

1. ReplayIT: new `writeInitialContextState(String)` (stage + `ATOMIC_MOVE` + `REPLACE_EXISTING`, temp removed in `finally`) replacing the 10 test-body `Files.writeString(...initial-context-state.json...)` calls; the single startup write before the runner exists (:32615) is left alone.
2. ObservationPolicyIT: per-test random CSI replaced with a per-JVM random base plus `AtomicInteger.getAndIncrement()` (no intra-class collision; max 61000+799+11).

Both are test-only; production code is untouched and no assertion is weakened. Checked: patch applies; both patched files parse clean with JDK 21 (`javac` parse-only, 0 syntax errors). **Not checked:** full compile (no Gradle) and no re-run of either test.

## 7. Recommended next step (not done)

Apply `fix.patch`, then re-run the narrow checks (`ObservationPolicyIT`, ReplayIT `actualPoolDefiniteRefusalThenFreshSecretAttemptResolvesRotatedValue` plus `actualScopedVaultOutage...`; note test 29 and the 17 later tests were never actually exercised in attempt02) and a full `check` for the gate. If the capacity blocker fails again with the patch in place, the race is excluded and the next step is to capture the child's thrown error (not currently logged).
