# ADR-SC-007 — Guided learning grounds model actions on Playwright snapshot refs (SPK-07 design S3)

| Field | Value |
|---|---|
| Status | **Accepted by orchestrator ruling** (2026-10-27), recorded by @architect. This is a judgment on **screening evidence**, not ADR-SC-005 D-C evidence, and it is not a user decision. Adoption is confirmed or reversed by the release gate below; ADR-SC-005 D-C still applies in full |
| Date | 2026-10-27 |
| Scope | How a guided session observes a live page, how the model names a target, which gates admit the reply, and how the locator is frozen and replayed. Runner `studio-runner/src/{run,guided,executor,validator}`, backend `com.citi.put.checks.studio.guided.{translation,publication,session}`, `docs/specs/studio-observed-authoring/contracts/v3`, frontend only for failure copy |
| Amends | [ADR-SC-004](ADR-SC-004-observed-authoring.md) (Decision ¶2: "binds one unique current node to the proposed durable locator"); [ADR-SC-005](ADR-SC-005-single-path-observed-authoring.md) (D-A observation shape and "bounded DOM neighbourhood"; the P1 `targetIntent` grounding control). Details under "Amends" |
| Preserves | ADR-SC-005 D-A privacy (semantic nodes only, never raw HTML, passwords and field values withheld, private inventory kept), D-B, D-C, D-D; ADR-SC-004 INPUT-POLICY-01; `GuidedActionGuard`; at-most-once dispatch; model-free replay; ADR-SC-006 (ARIA here is a grounding mechanism, not accessibility work) |
| Decision source | SPK-07 ([pre-registration](../qa/spikes/SPK-07/preregistration.md), [report-s3v2](../qa/spikes/SPK-07/report-s3v2.md), [report-s3v2-fresh](../qa/spikes/SPK-07/report-s3v2-fresh.md), [F1](../qa/spikes/SPK-07/f1-conformance.md)); orchestrator ruling 2026-10-27; pre-registration §13 ("ADR-SC-007 must rule on items 1, 2 and 4") |

## Context

The alpha real-site E2E of 2026-10-26 learned **0 of 6** sites (Wikipedia, GOV.UK, Hacker News, Python docs, MDN, GitHub). Three production defects explain it:

1. **Observation budget empties the page.** Any overrun of 500 nodes / depth 8 / 32,768 bytes / 50 ms sets `budget=true` and returns `nodes=[]` (`observationCollector.ts:344,580-591,613,628-630`). The backend then refuses with `UNSUPPORTED_SURFACE` (`GuidedTranslationService` ~`:2680-2692`).
2. **Rule R4 in the runner's own resolver.** `matches()`/`acquire()` (`:697-714`, `:667-696`) reject every `role=button` hint when any visible button has an unresolvable or ambiguous name (`unresolvedRole`, set ~`:486`).
3. **Capture refused as `MISSING_SOURCE`.** `read` obligations are admitted only when `hasNeed && !hasReference` (`GuidedProposalValidator.java:96-98`), and every need must have a consumer and a read (`GuidedDependencyPlanner:21-45`).

Today's design (arm A1 in SPK-07) therefore has the model copy a `{nodeId, locator}` pair out of a hint table that the runner's own resolver produced, and the runner then dispatches through that same resolver, not through Playwright locators. SPK-07 priced four alternatives against it on real public sites, before any product code changed (see Evidence).

## Decision

Adopt **S3** in production: the model names a ref in a sanitized Playwright AI-snapshot outline; the runner derives, verifies and freezes a durable Playwright locator; a set of gates admits every reply before it runs. S3 is adopted as the **best-evidenced design**, not as a proven one: no SPK-07 stage reached GO (see Evidence), and the release gate decides whether the adoption stands.

### D1 — Observation: AI snapshot, sanitized in the runner, focus-projected

- The runner observes with Playwright's AI aria snapshot (`ariaSnapshotJSON({mode:'ai'})`, refs `eN`), taken in the runner's CDP isolated world, and renders one outline line per node: `- role "name" [ref] {states} {placeholder} {url} {near} {in}`. Boxes are used locally (to compute `near`/`in`) and are never sent.
- **ADR-SC-005 D-A still holds.** Semantic nodes only, never raw HTML; password, hidden, `autocomplete=password`, `data-sensitive`, contenteditable and script/style content withheld; current control values never rendered; password controls appear only as `passwordControl` lines with no ref; a node whose name, placeholder or text matches a private value stays targetable as `{value withheld}` with no text, url or box; the **private inventory is kept** (the collector's `privateValues`/`inventoryValue`/`snapshotField`, caps 4,096 entries and 1 MB, `PRIVATE_INVENTORY_LIMIT`) and moves to its own module. Matching is NFKC, case-insensitive, substring, 12-character windows, and whole-token for values of one or two characters, as in the spike (stricter than production's case-sensitive match).
- **Focus projection replaces the emptying budget.** The outline is capped at **40,000 bytes**. Above the cap a deterministic projection keeps landmarks, headings, all form controls (buttons included), nodes whose words overlap the step text **and the obligation's `targetIntent`**, each kept node's parent and neighbours, and up to 60 options of a kept combobox/listbox, and ends with `… N more nodes not shown`. A budget overrun can no longer produce an empty observation. A wall-clock deadline on collection fails the observation explicitly (`UNSUPPORTED_SURFACE`); it never sends an emptied page to the model. The deadline value is set in WI-4 from measured collection times (S3 median 82 ms, p95 866 ms over the full run); it is not decided here.
- **Request limits.** Gateway input cap stays 262,144 bytes. `studio.guided-authoring.translation.max-input-bytes` rises from 65,536 to **98,304** [AUTO-DECISION: the largest S3 translation input seen was 67,876 bytes and 3 of 251 observations exceeded 65,536; 98,304 leaves about 45% headroom and is inside the existing validation bound of 131,072].

### D2 — Reply contract: `{kind:'node', ref}` plus an operation

NEXT_ACTION targets become `{kind:'page'}`, `{kind:'node', ref}` or `{kind:'passwordControl'}`. The model never writes a selector, locator or role expression. CLARIFICATION choice `meaning` becomes `{obligationId, ref, bindingId}`. A ref is valid only for the observation generation that produced it; an unknown or stale ref is refused with the existing `STALE_GENERATION`/`INVALID_CONTRACT` codes. The runner converts a chosen clarification ref into the same synthesized locator before the clarification is stored, so a later answer is re-established against a fresh outline through the existing `selectedLocator` rule.

### D3 — Gates, one owner each

Every reply passes all gates before dispatch. The runner exports, with each observation, a **per-ref facts table** (`role`, `editable`, `evidence` of at most 256 characters, and `text` of at most 256 characters for assertable roles, absent when withheld), computed once from the already-sanitized nodes. The backend never re-derives them from the outline text, so there is one implementation of `evidenceFor`.

| Gate | Owner | Input | Rule |
|---|---|---|---|
| Action gate | Backend, `GuidedProposalValidator.action` (exists) | obligation, plan, reply | Operation kind, bound authored input or binding, assert predicate and secret/password pairing must be exactly what the obligation binds (`OPERATION_MISMATCH`, `VALUE_MISMATCH`, `PREDICATE_MISMATCH`, `POLICY_DENIED`). Unchanged |
| Intent gate | Backend, replaces `:472-483` | `targetIntent`, ref's `evidence` | Pass if `norm(targetIntent) == norm(name)` or `words(targetIntent)` is a subset of `words(evidence)`; empty intent fails; an intent with no words passes only by name equality. Evidence is the picked element's own name, placeholder, `near`, own text, **plus group name (radio/checkbox/option/menu items), row/column header names (cells), and the row's sibling cells** |
| Operation-vs-role gate | Backend (pure function of the facts) | operation kind, role, `editable` | `fill` needs textbox, searchbox, spinbutton, editable combobox or editable root; `selectOption` needs combobox, listbox, option, radio or menuitemradio; `check`/`uncheck` need checkbox, radio, switch, menuitemcheckbox or menuitemradio. Others unrestricted. Code `OPERATION_TARGET_MISMATCH` (internal) |
| G2 `ASSERT_TEXT_ABSENT` | Backend | authored expected literal, ref's `text` | Refuse an `assert containsText` whose non-withheld target text lacks the expected literal (NFKC, case-insensitive). Not applicable to combobox, textbox, searchbox, spinbutton, slider, listbox, or withheld targets |
| G1 `OPTION_NOT_PRESENT` | **Runner**, at prepare, before dispatch | authored literal, **live** option list | Refuse a `selectOption` whose literal is not among the target's live options (NFKC, case-insensitive). The runner sees the selected option; the outline strips it on purpose, so G1 cannot live on the outline |
| `GuidedActionGuard` | Backend (exists) | step text, picked node | `UNGROUNDED_TARGET`, `DESTRUCTIVE_VERB`. Unchanged and independent of the intent gate |

- **Failure vocabulary reuses existing codes.** Backend gate refusals reach the model as the existing `INVALID_CONTRACT` (422) with a new internal diagnostics `Gate` value each (`GuidedRefusalDiagnostics.Gate`); the spike's gate names are diagnostics, not public codes. When `MAX_REFUSED_PROPOSALS` (2) is exhausted the session ends with the existing `UNSUPPORTED_SURFACE`. A G1 refusal is deterministic (the literal is authored, so a re-ask cannot fix it): it ends the step with the existing `TARGET_MISMATCH`, with no re-ask. WI-3 verifies the current emitters and copy of `TARGET_MISMATCH` before reuse and falls back to `UNSUPPORTED_SURFACE` if its meaning conflicts. CLARIFICATION keeps the existing reasons `AMBIGUOUS_TARGET`, `AMBIGUOUS_BINDING`, `INSUFFICIENT_EVIDENCE`. No new public code or frontend type is added; frontend changes only if `UNSUPPORTED_SURFACE` copy is reworded (`GuidedCompletion.tsx:126`).
- **What G2 does and does not do.** It turns "learn an assertion on the wrong cell and fail forever on a correct page" into a repair. It does not prevent a false pass on a wrong element that happens to contain the literal; the intent, operation-vs-role and action gates are the defense for that.
- **Gate parity.** The Java gates are ports of the pure functions in `lib/arms/S3.mjs` (`intentGate`, `operationTargetGate`, `actionGate`) and of G1/G2 from the `regate-v3` analysis. WI-2/WI-3 commit golden verdict vectors extracted from the recorded S3 replies; the ports must reproduce them with zero differences.

### D4 — Locator synthesis, freeze, replay

- The runner synthesizes the locator from a **closed grammar** (JSON, at most 8 steps): `testId`, `role`, `label`, `placeholder`, `text`, `scope`, `tag`, `filterHas`, `attr` (whitelisted attributes), `nth` (last step only). Production narrows the spike's grammar to **`exact: true` only**; no case-insensitive or substring step exists. Candidate order is tier-ranked (testId, role, label, placeholder, text, scoped, filterHas, attribute, nth). The engine-generated selector tier is **not** accepted (`LOCATOR_GENERATED_ONLY` stays a non-executable result).
- Verification is by Playwright's own engine: the candidate must resolve to **exactly one element and the same element** as the ref. The same locator is executed at learn time and re-resolved at replay; learning and replay share one resolver and one executor (`publication-contracts.md:256`). Learn-time actions run through the locator (Playwright locator actions), not through the in-page `invoke`; the password-control path (`passwordControl`, Vault resolution at dispatch) is unchanged.
- The frozen `Guard` gains the grammar locator, its tier and an `identity {role, name|null}`. Replay builds the Playwright locator from the grammar with the **public API** (`getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`, `getByTestId`, `filter({has})`, `nth`, attribute CSS), requires exactly one match (zero or several is `TARGET_DRIFT`), and for tiers `attribute`, `filterHas` and `nth` also checks the re-resolved element's role and accessible name against `identity` (public `locator.ariaSnapshot()`; no `evaluate`). Other candidates are dropped at freeze; there is no self-healing and no second locator (consensus-plan `:128-132`).
- The backend no longer derives locators: `GuidedPlanBuilder.qualifiedLocator` (`:835-903`) and the `GuidedQualifiedLabel` family are deleted; the learned plan carries the runner-synthesized grammar value, validated by schema, and `operationHash` (`:420-422`) hashes it.

### D5 — Removed in the same increment (single path, no flags)

The runner's own resolver and the emptying budget are deleted, with no flag, kill switch or fallback. Concretely: `locatorHints` emission (`observationCollector.ts:478-484`), `matches()`, `acquire()` and rule R4/`unresolvedRole`, `validateInvocation`, the in-page `invoke` as an action path, the 500/8/32,768/50 ms limits (`observationSanitizer.ts:49-50`, `limits.schema.json`, `observation.schema.json` `maxItems 500`, `runtime.ts` ~`:567-573`, `observedReplay.ts:199`), the `budget` branch, the `{nodeId, locator}` target and choice shapes, `GuidedQualifiedLabel`, and the hint-equality intent check. **Kept and moved**, not removed: private inventory, `sensitive()`, password detection, echo scrub and the read profile (visible-text reads only, no field values). Per ADR-SC-005's rule, removing a gate deletes it.

### D6 — Required fixes bundled with the cut-over

- **Leak D1 (split values).** Matching runs on the concatenated, whitespace-collapsed text of every ref-bearing node's subtree and of every run of adjacent text nodes under one parent, also compared with whitespace removed. On a hit the smallest enclosing element whose text contains the value is rendered `{value withheld}` and its descendants' text lines are dropped.
- **Leak D2 (URL decoding).** Every candidate string (url, name, placeholder, text, near, in, evidence) is compared raw and percent-decoded (`%XX`, `+` as space, up to two rounds), and each private value is also compared in its `encodeURIComponent` and `+` forms. A URL-only hit keeps the node and omits its url.
- **SOURCE_PLAN radios.** The output contract states that choosing, ticking or selecting a radio button or checkbox option is `check`/`uncheck`, and `selectOption` is only for a value of a dropdown or list. Six corpus tasks currently plan "Choose …" as `selectOption`.
- **`admitPlan` read rule.** Decided here, in three parts:
  1. A `read` obligation is admitted iff it has no source reference and its `needId` names a need produced at its own step with at least one consumer at the same or a later step. This is today's invariant and it stays: a value is copied only to be used, and values stay local to the run.
  2. **`needs[]` is server-derived, not model-authored.** The model labels the read and each consuming obligation with the same `needId`; the server derives producer, consumers and consumer slots (`slot(kind)`, `:585`) from the obligations. A redundant model-written `needs[]` that disagrees with the labels was a refusal path (`MISSING_SOURCE` for an empty `consumers`, and for a read with no matching need); it is removed from the SOURCE_PLAN output schema, not tolerated and ignored.
  3. A standalone read (no consumer) is refused `MISSING_SOURCE` with a diagnostics subcase `READ_WITHOUT_CONSUMER`. All five `MISSING_SOURCE` rows in the fresh-site report are this case: single-step "Copy …" corpus tasks whose replies carry an empty `needs`. Their fix is the corpus, not the rule. **Not established:** the cause of the three real-stack `MISSING_SOURCE` rejections on checklists that do have a consumer (GitHub 2 of 2 learn attempts, Python docs reuse 1 of 2, Wikipedia 1 of 2). The harness admitted both consumer-bearing chain plans in the fresh run (`deb-chain-01`, `dt-chain-02`). Part 2 is the inferred cause (inconsistent redundancy); WI-1 reproduces the rejection before and after the change and does not close on inference. **Measured by WI-1 (accepted 2026-10-27), and the inference is refuted.**
  - On the four alpha read checklists, SOURCE_PLAN `MISSING_SOURCE` was 23 of 40 before the change and 0 of 40 after it, on the final code.
  - All 23 refusals were at `admitPlan:97`. The model wrote a correct `needs[]` and labelled the consumer, but left the read's own `needId` null.
  - Server-derived needs alone would not admit such a plan. What removes the refusal is the contract rule that puts the shared `needId` on the read as well.
  - A null-`needId` read is still a terminal `MISSING_SOURCE`, because it is not in the repair set. The release gate watches for it.
  - Evidence: `docs/qa/evidence/adr-sc-007/wi-1/`.
- **Copy and codes.** No new public code; see D3.

### D7 — Rulings on SPK-07 §13 items 1, 2 and 4

| Item | Ruling | Why and conditions |
|---|---|---|
| 1. The S3 intent gate is weaker than today's equality gate | **Accept the word-subset gate**, under four conditions: (a) evidence is only the picked element's own fields listed in D3, never page-wide text or sibling controls outside those sets; (b) the 256-character cap holds; (c) `GuidedActionGuard` stays a separate gate; (d) every action's audit record carries which path passed (exact name or subset) and which evidence field supplied the words | Equality is part of why A1's product-admitted rate is low (11.3% against 44.3% correct), but that gap mixes several Java refusals and the share due to the intent check was not isolated. Hostile and injection cells all passed for S3 (16 of 20 hostile, the 4 not passed are incomplete S1 and S4 cells; 15 of 15 injected). A page can still place authored words in a `near`/`in` label next to a different control: this residual is accepted for the pilot and is what D-C's zero-false-pass gate and OBS-014's first-run side-effect policy measure |
| 2. Positional and non-exact locators vs the uniqueness guard | **Non-exact is removed** (grammar is exact-only). **`nth` stays as the last-resort tier**, with the `identity` check at replay for `nth`, `attribute` and `filterHas` | Short-term durability shows 119 positional S3 locators OK and 0 wrong-unique. That is same-day evidence only; next-day was not run, so the identity check stays. The user removed the next-day release requirement on 2026-10-28; no next-day durability claim is made. If any gate run shows a wrong-unique result, the offending tier is deleted from the grammar (no flag) |
| 4. More trusted code in the isolated world | **Accept**, bounded: Playwright 1.63.0 exactly; `playwright-core/lib/coreBundle.js` sha256 pinned (`549070af…9171`); mismatch is `ENGINE_PIN_MISMATCH` with no fallback; the injected-script string is parsed without `eval`/`new Function` (`no-dynamic-evaluation.test.ts` stays green unmodified); it runs only in the runner's isolated world and never exposes a page-reachable surface; a Playwright upgrade re-runs the conformance test (engine vs public API) before the pin moves | This is fixed vendor code, not arbitrary evaluation, but it is a private API: the injected script and the `aria-ref=` selector engine are not in the public types (`ariaSnapshot`/`ariaSnapshotJSON` with `mode:'ai'` are public in 1.63). The spike validated the private path, so production uses the private path. Moving to the public snapshot API plus public ref resolution needs its own measurement and is not part of this decision |

### D8 — Contracts change in place, v3

Contracts are generated from `docs/specs/studio-observed-authoring/contracts/v3/*.schema.json` by `tools/build-studio-observed-schemas.cjs`. **v3 is changed in place; no v4.** Reasons: Studio is unreleased and no shared environment has ever been deployed (ADR-SC-005 D-B evidence), so there is no installed base to be compatible with; ADR-SC-005 fixed one contract version `{contract: 3, build}`, and a v4 would either keep v3 alive (a compatibility layer, forbidden) or rename it across about 80 test files with no consumer benefit; the `build` identity that `assertBuild` already checks refuses a runner/backend pair that disagree. Consequence: replay artifacts learned before the change fail validation (the `Guard` shape and `operationHash` changed). Dev databases are recreated or the tests re-learned, as D-B did. Nothing is migrated.

## Evidence

All figures are from the SPK-07 reports cited in the header. Model: `gemini-3.8-flash` on Vertex, thinking LOW, one model, 3 reps (S3 and S2: 2 reps used in the 4-hour profile). The final S3 design (v2) was changed after its first results were visible, so every figure below is **post-hoc** (pre-registration §14, entries 15–17). It is **screening evidence, not D-C evidence**: the harness calls the model directly, not through the deployed stack. Corpus sha256 `400b32aa…afec` (all tasks), `9fe9b0ff…e938` (fresh sites); runs `final-s3v2-20261027`, `final-s3v2-fresh-20261027`.

**Per-step success** (correct element, executable locator, first attempt, answerable steps, rep-level):

| | S3 | S2 | S1 | A1 (today) | A0 (A1 under production limits) |
|---|---|---|---|---|---|
| All tasks (298 planned, 231 finished, 228 paired units) | **83.5%** | 43.7% | 22.6% | 20.4% | 10.0% |
| Fresh sites only (debian.org, kernel.org, iana.org, datatracker.ietf.org; 58 tasks) | **78.1%** | 41.2% | 31.6% | 28.1% | 10.5% |

- **Primary comparison, S3 vs S2 (paired, unit = task step, majority of reps):** +39.4 points, 95% cluster-bootstrap CI [33.0, 46.1], exact McNemar p < 1e-4, all tasks; +36.8 [25.0, 49.1] on the 57 fresh-site units. Counting positional or non-exact locators as non-executable: +31.0 [24.4, 37.9]. S2 vs A1: +23.3 [17.9, 28.8]. S1 vs A1: +2.2 [-0.4, 4.8] at 0.38 times the prompt tokens. S3 against today is +63.1 points unpaired (83.5 − 20.4), with no CI of its own.
- **Admission under limits (fresh sites):** S3 65 of 65 observations and 134 of 134 requests are within the planned limits (40,000-byte outline, 262,144-byte request). A0/A1 fit today's production limits (500 nodes, 32 KB, 50 ms) in 23 of 65 (35%). Over all tasks A1 fits 76 of 253 (30.0%) and 19 A1 requests exceeded the gateway cap.
- **Safety, S3:** leak scan 0 hits in 315 files (64 canaries on the fresh run); mask test 0 differences; injected 15 of 15; hostile 16 of 20 with 0 failed (the 4 incomplete cells are S1 ×2 and S4 ×2, timeouts).
- **Short-term durability (<24 h; 5 baseline contexts plus a viewport and a locale; no model calls):** HZ-2 (wrong-unique) 0 in every arm; HZ-6 (Playwright engine vs public API) 0 mismatches in 1,255 S3 trials. S3: 1,255 resolved trials, 1,241 OK, 14 FAIL_CLOSED (1.1%), 0 WRONG_UNIQUE; OK by tier: role 847, filterHas 196, nth 119, attribute 51, scoped 14, label 14. S2: 815 OK, 7 FAIL_CLOSED. Fresh sites, S3: 315 resolved, 0 fail-closed, 0 wrong-unique. Engine conformance F1: 0 mismatches over 2,294 elements and 1,669 hints on 8 live pages and 1 edge page (same session).
- **Hard zeros.** S3 HZ-1 has 5 rows: `neg-pydocs-01` ("Select 3.99", which does not exist; `selectOption` fails loudly by timeout, no state change); `gut-assert-01` rep 2 and `iana-assert-01` rep 2 (asserted on the row header or key cell instead of the value cell: a false failure on a correct page, not a false pass; `iana-assert-01` also exposed the intent gate refusing the correct cell because sibling-cell text was missing from the evidence); `dt-neg-02` ×2 (**corpus defect**: the planted ambiguity comes only from a disabled button). All three genuine errors fail loudly; none is a false pass. They still count as HZ-1 under pre-registration §8.
- **Offline gates on every recorded S3/S4 reply (`regate-v3`):** G2 refuses 3 of 3 confident-wrong rows in v2 (and the v1 repeat) and 0 correct rows in any dataset. G1 catches `neg-pydocs-01` but, evaluated on the outline, falsely refuses a literal that is a native select's currently selected option; hence G1 in the runner against the live list.

**Limits of this evidence.**

- **No stage reached GO.** Stage 3's computed verdict is NO-GO: HZ-1 (5 rows, above) and HZ-5 (4 incomplete S1/S4 hostile cells, all infrastructure). Stages 1, 2 and 4 are also NO-GO on HZ-5 (Stage 1 additionally on S2's `neg-wiki-02`; S4 was not run on the full corpus). The primary comparison, durability, leak and mask checks pass.
- **Post-hoc, screening, one model, public sites, static pages.** Held-out status holds only for the fresh sites; the S3 v2 design was shaped after wave-1 results were seen (§14), and the pre-registration requires a go based on post-hoc results to rest on at least 3 fresh held-out sites (4 here, one wave).
- **No arm meets the absolute bar.** Implied 5-step workflow completion for S3 is 40.5% (Wilson lower bound 32.3%; fresh sites 29.0% and 16.4%) against the 85.9% (0.97⁵) that D-C's 90% implies. This ADR does not claim D-C will pass.
- **The gates cost correct picks.** S3's product-admitted success (also gate-admitted) is **59.3%** (269 of 454) against 83.5% correct-and-executable; on fresh sites 63.2% against 78.1%. A1's admitted figure is 11.3%. The gap is mostly the intent gate refusing correct picks whose names differ from the authored words: icon-only 0 of 28 admitted, visual-only 4 of 26, reads 4 of 32, chains 37 of 73. These refusals are fail-closed, but they are what an author experiences.
- **Weakest strata are reads and asserts:** `readTarget` 40.6% correct (all tasks), `assertTarget` 71.4%. The sibling-evidence fix in D3 and the release gate target these. The fix's effect is **not measured**.
- **Spike vs production differences, unmeasured:** the spike projected on the step text only (production adds `targetIntent`); the spike ran each observation once per load, before SOURCE_PLAN; Playwright locator actions replace the in-page invoke at learn time; the narrowed exact-only grammar; the Java ports of the gates.
- **Durability is short-term and same-machine.** Next-day durability was not run. Durability measures that the locator re-resolves to the same element, not that the action still has the same effect.
- **Latency is not shown better.** S3 median model time was 8.9 s against S2's 3.8 s over the full run (8.4 s against 14.9 s on fresh sites); harness tails (p95 112–120 s) come from concurrent rate-limited calls and say nothing about the deployed gateway. D-C publishes p50/p95.

## Alternatives considered

| Option | Result in SPK-07 | Why not |
|---|---|---|
| **A1, today** (hint table plus the runner's own resolver) | 20.4% per step; 11.3% product-admitted; fits production limits on 35% of fresh observations; 0 of 6 alpha sites learned | Fails the product on its own terms: alpha blockers 1 (budget), 2 (R4) and 3 are in this path. Raising the limits alone leaves R4 and the duplicate-name and unnamed-control cases |
| **S1** (compact outline of A1's observation) | +2.2 points over A1, CI [-0.4, 4.8]; 0.38 times the tokens | Cheaper, not better. Kept only as the outline idea inside S3 |
| **S2** (Playwright-semantics resolver on A1's hints, R4 removed) | 43.7%; +23.3 over A1; 0 wrong-unique in durability | Real gain, but S3 adds +39.4 over it, and S2 keeps the hint table, the node budget and the model-copied locator. S2 also has an HZ-1 of its own (`neg-wiki-02` ×2, a genuine model error) |
| **S4** (S3 plus value-masked Set-of-Marks screenshot) | Not run on the full corpus; hostile S4 cells timed out | Screenshots to the model are barred (`guided-data-flow.md:42-44`, `noRunnerSinks.test.ts:17`); adoption needs an ADR and Security & Compliance re-approval, and no evidence here supports it. Out |
| **Wait for D-C evidence before choosing** | — | D-C runs on the deployed stack, which today cannot learn the alpha sites. Evidence cannot be produced on the path that fails first. The release gate below is the check on this decision |
| **S3 with the old resolver kept as fallback** | — | Forbidden: one path, no compatibility layer, no flag |

## Amends

- **ADR-SC-004, Decision ¶2.** "The runner observes each reached page state and binds one unique current node to the proposed durable locator before dispatch" becomes: the model names an outline ref; the runner derives, verifies and freezes the locator, and dispatches through it. The trust boundaries, INPUT-POLICY-01 and the at-most-once ledger stand.
- **ADR-SC-005 D-A.** "sanitized observations of the live page (accessibility/semantic nodes, bounded DOM neighbourhood, never raw HTML, password controls withheld)": "bounded DOM neighbourhood" is replaced by the focus-projected AI-snapshot outline of D1. The rest of D-A stands. The security P1 control "semantic grounding of click/press/check `targetIntent` to authored text" is now the D3 intent gate, weaker than equality as ruled in D7 item 1.
- **ADR-SC-005 "Contracts and pins".** `contracts/v3` is kept; its observation, model-response, action, replay-operation `Guard`, learned-plan, replay-artifact, limits and bridge schemas change in place (D8); `BASE_SHA256`, vectors and generated bundles are regenerated.
- **ADR-SC-005 panel evidence (cost envelope).** The per-call `translation.maxInputBytes` default moves to 98,304 (D1). Session and call budgets are otherwise unchanged and are revisited under Risks.
- **Privacy disclosure (flagged, not resolved here).** The outline exports visible text fragments (at most 80 characters) and query-scrubbed link URLs that today's observation does not. ADR-SC-005's P0 compliance approval (OBS-014/OBS-010 external gate) was given on the earlier shape. I have not read the approval text, so whether it covers the new shape is **inferred, not verified**. The approval must be re-confirmed before any pilot, recorded as an external gate in the OBS-010 release record, the same treatment S4 would have needed.
- **Pre-registration.** SPK-07 item "ADR-SC-007 must rule on items 1, 2 and 4" is answered by D7. The register `studio-staging-spikes.md` SPK-07 row gets a pointer to this ADR; its Result stays "no stage GO".

## Implementation amendments (2026-10-27, controller rulings confirmed by @architect)

The Lean work items found places where the code had to differ from this ADR's text. Where a point below conflicts with D1–D8, the point below prevails. Record: `architect-confirmation.md`, which lists no overturned rulings.

- **D6 (WI-2 D1 narrowing).** The sanitizer does not drop every descendant text line of a withheld node. It withholds matching text using 12-character windows with ghost parts. This is still fail-closed, and the leak canary suite is its guard. A value too long to match no longer makes the page unobservable; it is matched completely, within the 4,096-entry and 1 MiB limits.
- **D2, last sentence (WI-3 Q2).** A clarification answer is re-established from the stored `{role, name, evidence}` only when **exactly one** fresh fact matches. With zero or several matches, the question is asked again. There is no runner call inside the apply transaction. The latest accepted answer supersedes earlier ones (Q5).
- **D3 exhaustion counter (WI-3).** A grounding-gate refusal uses the existing 3-attempt repair loop, not `MAX_REFUSED_PROPOSALS`.
- **D5 (WI-4 Q8).** `sensitive()` is not ported. `data-sensitive` withholding stays in perception and in target actions. Password controls stay ref-less, and fills stay under INPUT-POLICY-01.
- **Budgets (WI-3 R9).** `translation.maxOutputTokens` stays 4,096. `maxModelInputTokensTotal` goes to 1,572,864, the schema maximum, because reservations add each call's ceiling and are never refunded. The field counts bytes; that misnomer is recorded for a later rename. WI-5 records the number of truncations at 4,096.
- **Hard gate before any pilot (WI-4 Q9).** Business-text inventory withholding is dropped, so compliance re-confirmation of the export shape (see "Privacy disclosure" above) must pass before any pilot.
- **Accepted residual (WI-4 W-AC10).** A focus handler that moves focus after a delay is accepted for the alpha. A fill is covered by a password check after it writes; a press has no mitigation. This is the hostile-page class D7 item 1 already accepts, and the WI-5 release evidence states it.
- **Post-fence binding (WI-4 Q15).** Click, hover and check/uncheck act on the node bound at recheck. A node that is detached or replaced stops the action as an uncertain UNKNOWN_OUTCOME.

## Implementation amendment (2026-10-28, foundational WI-2.1)

Architect/security review confirmed this bounded D1 amendment after retained read → binding fill → source assertion tests showed that withholding a captured child value also erased its unrelated public source label. This is a design decision; WI-2.1 must still supply independent Lean critique, implementation review and native/privacy/joined evidence before acceptance. The accepted WI-2 record stays unchanged.

- **Primary native label only.** A ref-bearing, noninteractive and noneditable native `output` with native `status` role may retain its **current already-sanitized** name and raw-name evidence when the collector proves a nonempty primary `aria-label`, absence of `aria-labelledby`, full strict normalized agreement between that attribute and the same-ref native snapshot name, and the existing 256-character bound. Password, sensitive, editable, value-control, ambiguous or incomplete provenance is excluded. A role override or other unsupported naming source does not receive this exception.
- **No private-name recovery.** This applies only to content-only owner/ancestor taint. Any direct, split, inserted, ghost or final joined match involving the name revokes preservation monotonically. A name already cleared stays cleared; no raw attribute, earlier snapshot, hint, cache or target intent may restore it. The preserved name remains page-authored evidence, not trusted application authority.
- **Value protection remains.** Private child text, values, own text, placeholders and URLs stay withheld; withheld/cleared and ancestor-taint safeguards remain. The fact stays ineligible for another read while its text is withheld. This permits the existing local `containsText` binding assertion to identify its public named source without exposing the copied value. Content-derived HN story names and all other unproved cases keep their current withholding.
- **Identity stays strict.** The synthesizer may retain that same proved current public name in its identity under the existing name-size guard. Locator grammar, tiers, matching, private-attribute exclusions and role/name checks are unchanged; no private text enters a selector. Native same-element naming, direct/split/alias/privacy exclusions, normal intent, proof and model-free replays must be verified.

This changes no release pass rule or hard-zero control. Compliance re-confirmation of the exported observation shape remains mandatory before any pilot.

## Implementation amendment (2026-10-28, captured action-handle identity)

Architect/security design confirmation and independent Lean critique authorize this bounded Q15 implementation amendment. Runtime and native race verification are still required before acceptance.

- **Captured handle verification.** Click, hover and check/uncheck compare the exact captured public ElementHandle with the current locator witness and, during guided learning including prefix actions, the immutable prepared physical node. The runner may use the existing exactly pinned in-process Playwright client/server mapping solely to issue read-only `DOM.describeNode` on that handle's owning CDP client. It must verify the same connection, page, main frame and current execution context before and after inspection. This is a bounded exception to the public-API-only implementation wording for identity inspection; selection and native actions retain the existing public API executor. No evaluation, DOM mutation, alternate resolver, fallback or exported/persisted node ID is permitted.
- **Hover preflight.** Hover waits for visibility without a pointer trial, then verifies the captured handle and performs one public bound hover after the fence. It adds no enabled-state requirement. Hidden or absent targets refuse before the fence; actual hover actionability failure on a covered or unstable target is uncertain UNKNOWN_OUTCOME after the fence, with no retry. The other pointer trials retain their existing disclosed behavior.
- **Dispatch boundary.** A pre-fence physical mismatch refuses without effect. A replaced or detached bound node after the fence yields closed UNKNOWN_OUTCOME; it cannot retarget a replacement. Capture/inspection and cleanup consume existing action budgets, and late inspection cannot dispatch. Ordinary replay establishes its current invoke-local binding; guided prefix execution uses the existing learn profile and exact prepared document/generation. These requirements do not expand the accepted delayed-focus press residual.

## Implementation amendment (2026-10-28, qualified scopes and coordinated WI-4/WI-6 completion)

Retained joined tests exposed a dependency between the runner cut-over and WI-6: distinct named regions can produce identical button facts, so the old clarification identity cannot admit the required choices. The scripted provider also compared a bare region name with the current role-qualified ancestor hint. These are recorded failures, not passing evidence.

- **Delivery order.** WI-6 may build on the frozen, verified WI-4 binding implementation before WI-4 acceptance. WI-2.1 and WI-3.1 remain accepted prerequisites. WI-4 and WI-6 remain unaccepted until the common final source passes their required verification, including one fresh full original40/incremental50 run and both independent reviews. No separate release or failed-test waiver follows from this coordination change.
- **Declared scope constraint.** A non-null authored `scopeIntent` must match current, clean, complete permitted scope sources in addition to existing target/operation/action guards. Bounded refs-only `scopeRefs` identify at most eight currently shown sources: at most three named ancestors, existing certified same-nearest-table row/header sources, and the explicitly bounded local heading/form qualifier relation. The heading/form relation is a qualifier witness, not a claim that proximity proves ancestry. No arbitrary sibling values, global heading fallback, added general evidence words, private values or backend node IDs are exported. Read-only `readScope` and R7 context never authorize effects. The same predicate governs ordinary/prefix admission, choices and immutable publication before any selected-choice bypass. Scope identity must survive fresh-choice re-establishment. This constrains declared qualifiers; it does not claim universal detection of model-omitted natural-language qualifiers.
- **Clarification and tests.** Ordinals make coherent look-alike choices distinguishable without silently selecting the first. Same-region duplicates may produce a question; cancellation must produce no action, and incomplete/incoherent classes still refuse. The login fixture suite selects its six original scripted scenarios plus a valid-existing-ref wrong-scope adversarial case, with no skips; the mutually exclusive real-provider opt-in remains separate. A provider fault or page-mismatch budget timeout is not evidence that the product rejected a wrong region.
- **Evidence.** Q4 uses the original observation/ref, fact hash, exact preparation and frozen locator joined to independent intended public region anchors. `readScope` adds only current shown public source refs with a closed relation; projected indentation and a later tab cannot certify the earlier selection. Native producer/conformance tests establish the physical relation; the independent gate establishes the intended semantic region. Missing or uncertain evidence blocks a counted pass. Compliance re-confirmation remains mandatory before any pilot.

## Consequences and risks

| Risk | Mitigation |
|---|---|
| **Model dependence.** One model, one reasoning level, contract text tuned to it | The gates are model-independent and fail closed. The release gate and D-C pin model, prompt and contract hashes. The SPK-07 harness moves into the repository (WI-5) and re-runs on any model or prompt change |
| **Playwright private API.** Injected script and `aria-ref=` are not public; the AI-snapshot mode is public but young | D7 item 4: exact version, bundle sha256 pin, refusal without fallback, conformance test on every bump, no `eval`. If upstream publishes ref resolution, migrate under the same test |
| **Privacy: wider export.** Text fragments and URLs; persisted observations now carry the facts table | D1/D6 sanitization with D1/D2 fixes; facts derived after scrubbing; same retention and pruning rules as `studio_guided_sessions.progress` (OBS-014); compliance re-confirmation (Amends). WI-2 tests scan outline, facts, locator and diagnostics for canaries |
| **Gate refusal rate.** 59.3% admitted against 83.5% correct; icon-only and visual-only steps nearly always refused | Do not loosen the gate (security P1). Add the sibling-cell evidence; measure the admitted rate in the release gate; tell the author to use the control's visible name (copy). Icon-only and visual-only steps are outside the release gate's pass criteria and reported separately |
| **Reads and asserts are the weakest strata** | Sibling evidence, G2, and gate steps that exercise them (below). A failure there is informative, not a reason to relax the gate |
| **Workflow completion far below the D-C bar** (40.5% implied against 85.9%) | The ADR claims no D-C pass. If the release gate shows the per-step rate does not rise, the revisit triggers fire; the per-step rate is the number to move |
| **Token and time budgets.** S3 prompts average about 11,500 tokens per call (fresh 10,500); ADR-SC-005 records a 128k input-token session envelope (not re-verified here), so a test of about ten steps with repairs sits at the edge | The release gate records tokens per test. WI-3 revisits the session budget from measured p95 rather than a guess |
| **Cut-over is one step, with no fallback** | WI-3 and WI-4 merge as one release unit; joined integration tests (real backend, PostgreSQL, guided worker, Chromium) gate the merge; rollback is a git revert, as the single-path rule requires. Studio is unreleased |
| **Learn-time execution semantics change** (Playwright actionability and auto-wait replace the in-page invoke) | Same code path as replay (a benefit); fixture-tier tests for click, fill, select, check, press; password path untouched and its tests unmodified |
| **Stored artifacts invalid after the `Guard` change** | Recreate dev databases or re-learn (D8); no migration |
| **Stale or invented refs** | A ref resolves only against the generation it came from; unknown or stale refs are refused with existing codes; a ref is never frozen |
| **Tooling.** `studio-runner/package.json` declares `packageManager: npm@11.3.0` and ships `package-lock.json`; the project rule is pnpm | WI-2 first runs `pnpm run type-check`; if pnpm refuses the declaration, fixing that declaration is in WI-2's scope. Not verified here |

## Implementation breakdown (AIOX Lean Delivery)

The five original work items have recorded owner fixes and the authorized WI-6 follow-up below. Gradle runs use the isolated recipe (init-script build directory and `--project-cache-dir`) in the shared worktree. Runner commands are `pnpm run <script>` in `studio-runner/`. **WI-3, WI-4 and WI-6 form one release unit:** WI-2 could merge first while unreachable (an import-boundary test proves that stage). The cut-over and its foundational fixes must not be released separately or leave the old resolver or target shape alive.

| | Dependencies |
|---|---|
| WI-1 Planning fixes | none |
| WI-2 Perception, synthesis and gate library (runner) | none; parallel with WI-1 |
| WI-2.1 Primary native source-name preservation | WI-2; required before WI-4 acceptance after retained joined failures exposed the D1 limitation |
| WI-3 Contract and backend cut-over | WI-1 (same validator, contract text and provider schema), WI-2 (facts, grammar and outline formats) |
| WI-3.1 Initial-blank observation refresh and terminal deadline handling | WI-3; required by joined observation-deadline evidence |
| WI-4 Runner cut-over and removal | WI-2, WI-2.1, WI-3, WI-3.1 |
| WI-6 Ordinals, bounded acquisition, scoped reads and independent action grounding | WI-4; read-only design prerequisites may proceed earlier |
| WI-5 Real-site gate suite and run | WI-1, WI-3, WI-3.1, WI-4, WI-6 to run; suite authoring may start with WI-1 |

### WI-1 — Planning fixes (SOURCE_PLAN radios, `admitPlan` reads)

- **Scope.** `backend/src/main/resources/studio/guided-output-contract.md` (radio/checkbox rule; read and `needId` rules; no `needs`); `GuidedPromptAssembler` provider schema (`:437-515`); `GuidedProposalValidator.admitPlan` (`:40-117`, derive needs); `GuidedDependencyPlanner.validate` (`:21-45`); `guided-model-response.schema.json` SOURCE_PLAN output and regenerated bundles; `GuidedRefusalDiagnostics` (`READ_WITHOUT_CONSUMER`).
- **Acceptance.**
  1. Plans whose read and consumer obligations carry the same `needId` are admitted with derived needs equal to the hand-written ones, including when a model-written `needs` is absent.
  2. A standalone read is refused `MISSING_SOURCE`/`READ_WITHOUT_CONSUMER`; the 5 fresh-site SOURCE_PLAN rows reproduce that verdict offline.
  3. SOURCE_PLAN-only harness run on the 6 corpus "Choose …" radio tasks: `check` in 3 of 3 reps for each (18 calls, recorded).
  4. The 4 alpha read checklists (Wikipedia, Hacker News, Python docs reuse, GitHub): SOURCE_PLAN `MISSING_SOURCE` rate recorded before and after over 10 reps each; after = 0. The cause of the three real-stack rejections is written down, whether or not part 2 of D6 explains it.
- **Checks.** `node tools/build-studio-observed-schemas.cjs` then `node tools/check-studio-observed-contracts.cjs`; backend `./gradlew test --tests 'com.citi.put.checks.studio.guided.translation.*'` (includes `GuidedProviderSchemaCompatibilityTest`, `GuidedPlanningIntegrationTest`, `GuidedTranslationTest`); runner `pnpm run test -- test/generated-contracts.test.ts test/contract-integrity.test.ts`. Frontend untouched.

### WI-2 — Perception, synthesis and gate library (runner, inert)

- **Scope.** New modules ported from the spike with tests: `src/run/perceive.ts` (snapshot, sanitization, outline, `near`/`in`, evidence, facts, focus projection with `targetIntent`), `src/run/locatorSynth.ts` (closed grammar, `validateLocator`, public-API builder, tier ranking, identity), `src/run/playwrightEngine.ts` (pinned injected script, `aria-ref` resolution, unique-and-same verification), `src/run/privateInventory.ts` (moved from `observationCollector.ts:15,59-81`, `observationInventory.ts`), the G1 live-option check, D1 and D2 matching. Golden gate vectors extracted from the recorded S3 replies, committed as a fixture. `scripts/check-pins.mjs` extended with the bundle sha256.
- **Acceptance.**
  1. For each fixture case of the spike corpus's `fixtureRegression` stratum (from `evaluation/observed-authoring/manifest.json`, 25 cases), outline and facts equal the spike module's output at the freeze commit.
  2. Canary suite: D1 (values split across 2–4 spans, inside links and cells, `aria-label` against visible text) and D2 (`%20`, `+`, double-encoded `%2520`, mixed-case hex) produce 0 hits in outline, facts, locator, diagnostics and error text; password, hidden, contenteditable and `data-sensitive` content never appear.
  3. Grammar: anything outside it, any `exact:false`, any harness-style attribute, more than 8 steps or a non-final `nth` is rejected; the engine-generated tier is non-executable. Engine pin mismatch throws `ENGINE_PIN_MISMATCH`; no fallback.
  4. Conformance on controlled fixtures: for every grammar step type, the engine and the public-API locator match the same element set (HZ-6 style).
  5. No `eval`/`new Function`; `no-dynamic-evaluation.test.ts` unmodified and green. An import-boundary test shows nothing in `guided/runtime.ts`, `run/browser.ts` or the replay path imports these modules yet.
- **Checks.** `pnpm run type-check`, `pnpm run lint`, `pnpm run test -- test/run/perceive test/run/locatorSynth test/run/playwrightEngine test/run/privateInventory`, `pnpm run test:fixtures` (real Chromium), `pnpm run check:pins`.

### WI-3 — Contract and backend cut-over

- **Scope.** Contracts v3 in place: `observation` (outline, facts table, projection summary), `guided-model-response` (ref targets and choices), `action`, `replay-operation` (`Guard` locator grammar, tier, identity), `learned-plan`, `replay-artifact`, `limits` (outline bytes, no node/depth/time), `bridge`; regenerate the four generated runner files and backend bundles. Backend: `guided-output-contract.md` (outline paragraph and ref rules, derived as the spike's `s3-contract.md` was), `GuidedPromptAssembler` (`:99-241`, `:437-515`), `GuidedProposalValidator.materializeAction` (`:299-420`) and `action` (`:422-580`: intent, operation-vs-role, G2), `GuidedPlanBuilder` (`:420-465`; delete `qualifiedLocator` `:835-903`), delete `GuidedQualifiedLabel*`, `GuidedTranslationService` (coverage and `UNSUPPORTED_SURFACE` logic ~`:2680-2692`, `:1015-1075`), `GuidedTranslationProperties.maxInputBytes`, session budget review, G1 failure mapping to `TARGET_MISMATCH`. Frontend only if `UNSUPPORTED_SURFACE` copy changes.
- **Acceptance.**
  1. Java gates reproduce every recorded verdict in the committed gate vectors with 0 differences; each gate refusal has its own diagnostics `Gate`.
  2. The prompt for the six fixture contexts equals the spike's S3 contract text apart from the documented production edits.
  3. Single-path grep returns 0 in `backend/src/main`, `studio-runner/src` (except WI-4's pending files), `frontend/src` and `tools/` for `locatorHints`, `unresolvedRole`, `qualifiedLocator`, `GuidedQualifiedLabel`, the `{nodeId, locator}` target shape and `maxItems` 500 on observation nodes.
  4. `BASE_SHA256`, `StudioContractTest` op-count and vectors re-anchored with old and new values quoted.
- **Checks.** `node tools/build-studio-observed-schemas.cjs && node tools/check-studio-observed-contracts.cjs`; backend `./gradlew test --tests 'com.citi.put.checks.studio.guided.*'`, then `./gradlew check`; runner `pnpm run test -- test/generated-contracts.test.ts test/contract-integrity.test.ts test/observedV3TupleValidation.test.ts`; frontend `pnpm run type-check` and `pnpm run test -- guided` only if touched.

### WI-4 — Runner cut-over and removal

- **Scope.** `run/browser.ts` (observe through WI-2 modules; ref-to-backend-node map), `guided/runtime.ts` (`~:326`, `:462`, `:495`, `:567-585`: prepare = ref, synthesize, G1, report locator and identity; dispatch through the locator), `run/observedReplayAdapter.ts` (`~:36-50`), `executor/observedReplay.ts` (`:27-38`, `:199`, `:315-380`), `validator/observedReplay.ts` (`~:267-298` Guard), `run/observationTypes.ts`, `run/observationSanitizer.ts`; delete the resolver, R4, hints, budget and in-page invoke from `observationCollector.ts` (D5), keeping the moved inventory and read profile.
- **Acceptance.**
  1. Joined integration on controlled fixtures (real backend, PostgreSQL, guided worker, Chromium; the `GuidedPublicationReplayIT` scenario): learn, publish, proof, two model-free replays, zero gateway calls on replay.
  2. Regressions for the alpha blockers: a page with one unnamed button beside named buttons learns and replays the named one (R4); a page with more than 600 nodes and more than 32 KB observes non-empty, outline at most 40,000 bytes, target present (budget).
  3. Replay re-resolution: zero matches or several is `TARGET_DRIFT`; an `nth` locator pointing at a different role or name fails the identity check; D-D prefix replay and incremental re-learn tests stay green on the new adapter.
  4. Secret login and `passwordControl` tests pass unmodified.
  5. G1: `Select "3.99"` against a page without that option ends the step `TARGET_MISMATCH` with no state change and no re-ask; a literal equal to the currently selected option passes.
  6. Single-path grep as in WI-3, now over the whole runner: 0.
- **Checks.** `pnpm run type-check`, `pnpm run lint`, `pnpm run test`, `pnpm run test:fixtures`, `pnpm run test:deployment`, `pnpm run check:pins`; backend joined IT (`GuidedPublicationReplayIT`, `GuidedPlanningIntegrationTest`) and `./gradlew check`.

### WI-5 — Real-site gate suite and run

- **Scope.** Commit the suite as a repository artifact (the scratchpad `suite.mjs` is not durable): a real-backend Playwright project under `frontend/e2e/` that never runs in the default MSW project; the test table below; same-day corpus verification (`node studio-runner/evaluation/grounding/corpus/verify.mjs`); the leak and false-pass checks; an evidence report in `docs/qa/evidence/` and the SPK-07 Result line in `studio-staging-spikes.md`. The SPK-07 harness is also committed under `studio-runner/evaluation/` (already there) with a model-change re-run note.
- **Acceptance.** The gate below, executed and reported.
- **Checks.** Frontend `pnpm run type-check` and `pnpm run lint`; `CHECKS_E2E_REAL_BACKEND=1 pnpm run test:e2e` with the real-sites project selected.

## Release gate

**User amendment (2026-10-28):** the 24-hour/next-day replay and L1 practice-site secret canary are removed from this gate. No L1 secret is required. The 14 public-site positives, proof video, two same-day model-free replays, N1–N3 controls and zero-leak scan remain required. This changes acceptance scope; it does not establish next-day durability or secret-login coverage. The user will also run manual Studio tests after the verified readiness handoff.

The gate is the real-site E2E through the Studio UI on the real stack. Passing it is **necessary before STUDIO-OBS-016's D-C benchmark starts and is not a D-C pass**: D-C keeps its own 20 workflows × 3 repetitions, at least 90% completion without clarification, zero false passes and zero leaks.

**Flow per test** (as `suite.mjs`): All Checks → Create Check → UI Test form → editor → author steps → Save → Run Test (learn; clarifications answered by the first choice that is not "None of these") → proof replay (`AFTER_LEARN`) → Run Test manually twice → detail page. Environment recorded with the run: git SHA, model id, contract and prompt hashes, Playwright version and bundle sha256, gateway settings.

**Tests (positive, 14).**

*Alpha sites (6):* `wikipedia`, `govuk`, `hackernews`, `pythondocs`, `mdn`, `github` from `TESTS` in `suite.mjs`, steps reproduced verbatim (covering navigation, cookie banner, menu, dropdown select, field, search, and context reuse from table cell, list item and paragraph into a field or assertion). The diagnostic variants (`govuk-small`, `mdn-noscope`, `pydocs-reuse`) are not gate tests.

*Fresh sites (8).* Each step is built from a wave-2 corpus task whose ground truth resolved to exactly one visible element in all three contexts of `corpus/verify-report-wave2.json` (59 of 59 passed). Quoted names come from those ground-truth chains; no element name is guessed.

| Test | Steps (after `Go to "<url>"`) | Corpus task(s) | Covers |
|---|---|---|---|
| `debian-form` `/distrib/packages` | `Select "64-bit ARM (AArch64)" in the "Architecture:" menu` · `Choose "Descriptions" next to "Search on:"` · `Tick the "Only show exact matches:" box` · `Type "nginx" in the "Keyword:" box under the "Search package directories" heading` · `Check that the page shows the link "Debian Free Software Guidelines"` | deb-sel-01, deb-sel-02, deb-sel-03, deb-dup-01, deb-nav-01 | select, radio as `check` (WI-1), checkbox, scoped field, visible assertion |
| `debian-reuse` `/releases/` | `Copy the "Code Name" of Debian 13 from the "Index of releases" table` · `Check that the "Code Name" of Debian 13 in the "Index of releases" table is "Trixie"` · `Go to "https://www.debian.org/distrib/packages"` · `Type the copied code name in the "Keyword:" box under the "Search package directories" heading` · `Click the "download debian" link in the breadcrumb at the top of the page` | deb-chain-01 step 1, deb-assert-01, deb-dup-01, deb-menu-01 | read, table assertion, cross-page context reuse into a field, menu (name differs from text) |
| `kernel-table` `/` | `Check that the RSYNC row of the protocol and location table shows "rsync://rsync.kernel.org/pub/"` · `Click the "FAQ" link in the top menu` | kern-assert-01, kern-nav-01 | table assertion, navigation |
| `kernel-releases` `/` | `Copy the version number in the "stable:" row of the releases table` · `Check that the version in the "linux-next:" row of the releases table starts with "next-"` · `Check that the version in the "stable:" row of the releases table contains the copied version number` · `Click the "browse" link in the "linux-next:" row of the releases table` | kern-read-01, kern-assert-02, kern-read-01 cell as the expected value, kern-dup-03 | read, assertion, reuse in an assertion, row-scoped click. The reuse assertion is tautological on its own; false passes are caught by the controls below, not by this step |
| `iana-registry` `/assignments/http-status-codes/http-status-codes.xhtml` | `Check that status code 418 has the description "(Unused)" in the registry table` · `Check that status code 200 has the description "OK" in the registry table` · `Click the "Protocols" link in the top menu` | iana-assert-01, iana-assert-02, iana-dup-03 | table assertions (the sibling-evidence fix), banner-scoped navigation |
| `iana-home` `/` | `Click the "Database of Top Level Domains" link` | iana-nav-01 | navigation |
| `datatracker-reuse` `/doc/search/` | `Copy the text of the page heading "Document Search"` · `Type the copied text in the "Document name/title/RFC number" box` · `Click the "Search" button next to that box` | dt-chain-02 | read, context reuse into a field, search |
| `datatracker-filters` `/doc/search/` | `Click the "Additional search criteria" bar` · `Tick the "Slides" box under "Document Type"` · `Type "bgp" in the "Document name/title/RFC number" box` · `Type "httpbis" in the "WG" box` · `Click the "Search" button at the bottom of the "Additional search criteria" panel` | dt-chain-01, dt-field-03, dt-dup-01 | disclosure, checkbox, fields, scoped search. The "Slides" step failed in the spike (clarification or unsupported) |

The tests avoid links that download files (kernel `tarball`, IANA `CSV`), the external "Report a bug" link, the visual-only search box on debian.org and icon-only logos. Those step kinds are expected to be refused by the intent gate and are reported separately, not gated.

*Safety controls (3), run with the same flow; none may publish:*

| Control | Steps | Expected |
|---|---|---|
| N1 wrong option | `Go to "https://docs.python.org/3/builtins/functions.html"` · `Select "3.99" in the Python version menu at the top` (neg-pydocs-01) | Ends at step 2 with `TARGET_MISMATCH` (G1); no option is selected |
| N2 wrong expectation | `Go to "https://www.kernel.org/"` · `Check that the RSYNC row of the protocol and location table shows "rsync://wrong.kernel.org/pub/"` (kern-assert-01 with a deliberately wrong literal) | Ends with `ASSERTION_FAILED` or `UNSUPPORTED_SURFACE` after repair; never a pass |
| N3 absent target | `Go to "https://www.debian.org/distrib/packages"` · `Click the "Install" button next to the "stable" distribution` (deb-neg-01) | Clarification or refusal; no click dispatched |

**Pass rule.**

1. **Learn.** All 14 positive tests reach "Completed — learned from this run". Each authored step must finish learning within 120,000 ms, including acquisition, model attempts, retries and validation. Persisted monotonic observation receipts may prove conservative per-step upper bounds; missing timing coverage or an upper bound over the limit fails the test. The clock does not reset on retry or clarification. Record a terminal timing failure before requesting cancellation; a late success cannot replace it. One retry only for a classified infrastructure failure (`TRANSPORT_*`, HTTP 429/5xx, `MODEL_UNAVAILABLE`). Any grounding failure (`UNSUPPORTED_SURFACE`, `TARGET_MISMATCH`, `MISSING_SOURCE`, `ASSERTION_FAILED`, `BUDGET_EXCEEDED`) fails the test. Every gate step is written to be unambiguous, so a clarification on a positive test counts as a failure and is counted [AUTO-DECISION: this is stricter than `suite.mjs`, which allowed two learn attempts and answered clarifications, because D-C counts completion without clarification].
2. **Proof.** The `AFTER_LEARN` replay is PASSED with video AVAILABLE.
3. **Re-runs.** Two manual replays PASSED, trigger MANUAL, with the model-attempt count unchanged (zero gateway calls).
4. **Controls.** N1–N3 never publish and dispatch no action on a wrong element; any publication, proof or pass by a control is a hard zero (false pass). Every run: a scan of persisted sessions and model attempts, runner logs and artifacts, and recorded gateway request bodies where the environment can interpose a recording endpoint, finds 0 occurrences of any canary in raw, URL-encoded, `+`-encoded or split form (hard zero). Where interposition is impossible the gap is recorded and the wire test of WI-2 carries it.
5. **Reported with the verdict:** per-test learn and replay duration, model calls and tokens, clarifications, gate-refusal counts by diagnostics `Gate`, the product-admitted rate, and the p50/p95 of model time.

**Iteration.** The gate is binary and the whole suite re-runs after any fix, under a new run id; earlier results stay in the report. Same-day, the corpus `verify.mjs` must show the ground truth still resolves (a site change that breaks a ground truth voids that test for the run and needs @architect approval to replace it). On the screening numbers this ADR does not expect 14 of 14 on the first run (implied 5-step completion is 40.5%); three consecutive whole-suite runs with the same failure class escalate to the user under the revisit triggers [AUTO-DECISION].

## Revisit triggers

- The release gate fails three whole-suite runs on the same class of failure.
- Any wrong-unique replay or any false pass or leak in any run: delete the offending tier or gate path and re-run; two occurrences reopen this ADR.
- Any observed durability check shows wrong-unique results, or a Playwright upgrade breaks conformance.
- A model change moves the per-step rate by more than the SPK-07 confidence intervals.
- Compliance declines the new export shape (Amends).
- Upstream Playwright publishes ref resolution: reconsider the private engine under D7 item 4.

## Verification

- D1: a fixture page with 600+ nodes and 32 KB+ produces a non-empty outline of at most 40,000 bytes containing the target; no `budget` reason exists in the runner.
- D3: the golden vectors reproduce with 0 differences in Java; one test per gate asserts its diagnostics `Gate`.
- D4: grep of `frozen Guard` fixtures shows only grammar locators with `exact:true`; `unresolvedRole`, `matches(`, `acquire(` and `locatorHints` return 0 in `studio-runner/src`; replay uses only public Playwright methods (a lint rule or test bans `evaluate` on the replay path, as `no-dynamic-evaluation.test.ts` does today).
- D6: canary tests for D1 and D2 pass; the 6 radio tasks plan as `check`; the alpha read checklists show 0 `MISSING_SOURCE` over 10 reps.
- D8: `tools/check-studio-observed-contracts.cjs` passes; no `contracts/v4` directory exists.
- Release gate: the evidence report quotes the per-test table, the control results and the scan results with denominators.

— Aria (@architect), 2026-10-27
