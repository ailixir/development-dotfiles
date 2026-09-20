# Studio inference persistence rollout

Owner: Dara/Gage. Story 10.23; [C0 contract](../architecture/studio-inference-contract-v1.md). This is a staged procedure, not evidence that a shared database or gateway has been enabled.

## Additive V18 interface

The normal application Flyway location contains `V18__studio_inference_capture.sql`. It preserves the old revision-content uniqueness and all historical rows. It adds:

| Surface | Interface |
| --- | --- |
| `ui_tests` | Nullable `authoring_snapshot`, `authoring_hash`, `scope_reviewed_by`, `scope_reviewed_at`; changing any requires increasing existing `source_revision` |
| `ui_test_step_identities` | Append-only `step_id` UUID primary key, owning `test_id`, author and creation time; an ID cannot be reassigned |
| `ui_test_compile_requests` | Immutable `request_id`, same-test/CSI ownership, source/configuration revisions, source/hash, optional authoring/hash/review stamp, nonsecret configuration, declared references, fingerprint, selected plan, optional same-test baseline, author/time/deadline |
| `ui_test_compile_outcomes` | At most one append-only terminal JSON outcome per request; retries must compare an existing outcome rather than overwrite it |
| `ui_test_revisions` | Unique nullable historical `compile_request_id`, authoring/hash/review stamp, fingerprint and baseline; captured fields must exactly match the referenced request on insert |
| `ui_test_executions` | Nullable `execution_scope`; new accepted full runs explicitly write `FULL`; old rows remain NULL |

Request source is the canonical string array. `configuration` and `references` contain no resolved variable/secret values. `compilation_plan` holds the immutable selected mode/reason, requested mode, writable IDs, dependency contract, policy/model settings, budget and baseline execution locator. `provenance` retains current validation/runtime fields and mixed original-generation lineage. The Java/schema layers validate these closed JSON contracts; SQL enforces ownership, capture equality, uniqueness, pairing and immutability. Hashes use the existing canonical Java hashing implementation, not PostgreSQL's differently formatted JSON text.

Authoring IDs are allocated in the registry before saving the captured ordered snapshot. The application verifies unique same-test IDs and exact source/text alignment, increments source revision for ID/order/scope changes, and invalidates unverifiable legacy mappings. Reviewer stamps must not refresh on a no-op save. Capture/publication/confirmation/acceptance use draft-first locking and compare source/configuration/request/authoring/fingerprint identity; this migration does not implement Java CAS.

The revision trigger protects every column except the first confirmation, including future added columns. Requests, outcomes and ID registry rows cannot be updated/deleted through ordinary DML. Baseline references enforce same-test/CSI ownership. There is deliberately no FK from a recorded baseline execution locator into the partitioned execution table: evidence retention must not be prevented by an audit record. Eligibility is re-established from retained evidence each time.

## Baseline query and evidence

Select the newest eligible confirmed revision, then its newest eligible full passing execution. A skeleton for the repository implementation follows; add the current authenticated CSI/test parameters, current fingerprint and compatible runtime pins. The caller must verify reviewed scope and current authorization/reference/policy eligibility before reuse. Execution configuration has flat viewport fields while revision configuration has nested viewport; compare normalized fields, not raw JSON equality.

```sql
SELECT r.id AS revision_id, e.id AS execution_id, e.started_at
FROM ui_test_revisions r
CROSS JOIN LATERAL (
    SELECT e.id, e.started_at
    FROM ui_test_executions e
    WHERE e.revision_id = r.id AND e.ui_test_id = r.test_id AND e.csi_id = r.csi_id
      AND e.status = 'PASSED' AND e.execution_scope = 'FULL'
      AND e.configuration_snapshot @> jsonb_build_object(
          'sourceRevision', r.source_revision,
          'configurationRevision', r.configuration_revision,
          'artifactHash', r.artifact_hash)
      AND jsonb_build_object(
          'browser', e.configuration_snapshot->'browser',
          'viewport', jsonb_build_object(
              'width', e.configuration_snapshot->'viewportWidth',
              'height', e.configuration_snapshot->'viewportHeight'),
          'timeoutSeconds', e.configuration_snapshot->'timeoutSeconds',
          'waitStrategy', e.configuration_snapshot->'waitStrategy',
          'environment', e.configuration_snapshot->'environment') = r.configuration
      AND e.runtime_versions IS NOT NULL
      -- Repository adds exact/ranged compatible runtime predicates from C0.
    ORDER BY e.started_at DESC, e.id DESC
    LIMIT 1
) e
WHERE r.test_id = :test_id AND r.csi_id = :authorized_csi
  AND r.compilation_fingerprint = :fingerprint
  AND r.confirmed_by IS NOT NULL AND r.confirmed_at IS NOT NULL
  AND r.authoring_snapshot->'scope'->>'declaration' = 'STEP_SCOPED'
  AND r.scope_reviewed_by IS NOT NULL AND r.scope_reviewed_at IS NOT NULL
ORDER BY r.created_at DESC, r.id DESC
LIMIT 1;
```

The partial indexes are `idx_ui_test_revisions_eligible` and `idx_ui_test_exec_full_baseline`. Measure the final repository query with representative history and `EXPLAIN (ANALYZE, BUFFERS)`; merely having indexes is not a performance measurement. Missing retained evidence selects FULL. Compatible configuration-only reuse is the separately declared C0 path and does not invent a successful-run locator.

## Expansion, compatibility barrier and cutover

1. Capture a recoverable database backup/schema snapshot using the approved operational procedure. Rehearse V18 against a restored representative database and check migration lock duration before applying it to a shared environment. V18's normal indexes and uniqueness checks may take locks; it is not claimed to be a lock-free migration.
2. Deploy V18 with inference/incremental/v2 authoring disabled and compatible application readers/writers. Old publishers retain their existing `ON CONFLICT(test_id, source_revision, configuration_revision, artifact_hash)` target. Do not enable the new distinct-request publisher while that old uniqueness still exists.
3. Deploy the compatible writer release to all API instances, drain old writers and in-flight publishers, and inventory all authoring/administrative writers. Back up and record the approved rollback version. The compatible release must operate before/after cutover and must not silently use content deduplication for a new explicit request.
4. The separately staged script is `backend/db/cutover/V19__studio_inference_candidate_identity.sql`. It is intentionally outside `src/main/resources/db/migration`; ordinary startup cannot apply it. Use a separate reviewed migration job/Flyway location or one controlled transactional SQL session. Do not later copy it into normal startup without reconciling migration history and version reservation.
5. V19 requires an explicit same-session operational attestation, `SET LOCAL checks.inference_publishers_drained = 'true'`, inside the transaction that executes the script. This setting records the operator's completed drain barrier; it does not discover or stop old pods. Without it the script fails before dropping a constraint. V19 removes the old content unique constraint and rejects new revisions without a persisted request. Roll back the entire SQL transaction on any error.
6. Verify the actual capability before enabling the new publisher: the old `uq_ui_test_revisions_identity` constraint is absent, `uq_ui_test_revisions_compile_request` remains, and `trg_ui_test_revision_require_request` is installed/enabled. Check the intended schema explicitly. A feature flag alone is not proof of cutover. First publication inserts a new revision; repeating the same request uses `ON CONFLICT(compile_request_id) DO NOTHING` and retrieves/verifies that request's existing revision. Different requests may now produce equal bytes without sharing confirmation/provenance.
7. Run the actual backend integration/confirmation/race tests, then enable v2 and full inference only after their independent environment/live gates. Incremental has a separate gate. Existing policy-1 artifacts do not become policy-2-compatible through this database change.

V19 is forward-only. Before V19, rollback to the prior application is possible only while new authoring remains disabled and its behavior is verified. After V19, rollback stops at the compatible writer release: old binaries have an invalid `ON CONFLICT` target and cannot be restored. Disabling incremental selects the corrected full path and preserves history. Do not re-add old uniqueness after distinct requests have produced equal artifacts; repair through a new forward migration. Remote credentials, Vertex approval and AWS S3 provisioning remain separate prerequisites.

## Verification and outstanding integration

`InferenceMigrationIT` exercises a fresh V1–V18 install and a V17→V18 upgrade with existing revision/execution history, old publisher compatibility, immutable requests/outcomes/metadata, cross-test baseline rejection, scope revision enforcement, explicit V19 barrier, distinct-request identity and same-request deduplication after cutover. V19 executes only in a disposable transaction that is rolled back in the test. No historical FULL marker is fabricated.

The migration slice does not implement API captures, planner eligibility, final baseline query/runtime filtering, current-request CAS, v2 capability flags or complete mixed-provenance JSON production; these belong to backend story 10.24. Its tests and measured baseline query are required before claiming the integrated story accepted. No shared database, live gateway or deployment was changed by creating these artifacts.

Local verification on 2026-09-16: all 7 `InferenceMigrationIT` cases passed on PostgreSQL 15 via Testcontainers, with zero skips. Build completed in 16 seconds using Java 21. This evidence covers the migration slice only; final repository-query measurement and application concurrency/integration remain required.

## Configuration and local verification

Keep `STUDIO_GATEWAY_ENABLED=false`, `STUDIO_AUTHORING_V2_ENABLED=false`, and `STUDIO_INCREMENTAL_ENABLED=false` until their respective prerequisites pass. `STUDIO_GATEWAY_MAX_OUTPUT_TOKENS` defaults to8192. After V19 and compatible API/runner deployment, the v2 authoring UI is separately selected by `window.__CHECKS_CONFIG__.studioAuthoringV2=true` before the bundle loads; the default UI remains compatible with v1. Enabling v2 authoring alone does not enable a model or incremental eligibility.

The maintained Google Gen AI adapter pins1.71.0 and bounds service-account, user ADC and compute ADC credential transport. Service-account/user stalled refresh and socket cancellation have local wire evidence; compute was source-inspected. External/executable/impersonated credential providers fail closed until separately supported. Live R2D2 auth/model/schema/quota evidence remains SPK-01.

Run development evaluation through `studio-runner/evaluation/README.md`. Its CLI executes the complete API lifecycle and independent fixture oracles, but always reports release readiness false. The sample corpus and scripted lifecycle tests do not substitute for a frozen held-out release corpus. Typed assertion-failure origin is not exposed by the current execution API; intended-failure live cases cannot claim correctness without that evidence.

The existing frontend local dependency is `file:../../put-core-components`; ensure it resolves to the real built PUT core-components checkout before typecheck/build. This session repaired only the local node_modules symlink to the existing built checkout, without changing the package dependency or adding a replacement library.
