---
name: p3-uuid-refid-amendment
description: 2026-10-23 r067 D1b: P3 amended so FE omits UUID-shaped referenceIds in "Steps as learned" action list; API/contract unchanged
metadata:
  type: project
---
P3 (OBS-008 architect-rulings.json, `labels`) amended 2026-10-23 (round 067, D1b): PlanExplanation action list omits referenceIds that fully match the anchored canonical UUID pattern. Nothing replaces them (no placeholder, attribute or CSS hiding). Declared names are still rendered. safeLabel and the seek name are unchanged. Flows lines are out of scope.
**Why:** P3 targeted *declared* IDs. Server UUIDs are not author-meaningful, and traceability stays in the unchanged v3 API field. They are not page-derived, so there is no security-styling issue.
**How to apply:** if someone proposes hiding IDs in plan-reference-flows or changing the API, that is a new ruling. Ruling file: G/round-067/architect-p3-amendment/RULING.md.
