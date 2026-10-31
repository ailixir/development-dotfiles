# Assessment

The current architecture is a sound fit for Checks: the model interprets the checklist and selects observed targets; trusted code owns Playwright locators and execution. The strongest next improvements concern semantics, context selection and runtime behavior. A generic Playwright skill cannot substitute for any of those.

This is a review of the working tree, including the recent ADR-SC-007 implementation. It is not a claim that the same code is deployed. Older compiler documents and prompt examples describe materially different behavior.

## Current path

```text
Authored checklist and configuration references
    -> SOURCE_PLAN: typed obligations and source references
    -> current sanitized page outline
    -> NEXT_ACTION: obligation + observed ref + typed operation
    -> backend schema, source, intent and policy gates
    -> runner derives and verifies an exact locator
    -> shared trusted execution and recorded outcome
    -> declarative observed replay artifact
    -> subsequent replay without model calls
```

The model does not write JavaScript, TypeScript, CSS selectors or Playwright expressions. The opening sentence of `backend/src/main/resources/studio/guided-output-contract.md` forbids code. Node targets are `{kind:"node",ref}`. `ObservedArtifactLowerer` creates an operations-and-guards artifact, not a generated `.spec.ts` file. Consequently, generic advice to add TypeScript linting to model output misses the current boundary.

The gateway uses the Google Gen AI Java SDK and Vertex. Repository defaults name `gemini-3.8-flash`, thinking `LOW`; provider defaults to disabled until configured. These are source defaults, not verified deployment settings. Responses use JSON MIME type and a request-kind-specific JSON schema. Function-call and executable-code response parts are refused. No filesystem skill loader, documentation retriever, MCP tool loop or live Playwright-documentation lookup is wired into this model call.

There are three model request kinds: `SOURCE_PLAN`, `NEXT_ACTION`, and optional `VERIFY_STEP`. Model verification defaults off. `GuidedStepVerifier` still deterministically reconciles admitted obligations against successful execution evidence. That establishes completion of the admitted plan, not proof that the model captured every nuance of the original English.

## References actually used

| Reference | Reaches the model? | Purpose |
|---|---|---|
| `backend/src/main/resources/studio/guided-output-contract.md` | Yes, every call | Project-specific planning, source provenance, target selection, clarification and refusal rules |
| v3 schemas under `docs/specs/studio-observed-authoring/contracts/v3/`, packaged for backend use | Response schema, projected by request kind | Closed response shape; repeated schema fragments are already deduplicated |
| `GuidedPromptAssembler.buildPositiveContext` | Yes | All source steps, authoring context, configuration metadata, inputs, obligations, dependencies, clarification selections, current outline and execution metadata |
| `perceive.ts` outline | Yes | Current semantic page evidence and ephemeral refs; not raw HTML or the entire private facts table |
| `locatorSynth.ts` and pinned Playwright engine | No | Generate and verify locators against the actual selected element |
| ADR-SC-007 and local benchmark reports | No automatic injection | Engineering rationale, limitations and evaluation evidence |
| Official Playwright docs or skills | No automatic injection found | External engineering references, not current runtime prompt material |

The runtime is pinned to Playwright **1.63.0**, including a SHA-256 pin for the private core bundle used by perception. The locator grammar prefers test IDs, then roles, labels, placeholders, text, scoping, filters, attributes and finally positional `nth`. Candidates must resolve uniquely to the same observed element. Replay uses public locator APIs and additional identity checks for weaker tiers. These are meaningful quality controls already implemented in code.

This broadly matches Playwright's recommendation to prefer user-facing locators and explicit test contracts, and to ground locator generation in the real page. [Official best practices](https://playwright.dev/docs/best-practices)

## Findings

### 1. Keep the current grounding strategy

The project already has stronger grounding than asking a model to generate Playwright from prose and documentation. It avoids guessed selector APIs and the common confusion between a visually similar searchbox, textbox or combobox. Locators are verified using Playwright semantics rather than a separate handwritten selector interpretation.

The private engine integration has a maintenance cost: an upgrade needs bundle-pin updates and engine/public-API conformance checks. The existing pin and conformance tests make that cost explicit. Installing a skill does not remove it.

Do not blindly replace the executor's bound-element actions with generic locator advice. `targetAction.ts` deliberately binds an element after identity checks for click/hover/check operations to avoid acting on a swapped node. That is a project-specific tradeoff. Preserve it while improving waiting semantics.

### 2. The instruction is broad and repeated

The current instruction file is **15,598 UTF-8 bytes and 2,268 whitespace-delimited words**, measured directly. Those are not tokenizer counts. `GuidedPromptAssembler` sends the same full instruction for all request kinds even though the response schema is already specialized.

For example, every NEXT_ACTION call carries detailed UTF-16 source-span rules, source-plan dependency rules and incremental source-planning rules. These are useful for planning but mostly irrelevant when selecting an observed ref for an already admitted operation.

The assembler also includes every source step, authoring context and configuration references on every call. Existing source context is valuable for dependencies and disambiguation, so indiscriminate truncation is unsafe. The improvement is to project the task-relevant subset deterministically while keeping complete authoritative state server-side.

There are useful short examples in the live contract, but no runtime Playwright reference corpus. Append-only prompt patches risk increasing complexity and conflicting instructions. A core plus kind-specific instructions is a better next experiment.

### 3. Page context is already bounded; its selection can improve

`perceive.ts` renders a sanitized semantic outline capped at **40,000 bytes**. Projection runs only when the full outline exceeds the cap. It keeps landmarks, headings, form controls and lexical matches to step text/target intent, then tries parents and neighbours. It preserves selected option context and marks omitted nodes. Passwords and private values remain withheld.

This is substantially better than injecting raw DOM. However:

- Pages below 40 KB still send the whole outline even if only a small region is relevant.
- When the retained base set is too large, the final fallback takes nodes in document order until the byte budget is exhausted. A relevant target near the bottom can still be omitted behind many earlier controls.
- Lexical matching can miss synonyms, icon-only meaning or relational targets. These are evidence-selection problems, not missing Playwright syntax knowledge.
- Keeping one candidate while dropping a competing candidate can manufacture apparent uniqueness. Any new context reducer must preserve ambiguity and structural scope.

The prompt says to refuse or clarify when evidence is missing. There is no explicit model-facing focused-subtree retrieval operation in the inspected request/response contract. A bounded expansion mechanism would therefore be a deliberate protocol change, not an existing skill feature that can simply be turned on.

Byte caps and model context size are different. Guided translation defaults to **98,304 input bytes**, including its wire estimate; the gateway has a **262,144-byte** limit with an actual wire-size check. Reported model token usage is recorded separately. The guided output default is **4,096 tokens**; the gateway's 32,768 setting is an upper ceiling, not the effective default for these calls.

### 4. Assertion waiting is a concrete runtime quality gap

In `targetAction.ts:341`, `visible` waits for visibility. However, `containsText` waits for visibility, reads `innerText()` once and compares; `hasValue` similarly reads once. `pageStateInPage.ts:161` compares the current URL/title immediately. The replay adapter retries target acquisition when absent, but returns the assertion result once the target is acquired; it does not poll a mismatching value until the assertion deadline.

Practical failure: a visible status element still says “Processing”; it becomes “Completed” shortly afterward. The current text assertion can fail at the first read. This is a code-level reliability issue that additional prompt prose cannot repair. Playwright recommends retrying web assertions precisely for asynchronous UI state. [Official assertions](https://playwright.dev/docs/test-assertions), [Locator API guidance](https://playwright.dev/docs/api/class-locator)

The learning-time G2 gate also rejects `containsText` proposals when the expected authored literal is absent from available target text. It is intended to catch the wrong target, but can reject a correctly identified target before its value settles. A change must address both layers: preserve target-identity checks, distinguish a wrong target from a pending condition, and perform bounded re-observation/waiting against that same target. Do not redirect an assertion to another element merely because it already contains the expected text.

The custom text normalization removes zero-width/soft-hyphen characters as well as collapsing whitespace; URL/title use direct equality. Treat these as explicit product semantics and test them. They should not be described as fully equivalent to native Playwright assertions without conformance evidence.

### 5. Prompt, admission and runtime capabilities disagree on selection

The live prompt describes `selectOption` for dropdowns, menus and lists. `GuidedGates.operationTarget` permits several ARIA roles, including listbox/option/radio variants. But `targetAction.ts` requires the locator to match `select:not([multiple])` before executing `selectOption`.

A custom MUI/ARIA combobox is not necessarily a native select. It usually requires opening the widget and choosing its option. A generic “select” recipe would therefore produce a plan that cannot execute even if the model understands Playwright perfectly.

First align the documented capability with the actual native-select restriction and expose enough safe capability metadata to distinguish widgets. If custom selection is required, implement a bounded semantic selection workflow explicitly. Do not tell the model to substitute a click for an admitted `selectOption`: that violates the existing operation correspondence.

### 6. Reference drift is already visible

`docs/examples/studio-three-step-final-prompts.md` labels itself current as of October 21, but contains the older `{nodeId,locator}` target shape, model-authored `needs`, and target intents such as “Orders link.” The current contract requires refs, derives needs server-side, and asks for bare target labels plus separate scope.

That file is not automatically injected, so it is not a current inference defect. It is an engineering-reference hazard. Generate representative request examples from the real assembler, with synthetic data, and verify them against current schemas rather than maintain a second handwritten contract.

## What the existing measurements establish

[ADR-SC-007](../../architecture/ADR-SC-007-snapshot-ref-grounding.md) records S3 screening results of **83.5% correct-and-executable per-step selection**, versus **20.4% for the older A1 design**, and **59.3% product-admitted success** for S3. Fresh-site results were 78.1% correct-and-executable and 63.2% admitted. Reads and assertions were weak categories. These measures have different denominators and are not interchangeable.

The same document explicitly says no screening stage reached GO, the evidence was post-hoc, used one model and public sites, and did not establish a deployed full-stack pass. Some production fixes were made afterward. Do not present those numbers as the accuracy of the exact current working tree.

The ADR reports roughly 11,500 prompt tokens per S3 screening call, 10,500 on fresh sites. This supports the concern about context size but is not a current production token distribution. Its older session-budget discussion explicitly says it was not re-verified.

The October 4 thinking-level benchmark concerned the earlier compiler. It supports retaining LOW as a starting point, but does not prove LOW is optimal for today's ref-selection contract. Evaluate model/effort changes only after fixing deterministic failures; a more expensive model cannot fix a missing target or a one-shot assertion.

## Feasibility of a Playwright skill

| Approach | Assessment |
|---|---|
| Install official skill for repository development | Useful for maintaining runner code, constructing fixtures and investigating failures; does not automatically change application inference |
| Paste the full official skill into every production call | Poor fit: extra context, CLI commands and capabilities the JSON gateway cannot use |
| Build a compact internal guidance package from official sources | Recommended experiment: kind-specific rules and a few supported-operation examples, selected by the backend |
| Replace the runner with a general CLI/MCP agent | Large architectural change without evidence that it solves the current bottlenecks |

Official skills teach coding agents how to invoke CLI tools and discover optional reference files. This gateway has neither that filesystem discovery nor those tool invocations. A `SKILL.md` is not a new model capability on its own. [Official skills documentation](https://playwright.dev/agent-cli/skills)

Playwright presents CLI plus skills as context-efficient for coding agents, while MCP suits persistent exploratory loops. That does not prove a saving for Checks: selectively retrieving page evidence is the transferable idea. Continuing to inline all existing page context plus a skill would increase the request. [Official coding-agent documentation](https://playwright.dev/docs/getting-started-cli)

The official generator verifies selectors and assertions against a live application. The value comes from that workflow as well as its instructions. The documented healer may produce skipped tests for broken functionality; Checks must not use that as monitoring success. [Official test agents](https://playwright.dev/docs/test-agents)

A suitable internal package should teach intent distinctions the model actually needs: native versus custom selection, action versus assertion, table header versus value cell, producer/consumer bindings, duplicate labels and missing evidence. Keep locator syntax, waiting mechanics, escaping and deadline enforcement in trusted code. Start with deterministic module selection by request kind and operation; an embedding database for a small fixed operation set would add unnecessary complexity.

Caching is a separate optimization. The gateway already records cached-token counts but does not explicitly attach a managed cache. Stable instructions and schemas are candidates for reuse after measuring actual cache hits. Caching can reduce repeated processing, not restore omitted evidence or improve semantics by itself. Google documents implicit and explicit caching with model-specific requirements. [Google context caching](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/context-cache/context-cache-overview)

## Limits of this review

Static implementation findings were traced across prompt, gateway, runner and replay. Existing evaluation reports were read, not rerun. No new model calls, full-stack runs or next-day replay were performed. Exact proposed token savings, quality improvements and delivery duration remain unmeasured. This review adds only research documentation.

## Next Steps

Use [the staged proposal](03-recommendations.md) for architecture review and implementation by the project development workflow. The highest-value first slice is assertion waiting plus capability consistency, followed by a measured prompt split. A broad skill integration should not be the first change.
