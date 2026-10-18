# Studio inference production-readiness review — 2026-09-16

> **Superseded (2026-10-12):** Superseded by [ADR-SC-005](ADR-SC-005-single-path-observed-authoring.md) (single observed path; compile-to-READY removed in STUDIO-OBS-012A).

Reviewed in `wt/epic`, branch `epic/EPIC-10`, HEAD `e1684f8c7`, including the existing uncommitted integration work. Architecture review: Aria (`aiox-architect`), with an independent review of deterministic validation, the execution adapter, and focused reproductions. This is an engineering assessment, not a replacement for the story QA gates. No application code was changed during this review.

**Assessment: retain the architecture, but do not describe the implementation as production-ready yet.** The compile-time LLM, restricted language, trusted executor, immutable revisions, and human confirmation are appropriate foundations. Several concrete defects can produce misleading validation or execution results. Live gateway compatibility, semantic translation quality, and production latency remain unmeasured.

## Findings requiring correction

**F1 — P1: unsupported intent is deliberately approximated into executable code.**

[`output-contract.md:29`](../../backend/src/main/resources/studio/output-contract.md#L29) instructs the model to emit the “closest permitted call” when it cannot express a line. The validator checks allowed capabilities and source alignment; it cannot detect that a supported call reverses or omits the requested meaning. In a local probe, an artifact preserving the English `Verify that the message is NOT visible` but using `toBeVisible()` validated and passed on a visible element. This demonstrates the boundary's semantic limitation, not an observed live model response. The prompt currently encourages this failure mode.

Return an explicit unsupported/needs-clarification outcome that cannot become an executable candidate. Do not require the model to manufacture an allowed action. Add tests for negative assertions, downloads, uploads, frames, popups, loops, and ambiguous targets. A syntax repair must never silently weaken an assertion.

**F2 — P1: compile inputs can be labelled with a newer revision.**

[`CompilePipeline.java:145`](../../backend/src/main/java/com/citi/put/checks/studio/compile/CompilePipeline.java#L145) reads and snapshots the draft before separately calling `beginCompile`. [`CompileStateService.java:83`](../../backend/src/main/java/com/citi/put/checks/studio/compile/CompileStateService.java#L83) returns the row's current revisions without comparing them with the snapshot. `CompileInputs` contains no revision identity. A concurrent edit between those operations can therefore tag old source/configuration with the new revision numbers. The subsequent publication guards compare those new numbers and do not detect the mismatch.

Make snapshot acquisition and compile identity creation one short transaction, or compare-and-set against the exact snapshot revisions and retry on conflict. Add a barrier-controlled concurrency regression. This finding is established by code inspection; this review did not reproduce the interleaving against a database.

**F3 — P1: backend validator-response parsing fails open on malformed success.**

[`RunnerValidationClient.java:157`](../../backend/src/main/java/com/citi/put/checks/studio/compile/validator/RunnerValidationClient.java#L157) requires only an object with boolean `ok`. It does not enforce the complete response schema, source-aligned step count, unique indexes, or consistency between aggregate and individual verdicts. [`CompilePipeline.java:366`](../../backend/src/main/java/com/citi/put/checks/studio/compile/CompilePipeline.java#L366) also substitutes the configured validator version when the response omits it.

Direct probes of the compiled production parser returned `available=true, ok=true` for all three responses:

```json
{"ok":true}
{"ok":true,"validatorSchemaVersion":"1.0.0","diagnostics":[],"steps":[{"stepIndex":0,"ok":false,"diagnostics":[]}]}
{"ok":true,"validatorSchemaVersion":"bogus","diagnostics":[],"steps":[]}
```

Validate the full closed contract and expected source alignment before accepting success; reject contradictory verdicts and missing/incompatible versions. Never manufacture validation provenance. Runner revalidation still prevents invalid code from executing, but it does not make a falsely accepted compile result correct.

**F4 — P1: custom assertions differ from the Playwright semantics shown to authors.**

[`playwrightAdapter.ts:372`](../../studio-runner/src/run/playwrightAdapter.ts#L372) does not normalize whitespace for string `toContainText`, and only applies `ignoreCase` to strings. The analogous URL assertion also ignores that option for regexes. Real Chromium probes using the actual validator and executor produced:

| Accepted assertion / page text | Actual result | Playwright-compatible result |
| --- | --- | --- |
| `toContainText('Hello world')` / `Hello\n   world` | FAIL | PASS |
| `toContainText(/hello/, {ignoreCase:true})` / `HELLO` | FAIL | PASS |
| `toContainText(/hello/i, {ignoreCase:false})` / `HELLO` | PASS | FAIL |

The last case is a false success. Match documented behavior for every accepted option, or narrow and explicitly document the language. Add real-browser conformance tests covering regex flags, explicit `false`, whitespace, detached/missing elements, and timeout boundaries. Each polling read currently receives the full timeout, which also warrants a remaining-deadline test. [Playwright assertion semantics](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-contain-text).

**F5 — P1: expiry stops publication but does not stop inference work.**

[`StudioCompileProperties.java:185`](../../backend/src/main/java/com/citi/put/checks/studio/compile/StudioCompileProperties.java#L185) calculates the worst-case duration without transport retries. Defaults allow three proposals, each with up to three network attempts. A slow retryable 503/429 can consume nearly three 60-second attempts in one proposal. Fully completing all proposals could require roughly 570 seconds plus backoff, while the configured outer budget is 240 seconds. This is arithmetic under slow retryable responses, not a measured live latency.

[`CompileExecutor.java:143`](../../backend/src/main/java/com/citi/put/checks/studio/compile/CompileExecutor.java#L143) settles the request on expiry without cancelling its task. [`VertexLlmGatewayClient.java:116`](../../backend/src/main/java/com/citi/put/checks/studio/compile/gateway/VertexLlmGatewayClient.java#L116) has no shared deadline inside its retry loop. The pipeline prevents later proposals after settlement, but an in-flight proposal can keep retrying and occupy capacity after expiry.

Propagate one monotonic deadline through inference, backoff, and validation; cap each operation by remaining time and cancel supported in-flight calls. Verify no post-deadline retry and prompt release of capacity. Preserve the existing refusal to retry ambiguous timeouts.

**F6 — P2: an action can pass without being performed.**

[`language.ts:172`](../../studio-runner/src/validator/language.ts#L172) permits `trial` on actions and the adapter forwards it. A real-browser probe of `Click the Submit button` compiled as `.click({trial:true})` validated and returned PASS, while the button's click handler never ran. This follows Playwright's trial semantics, but it is a poor default capability for operational checks. The frontend summary still uses the action word `Click`, with raw options rather than a clear explanation that the action is skipped.

Reject `trial:true` for action intent, or model it explicitly as an actionability check with a truthful review summary. Evaluate whether `force` and `networkidle` belong in ordinary generated output; their acceptance should be intentional and tested. [Playwright trial behavior](https://playwright.dev/docs/api/class-locator#locator-click).

## Inference quality and deployment gaps

**F7 — P1 rollout prerequisite: the legacy SDK and real gateway contract need resolution.** The implementation pins `google-cloud-vertexai:1.52.0` and uses `com.google.cloud.vertexai.generativeai`. Google's migration notice identifies June 24, 2026 as the removal date for that surface in subsequent SDK releases. This does not prove the pinned jar stopped working; it does mean migration or an explicitly owned, time-limited exception is required for a maintained production baseline. [Google migration guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/deprecations/genai-vertexai-sdk?hl=en).

[`SPK-01`](../qa/spikes/SPK-01/README.md) remains OPEN and explicitly gates shared-environment enablement. No live R2D2/Vertex request was made in this review. Verify the approved SDK, proxy authentication, endpoint/model routing, schema forwarding, retries, timeouts, and request-body handling before enabling shared environments.

**F8 — P2: generation is JSON-hinted, not schema-constrained or token-bounded.** [`generationConfig`](../../backend/src/main/java/com/citi/put/checks/studio/compile/gateway/VertexLlmGatewayClient.java#L210) sets temperature and MIME type, but no response schema or `maxOutputTokens`. The output byte cap is enforced after receiving the response. Supply a supported response schema and generation limit once proxy support is proven, while retaining independent local validation. Explicitly classify truncation and safety/finish outcomes. JSON/schema parse failures currently end compilation rather than entering bounded repair. [Google structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output).

**F9 — P2: repair effectiveness and provenance are incomplete.** Repair sends original inputs plus diagnostics without the whole rejected candidate or explicit correction instructions. Scripted repair tests establish orchestration, not model improvement. Evaluate bounded, redacted candidate context and clear repair instructions against the same held-out tasks. Persist actual generation settings: temperature and structured-output mode exist in `GatewayProvenance` but are omitted from saved revision provenance. Record token usage, finish reason, per-stage latency, repair count, saturation, and deadline/cancellation outcomes; the current gateway audit records bytes and latency but no token usage.

**F10 — release evidence gap: no measured English-to-execution quality/performance gate was found.** Prompt inputs contain source, syntax reference, and output contract; they do not contain application DOM or a locator inventory. This supports explicit, supported instructions but leaves vague target names and application-specific locators ungrounded. Human confirmation remains necessary and should clearly disclose ambiguity. Do not promise arbitrary English translation quality from the current hand-written corpus.

Build a representative, versioned English-task evaluation set against controlled application fixtures. Verify observable outcomes with independent deterministic oracles, including negative cases where the wrong implementation must fail. Measure first-pass validity, final validity, correct actions/assertions, unsupported-intent rejection, false-success rate, repair improvement, repeatability, p50/p95 end-to-end latency, saturation under expected concurrency, and token cost. Agree release thresholds before measuring. Model selection and caching should follow those measurements. Temperature zero does not guarantee identical model responses. [Google generation parameters](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/content-generation-parameters).

## Deterministic validation sequence

Keep the following sequence and close the identified gaps:

1. Atomically capture source/configuration revisions; enforce authoring bounds and credential screening. Preserve secret references as names only.
2. Generate a bounded, schema-constrained candidate, or a non-executable unsupported/clarification result. Treat author text as untrusted data.
3. Validate JSON schema, exact source-line/index alignment, supported versions, and size limits.
4. Parse the restricted AST; reject unlisted syntax, receivers, methods, options, unsafe regexes, and undeclared/misplaced references. Produce typed operations only.
5. Validate the complete runner verdict and its provenance. Apply only bounded repairs, each through the same gates and shared deadline.
6. Present an accurate operation-derived summary and source for confirmation of the exact immutable revision/hash. Static acceptance establishes permitted capabilities, not intent correctness.
7. Before execution, recheck revision/runtime compatibility, validate again, enforce target/network policy and resolved-reference rules, then execute through the trusted adapter. Keep all LLM calls out of runtime execution.
8. For release evaluation and explicitly authorized trial runs, assert real observable outcomes on controlled targets. A browser run can perform actions, so it must not silently become a compile-time validator against production systems.

## Verification performed

| Verification | Result | What it establishes |
| --- | --- | --- |
| Backend `com.citi.put.checks.studio.compile.*` suite | 214 passed, 1 existing skipped; 32 classes | Gateway stubs, bounds, repair/lifecycle/confirmation behavior covered by existing tests |
| Selected runner validator/executor/compatibility/prelaunch suites | 279 passed | Restricted-language acceptance/refusal and execution-boundary regressions |
| Real-browser reference execution suite | 60 passed, 1 existing skipped | All 28 hand-written examples executed twice on pinned Chromium; in-image proof remains skipped |
| Five focused validator/executor probes | Reproduced results recorded in F1, F4, F6 | Semantic mismatch, assertion divergence, and skipped action can survive static acceptance |
| Three malformed validator-response probes | All accepted as aggregate success | Reproduces F3 against compiled production parser |

Existing test success does not negate the uncovered cases. The live model, enterprise gateway, production load, and concurrent-edit race were not exercised. Temporary probe programs and logs are under `/tmp/studio-inference-*` and `/tmp/StudioValidatorVerdictProbe.java`; the results above are retained here because temporary files are not durable review evidence.

Recommended implementation order: F1–F4 correctness and validator integrity; F5–F6 execution/capacity guarantees; F7–F9 supported inference configuration and observability; then F10 live evaluation and rollout evidence. Preserve the no-runtime-LLM design throughout.

The [implementation plan](studio-inference-implementation-plan.md) expands this remediation order with full and incremental compilation, dependency invalidation, unchanged-code reuse, complete artifact validation, and revision-specific execution evidence. It includes the case where a user edits one step of an otherwise passing test.
