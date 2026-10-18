# STUDIO-OBS-009 MODEL-SIZING: ruling draft (T4 blocker F2 / B7)

- **Author:** Aria (@architect). Date 2026-10-18. Mode YOLO. **Status: DRAFT. The @architect part is ruled here. It takes effect only after the @pm acknowledgement in §9.** That is the governance the story requires: "Any change to a bound goes back to @architect as a ruling with @pm acknowledgement" (story Dev Notes, carried note F-1; story MODEL-SIZING placement).
- **Legend:** **[V]** = I read the cited file:line, or the cited evidence file, today. **[I]** = inference, with its basis stated. **[A]** = arithmetic on [V] inputs.
- **Not done:** no model or provider call. No test, build, Gradle, docker or dist run. No edit outside this folder. No git operation.
- **Inputs read:** `execution-20261018/ep/` (receipt.md, b7-proposals.json, b7-all-sessions.json, b7-measured-summary.json, budget-admission.json, budget01/02.out). Story `STUDIO-OBS-009.story.md` (AC-7, T4, Dev Notes carried note F-1, the MODEL-SIZING placements, GO conditions). `prep-20261016/t0-rulings/ruling.md` §5 (B8, U7). `prerequisite-register.json` (U17, U18). `prep-20261016/qa/budget-admission-draft.md` and `t0-qa-20261017.md` §3.5. ADR-SC-005 (D-C, D-D). `consensus-plan.md` §8.2. `STUDIO-OBS-012A/root/architect-rulings-d1-d2.json` (DECISION-1, F-1). The 2026-10-04 compile benchmark `summary.json`. The backend, runner and harness code cited below.

---

## 1. The problem, with numbers

### 1.1 What the code enforces [V]

| Bound | Value | Where |
|---|---|---|
| Per-call output ceiling, reserved in full before every send | 4096 | `GuidedTranslationProperties.java:15` (`@DefaultValue("4096") maxOutputTokens`, bound 1..32000 at `:26`); passed as `request.maxOutputTokens()` to `modelReservationFitsLocked` / `reserveModel` at `GuidedTranslationService.java:1556-1557`, `:1596-1602`; sent to the provider as `min(request, gateway)` at `GenAiGuidedLlmGatewayClient.java:158` |
| Session output total | 32,000 | `GuidedSessionProperties.java:18`, `:40`; schema `contracts/v3/limits.schema.json:38-43` (**`maximum` 32000 = `default`**) |
| Session input total, counted in bytes as tokens | 262,144 | `GuidedSessionProperties.java:17`, `:39`; schema `limits.schema.json:32-37` (`maximum` = `default` = 262144, DECISION-1) |
| Session proposals | 100 | `GuidedSessionProperties.java:16`; schema `:26-31` |
| Per-call input | 65,536 bytes (wire bytes + 2048 allowance) | `GuidedTranslationProperties.java:14`; computed at `GuidedTranslationService.java:1547-1551` |
| Admission check (proposals +1, input + bytes, output + ceiling, all against the session totals), then the per-CSI daily charge at the call's ceilings with no refund | — | `GuidedSessionService.java:243-269` (checks `:252-256`, CSI charge `:265`) |
| Reserve, one proposal per **attempt** | — | `GuidedSessionService.java:1528-1550` (`reserve(... "modelProposals", 1 ...)` at `:1543`) |
| No refund at settle; overage is charged; a missing usage report keeps the ceiling | — | `GuidedSessionService.java:1555-1608` |
| Up to 3 attempts per proposal (repairs). Each new attempt reserves again, so a repair costs a proposal and 4096 output | — | `GuidedTranslationService.java:1452` (`index <= 3`), `:1554-1557`, `:1830-1834` |
| A finish reason other than `STOP` (for example a truncated `MAX_TOKENS`) becomes `INVALID_RESPONSE`, which leads to a repair attempt | — | `GenAiGuidedLlmGatewayClient.java:82-84`; `GuidedTranslationService.java:1830-1834` |
| Reported output = candidates + **thoughts** tokens | — | `GenAiGuidedLlmGatewayClient.java:197-202` |
| Per-CSI daily budget: 3 concurrent sessions, 5,242,880 input / 640,000 output; start-up requires daily ≥ one full session | — | `GuidedCsiBudgetProperties.java:16-18`, `:24-31`; `application.yml:231-235` |
| The chart sets none of these keys, so the deployed values are the code defaults | — | `helm-chart/put-checks/` grep: only `STUDIO_GATEWAY_MODEL` (`templates/deployment.yaml:200`) |
| Pinned model and thinking level | `gemini-3.8-flash`, `LOW` | `application.yml:390`, `:402` |

The output floor is therefore **floor(32,000 / 4,096) = 7 proposals per session**. [A] This is pinned by `GuidedDefaultModelReservationIT.java:157-160` and `:270-312` (seven reservations, the eighth refused).

### 1.2 What B7 measured [V `ep/b7-proposals.json`, `b7-all-sessions.json`]

The local fixture provider played an ideal model: no repairs and no clarifications. The run was `guidedIncrementalTest`, which runs at the fixture per-call ceiling of 2048 (`build.gradle.kts:278-289`, profile `incremental2048`). The session totals were the production defaults (`sessionLimits` = 262,144 / 32,000 / 100).

| Session | Proposals | Output reserved at 4096 [A] | Share of 32,000 | Input reserved (bytes) | Share of 262,144 |
|---|---|---|---|---|---|
| 10-step base learn (edit-4 and insert cases) | **13** | 53,248 | **166 %** | 218,206 | 83 % |
| edit-4 incremental (relearn 4..10) | 9 | 36,864 | 115 % | 159,092 | 61 % |
| insert-step incremental | 10 | 40,960 | 128 % | 176,954 | 68 % |
| Peak across 70 sessions | 14 | 57,344 | 179 % | — | — |

54 of the 70 sessions need more than 7 proposals. Average input per call in the base learn: 218,206 / 13 = 16,785 bytes. [A]

### 1.3 What this means for AC-7

1. **The AC-7 gate cannot be reached at today's defaults, even with a perfect model.** [A on V] The two incremental workflows are in class P. Each base learn needs 13 proposals, more than 7, so it ends `FAILED BUDGET_EXCEEDED` before step 8. That gives 2 × 3 = 6 failed runs out of 57. The gate is ≥ 52 completions and ≤ 5 failures (`ep/receipt.md` corpus facts), and 57 − 6 = 51 < 52. This is a configuration defect. It says nothing about model quality.
2. **The failure probably reaches further.** [I] With one data point, a 10-step learn needs about steps + 3 proposals (relearning 7 steps took 9, relearning 7 steps plus an insert took 10). Read against the corpus step counts [V `pages/*/step-text.json`: C05 5, C06 6, D1 7, D3 6], C05, C06, D1 and D3 (plus D2 and E1 when unblocked) would also pass 7. That would be about 8 of the 19 class-P cases.
3. **A real model adds proposals, and the fixture cannot show this.** [V code] Every repair is a new attempt that reserves another proposal and another 4096. Any non-`STOP` finish triggers a repair. A local run can refute the "7 is enough" assumption but cannot confirm any number (the EP caveat).
4. **Input is the next wall.** [A] If only the output total were raised, input would cap a session at about 262,144 / 16,785 ≈ 15 proposals on fixture-sized pages. Real pages are larger: the observation alone may be up to 32,768 bytes (`GuidedSessionProperties.java:19`), and a call up to 65,536. **The output and input totals must move together.**
5. **The spend is wasted today.** [I] A 13-proposal learn that is refused at proposal 8 has already reserved and paid for 7 calls and produces nothing.

### 1.4 Why the per-call ceiling of 4096 stays

There is no guided real-model data. The only same-model data is the 2026-10-04 compile benchmark, run on `gemini-3.8-flash` with `LOW` thinking [V `UI-STUDIO-VALIDATION-20261004/benchmark/summary.json`]:
- output p95 was 423-434 tokens, with a maximum of 1,293 across 342 calls;
- thoughts p95 was 411-2,289 tokens across the LOW stages (S1 874, S5 411, S8 2,289, X1 589).

Our accounting counts thoughts as output [V `:201-202`]. Whether the gateway's `maxOutputTokens` also caps thoughts is not known [I: Gemini-family behaviour; ED-01 owner to confirm, same question as U18]. If it does, a 2048 ceiling would truncate the S8-like calls. They would finish without `STOP`, be repaired and use more proposals. 4096 covers the worst observed LOW case (2,289 + 1,293 = 3,582). [A] The compile prompts differ from the guided ones, so this supports 4096 but does not prove it. [I]

---

## 2. Options

The ACs each option moves are listed in §5.

### Option A: Raise the session envelope (output **and** input) and keep 4096 per call. **Recommended.**

- **Change.** Contract `limits.schema.json`: raise `maxModelOutputTokensTotal` and `maxModelInputTokensTotal`, and set the schema `maximum` above the `default` (sub-option A-ii below). Update the Java defaults in `GuidedSessionProperties`. Re-anchor the session schema epoch in `GuidedContracts.java:110-115` (DECISION-1 is the precedent). Regenerate the runner schema bundles, because `runner-context.schema.json:116-117` and `session.schema.json` `$ref` limits, and rebuild `dist` once. Update the test pins and the admission formula in the harness. Full list in §7.
- **Values (my ruling, technical):**
  - Target **P = 24 proposals per session**. That is 13 measured for an ideal 10-step learn, plus 11 for repairs and clarifications (about 1.85×, above the ×1.5 contingency the admission already uses).
  - `maxModelOutputTokensTotal` **default 98,304** (24 × 4096).
  - `maxModelInputTokensTotal` **default 786,432** (24 × 32,768, the observation byte cap as a per-call average). Fixture-sized calls would allow 46.
  - `maxModelProposals` stays 100. Output becomes the binding bound at 24. I do not change a third key.
  - Per-call output stays 4096 and per-call input stays 65,536.
- **Sub-option A-i: `maximum` = `default`, as in DECISION-1.** The pin is strict, but every recalibration after T4 is another contract change, schema re-epoch and runner rebuild.
- **Sub-option A-ii: `maximum` > `default`. Ruled.** Output maximum 131,072 (32 × 4096). Input maximum 1,572,864 (24 × 65,536, the strict worst case where every call is at the per-call cap). Later tuning inside the maxima is configuration only (relaxed-binding environment variables; there is no chart key today). It is still governed by "architect ruling + PM ack". The cost: a misconfigured deployment could run up to the maxima. That stays bounded by the per-CSI daily budget, and `requireFits` still holds (98,304 and 131,072 ≤ 640,000; 786,432 and 1,572,864 ≤ 5,242,880). [A]
- **Cost and budget effect.**
  - Worst-case reservation per session goes up about 3.07× (output) and 3× (input). Expected cost per learned step is unchanged, because reservations are per call (4096 each). A 13-proposal learn reserves 53,248 output under any session total. Today the same session wastes 28,672 and fails. [A]
  - Capacity per CSI is set by calls, not sessions. 640,000 / 4096 = **156 calls per CSI per day**. That is about 12 ten-step base learns, or 6.5 sessions that use the full 24 proposals. [A] The `application.yml:231` comment ("20x the per-session ceilings") becomes false; with these values it is about 6.5×.
  - Benchmark estimate (§4): about 579 proposals (869 with ×1.5). Reserved output is about 2.37M (3.56M), which **fits inside the existing ledger caps of 3,904,000 output and 31,981,568 input.** The harness formula `sessions × session total` (`evaluate.mjs:644-645`) would inflate those caps 3×, so it has to change (§7 item 9).
- **Risks.**
  1. Contract change late in the wave: a session schema re-epoch, a runner bundle regeneration and a dist rebuild. Mitigation: do it in the same rebuild that AUTHORED-ECHO-01 and FOCUS-MUTATION-01 already need before the first real call. That makes one new dist digest, not two.
  2. **Backend and runner must deploy together.** A runner on the old bundle would refuse a limits value above 32,000 in the runner context (schema mismatch). @devops rolls both images in one release. [I: runner validates the context against its bundle; consistent with the canonical-v1 context refusal ruling.]
  3. 24 is still a guess until T4. T4 must publish the proposals-per-session distribution. If p95 is above 20, or any class-P run ends `BUDGET_EXCEEDED`, re-rule before OBS-010. Under A-ii that is a configuration change.
  4. Session time: 24 calls at the compile-era LOW p95 latency of about 15.7 s is about 377 s of model time, against `maxSessionSeconds` 600. [A; latency from a different prompt, I] T4 publishes p95 session time. No change now.
  5. **Product limit to disclose:** at P = 24, one session can learn about 21 steps with an ideal model (steps + 3), and fewer with repairs [I]. `maxSourceSteps` is 100 (`GuidedSessionProperties.java:26`), so a test with more than about 20 steps cannot learn in one Run. D-D incremental re-learn helps with edits, not with a first learn.

### Option B: Lower the per-call output ceiling to at most 2,461 (for example 2048, which gives 15)

- **Change.** Configuration only: `studio.guided-authoring.translation.max-output-tokens: 2048` and the `GuidedTranslationProperties` default. Plus the test pins `GuidedDefaultModelReservationIT.java:157` and `:295-312` (7 → 15, 28,672 → 30,720). No contract change and no runner rebuild.
- **Cost.** Halves the per-call reservation, so CSI capacity doubles to 312 calls per day. Billed tokens are the same.
- **Risk. High.**
  1. Truncation: LOW thoughts reached 2,289 in compile-era data, and thoughts count in our output accounting. A truncated call does not finish with `STOP`, so it becomes `INVALID_RESPONSE` and a repair, which uses another proposal. At worst the session fails `INVALID_CONTRACT` after 3 attempts.
  2. 15 proposals leave 2 for a measured 13. The real-model repairs would exceed that.
  3. Input still caps the session at about 15 (§1.3.4).
  4. The fixture lane passing at 2048 is exactly how F-1 stayed hidden for a whole wave.
- **Ruling: rejected.**

### Option C: Chunk the base learn into several sessions, each with its own envelope

- **Change.** Product and ADR level. The orchestrator would learn steps 1..k, publish a partial revision, then start a further session from k+1 using the D-D incremental machinery.
  - That needs a new session-chain state.
  - It needs a "partial publication" notion, which ADR-SC-005 D-A does not have (the first Run publishes the exact exercised plan of the whole test).
  - Public API and UI changes, and per-CSI concurrency interplay.
  - It also changes what AC-7's incremental oracle means: "zero model calls for 1..k-1" would hold for artificial chunks too.
- **Cost.** More sessions with the same calls. Each extra session re-pays its context prefix in input.
- **Risk.** A large redesign after G9 for a numeric bound.
- **Ruling: rejected for 009.** It may be reconsidered post-GA as the answer to the more-than-20-steps limit (A risk 5).

### Option D: A larger-context or larger model tier

- **What it would change.** The pinned model (`application.yml:390`, `STUDIO_GATEWAY_MODEL`) and, with it, the pinned versions and the ED-01 price list.
- **Why it does not help.** The envelope is our own reservation accounting, not the model's context window. A call uses about 17 KB of bytes (a few thousand tokens), far below any tier's window. A stronger model might need fewer repairs, but it still needs at least one proposal per step plus planning. The 7-proposal floor would not move. On 2026-10-04 the `pro` tiers were also 404 on the project used (budget-admission-draft F13, not re-probed [I]), and they cost more per token [I].
- **Ruling: rejected as a fix.** The model choice stays a separate D-C pin.

### Rejected alternative recorded for completeness: E, refund to reported usage at settle

This would keep 32,000 but refund each reservation down to the provider-reported usage. The DECISION-1 ruling already rejected it ("reverses translation-design's retain/no-refund and audit model … ADR-level change"). It would also make admission depend on provider usage reports, which can be missing (`settleModel` keeps the ceiling on null). Not reopened.

---

## 3. Recommendation

**Option A-ii.** Session output total 98,304 (schema maximum 131,072). Session input total 786,432 (maximum 1,572,864). Per-call 4096 and 65,536 unchanged. `maxModelProposals` 100 unchanged. Per-CSI daily defaults unchanged, with the comment corrected. Delivered in the same dist rebuild as AE-01 and FM-01, and the benchmark admission caps computed from planned proposals, not from session totals.

Why: it is the only option that removes the by-construction AC-7 failure (§1.3.1) without a truncation risk (B) or a redesign (C), and without pretending that a model change helps (D). It does not raise the expected cost of a learned step. It keeps the reserve-before-send and no-refund safety model untouched. The benchmark admission token caps already on file in the ledger still cover it. [A]

---

## 4. Benchmark sizing under A (input to the @pm and user decisions) [I with A]

- Estimate per repetition, using proposals ≈ steps + 3 for a base learn and the measured 9 and 10 for the incrementals. D2 is assumed 7 steps and E1 5, because neither has step text.
  - 193 proposals per repetition, 579 for 3 repetitions, **869 with ×1.5**.
  - Output reserved 579 × 4096 = **2,371,584** (3,557,376 with ×1.5).
  - Input reserved at fixture size 579 × 16,785 = 9.72M (14.58M). At twice fixture size, 29.2M with ×1.5.
  - The existing ledger caps of 3,904,000 output and 31,981,568 input cover all of these. [A]
- **Per-CSI days at the current daily defaults:** 2.37M / 640,000 = **3.7, so at least 4 CSI-days** (5.6, so at least 6, with contingency). Output is the binding side. [A] (Quinn's earlier "≥ 5 CSI-days" used sessions × ceilings. The call-based figure replaces it.)
- **Dollars.** Cannot be computed (B8). The upper bound under the ledger caps, using reserved bytes as tokens (conservative, since bytes ≥ tokens [I]) and prices in USD per million tokens:

  cost ≤ 31.98 × p_in + 3.90 × p_out

  Billed output per call is expected to be far below 4096 [I: compile-era LOW output plus thoughts, p95 below about 2.7k]. Billed input tokens are expected to be about bytes / 3-4 [I]. The real bill should be well under this bound, but nobody may admit on that inference.

---

## 5. ACs and stories each option moves

| | A (recommended) | B | C | D |
|---|---|---|---|---|
| AC-7 benchmark | Unblocks: the incremental and longer cases no longer fail by construction. Pinned-version block records the new limits, the session schema epoch and the new dist digest. `budget-admission.json` `enforcedCaps` and `measuredProposalsPerSession` are updated. Gate, corpus and thresholds **unchanged**. | Same unblock with a truncation risk; pinned per-call value changes | Redefines the incremental oracle; needs a @po AC change | No effect on the blocker; re-pins the model |
| AC-8 schema probe | No effect: 3 calls, per-call unchanged; ledger caps for `ac8-schema-probe` already per-session | none | none | Re-probe on the new model |
| AC-9 / AC-10 real-model halves | No effect | none | API surface changes | re-run |
| AC-12 deployed E2E real-model learn | Longer learns become possible on the deployed stack | as A, with risk | changes | — |
| AC-1 / dist | One new dist digest, shared with the AE-01 / FM-01 rebuild | none | large | none |
| STUDIO-OBS-014 AC-8 (per-CSI budget, Done) | Invariant `requireFits` still holds; daily defaults unchanged; capacity disclosed | doubles capacity | — | — |
| STUDIO-OBS-012A DECISION-1 / consensus §8.2 | Superseded in part by a new §8.3 amendment (input total, output total, maxima ≠ defaults) | §8.2 per-call text changes | ADR change | — |
| OBS-010 AC-4 release readiness | MODEL-SIZING row: values, T4 distribution, the more-than-20-steps limit | — | — | — |
| Story Dev Notes carried note F-1 | Closed by this ruling plus @pm ack. The T4 recalibration duty stays. | — | — | — |

No story AC text changes under A. @po only needs to note the ruling reference in the carried note and the MODEL-SIZING placement.

---

## 6. Who decides what

| Item | Owner | My ruling or default |
|---|---|---|
| Option shape (A-ii), rejection of B, C, D and E, keeping 4096 per call, P = 24, the values and maxima, the admission caps from planned proposals, the dist rebuild bundled with AE-01 / FM-01, the post-T4 re-rule trigger (p95 above 20 or any class-P `BUDGET_EXCEEDED`) | **@architect (ruled here)** | — |
| Acknowledge the per-session cost exposure (worst case about 3× per session) | **@pm** | acknowledge |
| Per-CSI daily defaults: keep 640,000 / 5,242,880 (156 calls per CSI per day) or raise them to keep "20 full sessions" (1,966,080 / 15,728,640) | **@pm** | **keep** for 009; decide for the pilot in OBS-010 with T4 data |
| Benchmark scheduling: spread over ≥ 4 CSI-days (≥ 6 with contingency), or a temporary benchmark-only daily raise with the revert recorded | **@pm** (QA item B4) | **spread**: no runtime pin changes |
| The more-than-about-20-steps learn limit: disclose as a known limit in OBS-010 or reduce `maxSourceSteps` (a contract change) | **@pm** | **disclose**; do not change `maxSourceSteps` in 009 |
| **B8 / U17:** remaining headroom R under the USD 500 wave ceiling, and whether benchmark provider spend shares that pool | **user** | none; no admission without it |
| **B8 / U18:** gateway price list (p_in, p_out) for the pinned model; whether thoughts bill as output; whether `maxOutputTokens` caps thoughts | **ED-01 owner** (TBD, GA plan D-3) | none |
| **U7:** signing the budget admission | **user**, after B8 | — |
| Deployment: backend and runner roll together | @devops | — |

**This ruling does not unblock T4 by itself.** T4 still needs B8, U7, ED-01, the deployed stack, and AE-01 / FM-01 landed. This ruling removes the configuration defect that would otherwise fail the gate however good the model is.

---

## 7. Change list for @dev, applied after G9 (no edits now)

Apply this in one unit, in the same window as the AE-01 / FM-01 runner rebuild, under the Gradle lock and the 009 collector rules.

1. `docs/specs/studio-observed-authoring/contracts/v3/limits.schema.json`
   - `maxModelInputTokensTotal`: `maximum` 262144 → **1572864**, `default` 262144 → **786432** (`:32-37`).
   - `maxModelOutputTokensTotal`: `maximum` 32000 → **131072**, `default` 32000 → **98304** (`:38-43`).
   - Nothing else.
2. Regenerate the bundles with `tools/build-studio-observed-schemas.cjs`: `studio-runner/src/guided/schemas.json` and `studio-runner/src/validator/observedSchemas.json`. Then run `tools/check-studio-observed-contracts.cjs`. The generated `Limits` types (`studio-runner/src/guided/types.ts:63`, `src/executor/observedOperations.ts:86`) are `number` and should not change. [I]
3. `backend/.../guided/session/GuidedContracts.java:110-115`: new `SESSION_SCHEMA_EPOCH` (hash of the regenerated session root), with the comment extended ("MODEL-SIZING 2026-10-xx: limits output/input defaults and maxima"). Confirm that no other epoch covers `runner-context`; today only session, replay-validation, ledger and observation have one (`:205-218`). [V]
4. `backend/.../guided/session/GuidedSessionProperties.java`: `:17` → `@DefaultValue("786432")`, `:18` → `@DefaultValue("98304")`, `:39` → `786432`, `:40` → `98304`.
5. `GuidedTranslationProperties.java`: **no change** (4096 and 65,536 stay). `GuidedCsiBudgetProperties.java`: **no change**.
6. `backend/src/main/resources/application.yml:231`: correct the comment. Suggested text: "Daily defaults hold 156 calls at the 4096 per-call reservation, about 12 ten-step base learns or 6.5 full-envelope sessions (MODEL-SIZING ruling 2026-10-xx)." Values unchanged unless @pm rules otherwise.
7. Tests:
   - `GuidedDefaultModelReservationIT.java:157-160`: pin 98,304 / 786,432. Rename `sevenAndRefuseEighth` (`:295`) to twenty-four-and-refuse-twenty-fifth. Expected `modelOutputTokens` 28,672 → 98,304 (`:306`). Counts 7 → 24 at `:270`, `:287-288`, `:292`, `:308`, `:311-312`, `:319`, `:330-331`.
   - Add one case: **13 reservations at 4096 fit under production defaults** (the B7 base learn), named for B7.
   - `GuidedPublicationReplayIT.java:4013-4018`: pin the new totals. Add to the budget evidence a derived production-ceiling check, `proposals × 4096 ≤ maxModelOutputTokensTotal`, recorded as derived, not as a run. The incremental lane stays `incremental2048` (`build.gradle.kts:278-289`; the closed profile refuses overrides, EP §4).
   - `GuidedSessionIT.java:388-399` uses explicit small limits: no change.
   - Contract fixtures (`contracts/v3/fixtures.json`, `planning-fixtures.json`, `publication-fixtures.json`), `backend/src/test/resources/studio/guided/session-it-documents.json:53-54` and `studio-runner/test/helpers/guided.ts:11` carry values below the new maxima and stay valid: no change. [I: the schema has no `const`; re-verify with the contract check]
8. Rebuild the runner `dist` once (bundled with AE-01 / FM-01). Record the new digest in the build receipt and in the AC-7 pinned block.
9. Evaluation harness (tooling, not product):
   - `studio-runner/evaluation/cli.mjs:20`: `enforcedCaps` defaults to 786432 / 98304.
   - `evaluate.mjs:644-645`: compute the admission token caps from an explicit plan (`plannedProposals × maxOutputTokensPerCall` for output; `plannedProposals × inputBytesPerCallAssumption`, or an explicit @pm cap, for input) instead of `sessions × session totals`.
   - `evaluate.mjs:1029`: the stop rule's conservative fallback for a session with no reported usage uses that session's **recorded reservations**, not the session totals.
   - Append a new `budget-admission.json` entry. It is still `ADMISSION_REFUSED_PRICE_UNKNOWN` until B8, but now carries the new `enforcedCaps` and this ruling's reference.
10. Docs (owners as noted; @dev does not author them):
    - `consensus-plan.md` §8.3 amendment, text by @architect after the @pm ack.
    - Story 009 carried note F-1 and the MODEL-SIZING placement get the ruling pointer (@po).
    - OBS-010 AC-4 MODEL-SIZING row (@po / @pm).
11. Deployment (@devops): backend and runner images in one rollout. The chart needs no new keys.
12. Narrowest verification after the change (named, not run here):
    - `GuidedDefaultModelReservationIT`;
    - the contract check tool;
    - the `guidedIncrementalTest` budget-evidence methods in `GuidedPublicationReplayIT` (dist-bound, collector rules);
    - the runner schema / validator unit tests;
    - `studio-runner/test/evaluation/budgetAdmission.test.ts`.

    No migration (no DB CHECK on limits [V: no `maxModel*` under `backend/src/main/resources/db`]), so @data-engineer is not needed.

**T4 duty that this ruling adds:** publish the per-session proposals distribution (p50 / p95 / max), repairs per session, reserved vs reported input and output per call (thoughts separated), and session wall time, with denominators, next to `benchmark.json`. Re-rule if the trigger in §6 fires.

---

## 8. Open unknowns (none blocks the ruling)

- Whether the gateway's `maxOutputTokens` includes thoughts. [I, ED-01]
- Real page input bytes per call. [unmeasured; the 32,768 average is an assumption]
- The real repair and clarification rate per session. [unmeasured]
- Whether any runner-side digest outside the regenerated bundles pins `limits.schema.json`. [I: not found in grep of `studio-runner/src`; confirm in step 2]

---

## 9. @pm acknowledgement (UNSIGNED)

```
ruling: STUDIO-OBS-009 MODEL-SIZING, option A-ii
  session output total default 98304 (schema maximum 131072)
  session input total  default 786432 (schema maximum 1572864)
  per-call output 4096, per-call input 65536, maxModelProposals 100: unchanged
per-CSI daily defaults (640000 / 5242880):   [ ] keep   [ ] raise to ______ / ______
benchmark scheduling:                         [ ] spread over >= 4 CSI-days   [ ] temporary raise (revert recorded)
>~20-step single-session learn limit:         [ ] disclose in OBS-010   [ ] other: ______
re-rule trigger after T4 (p95 > 20 proposals or any class-P BUDGET_EXCEEDED): [ ] accepted
acknowledged by: ____________ (@pm)   date: __________
notes:
```

B8 (headroom R and the price list) and U7 (admission signature) are **not** part of this acknowledgement. They stay with the user and the ED-01 owner.

### 9.1 @pm acknowledgement: SIGNED 2026-10-18 (append-only; the unsigned template above is left as drafted)

- **Signed by:** Morgan (@pm), autonomous YOLO run on the lead's instruction. Date **2026-10-18**.
- **Legend:** as in the header. [V] = I read it today. [A] = arithmetic. [I] = inference.
- **Read for this acknowledgement:** this draft §1-§8; story `STUDIO-OBS-009.story.md` (T4 line 495 and its 2026-10-18 PO precondition note; "Carried note — per-session model budget calibration" lines 536-543; MODEL-SIZING placements lines 649 and 659; "PO notes — W3 carries and pre-G9 rulings" item e, lines 926-931); `ep/receipt.md` §4, §6 and §8; `GuidedSessionService.java:226-270`.
- **Not done:** no test, build, provider call, story AC edit, source edit or git operation.

```
ruling: STUDIO-OBS-009 MODEL-SIZING, option A-ii                          -> ACKNOWLEDGED, values unchanged
  session output total default 98304 (schema maximum 131072)
  session input total  default 786432 (schema maximum 1572864)
  per-call output 4096, per-call input 65536, maxModelProposals 100: unchanged
per-CSI daily defaults (640000 / 5242880):   [x] keep   [ ] raise to ______ / ______
benchmark scheduling:                         [x] spread over >= 4 CSI-days   [ ] temporary raise (revert recorded)
                                              amended: plan >= 6 CSI-days; recount on the binding side (output or input)
>~20-step single-session learn limit:         [x] disclose in OBS-010   [ ] other: ______
re-rule trigger after T4 (p95 > 20 proposals or any class-P BUDGET_EXCEEDED): [x] accepted, with amendments (9.1.5)
acknowledged by: Morgan (@pm)   date: 2026-10-18
notes: see 9.1.1-9.1.6. B8/U17, U18 and U7 are NOT acknowledged here (9.1.6).
```

#### 9.1.1 Session totals: acknowledged as ruled, no value amended

- **Decision.** Acknowledge A-ii: session output default **98,304** (maximum 131,072), session input default **786,432** (maximum 1,572,864). Per-call 4096 / 65,536 and `maxModelProposals` 100 stay. I amend no value.
- **Why.**
  1. Today's 32,000 makes AC-7 fail by construction even with a perfect model: 13 proposals for a 10-step base learn against a floor of 7, so 51 of 57 completions against a gate of ≥ 52 (§1.3.1, B7 [V `ep/receipt.md` §4]). The gate would measure our config, not the model. A failed gate here wastes real money.
  2. Option A does not raise the expected cost of a learned step. Reservations are per call, and a 13-proposal learn reserves 53,248 under any session total (§2 A, [A]). It removes waste: today the same session reserves 28,672 and produces nothing (§1.3.5).
  3. **Daily money exposure per CSI does not change.** The per-session worst case rises about 3×, but the per-CSI daily ceiling (640,000 out / 5,242,880 in) is what bounds a day's spend, and it stays (9.1.2). This is the cost exposure I am acknowledging: **about 3× per session, unchanged per CSI-day.** [A]
  4. Rejecting B (2048 per call) is right from a product view as well. Thoughts count as output, LOW thoughts reached 2,289 [V §1.4], and truncation turns into repairs, which cost proposals anyway.
- **Conditions attached to the A-ii maxima** (governance, not values):
  - The maxima exist so that T4 recalibration does not need another contract change. Running any deployment above the 98,304 / 786,432 defaults still needs a new @architect ruling with @pm acknowledgement (as §2 A-ii says). @devops records any non-default value in the AC-7 pinned-version block. There is no chart key today, so a non-default would come only from an environment variable, and that must not happen silently.
  - The value **24 is a planning guess until T4** (§2 A risk 3). This acknowledgement does not turn it into a capacity claim. The OBS-010 record must say "sized from fixture B7 plus ×1.85 contingency, recalibrated by T4".

#### 9.1.2 Per-CSI daily budget: KEEP 640,000 / 5,242,880 for 009

- **Decision.** Keep. Revisit for the pilot in OBS-010, on T4 data.
- **Why.**
  1. With U17 (headroom R) and U18 (price list) unknown, the daily per-CSI cap is the only hard spend bound we control. Raising it now would raise the money exposure with no data behind it.
  2. STUDIO-OBS-014 AC-8 is Done, and its invariant still holds: `requireFits` gives 98,304 ≤ 640,000 and 786,432 ≤ 5,242,880 (§2 A-ii, [A]). Keeping the cap needs no re-verification of a Done story.
  3. Capacity is enough for 009 and an early pilot: 156 calls per CSI per day, about 12 ten-step base learns (§2 A, [A]).
- **Disclosure that this decision creates.** The story's MODEL-SIZING placement (line 649) and the `application.yml:231` comment speak of about 20-21 full sessions per CSI per day. Under A-ii that becomes about **6.5 full-envelope sessions, or about 12 ten-step learns** [A]. The comment fix in §7 item 6 stands. OBS-010 discloses the new figure.
- **Correction to the "156 calls" figure.** The figure is output-side only. The per-CSI input charge is each call's wire bytes plus 2048 (§1.1, [V `GuidedSessionService.java:265`]). So at real page sizes, input binds at about the same level: 5,242,880 / 32,768 = 160 calls [A]. Above an average of about 33.6 KB per call, input binds first. OBS-010 must state capacity as "min(output-side, input-side)", using T4's measured bytes per call.

#### 9.1.3 Benchmark scheduling: SPREAD across CSI-days, no temporary raise. Minimum amended upward.

- **Decision.** Spread. No temporary daily raise. Count **at least 4 CSI-days on the output side, and plan for 6** (the ×1.5 contingency figure). CSI-days may run in parallel across distinct benchmark CSIs (each a real inventory CSI) when the deployed stack has them. The daily defaults stay the same throughout.
- **Why I chose spread over a raise.**
  1. A temporary raise changes a runtime pin while gate evidence is being produced. It adds a revert to prove, and a pinned-version block that differs inside a single benchmark. Spreading costs calendar time, not money and not evidence integrity.
  2. The raise would also lift the one spend bound we hold before U17 and U18 are known (9.1.2).
- **Why I amended the minimum** (from "≥ 4" to "≥ 4 output-side, plan 6, recount on input").
  1. §4 counts output only. On the input side, 579 proposals at the 32,768-byte per-call assumption behind the 786,432 default reserve 18.97M bytes. That is 3.6 CSI-days, or **5.4 with ×1.5** [A]. At fixture size it is only 1.9 days, so fixture size understates the input side.
  2. So output and input both point to about 6 CSI-days with contingency. Plan 6, then recount after repetition 1 from the recorded reservations on whichever side binds.
- **Condition (scheduling, not an AC).** The benchmark scheduler and the admission guard must not start a run on a CSI whose remaining daily budget cannot cover that run's planned reservations. The reason: **a per-CSI daily refusal ends the session `FAILED BUDGET_EXCEEDED`, the same code as an envelope overrun** [V `GuidedSessionService.java:261-268`]. A run refused that way is a scheduling fault, to be rerun the next UTC day. It is neither a class-P failure nor a gate result. Who classifies it, and how, is @qa's and @architect's call. My only requirement is that it is never silently counted either way.

#### 9.1.4 The ~20-step single-session learn limit: DISCLOSE in OBS-010, keep `maxSourceSteps` 100

- **Decision.** Disclose it as a known limit in the OBS-010 AC-4 MODEL-SIZING row and in the pilot runbook text. Do not lower `maxSourceSteps` in 009 (that would be a contract change with no measured number behind it). Record option C (chunked learn) as a post-GA candidate, not as a commitment.
- **Disclosure text (for @po / @pm to place in OBS-010; I edit no story here):** "A test's first learn runs in one session with a model budget of 24 proposals. With an ideal model this is enough for about 20 steps. Repairs and clarifications lower it. A first learn of a longer test may stop with `BUDGET_EXCEEDED` before it completes. Edits to an already-learned test re-learn only from the first changed step. The measured limit from STUDIO-OBS-009 T4: ___ steps at p95." The blank is filled from T4, never estimated.
- **Why.**
  1. The pilot corpus is at most 10 steps [V §1.3.2: C05 5, C06 6, D1 7, D3 6; incremental 10]. So the limit does not touch the 009 gate.
  2. "Steps + 3" is one data point from a fixture [I, §1.3.2]. Lowering `maxSourceSteps` to a guessed number would ship a guess into the contract. Disclosure is honest and reversible.
- **Risk.** A pilot user writes a long test, and the first Run fails after spending budget. Mitigation: the disclosure above, plus T4's p95 figure. If T4 shows the real limit is below about 15 steps, that alone is a re-rule trigger (9.1.5 d).

#### 9.1.5 Re-rule trigger: ACCEPTED, with four amendments

The trigger as ruled: after T4, **p95 > 20 proposals per session, or any class-P `BUDGET_EXCEEDED`** ⇒ re-rule before OBS-010. Accepted, with these amendments:

- **a. Count only envelope exhaustion.** Count `BUDGET_EXCEEDED` only where the session's own counters reached a session total. Exclude per-CSI daily refusals (9.1.3), which carry the same error code. The harness distinguishes the two from the session counters versus `limits` at stop. If it cannot, that is itself a finding for @architect. [I: the counters make the two distinguishable; not verified on a run]
- **b. Check early.** Evaluate the trigger at the end of repetition 1 as well as at the end of T4. If it fires after repetition 1, pause T4 and re-rule before repetitions 2-3 are spent. Runs under different limits are not mixed in one gate denominator. Whether repetition 1 is rerun is for @qa and @architect to decide. Why: this stops real-provider spend that would be lost to a known bad sizing.
- **c. Add the two assumptions the values rest on as triggers.**
  1. Reported output per call (candidates + thoughts) at p95 > 3,584 (the §1.4 worst observed case of 3,582, rounded), or any non-`STOP` finish caused by token truncation ⇒ re-rule the 4096 per-call ceiling.
  2. Mean reserved input per call > 32,768 bytes (the assumption behind 786,432) ⇒ re-rule the input total.
- **d. Add two product triggers.**
  1. p95 session wall time > 480 s (80 % of `maxSessionSeconds` 600; §2 A risk 4) ⇒ re-rule.
  2. A measured first-learn step limit below 15 ⇒ re-rule, and @pm reconsiders whether disclosure is still enough (9.1.4).

#### 9.1.6 Not acknowledged here; owed by the user (and the ED-01 owner)

| Item | Owner | Status |
|---|---|---|
| **U17 / B8**: remaining headroom R under the USD 500 wave ceiling, and whether benchmark provider spend draws on that pool | **user** | OPEN. No admission without it. |
| **U18 / B8**: gateway price list (p_in, p_out) for `gemini-3.8-flash`; whether thoughts bill as output; whether `maxOutputTokens` caps thoughts | **ED-01 gateway owner** (TBD, GA plan D-3). The **user** must name or engage that owner. | OPEN |
| **U7**: signature on the budget admission, after B8 | **user** | OPEN. `budget-admission.json` stays `ADMISSION_REFUSED_PRICE_UNKNOWN`. |

This acknowledgement does **not** unblock T4 by itself. It closes only the MODEL-SIZING precondition (T4 precondition 3, story line 495), once @dev lands §7 after G9 and @po records the pointer. T4 preconditions 1 (ED-01) and 2 (U17) stay open, and so do U7, AE-01 / FM-01 and the deployed stack (§6). The upper-bound formula `cost ≤ 31.98 × p_in + 3.90 × p_out` (§4) is the user's input for U17. It stays unpriceable until U18.

**Hand-offs (no edits made by @pm here):** @architect: consensus-plan §8.3 amendment text, and a decision whether to adopt the 9.1.5 amendments into the ruling body. @po: ruling pointer on carried note F-1, on the MODEL-SIZING placements (lines 649 and 659) and on the T4 precondition 3 note; the OBS-010 AC-4 MODEL-SIZING row and the 9.1.4 disclosure. @dev: §7 after G9, plus the 9.1.5 a-d measurements in the T4 report. @qa: classification of per-CSI daily refusals (9.1.3). @devops: one rollout for the backend and runner, and any non-default limit recorded in the pinned block.

---

## 10. Architect adoption (append-only, 2026-10-18)

- **Author:** Aria (@architect), YOLO, on the lead's instruction during the G9 hold. Sections 1-9.1 above are left exactly as written. sha256 of this file before this section: `3867ba928d67e2f799bc8a9eb479f4653ab386955a57a610f12b4a1209f3c78f`.
- **Legend:** as in the header. **Not done:** no test, build, provider call, source/spec/story edit or git operation. The §8.3 text in 10.3 is **not** applied to `consensus-plan.md` here, because `docs/specs/` is frozen while G9 runs.

### 10.1 Decision

**Adopted: Morgan's §9.1.5 amendments a-d become part of this ruling's re-rule trigger**, with the precisions below. Each precision either makes an amendment measurable from data the system actually records, or closes a choice Morgan left to @architect. None changes a value acknowledged in §9.1.1-§9.1.4.

The trigger, as adopted. **Any one** of the following fires it. It is evaluated by @dev in the T4 report, verified by @qa, re-ruled by @architect and acknowledged by @pm:

| Id | Trigger | When evaluated |
|---|---|---|
| T-1 | p95 proposals per class-P session > 20 (§6, as ruled) | end of repetition 1, and end of T4 |
| T-2 | any class-P session ending `FAILED BUDGET_EXCEEDED` by **envelope exhaustion** (a, below) | same |
| T-3 | p95 reported output per call > 3,584, or any attempt classified as **probable truncation** (c1, below) ⇒ re-rule the 4096 per-call ceiling | same |
| T-4 | mean reserved input per call > 32,768 bytes ⇒ re-rule `maxModelInputTokensTotal` (c2) | same |
| T-5 | p95 session wall time > 480 s (d1) | same |
| T-6 | derived first-learn step limit < 15 ⇒ re-rule, and @pm re-decides §9.1.4 (d2, below) | same |

### 10.2 Precisions

**a. Envelope exhaustion versus per-CSI daily refusal. [V]** Both end `FAILED` with `errorCode BUDGET_EXCEEDED`, on two separate branches of `GuidedSessionService.modelReservationFitsLocked`: the session-envelope branch at `GuidedSessionService.java:251-258`, and the per-CSI `csiBudget.charge` branch at `:264-268`. The envelope branch fires when, for the refused call, `modelProposals + 1 > maxModelProposals` **or** `modelInputTokens + input > maxModelInputTokensTotal` **or** `modelOutputTokens + output > maxModelOutputTokensTotal`. Morgan's "counters reached a session total" is the right idea, but the predicate is "counters **plus the refused call** exceed a total".
- **Classification rule for the harness**, using the session's stored `counters` and `limits` at stop:
  - **Envelope** if `proposals + 1 > maxProposals`, or `output + 4096 > maxOutput`. The per-call output reservation is fixed at 4096 (`GuidedTranslationProperties.java:15`).
  - **Per-CSI daily** if neither of those holds and `input + 65,536 ≤ maxInput`. The refused call's input bytes are not stored, so the per-call input cap is the upper bound.
  - **Ambiguous** otherwise (only the input side could have refused, and the refused call's bytes are unknown). An ambiguous stop is **counted as envelope**. That is conservative: a false fire costs one re-rule, while a missed one leaves a sizing defect inside the gate.
  - If the harness can also read that UTC day's per-CSI ledger row, and it shows the daily cap exhausted, it may reclassify an ambiguous stop as per-CSI daily, recording the ledger values.
- A per-CSI daily refusal is never a class-P failure and never a gate result (§9.1.3). It is rerun on the next UTC day. @qa owns that classification record.

**b. Early check and denominator purity.** Adopted as written. Closing the choice Morgan left open: **if the trigger fires after repetition 1 and the re-rule changes any session limit, repetition 1 is rerun under the new limits.** All three repetitions in the AC-7 gate denominator run under one pinned limits set. Repetition-1 data under the old limits is kept as **calibration evidence** and is never gate evidence. Cost: one extra repetition, about 193 proposals (§4). That is accepted, because a mixed denominator would make the gate unreadable. If the re-rule changes no limit (for example, only the disclosure text), repetition 1 stands. @qa confirms either way in the T4 record.

**c1. Truncation must be observable, so a proxy is ruled. [V]** The gateway client collapses every non-`STOP` finish into `INVALID_RESPONSE` and does not keep the finish reason (`GenAiGuidedLlmGatewayClient.java:82-84`). Reported output is `candidates + thoughts` summed (`:197-202`), so thoughts are not separable in backend data.
- **Rule:** an attempt that ended `INVALID_RESPONSE` with reported output ≥ 3,584 counts as **probable truncation**, and one such attempt fires T-3. 3,584 is the same threshold as the p95 arm. With a 4096 per-call cap, a truncated call reports output at or near the cap.
- If the harness captures the provider's finish reason itself (value-free), it uses that directly and records which method it used.
- No product code change is required for this trigger.
- **Correction to my own §7 T4 duty:** "thoughts separated" is required only **where observable**. The backend `Usage` sums them, so if the harness cannot see provider usage metadata, the T4 report gives the combined figure and says why.

**c2.** Adopted as written. "Reserved input per call" means the per-call charge, wire bytes + 2048 (§1.1), and is computed from the recorded reservations.

**d1.** Adopted as written. A T-5 re-rule may move P or `maxSessionSeconds`. Neither is presumed.

**d2. Defining "measured first-learn step limit".** The AC-7 corpus tops out at 10 steps (§9.1.4 [V]), so T4 cannot observe a limit near 15 directly. It is a **derived** figure: `24 − p95(proposals − steps)` over class-P **base-learn** sessions, rounded down. T-6 fires when that is below 15, which means the p95 overhead per base learn is above 9. The 9.1.4 disclosure blank ("___ steps at p95") is filled with this figure **labelled as derived from T4**, never as a direct measurement.

### 10.3 consensus-plan.md §8.3 text (apply after G9, append-only, in the same unit as §7)

Apply this verbatim after §8.2 in `docs/specs/studio-observed-authoring/consensus-plan.md`, in the same change that lands §7 items 1-4. The amendment states values that are in effect only once that change lands. Fill the two `2026-10-xx` placeholders with the landing date, and fill the evidence path. The writer is the §7 @dev lane, or @architect in a post-G9 window. The text is @architect's.

> ### 8.3 Amendment — per-session model budget sizing (MODEL-SIZING, 2026-10-xx)
>
> **Decision (@architect, STUDIO-OBS-009 MODEL-SIZING ruling, option A-ii, [ruling-draft.md](../../qa/evidence/STUDIO-OBS-009/execution-20261018/model-sizing/ruling-draft.md) §2-§7 and §10); acknowledged by @pm (Morgan) on 2026-10-18 (same file, §9.1).** In the §8 block above, and superseding §8.2 where they differ:
> - `max-model-output-tokens-total` changes from `32000` to a default of **`98304`**, with a schema `maximum` of **`131072`**.
> - `max-model-input-tokens-total` changes from `262144` to a default of **`786432`**, with a schema `maximum` of **`1572864`**.
>
> These cover `GuidedSessionProperties` (the `@DefaultValue`s and the `limits` fallback) and `contracts/v3/limits.schema.json` (`maxModelOutputTokensTotal`, `maxModelInputTokensTotal`). Unlike §8.2, **the maximum is above the default.** Every other bound is unchanged: the per-call output cap of 4096, the per-request input cap of 65,536, `max-model-proposals: 100`, byte-as-token input reservation with the +2048 allowance, reserve-before-send, no-refund settlement, and the STUDIO-OBS-014 AC-8 per-CSI daily budget (640,000 output / 5,242,880 input).
>
> Why: at 32,000 output and 4096 reserved per call, a session holds 7 proposals. The STUDIO-OBS-009 B7 fixture measured 13 for a 10-step base learn with an ideal model, so the AC-7 benchmark would fail by configuration whatever the model's quality. The sizing target is 24 proposals per session (13 measured, × about 1.85 for repairs and clarifications). Output and input move together, because raising output alone would make input the next wall. The ruling rejected a smaller per-call ceiling (truncation risk, since thoughts count as output), chunked learning (a product redesign) and a model change (no effect on the envelope).
>
> Limits of these values:
> - **24 proposals is a planning value from fixture data plus contingency, not a measured capacity.** STUDIO-OBS-009 T4 publishes the real distribution (proposals, repairs, reserved versus reported tokens per call, session wall time), and the ruling's §10 re-rule trigger (T-1..T-6) decides whether these values stand before STUDIO-OBS-010.
> - **The maxima exist so recalibration needs no further contract change.** They are not a licence: running any deployment above the defaults needs a new @architect ruling with @pm acknowledgement, recorded in the AC-7 pinned-version block. No chart key sets these values.
> - **Per-CSI capacity is set by calls, not sessions:** about 156 calls per CSI per day on the output side, and about 160 at a 32 KB input average. That is about 12 ten-step base learns, or 6.5 full-envelope sessions. The `application.yml` comment is corrected to match.
> - **A first learn in one session covers about 20 steps with an ideal model,** and fewer with repairs. STUDIO-OBS-010 discloses this limit with the T4-derived figure. `max-source-steps` is unchanged.
> - **Cost:** the worst-case reservation per session rises about 3×. The expected reservation per learned step is unchanged (per call), and daily spend per CSI stays bounded by the unchanged per-CSI budget.
> - **Deployment:** the session schema epoch and the runner schema bundles change, so the backend and runner images roll out together.
>
> The `32000` and `262144` figures in §8 and §8.2 are kept as history and are superseded by this amendment. Other sections of this plan are unchanged.

### 10.4 Hand-offs (no edits made here)

- **@dev:**
  - §7 after G9, unchanged;
  - the harness classification rule in 10.2 a;
  - the c1 proxy and the derived d2 figure in the T4 report;
  - the §8.3 paste in the same unit, if the lead assigns it to the §7 lane.
- **@qa:** repetition-1 trigger evaluation (10.2 b) and the per-CSI refusal record.
- **@po:** add "and §10" to the ruling pointer on 009 carried note F-1, and to the MODEL-SIZING placements. The OBS-010 AC-4 e1 disclosure blank is filled with the derived figure (10.2 d2).
- **@pm:** nothing new. §10 changes no acknowledged value. It closes the two choices left to @architect (the ambiguous classification and the repetition-1 rerun), which only make the trigger stricter.
