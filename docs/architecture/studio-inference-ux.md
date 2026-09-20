# Studio inference authoring and review interaction

Owner: Uma. 2026-09-16. Implementation handoff for story10.25, derived from the user-approved plan and [C0](studio-inference-contract-v1.md). Uses existing Studio page, MUI controls, centralized API and MSW; no new execution engine.

## Editing and scope review

Keep ordered step identity separate from editable text. Editing/moving retains the server ID; insert/duplicate sends no ID for server allocation. On semantic edits (text, order, identities or reference declarations), clear the local scope affirmation. Do not silently copy the previous snapshot's STEP_SCOPED value into an edited request.

Place a labeled MUI checkbox next to the existing save/review action: **Each step depends only on its own wording, earlier steps, and declared inputs.** Helper text: **If a step refers to a later step or changes the meaning of the whole test, leave this unchecked. All steps will be rebuilt.** Initially unchecked for new/edited content. Checking sends STEP_SCOPED for this save only; unchecked sends UNKNOWN. It is optional and never blocks saving. Keep prior declaration visible as historical context if useful, without selecting the new affirmation. Avoid jargon about hashes, inference or dependency graphs in the authoring form.

A no-op save preserves server identity and confirmation. Scope declaration changes are actual authoring edits even when text is unchanged. No separate timestamp refresh control; identical declaration/text is no-op. Reaffirming scope does not assert test correctness.

## Compile and candidate review

AUTO is the default compile action. Add secondary **Rebuild all steps** action sending FULL; disable while a request is pending, with existing polling/cancellation/error behavior. Full fallback is a neutral explanation, not an error: e.g. **All steps rebuilt because step dependencies are unknown.** Display backend-selected mode/reason; never infer reuse locally.

For candidate review show **Recompiled steps5–6; reused steps1–4. Review changes, then run all6 steps.** Generate natural spacing/ranges from actual metadata. Each step has visible text badge **Reused** or **Recompiled**, with accessible text (not color alone). For regenerated code expose prior/current code in expandable labeled blocks; distinguish a newly generated identical code string from actual reuse. Show current English alongside code; do not imply an unchanged code string proves unchanged intent. Reused code remains expandable and is still validated.

Unsupported/clarification displays the affected step and bounded backend message with **Edit step**; it cannot expose a confirmable partial candidate. A full-rebuild-required diagnostic offers the explicit rebuild action, never launches it automatically. An unexpected candidate identity or stale confirmation reloads the server snapshot, clears the acknowledgement, and asks the user to review it again.

Confirm submits all C0 identity fields from the same current response. Confirmation label remains **Confirm these actions** and starts no browser. Existing explicit **Run test** then executes all steps; label/helper may say **Run all6 steps**. Saving, scope review, compiling and confirmation never call execute.

## Current versus historical evidence

New/edited candidate: **Not run for this revision** until an execution for this exact confirmed revision/configuration finishes. A historical passing result says **Previous revision passed** with run/time/revision link; never show its green state as the new candidate's status. Reused step badges represent code reuse only, never a passed step. Failed edits preserve historical records and cannot silently run the old candidate.

## Accessibility and verification

Use existing MUI theme, keyboard focus order and aria-live status conventions; scope checkbox label/helper associated programmatically. Code diffs are readable text blocks, not color-only. Error action retains focus or moves it to the affected step via explicit user action. Respect existing narrow-screen layout.

MSW flows cover independent last edit, middle suffix, unknown/global scope FULL, changed scope only, missing/expired baseline FULL, unsupported step, stale confirmation, identical generated code, config-only REUSE, no-op save, and prior-green/new-not-run. Assert API bodies/identity as well as rendered text. Record zero execute requests after edit/save/compile/confirm; explicit run produces exactly one execution request. V2 UI is feature-gated until the v2 server/schema is deployed; no silent fallback to v1 writes that discard IDs.
