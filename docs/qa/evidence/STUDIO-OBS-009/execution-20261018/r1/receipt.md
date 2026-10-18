# Receipt: lane R1 (AC-11 f-h runner, i, j, and the d counter test)

- **Agent:** Dex (@dev, runner). **Date:** 2026-10-18. **Mode:** YOLO. **Result: GREEN** (lane verify 131/131; whole runner unit suite 2469 passed). Marks [V]/[I] as in the R2 receipt.
- Spec: T0 ruling A12 (`prep-20261016/t0-rulings/ruling.md` section 1), story AC-11 d, f-j.

## Files
| file | sha256 before | sha256 after |
|---|---|---|
| `studio-runner/src/server/runCoordinator.ts` | 004e52deb3e0b1965a8dec43db08e17170515cbcd5fc5f2980269a46433ed52f | c299db916e6bfe7d58ef6057ada76b77dbc5eb12f545e0471aa3462767377482 |
| `studio-runner/src/run/launcher.ts` | 0dfeb39a76c046dd1df4b1b9df0cec238aa57c0c7b067b8824368ffc075e9fd7 | 15725739bc77ffb82cd4851a78bf7777df644a902dde0217c272b48243fc7bc3 |
| `studio-runner/test/run/forkKillTree.test.ts` | e96aa2b2d5555a6ec0af3710b9390c43ae121e7ea036038e74ab7640824a5897 | 70adf1d00021e39d13638a0abcf6c8d3055dada98962669b126b213e539cf324 |
| `studio-runner/test/server/controlWindowLog.test.ts` | new | 24f69e58d5606a0f0c59f0c96ec9de624884987773af730ee22bdcb1b157ed76 |
| `studio-runner/test/reporting/terminalAbandoned.test.ts` | new | 3785620841f1028f016b771e2e715e26c390612b7abf8acc22b9699dbab20276 |

`test/server/cancel.test.ts`: not edited by me; root applied D1's 5-line change and I left it. `tree.ts`, `tree.test.ts`, `launcher.test.ts`, `terminal-order.test.ts`, `deadline-outcome.test.ts`: no change was needed (all green).

sha256 "before" values were taken at lane start from the live working tree (which already carried other lanes' uncommitted work), so they are the lane baseline, not a git blob.

## What changed
- **f-h (R10c).** `runCoordinator.ts`: after `await reporter.settled()` in the run's `finally`, an outer `CANCELLED` that the API never recorded (`control.cancelled && !control.recorded`, browser started) becomes `ERROR` / `RUN_ERROR` with `errorMessage` `CANCELLED`. The interrupted step is `SKIPPED`, start reading kept, no finish, failure `STOPPED_STEP_MESSAGE`: for a child that honoured the stop and reported `FAIL`/`CANCELLED`, and, as before, for the kill path's open step. It is decided AFTER the progress deliveries settle, so an acknowledgement carrying `cancelRequested` or `revoked` still upgrades `recorded` (the R8 upgrade; `ackRequestsCancel` already treated `revoked` as a recorded fact). New: a VALID control answer that arrives after its window closed and says `cancelRequested` or `revoked` also records the fact. No window, deadline, TTL, margin or vocabulary change.
- **i.** The `run.cancel_requested` line of a `control-window` stop now carries `branch` (`noRequestBudget` | `noTimerBudget` | `windowPassed` | `invalidControlBody`), `latenessMs` and `durationMs` (integers, floored at 0). Its `recorded` field reports `control.recorded` at stop time. Other sources add nothing.
- **j.** `launcher.ts` `createForkSpawner().kill()` no longer uses `signalProcessTree`'s default table (the synchronous `ps`). It signals from the latest asynchronous sample plus every process an earlier sample showed; with no sample yet it reads one asynchronously first (enumerate before signal) and then signals. The signals are unchanged; `quiesce()` still re-enumerates after every kill that matters.
- **d counter.** `test/reporting/terminalAbandoned.test.ts` pins `runner.report.terminal_abandoned` and the two events (`report.terminal_rejected`, `report.terminal_abandoned`): every way a terminal report ends undelivered counts exactly once, with a closed, value-free line; delivery, ownership loss and dropped progress never count. No source change was needed.

## Commands and results (all [V])
| command | exit | counts |
|---|---|---|
| red `controlWindowLog.test.ts` before the code (`red-controlWindowLog.log`) | 1 | 8 failed / 14 (five attribution cases and three f cases; the g regression pins pass today by design) |
| red `forkKillTree.test.ts` before `kill()` (`red-forkKillTree.log`) | 1 | 3 failed (one synchronous `ps` call each) |
| lane verify (`verify-green.log`): launcher, tree, forkKillTree, cancel, terminal-order, deadline-outcome, controlWindowLog, terminalAbandoned | 0 | 131 / 131 (8 files) |
| `test/server` + `test/reporting` + forkKillTree/launcher/tree/confinement | 0 | 456 passed, 1 skipped (pre-existing) |
| runner unit suite, whole (`full-unit-suite.log`) | 0 | 2469 passed, 29 skipped |
| `tsc`, `eslint` on the lane's files | 0 | clean |

The harness-based suites (`cancel`, `terminal-order`, `deadline-outcome`) were red for part of the session because of D1's listener change (`createApplication` required `listener`); they are green since root applied D1's out-of-set test migration. `green-controlWindowLog.log` and `green-launcher-tree.log` are earlier green runs of the same files.

## Mutations (scratch copy; logs in `mutations/`)
| id | mutation | result |
|---|---|---|
| RM1 | drop `!control.recorded` from the rewrite | 4 red: the g regressions (DELETE after a self-stop, **recorded revocation with a lost control read**, revoked control answer, plain DELETE) |
| RM2 | do not rewrite the child-reported interrupted step | 1 red (f, child honours the stop) |
| RM3 | `kill()` back to the default synchronous table | 1 red (`forkKillTree`) |
| RM4 | mislabel the `windowPassed` branch | 2 red |
| RM5 | disable the whole R10c rewrite | 3 red (the three f cases) |

## ACs covered (local half)
AC-11 f; g (mandatory regression: a recorded revocation whose control read is lost keeps outer `CANCELLED`, through a progress acknowledgement carrying `revoked:true` AND through a late valid control answer); h (no vocabulary or timing change; a drain kill keeps its own text); i; j; the d counter test. Lane B's baton is honoured: a recorded revocation keeps outer `CANCELLED` (B maps `AUTHORIZATION_REVOKED` only from `CANCELLED` + revoked).

## Finding for root: P2's `observed-secret-control > lost-control-body` [V for the code path, I for the fixture run]
That test (`test/fixtures-tier/observed-secret-control.test.ts`, P2's write set, not mine) expects FINAL `errorCode` `CANCELLED` in its `lost-control-body` mode. In that mode the fake backend has recorded the revocation but (a) every control body after it is truncated, (b) every progress acknowledgement is `{}`, and (c) the browser is killed behind a blocked renderer, so no later progress is sent. The runner never learns the fact by any channel, and by ruling A12 an unrecorded post-Ready self-stop is `RUN_ERROR` / `CANCELLED`. That is the case A12 changes, not a defect of the new code, and it is NOT the "mandatory regression" (there the fact does reach the runner; my g cases cover it). I did not run that fixture (it writes evidence under `STUDIO-OBS-007`); `controlWindowLog.test.ts` ("a lost control body ... RUN_ERROR / CANCELLED") pins the same behaviour in the unit tier. Options for P2/root: (1) in that mode expect `RUN_ERROR` + `errorMessage CANCELLED` and keep the other three modes at `CANCELLED`, citing A12; or (2) make the fake backend acknowledge progress with `{"revoked":true}` once revoked, as the real one does [V `ProgressAck.java`, field `revoked`], which only helps if a progress is sent after the stop. Residual for @architect: in production the same shape (revocation recorded, control read lost, no later acknowledgement) reaches the API as `RUN_ERROR` / `CANCELLED` with `revoked_at` set. Lane B maps only `CANCELLED` + revoked to `AUTHORIZATION_REVOKED`. The API already holds the authoritative revoked fact, so also mapping `RUN_ERROR` with `errorMessage CANCELLED` + revoked would close it with no runner change. Not decided here.

## Deviations
- The post-Ready rewrite sits in the coordinator's `finally` and not at the throw site, so that it runs after `reporter.settled()` (needed by the revocation regression).
- `controlWindowLog.test.ts` also carries the f-h cases, so that the secret-bearing job builder (copied from `observedReplayAdmission.test.ts`, which does not export it) exists once.

## Batons
- B-R1-1: `controlWindowLog.test.ts` uses `testListener` from `test/helpers/guidedTls.ts` (D1).
- B-R1-2: lane B's `RunnerReportProjectionTest` copies `STOPPED_STEP_MESSAGE`; it must stay equal to `runCoordinator.ts` (text unchanged).
- Not claimed: the real backend mapping to `AUTHORIZATION_REVOKED` (lane B and the F-merge joined cases) and any behaviour of a live pod.
