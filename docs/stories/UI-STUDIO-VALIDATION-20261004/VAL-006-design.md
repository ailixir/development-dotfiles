# VAL-006 — Live compile publishes the raw proposal envelope as an artifact (design)

Author: @architect (Aria) · 2026-10-04 · branch `brunobuger/ui-studio` @ 13ec11d1c · status: PROPOSED

## 1. Diagnosis: confirmed (traced in code, not re-run)

Live path, in order (all under `backend/src/main/java/com/citi/put/checks/studio/compile/`):
1. `CompilePipeline.compile` → `executor.submit(runAttempt)`.
2. `runAttempt` → `assemblePrompt` → `PromptAssembler.assemble(...)` (both overloads) → the 10-arg
   `gateway/CompileRequest` ctor → defaults `proposalKind="FULL"` and **synthetic writable IDs**
   `UUID.nameUUIDFromBytes(compileRequestId + ":" + i)`, one per source line, in order.
3. `GatewayPayloadSerializer.requestContents` sends "Required envelope kind: FULL" and the IDs;
   `output-contract.md` (2.2.0) tells the model to return `{"version":1,"kind","steps":[{stepId,status,code}]}`
   and to *never* emit `stepIndex`/`originalText` ("The server assembles source and positions").
4. `GenAiLlmGatewayClient.java:391-397` → `parser.parseProposal(...)` (strict envelope check, IDs in order)
   → `ParseResult.valid(root.toString())` → `CompileResponse.ok(<envelope>, ...)` in the `artifactJson` slot.
5. `runAttempt`: `isSupportedArtifactVersion` passes (envelope also has `version:1`) → `validationClient.validate(envelope)`
   → runner rejects: `ARTIFACT_UNKNOWN_KEY kind`, per step `STEP_UNKNOWN_KEY stepId/status`,
   `STEP_INDEX_MISALIGNED`, `STEP_TEXT_MISMATCH` → repair ×2 (same shape again) → `publishInvalid` = NEEDS_REVISION.
   Exactly the observed diagnostics. **No code path converts envelope → artifact.**

`incremental/IncrementalAssembler` (the converter) has zero callers in `src/main` (verified by grep at HEAD).

Recorded-fixture contrast: `RecordedFixtureGatewayClient.propose` returns `corpus.artifactFor(source)` —
already artifact-shaped (`stepIndex/originalText/code`) — so local runs never exercised the seam.

## 2. Introduction (git)

- `51ade0f1f` (rescue snapshot of `wt/epic`, INC-001 WIP) added `GenAiLlmGatewayClient`, `parseProposal`,
  the envelope `output-contract.md` (2.0.0) **and** a capture/planner `CompilePipeline` that called
  `IncrementalAssembler.assemble` before validation. Consistent at that point.
- `ec94e9585` merge(epic-10) fold, message verbatim: "their `GenAiLlmGatewayClient` is the wired client" and
  "Compile pipeline: ours … kept whole. Their … `IncrementalAssembler` … kept." **This is the break**: envelope
  producer kept, the only envelope consumer dropped.
- Story 10.45 (`f7175f5a7`..`13ec11d1c`) did not introduce it but built on it (repair carries the rejected
  *proposal*, "FR-10 on the live FULL path"), so it was assumed working.

Why tests pass: `CompilePipelineTest`/`AbstractRepairPipelineTest`/`CompilePipelineIT`/`StudioCoRunIT` stub
`LlmGatewayClient` with artifact-shaped JSON (`CompilePipelineTest.artifactFor`); `GenAiLlmGatewayClientTest`
and `InferenceEnvelopeTest` only assert `isOk()`/`isValid()` on the envelope, never what the pipeline does
with it. No test joins the two halves.

## 3. Fix (minimal, FULL only)

**F1 — declare the client's output shape (no sniffing).** Add to `LlmGatewayClient`:
`default boolean returnsProposalEnvelope() { return false; }`; `GenAiLlmGatewayClient` overrides `true`.
Recorded-fixture, Disabled and every test stub keep `false` → unchanged behaviour, zero test churn.

**F2 — assemble in `CompilePipeline.runAttempt`**, right after `response.isOk()` and before the version gate:
```
proposalJson = response.artifactJson();
artifactJson = gatewayClient.returnsProposalEnvelope()
    ? assembleFull(firstPrompt.writableStepIds(), inputs.orderedSource(), proposalJson) : proposalJson;
```
`assembleFull`: `steps = zip(ids[i], source[i] ?? "")` as `CompilationPlanner.Step`;
`plan = CompilationPlanner.plan(steps, /*explicitFull*/true, …, null)` (→ FULL, all IDs, prefix 0);
`IncrementalAssembler.assemble(steps, plan, null, proposalJson)`. Server derives `stepIndex` and
`originalText`; the model supplies only `code`. Result then goes through the existing version gate,
`/v1/validate`, `candidate(...)`, `publishAcceptedCandidate` — unchanged.

Outcomes of assembly:
- `IllegalArgumentException` (e.g. whitespace-only `code`: assembler uses `isBlank`, parser `isEmpty`) →
  `settleError(GATEWAY_PARSE_FAILURE)`, same as a gateway parse failure today (ends the request, no repair).
- `!result.executable()` (any `UNSUPPORTED`/`CLARIFICATION` entry) → **terminal NEEDS_REVISION, no validator
  call, no repair** (contract rule 5: one such entry blocks publication). Build
  `ValidationOutcome.verdict(false, runtimePin.validatorSchemaVersion(), [], perStep RunnerDiagnostic(reason,
  index-of(stepId), message, null, null))` → `diagnosticsBounder.bound(..., exhausted=false)` → `publishInvalid`.
  This mirrors the rescue pipeline at `51ade0f1f`.

**Repairs.** `lastRejectedProposal` must be set to `proposalJson` (the model's own envelope), not the
assembled artifact — the repair asks for "a corrected proposal of the same kind for exactly the same writable
step IDs". IDs/kind stay frozen because `RepairPromptAssembler` copies them from `firstPrompt`, and F2 always
assembles against `firstPrompt.writableStepIds()`. Validator diagnostics are keyed by `stepIndex`; the prompt
lists fenced lines `i: …` and the IDs in the same order, so index↔ID is recoverable by the model (no change).

**Provenance/audit.** Untouched: `response.provenance()` is still passed to `candidate(...)`; the gateway
audit line is written inside the client before the pipeline sees the response. Canonical artifact/hash are
computed from the assembled artifact, which is what is validated and stored — correct.

**Out of scope (INC-001):** PATCH/INCREMENTAL/REUSE, `CompilationPlanner` baselines, `InferenceCaptureStore`,
`captureForCompilation`, `assembleCaptured`, `confirmVersioned`, writable-anchor fingerprint input, persisting
plan mode/reason. No migration, no API/OpenAPI change, no prompt-version bump (contract text unchanged).

## 4. Files

- `compile/gateway/LlmGatewayClient.java` — default `returnsProposalEnvelope()`.
- `compile/gateway/GenAiLlmGatewayClient.java` — override `true`.
- `compile/CompilePipeline.java` — `assembleFull`, rejection→diagnostics, `lastRejectedProposal = proposalJson`;
  update class Javadoc ("parse, **assemble**, validate").
- Optional doc-only: `CompileResponse` Javadoc (`artifactJson` may hold a proposal envelope when the client
  declares it).

## 5. Tests

1. **`LiveProposalPipelineTest`** (the one that would have caught VAL-006): stub client with
   `returnsProposalEnvelope()=true` returning a FULL envelope built from `prompt.writableStepIds()`; capture
   the JSON passed to `RunnerValidationClient.validate` and assert it has no `kind`/`stepId`/`status`,
   `stepIndex` = 0..n-1, `originalText` == source byte-for-byte; candidate published.
2. Same, with one `UNSUPPORTED` step → NEEDS_REVISION, validator **never** called, one gateway call, diagnostic
   code `UNSUPPORTED_CAPABILITY` at the right `stepIndex`.
3. Repair: attempt 1 validator `ok:false` → attempt-2 request's `repairDiagnostics` contains the **envelope**
   (has `"kind"`), same `writableStepIds` as attempt 1.
4. Whitespace-only `code` → `GATEWAY_PARSE_FAILURE`, no validator call.
5. Regression: existing artifact-shaped stubs + recorded-fixture path unchanged (existing suites, no edits).
6. Narrowest verification: `./gradlew test --tests '*compile*'` then one live Vertex compile of the VAL 4-step test.

## 6. Risks / trade-offs

- F1 flag vs. shape-sniffing (`has("kind")`): sniffing needs no interface change and is unambiguous (artifact
  schema forbids `kind`), but hides a contract in data. Flag chosen; ~2 lines either way.
- Alternative C (fixture/stubs also emit envelopes, pipeline always assembles) is the cleaner end state but
  rewrites ~11 stub clients and many fixtures — defer to INC-001.
- Frontend may not have copy for `UNSUPPORTED_CAPABILITY`/`AMBIGUOUS_INTENT` diagnostic codes (none found in
  `frontend/src`); they will render with the generic code path — verify in VAL.
- Dual identities on the v2 path: `ContextPromptSection` fences the **authoring** `stepId` inside
  `untrustedContext`, while writable IDs are synthetic. A model could echo the wrong ID → parse failure.
  Not observed; see open question 2.
