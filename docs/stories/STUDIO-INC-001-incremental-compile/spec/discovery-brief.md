# Discovery brief — Studio translation engine, Save/Run, incremental recompilation

Input to the Spec Pipeline for STUDIO-INC-001. Everything below was verified by reading code/git
on branch `brunobuger/ui-studio` @ `1f3c56a59` (2026-09-23) unless marked **[inferred]**.

## User request (verbatim intent)

Map how the translation engine (Save and Run) works; make LLM inference efficient/optimized; and
support: when a user edits step N of a test that previously ran green, keep steps 1..N-1 locked
(compiled code reused) and regenerate/compile/validate only N..end, with the model still given
context about the prior steps. Example: 1) open site 2) login 3) validate page loaded — user changes
step 2 to use a different username variable; step 1 stays locked, steps 2 and 3 are regenerated.

## Current live flow

- **Save** — `ChecksStudioPage.tsx:557-595` → `PUT /api/v1/studio/tests/{id}` with v1 body
  (`steps: string[]`, no stable step IDs). `StudioService.updateTest` sets `compile_status=STALE`
  (`StudioService.java:574`). Save never compiles (`StudioService.java:264`).
- **Run** — `useRunGate.ts:267-355`: save if dirty → `GET` → if status ≠ READY/COMPILING,
  `POST /tests/{id}/compile` (no body, no mode) and poll every 600 ms up to 330 s → `POST /execute`.
  Unedited READY test: no compile, no LLM call. Edited test: always full recompile.
- **Compile** — `CompilePipeline.compile()` → `beginCompile` → bounded executor → attempt loop
  (1 + 2 repairs): `PromptAssembler.assemble` (legacy/v2-context variants) → `GenAiLlmGatewayClient
  .propose` (Vertex, `gemini-3.8-flash`, JSON-schema structured output) → artifact version pin →
  runner `POST /v1/validate` → `publishAcceptedCandidate` (READY) or repair / `publishInvalid`.
  Always FULL: every step regenerated. No cache (by design, §8.5).
- **Execute** — `StudioAcceptanceService.accept` runs the *confirmed* revision; `execution_scope`
  is always `FULL`; runner executes all steps from step 1, no resume/offset (`RunJob.java:61-77`,
  `executor.ts:96-135`). Run never calls the LLM (`NoRuntimeLlmTest`).

## Incremental compilation — designed, built, disconnected

- Contract: `docs/architecture/studio-inference-contract-v1.md` (C0) — modes FULL / INCREMENTAL /
  REUSE; INCREMENTAL regenerates earliest changed step → end; prefix byte-identical; full English +
  baseline code fenced as context; requires STEP_SCOPED scope declaration + prior passing FULL run
  at same fingerprint; repair never widens write set; reused-code failure → FULL_REBUILD_REQUIRED.
  Stories 10.24 (InReview, AC-8 open), 10.25 (Ready, FE/MSW only), 10.26 (harness, InProgress).
- Components present but **only called from tests**: `compile/incremental/CompilationPlanner`,
  `IncrementalAssembler`, `InferenceCaptureStore`, `CompileStateService.captureForCompilation`,
  `PromptAssembler.assembleCaptured`, `confirmVersioned`.
- The production wiring (`CompilePipeline.compileVersioned` + captured `runAttempt`) and the v2
  REST stack (`authoring/StudioAuthoringController`, `StudioAuthoringService`, `AuthoringDtos`,
  `StudioAuthoringIT`, `StudioVersionedCompilationIT`) exist in archived commit `51ade0f1f` and
  were deliberately dropped by fold merge `ec94e9585`.
- FE v2 UI `components/studio/inference/InferenceStudio.tsx` (step IDs, scope checkbox, AUTO/FULL,
  confirm) + `studioInferenceApi.ts` (`/api/v2`) exist but are not mounted; no `/api/v2` controller.
- Flags: `studio.compile.incremental.enabled` (default false) and `studio.authoring.v2-enabled`
  (default false) are bound by nothing. FE `studioAuthoringV2` only read by MSW.
- `PUT /api/v1/.../tests/{id}` does accept a v2 body when `authoringSchemaVersion` present
  (`StudioController.java:91-96`) — the page never sends it.

## Gaps against the user's scenario (even if the archived wiring were restored)

1. **Reference-set equality kills the baseline.** `InferenceCaptureStore` baseline query requires
   `r."references" = current referencesJson`, which is the test's *entire declared* variable/secret
   list (ordered JSON array). Adding a new variable for step 2 → no baseline → FULL
   (`NO_ELIGIBLE_BASELINE`). Switching to an already-declared variable keeps eligibility.
2. Requires an explicit author STEP_SCOPED declaration (renewed after each semantic edit), else FULL.
3. Requires a PASSED FULL execution of the baseline revision at identical fingerprint/config/runtime pins.
4. Suffix steps are always regenerated (no "unchanged, keep" outcome for suffix steps).

## Inference efficiency findings

- **Prefix-cache-hostile prompt order** (`GatewayPayloadSerializer.serialize`): output contract
  (2.4 KB) → `Required envelope kind` + `Writable step IDs` (varies per request; legacy path derives
  IDs from random compileRequestId) → syntax reference (6.8 KB) → source. The variable line sits
  between the two static blocks, so Gemini implicit prefix caching cannot cover the syntax reference.
  Everything is one user-content string; no `systemInstruction`.
- **Global context duplicated per step** (`ContextPromptSection.from`): `globalContext` copied into
  every step envelope → O(steps × global) bytes; also trips the 32 KiB `CONTEXT_TOO_LARGE` cap early.
- **No thinking config** sent (Gemini 3.x default); usage accounting records prompt/candidate tokens
  only — no `thoughtsTokenCount`, no `cachedContentTokenCount` (`GenAiLlmGatewayClient.interpret`).
- **Repair is blind and full-width** on the live path: repair resends whole prompt + bounded
  diagnostics, without the rejected proposal, and regenerates all steps (the archived captured path
  did pass the rejected proposal via `repairContext`).
- Transport retry on 429/503 inside one proposal — fine. Structured output schema — fine.
- **[inferred]** `assembleCaptured` sends `baselineCode` for writable (changed) steps too; useful as
  a diff anchor but may bias the model toward stale code — needs evaluation evidence (10.26 harness).

## Correctness clarification

"Locked step 1" is a **compile-time** lock. Execution must still run all steps from step 1 in a fresh
browser (step 2 depends on page state step 1 produced). That is C0 and current behavior — keep it.
