# STUDIO-OBS-009 AC-7 — corpus composition draft (T0 prep)

- Author: Quinn (@qa). Date: 2026-10-16. Status: **draft, not execution evidence**. Machine form: `corpus-composition-draft.json` (same folder).
- Allowed by `STUDIO-OBSERVED-NEXT/execute-015-008/claude-feasibility-008-011.md` (W0 row). I read files only. I ran no test, build, Gradle, vitest or model call, and I wrote nothing outside this folder.
- Legend: **[V]** verified by reading a file in this session. **[I]** inferred. Every [I] says what it rests on.

## 1. The AC-7 corpus rule, as written

AC-7 requires at least 20 workflows, each run 3 times with the real model, made of:

| Required block | Count | Source named by the story |
|---|---|---|
| Compile benchmark cases ported | 13 | `docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/` |
| Login | 2 | OBS-007 fixture **and** one approved staging application with real login |
| Multi-step dataflow | 1 | — |
| Incremental (OBS-015) | 2 | edit step 4 of 10; insert a step |
| Enterprise patterns | 4 | SSO on an approved origin, shadow DOM, iframe, virtualised list; "composition fixed by @qa at T0" |
| **Story minimum** | **22** | ≥ 20 |

I add three cases (QA additions, not a rule change): one on-focus helper-text/autocomplete control (PO recommendation, FOCUS-MUTATION-01 e), and two authored-literal cases that AUTHORED-ECHO-01 says are common in checklist tests (a same-name assertion and a same-name select option). **Total: 25 workflows, 75 planned runs.** The two incremental cases need a base (full-learn) session per repetition, so model sessions are **81** [I: from the case files, which describe a base and an edited authoring].

## 2. Class and gate arithmetic (proposal, needs a ruling: see gap G-2)

The story says "≥ 90 % end-to-end completion without clarification on **unambiguous** cases" and does not say what is in the denominator. The 13 ported cases are not all completions: the 2026-10-04 benchmark already contains refusal and intended-failure cases.

Proposal:

| Class | Meaning | Cases | In the 90 % denominator? |
|---|---|---|---|
| P | expected to complete, no clarification | 19 | **yes** |
| F | intended failure; correct outcome is FAILED naming the step | 1 (C08) | no. Any PASSED is a false pass (hard gate) |
| N | expected refusal or clarification | 5 (C09, C10, C11, C12, E3) | no. A published plan or an executed action is a false pass (hard gate) |

Arithmetic [V by computation]:

- 19 P cases × 3 = **57 runs**. 90 % needs **≥ 52 completions** (52/57 = 91.2 %). 51/57 = 89.5 % fails. At most **5 failed runs**.
- If both staging-dependent cases (D2, E1) are unrun: 17 × 3 = 51 runs, ≥ 46 (46/51 = 90.2 %). That is a **partial** result. It cannot be reported as a gate pass, because the story says AC-7's staging half unrun leaves Done unreachable.
- Run-level reporting rule: a run that is infrastructure-failed (host collision, Chromium startup hang) is not credited and is re-run **and reported** ("no unreported retries"). It stays visible in the denominator ledger.

The class of each ported case is **inferred** from `benchmark/summary.json` per-case scores and the response shapes in `results.jsonl` (C09/C10/C11 returned UNSUPPORTED, C12 CLARIFICATION, C08 is described as "intended assertion fail", and phase 1 had 24 positives, 21 expecting a pass, 12 negatives).

## 3. Case table

`E` = exists and I read it. `P` = partial asset. `M` = must be written locally (no external needed to write it). `X` = external.

| Id | Class | Source | Status | Maps to (what I read) | Needs beyond gateway/stack/budget |
|---|---|---|---|---|---|
| C01 rf-example-url | P | ported | M | step text and page `:4102/ns/c01/home` not committed. Near asset: `studio-runner/fixtures/pages/home.html` | — |
| C02 rf-wiki-url | P | ported | M | page not committed | — |
| C03 rf-wiki-search-var | P | ported | M | page not committed. The old URL-only check is a weak oracle | — |
| C04 account-save | P | ported | **E** | `studio-runner/evaluation/fixture-server.mjs` (target 4100, control 4101 with exact account events) and `evaluation/example-manifest.json` `save-target-edit` | — |
| C05 login-var-secret | P | ported | P | overlaps D1. Re-express as `secretRef` (OBS-007), not `vars.secret` | — |
| C06 forms-fill-save | P | ported | P | `studio-runner/fixtures/pages/forms.html` is the likely base; it is static, so a receipts endpoint is missing. Its first sample was a TRANSPORT_FAILURE row | — |
| C07 ambiguous-search-locator | P | ported | M | page not committed. The compile benchmark scored 0/3 under **every** config (searchbox guessed for a combobox) | — |
| C08 intended-assertion-fail | F | ported | M | page not committed | — |
| C09 negation-trap | N | ported | M | text and page not committed | — |
| C10 unsupported-cpu | N | ported | M | text not committed | — |
| C11 unsupported-second-tab | N | ported | P | the sentence "Open a second browser tab and compare its contents with the first tab" is in `evaluation/example-manifest.json` (case `second-page`) | — |
| C12 clarify-click-button | N | ported | P | `forms.html` has 4 toolbar buttons. Original text not committed | — |
| C13 ambiguous-wiki-placeholder | P | ported | M | hidden-twin page not committed | — |
| D1 login-secret-fixture | P | login | **E** | `studio-runner/test/fixtures/secret-login/server.ts` (`/login`, `/home`, `/reports`, `/__receipts`, planted canary) | — |
| D2 login-staging-real | P | login | **X** | none | staging app + approved origins (ED-04), dev Vault secret (ED-02), an app-side oracle |
| D3 dataflow-multistep | P | dataflow | **E** | `studio-runner/test/fixtures/guided-dataflow/server.ts`, mode `mixedVisible`; `/receipt` records what was submitted | — |
| incremental-edit-step-4 | P | incremental | **E** | `studio-runner/evaluation/observed-authoring/cases/incremental-edit-step-4.json` (untracked; `OBS009_CORPUS_INPUT_NOT_EXECUTION_EVIDENCE`) | — |
| incremental-insert-step | P | incremental | **E** | `.../incremental-insert-step.json` (untracked) | — |
| E1 sso-approved-origin | P | enterprise | **X** | none (a loopback two-origin redirect can only rehearse) | approved SSO origin or IdP test tenant, test identity |
| E2 shadow-dom-open | P | enterprise | M | mechanism proven: `observationCollector.ts:146-160` traverses open roots; `observed-authoring-snapshot.test.ts:318`. No benchmark page | — |
| E3 iframe | N | enterprise | M | `observationCollector.ts:317-319` marks `iframe` as an unsupported surface [I that a target inside a frame is refused]. See G-3 | PO/architect ruling on expected outcome |
| E4 virtualised-list | P | enterprise | M | none. Coverage can report `truncated` (node cap 500, depth 8) | — |
| Q1 focus-time-helper-autocomplete | P | QA addition | M | model on `STUDIO-OBS-015/execution-20261015/backend/w3-d5-diagnosis01/probe/probe.mjs` | — |
| Q2 authored-echo-assert-same-name | P | QA addition | **E** | secret-login `/home` link "Reports" then `/reports` `<h1>Reports</h1>` | — |
| Q3 authored-echo-select-option | P | QA addition | P | `forms.html` Currency select (EUR/GBP/USD): use "Select GBP from Currency", or write a City/London page | — |

Counts [V from the JSON]: 25 cases (19 P, 1 F, 5 N). **Two** need an external application (D2, E1). 23 are buildable here. Fifteen need new pages or step text written, at least in part (C01, C02, C03, C06, C07, C08, C09, C10, C12, C13, E2, E3, E4, Q1, and Q3 if the City page route is taken); C06, C12 and Q3 have a partial base asset, and C05 and C11 have partial assets that need re-expression. The JSON `externalsSummary.casesRequiringNewPagesOrStepText` lists the same fifteen.

## 4. What still needs the external staging application (and other externals)

| Need | Cases | Owner (from the story / feasibility doc) | If absent |
|---|---|---|---|
| Approved staging application with real login, approved origins, a provisioned test secret | D2 | user / app owner / Platform-SRE (ED-04), dev Vault (ED-02) | AC-7(b) "unrun, owner X" |
| Approved SSO origin or IdP tenant, identity, secret | E1 | same | "unrun, owner X" |
| ED-01 gateway owner and access | **all 25** | user → GA plan D-3 (TBD) | AC-7, AC-8 unrun |
| Deployed stack with an internal runner image | **all 25** | Platform/SRE (ED-05) + @devops | unrun |
| Budget admission before the first provider call | **all 25** | user (U7) | no run may start |
| Human reviewer for the C-17 masked-video inspection (AC-10, not AC-7) | login runs | user | AC-10 unrun |

A local loopback stand-in for D2/E1 is a **rehearsal of the page handling only**. It must not be labelled staging evidence, and it must not enter the staging denominator.

## 5. RS-1 manifest requirement (AC-7 obligation a–d)

The manifest must record, per case, whether a value the workflow must read lives only in a non-scalar element that no governed grant reaches. Fixture pages must **not** be edited to avoid it.

- D3, incremental-edit-step-4 and incremental-insert-step read a business value from a source page. In `guided-dataflow/server.ts`: `mixedVisible` and `regionVisible` put the value in `<output>` / a labelled region (reachable); `exact` puts it in `<div data-testid="source">` (**an RS-1 shape**) [V by reading the server; I that OBS-014's governed grants reach `<output>` and not `<div>`, per the story's own list "OUTPUT, DD, TD, role=status and the allowed field types"].
- The two incremental JSON files name the server but **not the mode** (gap G-6). The manifest must state the mode per case, and choosing `mixedVisible` is a declared fixture choice, not a page edit.
- Decision for the PO: do we add one honest RS-1 case in `exact` mode so that F03 can be decided on evidence? The cost is that, under my class-P denominator, its 3 runs count toward the 90 % gate (3 of 57 runs = 5.3 %, so the 5-failure allowance is spent on it first). I recommend **not** adding it by default and writing RS-1 = 0 only if the manifest review of the real staging pages finds none. This is a recommendation, not a ruling.
- Unknown until T4: whether the 13 ported pages and the staging pages contain RS-1 shapes. I cannot determine this because the ported pages are not in the repository.

## 6. Inputs for the other T4 accounting fields

| Field | Cases most exposed | Local carrier |
|---|---|---|
| `authoredEchoUnobservableTargets` | Q2, Q3, C03 (variable echoed into a label?), D3 | fixture-tier negative/positive cases in the 009 AC-7 text |
| `focusMutationRefusedFills` | Q1, D2, E1 (design-system pages), E4 | `observationCollectorInvoke.test.ts` + real Chromium |
| `rs1NonScalarReadGaps` | D3, incremental-* | the manifest field above |

## 7. Gaps in the story text for this block

See `local-test-matrix.md` §"Gaps in the story text" for the consolidated list. The ones that change this corpus: G-1 (ported sources absent), G-2 (denominator and class handling), G-3 (iframe expectation), G-6 (fixture mode).
