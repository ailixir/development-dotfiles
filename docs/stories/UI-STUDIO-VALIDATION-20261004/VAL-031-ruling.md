# VAL-031 — text-entry role guessing (benchmark C07) · architect ruling

**Ruling: Option (b), runner-side text-entry role equivalence. Handle it as a STORY (runner-only, small, next in the
validation wave), not as a DO-NOW edit. Don't change the prompt now. Option (c) is the long-term answer and belongs in an
epic. Reject (a) on its own and reject (d).** Author: @architect (Aria), 2026-10-04. Read-only analysis.

## 1. Evidence (verified)
- C07 has 27 judged compiles (`benchmark/results.jsonl`). All 27 FAILED with the same code: `page.getByRole('searchbox').fill('hosting')`
  followed by `.press('Enter')`. There was **no accessible name**. Runner message: `waiting for getByRole('searchbox')`, timeout.
- The fixture page (`scratchpad/bench/pages-server.mjs` `search`) has exactly one text-entry control:
  `<textarea role="combobox" aria-label="Search">`. The gold artifact is `getByRole('combobox', { name: 'Search' })`.
- On the live Wikipedia page (`<input type="search">`) the model's guess `searchbox` was correct and the test PASSED. Earlier,
  `getByPlaceholder`/`getByLabel` hit strict-mode violations there. That is a separate failure class: too many matches, not zero.
- The model has no page access at compile time, so the role is a guess from English. No prompt wording can turn that into knowledge.

## 2. Constraints checked in code
| Constraint | Where | Consequence |
|---|---|---|
| The validator only checks `role ∈ PERMITTED_ROLES`. It has no role mapping or equivalence | `studio-runner/src/validator/language.ts:53`, `arguments.ts:505` | Option (b) needs **no validator change**, so `VALIDATOR_SCHEMA_VERSION` stays 2.0.0 (compared `exact`) |
| The operation shape carries `{kind:'getByRole', role, options}` as data. There's no source text | `executor/operations.ts` | (b) needs **no operation/protocol change**. The child protocol is untouched |
| A locator is built in `applySegment`. `locate()` doesn't see the operation | `run/playwrightAdapter.ts:425-460, 562-571` | (b) belongs in the adapter's `fill`/`press`, using the stored chain |
| `executor` is compared with `backwardCompatibleMinor`; `syntaxReference`/`validatorSchema`/`playwright` are compared `exact` | `compat/compatibility.ts:60-65` | Executor 2.0.0 → **2.1.0** is compatible. Revisions recorded at 2.0.0 keep running |
| The backend only *records* `executorVersion`, but it is a **fingerprint input** | `RuntimePinProperties.java:38`, `CompilePipeline.java:504` | Raising the backend pin recompiles every test once (FULL / FINGERPRINT_CHANGE). Batch it, see §5 |
| Playwright 1.63.0 has `Locator.or()`. `LocatorLike` doesn't expose it | `package.json`, `playwrightAdapter.ts:83` | `count()` is needed as well. The structural interface gains two methods, and nothing is visible outside the runner |
| Observed context can't be minted. Only `supplied` evidence exists, and there's no capture endpoint | `AuthoringEvidenceReference.java:12`, `openapi.yaml:82-88, 1998` | (c) is a new trusted capture boundary, which is Class C |

## 3. Options
**(a) Prompt guidance (rule 7 variant): REJECT on its own.** It still makes the model pick one role, and C07 shows every model
picks `searchbox`. The benchmark measured rule 7 at 23/27 vs 22/27 without it, which is noise, and the report flags it as a role-guessing risk. It costs
PROMPT_VERSION 2.4.0, which means one recompile per test, for no expected gain. Once (b) exists, a role guess within the
text-entry class becomes harmless. Rule 7 can then be reworded ("any text-entry role + accessible name") and land at the
next prompt bump, per the VAL-014 trigger.

**(b) Runner-side text-entry equivalence: ADOPT.** The equivalence is deterministic, invisible to the prompt, and costs no recompile.
It fixes C07 and the whole textbox/searchbox/combobox confusion class. Details in §4.

**(c) Authoring-context page capture: CORRECT LONG-TERM, epic-sized, NOT NOW.** `ContextPromptSection` (a 32 KiB cap, untrusted fence)
can *carry* a snapshot. `TargetHint{strategy: role}` already exists as a non-authoritative hint. But nothing *captures* a page.
`InferenceCaptureStore` persists inference requests and responses in `ui_test_revisions`, not pages. Missing: a runner capture route
(Class C, ADR-002 §12), per-step page state for authenticated/multi-step flows (the openapi "Learn" note), an egress policy for the
capture browser, secret handling and PII retention for snapshots, the 32 KiB budget vs real ARIA trees, and a minting rule for
`observed` provenance. That is a Spec Pipeline item, scored COMPLEX. (b) remains useful even after (c) lands, because pages drift between capture and run.

**(d) Do nothing / refusal: REJECT.** The model doesn't know the step is ambiguous, so it compiles with confidence. CLARIFICATION never
fires. The author gets a 30 s timeout on a reviewed, confirmed test. That isn't production-ready for the most common authoring step
("type X in the search field").

## 4. Option (b) design: what @dev builds
**Component:** `studio-runner` trusted adapter. **Files:** `src/run/playwrightAdapter.ts` (add `count()`/`or()` to `LocatorLike`, keep the
chain on the handle, add a resolver used by `fill`/`press`); `src/versions.ts` (`EXECUTOR_VERSION = '2.1.0'`); regenerated
`write-runtime-versions.mjs` output and the 2.0.0 literals in `test/helpers/harness.ts`, `compat`, `pins`, `runtime-versions` tests;
`README.md` and the operation-semantics section of `docs/architecture/studio-execution.md`.

Rules. Each one is a test.
1. **Scope.** Only `fill` and `press`. Only when the chain's **terminal** segment is `getByRole` with role ∈ `TEXT_ENTRY = {textbox,
   searchbox, combobox}`. Only when its options are a subset of `{name, exact, disabled}`; any `checked/expanded/selected/pressed/level`
   disables the rule. `click`, `hover`, `check`, the assertions and parent segments are unchanged.
2. **Exact first, so existing confirmed tests can't regress.** If the authored role matches ≥1 element, use it exactly as today,
   strict mode included. The equivalence is only considered while the authored role matches **0**.
3. **Settle window.** Fall back only after the authored role has matched 0 for `min(2 000 ms, timeout/4)`. A late-rendering exact
   match therefore still wins. The fallback costs at most 2 s, and only on steps that would otherwise have timed out.
4. **Union must be exactly one.** `alternates = the other two TEXT_ENTRY roles, each built with the same name/exact/disabled options,
   joined with .or()`. If `count()` is 1, run the action on it with the remaining timeout. If it is >1, FAIL with a fixed message: "no
   `<role>` matched; N other text-entry controls did — refusing to choose". Never use `.first()`. If it stays 0 until the deadline,
   FAIL with today's VAL-028 timeout message.
5. **Nameless roles are allowed (C07 has no name). The unique-match rule (4) is the safety.** A page with one text-entry control has
   only one place "the search field" can be.
6. **Ordering.** `guard()` and `requireSecretOrigin()` still run **before** any resolution. A secret is never typed into a control
   that the equivalence picked on a disallowed origin.
7. **Messages.** Fixed text that names roles only and never quotes page content. They go through the existing redactor and length cap.
8. **Disclosure.** Each time the equivalence is used, the child logs one bounded line, `text-entry-equivalence: authored=<r> resolved=<r'>
   step=<i>`, through `outputRelay`. That channel is operator-visible and adds no contract field.

**"What runs is what was reviewed".** This is preserved, with a stated boundary. The reviewer approved English plus `getByRole('searchbox')`.
Executor 2.1.0 defines, as a versioned and documented semantic, that a text-entry role in a `fill`/`press` target means "the text-entry
control with that accessible name". Determinism comes from exact-first plus a unique match. Rule 2 means no artifact that passes today
changes behaviour. Only runs that would have timed out change, and they change to a single unambiguous target or to an explicit refusal. That
is a deterministic, versioned semantic. It isn't a silent reinterpretation (`studio-execution.md` l.136). **The remaining gap is
transparency to the author:** the step report doesn't say that `combobox` was used. Showing it per step requires a new field on a
runner-produced body, which is **ADR-002 Class B**. That's a separate follow-up and is optional. It is not needed for (b).

## 5. Contract and version class, and recompile impact
- Validator schema 2.0.0: unchanged. Syntax reference 2.1.0: unchanged, so there's **no RUNTIME_INCOMPATIBLE**. PROMPT_VERSION: unchanged.
- **Executor 2.0.0 → 2.1.0, a minor bump.** Revisions recorded at 2.0.0 run on 2.1.0 (`backwardCompatibleMinor`). Executions record 2.1.0.
- ADR-002: **no amendment**. The operation, protocol and report bodies don't change. The §4 disclosure field, if wanted later, is Class B.
- **Deploy order: runner first, backend pin second.** If backend `STUDIO_RUNTIME_EXECUTOR_VERSION=2.1.0` reaches a 2.0.0 runner, the result is a
  downgrade, and the runner returns `RUNTIME_INCOMPATIBLE`.
- **Recompile cost: zero if batched.** The backend pin feeds the fingerprint, so bumping it alone means one FULL recompile per test. Raise it in
  the same release as the benchmark's recommended `thinking-level: LOW`, which already recompiles every test once. Until then, keep the backend
  pin at 2.0.0. That's honest, because executions record the 2.1.0 they actually ran on.

## 6. Tests
- **Unit** (`test/run/adapter.test.ts`, fake `LocatorLike`): exact match used and alternates never counted; exact 0 + one alternate →
  action on the alternate + log line; exact 0 + two alternates → FAIL with the fixed message, nothing typed; exact appears inside the
  settle window → exact wins; `expanded`/`checked` present, `click`/`hover`/assertions, non-terminal segment → no fallback;
  secret-origin refusal precedes resolution; message contains no page text.
- **Fixture tier** (`test/fixtures-tier/`, real Chromium, new pages in `fixtures/pages/`): Google-like `textarea[role=combobox]` →
  `getByRole('searchbox')` and `getByRole('textbox',{name:'Search'})` PASS; Wikipedia-like `input[type=search]` → exact `searchbox`
  unaffected; two text inputs + nameless `searchbox` → FAIL with refusal.
- **Compat:** `test/compat.test.ts`: recorded 2.0.0 is accepted on 2.1.0, and recorded 2.1.0 is refused on 2.0.0.
- **Acceptance:** rerun the benchmark C07 slice (3 reps, LOW), expecting 3/3 with no prompt change. Rerun the oracle self-test (expect 8/8 and 5/5).
  The C07 mutant (`getByLabel('Search')`) must still be judged wrong.

## 7. Risks
| Risk | Severity | Mitigation |
|---|---|---|
| Nameless fallback types into the only visible text control when the intended one is hidden or not yet rendered | MED | Settle window, unique-match rule, operator log line. Assertions on the next step catch a wrong target. Class B disclosure as follow-up |
| `combobox` also matches `<select>`, and `fill` on a select throws | LOW | Fails loudly with the VAL-028 fill message. It never selects silently |
| Slower failing steps (+≤2 s) | LOW | Only on steps already headed for timeout |
| Strict-mode over-matching (Wikipedia `getByLabel`/`getByPlaceholder`) is **not** fixed | — | Out of scope here. That's VAL-014 / reworded rule 7 at the next prompt bump, and (c) |
| Equivalence grows into general "fuzzy locators" | MED | The closed set is three roles and two operations. Any widening needs an executor minor bump and an architect ruling |
| Backend pin bumped before the runner | MED | Deploy-order note in the story's Dev Notes. `compat.test.ts` covers the downgrade refusal |

## 8. Handoff
@sm drafts a runner story "Text-entry role equivalence (executor 2.1.0)" with ACs taken from §4 rules 1-8 and §6. @po validates it. @dev implements in
`studio-runner` only. Separately, @pm opens a Spec Pipeline item for (c), authoring-context page capture (COMPLEX). The validation-plan row VAL-031 → "ruled: story".
