---
name: project-learn-proof-backend-lane
description: Proof = replay of published revision (backend, 2026-10-25) - V27 link table, in-commit acceptPublished, GuidedPublicationProofIT harness recipe and fixture traps
metadata:
  type: project
---

Backend lane of "proof = replay of the published revision" (design A, fail-closed H-1). Built 2026-10-25:

- Migration `V27__learn_proof.sql`: trigger-source CHECK adds `AFTER_LEARN`; immutable `studio_learn_proofs(session_id PK, revision_id, execution_id UNIQUE NULL -> ledger, refusal_code NULL)` with exactly-one CHECK, closed 7-code refusal set, guard trigger (execution must be AFTER_LEARN of that revision), immutability trigger. Head-version assertions in ~10 migration ITs and `target("26")` in ~12 ITs were bumped to 27; `GuidedRuntimeRolePrivilegeIT` needs a ruling for each new relation.
- `StudioAcceptanceService.acceptPublished` (non-@Transactional, requires active txn, key null) -> `StudioPublicationProofLauncher` (dispatch pkg) behind `PublicationProofLauncher` (publication pkg); called in `GuidedPlanPublisher` commit tx right after `publications.commit`. Refusals map to closed codes; anything else rolls the publication back.
- `projectResult(session, base, published, ...)` no longer validates; callers do. "Published" = receipt row (`studio_guided_publications`), never the state string. Live fallback path with publication disabled must NOT suppress the video (GuidedResultPublicationDisabledIT pins legacy bytes), so suppression is a projector argument, not in `RecordedGuidedEvidenceProjection`.
- Stop reason `PUBLISHED` only from `publicationCommitted`'s `stop(session,"SUCCEEDED")`.

**Test harness recipe (GuidedPublicationProofIT):** `PublicationGrantClockIT` pattern (`FreshAuthority` import, `guidedDraft`, `learnWithoutPublishing`, `completeExistingSession`, set FINALIZING) + replace `GuidedPlanPublisher.validator` by reflection with a Mockito `HttpRunnerDispatchClient` whose `validate` answer rebuilds the verdict from the request via `ObservedArtifactLowerer.lower(validationBasis, requiredProfile).hashes()`. Traps: `guidedDraft` leaves `steps` = ["Open"] while authoring text is "Open <ORIGIN>", so readiness says LEARN_REQUIRED (term 6 source hash) -> UPDATE `ui_tests.steps` to the authored text; `clearLedger` must skip ledger rows referenced by learn proofs (FK + immutable link); refusal classes via @SpyBean on StudioExecutionProperties/StudioReferenceResolver/ExecutionReadinessService/ObservedReplayAuthorization (records and final classes spy fine).

**Why:** next person touching proof/publication or adding a table needs the grant/head-version ripple list.
**How to apply:** see [[tooling-shared-build-dir-clobber]] for running the ITs when other agents build in the same checkout.
