# STUDIO-OBS-015 final-window01: Dex-F (@dev) review

2026-10-16. Single writer in backend/, studio-runner/, tools/, docs/specs/. Nothing committed. `--no-daemon`, no `spotlessApply`.
[V] = I ran it or read it. [I] = inferred. Hashes: `sha-before.txt`, `sha-after.txt`, `manifest.json`. Final capture: `final-capture-manifest.json`
(source digest `bdc88539…`, runner dist digest `80d1ba1d…`; both identical in every run wrapper of this window, so source and dist were stable).

## 1. Ledger 83/84 parity (parity.patch) [V]
- `git apply --check -p0` then `git apply -p0`: applied clean. Runner `evidence.ts` now compares stepId/admissionId by code point. New shared vector
  `contracts/v3/timing-order-vectors.json` plus README entry. TS tests 23/23 in `evidence.test.ts`.
- Java: `GuidedRecordingTimingsTest` 11/11 through Gradle (first time this class ran in 015; it was never named by a narrow `--tests`), including both new methods.

## 2. Aria WARN ruling (aria-warn-ruling01) [V]
- `abandonedTeardowns` is now `SELECT count(*) ... pruned_at IS NULL ...` returning `int`. `warnedTeardowns` set removed. `AtomicReference<Instant> nextAbandonedReport` plus
  `reportAbandonedTeardowns(window, interval)`; the sweep no longer warns. Reaper has the `teardown-abandoned-warn-interval` key (default PT15M, rejects <=0 with the existing message) and calls the report after the redrive.
- Tests: T1 modified (sweep never warns; 1 WARN per interval; 2 after the interval), T2 new (query gate, silent at 0, `verifyNoMoreInteractions`), T3 new `GuidedSessionReaperTest` (2 tests). All pass (run `final-w01-warn-parity01`, 20/20).
- Not done: red-before for this ruling. By construction only (T2 does not compile on the old code).

## 3. Pax R4 (whitespace expected value) [V]
- `observationCollector.ts`: `expected !== '' && ...includes(expected)`. Flipped the `'   '` row, added the zero-width-space and `' \n\t­'` rows, added the empty-element test. Parity file: the row left the parity table, added a separate
  `PO R4 divergence` test (pinned Playwright passes `'   '`, runner returns false); header comment documents it.
- Red-before against the H6 collector (e073909b): invoke file 4 failed / 46 passed (exactly the 3 changed/added rows and the new `it`); parity file 1 failed / 10 passed (the divergence test). Logs in `runner/final-window01/`.
- Green after: invoke 27, evidence 23, fixtures parity 11/11 in real Chromium.
- Runner gates: type-check 0, lint 0, full unit tier 2229 passed / 0 failed / 29 skipped (baseline 2223/0/29; +6 = 3 parity-evidence tests, 3 R4 invoke), `check-studio-observed-contracts.cjs` exit 0, `build` exit 0, `check:pins` exit 0.
- New `dist/run/observationCollector.js` sha256 `6e00578d…`; dist digest in the capture manifest.

## 4. Quinn w5-qa-ack04 items
- **B3B-1 extra row [V].** `GuidedPublicationReplayIT`: new mutation `v1-private-value-non-uri` (keeps the non-URI string), label `returned-read-no-t3-credit-v1-private-value-non-uri`, placed before gen-2. Pins `WRITER_REFUSED` and `INVALID_CONTRACT`; `readsDelta` not pinned. Observed in run `final-w01-b3b1-a101`: stage WRITER_REFUSED, code INVALID_CONTRACT (readsDelta was 1; copy in `b3-outcomes/`). The valid-URI `EVIDENCE_MISMATCH` row is unchanged.
- **Fixture hash `86e42679…` -> `a7c9f595…`.** No runner test, script, checkpoint under `studio-runner/`, `tools/`, `docs/specs/` or `backend/src` quotes either hash [V by grep]. The old hash appears only in historical evidence JSON and QA records under `docs/qa/evidence/` and `.aiox/`. I did not rewrite those, because they are audit records of what was true at the time. Runner unit tier and `check:pins` pass without any re-anchor. `publication-fixtures.json` still has sha256 `a7c9f595…` [V].
- **Disclosure correction (3).** `GuidedPublicationAuthorityIT` does read `publication-fixtures.json` (Quinn confirms `AuthorityIT:34`); the earlier w5 review statement that it does not is wrong. AuthorityIT ran in the full test lane after E1: 27/27 pass.

## 5. Aria conflict-stop ruling (aria-conflict-stop-ruling01) [V]
- `GuidedSessionService.publicationConflicted(id)` added exactly per §3.1. `GuidedPublicationRepository.conflict` returns `boolean` (true iff it moved FINALIZING to PUBLICATION_CONFLICT). `GuidedPlanPublisher`: post-claim catch calls the hook only when `conflict` returned true; `conflictBeforeClaim` calls it after `sessions.save(current)`, same lambda.
- **Leftover (a).** `stop()` now finds the target first and writes `teardownStatus=PENDING` only together with the `teardownRequest`. A session with no stop target records nothing. Unit test `stopWithoutAStopTargetRecordsNoPendingTeardown` (spy on `GuidedMaterializationService`: context without `assignmentId`, `identity` throws). Behaviour change: a target-less stop no longer leaves a request-less PENDING row (Aria R-a).
- **Leftover (b).** The post-claim `conflict()` UPDATE now also writes `progress.errorCode = PUBLICATION_CONFLICT`, as the pre-claim path does. The hook reads it back under the same lock.
- Tests: `GuidedPublicationRaceTest` three return-value asserts (13/13 pass); TFIT four new methods per the ruling plus the one stop-target test above.
- `GuidedPublicationRaceTest.secondSession` fixture fix (outside the ruling text, needed to reach the assert): `twoSessionsContendOnActualTestLockOnlyOnePublishes` failed in setup with `EmptyResultDataAccessException` at the evidence fixture because the second session had no `studio_guided_session_policies` row (V19). I copy the primary session's policy row. This failure predates my change; the class had not been run in 015.
- Joined proof: full `guidedIncrementalTest` **62/62** (w5: 61/62), no oracle change; B3B-1 gen-2 `p3AwaitTeardown` now reaches CONFIRMED.

## 6. Runs (collector, fresh labels) [V]
| Label | Selection | Result |
|---|---|---|
| final-w01-warn-parity01 | Timings, Reaper, WARN T1/T2, expiredTeardown*, concurrent, legacy, bridge stopRetry | 20/20 |
| final-w01-b3b1-a101 | B3B-1 alone, before the conflict-stop fix | 0/1 at `p3AwaitTeardown` (W5-F3), A1 row passed beforehand |
| final-w02-conflict-targeted01 | new TFIT + RaceTest | 18/19; 1 fixture failure, fixed |
| final-w02-racetest02 | RaceTest | 13/13 |
| final-w02-tfit-bridge03 | TFIT class + StopKey + BridgeIntegration + BridgePlannedIT | **66/66** (Aria expected 64: 60 + 4; +1 for WARN T2, +1 for the stop-target test) |
| final-w02-full-test04 | full `test` lane | **2260 passed, 127 failed, 25 skipped; exit 1** |
| final-w02-full-incr05 | full `guidedIncrementalTest` | **62/62** |

In the full `test` lane these all pass: ReplayIT 46 + AuthorityIT 27 (= 73, as Aria expected), GuidedSessionIT 44, RaceTest 13, TFIT 39, Reaper 2, Timings 11, BridgeIntegration 9, BridgePlanned 16, StopKey 2.

## 7. What is NOT green, and why I did not touch it
- **127 full-lane failures in 28 classes** (AcceptanceIT, RevisionMigrationIT, StudioAuthoring*, StudioSchedulingSchemaIT 19, SecretUseAuditIT 36, GuidedSessionEvidenceTest 14, GuidedSessionVideoIT 9, GuidedGatewayPrivacyTest 7, and others).
  Sampled messages: fixture `INSERT`s rejected by the new 015 triggers/constraints (`action preparation version mismatch`, `materialization initial identity invalid`, `..._authored_inputs_identity_check`), `BadSqlGrammar` on policy tables, JPA errors. They fail in setup, before any code I changed.
  [I] They are stale fixtures or schema drift in a dirty tree, not caused by this window. I did **not** run a baseline without my changes, so this is an inference. The collector also reports `taskCollectionComplete=false` because the lane has 25 skips and no approved skip list.
- **`SecretAuditLifecycleIT` (2 of 7 fail in fixture setup).** Aria asked for it because `guidedTerminal` now runs for conflict sessions. That check is therefore not exercised for the conflict path; the two failing cases never reach the code.
- Not run: spotless/checkstyle/spotbugs, CodeRabbit. New hunks were checked by hand against google-java-format 1.22.0 in dry-run (JDK 21) and have no diffs; whole-file diffs exist in these files from before.
- Path 15 (post-claim `conflict()`) has no joined body with a live runtime (as Aria noted); it is covered by the RaceTest asserts and the TFIT hook tests.
