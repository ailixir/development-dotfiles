# REL-001 reproduction experiment: verdict

Dex (@dev), 2026-10-17 (host clock EDT). Harness: `repro/` (prepared 2026-10-16), run from scratch copies. Nothing under `studio-runner/`, `backend/`, `tools/` or any other repo source path was edited.
Host: macOS 23.5.0 arm64, 11 cores, 18 GB. Chrome for Testing chromium-1243, Playwright 1.63.0. Node v24.20.0 (parity run: v23.10.0 from `/opt/homebrew/bin`).

## 1. Bottom line

**The attempt03 CONTEXT_LOST was not reproduced, so its root cause is not proven.** H1 is **unproven** (neither shown nor ruled out). H2, H3 and H6 were not reproduced either.

What the experiment did establish, and what it did not, is in sections 3 and 4. The patch recommendation is in section 6.

## 2. What was run

| Item | Result |
|---|---|
| Preflight | node v24.20.0, no other gate running, only the scratch build was missing (expected before step 2) |
| Build + type-check of patches A and B | both clean, see `build-and-typecheck.txt` |
| Controls | all three behave as specified (section 3.1) |
| Variant a, real guided start path, Node 24.20.0 | **2003 starts, 0 failures** (6 modes x 300 + 203 in an interrupted mem mode) |
| Version-page probe (direct H1 measurement), Node 24.20.0 | **1400 fresh launches, 0 empty reads** |
| Parity, Node 23.10.0 (attempt03's version), most Chrome-starved mode | 300 starts, 0 CONTEXT_LOST, 1 hang (section 3.6); probe 100 launches, 0 empty |
| Variant ab (A+B) regression smoke, same mode | 100 starts, 0 failures (a smoke, not a validation) |
| `run-fix-validation.sh` (Fisher) | **not run**: its precondition (variant a reproduces failures) was not met |

Per-mode detail (variant a, Node 24.20.0; full figures in `matrix-variant-a-node24/tally.txt`):

| Mode | Starts | Failed | Chrome launch ms p50 / p95 / max | Version page filled after `load` (ms) p50 / max | Empty at pre-patch read |
|---|---|---|---|---|---|
| baseline | 300 | 0 | 636 / 662 / 718 | 4.5 / 15 | 0/100 |
| cpu (11 `yes`) | 300 | 0 | 787 / 902 / 1025 | 7.1 / 31.5 | 0/100 |
| cpu+mem (11 `yes`, 5.0 GB held) | 300 | 0 | 845 / 956 / 1412 | 7.1 / 77.6 | 0/300 |
| throttle (`taskpolicy -b` on harness and its Chrome) | 300 | 0 | 1171 / 1301 / 1593 | 7.2 / 25.1 | 0/300 |
| throttle+cpu (8 `yes`) | 300 | 0 | 4269 / 6194 / 11403 | 52.2 / **1886** | 0/300 |
| chromebg+cpu (8 `yes`, Chrome only in background policy, Node normal) | 300 | 0 | 3310 / 4277 / 5917 | 57.3 / 174.9 | 0/300 |
| mem (5 GB, interrupted, see 5) | 203 | 0 | 629 / 662 / 866 | not run | not run |
| Node 23.10.0, chromebg+cpu | 300 | 1 hang | 3255 / 3515 / 5879 | 61.2 / 159.3 | 0/100 |
| variant ab, chromebg+cpu (smoke) | 100 | 0 | 3220 / 3673 / 5648 | not run | not run |

Chrome spawn to UI-ready from the macOS unified log (same metric as the attempt03 analysis; `unified-log-ready-times/`): idle baseline median 0.188 s (39 launches); **chromebg+cpu median 0.809 s, max 0.901 s (17 launches)**; throttle+cpu median 1.087 s, max 1.576 s (12 launches). Attempt03's failing launch: 0.887 s against 0.216 to 0.279 s for its other launches.

## 3. PROVEN (measured here)

1. **The detection chain works end to end.** Control 1 (variant a, `--inject-lag-ms 400`): 5/5 failed, all `phase PROBE`, code `PROFILE_PREFERENCES_REQUIRED`, classified H1. Control 1b (variant ab, same lag): 5/5 passed. Control 1c (variant ab, 7 s lag): 3/3 failed on the wait, `phase PROBE`, `TimeoutError`/`TIMEOUT`, ~5.4 s, classified H1b (the 5 s bound works). So a failing read of the version page would have shown up in the tally had it occurred.
2. **The H1 window exists by construction.** In all 1500 probe launches (1400 on Node 24, 100 on Node 23) the page filled `#profile_path` strictly after its own `load` event, never before: 1500/1500 positive. Typical delay 4.5 ms idle, 57 ms with a background-policy Chrome, up to 1886 ms under whole-harness throttling plus 8 CPU loops. The pre-patch code reads right after `goto` resolves.
3. **That window never produced an empty read.** 0 of 1500 probe launches read an empty `#profile_path` or `#executable_path` at the pre-patch moment, and 0 of 2303 real guided starts (variant a) ended in a PROBE-phase failure. Upper 95% bounds (rule of three): 0.20% per launch for the probe, 0.15% per start for the harness.
4. **A slow Chrome start of attempt03's size is, on its own, not sufficient to fail the start.** In `chromebg+cpu`, every launch took about 0.81 s to UI-ready (attempt03's failing one: 0.887 s), with Node at normal speed, and 300/300 starts passed. In `throttle+cpu` (median 1.09 s) 300/300 passed. If such slow starts failed at the attempt03 base rate of 1 in 64, 0 failures in 600 would have probability about 8e-5 (inference from the binomial, on the assumption that the harness path equals production's for the steps it runs).
5. **No other in-launch step failed either.** Across 2303 variant-a starts there were zero H2-class failures (startup page, video, app page, route, blank document), zero H3-class failures (browser exited, closed or reported lost; launch error), zero H4/H5 (those cannot occur in this harness).
6. **The guided launch has no deadline of its own, and starvation can make it hang.** Three iterations hung in `phase LAUNCH` past the harness's 90 s limit, with `close` also hung afterwards: 1 of 1 in the first throttle+cpu attempt with 11 `yes` (aborted), 1 of 8 with 10 `yes`, and 1 of 300 on Node 23.10.0 in `chromebg+cpu` (iteration 293, 8 CPU loops). In the 10-loop calibration the launches that did finish had a p50 of 36 s. This is root-cause.md's D4 observed, but it is a different failure shape from attempt03 (a refusal after 1.98 s), so it does not explain attempt03. It occurred once on Node 23 and never on Node 24 in the same mode (Fisher p = 1.0; no evidence of a Node effect).
7. **Patches A and B build, type-check and lint clean; their unit tests pass** (`build-and-typecheck.txt`). Patch ab passes 100/100 starts under a Chrome 5x slower than idle.

## 4. Consistent with the data, NOT proven (inference)

- H1 may still have been the attempt03 trigger as a rare event (the attempt03 rate is 1 failure in about 64 starts, 95% interval about 0.04% to 8.4%, which contains my pooled bound of 0.15%). This experiment cannot tell a rare H1 from no H1.
- My reading is that the natural margin is wide: Playwright's `goto` resolution plus the first CDP round trip usually lands after the page's fill, and under symmetric slowdown the reader slows as much as the page. Only a Chrome that is slow while the runner is fast, by more than the observed margin, would open it. The asymmetric mode (Chrome at ~4x spawn-to-UI-ready, Node normal) did not open it in 300. This lowers my confidence in H1 relative to the 35% prior in root-cause.md, but I cannot put a number on it.
- The conditions that were not reproduced and may matter: a cold first launch (attempt03's failing start was test 1 of 46, with Chrome's binary likely not in the page cache; I cannot purge the cache without root, and a file-streaming eviction mode I tried did not slow Chrome in a 10-iteration calibration, so it was not run at scale), Spotlight indexing I/O (3 `mdworker` kills in the same 2 seconds), a Gradle JVM test worker next to it, real HTTP/TLS, the real recorder.
- The `readdir(dir).length !== 0` check and the `about:blank` URL check (H2) are not stressed by anything specific to attempt03; I only know they passed in 2303 starts.

## 5. Per hypothesis

| Hyp. | Prior (root-cause.md) | Result here | Verdict |
|---|---|---|---|
| H1 version-page read race | 35% | window real (1500/1500 fills after `load`), 0/1500 empty reads, 0/2303 PROBE failures, controls prove detection | **UNPROVEN**; not reproduced in any mode |
| H2 another in-launch step | 25% | 0 failures of any in-launch step in 2303 starts | **Not reproduced** |
| H3 early Chrome exit | 15% | 0 browser exits, closes, losses or launch errors in 2303 starts. The only anomaly was a launch that never finished (D4 hang), which is not an exit | **Not reproduced** |
| H6 memory | 3% | cpu+mem: 5.0 GB held at load 20+, 300/300 passed. Mem-only: 5 GB held, but free swap fell to 320 MB within about a minute (my floor is 500 MB), the holder released itself at its own 0.5 GB floor, and I stopped the run at 203 starts (about 20 of them under the full hold). Memory pressure beyond that was not applied | **Not supported at the pressure that could be applied safely; not excluded** |
| H4 callback refused, H5 lease/ownership | 5%, 2% | cannot occur in this harness | **Untested** (excluded only by the attempt03 evidence, as before) |
| Node 23.10.0 vs 24.20.0 | not a hypothesis | 0 CONTEXT_LOST in 300 on Node 23 | no difference seen |

## 6. Patch to adopt

- **A is required.** D1 (the cause is dropped at five sites and never logged) is certain, and A is the only change that will name the cause if CONTEXT_LOST recurs: the `GUIDED_START_FAILED` line distinguishes PROBE (H1), STARTUP_PAGE/APP_PAGE (H2), PROCESS exit/signal (H3) and the loss reasons in one read.
- **B is hardening, not a proven fix.** It closes a race whose window this experiment measured but whose firing it did not observe. It passed the injected-lag controls (a fails 5/5 at 400 ms, ab passes 5/5; ab fails as designed at 7 s), type-checks, lints, passes its 4 unit tests and showed no regression in 100 starts under slow Chrome. My recommendation is **A plus B**, since the cost is two CDP round trips and a 5 s bound; if you want to ship only what the evidence supports, **A only** is the defensible alternative.
- **No new fix patch was designed.** The tally does not point anywhere other than H1: no mode produced a failure class other than the D4 hang, and that one has a different shape from attempt03. D4 (a launch deadline) remains a separate decision, as root-cause.md already says.

## 7. Defects found in the prepared harness (changes are in `scratch-harness-changes.patch`, applied only to scratch copies)

1. `run-matrix.sh` leaves its `rel001.*` temp directory behind: `own_dir` runs inside `$(...)`, so `OWNED_DIRS` is never set in the parent shell and the trap's `remove_owned_dirs` has nothing to remove. I removed the leftovers by hand (marker checked); scratch copy registers the directory explicitly.
2. The memory holder's 1.5 GB free-swap floor makes the `mem` mode a no-op on this host (macOS swap total here was 4096 MB with 1282 MB free, so it held 0.00 GB: the first cpu+mem run was therefore plain CPU and was discarded). I ran it with a 1.0 GB floor (self-release at 0.5 GB). Even that overshot to 320 MB free swap, because the holder polls while allocating.
3. `preflight.sh` refuses at 1-minute load above 4, which my own stressors cause for the next mode; I passed `--allow-busy` from the second run on, after checking with `pgrep` that no gate process existed.
4. `tally.mjs` crashes on a D4-hang record (`lineSamples` contains `undefined`).
5. `throttle+cpu` with 11 `yes` on 11 cores starves the background-policy harness completely (first iteration hung); 8 loops is the usable setting here (launch p50 4.3 s).
6. New asymmetric mode `chromebg` (scratch only, `bgpoller.sh`): applies `taskpolicy -b -p` to every descendant of the harness Node process as it appears, leaving Node itself at normal priority. A first attempt via a wrapper executable failed 10/10 with `PROFILE_MISMATCH` because the runner compares Chrome's reported executable path with `chromium.executablePath()`; that is an artifact of the wrapper, not a result (`calibration-and-aborted/chromebg-wrapper-PROFILE_MISMATCH-artifact/`). The tally classifies `PROFILE_MISMATCH` under "H1" together with `PROFILE_PREFERENCES_REQUIRED`; the code distinguishes them in `*.raw.jsonl`, which is not committed.
7. The probe's `waitMs` is not a pure page-fill time (it includes the starved Node's own CDP latency; max 2199 ms under throttling). Use `fillAfterLoadMs` (measured inside the page) for the fill timing.

## 8. Not covered / how to continue

- Run on the machine where attempt03 happened under the real ReplayIT conditions with patch A applied: the `GUIDED_START_FAILED` line will say which phase failed, which this harness could not.
- A cold-first-launch mode needs a cache purge (root) or a reboot-like state; not available here.
- Higher memory pressure was not applied (swap safety).
- Raw per-iteration files (`*.raw.jsonl`, local paths) stayed in the scratchpad and are not committed. The committed `*.jsonl` have local paths redacted to `<SCRATCH>`, `<TMP>`, `<HOME>`.
