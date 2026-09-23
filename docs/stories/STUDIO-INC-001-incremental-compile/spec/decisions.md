# User decisions — STUDIO-INC-001 (2026-09-23)

Resolves blocking open questions OQ-1..OQ-5 in `requirements.json`. These are fixed inputs for the
spec, critique and plan phases.

| OQ | Decision | Source |
|---|---|---|
| OQ-1 Reference compatibility | **Exact declared-reference set equality (C0 as-is).** A change to the test's declared variable/secret list makes the baseline ineligible → FULL. Switching step 2 to an *already-declared* variable stays incremental. | User |
| OQ-2 Scope declaration | **User delegated the design**, with fixed intent: recompile only the changed step and every step after it; never touch prior (locked) steps; *always* give the model the prior steps as context at inference time for full visibility. Proposal below. | User intent + Claude proposal |
| OQ-3 Confirmation | **Keep Run auto-accept.** Run = compile (if needed) → auto-accept → execute full workflow from step 1. Compile result/log must show reused vs regenerated steps (and code diff). | User |
| OQ-4 UI surface | **Restore the v2 stack + mount `InferenceStudio`** as C0 / story 10.25 designed (v2 controller/service/DTOs from `51ade0f1f`, rebuilt on the current pipeline incl. Story 10.44 changes). | User |
| OQ-5 Why the wiring was dropped | **Resolved by git:** merge `ec94e9585` states the v2 REST stack was not kept because its only entry point `CompilePipeline.compileVersioned` did not exist on the ui-studio side (fold conflict decision, not a known defect). | Git history |

| OQ-S3 Tail deletion | **Keep `TAIL_DELETION`.** Deleting only trailing step(s) is REUSE (zero inference) for the remaining prefix; whole artifact still validated; Run still executes from step 1. | User, 2026-09-23 |

## OQ-2 proposal (to be specified; amends C0 §scope)

1. **Default forward scope, no author checkbox.** A step's meaning may depend on its own text, preceding
   steps and declared references. This is the natural reading of an ordered English checklist and is
   what the user asked for. The explicit STEP_SCOPED affirmation stops being a precondition for
   INCREMENTAL. Replace it with the server-derived checks below. Keep the `scope` field for audit
   (`declaration: "DERIVED_FORWARD"`).
2. **Write set = earliest changed step → end.** Prefix steps are byte-locked (source and code). Insertions,
   deletions and reorders count as changes at the earliest affected position. A change at step 1 means FULL.
3. **Prior steps always in context.** The prompt carries the full ordered English plus the locked baseline
   code for every prefix step, marked read-only. Writable steps carry their prior code as a diff anchor
   *only* if evaluation shows it doesn't bias the output. Otherwise they carry the English only (10.26 harness decides).
4. **Backward/global dependency escalation → visible FULL.** Two signals:
   - a deterministic server detector over the *changed* steps' text (e.g. "all steps", "throughout",
     "every page", "go back to step", "instead of step N", references to earlier step numbers), and
   - a model outcome `PREFIX_IMPACT` (new proposal status) that the model may return for a writable step
     whose correct implementation requires changing a locked step.

   Either signal ends the incremental request and starts a new FULL request inside the same Run flow,
   logged as `ESCALATED_FULL` with the reason. This is not a hidden fallback: it is recorded, shown and budgeted as a
   separate request. C0's "no hidden full fallback" is preserved in substance; the amendment makes it
   visible and automatic rather than an author action.
5. **Safety net unchanged:** validator on the whole merged artifact; reused-code validation failure →
   FULL_REBUILD_REQUIRED; Run always executes all steps from step 1 in a fresh browser; "Rebuild all
   steps" (FULL) is always available.
6. **Eligibility otherwise per C0:** a PASSED FULL execution of the baseline revision at the same fingerprint,
   config and runtime pins; same CSI; exact reference-set equality (OQ-1).
