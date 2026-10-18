# STUDIO-OBS-015 formal QA gate: DRAFT 01 (Quinn, @qa)

Drafted 2026-10-16 (receipts are stamped 2026-10-17 UTC). This is a draft. No verdict is issued, the story Status is untouched, and nothing in source was edited. [V] means I read or computed it. [I] means inferred and not executed. Machine forms: `gate.yaml` (verdict logic, quality checks, issues, attempt04 slot) and `map.json` (86 + 24 + 55 + 15 + 9 subjects with per-test evidence).

## 1. Binding

- Final source `f071984a46af15a039140e11135c0223092b338fd79d3a985757421ab323cabe`, dist `80d1ba1d43b3f571d9a882459676484bd165ab850143d2ac06b3bd781462467e`. [V] I re-ran the repo's `capture-manifest.py` to a scratch file just now: 1647 files, both digests equal. The tree has not moved since attempt03.
- [V] Between attempt02 and attempt03 exactly two files differ (`ObservationPolicyIT`, `GuidedPublicationReplayIT`, the w8 fixes). No non-backend file differs. attempt03 before equals after.
- "Green at the final source" means attempt03 (the same digest), `w8-flake-full01` (73/73, same digest, ReplayIT 46 + AuthorityIT 27), attempt02 for classes other than those two files, and the carried-forward runner/image/frontend gates whose input digests Gage verified.

## 2. Requirement to evidence map (details in `map.json`)

| Set | PROVEN | PROVEN-BY-RULING | WAIVED (user) | N/A-by-ruling | PENDING-FINAL-RECEIPT |
|---|---|---|---|---|---|
| 86 ledger subjects | 84 | 1 (row 56) | 1 (row 85, clause only) | 13 clauses inside 8 subjects, see below | 0 |
| 24 IPC facets | 24 | | | | 0 |
| 55 SQL subjects | 55 (`GuidedReplayingPrefixMigrationIT` 55/55) | | | | 0 |
| 15 private routes | 14 | | | 5 clauses | 1 (route 6) |
| 9 story items (AC-1..AC-6, O-1, R-2, PO-REQ) | 9, each carrying the attempt04 dependency | | | | 0 |

Reading of "9 story ACs": the six ACs plus the inherited obligation O-1, the R-2 mixed-mode policy ruling, and the binding PO changes (R4, TF-1, TF-2, cap 500, five-file frontend exception, inventory names, bridge disclosure). Tell me if you meant another set.

Changes since `qa-pregate01` (it had 36 PROVEN / 46 PENDING / 3 OPEN / 1 WAIVED):
- **Rows 83 and 84 (GB-1) closed.** `GuidedRecordingTimingsTest` 11/11, the runner comparator is now code-point order, shared vector `timing-order-vectors.json`, `evidence.test.ts` 23/23 including the astral tie.
- **Row 56 (GB-2) closed by evidence, PROVEN-BY-RULING** under `aria-ledger56-ruling01` option C: two `RESULT_SWITCH` fixture rows (2 hits in `publication-fixtures.json`), the `driftOnBoundary` row (`GuidedReplayingPrefixMigrationIT:3023`, class 55/55), B1D-02 exact pins, contracts incremental 140.
- **Row 85** stays a user waiver of the positive equal-key tie clause only. Retained conjuncts passed in attempt03. It is reported as a waiver, never PASS or N/A.
- **Row 31 and route 7 conditionals resolved.** Cross-CSI is exercised (`CSI-B3A-FOREIGN`, `AuthorityIT:1363`). Route 7's precondition is asserted by the test itself (`b3IssuedAboveBirth`, `ReplayIT:5886-5905`) and the case passed.
- **Row 32** (`aV1ShapedWriteIsRefusedAndWritesNothing`) ran: PASS. **Row 35** corpus files: QA static validation (edit-4: 10 steps, k index 3, 3 reused, 7 different; insert: 10 to 11, k index 3, 3 reused, 8 different). **Row 67** selectors now named (Java `ObservedArtifactLowererTest` boundary test, runner `observedReplayValidation` and `observedReplayRoutes`). **Row 47** adequate, with a low advisory: nothing asserts that materialized inputs survive a prune (disclosed F01 residual).
- **The 13 N/A-by-ruling clauses** (ledger 46, 48, 73, 77, 80 x3, 81; routes 1, 2, 8, 13, 14): I concur in draft. Each precondition cannot be built in-repo without fabricating a callback ACK, receipt, history row or second live assignment (designs `b1bcd` section 5b/6, `b2ab` section 9, `b3abc` section 8), and a named companion in the same subject passed in attempt03. The designs call them "kept open, not weakened", so the record must say N/A-by-ruling and must not claim the literal negative.
- **Route 6** is the one PENDING subject. The pregate cited only the `private-value` label, but the family `storedPrivateHistoryCannotBeSubstitutedAtPublicationBoundary` is 8 of 9 green; the red label is `header-count` (Flyway 08001 on a fresh container).

## 3. Seven quality checks

1. **Code review: PASS with observations.** `final01` (NEEDS_WORK R1-R4) and `final02` (R1-R3), `fullsuite-fix01` (RC-1, RC-2) and the w3/w4/w5/new22/r1/r2 acks have their required changes closed: gjf by `spotlessApply`, WARN ruling by Aria, `EvidenceTest` 6/6, R4 guard at `observationCollector.ts:753`, RaceTest errorCode assertion at `:290-295`, cap 500, TF-1 and TF-2 in live source. Observation: w6 (format plus 874 Checkstyle hand fixes), w7 (validator extraction, bytecode-derived line pins) and w8 (test-only) have no QA review record. I read the validator extraction and two G1 helpers (neutral) and the per-class case counts did not change, but `GuidedWireContractTest.outcomeCases()` and `SnapshotBasisParityTest.alteredEvidenceValue` are test restructures I did not review. CodeRabbit was not run (WSL-only); the independent reviews are the fallback.
2. **Tests: CONCERNS.** attempt03 `test` 2412 / 2383 / 4 / 25. `guidedIncrementalTest` 62/62 with a complete cohort. `crossReplicaTest` 2/2. SQL55 55/55. Static tasks 14/14 including `checkstyleTest` with the 2g heap. Carried: runner unit 2229/0/29, fixtures 252/0/9, deployment 322/0/0, contracts, frontend 701/701. The 25 skips are the approved multiset (see section 4). The (class, name) set of the `test` lane equals `fix01-full-test02` plus exactly the TF-1 test, so the w6-w8 windows added or dropped no case. The concern is that **no run has ever been entirely green** (section 5), and JaCoCo verification plus `requireFreshGuidedPartitions` have never executed.
3. **Acceptance criteria: PASS conditional on attempt04.** Section 2.
4. **Regressions: CONCERNS pending attempt04.** ReplayIT default is 43 of 46. The three ReplayIT reds are RG-1 (OBS-007 baseline learn-and-replay) and its two cascade victims RG-2 and RG-3 (OBS-006 refusals). RG-4 is the AuthorityIT label. All four are green on the identical digest in `w8-flake-full01`.
5. **Performance: PASS with observations.** The AC promise is asserted structurally (zero model reservations in the prefix, zero model calls in ordinary replay); timing is OBS-009 D-C by scope. Wall time is stable (5650, 5366, 5621 s). Retries and queues are bounded. Advisory: `pendingTeardowns LIMIT 32` can starve newer rows when 32 or more fail persistently.
6. **Security: PASS with observations.** TF-1 and TF-2 closed; create-path order matches ADR-002 section 27.2; R4 closes a vacuous-pass hole; canary and privacy flags true in both cohorts; callback routes 9-15 refuse forged and mis-bound identities. Carried: KL-015-GRANT, S1 (pre-existing GET lock-before-authorize, OBS-009 AC-9), KL-015-Q4, FOCUS-MUTATION-01, KL-015-R1, F-1, and no real Core/COIN/Vault.
7. **Documentation: PASS with observations.** File List is complete and hash-attributed (277 entries plus the five-file frontend exception). Open: Aria's F4 note for R4 is not in `studio-inference-contract-v1.md` (that file is also marked superseded), a stale `VariableReferenceValidator` Javadoc and a dead private `isBlank`, and the unticked tasks and Quality Gates, which Dex or root must complete after attempt04 (Status must be InReview first).

## 4. Dispositions

- **ED-05 (in-image Node pin): EXTERNAL-OPEN.** `check-pins --require-image` reports Node v24.20.0 in the pinned Playwright image against `.nvmrc` 22. The check itself says to fix the image, which is Platform/SRE's internal Playwright image (open since 10.3, 10.18, 10.19). Every other pin, the image build and the 322-case deployment tier pass, so the pregate's GB-3 (tiers never run) is closed. I do not waive it. It goes in the gate record for the user or PO to acknowledge, and OBS-010 owns closure.
- **KL-015-Q4, FOCUS-MUTATION-01, KL-015-R1, KL-015-GRANT:** carried as known limitations with their OBS-009/OBS-010 placements. None changes an AC, task or ledger row. The disclosed fixture adjustments (`Reports overview` literal; B1C-01 and `assert-fail` mutation moved from focus to change) stand.
- **Authority tier:** T1/T2 disclosures apply (in-JVM Core fixture, `FakeStudioVaultProvider`, `controlledLoginEntitlement`). Real Citi Core/COIN and real HashiCorp Vault are not exercised and are not 015 obligations. The F-1 citation limit applies to `GuidedSessionIT` and `GuidedServiceTransportFaultIT`.
- **Row 85:** user waiver, clause only.
- **25 skips: ratified.** [V] attempt03's skip multiset equals `approved-historical-skips.json`. 18 are the `DEFERRED STUDIO-OBS-009 AC-6/T3` scheduling tests (`StudioScheduleApiIT` 16, `SharedSchedulingIT` 2) placed by the OBS-012A rulings R1/R7 and tracked in OBS-009 AC-6. The other 7 are `@Disabled` at HEAD or externally gated criteria (ExternallyGatedCriteriaTest 3, ExecutionVideoExternallyGatedCriteriaTest 2, GuidedProviderEvaluationTest 1, ExecutionReadinessTest 1). Scheduling regression coverage is deferred to OBS-009, not lost here.
- **Deploy constraint** and the 44 frontend M12 leftovers are mapped to OBS-008.

## 5. Open items, stated plainly

1. **No single green run.** attempt01 had 7 failures (stale line pins, fixed). attempt02 had 20 (a probable temp-file read race, a random-CSI collision, and an 18-test latch cascade; fixed in w8). attempt03 had 4. The failure sets are disjoint. Every one of the 2412 cases has a PASS at inputs equal to f071984a, but that is a union across runs, not one run. attempt04 has to produce the single run. A fourth different transient failure is possible and I cannot put a probability on it from three samples.
2. **The attempt03 CONTEXT_LOST has no known cause.** In `ownership.ts:139` any exception from `GuidedRuntime.start()` becomes `CONTEXT_LOST`, and the launch catch at `runtime.ts:157-160` drops the inner error, with no log at either site. The runner was alive and answered a schema-valid closed 409, the browser had started, and the failure came inside about 2.4 s after the journal consume. The diagnosis ruled out the w8 change and the first-use initial-context diagnostic, but it cannot name a cause. Separately, the "4000 output tokens" in the failing assertion is probably the lane's declared output ceiling charged per proposal (the test-lane cohort says `declaredOutputCeiling 4000`), not a truncation [I]. As a product concern this is diagnosability: a real start failure in production would look identical and could not be investigated. Fixing it means a runner change, which reopens the runner, image and deployment gates, so it is a user scope decision. **Stop-loss:** if `CONTEXT_LOST` at the context push recurs in attempt04, do not rerun a third time; the verdict is FAIL pending that decision.
3. **JaCoCo and `requireFreshGuidedPartitions` are unevaluated.** Offline, I ran the JaCoCo 0.8.12 core library over the archived attempt03 exec files and the existing classes (a scratch tool, not Gradle). Bundle line coverage 0.908 against 0.70; `dispatch` 0.853, `internal` 0.899, `recovery` 0.889, `sse` 0.918 against 0.75. The `compile` and `compile.gateway` rules match no package after OBS-012A (the OBS-013 gate recorded the same). The estimate is from a run with 4 failed tests, so the real figure can only be slightly higher. For `requireFreshGuidedPartitions` I read the cohorts: `guidedIncrementalTest` 62 invocations, none failed, all completeness flags true; the `test` lane has 46 invocations with the 3 ReplayIT reds. It will pass only if all 46 and all 62 pass in the same run.
4. **Test suite shape.** ReplayIT is class-scoped and order-dependent, so one failure reads as several and single-test reruns are not valid evidence. The two P7 tests fail when run alone.
5. **Unreviewed windows** w6-w8 (section 3, check 1) and an unrelated L1 edit in the tree (`.aiox-core/core/permissions/dispatch-governance.js`, +20/-4) that is outside the 015 File List and that I did not review.

## 6. Draft verdict

- **attempt04 green** (test lane 2412 / 2387 / 0 / 25 with the approved skip multiset, `guidedIncrementalTest` 62/62, `crossReplicaTest` 2/2, SQL55 55/55, JaCoCo executed and passed, `requireFreshGuidedPartitions` executed and passed, digest still f071984a / 80d1ba1d): **CONCERNS**, with REL-001, TEST-001, REQ-001 (ED-05) and the low items listed in `gate.yaml`. The story then moves InReview to Done, exactly as it would under PASS. PASS needs the user or PO to record ED-05 as an accepted external item; that is theirs to give, not mine.
- **attempt04 red, new and infrastructure-classified:** one more full attempt, then stop and go to the user. Two consecutive red full runs end the loop.
- **attempt04 red with `CONTEXT_LOST` at context push:** FAIL, no rerun (item 2 above).
- **attempt04 red deterministically, or a JaCoCo or `requireFreshGuidedPartitions` failure:** FAIL, back to Dex.
- Never: approval with a failing test, an incomplete collection, or a digest other than f071984a.

## 7. What is needed before I issue

1. attempt04 receipt (label, exit, counts, elapsed, JaCoCo and `requireFreshGuidedPartitions` outcomes, before/after digests). Run it with the host idle: Chromium, other agents and Spotlight indexing on the worktree are the circumstantial common factor in the attempt03 diagnosis.
2. Dex or root: Status to InReview, tick T0/T1/T3/T4/T5/T6 and the Quality Gates only where their evidence is the final receipt. QA does not tick them.
3. User or PO: acknowledge ED-05 as external (for a PASS label) and decide whether REL-001 is scheduled.
4. Optional: a QA record of the w6-w8 diffs from their manifests, which needs no build.

## 8. What I ran and did not run

Ran, all read-only: sha256 and JSON analysis of the receipts and collector results; `capture-manifest.py` to a scratch file; greps over source and docs; parse of the two corpus files; a scratch JaCoCo analysis of archived exec files. Not run: Gradle, JUnit, vitest, Chromium, Docker, any test or build, CodeRabbit. Scratch files are under the session scratchpad; nothing outside `qa-formal-gate-draft01/` was written.
