---
name: ar2-ar3-obs014-rulings
description: AR-2/AR-3 (2026-10-13) OBS-014 rulings — code vocabularies, V19 prune/guard design, X6-b delete, P1 admission deletion narrower than planned (claimAt live), 8 hidden claim() test callers
metadata:
  type: project
---

The rulings are recorded in docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-2-3-obs014.json.

**Vocabularies.** "One vocabulary" (ExecutionErrorCode + openapi + V13 CHECK) is the execution vocabulary. ErrorCodeVocabularyTest forbids any migration other than V13 from naming the CHECK. Guided codes are a separate set: v3 error.schema has a closed enum, result.errorCode is an open string, and no DB CHECK applies to them.

**New codes.** POLICY_NOT_APPROVED goes in the v3 error enum. SIDE_EFFECT_CONFIRMATION / CONFIRM_ACTION go in clarification. POLICY_DENIED carries an internal reason (UNGROUNDED_TARGET / DESTRUCTIVE_VERB / SIDE_EFFECT_DENIED), and only reasoned denials end the session as terminal POLICY_DENIED.

**AC-9.** A missing key returns 400 IDEMPOTENCY_KEY_REQUIRED, thrown as StudioValidationException in the controller.

**Prune.** A SQL function studio_guided_prune_session applies a retain-list of progress keys, nulls safe_result, and deletes the publication copies of never-published sessions. The attempt guard and studio_publication_immutable are CREATE OR REPLACE, each opening exactly one transition.

**P1 trap.** claimObserved calls the private claimAt with AdmissionRequest/AdmissionResponse. Only claim() and the route are legacy. Six other ITs use claim() as a setup helper; re-point them to ObservedPublicationFixture.admitObserved. ObservedReplayAuthorization's "AdmissionRequest" is a schema string, not a Java import.

**Why:** the plan and story assumed the whole claim/claimAt path was legacy, and assumed a "problem+json" body. Neither matches the code.

**How to apply:** at the OBS-014 gate, check that V19 does not name the execution CHECK, that the re-pointed tests are recorded by name, and that bases/attempts are retained for X6-b. Related: [[obs013-014-hidden-overlaps]], [[obs012a-gate-residues]], [[contract-change-checklist]].
