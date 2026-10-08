---
name: adr002-section-renumbering
description: ADR-002 sections shifted when Cancel became §29 — confirmed-source §30, video §31, Run auto-accept ruling §35 (O-22 execute authz open); QA docs still stale
metadata:
  type: project
---

ADR-002 numbering: §29 is Cancel (Studio v1 WP4), §30 is readable confirmed source (story 10.27), §31 is video error responses (10.27).

What was fixed on 2026-10-06: openapi.yaml:3027 now cites §30; the §13 video row now cites §31; and §13 has rows for 10.27 (§30) and 10.44 (ADR-SC-003). Still stale: docs/qa/verification-failures-review.md uses the old §29/§30.

That openapi fix moved the digest to `cbacad74…3cc8`. The re-anchor of confinement.test.ts BASE_SHA256 was left to @dev, so check whether it landed before assuming the pin is green.

The UI-VALIDATION-20260921 openapi edits in `554277fcb` (confirmCompile deprecated, compile auto-accept, execute-authorization sentence) were ruled on 2026-10-07 in §35 with a §13 row. None of the three is ratified as written. Execute-authorization is open as O-22 (user/security decision), and the text fixes are owed by the §35.5 fix story, which also re-anchors the digest.

**Why:** the drift was found during the 10.27 gate (V-1/V-2). A reference that gives only a section number sends readers to the wrong ruling.

**How to apply:** find ADR-002 sections by heading text, not by number. Any openapi description fix needs a digest re-anchor (see [[contract-change-checklist]]).
