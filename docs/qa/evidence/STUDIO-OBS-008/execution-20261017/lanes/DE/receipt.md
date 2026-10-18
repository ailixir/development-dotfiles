# STUDIO-OBS-008 W1 lane DE: V22 and head pins (receipt)

- **Agent:** Dara (@data-engineer), YOLO. **Date:** 2026-10-17 (runs 19:38Z to 19:53Z).
- **Governs:** `prep-20261016/lanes.json`, key `w0Refold20261017`, lane `DE`. **Design:** `t0-rulings/ruling.md` A1.1 to A1.3 and A1.5 case 18. **Extension:** root authorization 2026-10-17 (three extra head pins, six `.target` bumps, the D1 edit accepted, and a widened run).
- **Status: RED in the authorized widened run. `lanes/DE/EXIT` is NOT written** (root rule: anything red means no EXIT).
- **What is green:** V22, all head pins, and every migration and head-pin class, including `GuidedSecretLoginMigrationTest` 23/23.
- **What is red:** the seven guided session/bridge/planning/replay classes the run had to include. 256 cases across runs -04 and -05 fail on guided-session start with `422 INVALID_CONTRACT`, or cascade from it. The stacks point at the v3 `session-view`/`result` validation, which lane L0's P2/P3 schemas changed. That is expected-red ledger item **R3**, not V22 (section 4).
- **Exit criteria:**
  1. V22 migrates at head: met.
  2. CHECK admits exactly 3 shapes: met.
  3. A future partition inherits the columns: met.
  4. No head-pin test left at 21: met, every pin edited. One edited line, `LegacyV20ConfirmedBaseFixture:802`, is not yet exercised by any green run.
  5. Lock / NOT VALID analysis: recorded.

## 1. Files written (sha256 after this lane)

| File | sha256 before | sha256 after | Change |
|---|---|---|---|
| `backend/src/main/resources/db/migration/V22__execution_replay_failure.sql` | (new) | `29437d3bda6479fafdbdad0fc3d53e0a1bcbd8c4ed3bf23fe144e18cc0259cef` | new |
| `backend/src/test/java/com/citi/put/checks/studio/ExecutionReplayFailureMigrationIT.java` | (new) | `0e6ea19ca102f3d3e04636bc67ac384013c845be688d39e47aaeff4c740cb3d8` | new, 9 cases, google-java-format 1.22.0 |
| `…/studio/InferenceMigrationLatestIT.java` | `59d501b3…df50c6` | `14f748837bfd3f16c8c01c86574f80b0b72d5a3f1840c62e6f20623a847b4c42` | line 100 → `"22"`; `"22:execution replay failure"` appended to the same assertion's list (D1, accepted by root) |
| `…/studio/ErrorCodeConstraintMigrationIT.java` | `003ce9a0…3913d6` | `b5cd9de77ce742e0dc114ac9045040fb72fa464066552e2634763d35943d511d` | line 73 `HEAD = "22"` |
| `…/studio/guided/GuidedGovernanceMigrationIT.java` | `f5842d16…a5ce56` | `61b7be0f8f823cb27f6dd691252150177d2ea743575419a860cf75a350362977` | line 974 `"22"` |
| `…/studio/guided/GuidedRecordingMigrationIT.java` | `26f607b7…1695b5` | `de700c477b570b0ba0b95fbd500610016b34a855f77e53423c08a50c2fe22678` | line 53 `"22"` |
| `…/studio/guided/GuidedReplayingPrefixMigrationIT.java` | `e4f19fcf…fa3ea64` | `dfbb264f4a061a1afcf5be59a940905ebde558d2da79783979d458a744049637` | lines 962, 969 `"22"`; V21 description assertion unchanged |
| `…/studio/guided/publication/GuidedPublicationMigrationTest.java` | `592948ce…5a0a5ce56`* | `9b8b38e4bd7bb2c04d8a222e3baa228bd0a4b622028bc8250227a01d05fc0abd` | line 1337 append `"22"` |
| `…/studio/guided/publication/GuidedSecretLoginMigrationTest.java` | `659853de0ec6be586f002a9c20231738dede4abc861f667d09b9d13b685693cc` | `46e7d47b002c54f40853ff57fd99eb3524addaed125e2b81415709d8eb53b923` | root-authorized: line 298 `isEqualTo(22)`, line 301 `version::int > 22` |
| `…/studio/support/LegacyV20ConfirmedBaseFixture.java` | `03d5e84aacd91b1bbab5c04006ceb72d63215a5c3671c99f0b024efab4cf3d54` | `0f60fabce9dab238203682de49a031a8ec103e4ac18b1694375059f20ab312df` | root-authorized: line 802 `isEqualTo(22)` |
| `…/studio/guided/bridge/GuidedBridgeIntegrationTest.java` | `a0ab8e7e0196a51bab73f8ab4d91ea4ffff9b7ab7c7f3bdc46523dd851aad8c1` | `2bcc012036cb9af841cfe5da7261142a288836dc3997ad3a196847fc6adac34a` | root-authorized: line 379 `.target("22")`, comment unchanged |
| `…/studio/guided/bridge/GuidedBridgePlannedIT.java` | `f21c9266afc92ff95072e4d7c7a0047e5c4db6bc9037ff398bd34cd037e37158` | `3760127c09c6e92609aef0e7659109fdf191191645119eb2ba0d23730eb63ec5` | root-authorized: line 471 `.target("22")` |
| `…/studio/guided/session/GuidedServiceTransportFaultIT.java` | `47c18e4f652379d31e100cd84bada6fa1ca0e1be19e46fabde6a24e21e508676` | `8cbc02074b7a2eb42722dedd56005b61e0b3cae4d6ce74cc2695485a3e3583f6` | root-authorized: line 159 `.target("22")` |
| `…/studio/guided/session/GuidedSessionIT.java` | `4c5236fd7056c292e9b9225340321282beed6589c5165ef02e8e97080613fa6a` | `21c0689d764206778641d3b347b33a0ca661f3d4fcab762c540076a36e81603c` | root-authorized: line 125 `.target("22")` |
| `…/studio/guided/translation/GuidedDefaultModelReservationIT.java` | `1a402fb857d93ce17c7335eea2af4524a3d73f2d6161c9e65c1bae3e991cc52d` | `22f144a5fc26f2349bbddae65661e2df6a731251caa82cb6b248e430c806e0c2` | root-authorized: line 130 `.target("22")` |
| `…/studio/guided/translation/GuidedPlanningIntegrationTest.java` | `1b58702407586e41f5196d2ec734905b59ff72b4b69aebdb2a28ad97b0e1fa46` | `d1a3609e77764523f7cab46c8922185f8147ea546e519800d65a2938f066625e` | root-authorized: line 3663 `.target("22")` |

`…` = `backend/src/test/java/com/citi/put/checks`. *Full pre-edit hashes are in `receipt.json`. Each authorized line was re-read before editing and changed only after an exact-match check of the old text; nothing else in those files changed. The "at head" comments are left as they were and stay accurate. V1 to V21 are untouched.

## 2. DDL summary (V22)

- **Columns** on the partitioned parent `ui_test_executions`, as A1.3 rules them: `replay_failure_code text`, `replay_failure_step_id text`, `replay_failure_step_index integer`, `replay_failure_login_steps_present boolean`. All nullable, no default, no backfill (F4). Each has a `COMMENT ON COLUMN`.
- **CHECK** `ck_ui_test_executions_replay_failure` admits exactly three shapes:
  1. all four NULL;
  2. `LOGIN_REQUIRED`, `char_length(step_id)` 1..256, `step_index >= 0`, login NOT NULL;
  3. `TARGET_DRIFT`, `char_length(step_id)` 1..256, `step_index >= 0`, login NULL.

  Each branch tests a column with `IS NOT NULL` before comparing it. Otherwise a NULL code with the other columns set would make the CHECK evaluate to NULL, and a NULL CHECK passes.
- **Partition inheritance:** the ALTER recurses to `2026_05`, `2026_06`, `2026_07` and `DEFAULT`. A month that `PartitionManager` creates later inherits the columns and the CHECK (`conislocal=false`, `coninhcount=1`, validated, same definition). PartitionManager's DEFAULT→month move keeps the replay failure, because it reads the column list from `pg_attribute`. Verified end to end with the real `PartitionManager`.
- **Interpretation:** the TARGET_DRIFT step bounds equal the LOGIN ones, as in the contract's `ReplayFailure`.
- **Not added (No Invention):** a write-once trigger and code↔status coupling. These stay application rules (L1-A `applyFinal`).
- **RLS:** not applicable; there is no RLS in this schema.
- **Rollback:** no down migration (forward-only). Recreate the database and migrate to V21, or restore a `pg_dump` taken before V22.

## 3. Lock and NOT VALID analysis (PostgreSQL 15, one Flyway transaction)

| Step | Lock | Scan | Evidence |
|---|---|---|---|
| `ADD COLUMN` ×4 | ACCESS EXCLUSIVE on parent and every partition, held to COMMIT | none (catalog only) | verified (IT) |
| `ADD CONSTRAINT … NOT VALID` | recursive, `convalidated=false` on all 5 | 0 seq scans per leaf | verified (`pg_stat_xact_user_tables`) |
| `VALIDATE CONSTRAINT` | SHARE UPDATE EXCLUSIVE plus the held ACCESS EXCLUSIVE | exactly 1 seq scan per leaf; parent not scanned | verified (IT and scratch run) |

- **No shorter window.** Inside one transaction the NOT VALID split does not shorten the blocking window, because ADD COLUMN already holds ACCESS EXCLUSIVE. The window is catalog time plus one heap scan of the execution history. The split follows V13's convention and leaves the constraint validated everywhere.
- **VALIDATE cannot fail on data.** V22 creates the columns, so every existing row holds four NULLs.
- **Scan cost** is inferred, not measured at production size.
- **Online alternative, not taken:** two migrations, with VALIDATE under SHARE UPDATE EXCLUSIVE only. The ruling allows one file.

## 4. Test results (collector `execute-008/run-backend-tasked.py`, N24 PATH, Gradle lock, `--no-daemon`)

Evidence folder: `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/`.

| Label | Scope | Result | Gradle / wrapper exit | sourceStable | results.json sha256 |
|---|---|---|---|---|---|
| `obs008-db-v22-01` | DE 8 classes | 130/130 pass | 0 / 2 | false | `330d1ea1…2d964bd` |
| `obs008-db-v22-02` | probe of extra pin (before edit) | 1/1 fail as expected (`expected: 21 but was: 22`) | 1 / 1 | true | `0bb5541d…40ed1954` |
| `obs008-db-v22-03` | DE 8 classes | 130/130 pass | 0 / 2 | false | `879d8bb0…127626` (full in json) |
| `obs008-db-v22-04` | root's 16 `--tests` names | 284 run: **156 pass, 128 fail** | 1 / 1 | false | `af3b4d90bd50a3937f9e57eb53df90de4622087d89aa911df83e7adb14ade281` |
| `obs008-db-v22-05` | the 4 classes -04 did not match (corrected names) | 86 run: **0 pass, 86 fail** | 1 / 1 | false | `a3e652a36725eeadb49e198e6d2201039e7ed950dd134570d661d61a1b370c8b` |

**-04 + -05 per class**

| Class | Pass | Fail | Failure |
|---|---|---|---|
| ExecutionReplayFailureMigrationIT | 9 | 0 | |
| InferenceMigrationLatestIT | 9 | 0 | |
| ErrorCodeConstraintMigrationIT | 5 | 0 | |
| ErrorCodeVocabularyTest | 6 | 0 | |
| GuidedGovernanceMigrationIT | 26 | 0 | |
| GuidedRecordingMigrationIT | 8 | 0 | |
| GuidedReplayingPrefixMigrationIT | 55 | 0 | |
| GuidedPublicationMigrationTest | 12 | 0 | |
| **GuidedSecretLoginMigrationTest** | **23** | **0** | the edited pins at 298/301 are green |
| GuidedSessionIT (target 22) | 2 | **42** | 40 `GuidedSessionException: INVALID_CONTRACT` at `GuidedContracts.validate` ← `GuidedSessionService.view`; 2 the same via concurrency wrappers |
| GuidedServiceTransportFaultIT (target 22) | 1 | **39** | 38 `INVALID_CONTRACT`; 1 class-level `executionError` "Rejected/unstarted stop ownership cannot establish actual completion" (cascade) |
| GuidedPublicationReplayIT (fixture user) | 0 | **47** | 7 are `POST /api/v1/studio/guided-sessions` → 422 `INVALID_CONTRACT`; 1 is "C5 actual HTTP response status code=INVALID_CONTRACT". The other 39 cascade from those: 36 "prior failed-test actual worker teardown was not confirmed", 1 "Requires the genuinely published revision from the preceding integration flow", 1 `editedSourceKeepsHistoricalReceipt…` (bare `AssertionError`, cause not isolated) and the class `executionError` ("joined runs emitted admitted-action and replay-dispatch events"). Collector: `MISSING_FRESH_COHORT_FILE audit-final.json` |
| GuidedBridgeIntegrationTest (target 22) | 0 | **9** | `INVALID_CONTRACT` |
| GuidedBridgePlannedIT (target 22) | 0 | **16** | `INVALID_CONTRACT` |
| GuidedDefaultModelReservationIT (target 22) | 0 | **4** | `INVALID_CONTRACT` |
| GuidedPlanningIntegrationTest (target 22) | 0 | **57** | start → 422 `INVALID_CONTRACT` |

The exact failing names per class are in `receipt.json` (`runs[].perClass[].failing`) and in the two results JSONs.

**Attribution of the reds**

- **Verified, GuidedSessionIT.** L0's run `obs008-c-r3-01` (19:37:32Z, in `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/`) ran it while it still targeted 21. It produced the **identical** 42-fail / 2-pass name sets. So my bump to 22 does not change that class's outcome.
- **Verified, the failing check.** It is JSON-schema validation of the guided session view/result against the packaged v3 schemas. `session-view` is now `38dd5ddd` (W0 `378ab88d`) and `result` is `22ce88ae` (W0 `7accd138`). L0's receipt records them as P2/P3, adding required `progress`/`explanation`.
- **Inferred, the other six classes.** Same stacks and 422 bodies. I ran no target-21 counterfactual for them. L0's receipt already lists `GuidedServiceTransportFaultIT`, `GuidedPublicationReplayIT` and `GuidedBridge*IT` as "same mechanism expected", turning green with L1-P's projector.
- **Migration to 22 succeeded in every bumped class.** Every failure happens after setup migrated to 22: contexts booted, and `GuidedSessionIT.migrationPreservesExistingDataAndFreshInstallWorks` passes. No missing-column or JPA validation error appears (the Q2 risk did not show).
- **Not exercised.** The fixture pin `LegacyV20ConfirmedBaseFixture:802`. Both callers, `historicalIncompleteBaseRequiresExplicitFirstStep…` and `actualHttpExplicitFullLearnRefreshesStaleDraftIdentityCache`, fail first in the `beginOwnedSessionTracking` cascade guard and never reach the fixture assertion.

**Source stability.** `sourceStable=false` in -01, -03, -04 and -05 (R1, non-evidentiary). Only other lanes' frontend files changed during the runs:
- -04: `frontend/e2e/start-servers.mjs`, `frontend/src/pages/ChecksStudioPage/pageAuthoringUx.test.tsx` and `frontend/src/services/mocks/studio/studioContract.test.ts`.
- -05: `frontend/src/services/mocks/studio/executionFixtures.ts` and `frontend/src/types/studio/studioTypes.ts`.
- No `backend/` file changed during any run.

**Class names.** Four classes in root's run list sit under `guided/bridge/` and `guided/translation/` but declare `package com.citi.put.checks.studio.guided.session`: GuidedBridgeIntegrationTest, GuidedBridgePlannedIT, GuidedDefaultModelReservationIT and GuidedPlanningIntegrationTest. Their `--tests guided.bridge.*` / `guided.translation.*` names matched nothing in -04, and Gradle does not fail on that. Run -05 used the real names.

## 5. Scratch check (outside Gradle)

V22 on a private `postgres:15-alpine` container (`dara-v22-scratch`, minimal partitioned table): the shapes, the NULL trap, 256/257 `é`, a new `PARTITION OF` month, seq_scan counts and lock modes all matched the IT. Only that container was stopped.

## 6. Grep classification (after all edits)

| Hit | Class |
|---|---|
| `ExecutionReplayFailureMigrationIT.java:111` `flyway(upgradeUrl,"21")` | V21-specific (upgrade source) |
| `ExecutionReplayFailureMigrationIT.java:466` `.isEqualTo("21")` | V21-specific (the lock measurement rolled back) |
| `GuidedPublicationMigrationTest.java:1265` `.isEqualTo(21)` | not a version (probe row count) |
| `GuidedPublicationMigrationTest.java:1337` `…"21", "22"` | updated pin |
| `LegacyV20ConfirmedBaseFixture.java` `target("20")`, `count(*)=20 … max=20` | V20-specific (fixture seed), unchanged |

No other `"21"`, `isEqualTo(21)`, `> 21` or `.target("21")` remains in `backend/src/test/java`.

## 7. Deviations, open questions, observations

**Deviations**
- **D1 (accepted by root).** InferenceMigrationLatestIT description list appended.
- **D2.** `ErrorCodeVocabularyTest` added to the DE runs.
- **D3.** Probe run -02 and the scratch container.
- **D4.** Stale method names and javadoc left (line-only scope): `headIsV21…`, `freshV1ToV21…`, and the `ErrorCodeConstraintMigrationIT.HEAD` and InferenceMigrationLatestIT javadoc.
- **D5.** Pre-existing google-java-format deviations in four pin files, at lines this lane did not touch.
- **D6.** DE agent-memory update (head-pin forms).
- **D7.** Run -05 added, because the root list's package names for four classes were wrong.

**Open questions for root**
- **Q1.** EXIT is withheld by your rule. Every red is ledger R3, verified for GuidedSessionIT and inferred for the other six classes. If you accept R3 for these seven classes, EXIT can be written as-is (V22 and head pins are green). Otherwise it waits for L1-P's projector, with a green re-run of the 7 classes.
- **Q2.** `LegacyV20ConfirmedBaseFixture:802` stays unexercised until `GuidedPublicationReplayIT` gets past R3. Its two callers should be re-checked then.
- **Q3.** Every run except the -02 probe is non-evidentiary under R1; a stable DE exit run needs a hold window.

**Observations (not placed)**
- Write-once and the code/status pairing are enforced only by L1-A's `applyFinal`, as ruled.
- The V17 terminal-settlement guard compares an explicit field list, so the new columns stay writable after settlement.
