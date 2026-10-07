# VAL-019 / VAL-007 — architect rulings

Author: @architect (Aria) · 2026-10-04 · branch `brunobuger/ui-studio` @ 13ec11d1c plus the uncommitted VAL-006 diff · read-only.
I read every file cited below. Statements marked *(inferred)* were not run or measured.
Thinking level and model choice are **not** ruled here. See "Strategy (awaiting benchmark)".

## Findings from the code (verified by reading)

- **F1. The rejection reason is thrown away.** `parseProposal` returns fixed strings: `empty model envelope`, `invalid model envelope shape or coverage`,
  `invalid model step identity or order`, `invalid generated step`, `invalid unsupported or clarification step`, `malformed model envelope`.
  `CompileResponse.reason` carries the string, but `GatewayAuditLogger.audit` has no field for it.
  `GatewayAuditLogger.diagnostic()` has **no caller**, and `CompilePipeline.settleError` persists only `errorCode`.
- **F2. The fixed strings are too coarse.** One string covers keys, version, kind, steps type, count, and an empty or >100-ID set.
  Duplicate keys, trailing tokens and bad JSON all collapse into `malformed model envelope`.
- **F3. The scrubber does not cover model output.** `GatewayErrorScrubber` redacts *request* fragments and `SecretMasker` patterns only.
  The legacy `parse()` reasons embed Jackson and schema messages, and those can quote model text.
  So free text from a parse must never reach a log. Only closed enums and integers may.
- **F4. Parse failure is never repaired, and that contradicts the frozen contract.** At `CompilePipeline` ~l.237–246 every
  `!response.isOk()` is terminal STALE. The inference contract C0 (`studio-inference-contract-v1.md` §4) says otherwise:
  the "Invalid model envelope" row says *"Repairs within shared limit, then NEEDS_REVISION"*, and l.95 says *"Malformed/schema-invalid envelopes may consume a repair"*.
  The 2026-09-16 review F8 recorded the gap ("parse failures currently end compilation rather than entering bounded repair").
  Stories 10.9 and 10.45 never closed it. 10.45 AC-8 covers validator-rejected repair only.
  In C0, an unusable finish reason (not STOP) stays terminal with "no automatic retry".
- **F5. The request deadline is not passed to the gateway.** `CompilePipeline` calls `gatewayClient.propose(prompt)`. That is the 1-argument overload,
  the same at HEAD. `GenAiLlmGatewayClient.propose(request)` then builds `new CompileBudget(requestTimeout)`.
  The executor's 240s timer cancels `claim.budget()`, a different object. *(inferred)* After expiry, an in-flight call keeps running
  up to its full `request-timeout` and holds one of the 4 gateway permits. With request-timeout at 200s, a repair started near t=200s outlives the budget by
  ~160s. This breaks C0 §5: each timeout must be `min(perCallCap, remaining)`, and the timer must cancel the active future.
- **F6. A startup-arithmetic test blocks any longer timeout.** `RepairBoundsTest.theConfiguredDeploymentSatisfiesTheSameArithmetic` asserts
  `attemptBudget > (1+repairs)·(requestTimeout+validateTimeout)`. Today that is 3·(60+10)=210 < 240.
  Any request-timeout above 70s fails it. That includes running the test with `STUDIO_GATEWAY_REQUEST_TIMEOUT=200s` exported.
  C0 §5 already orders this claim removed ("Remove the incorrect startup claim…").

## VAL-019a — rejection observability · **DO NOW** · contract class: none (internal log only)

Add a closed `ProposalRejection` enum to `GatewayResponseParser`, one value per check:
`EMPTY`, `MALFORMED_JSON`, `DUPLICATE_KEY`, `TRAILING_CONTENT`, `ENVELOPE_KEYS`, `VERSION`, `KIND_MISMATCH`,
`STEPS_NOT_ARRAY`, `STEP_COUNT`, `STEP_ID_MISMATCH`, `STATUS_UNKNOWN`, `GENERATED_KEYS`, `CODE_EMPTY_OR_TOO_LONG`, `REJECTION_KEYS`,
`REJECTION_REASON_MISMATCH`, `MESSAGE_EMPTY_OR_TOO_LONG`. Pipeline-side additions: `FINISH_REASON`, `ASSEMBLY_FAILED`, `ARTIFACT_VERSION`.
Detect duplicate keys and trailing content from the Jackson exception **type**, never its message.
- Carry `rejection` plus `rejectStepIndex` (0-based position, nullable) on `CompileResponse`.
  The existing `reason` string stays for tests and is not logged.
- Audit line: append `rejectReason=<ENUM|null> rejectStepIndex=<int|null>`. Nothing else: no text, no JSON pointer content, no code length.
- Pipeline-side rejections (assembler IAE, version gate) are not gateway calls. Log one line at WARN:
  `studio.compile.attempt_rejected compileRequestId= attempt= reason=<ENUM>`.
- Delete the dead `GatewayAuditLogger.diagnostic()`, or keep it unreachable from parse paths. Per F3 it is a leak vector.
- **compileDiagnostics: no.** OpenAPI makes it mutually exclusive with `compileError` and non-null only on NEEDS_REVISION.
  A STALE parse failure cannot carry it. Exposing the reason to clients needs a field like `CompileError.detail`.
  ADR-002 §16 calls that **Class C** (every edit beyond adding an emitted code). **DEFER.** The FE does not need it to act, because retry is the remedy either way.
- Files: `GatewayResponseParser`, `CompileResponse`, `GenAiLlmGatewayClient.interpret`, `GatewayAuditLogger`, `CompilePipeline`.
- Tests: `GatewayResponseParserTest` gets one case per enum value (exact enum, not string). `GatewayAuditTest` / `GenAiGatewayAuditTest` add the new
  fields and a negative control: a model output containing a sentinel such as `AKIA…`/a marker string never appears in the audit or WARN bytes.
  `UsageCaptureTest` field-order pins, if any, are updated.
- Risks: low. Log consumers that split on fields see two extra keys.

## VAL-019b — recovery · **DO NOW (repair) + USER DECISION D1 (exhaustion state)** · class: behavioural, no OpenAPI change

Recommendation: an envelope `PARSE_FAILURE` (parser enum only, not `FINISH_REASON`/`TOO_LARGE`/assembler/version) **consumes one repair**
from the existing shared bound (`repair.max-attempts=2`, 1+2 proposals, the 240s deadline, aggregate 12 calls). This is what C0 §4 already says.
The evidence supports it: identical input succeeded on the next call, twice, so the failure was model variance and not the author's source.
- **Feedback to the repair prompt:** a fixed correction instruction plus the rejection enum and step index only, for example
  `"previous output rejected: GENERATED_KEYS at step 2; return exactly the envelope shape"`.
  **Never the raw output.** C0 permits "bounded, redacted rejected content", but carrying it means new plumbing of raw model text through `CompileResponse`.
  F3 shows the scrubber cannot vouch for model text, and on structured output the enum names the defect precisely.
  If the benchmark shows code-only repair rarely succeeds, revisit by passing the redacted text through `RepairPromptAssembler.boundRejectedProposal`.
  That function is the existing 64 KiB redaction path.
- `RepairPromptAssembler.INSTRUCTIONS` says "the validator rejected". It needs a parse-failure variant. That is prompt text,
  so per the prompt-vs-syntax rule it bumps `PROMPT_VERSION` and changes the fingerprint only. Confirmed revisions are not invalidated.
- **D1 (user):** what does an exhausted parse-failure loop end as?
  (a) C0 literal: NEEDS_REVISION with artifact diagnostic `INVALID_MODEL_RESPONSE` and `validatorSchemaVersion: not-run`.
  (b) **Recommended:** STALE `GATEWAY_PARSE_FAILURE`, as today, plus a C0 §4 row amendment.
  Reason for (b): the NEEDS_REVISION narrative tells authors *"asking for the same translation again without editing will reach the same place"*,
  and the observed evidence shows that is false here. (b) also needs no FE or diagnostics change.
- Files: `CompilePipeline` (repair branch; `lastRejectedProposal=null`, `lastDiagnostics=` reason doc), `RepairPromptAssembler`, the C0 doc amendment.
- Tests that must flip or extend: `RepairLoopTest` (new: parse failure on attempt 1, then OK on attempt 2, publishes a candidate; parse ×3 gives the D1 outcome).
  `RepairBoundsTest.everyGatewayFailureModeOnARepair…` currently treats `GATEWAY_PARSE_FAILURE` as terminal STALE and must split it out.
  `LiveProposalPipelineTest.whitespaceOnlyCode…` asserts no-repair STALE. `RepairRedactionTest` must assert that no model text reaches the repair prompt.
  Existing tests the change must keep green: `aVersionTwoArtifactFromARepair…` (version gate stays terminal).
- Risks: up to 3× tokens and latency on a bad call. A 119s call followed by a 119s repair hits COMPILE_BUDGET_EXCEEDED instead of PARSE_FAILURE (acceptable, still STALE).
  Prerequisite: F5. Without it a repair can overrun the deadline.

## VAL-007 — budgets and long-compile UX · **DO NOW (F5, F6, FE gaps G3/G4) · DEFER defaults until benchmark**

Coherence check against observed single-call latency of 3s–119s:
- **60s request-timeout:** incoherent for MEDIUM on non-trivial steps. All three Google calls (67/77/119s) exceed it.
- **240s budget with 1+2 repairs:** coherent as a *ceiling*. C0 §5 says not every repair must fit, and a long first call leaves room for at most one repair.
- **The arithmetic rule (F6):** this is what is wrong, not the budget.
- **Interim defaults, if the benchmark is late:** request-timeout **150s**; attempt-budget **240s**, unchanged, so the abandonment threshold (300s) and the FE pins
  (`compilePollBounds.test.ts`) stay unchanged; repair max **2**, unchanged because it is an architecture cap.
  Rejected alternative: budget 300s with threshold 360s. It costs FE pin changes and a 6-minute worst wait, for one extra repair that will rarely help.
- **DO NOW, backend:**
  (1) F5: call `propose(prompt, settlement.budget())` and verify the executor timer cancels the live SDK call and releases the permit.
  Use a wire test with a stalled stub and assert capacity recovers.
  (2) F6: replace the arithmetic with `requestTimeout + validateTimeout < attemptBudget` (one full attempt must fit) and keep `threshold > budget`.
  Update both `RepairBoundsTest` methods. Class: internal config validation, no contract.
- **FE gaps (verified in `useRunGate.ts`, `RunControl.tsx`, `compilePollBounds.ts`, `compileStateNarratives.ts`):**
  - **G1 (DO NOW).** Run shows a static "Preparing your test…" spinner for up to 330s, with no elapsed time and no expectation-setting.
    Fix: add a client-side elapsed counter and a "translation can take up to a few minutes" hint after ~15s. The Code tab's "Translating your steps" card needs the same.
  - **G2 (DEFER).** There is no way to cancel an in-flight compile, and no cancel API exists. That is Class C.
  - **G3 (DO NOW).** `awaitCompileSettled` polls at a flat 600ms for up to 330s, which is ≤550 GETs per compile per tab.
    `compilePollSchedule` (2s, ×1.6 backoff, 30s cap) already exists for the Code tab. Reuse it. The concern is BRD §6 capacity.
  - **G4 (DO NOW).** `COMPILE_WAIT_BUDGET_MS = 330_000`. Its comment says "attempt budget plus a sweep interval" (=255s), which matches neither 330s nor the
    window (315s), and no test pins it. Derive it from `COMPILE_WATCH_WINDOW_MS`.
  - **G5 (DEFER).** There is no attempt or repair progress signal. SSE is execution-only by design (§5.5). G1's elapsed timer is sufficient for v1.
- Files: `CompilePipeline`, `StudioCompileProperties.validate`, `RepairBoundsTest`, `application.yml` (after the benchmark), `useRunGate.ts`, `RunControl.tsx`, `CodeTab.tsx`.
- Tests: a budget-propagation wire test (new), `CompileBudgetExpiryTest`/`RepairBudgetExpiryTest` extension, and `pageRunGate.test.tsx` (poll schedule, elapsed text).
  Run them with `pnpm exec vitest run …`.
- Risks: a 150s timeout raises the zombie-permit exposure until F5 lands, so **F5 lands first**.
  Raising `max-concurrency` is not a substitute.

## Strategy (awaiting benchmark)

Placeholder. Thinking level, model and prompt/schema variant are decided by @qa's benchmark. Evidence that decides it, per strategy:
1. At least 10 runs each on example.com (2–4 steps), Google (3 steps), and one realistic 10–20-step flow.
   Report p50/p95/max latency, `thoughtsTokens`, and output tokens.
2. Outcome distribution: OK / PARSE_FAILURE / TIMEOUT. **Parse failures are broken down by VAL-019a reason enum.**
   Land 019a first or have the harness classify privately.
   If `GENERATED_KEYS`/`REJECTION_KEYS` dominate, the fix is a tighter provider schema (per-status variants), not thinking.
   The current provider schema cannot forbid `message` on GENERATED.
3. Quality: `/v1/validate` ok-rate and the confirmed-correct rate on the same steps. Latency savings that lower validity are not a win.
4. Decision rule: choose the cheapest strategy with PARSE_FAILURE ≤ 2% and a validate ok-rate no worse than MEDIUM.
   Then set `request-timeout = ceil(p99 × 1.3)`, capped at `attemptBudget − validateTimeout − 10s`. If p95 ≤ 30s, keep 60s.
   A thinking or model change alters `compilationSettings()` and the fingerprint. Plan it as a deliberate re-confirmation event.

## User decisions needed

- **D1.** Exhausted parse-failure repair: STALE (recommended, needs a C0 amendment) or NEEDS_REVISION `INVALID_MODEL_RESPONSE` (C0 literal).
- **D2.** Repair feedback: reason code only (recommended) or also the redacted rejected output.
- **D3.** Interim `request-timeout=150s` before the benchmark, or keep 60s and accept TIMEOUT on non-trivial steps.
