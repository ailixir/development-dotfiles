---
name: project-obs015-step-text-cap-ruling
description: OBS-015 cap ruling 2026-10-16 — step text single bound is 500 (AuthoringStep.text); max-line-chars 1024 is compile leftover, delete; keep SOURCE_LINE_TOO_LONG at 500
metadata:
  type: project
---

Step-text cap on the single observed path = 500 (`AuthoringStep.text`, frozen 10.34). `studio.authoring.max-line-chars` 1024 came from the compile artifact bound and was reachable only via the v1 body deleted by 015 ruling1. The ruling is to delete the property and keep `SOURCE_LINE_TOO_LONG` enforced from an `AuthoringStep.MAX_TEXT_CHARS` constant. Owner is 015, with a test delta of 0. The evidence is in `backend/aria-cap-ruling01/`.

**Why:** single path, no compat. Widening to 1024 had no product driver, and deleting the code would lose the actionable refusal (ADR-002 §34).

**How to apply:** if similar config bounds sit above contract limits (for example `studio.authoring.max-steps` vs `maxItems: 100`, which is still unruled), apply the same reasoning: the contract value wins, so delete the knob. Related: [[project-obs015-append-rulings]].
