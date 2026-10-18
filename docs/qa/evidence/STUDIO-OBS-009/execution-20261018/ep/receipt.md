# STUDIO-OBS-009 W3, lane EP: benchmark preparation, AC-8 code, local halves, B7 measurement

- **Author:** Dex (@dev). Date 2026-10-18. Mode YOLO. No commit, stash or push. No dist rebuild. No real model or provider call anywhere.
- **Legend:** **[V]** verified by running the named command or reading the named file. **[I]** inference, with its basis.
- **Dist:** every Gradle collector run recorded `distDigest 4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3` = D_F. [V] (`obs009-ep-*.out`, `budget0*.out`, `probe0*.out`)
- **Everything labelled HARNESS_SELF_TEST is not D-C evidence.** Budget admission reads `ADMISSION_REFUSED_PRICE_UNKNOWN`; B8 (headroom R, price list) is unknown.

## 1. What was built

| Part | Where | State |
|---|---|---|
| Compile-era driver removed | `studio-runner/evaluation/lifecycle.{mjs,d.mts,test.mjs}` deleted; `test/evaluation/{fixture-run.test.ts,scripted-backend.ts}` deleted with it (they only tested the deleted driver) | done |
| CLI + README | `evaluation/cli.mjs` (new commands `validate-corpus`, `freeze-corpus`, `corpus-mutation-control`, `admission-record`, `admission-guard`, `b7`, `benchmark`; `run` and the lifecycle self-test gone), `evaluation/README.md` rewritten | done |
| Corpus manifest | `observed-authoring/manifest.json`, frozen, digest `e4785112885541c03f7ebed2b08bdc878a183d8e692b62140fa4491560df285b` (frozenAt 2026-10-18T16:38:51Z) | done; `@qa` review PENDING |
| 22 HTML pages for 18 cases, 21 step texts + 23 expected outcomes (the incremental pair uses the 015 case files as step text) | `observed-authoring/pages/<case>/**` and `pages/server.mjs` (loopback host, ephemeral port, logs views itself) | done |
| Harness | `observed-authoring/evaluate.mjs` (+ `evaluate.d.mts` typing sidecar) | done |
| Tests | `studio-runner/test/evaluation/*.test.ts`, 7 files | done |
| AC-8 code | `backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedSchemaProbeIT.java` | done; local half runs, external half skipped by name |
| Budget admission | `ep/budget-admission.json` (append-only, 4 entries) | done |
| B7 measurement | `ep/b7-proposals.json`, `b7-all-sessions.json`, `b7-measured-summary.json` | done, see section 4 |

### Corpus facts [V] (`cli-validate-corpus.json`, `corpusManifest.test.ts`)
25 workflows: 19 class P, 1 class F (C08), 5 class N (C09, C10, C11, C12, E3). 2 externally blocked (D2 staging login, E1 SSO), each with a named owner and no step text or outcome. Gate arithmetic is computed from the classes: 19 x 3 = **57 runs, >= 52 completions, <= 5 failed** (51 of 57 fails); with D2 and E1 unrun it is 51 runs, >= 46, and the result is `PARTIAL`, never a pass. 75 runs, **81 model sessions**, **122** with the x1.5 contingency. Token caps in the ledger for 122 sessions: 31,981,568 in / 3,904,000 out, equal to Quinn's figures.

- **B1.** 13 ported cases each carry a fidelity record: row lines of `results.jsonl` plus its sha256 (`0580e2e3...` pinned in `sources.resultsJsonl`), recorded outcome *kinds* only (no counts), re-authored parts, `invented: []`, `comparisonClaim: NONE_NO_COMPARISON_TO_20261004`.
- **B5.** `mixedVisible` declared for D3 and both incremental cases (`<output>` is on the AC-7 grant list). No exact-mode case in class P. The optional N-RS1 case is not added (PO option, undecided). RS-1 mark on every case with `valueLocations: []` written explicitly; 0 cases are RS-1 under the "value the workflow must read" reading. Assertion-text elements are listed separately and left to the T4 observation. [I: this reading of AC-7 RS-1 a; @po/@architect may read it wider, which would only change the marks.]
- **B6.** Oracle per case is the fixture-owned record (host-logged page views, posted events, the existing fixtures' receipts), never the runner's DOM check or the system's own PASSED. Classes F and N expect no action receipt and no publication. Expected outcomes are hashed in the manifest, which is frozen before any run; a run record that starts before `manifestFrozenAt` is refused.
- **B2 and B3 are recommendations, not rulings.** The manifest records them `RECOMMENDED_NOT_RULED` (class-P-only denominator; E3 iframe as class N).
- 22 HTML pages (18 cases) were written fresh. D1 (secret-login), D3 and the incremental pair ride on the **existing** TypeScript fixtures, hosted in-process under Node 24 type stripping [V `hostExistingFixture`], not forked. The two STUDIO-OBS-015 case files are unchanged: sha256 `f04e7001...` and `9a1831f5...` equal before and after. [V]

## 2. Harness behaviour proven locally [V unless marked]

- **Real-browser page probe** (`provenance/page-probe.mjs`, `page-probe-results.json`): real Chromium drives each of the 19 corpus-page cases the way a correct system would, then with the four defects. All 19 positive flows accepted by the oracle; the step-text assertion is true on the end state of the 11 pages that assert something; every applicable mutant rejected. The probe also found three real page bugs while I built it (C03 results page URL lost "/wiki"; wrapped `<label>` around a `<select>`; `role=listitem` on a button) and one oracle blind spot (a wrong click with no handler), all fixed before the freeze.
- **Mutation controls**: positive control plus wrong target, reversed assertion, dropped submit, literal substitution against all 23 expected outcomes (`cli-corpus-mutation-control.json`). Each applicable mutant rejected; the four kinds are all exercised somewhere in the corpus.
- **Scoring**: exact 57/52/5 and 51/46 arithmetic, PARTIAL vs GATE_FAIL boundary at 46 and 45, clarification-free completion, unreported retry refused, infrastructure failures kept in the ledger, hard gates (false pass, leak), accounting fields refused when omitted, self-test verdict `NOT_EVIDENCE`.
- **Run driver** on scripted public-API stubs against the real fixture hosts: three repetitions, finalize exactly once, class F honest FAILED, class N refusal and clarification counted and cancelled (never answered), D3 protocol (one submit, finalize adds none, two replays one each), incremental (base published, value switched, 4..10 relearned, 1..3 reused), leak counted per run with the secret not written into the record.
- **Budget admission** (`budgetAdmission.test.ts`, `cli-benchmark-refusal-proof.json`): price null -> `ADMISSION_REFUSED_PRICE_UNKNOWN`; headroom null -> `..._HEADROOM_UNKNOWN`; over-allocation refused (`ADMISSION_REFUSED_OVER_ALLOCATION` is my addition, the T0 enum had no state for it); ledger hash-chained and append-only; the start guard reads the latest entry **for the requested purpose**; stop rule stops after the session that crosses 80 percent or at the first hard-gate hit. A counting stub saw 0 calls; the live `benchmark` CLI with the refused ledger exited 2, created no evidence directory and sent **0 HTTP requests** to a listening stub. [V]
- **Replay stability scorer** (>= 98 percent of 100 with one hash): self-test only.
- **AC-9 local half**: independent oracle + four mutants (above) and a CSI A/B same-secret-id isolation checker (`checkIsolation`). The real isolation proofs are existing tests I did **not** re-run: `StudioCsiScopingIT`, `studio-runner/test/fixtures-tier/guided-secret-isolation.test.ts` (needs the fixtures tier, whose globalSetup rebuilds dist).
- **AC-10 local half**: canary scan over every API response body, the run's receipts and any operator-supplied text (`extraTexts`), in raw, JSON-escaped, URL-encoded, base64 and hex form; findings never carry the canary. `test/run/canary.test.ts` (existing) is 1 passed / 8 skipped here, so it earns no credit. [V]

## 3. Commands, exit codes, counts

| # | Command | Result |
|---|---|---|
| 1 | `vitest run test/evaluation --coverage.enabled=false --minWorkers=1 --maxWorkers=2` baseline | 13 passed (report 10, fixture-run 3) |
| 2 | same, final | **144 passed / 0 failed**, 7 files (`final-vitest-evaluation.log`) |
| 3 | full runner unit tier, final | **2606 passed / 0 failed / 29 skipped**, 115 files (+1 skipped) (`final-runner-unit-full.log`); F-merge baseline was 2475 passed / 29 skipped, delta +131 = 144 - 13 |
| 4 | `tsc -p tsconfig.json --noEmit` | exit 0 |
| 5 | `eslint evaluation test/evaluation` | exit 0 |
| 6 | `eslint .` (whole runner) | exit 1: 3 errors, **none in my files** (`test/fixtures-tier/guidedCloseBound.test.ts:196` x2, `test/fixtures-tier/helpers/guidedLaunch.ts:174`; R2's files) |
| 7 | `node evaluation/cli.mjs oracle-self-test` | 15 passed (`oracle.test.mjs`; baseline ran 21 with 1 red file, see finding F1) |
| 8 | `node evaluation/cli.mjs validate-corpus` | exit 0, 0 errors |
| 9 | `python3 ... with-gradle-lock.py ... run-backend-tasked.py obs009-ep-probe01 ... --tests ...GuidedSchemaProbeIT` | **red first**: 9 tests, 5 passed, **3 failed**, 1 skipped. Cause: my own over-assumption that the provider schema root has `type:object`. |
| 10 | `obs009-ep-probe02` (after the fix) | 9 tests, 8 passed, 0 failed, **1 skipped** |
| 11 | `obs009-ep-probe03` (final, with the negative control) | **10 tests, 9 passed, 0 failed, 1 skipped**; collector exit 2 (default permits zero skips), sourceStable true, distStable true |
| 12 | `obs009-ep-budget01` `guidedIncrementalTest` | 36 tests, 36 passed, 0 failed, 0 skipped. `--tests` adds to the task's own include list instead of narrowing it, so all 36 joined incremental methods ran (about 22 min). Collector exit 2 because `sourceStable:false` (other lanes and my own IT were being edited). Non-evidentiary. |
| 13 | `obs009-ep-budget02` with an out-of-tree init script forcing profile `original4000` | 2 failed in 0.7 s. **No measurement.** See section 4. |

Gradle was always run through `with-gradle-lock.py`, `--no-daemon`, a new label each time; the lock was held 17:05-17:28Z (probe01, budget01, budget02), 17:31Z (probe02), 17:36-17:37Z (probe03 + mutations). lsof before/after listings are in the folder. I started no daemon, server or browser that outlives its run. [V]

### Mutation spot-checks [V] (`mutation-results.json`, `obs009-ep-mutj*`)
- Runner side: 16 mutations of `evaluate.mjs` / `pages/server.mjs` (drop unlisted-view check, clarification no longer blocks completion, gate floor rounds down, guard ignores manifest digest or refused status or purpose, stop rule `>` for `>=`, host stops logging unknown pages, host stores the password, driver finalizes twice, pins not compared, class N publication not a false success, unreported retry accepted, self-test label dropped, finalize default removed, leak count dropped, purpose filter removed). **All 16 killed by assertions.** (My first M12 was a syntax error, not a real kill; redone.) Files restored and sha256 verified.
- Java side: in-place under the lock, restored by trap, `cmp` byte-identical to the final file (sha256 `7b959547...`): retry-on-rejection (J1), rejection reported as accepted (J2), closed-object check recorded nothing (J3). **All 3 killed** (1 failed each).

## 4. B7 measurement (local fixture provider only; it can refute, never confirm)

**Result: the 7-proposals-per-session assumption is REFUTED.** [V `b7-proposals.json`, 70 sessions from `budget01`]

| Session | Proposals | Output reserved at the 2048 fixture ceiling | Reserved at the 4096 production ceiling [I: arithmetic] | Input reserved |
|---|---|---|---|---|
| 10-step base learn (edit-4 case) | **13** | 26,624 | **53,248 (166 % of the 32,000 total)** | 218,206 (83 % of 262,144) |
| edit-4 incremental session (relearn 4..10) | 9 | 18,432 | 36,864 (115 %) | 159,092 |
| 10-step base learn (insert-step case) | **13** | 26,624 | 53,248 | 218,206 |
| insert-step incremental session | 10 | 20,480 | 40,960 (128 %) | 176,954 |

- Across all 36 evidence files (70 sessions) the peak is 14 proposals, and **54 of 70 sessions need more than 7**.
- Production defaults: per-call output 4096, session output total 32,000 => floor = 7 proposals; a 10-step base needs 13. [V: per-call reservation = the ceiling, summed with no refund, see `cumulativeOutput` in the evidence]
- **What was and was not run at the production ceiling.** The session totals in the evidence are the production defaults (32,000 out / 262,144 in / 100 proposals, [V] `sessionLimits`). The per-call ceiling is the fixture's **2048**, because the incremental lane is closed to that profile. I tried the 4000-token profile through an out-of-tree init script (`ep-profile4000.init.gradle.kts`): `GuidedPublicationReplayIT` refuses it at fixture invocation (`the closed profile owns exactly its declared methods`). So the 4096 column is **derived arithmetic, not a run**. The proposal count itself does not depend on the ceiling.
- Per-CSI daily budget at that cost: floor(640,000 / 53,248) = 12 full 10-step base sessions per CSI per day on output (24 on input), against 81 planned sessions. [I]
- **Needs a MODEL-SIZING ruling before T4** (@architect + @pm): the per-session output total must reach at least 13 x 4096 = 53,248 (and more for retries and clarifications, which a real model adds), or the per-call ceiling must drop to floor(32,000 / 13) = 2,461 or below (the incremental lane already runs at 2048, which gives 15). I do not choose.

## 5. AC-8 local half (`GuidedSchemaProbeIT`) [V probe03 and `probe03-census.json`]
- Runs: provider schema self-contained and closed for SOURCE_PLAN, NEXT_ACTION, VERIFY_STEP (3); stub-gateway round trip of the probe code path (3); a provider 400 is reported as `BLOCKED_TRANSPORT` with exactly one send per projection and no fallback; the ledger gate; a negative control showing the closed/self-contained check can fail.
- **Census published for the ED-01 owner** [V]: roots are `anyOf(3)` (SOURCE_PLAN, 4,910 bytes, depth 10), `anyOf(2)` (NEXT_ACTION, 5,298 bytes, depth 14), `anyOf(2)` (VERIFY_STEP, 756 bytes, depth 5). Keywords used: `$defs`, `$ref`, `additionalProperties`, `anyOf`, `enum`, `items`, `maxItems`, `maximum`, `minItems`, `minimum`, `properties`, `required`, `type`. Schema sha256: `4c45f285...`, `af3f1605...`, `bf583f16...`. Whether the configured provider accepts root `anyOf`, `$defs`/`$ref` and `additionalProperties:false` is exactly the question the live probe answers. [I]
- External half `approvedGatewayProbeAcceptsEveryGuidedProjectionSchema` is **skipped by name** (`UNAVAILABLE_NOT_RUN`, `ed01Gateway ABSENT`, `realProviderRequestsBeforeGate 0`). It is never a pass. It sends only with `STUDIO_GUIDED_PROBE_APPROVED=ED-01-APPROVED`, the four `STUDIO_GUIDED_EVAL_*` variables, an https non-loopback endpoint, **and** an ADMITTED `ac8-schema-probe` entry in the ledger named by `STUDIO_GUIDED_PROBE_ADMISSION_LEDGER`.
- The new skip adds one named entry to the G9 approved-skips file.

## 6. Owed externally (unrun, owner named; never a pass)
ED-01 gateway owner (AC-8 acceptance, AC-9 real-model guard counts, AC-7 runs) - TBD per GA plan D-3. Remaining headroom R under the USD 500 wave authorization - **user**. Gateway price list and thoughts-token billing - ED-01 owner. Deployed stack and internal runner image (U4). Staging application with real login and the SSO case (U3, ED-04) and the dev-Vault secret (ED-02). AUTHORED-ECHO-01 acknowledgement (U13) and AE-01/FM-01 landings before the first real call. The C-17 masked-video human reviewer - **user**. MODEL-SIZING ruling (@architect + @pm). Deployed per-CSI and session ceilings (@devops).

## 7. Deviations from the write set
1. `evaluation/observed-authoring/evaluate.d.mts` is outside the listed write set. It is the typing sidecar `tsc` needs for the TypeScript tests (same pattern as the deleted `lifecycle.d.mts` and `report.d.mts`).
2. Deleted `test/evaluation/fixture-run.test.ts` and `scripted-backend.ts` (inside `test/evaluation/**`); they only exercised the deleted `lifecycle.mjs`. Added a C04-fidelity test that imports `fixture-server.mjs`, so `fixture-server.d.mts` stays inside the lint project.
3. `ADMISSION_REFUSED_OVER_ALLOCATION` added to the ledger status enum (an over-bound record needs a refusal state). [AUTO-DECISION]
4. The `--tests` filter on `guidedIncrementalTest` widened rather than narrowed the run (36 tests, about 22 minutes of lock time). Disclosed; no harm to others beyond the wait.
5. Build-directory side effects: `budget02` (profile override) ran the guidedIncrementalTest finalizers on a refused profile and may have touched `backend/build/guard-tally` and `backend/build/guided-cohorts/test`. F-merge and G9 run `--rerun-tasks`, so nothing evidentiary should depend on it. [I]
6. A first, superseded freeze (digest `a901a0d9...`) exists only as ledger entries 1 and 2; the C03 page was corrected and the manifest re-frozen before any use. Entries 3 and 4 are bound to the current digest.

## 8. Findings for root, @architect, @qa
- **F1.** `studio-runner/evaluation/browser-oracle.test.mjs` was red at the baseline (imports `dist/validator`, removed with the compile path) and `cli oracle-self-test` no longer runs it. `oracle.mjs`, `report.mjs`, `fixture-server.mjs`, `example-manifest.json` and `report.test.ts` are also compile-era. Under the single path they are dead except for being imported by tests. Root or 011 should decide on removal. I left them.
- **F2.** B7: see section 4. Blocks T4 until ruled.
- **F3.** `eslint .` on the runner fails on 3 errors in R2's `test/fixtures-tier/guidedCloseBound.test.ts` and `helpers/guidedLaunch.ts`.
- **F4.** The step texts, pages and expected outcomes are my drafts for Quinn's review. Any edit re-freezes the manifest, changes `manifestSha256`, and voids a prior admission. `expected-outcome.json` of C12 carries an unused `script.answerClarifications` key (harmless; the driver reads `script.clarificationChoices`).
- **F5.** The incremental case is only partly observable from the public API (per-step `learnedFromThisRun` / `reusedFrom`, counters around finalize). Backend prefix reservations and merged-replay model calls stay with `GuidedPublicationReplayIT`, or need an operator read of backend counters at T4. `createPublicApiClient` was written from the OpenAPI text and has never run against a live backend. [I]
- **F6.** D1, D3 and the incremental pair need their TypeScript fixtures reachable from the deployed runner pod at T4 (in-process hosting works locally). U4.
- **F7.** B2 and B3 still need @po/@architect rulings; the harness works under either (only `gate.classPCases` changes).

## 9. Batons
None. No `src/` change, no dist rebuild, no contract or migration. Story File List needs: `evaluate.d.mts`, `pages/**`, the seven test files and the five deletions.
