# STUDIO-OBS-008 Q9: trigger for the KL-015-Q4 authored-literal hint

Author: Aria (@architect), 2026-10-17. I read source only. I ran no Gradle, Vitest, runner, model or build, and made no git write.
Inputs: 008 story conditional obligation a–d (`STUDIO-OBS-008.story.md:91-96`), the 015 ruling Q4 (`../../../STUDIO-OBS-015/execution-20261015/backend/b2-d3-diagnosis01/aria-append-ruling01/ruling.md`), the PO record (`…/po-kl015-q4-placement/decision.json`), and `lanes/L5b/receipt.md` §F1.1 and §F1.8.
Labels: **[V]** means read and cited. **[I]** means inferred and not executed.

## 1. Verification

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | The backend never emits `TARGET_MISMATCH` | **[V] confirmed** | `grep -c` gives 0 in `backend/src/main` and in `studio-runner/src`. The code is declared only in `contracts/v3/result.schema.json:217` (`failure.code`) and `error.schema.json:18`. `openapi.yaml` has 0 hits and only `$ref`s the result schema (`:1535`, `:1613`). The runner's ledger vocabulary has `TARGET_CHANGED`, not this code (`studio-runner/src/guided/types.ts:24`). |
| 2 | "An ungroundable step ends `RUNTIME_INCOMPATIBLE`" | **[V] true as a mapping, wrong as the KL-015-Q4 path** | The mapping exists: model `UNSUPPORTED` gives `MISSING_SOURCE`, otherwise `RUNTIME_INCOMPATIBLE` (`GuidedTranslationService.java:1713-1733`, after the login annotation at `:1714-1725`). But for a withheld element target, the model is never called. The acquisition gate in row 3 refuses first. |
| 3 | What KL-015-Q4 actually produces | **[V] new** | (a) The runner withholds every non-secret authored value, at start (`runtime.ts:239`) and at an append (`:281`). It drops any node whose name or locator hint echoes one of those values (`observationCollector.ts:498-505`).<br>(b) `acquireBeforeProposal` runs before every `NEXT_ACTION` (`GuidedTranslationService.java:959`). A `NEXT_ACTION` is refused while an acquisition is open (`:1494-1497`, `:1642`).<br>(c) `acquisitionAvailable` passes at once only for `navigate` and for `url`/`title` asserts (`:2556-2560`). Every other obligation (click, fill, selectOption, check, hover, press, read, and visible/containsText/hasValue asserts) needs an observed node whose name or locator hint equals `targetIntent` (`:2575-2594`). A withheld node can never satisfy that.<br>(d) The store returns `REFUSED "BUDGET_EXCEEDED"` on any of: 32 extra polls, 200 polls in total, the observation or evidence caps, or the end of the window (`GuidedTranslationStore.java:455`, `:501`, `:523-530`, `:612`). That leads to `failTranslation(BUDGET_EXCEEDED)` (`GuidedTranslationService.java:2666`, `:2698`), which sets `FAILED` and `progress.errorCode` (`GuidedSessionService.java:406`).<br>(e) The public result carries `errorCode: "BUDGET_EXCEEDED"`. `failure` is absent, because it is set only for `LOGIN_REQUIRED` (`GuidedSessionService.java:2917-2926`, `GuidedPublicationResultProjector.java:161-171`). The step shows `completed:false, actions:[]`, since actions come only from admitted facts (`GuidedPublicPresentationProjector.java:205-229`). `activeStep` is null (`:98`). |
| 4 | Real-run corroboration | **[V] artifact** | The 015 D3 mixed session ended `FAILED BUDGET_EXCEEDED`, `extraPolls 32`, because no node named "Reports" was ever observed (`b2-d3-diagnosis01/review.md:26-31`). The step text was "Click Sign in, click the Reports link and check protected Reports heading. Check page title is Reports." (`GuidedPublicationReplayIT.java:8266-8269`). |
| 5 | What the author sees today | **[V]** | The narrative is "This run reached its learning budget, so Studio stopped it." followed by "Nothing starts again on its own." (`GuidedCompletion.tsx:141-148`, `guidedNarratives.ts:266-275`). There is no hint, because the code list is `['TARGET_MISMATCH']` (`authoredLiteralHint.ts:27`). The leading-word predicate (`:39-43`) also returns false for the 015 sentence, which starts with "Click". So the only real instance we have would get no hint even with the right code. |
| 6 | Secondary paths, when acquisition matched some other node | **[I] not run** | The model may answer `UNSUPPORTED`, which gives `RUNTIME_INCOMPATIBLE`. It may ask an `INSUFFICIENT_EVIDENCE` clarification. It may propose a node whose name does not match, which gives `INVALID_CONTRACT` (`GuidedProposalValidator.java:339`). It may name an absent node, which gives `POLICY_DENIED UNGROUNDED_TARGET` for click, press or check (`GuidedActionGuard.java:171`), or a runner `TARGET_CHANGED` at prepare (`runtime.ts:330`), which gives `UNKNOWN_OUTCOME` (`GuidedRunnerClient.java:228`). None of these emits `TARGET_MISMATCH`. |

## 2. Can a landed outcome carry the hint?

| Code | KL-015-Q4 path? | Other causes behind the same code | Verdict |
|---|---|---|---|
| `TARGET_MISMATCH` | never emitted | — | Honest to the contract, but never shown |
| `RUNTIME_INCOMPATIBLE` | secondary only [I] | Definite context refusals; bootstrap or append delivery exhaustion (`GuidedTranslationService.java:333,455,641,1190,1238,1258`, `GuidedDispatchService.java:150`); model `UNSUPPORTED_CAPABILITY`. D-11: "names no cause" | **Rejected.** Mostly infrastructure, so the hint would mislead. |
| `BUDGET_EXCEEDED` | **primary, deterministic** [V] | Model input bytes (`GuidedTranslationService.java:1550-1553`), model reservation or CSI budget, provider overage, observation or evidence caps, session window | **Accepted** with the step-literal condition |

Why `BUDGET_EXCEEDED` is distinguishable enough:
- The acquisition refusal *is* the landed backend's "target not found". The precondition in (c), "that step's target-not-found narrative", exists today, under a code shared with other budget stops.
- The other causes behind this code are not tied to any step [I]. Acquisition refusals fall on steps whose target is named by the literal, and the step condition keeps the overlap narrow.
- The hint adds to the narrative and replaces nothing. The server's budget sentence stays on screen.
- The hint sentence is true whenever the predicate holds, because the runner withholds any node that contains the step's value. In the worst case it is irrelevant, never false.
- No landed field separates an acquisition refusal from a model-budget stop. That residual is accepted (R2), and it goes away with AE-01 f.

## 3. Ruling: option (ii), widened to `BUDGET_EXCEEDED`, with `TARGET_MISMATCH` kept

Show `authoredLiteralTargetNotFound` only when all four hold:
1. `result.outcome === 'FAILED'`.
2. `result.failure?.code ?? result.errorCode` is `'TARGET_MISMATCH'` or `'BUDGET_EXCEEDED'`.
3. `failedStepIdOf(result)` is non-null and that step exists in the current draft. This is unchanged: the step with a `FAILED` action, otherwise the first step not completed.
4. That step's draft text carries an authored literal under the clause predicate below.

Never show it for `RUNTIME_INCOMPATIBLE`, `UNSUPPORTED_SURFACE`, `ASSERTION_FAILED`, `POLICY_DENIED`, `LOGIN_REQUIRED`, `INVALID_CONTRACT` or `MISSING_SOURCE`, for any outcome other than `FAILED`, or for a clarification.

**Clause predicate.** This replaces the leading-word rule. It is still lexical and does no intent parsing. It is also closer to (c)'s "whenever the step **contains**".
- Split the text into clauses with `/[.,;:!?]|\b(?:and|then)\b/iu`.
- In each clause, split the trimmed text on whitespace.
- A clause carries a literal when its first word, lower-cased with non-letters removed, is in the existing verb set and at least one word follows. The verb set is `check verify assert expect confirm ensure`, `select choose pick` and `type enter fill input`.
- The step carries a literal when any clause does.
- Sanity check, run in scratch only: the 14 example strings in §4 give the expected values.

The copy is unchanged (`guidedNarratives.ts:314-325`). `GuidedCompletion` is unchanged, because its hint gate already admits kind `failed` (`:238-240`).

## 4. Instructions for the frontend implementer

Write set: `pages/ChecksStudioPage/authoredLiteralHint.ts`, `authoredLiteralHint.test.ts` and `pageGuidedRun.test.tsx`. Nothing else.

1. **`authoredLiteralHint.ts`**
   - Set `TARGET_NOT_FOUND_CODES = ['TARGET_MISMATCH', 'BUDGET_EXCEEDED']`.
   - Implement `stepCarriesAuthoredLiteral` with the clause predicate.
   - Rewrite the module comment. Cite this file. Say that `BUDGET_EXCEEDED` is the acquisition refusal (§1 row 3), that `TARGET_MISMATCH` is declared but not emitted, and that `RUNTIME_INCOMPATIBLE` is excluded and why.
2. **Unit test.** Build the payload as `structuredClone(fixtures.documents.loginResult)`, then delete `detail` and set `errorCode`.
   - For every code except `TARGET_MISMATCH`, do **not** set `failure`. That is the backend shape (§1 row 3e).
   - `TARGET_MISMATCH` keeps `failure` plus `errorCode`, as today.
   - P1: `BUDGET_EXCEEDED` with "Check the heading says Order confirmed" gives true.
   - P2: `BUDGET_EXCEEDED` with the 015 sentence from §1 row 4 gives true.
   - P3: the existing 5 `TARGET_MISMATCH` phrasings give true, and the same 5 under `BUDGET_EXCEEDED` give true.
   - C1, cause controls on the literal step: `RUNTIME_INCOMPATIBLE`, `UNSUPPORTED_SURFACE`, `ASSERTION_FAILED`, `POLICY_DENIED`, `INVALID_CONTRACT`, `MISSING_SOURCE`, `AMBIGUOUS_TARGET` and `LOGIN_REQUIRED` (keeping its `detail`) all give false.
   - C2, step controls under `BUDGET_EXCEEDED`: the existing 5, plus "Click the Check out button", "Click Terms and Conditions" and `Go to "https://select.example.test"`, all give false.
   - C3: `EXPIRED`, `UNKNOWN_OUTCOME` and `SUCCEEDED` give false. A step that is not in the draft gives false.
3. **Page tests (MSW).** Use the existing `studioMockServer.use` override with the L2b mirror's `resultFor`, following the pattern of the governed `POLICY_DENIED` test.
   - Body: `outcome:'FAILED'`, `publication:{status:'REFUSED',receipt:null}`, `explanation:{completed:1,reusedBefore:0,baseRevisionId:null,failedIndex:null}`, `errorCode:'BUDGET_EXCEEDED'`, `failure:null`, `detail:null`. With this, step 2 has no action, as in landed `loginResult` and the backend.
   - Do **not** use `endsIn` here. It adds `failure:{code}` and a `FAILED` action (`guidedHandlers.ts:366-377`, `guidedFixtures.ts:287-305,597`), and the backend never sends either on this path.
   - G1: step 2 is "Check the heading says Order confirmed". Expect `data-kind="failed"`, the budget sentence and `guided-authored-literal-hint`.
   - G2: the same result with step 2 `Click "Sign On"`. Expect the budget sentence and no hint.
   - G3: the literal step with `errorCode:'RUNTIME_INCOMPATIBLE'`. Expect `failedUnnamed`, the code shown, and no hint.
   - Keep the 4 existing KL-015-Q4 page tests.
4. **Verify**, from `frontend/`:
   - `pnpm exec vitest run src/pages/ChecksStudioPage/authoredLiteralHint.test.ts src/pages/ChecksStudioPage/pageGuidedRun.test.tsx src/components/studio/guided`
   - `pnpm run type-check`
   - `pnpm run lint`, with warnings at most the baseline of 308.
   - The a11y audit is L6's job. The hint adds no new surface.
5. **Dev Agent Record, (c) choice note.** Cite this file, state the four-part rule, and list R1–R4.

## 5. Residuals, carried by this ruling

@po should cite this file in 009 AUTHORED-ECHO-01 and in the 008 Dev Agent Record.
- **R1 Cross-step.** A literal in another step hides this step's target. This is Q4's headline case. No hint shows, because the copy says "this step". AE-01 removes the cause.
- **R2 Shared code.** The hint can appear on a model, CSI, cap or window `BUDGET_EXCEEDED` at a step that carries a literal. It is true there but may be irrelevant. AE-01 f removes it.
- **R3 Secondary paths.** The paths in §1 row 6 get no hint [I].
- **R4 For 009 AE-01 e.** `authoredEchoUnobservableTargets` cannot be counted from a target code. Today these runs end `FAILED BUDGET_EXCEEDED`. The AE-01 b/c cases should pin that outcome as the "before" state.
- **F-1 (observation; no change ruled).** The L2b mirror sends `failure` for every code. The backend sends it only for `LOGIN_REQUIRED`. The UI reads `failure?.code ?? errorCode`, so behaviour is the same.

## Decisions, trade-offs, security
- `[AUTO-DECISION]` (i), (ii) or (iii)? I chose **(ii) with `BUDGET_EXCEEDED`**, because it is the outcome the author really gets (§1 rows 3–4) and it needs no new field. (i) and (iii) would leave the hint dark until AE-01. `RUNTIME_INCOMPATIBLE` is mostly infrastructure.
- `[AUTO-DECISION]` `TARGET_MISMATCH` is kept, because it is the contract's declared target code, it costs nothing, and the tests already cover it.
- `[AUTO-DECISION]` Clause predicate instead of leading word, because the leading-word rule misses the only observed real case (§1 row 5), and (c) says "contains".
- Trade-off: the hint can be irrelevant on a non-acquisition budget stop (R2), in exchange for a true hint on the common path.
- Security: frontend only. It reads the author's own draft text and closed codes. It shows no page-derived text and no literal value. No contract, field, migration or runner change. Studio is unreleased, so there is no compatibility concern.
