---
name: q9-hint-residuals-20261017
description: 2026-10-17 008 KL-015-Q4 hint trigger (Q9) = FAILED + {TARGET_MISMATCH, BUDGET_EXCEEDED} + clause predicate; R1–R4 placed in 009 AE-01; D-5 original k = session firstLearnStepId
metadata:
  type: project
---

On 2026-10-17 the lead had @po (Pax) write two append-only notes: 008 went to 0.3.16 (still InProgress) and 009 to 0.3.21 (still Ready).

- **008 D-5.** After a prefix drift, `relearnedFrom.stepId` equals j. The drift sentence's original k is the session's `firstLearnStepId`, which the page passes into `GuidedCompletion`. Sources: L5b W3 brief addition 3 and the @dev tech-gate Q2 confirmation.
- **008 KL-015-Q4 item (c).** @architect ruling Q9 (`execution-20261017/rulings/q9-authored-literal-trigger.md`) sets the trigger. The backend never emits `TARGET_MISMATCH`, and the hidden-target path ends `FAILED BUDGET_EXCEEDED` because acquisition refuses it. Copy key `authoredLiteralTargetNotFound`; trigger file `frontend/src/pages/ChecksStudioPage/authoredLiteralHint.ts`.
- **009 AE-01.** R1–R4 are quoted in a note after item f. [AUTO-DECISION] R4's sentence "b/c should pin the before state" is recorded as a recommendation and is NOT an added b/c obligation. How e classifies a run without a target code is still undecided.

**Why:** at 009 AE-01 landing or validation, f must remove that key. R2 goes away only with f, and e cannot count hidden-target runs by a code.
**How to apply:** when validating AE-01 work, check the f grep for the key, ask how e is classified, and do not treat R4's b/c sentence as a gate. Related: [[009-t0-outcomes-20261017]], [[008-scope-decision-20261017]].
