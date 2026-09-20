# Studio inference evaluation specification

**Date:** 2026-09-16 · **Owner:** Quinn (QA) · **Status:** C0 evaluation design; the development harness and sample corpus are implemented, while the release-sized corpus/live run remain pending. Numerical targets in §7 are proposals for Pax/Aria to freeze before live evaluation. This document is not a story gate or evidence of live Vertex/R2D2 behavior.

**Scope:** [remediation plan](../architecture/studio-inference-implementation-plan.md), review findings [F1–F10](../architecture/studio-inference-review-2026-09-16.md), and full/incremental acceptance cases 1–19. The selected behavior remains: regenerate changed/dependent steps, validate the entire artifact, confirm the exact new candidate, and execute the full test in a fresh browser on explicit Run. Saving and compiling never start browser actions.

## 1. Evidence boundaries and existing repository seams

| Tier | Execution | Establishes | Does not establish |
| --- | --- | --- | --- |
| T1 — Contract and orchestration | Scripted gateway/validator, real API/persistence where needed, deterministic clocks/barriers | Schema rejection, outcome mapping, scope/reuse, publication/confirmation integrity, retry/deadline invariants | Live gateway behavior or English translation quality |
| T2 — Real-browser conformance | Hand-written artifacts through the pinned validator, trusted adapter, and Chromium against controlled apps | Supported language/option behavior and oracle sensitivity | LLM quality, R2D2 compatibility, or approved-image evidence when run only on a developer machine |
| T3 — Integrated inference evaluation | Real approved gateway/model, real API lifecycle, real runner/full browser execution, independent controlled-app oracle | Measured translation quality, full/incremental behavior, end-to-end performance under the recorded conditions | Correctness for arbitrary English/apps or production readiness beyond the recorded external gates |

Current starting points:

- [`backend/src/test/.../studio/compile`](../../backend/src/test/java/com/citi/put/checks/studio/compile) contains scripted repair, WireMock gateway/validator, confirmation, and budget tests. `SemanticHonestyTest` scans claims in source/docs; it is not a semantic translation test.
- [`studio-runner/fixtures/reference`](../../studio-runner/fixtures/reference) and [`reference-execution.test.ts`](../../studio-runner/test/fixtures-tier/reference-execution.test.ts) cover hand-written accepted artifacts. [`reference-manifest.ts`](../../studio-runner/test/helpers/reference-manifest.ts) intentionally derives syntax coverage from validated operations; do not reuse that derivation as the independent behavioral oracle.
- [`pageServer.ts`](../../studio-runner/test/helpers/pageServer.ts) serves pinned static HTML and records method/URL/host. Its existing forms include buttons without stateful submit handlers; HTTP presence alone cannot prove that the intended click/account/value occurred. The new evaluation app needs instrumented state and reset support.
- [`realRunner.ts`](../../studio-runner/test/fixtures-tier/realRunner.ts) launches a real child browser but fakes API callbacks. Reuse its browser setup ideas for T2; T3 must exercise real candidate confirmation, dispatch, callbacks, and revision-bound evidence.
- The default runner `npm test` excludes browser-fixture and deployment tiers. Follow the existing [CI stages](../../studio-runner/ci/stages.md); missing prerequisites are recorded, never silently counted as a pass.

New files for the harness, schemas, and fixtures require named implementation-story ownership. This specification neither edits nor widens the pinned runtime/language contracts.

## 2. Fixture application and independent oracle

### Isolation and state

Provide a versioned fixture app with deterministic seeded accounts, search records, form controls, navigation, delayed UI states, and explicit success/failure variants. Use synthetic values only. Each trial receives its own fixture namespace, reset token, state seed, and fresh browser; do not share cookies, server-side state, or completion events across trials. A test that leaves state behind must not make its next repetition pass.

The app records ordered domain events such as `login.accepted`, `search.submitted`, `account.opened`, and `form.saved`, with synthetic account IDs, submitted plain values, event order, and namespace. It exposes a final state snapshot to the evaluator through a separate control interface unavailable to generated browser operations. The control interface must support reset/read, not appear in prompts or allowed target references, and remain outside the runner's permitted destinations. A missing/extra/misordered required event or unexpected state fails its oracle. Avoid generic click counters when the requirement is a completed business action.

The approved target URL is substituted into source/reference values **before** source capture and generation. Do not rewrite generated artifacts after hashing/confirmation. Local loopback fixtures are for the local test tier; shared-environment tests use approved fixture targets and network policy. Do not weaken production target restrictions to make an evaluation work.

### Expected behavior is authored independently

QA writes expected events/state and expected run outcome from the English requirement and seeded app scenario before inspecting model output. The expected record must not be generated from the produced AST, executor calls, full-recompile output, or an LLM judge. A reviewer checks that the fixture actually distinguishes the intended action from plausible wrong actions.

Keep two independent verdicts:

1. **Execution observation:** actual runner status, failing step/reason, and revision/configuration identity.
2. **Oracle comparison:** whether required app outcomes and assertion behavior match the predeclared requirement.

An intended assertion failure is a correct translation when prerequisites occurred, the correct assertion failed on the controlled contradictory state, and the failure identity matches the declared expectation. A timeout from a wrong locator is not interchangeable with the expected assertion failure. A green execution with a mismatched oracle is a semantic false success.

For assertions with no app-side effect, use paired fixture states differing only in the asserted fact: satisfying and contradicting text/value/URL/visibility. Require the correct positive/negative runner outcome on both. Cover whitespace, regex flags, explicit `ignoreCase:false`, missing/detached elements, and delayed conditions at timeout boundaries. Use independently specified Playwright semantics or narrow the accepted policy explicitly; do not copy the custom assertion implementation into the oracle.

If a negative assertion is unsupported by the frozen language, the correct compile result is non-executable `NEEDS_REVISION` with an unsupported reason. Never add `.not` or another capability only in the evaluation harness, or reward approximation to a positive assertion.

### Oracle mutation controls

| Control | Planted wrong behavior | Required detection |
| --- | --- | --- |
| M1 — Reversed assertion | Replace negative intent with a positive assertion, or invert an expected assertion outcome | Contradictory-state pair or non-executable outcome expectation catches the mismatch |
| M2 — Wrong target | Open the wrong account/row, including a similar label | Fixture records the wrong domain ID, even if the UI shows a generic success message |
| M3 — Missing action | Omit submission or replace it with an allowed no-op/read | Required saved/search event and state transition are absent |
| M4 — Trial action | Substitute `click({trial:true})` for an actual click | Current policy rejects it, or the T2 oracle catches the absent application event; never report action success |
| M5 — Weakened assertion options | Ignore explicit case sensitivity or whitespace semantics | Positive/negative paired states expose the false success or false failure |
| M6 — Historical evidence | Attach an old run/baseline success to changed source/configuration | Revision/configuration/run association oracle refuses current green |
| M7 — State contamination | Leave prior success/state in a second trial or skip login | Namespace/reset isolation and required prerequisite events detect the shortcut |

The T2 oracle self-test must also demonstrate M2/M3/M5 against wrong implementations that remain syntactically permitted; a validator rejecting every mutation does not establish oracle sensitivity. Controls that intentionally violate the final capability policy are tested at their proper rejection boundary. No mutation bypass is added to the production runtime. All controls must be detected before trusting any T3 scores.

## 3. Corpus and full/incremental pairing

Version each manifest with case ID, family ID, split (`development`/`held-out`), source, ordered authoring IDs, scope/dependency declaration, reference **names**, fixture seed/state variant, expected compile/run/oracle outcome, and coverage tags. Oracle/control fields remain private to the evaluator and are never appended to the model prompt. Synthetic resolved secrets are supplied only through the normal runtime reference path and never logged.

Recommended initial live set, **proposed pending C0/Pax freeze**: 60 distinct supported task families (including 20 intended assertion-failure tasks), 20 unsupported tasks, and 20 ambiguous tasks; three repetitions per case. Cover at least 30 supported families with paired early-, middle-, and last-step edits. Maintain separate development and held-out source variants; paraphrases of one task stay in the same family/split. Repeated observations improve repeatability measurement but are not independent task samples. Do not tune prompts on held-out failures and continue calling that same set held-out.

Task families include explicit role/label/test-id locators, similar/ambiguous names, login and navigation, check/uncheck/select/fill/press, search and dependent assertions, plain-variable/secret references, case/whitespace assertions, and instructions beyond the frozen language. Include instruction-like author text and baseline/candidate text attempting to widen write scope or expose references. The acceptance classification follows the frozen capability policy, not assumptions about arbitrary English support.

For each incremental pair:

1. Generate, validate, confirm, and fully execute a baseline through the real lifecycle. Record its exact revision/configuration/scope and successful full-run identity. For intentionally failing edited tests, the baseline still passes before the edit. A baseline failure is reported and cannot be replaced by a hand-written baseline for T3.
2. Establish equivalent isolated tests/fixture namespaces with the same source, baseline content, pins and scope contract; IDs remain server-allocated per test. Compare modes within corresponding identities, never grant cross-test reuse by hash.
3. Apply the same edit to each treatment. Request explicit `FULL` for one and `AUTO` for the other. Record actual selected `FULL`, `INCREMENTAL`, or `REUSE` and reason. Unknown/global/forward scope correctly selects full; do not count fallback as successful incremental reuse.
4. Compare generation scope and retained source/code against each treatment's pinned baseline. Reused bytes must be identical; independently generated full code need not be identical to incremental code.
5. Validate the complete artifact, confirm the exact candidate, reset the fixture, and explicitly run **all** steps in a fresh browser for both treatments. Check the same independent outcome oracle. A controlled evaluation run may confirm synthetic candidates through the normal authenticated API because its invocation explicitly requests these trials; it never changes save/compile behavior.
6. Randomize treatment order, record cold/warm conditions and request placement, and repeat. Report baseline failures, fallback frequency, unsupported/clarification outcomes, generation/repair costs and final outcomes rather than excluding inconvenient trials.

Also cover unchanged saves, exact-content reverts with newer revisions, multiple accumulated edits, duplicate text, insertion/deletion/reordering, IDs supplied by legacy writers, early steps depending on later instructions, stale/changed scope metadata, expired evidence, configuration-only changes, renamed/removed references, model/policy/version changes, and explicit identical-content rebuilds. These are primarily T1/T2 controls; representative eligible/unknown-scope cases must also appear in T3.

## 4. Contract and runtime matrix

The implementation stories must map each row to test paths and evidence. This is traceability, not a claim that the tests exist.

| ID | Requirement / adversary | Required evidence | Review / plan coverage |
| --- | --- | --- | --- |
| Q01 | Unsupported/clarification, including one unsupported step among valid ones | Entire proposal is non-executable; no candidate, old-code substitution, implicit confirmation, or browser start | F1/F8; AC1/5/11/14 |
| Q02 | Truncated/malformed output, extra fields, safety/finish outcome, empty/partial patch | Closed envelopes fail safely; bounded repair where permitted; exact IDs and version are checked | F3/F8; AC5/7/8 |
| Q03 | Validator success missing steps/version, duplicate indexes or conflicting verdicts | Reject aggregate success; no invented validation provenance | F3; AC5/8 |
| Q04 | Wrong action/assertion, trial/case/whitespace behavior | Real-browser conformance plus independent mutations/paired states | F4/F6/F10; AC11/17 |
| Q05 | Concurrent edits around capture, publication and confirmation; overlapping attempts | Real PostgreSQL barriers; stale request has no candidate/current-green write | F2; AC6/13/15/16/18 |
| Q06 | Change only scope/dependency metadata while compile is in flight | Snapshot/revision/publication/confirmation guards bind that metadata, not text alone | F2; AC6/14/16 |
| Q07 | Last/middle/early edits, multiple edits and forward/global dependencies | Correct selected mode/reason and exact protected prefix; no LLM-chosen scope | F10; AC1–4/14 |
| Q08 | Out-of-scope/omitted/duplicate patch IDs or repair rewriting retained steps | No publication; no budget/scope reset or silent unrestricted fallback | F1/F5; AC5/7/8 |
| Q09 | Cross-test/CSI reuse, deletion/quarantine, revoked secret/policy | Server-side authorization/ineligibility checks at required boundaries, including races | F2/F3; AC8/10/16 |
| Q10 | No-op, revert, configuration-only change, identical-source rebuild | Declared zero-call paths, request versus content identity, write-once provenance, exact confirmation | F2/F9; AC10/13/15/18 |
| Q11 | Slow 429/503, stalled response/validation, repair, deadline, saturation | One monotonic budget; bounded calls; no post-deadline retry; observable cancellation and capacity recovery | F5/F8; AC7/12 |
| Q12 | Save/compile versus Run; old green result arrives late | No browser before explicit Run; complete fresh run; current evidence never borrowed | F2/F10; AC9/13/16 |
| Q13 | Legacy history, mixed writers, upgrade/cutover/rollback floor, retention | Migration and immutable lineage tests; indexed baseline query at realistic volume | F2/F9; AC4/15/18/19 |
| Q14 | Actual gateway request handling and generation parameters | SPK-01 signed evidence plus live model/schema/token/finish/retry observations | F7/F8/F9; AC7/11/12 |
| Q15 | Full/incremental quality and claimed efficiency | Paired held-out outcomes, token/latency/repair measurements and explicit denominators | F9/F10; AC2/3/11/12/17 |

Proposal/repair attempts are capped at three total under the C0 design; any transport retry count is also bounded and remains inside the same hard deadline. Test the final frozen limits, including the no-retry rule for ambiguous timeouts. The current pipeline has an admission pool without a queue; test immediate overload refusal rather than inventing queue behavior. Saturation tests must observe the pool/transport lifecycle, not only a terminal status.

## 5. CLI and evidence contract for the new harness

The development harness is implemented in [`studio-runner/evaluation`](../../studio-runner/evaluation/README.md). Its CLI provides `validate-manifest`, `oracle-self-test`, `run`, and `summarize` operations, documented executable paths and CI invocation. Quinn reviews its independent expected-result logic. No CLI may silently substitute scripted inference when `live` is requested.

Required inputs:

- Tier and purpose (`development` or `release`), manifest/split selection, pins/frozen-target file, source commit plus dirty-baseline digest, fixture version, API/runner/fixture endpoints and approved target policy.
- Case/repetition/order seed, mode treatment, workflow lengths, admitted concurrency and overload schedule; fresh/reset behavior is mandatory, not optional for a release run.
- Explicit maximum transport calls, elapsed duration and monetary ceiling for live use. Credentials come from approved environment/file/identity configuration, never command arguments or a manifest. If usage cannot be priced, use an accountable gateway quota/charge ceiling; do not guess prices or label a run cost-complete.
- A writable evidence directory and redaction policy. Release mode requires frozen targets and declared prerequisite evidence; missing prerequisites yields an incomplete run, not a pass.

All outputs carry a schema version. Write an immutable run manifest, per-trial JSONL, summary JSON, and readable report. Per-trial records include:

- Case/family/split/repetition and fixture namespace/seed/version; expected semantic outcome separately from observed compile/execution/oracle outcomes.
- Requested/selected mode and reason; source/configuration/scope revision/hash; baseline revision/hash and execution identity `(id, started_at)`; changed/writable/reused/generated IDs.
- Compile request and candidate identities, artifact hash, exact confirmation identity; execution identity and its source/configuration association. Per-step immediate/original origin and code hashes demonstrate preservation without putting artifact text in logs.
- Proposal/repair/transport counts, input/output/total usage and availability, finish reason, all generation/prompt/model/policy/validator/runtime pins, response classifications, and retry/cancellation outcomes.
- Monotonic durations for admission, prompt preparation, inference/backoff, parsing/validation, persistence, compile-to-candidate, confirmation automation, runner scheduling/execution, and oracle evaluation. Record outer end-to-end time separately; human think time is excluded and explicitly labelled.
- Expected/observed app events/state, assertion outcome, independent oracle verdict and reason, evidence references, redaction result, failures/skips/unavailable prerequisites, and measured cost or explicit `unavailable`.

Fixture source and synthetic generated artifacts may be retained as protected evaluation evidence, never general operational logs; reference them by digest/path. Credentials, resolved secret values, request authorization headers, and production prompts must not appear in evidence. Namespace/reset tokens and control-interface credentials are excluded as well.

Exit-code contract: `0` means the requested test/evaluation checks passed; `1` means a check/threshold failed; `2` means input/prerequisite/budget/incomplete evidence prevented completion; cancellation is nonzero. Summaries additionally state `releaseReady: false` unless the full declared release evidence and frozen gates were met. A successful T1/T2/development run cannot set it true. An interrupted run preserves completed records, marks missing trials incomplete, and cannot cherry-pick a passing subset. Hard call/time/cost ceilings stop further work and remain visible in the summary.

## 6. Metrics and denominator rules

Report counts before percentages, by mode, family, expected outcome, step length, edit position, concurrency and repetition. Report uncertainty intervals and task-level variation; do not treat paraphrases/repeated trials as independent proof of a population guarantee.

- **First-proposal validity:** supported-case first proposals accepted by all static gates / all supported-case trials. Transport errors, refusals, malformed responses and missing trials do not silently leave the denominator.
- **Final validity:** supported-case trials yielding a complete statically valid candidate within the declared request budget / all supported-case trials. Show incomplete infrastructure runs separately; they cannot support a release pass.
- **Behavioral correctness:** supported-case trials with correct oracle and expected PASS or deliberate FAIL / all supported-case trials. A supported request incorrectly refused or timed out is incorrect, even if safe. Correct intentional FAIL requires the expected assertion failure, not any failure.
- **False success:** executions reported PASS with a mismatched required behavioral oracle. Report both the count and rates per all supported trials and per PASS execution; this excludes correctly failing a deliberately contradictory assertion.
- **Unsupported/ambiguity handling:** correct non-executable outcomes / cases in each separately prelabelled class. Unsupported acceptance and wrong approximation are failures. Report supported coverage so rejecting everything cannot score well.
- **Reuse integrity:** eligible trials retaining every protected source/code string exactly, with correct lineage / all eligible incremental trials. Report eligible selection/fallback rate separately from reuse integrity.
- **Repair yield:** trials made statically valid and independently behaviorally correct by repair / trials entering repair, plus any regressions and total usage. A schema-only improvement is not semantic repair success.
- **Efficiency:** paired full/AUTO differences in compile latency, inference latency, tokens, actual charged cost, repair counts and full run time. Report p50/p95 and outliers; aggregate end-to-end browser time cannot be represented as inference time. Include all context tokens; fewer generated steps alone is not a saving.
- **Capacity:** active calls, accepted/refused requests, post-deadline calls, time to reclaimed slot, bounded transport cancellation, throughput and latency at declared offered/admitted load. Observe no queue unless a later approved design introduces one.

## 7. Proposed numerical targets — awaiting Pax/Aria freeze

These are recommended starting targets, **not measured results, existing product SLOs, or approval to enable a gateway**. Pax/Aria may change them before live results, with rationale recorded in a versioned target file. Unset release targets block readiness; never tune a threshold after seeing a failed held-out run and describe that run as meeting the original gate.

| Metric | Proposed target | Conditions / interpretation |
| --- | --- | --- |
| Deterministic safety, reuse, identity and mutation controls | 100% pass; zero bypasses | All Q01–Q13 applicable controls and M1–M7; a critical family failure is never hidden in an aggregate |
| Observed semantic false successes | 0 | Both modes, all release trials; zero sampled failures is not a guarantee for arbitrary inputs |
| Supported end-to-end behavioral correctness | ≥98% | Each mode; report family counts and confidence intervals; supported refusals/timeouts count incorrect |
| First-proposal / final static validity | ≥95% / ≥99% | Each mode, complete supported trial denominator |
| Unsupported and ambiguous non-executable handling | 100% | Frozen classes; no candidate from a mixed supported/unsupported proposal |
| Compile-to-candidate latency, 5–20 steps, admitted concurrency 1 | p50 ≤15 s; p95 ≤45 s | Healthy approved gateway, hardware/pins recorded; failures and timeouts reported, not removed |
| Compile-to-candidate latency, 5–20 steps, admitted concurrency 4 | p95 ≤60 s | Match current default compile-pool capacity; browser execution latency measured separately |
| Overload refusal at 8 offered concurrent requests / 4 slots | ≤1 s; 0 inference calls for refused requests | Controlled T1 saturation plus live approved-load confirmation; no hidden queue |
| Deadline capacity recovery | Slot reusable within 2 s of deadline; 0 later retries | Controlled wire test proves transport/task behavior; verify the selected SDK can honor this target |
| Supported 50/100-step latency and full browser end-to-end time | **Pending named targets** | Measure separately; Pax/Aria must freeze latency targets before claiming readiness for these advertised sizes |
| Token/monetary ceilings | Explicit hard ceilings; **pending unit-cost targets** | Use actual model/gateway accounting; stop on exhaustion; missing charge data cannot masquerade as a measured saving |

Incremental performance is an optimization claim, not a semantic correctness waiver. Proposed efficiency objective for eligible last-step edits: at least 15% lower median inference time, at least 20% fewer generated output tokens, and no increase in median total billed tokens versus paired full compilation. Report input tokens and total cost. If correctness gates pass but savings are absent, disclose that outcome and revisit the incremental rollout claim rather than relaxing safety.

Proposed minimum trial shape is in §3; add a sample-size/power justification when freezing targets. Record per-family outcomes and confidence intervals even if percentage gates pass. Numerical targets remain unapproved until the accountable owners record the decision; this document does not fabricate their sign-off.

## 8. Handoffs and exit evidence

- **Aria:** freeze outcome, mode/reason, dependency/scope, strict verdict, and bounded-call contracts; make required evidence observable through authenticated compile/execution surfaces. Operational logs need no prompt/artifact contents. Resolve any output field not available in the actual SDK explicitly.
- **Dara:** provide immutable snapshot/lineage and baseline-run query contracts, PostgreSQL race/migration fixtures, and volume/retention scenario inputs. Capture evidence with the true composite execution identity.
- **River/Pax:** create/validate real stories covering Q01–Q15 and the new CLI/corpus; freeze numerical targets with Aria before T3, including currently pending long-workflow/cost targets. Keep implementation readiness separate from live release readiness.
- **Dex owners:** implement production fixes and a bounded harness against frozen interfaces; provide commands, fixture/target schemas, evidence paths, and unit/regression results. The harness must run from the CLI before any reporting UI is considered.
- **Quinn:** owns expected corpus/oracle definitions and mutation sensitivity review, independently runs integrated checks, compares outcomes and issues the appropriate later story/release assessment. It does not approve its own production implementation.
- **Gage:** supplies recorded approved-image/gateway/network/identity/vault/evidence prerequisites, cost ceiling and safe load allocation. [SPK-01](spikes/SPK-01/README.md) remains a distinct live gateway gate; local fixtures and stubs do not close it. Preserve filesystem evidence locally and S3 remotely per the integration plan.

C0 evaluation-design completion is this traceable spec plus reviewed contract/test ownership. F completion requires the implemented CLI, oracle self-tests, complete tiered evidence, frozen targets and actual results. No application execution, live call, story transition, or production enablement was performed to create this document.
