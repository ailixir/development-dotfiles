# STUDIO-OBS-011 T0 skip policy — Quinn (@qa)

Issued 2026-10-18 during the frozen B1 run. This is an expected-skip policy, not a story verdict. Full B1 reconciliation is still owed while B1 is live.

The machine file is `approved-skips.json` in this folder. It has **9 exact task/class/name entries**, all on `test`; no skips are approved on `guidedIncrementalTest` or `crossReplicaTest`. Its SHA-256 is `6bd2a808a40a707397757b3ff4f1a78e5eff8ee37666c7b26271582b14457cac`.

## Derivation and provenance

[V] I extracted the exact nine skip identities from the six relevant class XML files in `STUDIO-OBS-009/local-gate-20261018/c8-test-results/test/`, independently compared their multiset with the B1 placeholder, and obtained equality. I re-read the six current test sources and the 011 lane write sets. These tests have the same names, their external or contract prerequisite remains open, and none is a named 011 retirement or port. Thus the 011 expected backend delta is **9 − 0 + 0 = 9**. The policy is independently issued from the observed identities; it does not approve a new skip.

[V] The live B1 log already records the two `ExecutionVideoExternallyGatedCriteriaTest` skip display names exactly. The other seven current-B1 identities are not yet available in fresh finalized task XML at this snapshot. They are supported by the archived XML and current source, not represented here as already observed in B1. At B1 completion compare all task-qualified skipped identities from `obs011-t0-baseline-check01-task-outputs/<task>/xml` or its `-results.json` against this policy. An extra, missing, renamed, moved-task or duplicate skip is a finding; never pad the policy to make the run green.

The B1 input `execution/qa/approved-skips.json` remains byte-identical at SHA-256 `c6f16987430a332b80a065308a2c9b0ef9adccd478b9be64a02e1cb459cd09dc`. It is preserved as B1 provenance. 11-G names the new `t0/qa/approved-skips.json`; no running command was changed.

## Decisions by identity

Full class and display names are authoritative in the JSON. Abbreviations below are only explanatory.

| Identity | Reason retained | Current source |
|---|---|---|
| `ExecutionVideoExternallyGatedCriteriaTest`: AC-18b ranged real Sonic reads | ED-03/SPK-03 external bucket evidence is unavailable; skipped is never passed | `backend/src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoExternallyGatedCriteriaTest.java:38–46` |
| same: AC-19b real ingress route | ED-06/SPK-02 external ingress proof remains open | same source `:52–62` |
| `GuidedProviderEvaluationTest.approvedProviderEvaluationIsReportedUnavailableWithoutExplicitConfiguration(TestReporter)` | JUnit assumptions report `UNAVAILABLE_NOT_RUN` without approved provider configuration/admission. No real provider calls are authorized here | `.../guided/translation/GuidedProviderEvaluationTest.java:55,84,91` |
| `GuidedSchemaProbeIT.approvedGatewayProbeAcceptsEveryGuidedProjectionSchema(TestReporter)` | ED-01 live gateway/schema acceptance remains external; local schema checks are separate passing cases, never waived | `.../guided/translation/GuidedSchemaProbeIT.java:373,403,408` |
| `ExecutionReadinessTest.targetPolicySelectionAdvancesTheConfigurationRevision()` | AC-24 target-policy selection is still absent from the frozen test contract; explicit existing `@Disabled` | `.../readiness/ExecutionReadinessTest.java:185–186` |
| `ExternallyGatedCriteriaTest`: AC-13b real-material canaries | ED-02 integrated real material proof is unavailable | `.../secrets/ExternallyGatedCriteriaTest.java:53–59` |
| same: AC-7b real revocation | ED-02 non-bypassed revocation proof remains external | same source `:41–47` |
| same: AC-5b real vault policy confinement | ED-02 real vault policy proof remains external | same source `:28–35` |
| `VaultPolicyIT`: named AC-4 UNRUN / REHEARSAL_ONLY_NON_CREDITING | Explicit `Assumptions.abort`; ED-02/U5 owner PUT Core/BFF. U19 image-pull authorization remains absent. A rehearsal cannot satisfy the external criterion | `.../secrets/VaultPolicyIT.java:30–40` |

## 011 retirement and port reconciliation

[V] `11-LEFT` owns CLN-F2 historical V18 retirement with named ports into `InferenceMigrationLatestIT` and, by the R-F2 co-sign, `GuidedReplayingPrefixMigrationIT` for P-3. Those are executed-case moves, not approved skips. Its lane receipt must name each retired/ported case and the final archive must prove the destination cases pass. No skip is added or removed from this backend policy for those moves.

[V] `11-FOLD-final` ports guided-bridge and publication authorization assertions to folded clients (`DispatchAuthorizationIT` and existing/new dispatch tests); the receipt must reconcile names and counts. None of the nine skip classes is in that port set.

[V] `11-RT` R-40 removes four named pointer `it.skip` entries in **runner Vitest**. Reconcile that change against runner B2, separately: expected runner skipped count 29 → 25 if the four conversions land and no other named delta exists. They are not Gradle skips and must never enter this file. The T0-EP conditional evaluation-file deletions likewise need named runner inventory accounting. No blanket skip allowance follows from retirement.

No local coverage, migration, scheduler, lifecycle, transport, publication, TLS, canary-scan, provider-stub or worker case is pre-approved to skip. The re-enabled 18 OBS-009 scheduling cases remain required passes. The collector's exact-key schema `{task,class,name}` is verified at `execute-011/run-backend-tasked.py:100–109`; reasons belong here, not in the JSON. The collector compares a multiset and checks that the policy file did not change during a run (`:203–213`).

## Outstanding confirmation

B1 is live and already has ReplayIT reds. A red is never converted to a skip. The final skip multiset, coverage, source stability and baseline acceptance remain owed to root/QA. If all nine observed B1 identities match, append the final collector/archive reference and comparison result here; retain the issued policy bytes unless a justified named policy change is necessary before 11-G.
