# STUDIO-OBS-009 lane EP: @qa review (manifest, harness, budget ledger, B7)

- **Signed:** Quinn (@qa), 2026-10-18. Read-only review during the G9 hold window. I ran no harness command, test or model call. The checks below are file reads and small Python computations over files.
- **Not a gate decision.** No PASS/CONCERNS/FAIL/WAIVED. AC-7, AC-8 and AC-9/10 live halves stay unrun.
- **Legend:** [V] verified today by reading or computing from the named file. [I] inference, with its basis.
- **Inputs:** `ep/receipt.md`, `ep/budget-admission.json`, `ep/b7-*.json`, `ep/cli-benchmark-refusal-proof.json`, `studio-runner/evaluation/observed-authoring/{manifest.json,pages/**,cases/**}`, `backend/.../GuidedSessionService.java` (`reserveModel`), `docs/specs/studio-observed-authoring/contracts/v3/limits.schema.json`.

## Verdicts

| Item | Verdict |
|---|---|
| Are the refusals honest (budget ledger, harness, EP's own "unrun" labels)? | **Yes.** No unrun item is dressed as a pass. |
| Is the B7 refutation sound? | **Yes, as a refutation** (a local run can refute, never confirm). The consequence is larger than the receipt states: see §3. |
| Manifest acceptance | **Accepted as a frozen draft for T4**, with four observations that need an owner before the first real call. Nothing in it needs to change before G9. |

## 1. Are the refusals honest?

### 1.1 The budget-admission ledger [V]

- `budget-admission.json` has 4 entries. Every one is `ADMISSION_REFUSED_PRICE_UNKNOWN`: two for `ac7-benchmark` (seq 1 bound to the superseded manifest digest `a901a0d9...`, seq 3 bound to the current `e4785112...`) and two for `ac8-schema-probe` (manifest `null`).
- `allocationUsd`, `remainingUsdAtAdmission`, `stopThresholdUsd`, `priceSource` and `costBoundUsd` are all `null`. The `ceilingUsd: 500` is labelled "whole OBS wave (README), not a per-benchmark allowance". The 2026-10-04 "473 of 500" is explicitly not converted into dollars. That matches what I wrote in the T0 budget draft: the 2026-10-04 "500" was calls.
- `cli-benchmark-refusal-proof.json`: the live `benchmark` command exits 2 with `LATEST_NOT_ADMITTED:ADMISSION_REFUSED_PRICE_UNKNOWN`, creates no evidence directory, and sent 0 HTTP requests to a listening stub [V file]. That is the right fail-closed behaviour.
- The token caps in the ledger are arithmetic I can reproduce: 122 sessions x 262 144 = 31 981 568 input; 122 x 32 000 = 3 904 000 output [V].
- Two small remarks. `ADMISSION_REFUSED_OVER_ALLOCATION` is EP's addition (receipt deviation 3); I accept it, a ledger needs a state for an over-bound record. The superseded seq 1 and 2 remain in the chain, which is correct for an append-only ledger.

### 1.2 The manifest [V]

- I recomputed the digest with an independent implementation (sorted-key compact JSON with `manifestSha256` blanked). It equals the frozen value `e4785112885541c03f7ebed2b08bdc878a183d8e692b62140fa4491560df285b`.
- All 68 pinned files (step texts, expected outcomes, pages) match their sha256 on disk. Zero missing, zero mismatched.
- The two source pins match: `results.jsonl` `0580e2e3...` and `summary.json` `8dbef611...` equal the files under `UI-STUDIO-VALIDATION-20261004/benchmark/`.
- 25 workflows: 19 class P, 1 F (C08), 5 N (C09, C10, C11, C12, E3). D2 and E1 are `EXTERNAL_BLOCKED` with owner, register entry and `unrun, owner named`, and no step text. They are not faked.
- The gate arithmetic is a pure function of the classes: 19 x 3 = 57 runs, 52 completions (91.2 percent), at most 5 failed; with D2 and E1 unrun, 51 runs, 46 completions, and the result is `PARTIAL`, never a pass. 75 runs, 81 sessions, 122 with the x1.5 contingency. All reproduce.
- B1: every ported case carries `invented: []` and `comparisonClaim: NONE_NO_COMPARISON_TO_20261004`. The class basis is marked `[I]`, inferred from the 2026-10-04 response shapes. That is honest: the ported step texts do not exist in the repo, so these are re-authored ports, as the PO's interpretation note says.
- B2, B3, B7 and B8 are recorded as `RECOMMENDED_NOT_RULED`, `RECOMMENDED_NOT_RULED`, `MEASUREMENT_RECORDED_SEPARATELY` and `UNKNOWN`. None is promoted to a ruling.

### 1.3 The harness [V by receipt, plus reads]

- Every harness result is labelled `HARNESS_SELF_TEST_NOT_D_C_EVIDENCE` or `NOT_EVIDENCE`. The oracle is the fixture-owned receipt record (host-logged page views and posted events), not the system's own PASSED. The expected outcomes are hashed in the manifest and frozen before any run.
- Mutation evidence: 16 of 16 harness mutations killed, 3 of 3 Java-side mutations on the schema probe killed, 4 oracle mutation kinds exercised across the corpus. I did not re-run these (hold window).
- `GuidedSchemaProbeIT` local half runs (10 tests, 9 passed, 1 skipped by name). The external half `approvedGatewayProbeAcceptsEveryGuidedProjectionSchema` is skipped as `UNAVAILABLE_NOT_RUN`. It is on my approved-skips file (`qa/approved-skips.json`, last entry) [V], so a G9 run that skips it is expected and one that passes it without a gateway would be a mismatch.

## 2. Observations on the manifest (need an owner, none blocks G9)

1. **RS-1 is zero by construction [I].** Every case writes `valueLocations: []`; no class-P case is exact-mode; D3 and both incremental cases declare `mixedVisible`. The story says pages "are not edited to move such values into reachable elements". The pages here were authored fresh, with the grant list known, so RS-1 = 0 is a property of how they were written, not a finding about the product. If @pm closes F03 as "not needed" on `rs1NonScalarReadGaps: 0` from this corpus, that closure rests on authoring. Two ways out: @po decides the optional N-RS1 case (an exact-mode `span`/`div` read, in class N or a reported-only class), or the benchmark record carries one sentence that RS-1 = 0 is by corpus design. This is my T0 B5 point, still unresolved.
2. **Class N proves "no false pass", not "correct refusal".** The terminal set for C09, C10, C11 and E3 includes `CANCELLED` and `EXPIRED`, and the harness itself cancels a session after counting a clarification. A system that stalls until expiry passes class N. That is the definition of the zero-false-pass hard gate and is acceptable, but nobody should quote class-N results as "refusal quality". C12 is the exception: it has `mustObserve: AWAITING_CLARIFICATION`.
3. **C12 carries an unused key** (`script.answerClarifications: false`; the driver reads `script.clarificationChoices`). Harmless. Removing it re-freezes the manifest and voids any admission, so leave it until a re-freeze is needed for another reason.
4. **Any edit re-freezes.** `manifestSha256` is bound into the admission ledger and into every run record (a run that starts before `manifestFrozenAt` is refused). EP's F4 says the same. My review does not request an edit.

## 3. B7: the 7-proposals-per-session assumption is refuted, and the available lever is narrower than the receipt says

### 3.1 What the data shows [V, recomputed]

- `b7-all-sessions.json` holds 70 sessions from 36 evidence files. The peak is 14 proposals. 54 of the 70 sessions need more than 7. A 10-step base learn needs 13 (edit-4 case and insert-step case).
- Production defaults: per-call output ceiling 4 096, session output total 32 000, so the floor is 7 proposals (7 x 4 096 = 28 672; the 8th reservation would exceed 32 000). A 10-step base learn at the production ceiling reserves 13 x 4 096 = 53 248, which is 166 percent of the session total.
- The reservation model is real [V]: `GuidedSessionService.reserveModel` reserves before the gateway call (`reserve(session, "modelOutputTokens", output, "maxModelOutputTokensTotal")`), the reservation survives timeouts and missing usage reports, and the later accounting adds only the excess of actual over reserved (`Math.max(0, output - reserved)`), so there is no refund.
- The 4 096 column is arithmetic, not a run: the incremental lane runs at the fixture ceiling 2 048, and a 4 000-token profile was refused by `GuidedPublicationReplayIT` ("the closed profile owns exactly its declared methods"). The receipt says this plainly. The proposal count itself does not depend on the ceiling, so the refutation stands.
- Per-CSI daily budget (640 000 output) at 53 248 per session: 12 full base sessions per CSI per day, against 81 planned sessions.

### 3.2 What the receipt left out [V]

The receipt offers "raise the session output total to at least 53 248" as one of two options. The contract forbids that without a version change: `docs/specs/studio-observed-authoring/contracts/v3/limits.schema.json` sets `maxModelOutputTokensTotal` to `maximum: 32000` (and `default: 32000`), and `maxModelProposals` to `maximum: 100`. A larger session total is a contract change (v3 limits schema, with its epoch and fixtures), not a deployment value.

So, without touching the contract, the only lever is the per-call ceiling: floor(32 000 / 13) = 2 461 or lower (the incremental lane already runs at 2 048, which allows 15 proposals). Whether a real model's structured output fits 2 048 tokens for the largest schema (SOURCE_PLAN 4 910 bytes, depth 10, per the EP census) is unknown, and that is exactly what the live AC-8 probe and T4 would reveal. That is a decision for @architect and @pm. I do not choose.

If nobody rules, the consequence for T4 is concrete: at production defaults a 10-step observed learn cannot finish, so a benchmark would measure the caps, not the model. I would not credit such a run as a model-quality result.

## 4. What T4 needs (owner in brackets)

1. **MODEL-SIZING ruling** [@architect + @pm]: per-call ceiling at or below 2 461, or a contract change to the v3 limits. Include retries and clarifications (a real model adds proposals).
2. **B2 and B3** [@po, @architect]: class-P-only denominator and E3 as class N. The harness works under either; only `gate.classPCases` changes.
3. **B8** [user, ED-01 owner]: the gateway price list, thoughts-token billing, and the remaining headroom R under the USD 500 wave authorization. Then a non-refused `admission-record` entry bound to the manifest digest. Until then every `benchmark` run exits 2.
4. **The N-RS1 decision, or the disclosure sentence** [@po], observation 2.1.
5. **A joined smoke of the public-API client** [@dev]: `createPublicApiClient` was written from the OpenAPI text and has never run against a live backend (EP F5). Before the first real call, run the harness once against a local backend with a scripted gateway. That uses no model and no budget.
6. **Deployed stack and internal runner image** [user U4, Docker authorization U22]: D1, D3 and the incremental pair need their TypeScript fixtures reachable from the runner pod (EP F6); in-process hosting is local only.
7. **ED-01 gateway** [owner TBD, GA plan D-3]: AC-8 acceptance (does the provider accept root `anyOf`, `$defs`/`$ref`, `additionalProperties:false`?), AC-9 real-model guard counts, AC-7 runs. The `ac8-schema-probe` admission entry is separate and also refused today.
8. **Staging application, real login, SSO case** [user, app owner, Platform/SRE: U3, ED-04; dev Vault ED-02] for D2 and E1. Without them the AC-7 result is `PARTIAL` at best.
9. **AE-01 and FM-01 landings and the U13 acknowledgement** before the first real call [@dev, user]. No `o-ae`, `c9-ae` or `fe9` receipt folder exists under `execution-20261018/` today [V `ls`], so I treat AE-01 as not landed. It is informational for the D2 trigger, but it gates the first real call.
10. **Deployed per-CSI and session ceilings** [@devops]. The ledger's caps are code defaults and say so.
11. **The C-17 masked-video human reviewer** [user].

## 5. Other EP findings I endorse

- **F1** (dead compile-era files in `evaluation/`: `oracle.mjs`, `report.mjs`, `fixture-server.mjs`, `example-manifest.json`, `browser-oracle.test.mjs`): root or 011 to decide on removal. Not a 009 blocker.
- **F3** (`eslint .` errors in `guidedCloseBound.test.ts` and `guidedLaunch.ts`): G9 C1 exited 0 [V `status.txt`: `C1-runner-typecheck-lint exit=0`], so it is cleared on the frozen tree.
- **Deviation 5** (the profile-override run may have touched `backend/build/guard-tally` and `guided-cohorts/test`): G9 C8 runs `--rerun-tasks`, so nothing evidentiary should depend on it. I will confirm in the D2 record that the guard tallies in the C8 collector output are the fresh ones.

Signed: Quinn (@qa), 2026-10-18.
