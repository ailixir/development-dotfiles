# STUDIO-OBS-009 AC-7 — budget admission draft (T0 prep)

- Author: Quinn (@qa). Date: 2026-10-16. Status: **draft; no admission is granted by this file.** GO condition (2) requires the user's admission to be recorded in `docs/qa/evidence/studio-observed-authoring/budget-admission.json` before the first real-provider call.
- I made no model call and ran nothing that spends money. Spend is not measurable from this host.
- **[V]** = read in a file or computed from numbers I read. **[I]** = inferred. **[U]** = unknown, with the owner who can close it.

## 1. Bottom line

1. The admission cannot be computed in dollars today, for two independent reasons: no sourced price exists for the pinned model [V], and the remaining headroom under the USD 500 ceiling is not known [V: GA plan says "Actual spend on the OBS wave against its USD 500 ceiling. Not exposed anywhere."].
2. What can be computed is a **hard upper bound in tokens**, because the product enforces per-session ceilings and per-CSI daily budgets [V that the defaults exist; U for the deployed values]. The admission should therefore be expressed as a token cap plus a price-per-token condition, not as a dollar guess.
3. The token cap collides with the per-CSI daily budget: 81 sessions at the full reservation need about **5 CSI-days**, not one day. That is a scheduling and MODEL-SIZING decision, not only a money decision.
4. The USD 500 is the **whole-wave authorization**, not a provider budget [V: README "user authorized $500 USD for the whole wave"; consensus-plan §8.2 "development/coordinator spend authorization"]. Whether benchmark provider cost draws on the same pool as agent spend is not stated anywhere I read [U, owner: user]. Admitting against "500" would overstate the headroom if other spend already used some of it.

## 2. Verified facts

| # | Fact | Where |
|---|---|---|
| F1 | Ceiling: USD 500 for the whole wave, authorized by the user | `docs/stories/STUDIO-OBSERVED/README.md:100` |
| F2 | Actual wave spend is "not exposed anywhere" | `docs/epics/UI-STUDIO-GA-PLAN.md:223` |
| F3 | The 2026-10-04 compile benchmark's "budget limit 500" was **500 model calls**, not dollars (473 used). `pricing.estimatedCostPerCompileUsd` is `null`: "no sourced Vertex price list available in-repo or offline" | `docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/summary.json` |
| F4 | Pinned production model default `gemini-3.8-flash`; thinking level `LOW`; `max-output-tokens` 32768; provider `disabled` unless `STUDIO_GATEWAY_PROVIDER` is set | `backend/src/main/resources/application.yml` (gateway block) |
| F5 | Per-session ceilings (defaults): 600 s, 100 proposals, input tokens total 262,144, output tokens total 32,000; per call 60 s, 4,096 output tokens, 65,536 input bytes | `GuidedSessionProperties.java`, `GuidedTranslationProperties.java` |
| F6 | Per-CSI limits (defaults): 3 concurrent sessions, 5,242,880 input and 640,000 output tokens per day | `application.yml` `studio.guided-authoring.csi-budget` |
| F7 | 5,242,880 / 262,144 = 20 and 640,000 / 32,000 = 20: the daily budget is exactly 20 full-ceiling sessions per CSI per day, and the story's MODEL-SIZING note says the reservation is not refunded ("about 20-21") | computed; 009 story "Carried review follow-ups" |
| F8 | Under production defaults the output total allows **7 proposals** per session (32,000 / 4,096), so `max-model-proposals: 100` is unreachable | 009 Dev Notes (F-1), `GuidedDefaultModelReservationIT` exists |
| F9 | Gateway `max-concurrency` 4; request timeout 150 s | `application.yml` |
| F10 | No `STUDIO_GATEWAY_*` or `STUDIO_GUIDED_EVAL_*` variable is set in the shell the feasibility doc inspected; the repo has no real-model configuration | feasibility doc §(c) |
| F11 | `GuidedProviderEvaluationTest` is a small synthetic SOURCE_PLAN / NEXT_ACTION corpus (single calls), skips `UNAVAILABLE_NOT_RUN` without the five env vars and a non-loopback HTTPS endpoint. It is not the AC-7 benchmark | `backend/.../guided/translation/GuidedProviderEvaluationTest.java` |
| F12 | Compile-era measured usage, 350 judged calls (a different path: one call per compile, not a guided session): input mean 4,416 / median 3,330 / max 11,048 tokens; output mean 227 / median 193 / max 1,293; reported `thoughts` tokens present on 197 of 350 calls, mean 2,085, max 18,010; latency p50 7.5 s, p95 60.0 s (60 s was the timeout) | computed from `benchmark/results.jsonl` |
| F13 | Vertex project `epicagentai`, `gemini-3.8-flash` was callable on 2026-10-04; `gemini-3.5-pro` and `3.8-pro` returned 404. Not re-probed today | my memory file `vertex_model_access.md`; not re-verified |

## 3. Workload being admitted (from the corpus draft)

| Item | Count | Basis |
|---|---|---|
| Workflows | 25 | `corpus-composition-draft.json` |
| Runs (25 × 3) | 75 | AC-7 |
| Extra base sessions for the 2 incremental cases (2 × 3) | 6 | [I] each repetition needs a full-learn base before the edit |
| **Model sessions** | **81** | |
| Of which staging/external | 6 sessions (D2, E1 × 3) | |
| Replay-stability runs (100) | 0 model calls | replay is model-free [V: ADR-SC-005 architect context "Replay is model-free"]. Real browser time only |
| AC-8 schema probe | a handful of calls | [I] 3 projections (SOURCE_PLAN / NEXT_ACTION / VERIFY_STEP) × a few attempts. I assume ≤ 15 calls; negligible next to the benchmark |
| Re-runs for infra-failed runs | unknown | AC-12 f/j say host-collision and startup-hang runs are not credited and are re-run. I model +50 % as a contingency (assumption A5) |

## 4. Token envelopes (assumptions are explicit)

Assumptions:

- A1. Each session consumes at most its reserved ceiling (F5). This holds by enforcement if the deployed values equal the defaults [U: deployed values; the OBS-009 pinned-runtime record must state them].
- A2. Retries inside one provider attempt are covered by the reservation (the reservation is taken before the call and not refunded, per F7). [I]
- A3. Provider "thoughts" tokens are billed as output tokens. [I: usual provider behaviour; not verified for the configured gateway]. The compile-era output mean of 227 plus an average of about 1,170 thoughts per call (2,085 × 197/350) gives about 1,400 billable output tokens per call [I from F12].
- A4. Scenario L and M are illustrations to size the order of magnitude. They are **not predictions**: no guided real-model data exists (F11).
- A5. Contingency factor 1.5 for non-credited re-runs.

| Scenario | Per session input | Per session output | 81 sessions input | 81 sessions output | Basis |
|---|---|---|---|---|---|
| L (low) | 53,000 | 16,700 | 4.29 M | 1.35 M | 12 calls × F12 compile-era mean (4,416 in; about 1,400 out) |
| M (mid) | 160,000 | 28,000 | 12.96 M | 2.27 M | 20 calls × about 8,000 in, 1,400 out; output close to the 32,000 ceiling |
| **H (ceiling)** | 262,144 | 32,000 | **21.23 M** | **2.59 M** | F5, the enforced bound |
| H × 1.5 contingency | | | 31.85 M | 3.89 M | A5 |

## 5. Cost condition instead of a cost number

With unit prices `p_in` and `p_out` in USD per million tokens and available headroom `R`:

`cost = p_in × T_in + p_out × T_out ≤ R`

Break-even `p_in` at `R = 500` (the **most optimistic** headroom, see §1.4), for two assumed output/input price ratios (the ratios are my assumption, not sourced):

| Scenario | p_out = 4 × p_in | p_out = 8 × p_in | Same, with ×1.5 contingency (4× / 8×) |
|---|---|---|---|
| L | 51.5 | 33.1 | 34.4 / 22.1 |
| M | 22.7 | 16.1 | 15.1 / 10.7 |
| H | 15.8 | 11.9 | 10.5 / 7.9 |

Reading (an inference, not a fact): if the configured price is below roughly USD 8-10 per million input tokens, even the ceiling scenario with contingency fits inside USD 500 *if the whole 500 were free*. I do not have the real price, and R is almost certainly below 500, so this table is a method, not an admission. **The admission can only be signed once the price list for the gateway (ED-01 owner) and R (user) are written into `budget-admission.json`.**

## 6. Enforced caps that make the bound real

| Control | Value (default) | Effect on the benchmark |
|---|---|---|
| Per-session ceilings | 262,144 in / 32,000 out | caps each of 81 sessions; basis of scenario H |
| Per-CSI daily tokens | 5,242,880 in / 640,000 out | **20 full-ceiling sessions per CSI per day** → 81 sessions need ≥ 5 CSI-days (ceil 81/20 = 5); with ×1.5 contingency 122 sessions → 7 CSI-days |
| Per-CSI concurrency | 3 | 81 sessions in ≥ 27 sequential waves; at the 600 s session cap that is ≤ 4.5 h wall clock per CSI [I upper bound, actual not measured] |
| Gateway `max-concurrency` | 4 | shared across CSIs |
| UTC-midnight `Retry-After` | exists (MODEL-SIZING note) | a daily-budget refusal is a 429-style outcome, not a model failure; it must be counted as an admission refusal and not as a "failed run" |

Decision for the user and @architect/@pm (MODEL-SIZING, "existing architect ruling and PM acknowledgement" only): spread across ≥ 5 benchmark CSIs/days, or rule a temporary higher daily budget for the benchmark CSI. QA does not choose; either route changes a pinned runtime value and must be recorded in the pinned-version block.

## 7. What a signed admission record must contain (proposal for `budget-admission.json`)

1. `ceilingUsd: 500`, `scope: whole OBS wave`, `remainingUsdAtAdmission` (user, with the source of the figure), `benchmarkAllocationUsd`.
2. `priceSource` (document, owner, date) and `pInUsdPerMTok`, `pOutUsdPerMTok`; if absent: `ADMISSION_REFUSED_PRICE_UNKNOWN`.
3. `plannedSessions: 81`, `tokenCapIn`, `tokenCapOut` (scenario H or the ruled values), `contingency`.
4. `enforcedCaps` copied from the deployed config (F5, F6) with the config source, not from this document.
5. `pinned`: model id, thinking level, prompt/contract version, runner `dist` digest(s) (including the AUTHORED-ECHO-01 / FOCUS-MUTATION-01 rebuild), image digest.
6. `stopRule`: stop issuing sessions when cumulative reported cost ≥ 80 % of the allocation, or the first hard-gate hit (false pass, leak). Resume only by a new dated admission entry.
7. `timestamp` strictly before the first real-provider call, plus the identity of the person who admitted.
8. `notAdmittedBecause` for each external prerequisite still absent (ED-01 owner, staging app, dev Vault, deployed stack), each as "unrun, owner X".

The measured result must later publish reserved versus provider-reported tokens (the 012A calibration note) and the **configured-provider cost** with its denominator. Cost is "unavailable" if no price exists; it must not be estimated silently.

## 8. Optional non-gating rehearsal

The feasibility doc found an application-default credential and an enabled `aiplatform` API on this Mac, but model access, quota and billing were not checked. A rehearsal would spend from the same USD 500 and send page data to a provider that is not the ED-01 gateway (OBS-014 compliance approval is open). It cannot satisfy AC-7, AC-8 or AC-10. If the user wants one, it needs its own dated admission line, fixture pages only, and the output must be labelled "rehearsal, not D-C evidence".

## 9. Open items (owner)

| # | Item | Owner |
|---|---|---|
| B1 | Remaining headroom under the USD 500 and whether benchmark provider cost shares the pool with agent spend | user |
| B2 | Price list for the pinned model on the ED-01 gateway | ED-01 owner (TBD, GA plan D-3) |
| B3 | Deployed values of the session and per-CSI ceilings | @devops / @dev (pinned-runtime record) |
| B4 | Spread across CSIs/days or a ruled temporary daily budget | @architect + @pm (MODEL-SIZING) |
| B5 | Whether thoughts tokens are billed as output on the configured gateway | ED-01 owner |
