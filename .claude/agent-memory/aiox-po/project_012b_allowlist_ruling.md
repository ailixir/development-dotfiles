---
name: 012b-allowlist-ruling
description: 2026-10-13 PO T0 ruling for STUDIO-OBS-012B (T0 plan RK-6) — MSW handler-coverage allowlist classes A/B/C, OBS-008 removal obligation, orphaned docs/specs/studio artifact-1/inference docs deleted by 012B
metadata:
  type: project
---

On 2026-10-13 I ruled on STUDIO-OBS-012B AC-3, the check that "every surviving public route has a handler". The record is `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ruling-012B-allowlist.json`. Story versions are 012B 0.1.2 and OBS-008 0.3.2, and both stay Ready.

How the allowlist works:
- It is a closed list keyed by operationId.
- An entry fails as stale once its operation has a handler. That is how OBS-008's removal obligation is enforced.
- "Public" means the operation has no `x-internal` marker, derived from openapi.yaml rather than copied by hand.

The three classes of exclusion:
- **Class A belongs to OBS-008.** It covers 7 guided operations, a conditional guided video entry (added after OBS-013 C1 lands) and listTestSecrets/createTestSecret (AC-5).
- **Class B is permanent.** It holds `streamExecution` (SSE), which the 10.11b scripted transport mirrors.
- **Class C is conditional.** It holds the OBS-014 policy operations. No story in the wave has a frontend consumer for them, so they are NOT OBS-008's, even though the architect's T0 plan assumed they were.

`validateTestVariables` is not allowlisted; 012B adds its handler.

The three documents `docs/specs/studio/{artifact.schema.json, inference.openapi.yaml, inference-proposal.schema.json}` are deleted by 012B, not 012A. 012B also re-points the frontend fixtures to v3 `publication-fixtures.json#/artifact`. `docs/specs/studio/examples/context-authoring-*` are live authoring-context v2 fixtures and are kept.

**Why:** 012A (still InProgress) had already deleted the backend copy and ArtifactSchemaDriftTest, which left only frontend readers, and those sit in 012B's lane. If 012A deleted the schema, the frontend test would go red across lanes. Assigning the policy routes to OBS-008 would change the meaning of its ACs.

**How to apply:**
- When validating OBS-008, check that the Dev Agent Record at T5 shows zero class-A entries.
- When any story adds a public route (OBS-013 C1, OBS-014 C2b, or OBS-015), it must add a handler or a PO-ruled entry in the same unit.
- Check the architect's T0 plans for ownership claims against the actual ACs before adopting them.
- Related: [[studio-observed-wave-po-conventions]], [[single-path-recut-validation]].
