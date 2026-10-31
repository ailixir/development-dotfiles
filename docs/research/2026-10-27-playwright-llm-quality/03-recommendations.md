# Proposed implementation plan

The second-pass [Pareto plan](04-pareto-plan.md) supersedes this document's first-delivery scope and sequencing. This document retains the broader options for later consideration.

Retain the current model-to-typed-actions boundary, runner-owned locator synthesis and model-free replay. Changes below are proposals, not implemented behavior. Update the relevant ADR/contracts where they change semantics; do not silently bypass current gates.

## 1. Establish a reproducible baseline

Extend the existing evaluation and real-stack harnesses rather than create a competing benchmark.

- Pin model ID, reasoning setting, prompt/module hashes, schema, projection policy, runner build and Playwright version.
- Record size by component: core instructions, request-kind instructions, examples, response schema, source/context metadata and page outline. Record actual provider tokens separately from bytes.
- Reuse existing call latency, cached-token, usage and gate-provenance instrumentation. Add aggregate projection tier/omission counts and per-kind output-limit/finish-reason diagnostics without recording private payloads.
- Measure complete authored workflows, not just valid JSON or successful clicks: first-attempt intent accuracy, admitted execution, end-to-end completion without clarification, clean-context replay, next-day replay and false passes under broken outcomes.
- Include delayed text/value/title/URL, long pages with the target near the end, duplicate labels and scopes, native selects, custom comboboxes, row-value reads, value bindings, and edited-prefix reuse.

The existing D-C requirement remains 20 workflows × 3 repetitions, at least 90% completion without clarification, zero false passes and zero leaks. The ADR-SC-007 release gate is a prerequisite, not a replacement. A new skill needs evidence on held-out tasks.

## 2. Fix runtime semantics and capability alignment

Primary areas: `studio-runner/src/run/targetAction.ts`, `pageStateInPage.ts`, `observationFlow.ts`, `actionBudget.ts`; backend `GuidedGates`, prompt and relevant schemas.

Implement bounded retrying evaluation for text/value/URL/title conditions. Prefer a pinned native assertion implementation if it fits the runner boundary; otherwise implement a small trusted poller and compare its behavior against native assertions in browser conformance tests. The runner currently depends on `playwright`, not `@playwright/test`, so importing `expect` is a deliberate dependency/design choice.

Preserve the same target, authored expected value, cancellation, origin/identity checks and remaining deadline on each probe. Poll observations/conditions only; never repeat a side-effecting click or fill. Distinguish assertion timeout from target drift and unknown action outcome. Reconcile the learning G2 gate with pending UI values through bounded refresh and renewed validation; retain its wrong-target protection.

For selection, align the prompt and admission rules with the native-select executor. Make native selection capability observable without exposing raw HTML. Treat custom dropdown support as a separately specified bounded workflow if required; do not broaden actions opportunistically.

Acceptance: delayed-correct conditions pass within budget; permanently wrong conditions fail; wrong targets do not pass; cancellation terminates probes; existing at-most-once and secret tests remain green. Native/custom controls produce truthful supported/unsupported outcomes.

## 3. Replace the monolithic instruction with a small internal guidance package

Primary areas: `guided-output-contract.md`, `GuidedPromptAssembler`, `schemaProvenance`, `GuidedModelProjection`, request examples and prompt tests.

Proposed assembly:

```text
shared invariants
+ instructions for SOURCE_PLAN / NEXT_ACTION / VERIFY_STEP
+ at most the relevant operation recipe(s)
+ bounded task context
+ current focused observation when needed
+ current request-kind schema
```

Keep the shared core short: obey the authored checklist, preserve source provenance, use current refs, return the schema, preserve expected outcomes, clarify genuine ambiguity, refuse unsupported work. Put source-span and producer/consumer rules in SOURCE_PLAN; current-target and operation rules in NEXT_ACTION. Keep 1–2 compact examples per difficult operation in the selected module, not a universal examples catalog.

The internal guidance package should record its source URLs, reviewed Playwright version and module hashes. Extend existing output-contract provenance rather than create unrelated version tracking. Generate synthetic final-request examples from the actual assembler, replacing the stale October 21 example.

Do not introduce a model-driven skill-search round trip for this small closed operation vocabulary. Do not insert general CLI usage, fixtures, imports, network mocking, arbitrary execution or skipped-test repair into production prompts.

Acceptance: contract fixtures validate; literal spans and bindings are preserved; measured request sizes fall; held-out quality is at least maintained. Measure the change in total provider tokens; the static instruction is only one part of each request, so no total-token percentage is justified in advance.

## 4. Improve page-context projection, then consider bounded expansion

Primary areas: `perceive.ts`, `GuidedObservationFocus`, `GuidedPromptAssembler`, and observation-refresh protocol if expanded.

First fix deterministic priority within the existing budget. Prioritize the active target and containing region, preserve all plausible competing targets, row/column headers and necessary options, then spend remaining space on general orientation. Avoid document-order truncation crowding out known relevant candidates. Keep full sanitized facts authoritative in the runner/backend; only the model projection becomes smaller.

NEXT_ACTION can receive the active step, its pending obligations, dependent sources/bindings and relevant clarification state. SOURCE_PLAN retains the source scope it actually needs, including retained prefix meanings for incremental planning. Do not use an LLM summary as the sole source of exact literals, references or ledger state.

If missing-evidence failures remain material, add a bounded observation-expansion request over the same sanitized data, with an explicit scope and maximum number of expansions. It must preserve all ambiguity candidates, issue fresh refs and invalidate stale ones. A model cannot ask this facility to expose withheld values or invent navigation. Evaluate this separately because extra calls may offset the smaller initial context.

Acceptance: measured target recall and ambiguity detection do not degrade; adversarial page text remains data; no private values enter prompts; long-page cases retain their targets; total session tokens and p95 latency improve or an explicit quality/latency tradeoff is demonstrated.

## 5. Evaluate guidance, context and model changes independently

Use paired tasks and repeated runs on held-out sites/fixtures. Suggested comparisons:

| Variant | Purpose |
|---|---|
| Current baseline | Establish exact-build behavior |
| Runtime fixes only | Separate deterministic improvements from prompt effects |
| Runtime fixes + kind-specific prompts | Measure instruction specialization |
| Above + selective recipes | Measure whether skill-derived guidance adds value |
| Above + focused context | Measure retrieval/projection benefit and information loss |

Compare output budgets by request kind: a large SOURCE_PLAN can need more than a tiny NEXT_ACTION reply. Keep headroom for provider reasoning usage and monitor truncated/invalid responses; do not lower the global cap just because typical action JSON is small.

Only then test alternate model/effort settings. Preserve deterministic gates and the same task set. Cache stable prompt components if supported and worthwhile; report observed cache hits, not assumed savings. Avoid treating cache discounts as fewer tokens of semantic context.

## Developer tooling

An official Playwright skill can be evaluated separately for engineers generating fixtures and diagnosing browser failures. Pin and review it against the installed Playwright version. This is optional tooling work with no automatic connection to the Vertex prompt. It should not delay the runtime and prompt improvements above.

## Next Steps

Have the architect review assertion/gate semantics and custom-selection scope, then implement phases 1–3 through the normal development workflow. Use QA's existing release and D-C harnesses for acceptance. Proceed to bounded expansion only if baseline evidence shows that missing context remains a leading failure class.
