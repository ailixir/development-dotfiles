# STUDIO-OBS-009 G9: expected-skip multiset (lane QA-W0, 2026-10-17)

- **Author:** Quinn (@qa). Docs only. Machine form: `approved-skips.json` (same folder).
- **State: NOT FINAL.** Entry 8 (`VaultPolicyIT`) is **final pending lane S/D3 confirmation**. Entries 1-7 are firm. Until entry 8 is resolved, the JSON carries a sentinel name that cannot match any real case, so a G9 run against this file fails closed with `EXACT_SKIP_POLICY_MISMATCH`. That is intended.
- **Not a verdict.** This file approves a set of expected skips. It is not a gate decision and does not change any story status.
- **Legend:** **[V]** = verified this session by reading a file or running the read-only command named. **[I]** = inference, with its basis.
- **What I ran:** reads, `ls`, `grep`, and `python3` (multiset comparison, JSON check). No Gradle, test, build, Docker, git write or stash. I wrote only this file and the JSON beside it.

## 1. Format limit (read this first)

The collector (`.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py`, lines 105-109) accepts an entry only if its key set is **exactly** `{task, class, name}`, all non-empty strings, with `task` among the selected test tasks. [V] So the JSON cannot carry a `reason`, `source` or `pending` field. Reasons and sources are in the table in section 4 instead, and the pending state lives in this file and in the sentinel name. The collector compares the observed skipped `(task, class, name)` multiset to the file exactly, and also fails if the file changes during the run. [V `:203-213`]

## 2. Derivation in brief

| Step | Count | Basis |
|---|---|---|
| 008 approved list (same as the 015 list) | 25 | [V] `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/final-gates/approved-historical-skips.json` |
| Skipped cases actually observed in the 008 final check | 25, as a multiset equal to the list | [V] `execution/obs008-final-check01-results.json`: `counts.skipped = 25`, all 25 under task `test`, 0 skips under `guidedIncrementalTest` (62) and `crossReplicaTest` (2); my `python3` Counter comparison returned equal |
| Minus the 18 AC-6 deferrals (re-enabled by 009 T3) | -18 | section 3 |
| Retained skips | **7** | section 4 |
| Plus new 009 skip: `VaultPolicyIT` rehearsal, no image pull | +1, pending | section 5 |
| **Expected at G9** | **8 entries (7 firm, 1 pending)** | |

## 3. The 18 that drop out (AC-6 re-enables them)

- **Which:** `studio.scheduling.StudioScheduleApiIT` 16 and `scheduling.SharedSchedulingIT` 2. Each has a method-level `@Disabled` whose reason starts `DEFERRED STUDIO-OBS-009 AC-6/T3:`. [V] story AC-6 a (`STUDIO-OBS-009.story.md:113-116`); my regex over the two source files found exactly 16 and 2 such methods, and their names equal the 18 entries in the 008 list (set equality, no extras either side).
- **Why they drop:** AC-6 says "re-enable these 18 and get them green", "AC-6 is not met while any of them is skipped. A skipped test is never counted as a pass", and the AC-6 e tripwire requires `grep -rn 'DEFERRED STUDIO-OBS-009' backend/src/test` to return 0 on the final tree. [V story `:113`, `:140`; T3 task `:486`]
- **Current tree:** both files still carry all 18 `@Disabled` annotations today (`grep -c` gives 16 and 2). [V] That is expected until lane S/T3 lands. It is why the file lists none of them: at G9 each must be PASS. If any of the 18 is still skipped at G9, the exact-multiset check fails and AC-6 is not met. Do not add them back to make a run green.

## 4. The 7 that stay (firm entries 1-7)

All are in the 008 list, names unchanged. I re-read each source today.

| # | Class | Case name in the JSON | Why it stays skipped at G9 | Source |
|---|---|---|---|---|
| 1 | `studio.evidence.ExecutionVideoExternallyGatedCriteriaTest` | `AC-18b — ranged reads against real Sonic (ED-03 / SPK-03 / 10.18 / 10.19)` | `@Disabled`, BLOCKED on ED-03 (real Sonic bucket). External, not a 009 AC. | [V] test source `:38`, `@DisplayName :46`; story AC-6 e names "ExecutionVideoExternallyGatedCriteriaTest 2" as the 6 pre-existing annotations |
| 2 | same | `AC-19b — the media route through the real ingress (ED-06 / SPK-02 / 10.18 / 10.19)` | `@Disabled`, BLOCKED on ED-06 (real ingress). | [V] `:52`, `@DisplayName :62`; story AC-6 e |
| 3 | `studio.guided.translation.GuidedProviderEvaluationTest` | `approvedProviderEvaluationIsReportedUnavailableWithoutExplicitConfiguration(TestReporter)` | Not `@Disabled`. It uses `assumeTrue` and skips `UNAVAILABLE_NOT_RUN` when no approved live-provider configuration exists. 009 makes no real-provider call: budget admission is `ADMISSION_REFUSED_PRICE_UNKNOWN`. | [V] test source `:84`, `:91`; decisions.md B8 line; story `:150` ("No real-model evidence exists today (`GuidedProviderEvaluationTest` skips `UNAVAILABLE_NOT_RUN`)") |
| 4 | `studio.readiness.ExecutionReadinessTest` | `targetPolicySelectionAdvancesTheConfigurationRevision()` | `@Disabled("AC-24 — target policy selection is not yet a field on the frozen test contract")`. No 009 AC adds that field. | [V] test source `:185`; story AC-6 e ("ExecutionReadinessTest 1") |
| 5 | `studio.secrets.ExternallyGatedCriteriaTest` | `AC-13b — canaries through the integrated path with real material (ED-02 / 10.19)` | `@Disabled`, BLOCKED on ED-02 (real vault material). | [V] test source `:53`, `@DisplayName :59`; story AC-6 e ("ExternallyGatedCriteriaTest 3") |
| 6 | same | `AC-7b — real revocation through a non-bypassed session (ED-02 / 10.18 / 10.19)` | `@Disabled`, BLOCKED on ED-02. | [V] `:41`, `@DisplayName :47` |
| 7 | same | `AC-5b — resolution confined by the real vault's own policy (ED-02 / 10.18 / 10.19)` | `@Disabled`, BLOCKED on ED-02. | [V] `:28`, `@DisplayName :35` |

Cross-checks on the retained set:
- [V] `grep -rn '@Disabled'` over `backend/src/test/java` outside the 18 returns exactly 6 hits: ExternallyGatedCriteriaTest 3, ExecutionVideoExternallyGatedCriteriaTest 2, ExecutionReadinessTest 1. This equals the AC-6 e target "6 + 0".
- [V] The only other skip mechanism in the test tree is `GuidedProviderEvaluationTest` (`assumeTrue`): `grep -rlE "assumeTrue|assumeFalse|Assumptions|EnabledIf|DisabledIf|assumingThat|EnabledOn|DisabledOn"` returns that one file. So 6 + 1 = 7, with no skip source I missed in the current tree. [I] A new test written by a later lane could add one; see section 7.
- [V] The `name` field is the JUnit XML `testcase` name: `@DisplayName` text for the five annotated cases, `method(params)` for the others. This is how the 008 collector recorded them, so the strings are copied byte for byte from that file.
- All 7 are under task `test`. [V] 008 recorded no skip under `guidedIncrementalTest` or `crossReplicaTest`.

## 5. New 009 entry (pending): `VaultPolicyIT`

- **Entry 8:** class `com.citi.put.checks.studio.secrets.VaultPolicyIT`, task `test`, name = sentinel `PENDING-LANE-D3-CONFIRMATION: ...`.
- **Trace:**
  - AC-4 note A18: "Without that authorization, the rehearsal is skipped by name, and the skip is listed in the QA approved-skips file." [V story `:106`]
  - Authorization is not given: decisions.md "Vault image pull: not authorized. The A18 rehearsal is skipped by name (`REHEARSAL_ONLY_NON_CREDITING`, owed)." [V]
  - Register U19: "a skip is by name and is listed in the QA approved-skips file", state `NOT_SATISFIED`. [V `prerequisite-register.json`]
  - Class and owner: `secrets/VaultPolicyIT.java (new; rehearsal or unrun-by-name)`, lane D3. [V `lanes.json`]
  - My D2 spec, section 2.4 and open item 4/5: "8 if the dev-Vault mode of `VaultPolicyIT` is a JUnit skip". [V]
- **Not in the repo yet.** `find backend -name 'VaultPolicyIT*'` returns nothing. [V] The test name, the skip mechanism and whether it is a JUnit skip at all are lane D3's choice.
- **Assumption this entry rests on [I]:** lane D3 implements the no-pull case as **one** test method that reports as SKIPPED (via `assumeTrue`, `@Disabled`, or an env-gated `@EnabledIf...`), exactly **one** skipped case in `VaultPolicyIT`, under task `test`, with the rehearsal labelled `REHEARSAL`, `credit: none`.
- **How the entry is resolved (lane S/D3 confirmation, then QA edits the file):**

  | What D3 builds | Action on the JSON |
  |---|---|
  | One skipped method (expected) | Replace the sentinel `name` with the exact XML `testcase` name D3 produced (read it from a D3 run's XML; do not guess). File becomes final with 8 entries. |
  | N skipped methods | One entry per skipped case, each by observed name. Entry count becomes 7 + N. |
  | `VaultPolicyIT` never skips (for example the container is a cached image, or the test is a unit-level policy-document check with no container) | Delete entry 8. File is final with 7 entries. Then `VaultPolicyIT` must be green, and the report says "dev-Vault half unrun, owner PUT Core/BFF (ED-02)" separately. |
  | Skips through a mechanism that a bare skip does not capture (for example the class errors) | Not acceptable. A rehearsal that errors is a failure, not a skip. Back to @dev. |

- **Rule that holds whichever shape D3 picks:** the skip never becomes a pass and never counts toward AC-4, GO condition 3, the OBS-010 release row, the D2 trigger or Done. [V story `:106`]
- **If the user later authorizes the image pull (U19):** the rehearsal runs, the entry is removed, and the file is re-issued (new sha256). [I]

## 6. Reconciliation arithmetic

After the baseline-to-G9 change, by name: `skipped_after = 25 - 18 (named, section 3) + 0 (no new firm skips) + 1 (VaultPolicyIT, pending)` = 8, or 7 if entry 8 is deleted. [V arithmetic] This is only the skipped column. Total and passed counts belong to the AC-6 e count reconciliation (`after = baseline - named drops - named deletions + named ports + named additions`), which the G9 record owns. Baseline for that: the 008 final check, `test` 2467 / 2442 passed / 25 skipped, `guidedIncrementalTest` 62, `crossReplicaTest` 2 (`taskResults`), 2531 testcases in total. [V]

## 7. Watch list: skips I am deliberately not pre-approving

A later lane may add a skip. Each would make the G9 run fail `EXACT_SKIP_POLICY_MISMATCH` until I judge it by name. [I] Candidates:

- `GuidedSchemaProbeIT` (AC-8): the offline schema validity and stub round trip run locally; the provider-acceptance half is external to ED-01. If D3/S implements the external half as a skipped test, it needs a named entry and a reason. If it is implemented as "unrun, owner" in a record and not as a JUnit case, no entry.
- `DatabaseCanaryScanIT`, `RunnerTlsClientCertIT`, `StudioRunnerPropertiesProfileTest`, `GuidedScheduledBeansProfileTest`, `ObservedScheduleAuthorityIT`: local halves of AC-2/3/4/5/6. These must pass. A skip here (for example "Docker not available") is a defect and is not approved in advance. Docker 27.4.0 is available locally. [V decisions.md]
- The re-enabled 18: any residual skip is a defect (section 3).
- AC-12 host-collision and startup-hang classifications are records by name, not JUnit skips. They are not credited and are not listed here. [V story AC-12; D2 spec]

## 8. Finalization checklist (for root)

1. Lane S/D3 exits. Read `VaultPolicyIT`'s skipped case(s) from that lane's XML (copy `backend/build/test-results/` first; a re-run wipes it).
2. @qa edits entry 8 per the table in section 5 and re-runs `python3 -c 'import json,sys;json.load(open(sys.argv[1]))' <file>`. Also check that every entry has exactly the keys `task`, `class`, `name`.
3. Remove the "NOT FINAL" line from this file's header, then root records the sha256 of the JSON. The file must not change after that (the collector fails with `APPROVED_SKIP_POLICY_CHANGED_DURING_RUN` if it does).
4. Pass the final path to the G9 run: `--allowed-skips-file docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/approved-skips.json`.

## 9. Not claimed

- No test, Gradle run or Docker command was executed. The 7 firm entries are verified against 008's recorded XML-derived results and today's source, not against a 009 run.
- The working tree is dirty and other lanes are editing. The source facts above are as of the time I read each file. [I] A lane may change a retained test's name or display name later; the exact-multiset check at G9 would then fail and I would re-derive.
- I did not approve any skip that was not observed or sourced.


## Root finalization, 2026-10-18

Entry 8 sentinel replaced with D3's declared skipped-case name (`d3/skips-d3-vaultpolicy.json`). The file now has 8 entries, sha256 `760f0c36db294b287fe6142d78c631d3b0d32bbb3cbf4611333df81f4dfea381`. The exact XML name is confirmed at the G9 run; any mismatch fails `EXACT_SKIP_POLICY_MISMATCH` and is corrected then.


## Root addition, 2026-10-18 (EP)

Added `GuidedSchemaProbeIT`'s named skip (`UNAVAILABLE_NOT_RUN`; the AC-8 live probe needs ED-01, which is external), taken from EP's collector results. The file now has 9 entries, sha256 `c6f16987430a332b80a065308a2c9b0ef9adccd478b9be64a02e1cb459cd09dc`.
