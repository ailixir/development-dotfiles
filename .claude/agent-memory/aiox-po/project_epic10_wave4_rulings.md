---
name: epic10-wave4-rulings
description: Wave-4 PO rulings for Epic 10 — one conflict code on the remedy axis, sizing moves when architect rulings land after the estimate, and the "mutation that cannot fail" check
metadata:
  type: project
---

Three rulings from wave-4 validation (stories 10.9 and 10.13, 2026-09-11) that will recur in waves 5-8.

**Conflict codes are distinguished on the remedy axis, not the cause axis.** Where two failures are
held by the same person and cleared by the same action, they are one code. `STALE_CANDIDATE` answers
all six of 10.9's exactness failures for this reason; the message names what moved but is **prose,
never a branch key**. A frontend story that needs to branch raises a Class C escalation *with the
frontend requirement as evidence, before it starts* — it does not invent a code mid-implementation.
This is the same axis ADR-002 §14.3 uses, and the architect used it for the error-code vocabulary.

**An architect ruling landing after an estimate is the epic's recurring sizing cause.** Both wave-4
stories moved M → L for the same reason: ADR-002 §16 converted 10.9's AC-22 from *escalate* into
*implement four typed schemas*, and §17 made 10.13 the `partial` producer. Check for this whenever a
story carries an appended "Architect ruling" section — the criteria may be unchanged while the work
is not. The manifest records size changes as a comment block above the story entry (10.6's L → M is
the shape to follow).

**Why:** the epic's escalation convention ("leave it red and escalate") means stories are drafted at
the size of the escalation, not the size of the resolution, and the resolution often lands in the
same wave.

**How to apply:** when validating any Epic 10 story, diff what the story's criteria *say* against
what the ADR section named in its appended ruling *requires*; fold the ruling into the criteria
(the PO owns AC, the architect does not) and re-judge the size before setting Ready.

**A falsification that cannot fail is a defect, not a proof.** 10.9's drafted mutation (delete the
sweep's status term → a test goes red) could not have failed, because another criterion's invariant
made that term redundant. Since this epic requires recorded mutation proofs, check each one against
the story's *other* criteria before accepting it. Report a failed falsification as failed; never
quietly substitute one that works.

Related: [[epic10-concurrency-proof]], [[adr002-amendment-authority]], [[epic10-calibration-ruling]]
