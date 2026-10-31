# ADR-SC-008 — Learned steps are generated Playwright code, frozen and replayed model-free

**Status: Accepted** (2026-10-29).

| Field | Value |
|---|---|
| Status | **Accepted, 2026-10-29.** User sign-off: "Go ahead with the refined plan" (2026-10-29). The direction, the lifecycle, the gate, "security boundary as is", the descoping and X-1 to X-7 are user decisions. The rulings R-1 to R-4 and OQ-1/OQ-2 are the architect's, accepted with this ADR |
| Date | 2026-10-29 |
| Scope | Guided learning, publication and proof, and replay: `studio-runner/src/{run,guided,executor,validator}`; backend `studio.guided.{translation,publication,session}`; `contracts/v3`; `resources/studio/guided-output-contract.md` |
| Requirements | REQ v2: `docs/specs/studio-generated-step-code/requirements.md` |
| Supersedes in part | ADR-001 line 19 ("generated source is never evaluated"); ADR-SC-004 Decision ¶1–2; ADR-SC-005 D-A "publishes" and the 2026-10-25 note's "never exists without its proof", and D-C for this release; ADR-SC-007 D2, D3, D4, D7 item 2, the Verification line on D4 and the release-gate state string; `studio-execution.md` §4.5. Detail in D1 |
| Preserves | Perception and sanitizer (ADR-SC-007 D1, D5 kept modules, D6, WI-2.1, pseudo-element policy); private inventory; Vault secrets and the trusted password fill; domain policy; Chromium sandbox; closed codes; publication; proof replay and its video (ADR-SC-005 note 2026-10-25); D-D partial re-learn; per-step results in `ui_test_executions`; contracts v3 changed in place (ADR-SC-007 D8); model-free replay |
| Decision source | `PLAN-v3` and `DECISIONS-delta` X-1 to X-7 (Lean run SC008); `dev-feasibility` §2–4; `vertex-research`; `registry-spec` |

Labels: [V] means verified by reading the cited file:line on branch `brunobuger/ui-studio` on 2026-10-29. [I] means inferred, not measured.

## Context

- **Direction.** The user reversed the typed-operation registry: "the gemini provide us magically the right translation… [no] hardcoded operations list or command … even for control". Learning generates Playwright code per step, and that code is frozen. Replay runs it with no model.
- **Today.** The model "proposes operations, never code" (`guided-output-contract.md:1` [V]), names a ref, and the runner synthesizes a locator from a closed grammar (ADR-SC-007 D2, D4). Ten operation kinds are hard-wired in the executor switch (`targetAction.ts:347-478` [V]), about 20 Java files and SQL CHECKs.
- **Where code runs today.** Replay runs in a forked child with an allow-listed environment. Learning runs the browser in the runner server process (`main.ts:122` [V]). ADR-001:19 forbids evaluating generated source.
- **Learning time.** Learning dispatch has a 15 s transport window (`HttpRunnerDispatchClient.java:900-901` [V]), an 8 s learn action budget and a 12 s dispatch budget (`actionBudget.ts:10-15` [V]). The user keeps these for this release.

## Decision (summary)

1. **Generated code.** Per step, Gemini writes one JavaScript async statement body (`code`) against a small step API. The code is frozen by hash. There is no separate verify block.
2. **One execution module.** Every mode runs the code through `run/stepCode.ts`, one `AsyncFunction` construction. Learning runs it in the runner server process (accepted risk). Replay, proof and scheduled runs run it in the existing killable child. Admission before running is a **syntax check plus hash checks only**.
3. **Existing boundary.** It binds at a thin **step API binding** around the Playwright objects the code receives: domain policy, secrets as opaque handles, the step fence, closed codes, and a denial of the calls that would break the run's recording or lifecycle.
4. **Targets.** The model writes ordinary Playwright locators. Playwright strictness (exactly one element) is checked before the effect. No same-element check and no identity witness.
5. **Validation is execution only (X-1).** A step is learned when its frozen code runs without error in the model-free proof replay. No assertion is required. Promotion to confirmed is atomic.
6. **False-pass controls (X-7).** N1 to N3 stay hard zeros, protected by prompt rules only.
7. **Inference.** PLAN keeps S-min (one open `step` kind). STEP_CODE runs per step with a reference generated from the pinned Playwright 1.63.0 types, curated examples and up to 3 retrieved proof-passed examples. Repair receives closed diagnostics.

## D1 — What changes and what stays

| Clause | Ruling |
|---|---|
| ADR-001:19: "Generated source is never evaluated: no eval, Function, async IIFEs or Node VM as a boundary; browser work runs in a killable child…" | **Amended.** Frozen step source is evaluated by one `AsyncFunction` (D3.1). The killable child still runs every replay. Learning stays in the server process for this release (Deferred item 6) |
| ADR-SC-004 ¶1: "The model proposes typed operations … it cannot … supply code" | **Superseded.** The model supplies step code. Still true: it cannot grant authority, resolve credentials or change the checklist |
| ADR-SC-004 ¶2: one unique current node bound to the proposed locator; admission per action ordinal | **Superseded.** Playwright strictness replaces node binding (D4). One admission per step execution, consumed at the step's first effectful call. Dispatch is at-most-once **per step** (D3.3) |
| ADR-SC-005 D-A "publishes the exact exercised plan"; note of 2026-10-25, "a revision never exists without its proof or a recorded refusal" | **Superseded by D5.** Finalize stores a **recorded** (candidate) revision, and the proof promotes it. Still true: the proof is a replay of the final artifact, with one proof video |
| ADR-SC-005 D-C pilot benchmark | **Not a gate for this release** (user decision). It stays a **pre-pilot** gate |
| ADR-SC-005 D-D | **Kept.** The per-step snapshot hash is `stepHash` (D2) |
| ADR-SC-007 D1 perception; D5 kept modules; D6; WI-2.1; pseudo-element policy | **Kept.** Frames: D7 |
| ADR-SC-007 D2: "the model never writes a selector, locator or role expression" | **Superseded by D4** |
| ADR-SC-007 D3 gates: action gate, intent gate, operation-vs-role, G1, G2, `GuidedActionGuard` | **Deleted from admission.** Each reads a ref-bound target or a typed operation, and generated code supplies neither. The cost is Deferred item 5. Playwright's actionability checks and the proof take over |
| ADR-SC-007 D4: closed grammar, tiers, public-API builder, `Guard` locator, identity check | **Superseded and deleted** |
| ADR-SC-007 D7 | Item 1 (intent gate) and item 2 (positional tiers) are obsolete. Item 4 (the pinned private engine for perception) is kept |
| ADR-SC-007 D8: v3 changed in place, no v4 | **Stands.** Within v3, the `operation` union becomes one open `step` kind that carries the step-code record (S-min). Old artifacts fail validation; dev databases are recreated |
| ADR-SC-007 Verification: "bans `evaluate` on the replay path" | **Superseded.** Generated code may call the `evaluate` family. Exception: on a secret-bearing document (D3.2) |
| ADR-SC-007 release gate | Restated by PLAN-v3: 14 positives; N1–N3 never publish or confirm and dispatch nothing on a wrong element; leak scan; proof plus two model-free replays; at most 120 s per learning step. The state string is "Confirmed", replacing "Completed — learned from this run". N1's closed code is no longer pinned to `TARGET_MISMATCH` |

## D2 — The step-code artifact

### Form

- Per authored step, one JavaScript (ES2023) async statement body, `code`: actions, captures and, where the step states an outcome, `expect` calls.
- JavaScript, not TypeScript: type-checking is not part of this release, so TypeScript would add a transpile step for nothing.
- **Six injected names**, and only these:
  - `page`: the active page, wrapped by the binding;
  - `context`: the browser context, wrapped;
  - `expect`: Playwright's `expect` from the pinned `playwright/test` entry [V]. Whether it works outside the test runner is spike S-1; it is needed because X-7 makes the model write `expect`;
  - `inputs`: nonsecret authored and saved values;
  - `secrets`: opaque handles keyed by `<secret ID>`;
  - `vars`: run-local captures and adopted page handles.

### Values

- Authored nonsecret literals may appear in the source.
- Bound at run time and never frozen into the source: `<var>` values, text mixed with variables, and captures. They are written as `inputs.X`, as template literals, or as `vars.<needId>`.
- `secrets.ID` is a frozen handle with no value property. `toString`, `toJSON`, `valueOf` and `Symbol.toPrimitive` throw a closed `POLICY_DENIED`. The value is substituted only inside the binding (D3.2) and never reaches the model, the source, examples, traces or logs. Traces render the handle as `<secret ID>`.
- Rejected: a token substituted inside string arguments. It loses the trusted password-control checks and puts the token where the code can see it.

### Freezing, hashing, storage

- Per step the record is `{stepId, code, captures[], uses[], sourceHash, referenceHash, guardVersion}`. `sourceHash` is SHA-256 over the canonical JSON of `code`. `stepHash` covers the whole record and is D-D's per-step snapshot hash.
- **2026-10-30, amended by SC008-E5 (contract v3 frozen).** The frozen record is `{kind: "step", code, captures[], uses[], sourceHash}` where `captures` are bindingIds, `uses` is `[{kind: input|secret|binding, id}]` (inputId, secret ID, bindingId; at most 16) and `sourceHash = hash(code)`. `stepId` is dropped (the coordinate carries it), `verify` is dropped (X-1), `guardVersion` is dropped (runtime and profile compatibility already refuse a changed runner), and `referenceHash` moves to the revision's `LearningProvenance` with `stepCodeContractHash`. The contract still admits several step records per authored step (`Step.operations` maxItems 8, `coordinate.ordinal` 0..7): that bound is a leftover of the typed-operation pipeline, kept because collapsing it would restructure the parallel arrays of every sealed fixture; learning emits ordinal 0 only (the checker enforces ordinals below 8 and consecutive, and a proposal with ordinal 8 is refused). The ledger outcome is derived from the receipt: no closed code is SUCCEEDED/OK; ASSERTION_FAILED is FAILED/ASSERTION_FAILED; TARGET_DRIFT is FAILED/TARGET_CHANGED; POLICY_REFUSED, READ_REFUSED, PASSWORD_CONTROL_READ_REFUSED, REFERENCE_REFUSED, REFERENCE_MISMATCH, LOGIN_REQUIRED, INVALID_CONTRACT, INTERNAL_ERROR, PROFILE_MISMATCH and AUTHORIZATION_EXPIRED are FAILED/POLICY_DENIED; TIMEOUT is FAILED/TIMEOUT; CANCELLED is FAILED/CANCELLED; OUTCOME_UNKNOWN is UNKNOWN_OUTCOME/ACK_LOST (pinned by the checker, `RECEIPT_LEDGER`). `stepHash = hash(operation record)` appears in the per-step receipt (`step-receipt.schema.json`: `closedCode`, `stepHash`, `fenceCrossed`, `effects[{method, completed}]` (first 64 only, `effectsTruncated`), `offscreen`), which the learning outcome carries as well as the replay `step-finished` event. Code addresses values as `vars['<bindingId>']`, `inputs['<inputId>']` and `secrets['<secretId>']`.
- Every execution recomputes `sourceHash` before construction. A mismatch is a closed refusal with zero effects.
- The engine pin stays: Playwright 1.63.0 plus the `coreBundle` sha.
- The record is stored in the learned-plan and revision rows where operations are stored today. `code` is at most 16 KiB per step [I]; the artifact stays within `OBSERVED_LIMITS.artifact`, 1 MiB (`observedReferencePolicy.ts:5` [V]).
- The SQL capability functions and the `argument_slot` CHECK list the ten operation kinds (V14, V15, V26, V28). The next forward migration replaces them with the one `step` kind.

## D3 — Execution

### D3.1 The evaluation primitive (R-1)

- **The module.** `run/stepCode.ts`, and only that module, builds `AsyncFunction(...injectedNames, ...shadowedGlobals, '"use strict";' + body)`. `shadowedGlobals` are parameters bound to `undefined`: `process`, `globalThis`, `require`, `fetch`, `setTimeout`. This is hygiene against accidental use, not a control; ordinary JavaScript still reaches Node, for example through `import()` [I].
- **Callers.** The guided runtime (learning, server process) and `child.ts` (every replay).
- **Admission.** `ts.createSourceFile` parse diagnostics only (syntax). `typescript` 5.9.3 is already a production dependency [V]. Diagnostics go back to the model with line and column. Admission and the hash check run again before every replay.
- **Why not `node:vm`.** Regex literals made in another VM context use that context's `RegExp`, and Playwright's bundle checks `obj instanceof RegExp` (`coreBundle.js:2940-2941` [V], 10 sites), so regex locators would break. A VM context is not a boundary either.

**What replaces `no-dynamic-evaluation.test.ts`:**
1. The seven `dist/` patterns stay forbidden in every file except `dist/run/stepCode.js`. An `AsyncFunction` pattern is added, and a second assertion checks that exactly that one file contains the construct.
2. An import-boundary test: `run/stepCode.ts` is imported only by the guided step runner and by `child.ts`.
3. A tamper test: changing one byte of the stored source is refused before construction, with zero effects.
4. Lint: a single-file override in `eslint.boundary-rules.js` and `test/lint-boundary.test.ts`, with a fixture proving its scope.

### D3.2 Step API binding: where the existing boundary binds

A runner-owned `Proxy` forwards each call to the real object, with `this` bound to the target. It wraps every Playwright object the code can reach, including returned objects such as `locator.page()`, `frame.page()`, popups and handles. It isolates nothing; it is where the existing policy is applied, the same way in every mode.

| Existing control | Where it binds |
|---|---|
| Domain policy | Explicit destinations (`goto`, `Frame.goto`, adopted popups) are checked with `domainAllowed` and the no-credentials rule (as `browser.ts:215-218` [V]) before dispatch. `awaitWhitelistedMainFrame` (`browser.ts:97` [V]) runs after the block. With allow-all ON (X-3) it restricts nothing |
| Secrets | A `secrets` handle is substituted only as the value of `Locator.fill` whose single element is the page's password control. The write goes through the **existing** trusted path: `preparePassword`/`fillPassword` with the origin and form-action checks (`passwordControl.ts` [V]), plus `SecretUseEvidence` and `withhold`. Any other use is `POLICY_DENIED` before the effect. After a secret write the document stays secret-bearing until the main frame navigates. On it, the `evaluate` family, `addScriptTag` and `waitForFunction` are refused (`POLICY_DENIED`), and reading a password control's value is refused (`PASSWORD_CONTROL_READ_REFUSED`). The post-fill check that no password input holds the authored literal (`targetAction.ts:276` [V]) applies to every nonsecret fill |
| Sanitizer | Nothing the code produces reaches the model or the logs raw. Captures enter the private inventory (`withhold`, `commitRead`). Playwright error text becomes a closed code (`closedError.ts`). Repair input is the closed code, the line, the match count, and matcher "received" text only after the outline sanitizer, at most 256 characters |
| Chromium sandbox | Unchanged (`browser.ts:420` [V]). Code passed to the `evaluate` family runs inside it |
| Closed codes | `ASSERTION_FAILED`; `TARGET_DRIFT` (before the fence: no match or a strictness violation); `TIMEOUT`; `OUTCOME_UNKNOWN` (after the fence); `POLICY_DENIED`; `READ_REFUSED`; `PASSWORD_CONTROL_READ_REFUSED`; `CONTEXT_LOST`; `ENGINE_PIN_MISMATCH`. Learning refusals are `INVALID_CONTRACT` with internal diagnostics `Gate` value `SYNTAX`. No new public code |
| Run integrity | Denied at the call: `Page.video`, `Page.close`, `BrowserContext.close`, `BrowserContext.browser`, `BrowserContext.newPage`, `BrowserContext.newCDPSession`, `BrowserContext.tracing`. These would break the recording, the slot or the single-video rule. This is control of the run, not a list of operations |
| Authority | `control.check()` runs before every forwarded call. After a deadline or a cancel the binding is revoked, so code still running cannot touch the page again (`ObservedInvocationControl`, `observedReplay.ts:249-320` [V]) |

### D3.3 Effects, fence and retries (R-4)

- **Effect classes** are generated from the pinned types with a reviewed overlay, starting from `plan/registry/classified.json`. Unknown counts as effectful. The classes never refuse a call; they decide where the fence goes and whether a failure may be retried.
- **Resolution before the effect.** For an effectful call on a `Locator`, the binding first waits for the locator to resolve to exactly one attached element within the call's timeout (Playwright strictness made explicit). Zero or several matches give `TARGET_DRIFT` with no effect. This keeps the common case, a wrong locator guess, on the repairable side of the fence.
- **Fence.** The step's first effectful call consumes the step admission (`beginInvocation`). After it, any failure is `OUTCOME_UNKNOWN`, except a failing `expect`, which is `ASSERTION_FAILED`.
- **Retries never repeat an effect.** Waiting inside a call is Playwright's own auto-wait. The code is never re-run in the same browser. `UNKNOWN_OUTCOME`, cancellation, lost authority and a policy or privacy refusal are terminal.
- **Repair during learning** (the existing 3-attempt loop, inside the 120 s step clock): syntax refusals and failures before the fence are repaired in place with a fresh observation. A failure after the fence ends learning at that step with its closed code, and Studio offers "Re-learn from step N" (D-D).
- **Ledger.** At-most-once dispatch per step execution, not exactly-once effects.

### D3.4 Time and execution path

- **Time.** Learning runs step code within the existing 12 s `DISPATCH_WINDOW_MS`, inside the unchanged 15 s transport. Replay runs within the replay profile and the step timeout, with the 30 s navigation allowance. Before each step the binding sets `setDefaultTimeout`, `setDefaultNavigationTimeout` and the expect timeout from that mode's remaining budget. An explicit `timeout` in the code is clamped to the remaining time, and `0` becomes the remainder. The two profiles in `actionBudget.ts` stay.
- **Execution path.** Learning, the retained prefix, proof, manual runs and scheduled runs all call `runStep(frozenStep, binding)`: check hash and syntax; construct the function; run the code; check that the main frame is on an allowed domain; commit captures; write the receipt.
- C2 therefore holds for the code and the executor. It does not hold for process, environment or timing (Deferred items 1, 2, 3 and 6).
- **Residual risk (stated, not re-argued).** Generated code runs with the full Node privileges of its process, guarded only by a syntax check. During learning that is the runner server. A page that steers the model, or a faulty generation, can act anywhere the runner can: TLS material and service identity, other sessions, resolved secrets and the pod network.

## D4 — Grounding (OQ-1, OQ-2)

- The model writes Playwright locators directly from the sanitized outline. The binding checks before each effect that the locator resolves to exactly one element (D3.3). The proof decides whether the step ran.
- Ref-based synthesis (ADR-SC-007 D4) is rejected: the user asked to drop the closed grammar, and it cannot express targets that appear only after an earlier action in the same step, chained or row targets, or frames.
- Same-element verification, a frozen role/name witness, and the intent and destructive-verb gates are deferred (item 5). OQ-1 and OQ-2 are answered: every target gate leaves admission.
- `CLARIFICATION` with ref choices stays. The chosen ref's facts go back to the model, which writes the code again.

## D5 — Validation, the learned lifecycle and the false-pass controls

### Validation is execution only (X-1)

- A step is **learned** when its frozen code runs without error in the model-free proof replay of its revision. Playwright's own auto-wait and actionability errors are the check. No assertion is counted or required, including for steps that state an outcome. A failing `expect` fails the step (`ASSERTION_FAILED`).
- Consequence, named: a step without an `expect` can pass on a wrong-but-unique target or with no visible effect. N1 to N3 are the controls (below).
- FR-16 (a text check uses the complete authored literal) is a prompt rule (D6), not a runtime check.
- Captures: `vars.<needId>` must be a non-empty string of at most 4,096 B and must have a planned consumer (`READ_WITHOUT_CONSUMER` stays, through `uses`).

### Proof

- `AFTER_LEARN` runs in a fresh child: frozen steps 1…n, no model, no retrieval.
- Each step writes a receipt to `ui_test_executions` (emitted at `observedReplay.ts:426` [V]): `{status PASSED|FAILED|NOT_RUN, closedCode, stepHash, revisionId, proofExecutionId}`. Promotion keys only on the per-step PASSED from the proof. The proof video comes from this run.

### Lifecycle

1. **Recorded.** Finalize stores the candidate revision; `confirmed_revision_id` does not change.
2. **Learned.** A step has a PASSED receipt from that revision's proof.
3. **Confirmed.** Every step is learned in one proof of the **current** candidate. Promotion is one transaction with a compare-and-set on the revision id. A duplicate callback counts once. A pending, refused, cancelled, timed-out or failed proof, or missing evidence, never promotes.

While a revision is not confirmed:
- Schedules stay on the previous confirmed revision until promotion.
- A manual Run of a recorded revision is a labelled diagnostic, "Recorded, not verified (step N)". It never promotes.
- "Verify again" re-runs the proof of the same candidate with no model calls; it is offered after a refused, cancelled or timed-out proof, not after a FAILED one (a failure is evidence, and repeating it repeats side effects).

Re-learn and edits:
- **Re-learn after a failed proof at step N.** The base is the **candidate**, because steps 1…N-1 hold PASSED receipts from that proof. `IncrementalChangeService` keys on the confirmed pointer today [I] and must change.
- **Edits.** Editing step k invalidates the receipts of steps k…n (D-D).

**Named limit L-1.** The proof repeats side effects; there is no state reset.

### False-pass controls N1 to N3 (X-7)

N1 (wrong option), N2 (wrong expectation) and N3 (absent target) stay release-blocking hard zeros. They are protected through **prompt rules only** (D6). Validation stays execution-only, with no tripwire and no assertion counting. If the model does not comply, the gate fix loop runs further rounds of prompt tuning. N3's "no click dispatched" rests on the model.

## D6 — Inference on Vertex (`gemini-3.8-flash`, thinking LOW, no temperature)

### Stages

- **PLAN** runs once per learning session, or once per suffix k…n. S-min: obligation kinds collapse to one open `step` kind, with `uses` for captures. Each step also gets `sections[≤4]`, the reference sections to load. Section ids are strings validated by the server, not an enum; a bad pick costs only a hint, because the reference is not an allow-list.
- **STEP_CODE** runs once per step and attempt.
- **VERIFY_STEP** is deleted (`GuidedTranslationService.java:2805` [V]). It was a model judgement, not model-free evidence.
- **Re-validation** (FR-15, D-10): two stages against one stage with the full reference, on the D1 corpus with gate steps held out, before the counted run. Keep two stages if first-attempt success is within 5 points of single-stage and p95 learn time is no worse.

### Prompt rules (X-7, owned by E18)

1. **Outcome steps.** For any step whose text states an outcome ("check that", "should show", an expected value), the model writes an `expect` that asserts it. Text checks use the complete authored literal (FR-16), never a shortened span. A failing `expect` fails the step.
2. **Ambiguous target.** When the target is ambiguous or absent in the observation, the model returns a clarification instead of code. It does not guess a locator.
3. **Plain actions.** A plain click, fill or hover needs no `expect`.

### Output and reference

- **Output schema**, `anyOf` on `kind`: `{kind:"code", code}` or `{kind:"clarification", reason, choices:[{ref}]}`. It stays on `responseJsonSchema` (SDK 1.71.0 has no `responseFormat`; the deprecation is tracked in `vertex-research` §1.1).
- **Reference generation.** A deterministic generator turns the pinned `.d.ts` files and JSDoc (`types.d.ts` 26,632 lines, `test.d.ts` 11,074 lines [V]) into the reference, as `extract.cjs` already does (`registry-spec` §2.1). The run-integrity members of D3.2 are left out. Parts: an index (one line per member, about 4.0–4.8k tokens), core sections (locators, actions, web-first assertions), and extended sections chosen by PLAN.
- **Reproducibility.** The same pin always yields the same bytes. `referenceHash` goes into the run's environment record.
- **Prompt size.** The prompt order stays as it is today. Every call must fit 98,304 bytes, with no truncation (NFR-7).

### Examples

- **Curated:** about 10 snippets, each run by a fixture test through `runStep`.
- **Retrieved:** up to 3 per call, only from steps with a PASSED proof receipt (inserting one requires its proof execution id), same CSI only, authored literals replaced by placeholders, sanitized when stored and again when the prompt is assembled. Retrieval is lexical and deterministic with a stable tie-break and never runs during replay. An example becomes ineligible when its revision is superseded or its proof later fails. Retrieval is dropped if the offline evaluation shows no gain.
- **Dropped 2026-10-30:** example retrieval was dropped by user decision after the E18 eval (R-T within noise, -0.4 pp); the example store and recorder stay with no reader.
- **Gate runs** use a frozen store snapshot that excludes the 14 positives, N1–N3 and the smoke steps, matched by normalized step text plus origin hash. The environment check refuses to start if any is present, and the snapshot hash is recorded.

### Repair

Repair input is the closed code, the stage, and the line and column in the model's own code, plus the match count and up to 256 characters of sanitized "received" text. Parse diagnostics on the model's own code pass through; Playwright messages never do. The 3-attempt loop, the 120 s step clock and the clarification rules are unchanged.

## D7 — Removed in the same increment, and rulings

### Removed (no flag, no compatibility layer)

**Workarounds** (user decision): `focusedSuccessor` and the End press in `fillThenKey` (`targetAction.ts:251-274`); `replacedFocusedField` (`playwrightEngine.ts:616`, `observationFlow.ts:393,505`); `PAGE_STALE_RETRIES` (`observedReplayAdapter.ts:111,163`); `CERTIFICATE_ATTEMPTS` (`playwrightEngine.ts:440`); `FILL_FIRST_ATTEMPT_MS` and `KEY_FIRST_ATTEMPT_MS`. The replaced-field fixtures stay unmodified and must now pass or fail with a closed code.

**Runner code made obsolete:** the per-kind `execute` switch, `performOnTarget` and `performWithNavigation`; `locatorSynth.ts` and `targetOptions.ts` (G1); `validator/pressInheritance.ts` and `operationPreimage.ts`; `hasTableContext`; the prepare/WAIT polling in `observedReplayAdapter.ts`; `ACQUISITION_LIMITS` and `ReplayAcquisitionBudget` (replay no longer observes the page, except the login probe); the per-operation rules `slot`, `arg` and `validateRecordedTarget` in `observedReplay.ts`.

**Backend code made obsolete:** the action gates in `GuidedProposalValidator`; `GuidedGates`; `GuidedActionGuard`; `GuidedPressInheritance`; `GuidedStepVerifier` and VERIFY_STEP; the operation lowering in `GuidedPlanBuilder` and `ObservedArtifactLowerer` (`operationHash` becomes `stepHash`); the SQL kind lists.

- **2026-10-30, amended by SC008-E5.** `operationHash` keeps its name and meaning (the hash of `{coordinate, origin, operation}`; there is no `target` key any more): the ledger, `commands.advance` and the closed-key lists of V21 and V29 to V32 keep it. `stepHash` is a separate value, `hash(operation record)`, and is not a rename. Also deleted by E5: the choice witness chain, the guard source authority, `PreAdmissionDrift` and the prepare WAIT and DRIFT results, `ledger.assertionPassed`, `maxStatementsPerStep`, the dead review projection of the OpenAPI, and the observation fields `readRuleId`, `directTextAssertion` and `readScope`.

**Kept:** `perceive.ts`, `perceptionInPage.ts`, `privateInventory.ts`; the perception part of `playwrightEngine.ts`; `passwordControl.ts`, `secretUse.ts`, `closedError.ts`, `ObservedInvocationControl`, `loginRequired.ts`; the recorder; the `actionBudget.ts` profiles.

### Rulings

1. **Pseudo-element certificates (R-2, FR-19).** Certificates are used only by perception. Each is bound to `(documentId, frameId, stepRun)`; running any code invalidates the certificates of every page it touched, and the next observation recertifies within the remaining time. The bounded pseudo-element privacy check runs on every fresh capture and still needs its independent security confirmation.
2. **Frames.** Code may use `frameLocator`, `contentFrame()` and `Frame`, and the binding wraps them. Perception stays on the main frame; an iframe renders as `- iframe "<title>" [ref]` instead of `unsupported` (`perceive.ts:332-334` [V]). Certificates never cross a frame boundary. Showing frame content to the model is a follow-up that needs compliance.
3. **Popups.** A page is adopted only when the step code awaits it within the step (`page.waitForEvent('popup')` or `context.waitForEvent('page')`), at most 4 pages per run [I]. Any other new page is closed on sight (`browser.ts:226-233` [V]). An adopted page's main frame is checked against the domain policy, and later steps reach it through `vars`.
4. **One video per run.** The run's single video stays the recording of the opener page (`browser.ts:286` [V]). Popup recordings are deleted when the run closes. Receipts of steps that acted in a popup carry `offscreen: true`, and the evidence says "acted in a separate window, not shown in the video". Recordings are never merged.
5. **Scope of support.** Popups, multi-page flows and iframes are supported at fixture tier only and not verified on real sites (L-4).

## Deferred / accepted risks

Descoped by the user on 2026-10-29. Each item states its consequence and is not designed here. Items 1 to 9 are the descoped efforts; 10 to 13 are decisions X-1 to X-4.

| # | Deferred or accepted | Consequence |
|---|---|---|
| 1 | E9: one shared time policy and asynchronous step dispatch. The 15 s transport and 12 s learn dispatch stay | A step whose code needs longer, for example GitHub's 30 s first navigation, fails learning even where replay with 30 s would pass. Learning and replay timing differ (L-8). If a gate positive fails only on this window, it escalates to the user as an E9 re-scope |
| 2 | E10: one environment for learning | The guided launch passes no viewport (`browser.ts:420` [V]). Code learned at one size can behave differently in the proof. The proof then fails that step; it does not pass silently (L-9) |
| 3 | E11: parity harness | C2 rests on one execution module and the same frozen code. Divergences surface only as proof or gate failures; there is no per-step parity evidence (L-10) |
| 4 | E13: static pre-scan; only the syntax check remains | No free-identifier, member or provenance rules. INPUT-POLICY-01's "no invented literal bytes" and author-bound navigation are not enforced, except for secrets. Replay re-admission cannot bound a tampered row (L-11) |
| 5 | E14: wrong-target tripwire | No same-element check and no identity witness. The intent gate and `GuidedActionGuard` are deleted. A wrong-unique target or an unrequested side-effecting click is caught only afterwards, by an `expect` or the proof (L-12) |
| 6 | E15: forked learning child | During learning, model code runs with the runner server's privileges: TLS and controller keys, service identity, other sessions, the pod network. Accepted by the user (L-13) |
| 7 | E17: prompt ordering for Vertex caching | `payload()` keeps `requestId` and `attempt` first (`GenAiGuidedLlmGatewayClient.java:298-305` [V]), so implicit caching will not hit. Costs money and latency, not correctness (L-14) |
| 8 | E19: frontend code view | Authors see step status only. Inspecting the frozen code needs backend access |
| 9 | E20: planner with no operation vocabulary. S-min stays | The SOURCE_PLAN obligation frame remains, with a single open `step` kind (L-15) |
| 10 | **X-1 (REQ L-16):** execution-only validation | No assertion is required, so a step without an `expect` can pass on a wrong-but-unique target or with no visible effect. A model-chosen `expect` is not checked for whether it discriminates. A tautological one can pass |
| 11 | **X-2 (REQ L-17):** leak and network channels the wrapper does not cover | Console, cookies, request bodies, Node-side `page.request` (which bypasses the domain check), `exposeFunction` and Playwright error text are named risks, not controls |
| 12 | **X-3 (REQ L-18):** the allow-all domain switch stays ON, for the gate and the release | The domain policy restricts nothing. Generated code can navigate anywhere, and learning runs with server privileges |
| 13 | **X-4 (REQ L-19):** no learn-vs-proof divergence check | A step that passed in learning and fails in the proof is found only by the proof, which does not distinguish a model fault from a timing or environment difference |

The artifact HMAC (ADR-SC-005 P2) is also not in this release (D-9): stored code is executable, and replay re-admission is syntax only. It is a **pre-pilot** condition.

## Alternatives considered

| Option | Why not |
|---|---|
| Typed operation registry (PLAN-v2) | Reversed by the user |
| A `node:vm` context as the primitive | Breaks Playwright's `instanceof RegExp`; not a boundary either |
| A separate process attached to Chromium over CDP | A new isolation layer, which the user ruled out |
| Ref placeholders resolved by the runner | The closed grammar the user asked to drop; cannot express in-step or chained targets |
| A secret as a string token substituted in arguments | Loses the trusted password-control checks |
| A mandatory verify block with assertion counting | Replaced by X-1; it needed a counting wrapper and rules the user descoped |
| TypeScript output | Needs type-checking to pay off, which is descoped |

## Consequences

- **C1** is met in the user's sense: no operation list admits code. Literally "any web test" is still impossible (L-2). The gate exercises no frames, popups, dialogs or `evaluate`; those are fixture tier only (L-4).
- **C2** is met for the code and the executor. Process, environment and timing still differ between learning and replay (items 1, 2, 3, 6).
- **C3** is met per step by the model-free proof receipts under X-1: "learned" means the frozen code ran without error, not that an outcome was independently checked.
- **Where the risk sits.** It moves from "the model picks a wrong operation" to "the model writes arbitrary code", with runtime-only controls: the binding, the proof and the prompt rules protecting N1 to N3. D3.4 states the residual risk.

## Verification

- **Spike S-1 (before build, scratch copy).** Prove that `expect` from `playwright/test` works outside the test runner on wrapped locators, that `Proxy` forwarding works with Playwright's private members, and that an `AsyncFunction` body with regex locators runs. If `expect` fails, the step API ships a runner `expect` built on the public `Locator` and `Page` read API, and this ADR is amended.
- **Evaluation.** The four checks of D3.1. A syntax error is refused with line and column and zero effects.
- **Boundary.** With allow-all OFF, `goto` or a popup to an off-list host is refused before any effect. A secret canary never appears in the source, prompts, the store, logs or artifacts. `secrets.X` used outside `fill`, or on a field that is not a password control, gives `POLICY_DENIED` with zero effects. `evaluate` on a secret-bearing document is refused. `Page.video` or `Page.close` from step code is refused.
- **Effects (NFR-2).** The server-side effect counter equals exactly 1 for a lost response, a cancellation and a timeout after the fence. A locator with zero or several matches gives `TARGET_DRIFT` with 0 effects.
- **Lifecycle.** Promotion's compare-and-set holds when a late proof of revision A arrives while B is current. No non-passing state promotes. Schedules stay continuous across promotion.
- **Removals.** A grep of `studio-runner/src` and `backend/src/main` for the names in D7 returns 0. No `contracts/v4` directory exists.
- **Gate.** PLAN-v3's items on the final frozen stack, with N1 to N3 as hard zeros. The environment record includes `referenceHash`, `promptHash`, the store snapshot hash and the engine pin.

## Release conditions

| # | Condition | Owner |
|---|---|---|
| O-1 | Compliance re-confirms the export shape (frozen step code, retrieved examples with literals abstracted, repair text) **before production with real CSI data**, not before the build or the public-site gate. Request draft: `docs/specs/studio-generated-step-code/compliance-request.md` | User, Compliance |
| O-3 | Security P1 review of R-1, of the D3.4 residual and of the pseudo-element privacy check, after the runner work freezes and before the counted gate | Security |
| O-4 | Artifact HMAC before any pilot | Security, User |
| O-6 | Iframe content in perception is a follow-up, not this release | User, Compliance |

— Aria (@architect), 2026-10-29
