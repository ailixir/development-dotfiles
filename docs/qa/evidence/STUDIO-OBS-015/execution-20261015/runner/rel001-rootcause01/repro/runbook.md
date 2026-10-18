# REL-001 reproduction harness: runbook

Purpose: turn the 35% for H1 (version-page read race) into a measured result, and say which hypothesis the tally supports. Everything here is prepared and syntax-checked only. **Nothing has been run**, no Chrome has been launched, and the scratch build has not been made. Times are estimates, not measurements.

Status of what was checked: `node --check` (Node 24.20.0) on every `.mjs`, `/bin/bash -n` (macOS bash 3.2) on every `.sh`, `ast.parse` on the `.py`; `tally.mjs` run against synthetic records (classification and Fisher test behave); `lib.sh` process-tree helpers tested on harmless `sleep` processes; `prepare-scratch.sh a --dry-run` and `ab --dry-run` pass (patch base matches `manifest.json`, `git apply --check` clean); `preflight.sh` correctly refuses while attempt04 runs.

## 1. What the harness does and does not prove

Does: runs the real guided start path N times against real Chromium, from `GuidedOwnership.assign` and `.context` through `GuidedRuntime.start` and `launchGuidedBrowser` (recorded context: version probe, startup page close, video delete, fresh app page, route, CDP blank document), `withhold`, blank match and the `bootstrap-evidence` callback. A failure is rendered by the same `describeStartFailure` the patched transport uses, so each failure is one `GUIDED_START_FAILED` fact set that names the phase, loss, kind, code and signal.

Does not: use HTTP/TLS, the backend, the model gateway, Docker, Postgres or the real recorder (a stub gives the same launch request and discards the video). So **H4 (callback refused) and H5 (lease/ownership) cannot occur in this harness**; they stay excluded only by the attempt03 evidence, not by this run. The Node version also differs from attempt03 (attempt03 ran Node v23.10.0; this uses v24.20.0 as requested, because ED-05 moves the pins to 24). To rule that out, repeat the best mode with `NODE_BIN_DIR=<dir of the v23.10.0 node>` (see section 8).

Two independent measurements are taken, because the first can come back empty:

1. `probe-version-race.mjs` measures the H1 mechanism directly: on each fresh launch, was `#profile_path` still empty when the pre-patch code would have read it, and how long after the page's own `load` event was it filled? This needs no failure to occur.
2. `harness-stress.mjs` measures the effect: does the start fail, and where.

Controls (cheap, deterministic, run first): `--inject-lag-ms` makes the version page blank its two fields for N ms after `goto` resolves. Variant `a` must then fail `PROFILE_PREFERENCES_REQUIRED` at `PROBE` every time; variant `ab` must pass. That proves the detection chain end to end before any stress result is trusted.

## 2. Files

| File | Role |
|---|---|
| `prepare-scratch.sh a\|ab` | scratch copy of `studio-runner` outside the repo, patch applied, `tsc` build to `dist-repro/` |
| `preflight.sh <variant>` | read-only readiness checks; refuses while another gate runs |
| `harness-stress.mjs` | the N-times guided start loop; writes `<mode>.jsonl` (value-free) and `<mode>.raw.jsonl` (local paths, keep out of evidence) |
| `probe-version-race.mjs` | the H1 mechanism probe; writes `<mode>.probe.jsonl` |
| `run-matrix.sh` | runs both under load modes, starts and stops the stressors, prints the tally |
| `run-fix-validation.sh` | the same loop with patch A+B, then the A-vs-AB Fisher comparison |
| `mem-hold.mjs` | bounded memory holder (backs off on low swap or low disk) |
| `tally.mjs` | classification, rates, upper bounds, timings, `--compare` |
| `chrome-ready-times.py` | spawn-to-UI-ready times from the unified log, as in attempt03 |
| `lib.sh` | PID tracking, protected-PID refusal, owned-directory cleanup |

Nothing in the repo is written. Scratch lives under `$REL001_SCRATCH/repro-run/` (default: `.../scratchpad/rel001/repro-run`), which only these scripts create, mark with `.rel001-owned` and remove.

## 3. Before you start

1. **Wait for attempt04 to finish.** It is the frozen-tree gate, and it is also the thing most hurt by extra load: the failure being studied is a slow Chrome start. `preflight.sh` fails while `run-backend-tasked.py` or Gradle test workers exist. Confirm `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates04/receipt.json` exists. `--allow-busy` exists, but a run made that way is contaminated and must not be used as evidence.
2. Close other Chromium-heavy work; note Spotlight indexing (attempt03 had three `mds` kills of `mdworker` in the same two seconds as the slow start). Do not disable Spotlight; note its state.
3. Put the machine in the state you want to measure: the baseline mode needs idle load (< 4). The memory mode needs free disk (`mem-hold` stops below 25 GB free) and swap headroom (stops below 1.5 GB free swap).
4. Run from this directory. The scripts pick Node 24.20.0 themselves (`PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH`) and abort on any other version. They refuse to run with `NODE_OPTIONS`, `DEBUG`, `PWDEBUG` or `NODE_DEBUG` set (the runner itself refuses those).

```bash
cd docs/qa/evidence/STUDIO-OBS-015/execution-20261015/runner/rel001-rootcause01/repro
```

## 4. Commands, in order

Estimates assume about 3 s per sequential iteration at idle (launch about 0.8 s, hold 1.5 s, close about 0.5 s) and are guesses for the loaded modes.

| Step | Command | Est. time | Expected |
|---|---|---|---|
| 0a | `./prepare-scratch.sh a` | 1 to 2 min (tsc) | prints `tsc ... exit 0` and the `RUNNER_DIR`. Exit 0 here is also the first type-check of patch A. Add `--typecheck-full` for the whole project, `--lint` for eslint on the patched files (heavy; not during a gate) |
| 0b | `./prepare-scratch.sh ab` | 1 to 2 min | same, plus patch B present |
| 0c | `./preflight.sh a` | seconds | `PREFLIGHT OK` |
| 1 | control: `./run-matrix.sh --variant a --n 5 --modes baseline --inject-lag-ms 400` | 1 min | 5/5 failed, all `H1 version probe read empty/mismatched fields` |
| 1b | control: `./run-matrix.sh --variant ab --n 5 --modes baseline --inject-lag-ms 400` | 1 min | 0 failed |
| 1c | control: `./run-matrix.sh --variant ab --n 3 --modes baseline --inject-lag-ms 7000` | 1 min | 3/3 failed, `H1b probe wait timed out` (the 5 s bound works) |
| 2 | mechanism probe, all modes: `./run-matrix.sh --variant a --n 1 --probe-n 300 --modes baseline,cpu,mem,cpu+mem,throttle,throttle+cpu` | 6 modes x about 6 min, more when throttled; about 1 h | the `version probe` block per mode: `EMPTY at pre-patch read: k/n` |
| 3 | screening, variant a: `./run-matrix.sh --variant a --n 100` | 6 modes x about 5 to 15 min; about 1 to 1.5 h | failure counts per mode, classified |
| 4 | confirmation, variant a, on the mode(s) that failed: `./run-matrix.sh --variant a --n 300 --modes <modes>` | 15 min to 1.5 h per mode | the same classes at a rate you can bound |
| 5 | fix validation: `./run-fix-validation.sh --n 300 --modes <same modes> --a-results <dir of step 4>` | same as step 4 | 0 failed in every mode; Fisher p printed |

Modes: `baseline` (no load); `cpu` (`yes > /dev/null` x `--cpu-procs`, default all cores); `mem` (holds `--mem-gb`, default 5, of incompressible memory); `cpu+mem`; `throttle` (the whole harness, and so every Chrome it starts, runs under `taskpolicy -b`, macOS background priority: low CPU and throttled I/O, the closest controllable stand-in for attempt03's cold, I/O-starved Chrome start); `throttle+cpu`; `io` (a `dd` write loop in the run's private directory; add as `--modes ...,io`). Concurrency: attempt03 had 19 Chrome launches in 74 s, almost all sequential with 1.7 to 5.9 s lifetimes, which `--concurrency 1 --hold-ms 1500` imitates. `--concurrency 2` or `3` adds overlapping launches as an extra stress.

Output goes to `$REPRO_HOME/results/<timestamp>-<variant>/`: `<mode>.jsonl`, `<mode>.raw.jsonl`, `<mode>.probe.jsonl`, `tally.txt`. To re-tally: `node tally.mjs <dir>/*.jsonl`. To reproduce the attempt03 Chrome-start metric for a mode (window printed by the tally): `./chrome-ready-times.py "<start>" "<end>"` (EDT wall clock, whole seconds).

## 5. Cleanup and safety

- Every process the scripts start (`yes`, `mem-hold`, the `dd` loop, the harness, the probe) is recorded with its start time in `lib.sh`. On normal exit, error, Ctrl-C (`INT`), `TERM` and `HUP`, the trap stops exactly those, children first, and a recorded PID whose start time changed is not signalled (PID reuse).
- Browsers that a killed harness leaves behind are found only by their command line containing the run's private temp directory (created by `own_dir`, holding a `.rel001-owned` marker) and are killed by that rule alone.
- **PIDs 22246, 44737, 13577 and 13581 are never signalled.** Every kill path checks the list and refuses (and says so). Nothing is killed by name or pattern.
- The private temp directory (`$TMPDIR/rel001.XXXXXX`, which holds all Chrome scratch, profiles and videos for the run) is removed at exit only if it carries the marker. The scripts do not remove anything else, including `checks-guided-*` or `.checks-guided-recordings` entries that other processes created.
- If a run is killed with `kill -9`, the trap does not run. Recover by hand and only for what you started: `pgrep -f 'rel001'` shows the `mem-hold`/harness; verify each with `ps -o pid,lstart,command -p <pid>` before `kill`, never `pkill`, never the protected PIDs. Then remove the `rel001.*` directory named in the first line of that run's output.
- `mem-hold` frees only its own memory. It stops growing when free swap is below 1.5 GB or free disk below 25 GB, and exits (releasing everything) if free swap falls below 0.75 GB. This machine already carried 4 to 8 GB of swap in use during attempt03, so do not raise `--mem-gb` above 6 without watching `sysctl vm.swapusage`.
- `taskpolicy -b` applies only to the process it launches and its children.

## 6. Decision rule

Read `tally.txt`. Each failure is classified from its facts, never from message text.

| Tally class | Hypothesis | Meaning | What the fix would be |
|---|---|---|---|
| `H1 version probe read empty/mismatched fields` (phase PROBE, code `PROFILE_PREFERENCES_REQUIRED` or `PROFILE_MISMATCH`) | H1 | the read race | patch B (already written). Validate with step 5 |
| `H1b probe wait timed out` | H1 variant | the page did not fill the fields within 5 s | decide the bound from the probe's `waitMs` tail; if the page really never fills, the probe itself is wrong for that Chrome build |
| `H3 browser exited/closed <signal> during <phase>` | H3 | Chrome died or was closed early | not a code race. Capture Chromium's stderr into the diagnostic; a bounded launch retry before any effect is possible but is a new behaviour and needs a user decision |
| `H3b browser process launch error` | H3 | spawn/launch failed (errno, timeout) | environment first; same options as above |
| `H2/H3 browser reported lost: PAGE_CRASH \| EXTRA_PAGE \| BROWSER_DISCONNECTED \| ROUTE_FAILURE` | H2/H3 | loss event during start | per reason: `EXTRA_PAGE` suggests adopting the replay path's `BootstrapPageGuard`; `PAGE_CRASH` and `BROWSER_DISCONNECTED` are environmental |
| `H2 in-launch step STARTUP_PAGE ... RECORDING_FAILED` | H2 | the `readdir(dir).length !== 0` check or the video path check failed | the line cannot say which entry; add the entry count to the diagnostic, rerun, then fix (for example wait for the startup video's `delete()` to settle) |
| `H2 in-launch step APP_PAGE ... TARGET_DRIFT` or `BLANK_DOCUMENT` | H2 | `page.url() !== 'about:blank'` right after `newPage` or the blank-document check | wait (bounded) for the URL to settle before the check |
| `H4`, `H5` | H4, H5 | cannot occur in this harness (stub callback and claim) | none; if one appears the harness is wrong |
| `D4 hang` | D4 | start did not finish in `--iteration-timeout-ms` (default 90 s) | the missing launch deadline (D6 in root-cause.md); needs a decision |
| `UNCLASSIFIED ...` | none | a failure the table does not cover | read `<mode>.raw.jsonl` locally, add a class, rerun the affected mode |

How the evidence combines:

1. **Mechanism (step 2).** If any mode shows `EMPTY at pre-patch read` at least once, or a positive `fillAfterLoadMs` tail that grows under load, the H1 mechanism is real. If `EMPTY` is 0 in all 1800 launches and the fill is always before `load`, H1 as the cause of a read race is effectively excluded for this Chrome build (the 95% upper bound on the per-launch rate is about 1% per mode at n = 300, and about 0.17% pooled over the six modes if you assume one rate).
2. **Effect (steps 3 and 4).** H1 is *supported* if variant a fails and at least about 80% of its failures are `H1`, with a failure rate that rises in the slowed modes. It is *refuted* as the main cause if variant a fails but the failures are another class. It is *not testable here* if variant a has 0 failures in every mode at n = 300 (the upper bound per mode is then about 1%, and the harness did not reproduce attempt03's 1 in about 64); in that case say so and do not claim H1.
3. **Fix (step 5).** H1 is *confirmed* only if variant ab shows 0 failures in the modes where variant a failed, with n large enough by section 7, and the Fisher p-value against variant a is below 0.01. If ab still fails, the remaining failures are the other classes and the table above says what to do for each; patch B is then necessary but not sufficient.
4. Always read the controls (step 1 to 1c) first. If control 1 does not give 5/5 `H1`, the harness or the classification is wrong; stop.

## 7. How big N must be

Attempt03 saw 1 failure in about 64 guided starts (the number is approximate: it is the ReplayIT class's sessions, each a start). One observation fixes the rate poorly: the exact 95% interval for 1/64 is about 0.04% to 8.4%.

Chance of **seeing** at least one failure with variant a if the true rate per start is q: n = 100 gives 79% at q = 1/64, n = 200 gives 96%, n = 300 gives 99%. Stress modes should raise q; if they do not, that is itself a finding.

Chance of **0 failures in n** if the fix did nothing and q stays 1/64: n = 100 gives 20%, n = 150 gives 9%, n = 192 gives 5%, n = 300 gives 0.9%, n = 400 gives 0.2%. So n = 200 per mode is about 95% convincing and n = 300 about 99% *at the attempt03 base rate*.

The rule that matters is relative to what variant a showed: with variant a at observed rate r (k failures in n), 0 failures in ab needs `n >= 3 / r` for 95% (the rule of three) and `n >= 4.6 / r` for 99%. Example: 8/300 (2.7%) in a needs n >= 113 in ab for 95%, 173 for 99%; 3/300 (1%) needs 300 and 460. Use the Fisher p printed by step 5 as the final statement; do not stop early on a good-looking run.

If a mode shows no failures in variant a, "0 failures in ab" proves nothing in that mode and must not be reported as a validation.

## 8. Variations worth one run each

- Same best mode under the attempt03 Node: `REL001_NODE_VERSION=v23.10.0 NODE_BIN_DIR=<bin dir of that node> ./run-matrix.sh ...` (the scratch build is plain ES2022 and runs on either). This separates a Node effect from a Chrome effect. Find that node with `which -a node`; if it is not installed, skip this and say so.
- `--concurrency 2` and `3` in the worst mode.
- Add `io` to the modes of step 3.
- Run step 3 with the machine's Spotlight indexing visibly busy (note it in the run log; do not change system settings).

## 9. Saving results

Copy `tally.txt`, `*.jsonl` (not `*.raw.jsonl`, which holds local paths) and the printed commands into a new directory under this one named `results-<timestamp>-<variant>/`, and record the load average and swap lines the run printed for each mode. The raw files stay in scratch.
