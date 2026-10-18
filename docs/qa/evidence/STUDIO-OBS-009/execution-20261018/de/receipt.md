# STUDIO-OBS-009 W2 lane DE: receipt (AC-4 TF-5 b)

**Agent:** @data-engineer (Dara). **Date:** 2026-10-18. **Verdict:** GREEN (local half). **V23:** none.

Inputs read: `w2-brief.md`, lanes.json `w0Refold20261017` → lanes[id=DE], story AC-4 TF-5 a–e, register U14, T0 ruling (Δ1, U14 row), W1.5 ruling part 2 (ADJ-1 option (a): no SQL, "Lane DE is unchanged"), triage A §3.1/§5 (STUDIO-OBS-015).

## 1. Files written

| File | sha256 before | sha256 after |
|---|---|---|
| `backend/src/test/java/com/citi/put/checks/studio/guided/secret/GuidedRuntimeRolePrivilegeIT.java` | absent (new) | `e0fea7e29aa01bbed211e81f982d14a8473c35ae49d22c335625a5a6ee7ef0ea` |
| `de/runtime-role-grants-v19-v22.sql` (prepared grant) | absent | `02c13ee62d39710cee760dfcced16aa41604233ae65517e5a6ebe1d13f448e86` |
| `de/delta-table-obs009-de-03.md` (delta table, extracted from run 03 XML) | absent | `e80486de6a08d8a06d52190a5f9603568d578f9435636b1cfd351c191eeb1ec5` |
| `de/application-sql-grep.txt` (basis of the pinned application-access map) | absent | `68d54093bdad3b0231c51937988e3b3830ce96da4e91c9aae0cac8f74261e68a` |
| `de/role-model-facts.txt` (TF-5 a input) | absent | `49e5e045981898ebc6ee4066fb5ce8386b173406d7b1ad4f5a0efacf1338db3f` |
| `de/mutation-obs009-de-04.diff` | absent | `048c99ae55bd5712cd514130296047de652659575388c224cd6ec3f60c938210` |
| `de/mutation-obs009-de-04-summary.txt` | absent | `0aa61e15b5f963b522e44d4c8b1fdcaa0129ef8a86350603b9972be678720f2c` |
| `de/receipt.md`, `de/receipt.json` | absent | (this receipt) |

The collector also wrote its own outputs under `execution/obs009-de-0{1,2,3,4}*` (its fixed output directory). No migration, no main source, no other file touched. `git status` cannot prove this on its own: the re-baselined migrations and the whole `guided/secret/` test directory are untracked from earlier uncommitted work. What I verified: the migration directory still ends at `V22__execution_replay_failure.sql` (no V23) [V], and the IT sha after the mutation restore equals the green-run sha [V].

Prepared grant blocks are byte-identical to the IT text blocks [V, extractor in scratchpad]: block 1 `PREPARED_GRANT` sha256 `5c6005834466e0199947b252d1715c06c1627b80d0d5c880bd7e93e49eacbb3d`; block 2 `PREPARED_COLUMN_GRANT` sha256 `a66d23fffe2e29a725d4d37e5cc8f936aea3a77c5836a72939b02221d4dd6783`.

## 2. What the IT proves (6 tests, Testcontainers `postgres:15-alpine`, real Flyway, no trigger disabled)

1. `everyObjectV19ThroughHeadIsRuledAndThePreparedGrantIsExactlyTheDelta`: migrates to V18, snapshots the catalog, then steps V19 → head one version at a time. Pins every created relation (17 + 1 identity sequence, with version and kind) and every column added to a pre-V19 relation (7). Derives, from `pg_proc.prosrc` of every function at V18 and at head, the privileges each body needs (INSERT INTO / UPDATE / DELETE FROM targets, FROM/JOIN/USING reads, row locks need UPDATE; literals and comments stripped; any other reference fails the test as unclassified: 0). Required delta = pinned application access ∪ function needs (new relations) and head-minus-V18 function needs (pre-V19 relations). Applies `PREPARED_GRANT` to a fresh role and asserts `has_table_privilege` over all 7 privileges on every relation **equals** the required delta: nothing missing, nothing extra. The identity sequence needs no grant.
2. `migrationsGrantNothingRunNoDefinerRightsAndTheViewKeepsOwnerRights`: the migrating user owns every relation; no `studio_guided_%` relation carries an ACL; no SECURITY DEFINER; every function executable by a role with no grant; the view has no `security_invoker`.
3. `viewOnlyVariantWritesTheGuidedSecretAuditOnceTheViewAloneIsGranted` (view-only variant): a separate **login** role granted every table/sequence privilege at V18 (most generous DBA baseline), then the head migrated. Its guided `recordRelease` fails with `permission denied for view studio_guided_materialization_snapshots`; after `GRANT SELECT` on the view alone, release + usage write 2 audit rows as that role, while the view's base tables stay ungranted.
4. `preparedGrantLetsTheRuntimeRoleWriteMaterializationHistoryAndTheGuidedSecretAudit`: same baseline role. Its materialization insert fails with `permission denied for table studio_guided_materialization_versions` (V21 capture trigger, invoker rights). With `PREPARED_GRANT` the same role writes the materialization, its version history, the ledger rows (`GuidedLedgerSeed`, all V21 guards live), the manifest and both guided secret-audit rows. This is the local analogue of TF-5 c, not TF-5 c.
5. `triggerOnlyPolicyAuditNeedsInsertButNoSequenceGrant`: without INSERT on `studio_guided_policy_audit` a policy insert fails (`permission denied for table studio_guided_policy_audit`); with it, POLICY_CREATED is written and the role has no USAGE on the identity sequence.
6. `columnLevelVariantCoversExactlyTheColumnsV19ThroughHeadAdded`: block 2 grants exactly the ruled column privileges on the 7 added columns and no table privilege.

## 3. Delta per object, V19–V22 (summary; full table in `delta-table-obs009-de-03.md`)

| Relation | Introduced | Prepared grant |
|---|---|---|
| studio_guided_policies | V19 | SELECT, INSERT, UPDATE |
| studio_guided_policy_versions / _policy_approvals / _session_policies | V19 | SELECT, INSERT |
| studio_guided_policy_audit | V19 | INSERT (trigger-only writer) |
| studio_guided_policy_audit_audit_id_seq | V19 | none needed (identity) |
| studio_guided_csi_guards / _csi_token_days | V19 | SELECT, INSERT, UPDATE |
| studio_guided_session_recordings | V20 | SELECT, INSERT |
| studio_guided_relearn_plans / _relearn_switches / _no_invocation_receipts / _suffix_acceptances | V21 | SELECT, INSERT |
| studio_guided_materialization_versions / _inputs | V21 | SELECT, INSERT |
| studio_guided_materialization_snapshots (view) | V21 | SELECT |
| studio_guided_materialization_deliveries / studio_guided_prefix_requests | V21 | SELECT, INSERT, UPDATE |
| studio_guided_materializations (pre-V19) | altered V21 | + UPDATE (row lock in V21 history trigger) |
| studio_guided_model_attempts (pre-V19) | altered V19 | + UPDATE (`studio_guided_prune_session`) |
| studio_guided_publication_admissions / _preparations / _observations (pre-V19) | V19 function | + DELETE (`studio_guided_prune_session`) |
| studio_guided_translation_plans / _translation_state (pre-V19) | V21 functions | + SELECT |
| Added columns: sessions.pruned_at (V19); actions.attempt_ordinal, obligation_admissions.attempt_ordinal (V21); ui_test_executions.replay_failure_* ×4 (V22) | | block 2 only for column-level baselines |

## 4. Commands (all from repo root, N24 PATH, through the shared lock)

`python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py <label> --test-tasks test -- test --tests <FQCN>... --no-daemon`

| Label | Classes | Exit | Counts | Note |
|---|---|---|---|---|
| obs009-de-01 | GuidedRuntimeRolePrivilegeIT | 1 | 0 run | BUILD FAILED in `backend/build.gradle.kts:332` (`java.time` unresolved): another lane was mid-edit (mtime 01:10:13). Not mine, not edited; waited until it changed (01:15:21). Non-evidentiary. |
| obs009-de-02 | GuidedRuntimeRolePrivilegeIT | 1 | 6 / 5 pass / 1 fail | **Red.** My fixture expected one delivery row; V21 writes a delivery only from context revision 2. Assertion corrected (versions/inputs = 1); red match narrowed to `..._versions`. The exact-delta test was already green. |
| obs009-de-03 | GuidedRuntimeRolePrivilegeIT + SecretUseAuditIT (lane verify) | 0 | **42 / 42 pass** (6 + 36), 0 skipped | **Green**, source sha `e0fea7e2…`. |
| obs009-de-04 | GuidedRuntimeRolePrivilegeIT (mutated copy) | 1 | 6 / 3 pass / 3 fail | Mutation run (§5). File restored afterwards; sha back to `e0fea7e2…` [V]. |

Other commands: google-java-format 1.22.0 `--replace` then `--dry-run` on the IT, exit 0 (clean) [V]; no line > 120 [V]. Standalone checkstyle 10.18.1 could not start (commons-logging jar not in the Gradle cache): **not run**.

## 5. Mutations (one combined run, obs009-de-04; each mutation identified separately in the output)

| # | Mutation | Expected | Observed |
|---|---|---|---|
| M1 | drop `GRANT SELECT` on the view from `PREPARED_GRANT` | test 1 and test 4 fail | test 1: view missing from granted; test 4: `permission denied for view …snapshots` from `studio_015_version_commit()` (deferred trigger on the materialization write) [V] |
| M2 | drop the pre-V19 prune `GRANT DELETE` on 3 publication tables | test 1 fails | 3 DELETE cells missing [V] |
| M3 | add `GRANT DELETE` on policy audit | test 1 fails (least privilege) | granted `[DELETE, INSERT]` vs required `[INSERT]` [V] |
| M4 | classifier ignores row locks | test 1 fails | materializations UPDATE granted but no longer required [V] |
| M5 | view-only test grants a base table instead of the view | test 3 fails | `permission denied for view …snapshots` from `studio_secret_guided_input_reference` in the audit insert guard [V] |

## 6. ACs

- **Local (this lane): AC-4 TF-5 b.** Delta check green for every object V19 through head (V22), grant statement prepared and proven exact. [V]
- **External, owed:** TF-5 a (role model per shared environment), TF-5 c (live: guided secret-audit row under the runtime role on the deployed stack, with the AC-4 Vault test), TF-5 e (report as "unrun, owner Platform DBA / @devops" until U14 is confirmed). TF-5 d ("not applicable") if U14 shows the runtime role owns the objects. Owner: Platform DBA / @devops (U14).

## 7. V23 decision

**No V23.** [AUTO-DECISION] Should the grant ship as a Flyway migration? → No (reasons: U14 is unconfirmed; the repo config makes the runtime user the owner [I from `application.yml` + chart passing only `SPRING_DATASOURCE_*`], so a grant there is a no-op; a `GRANT … TO <role>` in Flyway fails in every environment where that role does not exist, and the role name is environment-specific; T0 ruling U14 row says "no V23 grant in 009 local"; ADJ-1 needs no SQL per W1.5 part 2). If U14 confirms a non-owner role, the DBA applies `runtime-role-grants-v19-v22.sql` through the environment's process. Head stays V22; no head pin moved.

## 8. Deviations

- Red-first: no production behaviour changed (test + evidence only). The pre-V19 section of the grant was added **before** the first Gradle execution, from a Python approximation of the same derivation over the migration files; so there is no Gradle red for that section. The red evidence is run 02 (fixture), the in-test red halves (baseline role denied, asserted inside the green run) and the mutation run.
- The application-access map is pinned from a grep (`application-sql-grep.txt`), not derived at test time. A future Java statement that newly touches a V19–V22 relation is not caught by the IT [I].
- The deliveries INSERT path (context revision ≥ 2) is covered only by the catalog derivation, not exercised behaviourally.
- psql `:"runtime_role"` interpolation was not run with psql; the IT substitutes the placeholder in Java [I that psql behaves the same].
- Checkstyle not run (see §4); owed to F-merge `./gradlew check`.

## 9. Open findings (root / @architect / @devops)

- **F1 (scope of the delta).** The delta is broader than triage A §3.1's "SELECT on the view only". That holds for the secret-audit guard path alone. A non-owner runtime role needs block 1 in full: 17 new relations, plus UPDATE on `studio_guided_materializations` and `studio_guided_model_attempts`, DELETE on the three publication tables (the V19 pruner) and SELECT on `studio_guided_translation_plans`/`_state`.
- **F2.** The deferred trigger `studio_015_version_commit` reads the view too, so materialization writes (worker path) also need the view grant (M1).
- **F3 (head tripwire).** `GuidedRuntimeRolePrivilegeIT` fails on any V23+ that creates a relation, adds a column to a pre-V19 relation, or changes what a function body touches, until `CREATED_RELATIONS`/`ADDED_COLUMNS`/`APPLICATION_ACCESS`/`PREPARED_GRANT` and this evidence file move with it. It is a fourth head-pin form (delta pin); add it to the head-pin list.
- **F4 (for U14, @devops).** A split role model also needs Flyway to run as the owner (separate `spring.flyway.user` or a migration job); the chart passes only `SPRING_DATASOURCE_*` today. Partition maintenance (`PartitionManager` CREATE PARTITION OF / DETACH) also needs the owner (pre-existing; `SecretUseAuditIT` least-writer shows "must be owner").

## 10. Batons for F-merge

- `GuidedRuntimeRolePrivilegeIT.java` and `de/runtime-role-grants-v19-v22.sql` land together; the two blocks must stay byte-identical (shas in §1).
- If any V23 lands in 009 (none planned), it moves atomically with this IT's pinned maps and grant, and with the existing head pins (008 DE precedent).

## 11. Hygiene

No commit, stash or push. No watchers or servers left. My Gradle runs all exited; the Testcontainers containers running at 01:27 belong to other lanes' queued runs (started after my last run) [V: `ps`, `docker ps`]. No secrets logged: the test role password is a random UUID used only in-process. No docker build or pull (`postgres:15-alpine` and `ryuk` were local). No provider calls.
