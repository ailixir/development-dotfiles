---
name: obs015-t0-rulings
description: OBS-015 T0 (2026-10-13) — v1 authoring removed as 2nd generation; lowered firstLearnStepId = REVISION_CONFLICT; snapshot hash chain; mixed-mode = frozen governed policy; serial after 013/014
metadata:
  type: project
---

Ruled in docs/qa/evidence/STUDIO-OBS-015/t0-architect-rulings.json (2026-10-13):
- O-1/P7: v1 authoring (POST/PUT v1 branch, v1 GET projection, LegacyAuthoringRequest, StudioAuthoring sealed, adaptLegacyAuthoring, LegacyAuthoringPersistenceAdapter, LegacyDeserializer, adapter tolerances) = second generation, deleted in 015. Refusal = existing 400 INVALID_AUTHORING / UNSUPPORTED_FIELD (no new code). LEGACY_AUTHORING + AUTHORING_V2_REQUIRED deleted (both undeclared in openapi). Canonical steps/variables codec kept but renamed off "Legacy".
- Status normalisation (COMPLETED/TIMEOUT): not authoring; dead since V13 CHECK; deleted in 015 after 013 lands.
- Lowered k: REVISION_CONFLICT 409 + messageCode (FIRST_LEARN_STEP_NARROWED etc.). AC wording "lower" is inverted vs invariant — PO clarifies.
- Hash: stepInputHash -> inputChain (root testConfigHash) -> snapshot = H(stepId, inputChain, learnedStepHash minus admissionId).
- R-2: frozen governed policy authorises whole mixed session; prefix origin not governed = 403 ORIGIN_NOT_ALLOWED at start; replay authorizer untouched.
- REPLAYING_PREFIX needs V21 (V14 state CHECK) — story's "no DDL" default false.

**Why:** key surprise — production FE authors only v1, and guided start refuses authoring-null (RUNTIME_INCOMPATIBLE), so FE drafts are unlearnable today; OBS-008 must write v2 with stable IDs.
**How to apply:** when reviewing 015/008 gates, check these; related [[single-path-decision]], [[ar2-ar3-obs014-rulings]], [[ar-mounted-rules-ruling]].
