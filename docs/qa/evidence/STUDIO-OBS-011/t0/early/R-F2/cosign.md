# R-F2 co-sign — CLN-F2 (historical V18 publication adapter)

- **Signer:** @data-engineer (Dara), 2026-10-18
- **Verdict:** **SIGN-WITH-NOTES**
- **Method:** read-only (`grep`, `sed`, `cat`, `shasum`). No gradle, no database, no docker. Every coverage claim below is from reading the source. **Nothing was run.** Labels: [V] = read in source or migration at the hashes below; [I] = inference.
- **HEAD:** `b39359f78`. Files read (sha256, first 12 characters):
  - `support/GuidedPublicationEvidenceFixture.java` `2ad3d7cb00d5`
  - `guided/publication/GuidedPublicationMigrationTest.java` `9b8b38e4bd7b`
  - `InferenceMigrationIT.java` `58bc1a01c84c`
  - `InferenceMigrationLatestIT.java` `14f748837bfd`
  - migrations V12, V13, V15, V19–V22

## 1. Ruling question and answer

Is upgrade-with-data coverage at the V18 boundary still needed? **No.**
- No environment holds a V18 Studio population (ADR-SC-005 D-B).
- The adapter refuses every database except one stopped at exactly V18. Its guard is `requireV18`, fixture `:875-898` [V].

Every database rule the adapter exercised is either:
- still live at V22 and already pinned by a head test, or
- live at V22 and **ported** by this co-sign (§3).

None of the fixture cases touch grants. Runtime-role grants stay pinned by `GuidedRuntimeRolePrivilegeIT`, which is not affected.

## 2. Notes that bind the 11-LEFT execution

- **N1 — Retire the adapter, not the file.** `GuidedPublicationEvidenceFixture` stays. Its head methods (`freezeSource`, `completeExistingSession`, `captureSharedBootstrap`) have 7 importers [V]:
  - `GuidedPublicationRaceTest`, `GuidedPublicPresentationIT` (the two Dex named);
  - also `ObservedPublicationFixture`, `LegacyV20ConfirmedBaseFixture`, `ObservedCoRunIT` and `GuidedPublicationMigrationTest`.

  **Delete:**
  - `freezeHistoricalV18Source`, `completeHistoricalV18Session`, `requireV18` and `readHistoricalV18` (to the end of its helpers, about `:900-1083`);
  - the private `boolean historical` parameter (`:55`, `:321`) and every branch on it (`:62`, `:142`, `:344-348`, `:646-653`, `:802-829`, `:867`).

  **Keep:** the `historical == false` path, unchanged in behaviour. `obs011-left-01` covers the two importers that run; compiling the test source set covers the rest.

- **N2 — Delete `InferenceMigrationIT` as a whole class.** Its `@BeforeAll` stops at `target "18"` (`:69`), so no case in it can run at head.
  - It has **4** `@Test` methods, not 5. `grep -c @Test` also counts `@Testcontainers`.
  - `GuidedPublicationMigrationTest` has 12 `@Test` methods. Only one touches V18: lines `:1633-1635` (see R-8). The rest of the V18 surface is the helpers `:1866-1887`, the `historicalV18` branches in `prepare`/`publishObserved` (`:1896-2280`), `probeHistoricalAdapter`, `commitHistoricalV18` (`:2502`), `verifyHistorical*` (`:2812`, `:2884`), `changedHistoricalCommand`, `historicalRows` and `HistoricalFault`.

- **N3 — Widen the exit grep.** `HistoricalV18|requireV18` misses the lowercase and auxiliary names. Use:

  `grep -rnE 'HistoricalV18|requireV18|historicalV18|HistoricalFault|probeHistoricalAdapter|changedHistoricalCommand|historicalRows|verifyHistorical|readHistoricalV18|historical-v18' backend/src`

  - Expect **0**. Positive control at `b39359f78` = **78** [V]. The narrow form = 25 [V].
  - Do **not** add a repo-wide `target("18")` grep. `GuidedGovernanceMigrationIT:957`, `GuidedRuntimeRolePrivilegeIT:208,:794` and `GuidedSessionIT:154` are legitimate migration-delta tests and stay.

- **N4 — Fix stale prose.** `GuidedPublicationMigrationTest` Javadoc `:75-76` ("V11/V18 upgrade assertions") and `:1834-1836` ("historical V18 helper") must be corrected in the same change.

- **N5 — Red proof for each port.** Each port in §3 shows red against a mutant and green against the real schema. Record this under `execution/left/`.
  - Mutants are rollback-only, inside the test's own transaction. Examples: `CREATE OR REPLACE` the guard function to `RETURN NULL`, or `DROP INDEX`.
  - **No migration file is edited.** Migrations stay prohibited and immutable.

- **N6 — Write set for P-3.** P-3's natural home is `GuidedReplayingPrefixMigrationIT`. That file is **not** in 11-LEFT `writes`, and no lane in `lanes.v3.json` holds it [V grep].
  - Root adds it to 11-LEFT `writes`, limited to the one case named in P-3, **or**
  - P-3 is carried forward by name. It is never dropped.

- **N7 — Java-held rules (§5).** These are outside my database co-sign. I list them so @qa's "every retired case names its covering head test" check (`qa-cosign.md:125`) has a complete list.

## 3. Port list — live DB rules at V22 that no head test pins

| # | From (case / probe) | Live rule at V22 [V] | Head coverage today [V grep] | Target test (port) |
|---|---|---|---|---|
| **P-1** | `InferenceMigrationIT#reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot` (`:181-267`) | V15 `studio_publication_step_metadata_guard()` + `tr_publication_step_metadata_guard` (`V15:504-543`). No V19–V22 migration replaces or drops it; V21 adds the separate `tr_015_revision_guard` (`V21:814`) | **none.** The messages "step reuse must preserve same-scope published snapshot hash" and "step snapshot authored coordinate mismatch" appear only in `InferenceMigrationIT` | **`InferenceMigrationLatestIT#reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot`** (same name). Use the head `GuidedPublicationMigrationTest.publishObserved` and `prepareObserved(ds, id, existingTestId, …)`. Keep `SET CONSTRAINTS tr_publication_step_metadata_guard IMMEDIATE`, so the V15 guard decides the row before the deferred V21 guard (rollback-only). Keep all three branches: same-test accept, other-test reject, coordinate mismatch. `ui_test_revisions` has no column change V19–V22 [V], so the raw INSERT shape carries over. That it passes the immediate V12 capture trigger at head is [I], and the red/green run proves it |
| **P-2** | `InferenceMigrationIT#baselineIndexRequiresTruthfulFullMarkerAndSurvivesExecutionRetention`, index half (`:280-286`) | V13 partial index `idx_ui_test_exec_full_baseline … WHERE execution_scope='FULL'` (`V13:366`); never dropped [V] | **none** (only `InferenceMigrationIT:283`) | **`InferenceMigrationLatestIT#historicalExecutionCannotBeRelabelledAsFullEvidence`**: add the `pg_indexes` definition assertion |
| **P-3** | `GuidedPublicationMigrationTest` `probeHistoricalAdapter` fault `WRONG_RECEIPT_HASH` (`:2433-2443`, run by every `InferenceMigrationIT` publish) | V21 `studio_publication_receipt_guard()`: `document.artifactHash` must equal `publicReceipt.artifactHash`, else `'publication receipt shape invalid'`, SQLSTATE P0001 (`V21:883-895`) | **none.** Head negatives cover only the extra key and `relearnedFrom` (`GuidedReplayingPrefixMigrationIT:3011-3040`) | **`GuidedReplayingPrefixMigrationIT#publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys`**: one more `reject`, with `document.artifactHash` set to `"0"×64`. **Subject to N6** |

## 4. Retire by name — obsolete, or covered at head

| # | Case / probe | Why | Covering head test [V] |
|---|---|---|---|
| R-1 | `InferenceMigrationIT#freshInstallStopsAtAdditiveVersionAndUpgradeInventsNoHistory` | Asserts the V18 boundary itself (`max(version)=18`) | `InferenceMigrationLatestIT#freshAndUpgradedDatabasesReachTheSameHeadWithoutStagedV19` (head 22, no compile registry, no staged V19, fresh = upgraded catalog); `#upgradeToHeadRewritesNoHistoryAndInventsNoEligibility`; `RevisionMigrationIT#carriesNoStoredCompileState` (compile tables + `ui_tests` compile columns). Residual: the absence of 4 retired `ui_test_revisions` columns (`compilation_fingerprint`, `baseline_revision_id`, `expected_intent`, `intent_derivation_version`) is not pinned at head. This is a column absence, not a live rule. **Optional** one-line add to the `freshAndUpgraded…` case; non-blocking |
| R-2 | `InferenceMigrationIT#revisionMustMatchCaptureAndProtectsEveryNewColumn` | V12 capture + write-once guard; live and covered | `InferenceMigrationLatestIT#everyObservedRevisionColumnRemainsImmutableOnTheHeadSchema` (capture = draft, later edit unreachable, named columns) + `#everyRevisionColumnIsImmutableOnTheHeadSchema` (every column, catalog-driven) + `#confirmationSourceIsGuidedRunOnlyAndImmutable` (`confirmed_at`) |
| R-3 | `InferenceMigrationIT#baselineIndex…`, guard and retention half | V13 scope-immutable trigger; retention | `InferenceMigrationLatestIT#historicalExecutionCannotBeRelabelledAsFullEvidence`, `#fullExecutionCannotBeRelabelledToNull`, `#scopeGuardCoversExistingAndFuturePartitions` |
| R-4 | probe `MISSING_RECEIPT` (`fk_observed_revision_receipt`, 23503) | V15 deferred FK, live | `GuidedReplayingPrefixMigrationIT#prefixConfirmationAmendmentPreservesPopulatedV20AndAllExistingGuards` (`:3666-3669`, at head: `@BeforeAll` migrates with target `null`). Note: it asserts the message, not the SQLSTATE |
| R-5 | probe `EXTRA_PUBLIC_FIELD` | The V18 shape (no `relearnedFrom`) is obsolete. Head **requires** `relearnedFrom` | Closed key set: `GuidedReplayingPrefixMigrationIT#publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys`. Required null: `#publicationReceiptRequiresExplicitNullBeforeAnyCommittedSwitch` |
| R-6 | `publishObserved(…, true)` tail: joined row count + "`publicReceipt` lacks `relearnedFrom`" (`:2262-2281`) | V18 receipt shape; inverted at head | `GuidedPublicationMigrationTest#validatedRelationalCycleCommitsOnceAndKeepsHistoricalReceiptAfterExpiry` (`relearnedFrom` present and null; immutable delete) |
| R-7 | `System.out` catalog dumps `[historical-v18-*]` (`:2227-2260`) | Diagnostics only, no assertion | — |
| R-8 | `GuidedPublicationMigrationTest#validatedRelationalCycle…` lines `:1633-1635` only | Tests that the adapter refuses at head (adapter self-guard) | Delete these 3 lines. **The test stays.** |
| R-9 | Adapter-only fixture branches (V18 policy stub `historical-v18-structural-fixture`, no `attempt_ordinal` column, `readHistoricalV18` preimage rebuild) | They exist only because the V18 schema lacked V19+ stores | Head path (`historical == false`) is unchanged |

## 5. Java-held rules exposed only by the adapter probe (advisory, N7)

The probe ran the adapter's **own copy** of the commit prechecks (`commitHistoricalV18`) against V18 SQL. For each rule, the production equivalent is live in `GuidedPublicationRepository`.

| # | Probe item | Production head coverage | Action |
|---|---|---|---|
| J-1 | `finish` with a verdict whose `basisHash` differs → `EVIDENCE_MISMATCH`, attempt stays `VALIDATING` (`:2163-2186`). This runs the **production** `publications.finish` | No head test mutates a verdict [V grep `erdict.deepCopy()` → this site only] | **Port** into `GuidedPublicationMigrationTest#validatedRelationalCycle…`, before the good `finish` (in the 11-LEFT write set) |
| J-2 | `STALE_CAS`: draft soft-deleted before commit → `PUBLICATION_CONFLICT` | Production predicate `deleted_at IS NULL` (`GuidedPublicationRepository:405`). No `guided/publication` head test sets `deleted_at` [V grep] | **Port** into `GuidedPublicationMigrationTest`: a rollback probe in the same case, or a new case |
| J-3 | Invalid commands: wrong claim, wrong snapshot identity | `GuidedPublicationAuthorityIT#directCurrentCommitKeepsExactClaimAndGrantAuthorityWithoutAnyWrite` (`claim`, `snapshot`) | Retire |
| J-4 | Invalid commands: wrong candidate policy, wrong basis | [I] `GuidedPublicationAuthorityIT#ordinaryCurrentCommitRechecksCompleteStoredEvidenceAndRollbackRemovesEveryWrite`, not verified | Dex cites the covering case, or ports |
| J-5 | Expired grant → `FORBIDDEN_SCOPE` | `GuidedPublicationAuthorityIT#directCurrentCommit…` (`grant-expired`) | Retire |
| J-6 | Authority mutations: `source_revision` / `configuration_revision` | `GuidedPublicationRaceTest#independentSourceWriterFencesAnAlreadyValidatedCandidate` | Retire |
| J-7 | Authority mutations: fence, lease | `GuidedPublicationRaceTest#terminalOrChangedAuthorityCannotAdoptOrBeOverwrittenByLateConflict` | Retire |
| J-8 | Authority mutations: `state=OBSERVING`, wrong `workerId`, session `expiresAt` past, `confirmed_revision_id=NULL` | [I] not verified at head | Dex cites the covering case, or ports into `GuidedPublicationMigrationTest` |
| J-9 | Absent attempt → `EmptyResultDataAccessException` | Adapter SQL only | Retire (obsolete) |
| J-10 | `POST_WRITE` rollback | `GuidedPublicationMigrationTest#validatedRelationalCycle…` ("fault-after-write", `:1636-1648`) | Retire |

## 6. Exit check for the CLN-F2 part of 11-LEFT

1. P-1, P-2 and J-1, J-2 are present, each red against its mutant and then green.
2. P-3 is either landed (after the N6 write-set amendment) or carried forward by name.
3. J-4 and J-8 are each cited or ported.
4. `InferenceMigrationIT.java` is deleted. The adapter members of `GuidedPublicationEvidenceFixture` are removed and the file stays.
5. The N3 grep returns 0 (control 78).
6. `obs011-left-01` is green, without `InferenceMigrationIT` in its filter list.
7. `git diff --stat backend/src/main/resources/db/migration` is empty.
