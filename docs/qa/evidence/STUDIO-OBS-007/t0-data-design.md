# STUDIO-OBS-007 T0 — database design

Owner: Dara (@data-engineer). Date: 2026-10-10. Status: read-only reconciliation; no product SQL or tests changed. Source: story AC-13/14/15, secret-login-design R3, ADR-SC-005, security review R1 delta. Implementation waits for root's recorded T0 security-delta release.

## Ownership and baseline

V34 is free. The current migration directory contains V1–V18 and V20–V33; staged V19 is `backend/db/cutover/V19__studio_inference_candidate_identity.sql`. V1–V33 and staged V19 are immutable for this story. OBS-012A owns re-baselining. Existing unrelated change `.aiox-core/core/permissions/dispatch-governance.js` is preserved.

Owned product file: `backend/src/main/resources/db/migration/V34__studio_guided_secret_login.sql`. Proposed exclusively owned database test: `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedSecretLoginMigrationTest.java`. Backend lane owns existing Java integration tests and application audit/retention writers. No Gradle or PostgreSQL command runs without root's serialized test slot.

## Closed seams that V34 must reconcile

- V30 session state CHECK contains `AWAITING_AUTH`. Its identity trigger keeps scope, versions and source identity immutable. Replace the state CHECK only after a loud guard against those session rows.
- V31 bridge tables retain exact session/scope/context/fence foreign keys and immutable preparation/admission evidence. Secret values must never become document columns.
- V32 translation attempts and ledger evidence stay immutable; the model-usage report view contains tokens only and needs no secret extension.
- V33 `studio_publication_profile` pins the entire v2 tuple, including `accountAbi`. V34 replaces the active profile predicate with the complete v3 tuple (no account ABI).
- V33 `studio_publication_scope` requires `accountRef`; its active v3 replacement is account-free and closed.
- V33 `studio_observed_execution_guard` closes binding, grant and request keys over `accountAuthorization` / `accountGrantId`. V34 removes those fields and checks the complete v3 binding/grant/request tuple while preserving actual-ledger ownership, immutable binding, grant deadline and receipt checks.
- V33 `ck_observed_revision_origin` requires `artifact_schema_version=2`; preserve existing immutable v2 revision rows but require artifact 3 on every newly published revision. Active v3 publication/replay guards never accept new v2 operations.
- V33 `studio_publication_attempt_guard` requires validator receipt `schemaVersion=2`; v3 receipts must be accepted by the active guard.
- V33 `studio_publication_observation_shape` pins observation 2 and closed coverage without `passwordControls`; replace the active predicate with version 3 and integer count 0–500. Existing immutable v2 observations remain stored through a NOT VALID replacement constraint; new observations must be v3. Password nodes must remain withheld.
- V33 schedule vocabulary retains `OBSERVED_SCHEDULE_AUTH_REQUIRED` untouched.

## Proposed audit and revocation schema

Audit stores safe metadata only: UUID row identity, `occurred_at`, path (`GUIDED`, `OBSERVED_REPLAY`), row kind (`RELEASE`, `USAGE`), release identity, attempt identity, positive release sequence, execution/session/admission identity, principal/CSI/environment/test identity, secret ID, optional Vault version, optional paired step/ordinal, exact resolution `outcome`, separate `usage_outcome`. Never add a JSON payload, value, diagnostic text or URL field.

Resolution outcome remains exactly `RESOLVED`, `NOT_AUTHORIZED`, `REVOKED`, `UNAVAILABLE`, `VAULT_UNAVAILABLE`, `REVOKED_MID_RUN`. `usage_outcome` is separate: replay `USED`/`NOT_USED`/`REFUSED`; guided closed terminal ledger outcomes plus `NOT_USED` for declared but unreached references. RELEASE identity is self-referential; linked USAGE must point to its RELEASE with identical scope, attempt, secret and coordinate. Duplicate RELEASE and duplicate USAGE identities are refused; retries must have fresh attempt identity and incremented release sequence. UPDATE/DELETE are refused; retention uses the backend-owned partition detach/drop path under the existing window. Final exceptions and revocation event semantics are specified below.

Use `studio_dispatch_ledger` as the execution identity FK: execution history is partitioned with `(id, started_at)` identity, and the ledger owns globally unique execution IDs. Guided session and admission foreign keys preserve exact scope. Add write-once `revoked_at` to guided sessions and dispatch ledger; backend sweep owns setting it and writing `REVOKED_MID_RUN` in the same transaction.

Root approved partitioned audit under the existing partition retention window. Partition key is `release_occurred_at`, carried unchanged on RELEASE/USAGE; `occurred_at` remains the real event timestamp. Composite primary key is `(id, release_occurred_at)` and USAGE locator is `(release_id, release_occurred_at)`. RELEASE has `release_id=id` and `release_occurred_at=occurred_at`; USAGE can occur in the next month but stays in its RELEASE's partition, so retention cannot leave an orphan in a retained later partition. An insert trigger validates every safe identity field against the immutable RELEASE under an advisory transaction lock. This replaces the preliminary self-FK preference, which would interfere with partition detach/drop; actual test/session/admission/execution foreign keys remain. QA concurs if wrong/missing/duplicate/concurrent links are refused and month-boundary retention is proven. No DEFAULT partition is created because existing `PartitionManager` DEFAULT moves use DELETE. V34 creates current UTC month and two future months; backend owns allowlist/time-key enrollment (`studio_secret_use_audit` → `release_occurred_at`) in `PartitionManager`, and managed-list enrollment in `PartitionBootstrap`, `PartitionHealthIndicator`, `RetentionPruner`. Ordinary application UPDATE/DELETE stay refused; privileged partition ownership controls detach/drop. Existing Q3 retention window is unchanged.

### Final audit edge semantics — architect RULING-6

`decision_stage` is a closed discriminator (`DISPATCH`, `LIVE_RECHECK`) for RELEASE rows; USAGE has no decision stage. A live revocation appends a RELEASE authorization-decision row with `outcome=REVOKED_MID_RUN`, new row/release identity, `affected_release_id` pointing to the original RESOLVED DISPATCH release, the original `release_occurred_at` and `release_seq`, complete original scope/attempt/secret/coordinate metadata and real later `occurred_at`. It records no send/value. A partial unique index on `(affected_release_id, release_occurred_at)` for LIVE_RECHECK plus the scoped insert lock prevents duplicate sequential or concurrent sweep/control decisions. Its original terminal USAGE is neither overwritten nor duplicated. Every normal USAGE refers only to its original DISPATCH RELEASE; partial unique `(release_id, release_occurred_at)` permits exactly one terminal summary for that RELEASE.

A guided declared-but-unreached secret has no actual release, so its sole `USAGE/NOT_USED` row has null `release_id`, `admission_id`, `vault_version`, and `affected_release_id`; `release_occurred_at=occurred_at` anchors its own retention month. It still requires exact session/principal/CSI/environment/test/attempt/declaring step/ordinal/secret metadata, with uniqueness on session/attempt/step/ordinal/secret under the insert lock. No invented RELEASE or Vault version is written. Resolved/denied/revoked dispatch decisions remain distinguishable through the exact resolution outcome column; usage outcomes never replace them.

For that unlinked NOT_USED shape alone, `outcome` is null (no resolution decision occurred); every actual decision and linked row requires the exact nonnull AC-14 enum. Architect explicitly concurs with this absence representation in RULING-6.

## Verification required after release

Fresh install reaches V34; staged V19 before V33/V34 and staged V19 after V34 preserve the ordinary candidate capability and observed exception. Guards refuse existing `AWAITING_AUTH` and observed-binding execution rows. Check full v3 profile equality including missing/additional/changed fields; account-free closed scope and grants; v2 stored revision/observation preservation; v3 observation count bounds; revision receipt pins; audit path/row/tuple/usage constraints, wrong-scope joins, retry release identities, write-once revocation, UPDATE/DELETE refusal and planted-value scan. Existing `InferenceMigrationLatestIT` derives latest-version expectations from Flyway rather than hard-coding 33; backend owner reruns it unchanged unless an actual failure requires an edit.

No oracle executed at T0; every item above is design or source inspection, not PASS evidence.
