# STUDIO-OBS-012A — Dara T0 migration design

Seven complete SQL drafts are in this directory. They are isolated design artifacts, not applied migrations. Root owns integration, all builds, database work, lifecycle records, and the final source freeze. Lane M application remains gated on K+C compile-green and a fresh backend baseline. Existing OBS-007 work was not edited.

The approved baseline is untouched V1–V11 followed by exactly V12–V18. All eleven current core files are byte-identical to `d954a21c5`; `input-bindings.json` records both hashes. The current source set is 33 normal migrations plus the separately staged V19 file. The replacement removes that staged file and `db/cutover/` entirely. This is a fresh pre-release baseline, not an in-place upgrade of an already migrated Studio database. Forward-only migration policy resumes afterwards.

External deployment confirmation is **unconfirmed**, owner **user / Platform-SRE**. This agent has not contacted either party or fabricated a confirmation. Root owns the actual T0 question and records any answer. ADR-SC-005 D-B and the story explicitly allow design/development to proceed while confirmation is owed; an affirmative prior deployment requires revisiting the migration strategy. Release bookkeeping belongs to OBS-010. Shared budget ceiling is USD500; actual billing is unavailable.

| New file | Current DDL carried forward | Deliberate change |
|---|---|---|
| `V12__tests_revisions.sql` | V12 scoped immutable revisions/quarantine; V14 browser normalization; live V18 owner uniqueness; V21 authoring capture; V27/V29 deny-by-default immutability | Remove all compile job/candidate/capture fields and compile identity indexes. Every new revision is already confirmed as `GUIDED_RUN`, so the final immutable-row guard admits no later confirmation mutation. Keep source/configuration revisions, current authoring, stable step UUIDs, observed reference policy, confirmed revision pointer. Readiness stays derived; no renamed compile-state column. |
| `V13__executions_ledger.sql` | V13 ledger; V14 history/status/log conversion/CSI quarantine and partition locators; V15 admission/state guards; V20 cancel; V18/V28 truthful FULL scope; V34 final error vocabulary | Final vocabulary includes `CANCELLED` and `SECRET_TOO_LONG`, installed once using NOT VALID then VALIDATE. Define revocation and retry-authority columns here so V15 functions never refer to missing columns. V17 installs their existing authoritative audit guards. |
| `V14__guided_sessions.sql` | V30 session/action/command/evidence; V31 bridge; V32 translation/model audit; V34 revocation | Final state CHECK excludes `AWAITING_AUTH`. Retain all owner, fence, identity, terminal, immutable evidence, admission, planning, reservation, and association guards. No intermediate account generation. |
| `V15__publication.sql` | V33 publication proof graph and choice receipts; V34 final account-free execution/claim/observation guards | Remove compile/candidate fields from captured base and epoch/CAS inputs. Epoch changes only with confirmed revision pointer; current source/config/hash and principal guards remain. Profile is exactly `{contract:3}`; the separate five-field build identity and all hash/build equalities remain. Add the two D-D columns described below. |
| `V16__scheduling.sql` | V26 complete scheduling graph, retained audit, ownership, deferred occurrence/ledger/history/cursor joins; V33 observed refusal | `LEARN_REQUIRED` replaces `COMPILE_REQUIRED`; retain `OBSERVED_SCHEDULE_AUTH_REQUIRED` with REFUSED-only decision and existing ACCEPTED equivalence. No observed schedules are newly enabled. |
| `V17__secret_use_audit.sql` | V34 release/usage, read-entry, no-send, terminal settlement, partition and retry protections | Exact existing function bodies and table constraints; only prerequisite columns/revocation function moved earlier. No default audit partition, invented usage, weakening of top-transaction checks, or value storage. |
| `V18__drop_plaintext_secrets.sql` | Existing V25 statement | Same plaintext core `secrets` table removal; no new credential store. |

The new files create exactly the same 33 surviving tables. The only omitted CREATE TABLE definitions are `ui_test_step_identities`, `ui_test_compile_requests`, and `ui_test_compile_outcomes`. Core `ui_tests` and partitioned `ui_test_executions` are altered, not replaced. All 23 functions introduced or replaced by V34 remain: 22 byte-identical; only `studio_publication_profile` changes for the accepted tuple collapse. `v34-function-preservation.json` is the static comparison. Every final function is defined once in the drafts; no compatibility create/replace history is replayed.

## D-D storage, without implementing OBS-015

Aria and Dara selected two nullable JSONB columns on `ui_test_revisions`: `step_snapshot_hashes` and `step_reuse_provenance`. Both remain NULL until OBS-015 publishes snapshot metadata. A new revision can later store a map of stable AuthoringStep UUID to snapshot SHA-256, with reuse entries `{revisionId, stepId}` keyed by that same UUID. Authored order remains in the immutable authoring snapshot, so no second order source is added.

When metadata is present, a CHECK bounds both objects; the deferred INSERT guard requires complete hash coverage of the captured authored step set, valid UUID/hash shapes, and same-test/CSI published source revision with an identical reused hash. Reuse cannot point at the same revision or a different step identity. The existing deny-by-default revision UPDATE guard covers both new columns automatically. The guard runs after the existing authoring-capture trigger; NULL metadata adds no iteration. There is no change-detection algorithm, component hash composition, prefix replay, model call, or retrospective hash synthesis. Those belong to OBS-015 T0 and implementation.

The rejected alternative was a separate revision-step relation with scoped composite FKs. It makes relational lineage explicit but adds an entity/table and duplicates step ordering; the two-column option matches OBS-015's existing UITestRevision seam and keeps this re-baseline smaller. JSON lineage is checked by the scoped trigger rather than pretending to be a declarative FK. The source revision is already protected by the retained publication-receipt cycle and immutable publication evidence.

## Coordinated Java and contract changes

- `UITest`: remove CompileState/import, compileStatus/request/error/diagnostics, currentCandidateRevisionId, and obsolete authoringSnapshot/hash/scopeReviewed fields/accessors. Keep authoring and authoringRevisionInputs, sourceRevision/configurationRevision, confirmedRevisionId, quarantine, and ordinary configuration. `StudioService` must remove old snapshot-invalidation bookkeeping without dropping current source/config revision advancement or live AuthoringRevisionIdentity validation.
- `UITestRevision`: remove intentDerivationVersion and compile-oriented documentation; retain observed referencePolicy and authoring capture. Map `step_snapshot_hashes` / `step_reuse_provenance` as nullable immutable JSON fields; no writer until OBS-015. All observed revisions arrive confirmed; `confirmation_source` has one value. Do not retain a dummy compile getter for compatibility.
- `UITestExecution`, `UITestExecutionId`, `StudioDispatchLedger`: retain partition locator, immutable accepted identity, truthful FULL marker, observed binding/receipt, scheduled provenance, deadlines, cancel and retry fields. SQL-owned fields need not acquire unrelated JPA accessors. Keep existing entity/schema validation and all current secret settlement behavior.
- `GuidedPublicationBaseRepository`, `PublicationContracts` and schemas: remove `compileRequestId` and `candidateRevisionId` from current-source SELECT, Base shape, capture, requireCurrent and canonical identity. Keep `confirmedRevisionId`, publicationEpoch, source/configuration revisions and hashes, authoringHash, principal/scope/run authorization/current freshness.
- `GuidedPublicationRepository`: drop compile/candidate columns and placeholders from revision INSERT and publication UPDATE/CAS. Remove `intent_derivation_version` and the obsolete `observed-1` provenance property. Keep source/configuration/epoch/confirmed-pointer comparisons, actual owner and original immutable deadline predicates. Publication pointer remains single-commit and receipt-bound.
- `ExecutionReadinessService` and `UITestRevisionRepository` documentation/query mapping: remove compile identity/intent-derivation/candidate reads; retain real observed verification and current scope/authoring checks. Derive `UNLEARNED | LEARNING | READY | NEEDS_RELEARN`; no NEEDS_RELEARN producer until OBS-015. `LEARN_REQUIRED` is the public refusal.
- Keep the observed source authoring schema independently of retired guided contract generations: `authoring` and `authoring_revision_inputs` are actively used by GuidedSourceSnapshotRepository. Retaining these fields does not retain the compile pipeline. Aria also identified AuthoringLimits and ConfigurationChangeClassifier as live save-time dependencies; Lane K relocates/reduces them rather than removing authoring safety.
- Lane C freezes one-generation schemas first. Architectural target is `versions:{contract:3,build:<BuildIdentity>}`, internal profile descriptor `{contract:3}`, and existing separate build validation, with `profileHash=hash({contract:3})`. Embedding build inside its own hashed profile would create a self-reference and is explicitly rejected. Draft SQL retains all separate requiredProfile/profile, requiredBuild/build, profileHash and buildHash equalities. Regenerate all Java/runner bundles and exact-epoch specializations consistently before Lane M applies.

## Existing tests and baseline facts

`pinned-test-mapping.json` names all **20 current** Flyway-target-pinned files and their **224 @Test methods**, with proposed port/delete disposition. Historical17 predates OBS-007's GuidedSecretLoginMigrationTest23, GuidedServiceTransportFaultIT12, and GuidedDefaultModelReservationIT4. Current GuidedSessionIT is43 and GuidedBridgeIntegrationTest37. These extra guards are ported, not quietly dropped. Proposed names/counts are not an executed after-count; root reconciles `after = baseline − named drops − named deletions + named ports` after source changes.

The existing ErrorCodeVocabularyTest additionally reads a migration filename without using Flyway.target. Preserve its six cases and nonvacuous enum/public-OpenAPI/SQL comparison. It currently reads V20, which omits V34's SECRET_TOO_LONG. ErrorCodeConstraintMigrationIT derives oldV17 seed values from the current enum minus CANCELLED, thereby including SECRET_TOO_LONG too early. Root's fresh baseline reported those failures before edits; they remain red historical evidence. Retarget final vocabulary to newV13/finalV18 and preserve real partition/dirty-row validation cases. The area-file parser must select actual constraint statements, not assume the entire migration contains only two statements or read its own comments.

Reuse existing SQL fixture seams and assertion slots for final schema, immutable columns, unknown codes, current v3/profile/scope, per-step metadata bounds and same-scope reuse. Obsolete staged-cutover orders and compile captures are removed only by explicit name. No new mandatory E2E, framework, concurrency cross-product, or provider call is needed for this DDL work. Full story gates and one-generation joined regressions remain root-owned.

## Validation commands for root after the phase gate

These commands are **recorded, not executed by Dara**. Run Gradle only from `backend/`, serialized with root's other work.

```sh
./gradlew rdsParityLint
./gradlew test --tests '*RevisionMigrationIT' --tests '*LegacyDataMigrationIT' --tests '*InferenceMigrationLatestIT' --tests '*ErrorCodeConstraintMigrationIT' --tests '*ErrorCodeVocabularyTest' --tests '*GuidedPublicationMigrationTest' --tests '*GuidedSecretLoginMigrationTest' --tests '*StudioAuthoringMigrationIT' --tests '*LedgerStateMachineMigrationIT' --tests '*StudioSchedulingSchemaIT' --tests '*PlaintextSecretsDropMigrationIT'
./gradlew test --tests '*GuidedSessionIT' --tests '*GuidedBridgeIntegrationTest' --tests '*GuidedPlanningIntegrationTest' --tests '*GuidedTranslationMigrationTest' --tests '*GuidedServiceTransportFaultIT' --tests '*GuidedDefaultModelReservationIT'
./gradlew check
```

Retarget the surviving fresh-install checks to V18; exercise populated untouched-core V11→V18 and inspect installed checks/FKs/triggers on every applicable partition. Do not try to apply this reset over a V34 Flyway history or run Flyway repair to mask checksums. Verify exactly18 numbered files, no cutover directory, and V1–V11 hashes against `git show d954a21c5:<path> | shasum -a 256`. Re-run the canonical contract/regeneration checks with Lane C's frozen representation and the unchanged current-authority/secret proof at the story's existing tiers.

Dev-database recreation is a distinct root-owned destructive operation, not performed here. After identifying a disposable development database and retaining any wanted data, the recorded PostgreSQL command template is:

```sh
: "${CHECKS_DEV_DB_NAME:?Set the verified disposable development database name}"
dropdb --if-exists -- "$CHECKS_DEV_DB_NAME"
createdb -- "$CHECKS_DEV_DB_NAME"
```

Application startup/Flyway then installs the new baseline. This command is not an internal-remote deployment attestation. Rollback before integration is removal of these isolated drafts; rollback of an applied disposable database is recreation from its retained snapshot with the original matching source, never a fake backward Flyway version. OBS-010 owns the final runbook row.

## Current verification limit

`draft-receipt.json` verifies deterministic source bindings, seven files, balanced SQL string/dollar bodies, terminated statements, no duplicate function definitions, and absence of retired compile/account/generation fields. It is not a PostgreSQL parse, Flyway execution, RDS lint, Hibernate check, or test PASS. `assemble_drafts.py` is an isolated reproducible drafting utility, not product infrastructure or a new mandatory test. Root and independent review must validate the final integrated SQL after K+C is frozen.
