# SPK-07 grounding benchmark: shared interfaces

This contract is for the parallel workstreams. Each workstream owns only the files listed for it. The plan is in `/Users/brunobuger/.claude/plans/polymorphic-whistling-thacker.md`. Every output is **screening evidence, not ADR-SC-005 D-C evidence**.

## Runtime rules (all workstreams)
- Use Node `~/.local/share/fnm/node-versions/v24.20.0/installation/bin/node`, run from `studio-runner/`. The PATH node (23) is too old.
- Get Playwright with `createRequire(new URL('../../package.json', import.meta.url))('playwright')`, adjusting the relative path to the file's depth. Use the production collector from `studio-runner/dist/run/observationCollector.js`. Do not edit `studio-runner/src`, `dist` or any existing file outside your own list.
- Don't touch the shared dev stack (:8080/:8090/:5181) or git, and run no Gradle except with the isolated recipe in workstream D.
- **Model:** `POST https://aiplatform.googleapis.com/v1/projects/epicagentai/locations/global/publishers/google/models/gemini-3.8-flash:generateContent`, bearer token from `gcloud auth application-default print-access-token`.
  - Never print, log or write the token.
  - Copy the request shape exactly from `GenAiGuidedLlmGatewayClient.java:298-332`: `contents[0].parts[0].text` = JSON `{kind, requestId, attempt, context}`, `systemInstruction` = the contract text, `generationConfig` = `{maxOutputTokens:4096, responseMimeType:'application/json', responseJsonSchema, thinkingConfig:{thinkingLevel:'LOW'}}`, and no temperature.
- **Identity:** an element is identified by its CDP `backendNodeId` only. Use `lib/cdp.mjs` (`session`, `isolatedWorld`, `evaluateHandle`, `call`, `backendNodeId`, `locatorIds`). Never mark the DOM; no `data-bench-*` attributes.
- **Playwright engine in our isolated world:** `lib/pwEngine.mjs`.
  - `engineExpression()` evaluates in a CDP isolated world to Playwright's own `InjectedScript`.
  - Its methods include `parseSelector`, `querySelector`, `querySelectorAll`, `generateSelectorSimple`, `ariaSnapshot(root, {mode:'ai'})`, and `aria-ref=eN` selectors resolve against its last snapshot.
  - `hintSelector(hint)` turns today's hint kinds into internal selectors.
  - F1 proved this matches public Playwright locators exactly (`runs/f1-*/summary.json`).

## Task file — `corpus/tasks.jsonl` (owner: workstream C)
One JSON object per line:
```json
{ "id": "govuk-menu-01", "site": "gov.uk", "url": "https://www.gov.uk/", "stratum": "menuNameDiffers",
  "heldOut": false, "expect": "ACTION",
  "setup": [ { "op": "click", "gt": { "chain": [ { "m": "getByRole", "a": ["button", { "name": "Reject additional cookies", "exact": true }] } ] } } ],
  "steps": [ { "text": "Click the \"Menu\" button", "operation": { "kind": "click" },
               "gt": { "chain": [ { "m": "getByRole", "a": ["button", { "name": "Show navigation menu", "exact": true }] } ] } } ],
  "notes": "accessible name differs from visible text" }
```
- **`stratum`** is one of `uniqueNav`, `menuNameDiffers`, `labeledField`, `visualOnlyField`, `duplicateNeedsContext`, `iconOnly`, `selectCheck`, `readTarget`, `assertTarget`, `random`, `negative`, `chain`, `fixtureRegression`.
- **`operation.kind`** is one of `click`, `fill`, `selectOption`, `check`, `uncheck`, `press`, `read`, `assert`. A `fill` value comes from the quoted literal in the step text. For `assert`, `predicate` is `visible`, `containsText` or `hasValue`.
- **`expect`** is `ACTION`, or `CLARIFICATION`/`UNSUPPORTED` for negatives. For negatives, `gt` is `null`.
- **`gt.chain`** applies Playwright page API calls in order, starting from `page` (`getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`, `getByTestId`, `locator`, `filter`, `nth`, `first`, `last`). It must resolve to exactly one element at run time; otherwise the task is **VOID** for that load.
- **Chains:** `steps.length > 1`, and each later step's GT is resolved after the previous step was performed by the GT locator, never by the model.
- **Freeze:** `corpus/freeze.json` holds `{ sha256, frozenAt, counts }` over the bytes of `tasks.jsonl`.

## Arm modules — `lib/arms/<arm>.mjs` (A0, A1, S1, S2: workstream A; S3, S4: workstream B)
Each exports:
```js
export const id = 'S3';
// Called once per page load, on the same live page, for each task step. Must not change the DOM.
export async function observe({ page, cdp, task, step }) => ({
  payload,          // what goes into context.observation (object), or an outline string for S1+
  images,           // optional [{ mimeType, base64 }]  (S4 only)
  idMap,            // { [nodeIdOrRef]: backendNodeId }  for every element the model may name
  meta: { bytes, nodes, ms, admittedUnderProductionLimits: true|false, gatewayInputAdmitted: true|false, emptied: true|false }
});
// Builds the full Vertex body for kind 'NEXT_ACTION' given the obligation(s) from SOURCE_PLAN.
export function buildRequest({ task, step, obligations, observed, attempt, repairCodes }) => vertexBody;
// Interprets the model reply. pickedBackendNodeId is null when no element was named.
export async function interpret({ page, cdp, reply, observed, task, step }) => ({
  status,           // 'ACTION' | 'CLARIFICATION' | 'COMPLETE' | 'UNSUPPORTED' | 'INVALID'
  pickedId, pickedBackendNodeId,
  locator,          // the durable locator this arm would freeze (object), or null
  locatorTier,      // e.g. 'testId' | 'role' | 'label' | 'placeholder' | 'text' | 'scoped' | 'filterHas' | 'attribute' | 'nth'
  executable,       // A/S1: production matches() accepted it; S2..S4: Playwright-engine verified count==1 && same element
  gateCodes: []     // harness-side gate results (S3 intent gate etc.); Java verdicts come from workstream D
});
```
Workstream A owns `lib/requests.mjs`: the shared SOURCE_PLAN builder, the `sourceReferences` port, and the NEXT_ACTION context builder from the captured template.

## Model client — `lib/vertex.mjs` (owner: workstream A)
`send(body, { label, maxPromptTokens })` resolves to `{ status, reply /* parsed JSON or null */, rawText, usage: { prompt, out, thoughts, total }, modelVersion, ms, error }`.
- Appends one record per call to `runs/<runId>/calls.jsonl`. The record includes `usage` and `modelVersion`, but not the request body.
- Bodies go to `runs/<runId>/bodies/` only when `SPK07_KEEP_BODIES=1`.
- Enforces a hard cap of `SPK07_MAX_CALLS` and `SPK07_MAX_PROMPT_TOKENS_TOTAL`.
- Retries only definite-transient errors (429, 503, connection) twice with backoff, matching the product.

## Java scoring — `runs/<runId>/scoring-input.jsonl` → `scoring-output.jsonl` (owner: workstream D)
- Input line: `{ "key": "<taskId>|<stepIdx>|<arm>|<rep>|<attempt>", "kind": "SOURCE_PLAN"|"NEXT_ACTION", "context": {...exact context sent...}, "reply": {...model JSON...} }`.
- Output line: `{ "key", "verdict": "ADMITTED"|"REFUSED", "code": "<refusal code or null>", "stage": "admitPlan|materializeAction|action|actionGuard" }`.
- Runs only from the env-gated test with `SPK07_SCORING_INPUT` and `SPK07_SCORING_OUTPUT` set. Only arms A1, S1 and S2 use today's contract, so only they are scored this way. S3 and S4 use the pre-registered harness gate.

## Pre-registered S3/S4 rules (workstream B implements, workstream E records verbatim)
- **Intent gate** (replaces the today's-contract `targetIntent` equality at `GuidedProposalValidator.java:472-483`):
  - `norm(s)` = NFKC, lowercase, collapse whitespace, strip leading and trailing punctuation.
  - `words(s)` = `norm(s)` split on non-letters and non-digits, keeping tokens of 2 or more characters.
  - For the picked element, build an evidence string from its accessible name, its `placeholder`, its near-label text (the outline's `near=`), and its own visible text, capped at 256 characters.
  - The gate **passes** if `norm(targetIntent) === norm(name)`, or if `words(targetIntent)` ⊆ `words(evidence)`. Otherwise it fails with `INTENT_MISMATCH`.
  - An empty `targetIntent` fails with `INTENT_MISSING`.
  - Pre-freeze addendum, 2026-10-26: if `words(targetIntent)` is empty (e.g. a 1-character intent), the gate passes only by exact name equality. Otherwise it fails with `INTENT_MISMATCH`.
- **Focus budget:** if the rendered outline is more than 40,000 bytes (about 12k tokens), the deterministic step-focused projection is applied. It always keeps landmarks, headings, all form controls, nodes whose words overlap the step text or `targetIntent`, and each kept node's parent and immediate siblings. It ends with a `… N more nodes not shown` line.
- **Admission:** a payload is "admitted under planned limits" when the observation is 40,000 bytes or less and the full request body is 262,144 bytes or less, which is the gateway input cap.
- **Pre-freeze addendum, 2026-10-26.** Today's translation cap is `wireBytes + 2048 ≤ 65536` (`translation.maxInputBytes`). Arms A0–S2 also report it as `meta.translationInputAdmitted`, and it counts toward their production-limit admission. For S3/S4 it is reported only, together with the largest S3 wire size. See the pre-registration addendum.

## Pre-registration — `docs/qa/spikes/SPK-07/preregistration.md` (owner: workstream E)
It is frozen before any S-arm model call. It contains:
- the primary comparison;
- the hard zeros;
- the stage gates, as in the plan;
- the exact S3/S4 intent-gate definition.

## Post-hoc addendum: S3 v2 (pre-registration §14, entries 15–17)
These rules apply to runs after 2026-10-27T00:10Z. Every result under them is labeled post-hoc. The wave-1 rules above remain the record for `runs/final-20261026`.
- **Withheld value:** a ref-bearing node whose name, placeholder or text matches a private value is rendered as `role [ref] {value withheld}`. It carries no text, no url and no box. It stays targetable. Before this, it was dropped.
- **URL echo:** a URL-only match keeps the node and omits its url.
- **Evidence (intent gate):** besides the name, placeholder, `near=` and own text, the evidence for `cell`/`gridcell` includes its rowheader and columnheader names. For `radio`/`checkbox`/`option`/`menuitemradio`/`menuitemcheckbox` it includes the enclosing radiogroup, group, listbox or menu name. The 256-character cap is unchanged.
- **Focus projection:** a kept `combobox`/`listbox` keeps up to 60 `option` children, followed by a `… N more options` line.
- **Operation vs target gate:** the gate code is `OPERATION_TARGET_MISMATCH`.
  - `fill` needs a textbox, searchbox, editable combobox, spinbutton or editable root.
  - `selectOption` needs a combobox, listbox, option, radio or menuitemradio.
  - `check` and `uncheck` need a checkbox, radio, switch, menuitemcheckbox or menuitemradio.
  - Any other target for those operations is refused. click, press, read and assert are unrestricted.
- **Corpus wave 2:** tasks with `wave: 2` and `heldOut: true` are on 4 fresh sites. The report's `freshSitesOnly` sensitivity and `report-s3v2-fresh.md` cover them.
