# Pareto implementation plan — second pass

Date: 2026-10-27. This narrows the first delivery proposed in [the earlier plan](03-recommendations.md). Analysis only; production code is unchanged.

## Decision

Commit to **two changes**: bounded assertion waiting and request-kind-specific prompts. Make overflow projection a third, evidence-triggered change. Preserve ref selection, deterministic locator synthesis and model-free replay.

This is the highest-confidence small implementation slice from the inspected code. There is no current failure histogram proving that it fixes 80% of failures. Pareto is the prioritization principle, not a promised improvement percentage.

Optimize for complete supported workflows that detect deliberately broken outcomes. Track cost as total tokens/calls across all attempted workflows divided by correctly completed workflows, alongside raw totals. Faster failure, skipped assertions and more refusals must not appear as a quality improvement.

| Priority | Change | Expected value | Relative effort | Confidence |
|---|---|---|---|---|
| 1 | Wait for assertion conditions within existing deadlines | Removes a deterministic source of false failure during learning and replay | Medium; includes learning-gate integration | High that the timing gap exists; prevalence unmeasured |
| 2 | Split instructions by request kind | Removes repeated irrelevant instructions without removing page evidence | Low–medium, including provenance and comparison tests | High for fewer instruction bytes; quality/latency benefit needs measurement |
| Conditional 3 | Prioritize target groups in outline overflow | Prevents relevant late-page nodes being crowded out | Low–medium | High that the cutoff exists; frequency unmeasured |

Implement and measure each change separately. Prompt splitting may land first because it is smaller; assertion waiting remains the higher correctness priority. If the exact-build baseline identifies overflow as the dominant blocker, move the narrow overflow fix ahead of prompt work.

## Small baseline, not a measurement project

Reuse model usage, call timing, gate provenance, the runner fixtures and `frontend/e2e/realsite-gate/`. The existing report already records calls/tokens, clarification, learning, proof and replays. Add only missing component-byte measurements and assertion/projection outcome counters needed for the comparison. No dashboard, new evaluation framework or unrestricted prompt logging.

Freeze the working-tree digest and effective model/prompt/schema/runtime settings. Select a small diagnostic set from existing fixtures, extending it only where coverage is missing:

- A straightforward supported navigation/fill/click/assert workflow.
- Text, value, URL and title that become correct after a delay.
- The same conditions that stay wrong through the deadline.
- A wrong-target decoy that already contains the expected text.
- Cancellation or target replacement while waiting.
- A large page with the intended target near the bottom and a competing label in another region.
- An existing read-and-reuse chain and incremental re-learn case, to detect prompt regressions.

Use repeatable browser fixtures for timing behavior. For stochastic model comparisons, run paired cases with repeated trials, keeping model and context constant. Small samples screen changes; they do not establish production accuracy. Reuse the existing complete release and D-C gates for final acceptance, including next-day replay where required.

Record: supported workflow completion without clarification; deliberately broken outcomes that passed; first-cause failure class; total model calls/tokens including failed attempts; and latency. This is enough to decide whether the next change earns its complexity.

## Delivery 1: assertion waiting, with the learning gate included

Current evidence: `targetAction.ts:341` reads text/value once after visibility; `pageStateInPage.ts:161` compares current URL/title once. `GuidedProposalValidator.java:754` can reject a text proposal before dispatch because G2 does not find the expected literal in the observation. Polling only in the executor leaves that early rejection intact.

Implement a small trusted condition-waiting helper within existing action/step budgets. Preserve current equality and normalization semantics initially. A permanently wrong value returns the existing assertion-failure outcome at the allowed deadline; cancellation and target drift keep their distinct handling. Successful conditions finish immediately. Do not increase global timeouts or retry an entire test.

Repeated probes are read-only and use the same intended target and authored expected value. Each probe must respect remaining time, origin and target identity. Do not repeat click/fill/press operations. Preserve the executor's existing invocation-fence semantics and evidence accounting; element assertions currently determine their result before the fence.

For learning, add bounded refresh/revalidation when G2's missing expected text could be a pending condition on an independently grounded target. Reuse the observation-refresh machinery where possible. Any fresh observation requires fresh identity/ref validation; old refs cannot carry authority across generations. Do not remove G2, select another element because it contains the answer, or ask the LLM repeatedly whether the condition is now true. If the target cannot be independently established, keep the clarification/refusal path.

Do not hold a database transaction/lock open while waiting on browser conditions: `applyNextAction` validation runs within the model application flow. The implementation must separate bounded browser work from the transaction that validates and commits fresh evidence. This is the main design dependency and why this change is medium effort.

Prefer the current runner dependency surface for the first increment. Native Playwright assertions can serve as the test oracle for waiting behavior; adopting `@playwright/test` at runtime or changing all comparison semantics is not necessary for this fix. Playwright documents retrying assertions as the appropriate mechanism for asynchronous UI conditions. [Official assertions](https://playwright.dev/docs/test-assertions)

Acceptance: delayed-correct cases pass in learn and replay; permanently wrong values and wrong-target decoys fail; cancellation and drift stop waiting; side effects still occur at most once; existing evidence/privacy checks pass. Review the narrow ADR adjustment for pending assertions before implementation.

## Delivery 2: split the existing prompt; do not build a skill framework

Use the existing assembler with a shared core and SOURCE_PLAN, NEXT_ACTION and VERIFY_STEP instruction sections. Initially preserve the response schemas, entire context payload and observation policy. This isolates the effect of instruction selection and avoids risking dependencies or removing page evidence while measuring it.

Move source-span arithmetic, initial/incremental source planning and source-plan dependency rules out of NEXT_ACTION. Retain current-ref selection, ambiguity handling, operation correspondence, secret boundaries, expected-outcome rules and all relevant invariants. Preserve useful current examples; avoid adding a catalog of new ones in the same change.

The current instruction is 15,598 UTF-8 bytes. Roughly 8–9 KB of its paragraphs concern source planning; this indicates substantial removable material from action calls, not a measured token saving. Schemas, page outlines and context remain, and cache behavior can affect billed cost. Do not promise a percentage reduction in total tokens or latency.

Update all assembly paths, including `preparePure` and `completePreparedOrOriginal`. Extend existing provenance to hash the composed instructions deterministically. Respect the existing `schemaPins` mismatch behavior for sessions created under old instructions. A split that changes one path but leaves preparation/caching hashes on the monolithic text is incomplete.

Generate synthetic example requests from the assembler to replace the stale handwritten example. Correct the misleading menu/list wording around native `selectOption`, but report that as capability documentation, not newly supported widgets.

Acceptance: action requests are smaller; provider tokens/calls are measured; supported task completion and negative cases do not regress; source spans, read bindings and incremental re-learn stay correct. Retain full context until this isolated comparison is understood.

## Conditional delivery 3: fix overflow ordering only

Trigger: exact-build failures or targeted fixtures show that needed candidates exist in the sanitized tree but disappear from the capped outline.

Modify the final overflow selection in `perceive.ts` to prioritize matched target groups and their meaningful ancestors/headers over generic earlier controls. Preserve plausible competing candidates so cropping cannot manufacture uniqueness. If a complete ambiguity group cannot fit, explicitly represent insufficient evidence rather than offer one misleading survivor.

Keep the 40,000-byte ceiling, sanitization and initial behavior on non-overflow pages. Do not add model-requested subtree tools, embeddings, summaries or whole-checklist pruning in this increment. The problem addressed is information lost at the cutoff, not maximal compression.

Acceptance: the late target and its competing candidates survive the fixture; original ordering/scoping remains understandable; bounds and sanitization hold; normal-page behavior is unchanged. If the remaining failures are model interpretation or admission rather than omitted evidence, spend the next effort there instead.

## Explicitly deferred

- **Full Playwright skill ingestion, MCP/CLI migration or RAG.** The runtime model emits refs and typed operations; it cannot use a coding-agent skill's tools. A future small operation recipe needs an observed failure cluster and a paired test showing benefit.
- **Broad custom-dropdown support.** SOURCE_PLAN selects an operation before seeing the target page. Adding native/custom metadata at NEXT_ACTION does not alone repair a wrongly committed plan. Supporting custom widgets needs semantic selection with controlled lowering, or an explicit bounded expansion of the obligation. Treat that as separate capability work if enterprise usage makes it frequent; unsupported cases remain in the reported coverage denominator.
- **General context pruning and expansion.** Changes to source/dependency projection, ambiguity and ref freshness have a larger regression surface than the narrow overflow fix.
- **Model switching, reasoning tuning, explicit caching and output-budget tuning.** Reconsider after the small delivery identifies the remaining failure/cost distribution. Keep useful existing cache telemetry.

Developer-side Playwright skills remain optional tooling. They are not needed for either committed delivery and have no automatic effect on the Vertex prompt.

## Stop rule and next steps

After the two deliveries, rerun the diagnostic comparison and required release checks. If supported workflows are sufficiently reliable and cost/latency meet the product need, stop. If not, select the next change from the largest remaining failure class. Missing-target evidence points to overflow; planning errors to a small targeted example; custom widgets to capability support; slow conditions to timing analysis. Do not execute the entire original roadmap by default.

For implementation, have architecture review the narrow assertion/gate boundary, then use the project's development workflow for the two isolated changes and QA's existing acceptance harness. No fresh inference benchmark or runtime test was performed during this analysis pass.
