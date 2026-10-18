# STUDIO-OBS-015 full-suite triage, cluster A (64 tests): ledger / materialization fixture SQL vs V21

Dex-TA (@dev, diagnosis). 2026-10-16. Input: `execution/final-w02-full-test04-xml` (first full `test` task, 127 failures).
Nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/` was modified. No Gradle was run.
[V] = I read it / ran it. [I] = inference, with the check that would close it.

## 0. Verdict

| Class | Failing | Root cause | Classification | Fix |
|---|---|---|---|---|
| SecretUseAuditIT | 36/36 | `@BeforeEach` inserts an ADMITTED action with `proposal='{}'` and no materialization/preparation | **fixture drift** | patch |
| GuidedSessionEvidenceTest | 14/15 | `GuidedRecordingSeed.session()` inserts a materialization with a non-canonical hash and no closed identity | **fixture drift** (shared seed) | patch |
| GuidedSessionVideoIT | 9/9 | same seed | **fixture drift** (same fix) | patch |
| GuidedTranslationTest | 3/37 | (a) raw action insert; (b)(c) test appends a new occurrence after the last step, breaking the new source-order check in `acceptPlan` | **fixture drift** | patch |
| SecretAuditLifecycleIT | 2/7 | materialization without closed identity; then actions without preparation | **fixture drift** | patch |

- **Production defects found in cluster A: 0.** **Tests to retire or migrate: 0.** **Architect ruling needed: none for the patch**; one operational note in section 5.
- No assertion was changed or weakened. No trigger is disabled. No planner table is written.
- Hidden second failure: once `SecretUseAuditIT`'s `@BeforeEach` passes, `leastWriterCanRecordUsageButCannotRewriteOrPrunePartitions` fails for a second reason (section 3.1). It is in the patch. It was masked in the official run (36/36 died in `@BeforeEach`).

## 1. What V21 now demands of a hand-written ledger row [V]

All in `backend/src/main/resources/db/migration/V21__guided_session_replaying_prefix.sql`.

| Rule | Where | Effect on a fixture |
|---|---|---|
| `studio_guided_materializations` AFTER INSERT captures a version row | `studio_015_materialization_capture` :175-195 | `authored_inputs_hash` must equal `studio_publication_hash(authored_inputs)` (canonical hash, not sha256 of `toString()`), else `'materialization initial identity invalid'` (P0001) |
| Version identity is closed | CHECK `studio_publication_closed(authored_inputs_identity, [schemaVersion, sessionId, scopeHash, sourceRevision, configurationRevision], 8192)` :103 | `authored_inputs` minus `inputs` must be exactly those 5 keys (this is the `SecretAuditLifecycleIT` 23514) |
| `input_count NOT NULL` | :95, fed by `jsonb_array_length(authored_inputs->'inputs')` :184 | `inputs` array must exist (may be empty) |
| Action insert needs a matching preparation | `studio_015_action_attempt_guard` :358-394, test at :372-376 | a `studio_guided_preparations` row with `preparation_id = document.preparationId`, `request_digest = studio_publication_hash(proposal)`, `proof.contextRevision/authoredInputsHash = proposal.contextRevision/authoredInputsHash`; else `'action preparation version mismatch'` (the 14 + 36 + 1 P0001s) |
| Action insert needs the live head | `studio_015_current_version` :341-345 via :381 | materialization `live = true`, and `document` carries `contextRevision` and `authoredInputsHash` |
| Attempt ordinal | :377 | `document.attemptOrdinal` = `0` |
| Preparation insert needs the live head | `studio_015_preparation_version` :346-357 | preparation after materialization |
| Audit reads versioned inputs | V21 :837-880 redefines `studio_secret_guided_input_reference` / `_consumed` over `studio_guided_materialization_snapshots` joined on `proposal.contextRevision` + `proposal.authoredInputsHash` | proposals must carry both, and a restricted role needs SELECT on the view |

Production already follows this contract: `SecretAuditLifecycle.guidedTerminal` joins the same snapshots view on the action document's `contextRevision` / `authoredInputsHash` [V: SecretAuditLifecycle.java]. The sibling `GuidedSecretLoginMigrationTest` (23/23 pass in the same run) already builds the full chain by hand [V]. So the fixtures are stale, not the migration.

## 2. Per class

Line numbers are the live files at the base hashes in `manifest.json`.

### 2.1 SecretUseAuditIT (36)
- Trigger: `studio_015_action_attempt_guard` :372-376, `'action preparation version mismatch'`, from `SecretUseAuditIT.java:99-105` (`INSERT ... VALUES ('admission','session','password-step',0, '{...ADMITTED...}','{}')`). Every test dies there (`database()` = `@BeforeEach`).
- Behind it, same drift, would have failed next: `consumedSecret` :443-503 (materialization with `authored_inputs_hash = HASH`/"aaaa..." and no closed identity, `live=false`; replacement action without preparation), :915 (raw `DELETE` of the action; legal today only because nothing links it), :1372 (second action), and the least-writer GRANT list :391-395.
- Fix: new test-only helper `GuidedLedgerSeed` (preparation, action, admission link, in production order; `retire()` for the two delete sites). `@BeforeEach` now writes assignment + one live materialization (closed identity, canonical hash, the declared `input-PASS` secretRef) before the ADMITTED action. `consumedSecret` retires the fixture admission and re-admits it as DISPATCHING with the secretRef proposal. Same documents, same ordinals, same states as before.
- Semantic check that the earlier absence of a materialization in `@BeforeEach` was not load-bearing [V]: the V17 unreached/consumed classification reads a materialization only for actions with `dispatchCount=1` and a `secretRef` proposal (V17 :530-540, :549); the fixture ADMITTED action has neither. 35 of 36 tests passed on the first patched run for this reason; the 36th is 3.1.

### 2.2 GuidedSessionEvidenceTest (14) and GuidedSessionVideoIT (9)
- Trigger: `studio_015_materialization_capture` :175-183, `'materialization initial identity invalid'`, from `GuidedRecordingSeed.java:110` (`authored = {sessionId, scopeHash}`, hash `sha(authored.toString())`, `live=false`). One seed feeds both classes (and `GuidedRecordingTimingsTest`, which only uses its statics and passes).
- Behind it: `GuidedRecordingSeed.java:138` raw action insert with `proposal='{}'`.
- Fix (one file): `authored` gets the closed identity and `inputs: []` (`GuidedLedgerSeed.closedInputs`), hash is `GuidedContracts.hash(authored)` (Java canonicalizer equals `studio_publication_hash`; the sibling tests rely on that), materialization is written `live=true`, and `action()` goes through `GuidedLedgerSeed`, looking context/fence/hash up from the seeded materialization row.
- One deliberate deviation, disclosed: the seed used `live=false` ("what the stop path leaves behind"). V21 only admits a ledger row against the live head, and `live` cannot be set back to true. Nothing on the recording path reads it [V: `GuidedSessionEvidenceRepository` reads only context columns; `live` is read in main only by `GuidedMaterializationService:423,432`]. Javadoc updated.
- The `session_replication_role='replica'` update in `GuidedSessionEvidenceTest:~332` is pre-existing and unchanged.

### 2.3 GuidedTranslationTest (3)
1. `oldPostEffectSessionCannotBackfillAllowanceButImmediateReadyRemainsCompatible` (:505): same action-guard failure; the `DelayedFixture` session has no materialization or preparation. Fix: `DelayedFixture.materialize()` writes the session's assignment + live revision-1 materialization (ids derived from the session id, because `context_id` and `assignment_id` are globally UNIQUE in the shared `delayedDb`), then `GuidedLedgerSeed.action`. The assertion (`RUNTIME_INCOMPATIBLE` once an effect exists, no `translationAcquisition` marker) is untouched; acquisition only counts action rows [V: GuidedTranslationStore:245-248].
2. `sourcePlanObligationAndFenceMismatch...` (:353-361) and 3. `compoundObligationsShareAllowance...` (:630-635): `BINDING_ORDER` from `GuidedTranslationStore.sourceCoordinates` :772-775. That method is new in the 015 working tree [V: `git diff HEAD`]. It requires `plan.obligations` to follow the manifest's source-step order. The tests built a "real new head" by appending `A:1` after `[A:0, B:0]`, i.e. `[A:0, B:0, A:1]`. Fix: `insert(1, ...)` so the new head is `[A:0, A:1, B:0]`. Lawful because head-to-head history is set containment, not positional (`GuidedPlanHistoryAudit.monotonic` :124-127 [V]), and acquisition identifies obligations by id / stepId. The source-order rule is also what the publication contract says ("every source step appears once in source order", `publication-contracts.md:83` [V]), so I treat `sourceCoordinates` as intended [I; an architect can overrule if append-at-end growth is a required capability, which would make it a production change, not a test change].

### 2.4 SecretAuditLifecycleIT (2, parameterized `rollback=false/true`)
- Trigger: CHECK `studio_guided_materialization_ve_authored_inputs_identity_check` (SQLState 23514), via `studio_015_materialization_capture` :184, from `SecretAuditLifecycleIT.java:379` (inputs lack `schemaVersion`/`sourceRevision`/`configurationRevision`, `live=false`).
- Behind it: `:409` two raw action inserts.
- Fix: `closedInputs`, canonical hash, `live=true`, actions via `GuidedLedgerSeed`. The in-memory `actions` list that is passed to `lifecycle.guidedRelease/guidedOutcome` is unchanged (the helper copies, never mutates).

## 3. Findings beyond the 64

### 3.1 `leastWriterCanRecordUsageButCannotRewriteOrPrunePartitions` (SecretUseAuditIT:391-395)
After the fixture is fixed it fails with `permission denied for view studio_guided_materialization_snapshots` from `studio_secret_guided_input_reference` (SQL function, inside `studio_secret_audit_insert_guard`). V21 moved that function from the base table to the view; the test's hand-made least-privilege role was granted the old table list. Classification: fixture drift. Fix: add `studio_guided_materialization_snapshots` to that GRANT. The view runs with its owner's rights, so the view alone is sufficient (the test passes with only that addition).

### 3.2 Rule check against the bridge ruling (`w2-window01/aria-bridge-ruling01/ruling.md`)
- R-1 (no manufactured planner authority): the patch writes only `studio_guided_assignments`, `studio_guided_materializations`, `studio_guided_preparations`, `studio_guided_actions` (all runtime tier). It never writes `studio_guided_translation_plans`, `studio_guided_obligation_admissions`, `studio_guided_translation_state` or calls `acceptPlan/reserveObligation/attachAdmission`. Pre-existing `SecretUseAuditIT` and `SecretAuditLifecycleIT` writes to `studio_guided_source_manifests` are unchanged, and the audit/recording/acquisition readers under test are the subject, not the planner. If the architect wants R-1 read strictly for those two manifest inserts, that is a separate ruling; not introduced here.
- No `session_replication_role`, no `DISABLE TRIGGER`, no helper that bypasses a guard.
- Single path / no compat: the helper writes only the current V21 shape. No legacy fallback.

## 4. Verification (what I ran, what I did not)

Ran [V]:
- A throwaway `postgres:15-alpine` (own container, removed) with V1..V21 applied by psql, to replay the corrected fixture SQL before writing Java (fixture, consumed, second ordinal, recording-style SUCCEEDED action; `studio_secret_guided_input_reference` returned `ref-PASS`, `studio_secret_guided_consumed` returned `t`).
- The real classes outside Gradle: `javac` of all main + test sources (patched files substituted), JUnit Platform Launcher, Testcontainers PostgreSQL, dedup'd classpath from `~/.gradle/caches` (slf4j-simple and Saxon excluded), cwd in the scratchpad so live `backend/build` is only read.
  - Unpatched live sources: Evidence + Translation + Lifecycle + Video = 68 tests, **28 failed**, which matches the official run for those classes (14 + 3 + 2 + 9). SecretUseAuditIT was not re-run unpatched (official: 36/36 in `@BeforeEach`).
  - Patched: SecretUseAuditIT 36, GuidedSessionEvidenceTest 15, GuidedSessionVideoIT 9, GuidedTranslationTest 37, SecretAuditLifecycleIT 7, GuidedRecordingTimingsTest, GuidedSecretLoginMigrationTest 23 = **138/138 passed**.
- `git apply --check -p0 fix.patch` from the repo root: OK. Applying the patch to a clean copy of the live files reproduced the verified tree byte for byte (`cmp`).
- New helper is google-java-format 1.22.0 clean; my other hunks introduce no new gjf diffs (the touched files already had gjf diffs at base).

Not run:
- Gradle `test`, `check`, spotless, checkstyle, spotbugs, jacoco. My classpath is a reconstruction, not Gradle's. Treat the 138/138 as strong evidence, not as the gate. The authoritative confirmation is the Gradle owner running these five classes: `GuidedSessionEvidenceTest`, `GuidedSessionVideoIT`, `GuidedTranslationTest`, `SecretAuditLifecycleIT`, `SecretUseAuditIT` (plus `GuidedRecordingTimingsTest`).
- The rest of the 127 failures (cluster B and others) and the full suite with this patch.

## 5. Notes for the owners

- Operational, not a test issue: `studio_guided_materialization_snapshots` is now read by the V17 audit trigger functions. The repo contains no GRANT statements [V: grep of `backend/src/main`, `backend/db`], so I cannot say whether any deployment grants table-by-table to a non-owner runtime role. If one does, it needs SELECT on the view. Question for @devops / @architect; the test now documents the requirement.
- `GuidedLedgerSeed` leaves each action's preparation linked (as production does). Fixture tests that delete an admission must use `retire()`; a raw `DELETE FROM studio_guided_actions` will now hit the FK from `studio_guided_preparations`.

## 6. Apply

From the repo root: `git apply --check -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/fullsuite-triage-A/fix.patch && git apply -p0 ...`. Base and patched hashes are in `manifest.json`. If any of the four base files changed since, the check fails and the patch must be rebased; do not force it.
