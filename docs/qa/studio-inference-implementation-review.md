# Studio inference implementation review

**Date:** 2026-09-16 · **Reviewer:** Quinn (independent QA) · **Disposition:** QF1–QF5 corrections reviewed with verification boundaries recorded below. The incomplete integrated implementation is not approved. Read the latest re-review disposition at the end of this record.

This bounded review inspected the runner changes for story 10.21, the new evaluation CLI/oracle, and the maintained gateway implementation for 10.22 in `wt/epic`, preserving the existing dirty integration baseline. Backend integration was still being written and was not treated as a stable release candidate. No story lifecycle status, application file, commit, deployment, or live gateway setting was changed by this review.

## Actionable findings

### QF1 — P1: an assertion can pass after its declared timeout

At the reviewed snapshot, [`playwrightAdapter.ts`](../../studio-runner/src/run/playwrightAdapter.ts) `pollUntil` checked a successful match immediately after `await read()` and checked the deadline only on mismatch. The text/value locator readers also received the complete assertion timeout again on every polling iteration, and sleep was not capped by the remaining time.

A real pinned Chromium probe used a fresh page for each implementation, with an initially incorrect `#x`, removal at 100 ms, recreation containing `ready` at 450 ms, and a 300 ms assertion timeout. Studio used a 200 ms poll interval. The independent `playwright/test` assertion failed at 306 ms; the current built Studio adapter **passed at 496 ms**. The correct text existed only after the specified deadline. This is an observable false success, not merely slow cleanup.

Fix the shared polling deadline: cap each locator read and sleep by remaining time, and recheck the deadline and runtime guard before accepting a successful reading. Add real-browser early-positive and late-negative companions involving a detached/recreated element, plus deterministic clock tests. Existing static-page conformance tests do not exercise this timing boundary. The run's outer deadline does not substitute for an explicitly shorter assertion timeout.

**Status at handoff:** coordinator was implementing a correction and new tests; this review has not independently verified that correction.

### QF2 — P1: oracle input and summary checks originally allowed misleading success

The initial [`oracle.mjs`](../../studio-runner/evaluation/oracle.mjs) accepted a manifest expectation containing only `{events: [], state: {}}`. Calling `evaluateOracle` with an equally incomplete observation returned `correct: true`: missing namespace, execution outcome, revision and configuration all compared equal as `undefined`.

The initial [`cli.mjs`](../../studio-runner/evaluation/cli.mjs) `summarize` command also exited **0** for one complete supported trial with `oracle.correct: false` and `falseSuccess: false`. Its summary contained `correctTrials: 0`. A wrong-locator failure, incorrect refusal, or timeout is still an incorrect translation even if it avoids a false PASS. Trial counts alone could not establish that each planned case/repetition existed, and an empty list produced zero token usage through `every([])`.

Required correction: validate complete expected/observed identities and outcome shapes; match unique trial IDs against the declared plan; distinguish missing usage from measured zero; return a nonzero status for incorrect trials, incomplete evidence or failed thresholds. The summary must not derive a passing exit code solely from absence of false successes.

**Status at handoff:** the coordinator added observation identity checks, explicit planned IDs and incorrect-trial counts while this review was running. Those changes were visible on reread, but this packet did not rerun their regression suite. They require independent follow-up verification.

### QF3 — P1: intended assertion failures are not distinguished from other failures at the same step

[`oracle.mjs`](../../studio-runner/evaluation/oracle.mjs) checks `executionStatus === 'FAILED'` and `assertionFailureStep`, without an independently checked failure classification. A probe using the correct expected namespace/events/state/revision/configuration and expected failing step 2 returned `correct: true` when the observation additionally declared `failureKind: 'TRANSPORT'` and `errorCode: 'BROWSER_CRASH'`.

The existing unit test titled “not an arbitrary transport failure” changes the failing **index**, which does not test a wrong failure at the intended index. An actual browser crash or wrong-locator timeout at the expected assertion step must not count as correct negative-assertion behavior.

Require a closed, trustworthy failure-origin classification and relevant error code in the observation; expected assertion failures must match assertion-origin failures and the intended step. Reject contradictory status/classification combinations and unexpected observation fields according to the final schema. Add same-step crash, target/locator failure and deliberately contradictory assertion controls. Derive this classification from the real runtime result rather than setting it from the manifest expectation.

**Status at handoff:** reported to the coordinator; correction and independent re-test pending.

### QF4 — P1: credential refresh is outside the gateway cancellation boundary

[`GenAiLlmGatewayClient.java`](../../backend/src/main/java/com/citi/put/checks/studio/compile/gateway/GenAiLlmGatewayClient.java) registers cancellation on the model HTTP call inside its OkHttp interceptor. It gives the SDK ordinary application-default or service-account `GoogleCredentials`. Inspection of the installed Google Gen AI 1.71.0 bytecode confirmed that `ApiClient.buildRequest` calls `GoogleCredentials.refreshIfExpired()` **before** `HttpApiClient.executeRequest` creates and executes the OkHttp call. The interceptor and its cancellation registration have not run during that refresh.

The current [`CompileExecutor.java`](../../backend/src/main/java/com/citi/put/checks/studio/compile/CompileExecutor.java) deadline handler cancels the request budget and registered hooks, but does not interrupt the worker. A stalled token refresh therefore has no registered cancellation hook and can keep a compile worker and gateway permit occupied beyond expiry. The model-call timeout cannot bound work performed before that call exists. Tests using no-credentials mode establish model transport cancellation, not the production credential path.

This finding is based on code and installed-SDK inspection, **not a live credential call or a reproduced remote stall**. Local inspection traces are `/tmp/studio-qa-api-client.txt` and `/tmp/studio-qa-http-api-client.txt`; the relevant SDK order is retained here because temporary files are not durable evidence.

Provide an injectable, explicitly bounded credential acquisition/refresh boundary that participates in the same request deadline and cancellation policy, including its own underlying transport. Do not release capacity while unbounded refresh work merely continues elsewhere. Add a local held-credential-provider/transport regression demonstrating deadline completion, no later model request, released capacity, and a successful subsequent request. Check application-default and service-account behavior without real credentials or external calls.

**Status at handoff:** coordinator was assigning the gateway expert to remediate it. Independent re-test remains required.

## Positive checks and limits

- Runner trial-option removal is consistent across the action schemas, operation types and adapter pass-through; the policy rejects both `trial:true` and `trial:false`. String whitespace normalization and explicit regex case overrides have real pinned-Playwright positive/negative comparison tests. QF1 remains an uncovered timing exception at this snapshot.
- Runner validator/executor/syntax pins and backend compile syntax/prompt pins inspected at `2.0.0`; runtime artifact envelope remains `1`. The gateway uses the maintained Gen AI client with SDK retry attempts set to one and a separate bounded retry loop. These observations do not prove live R2D2 compatibility.
- The new model proposal parser rejects extra fields, duplicate JSON keys, trailing tokens, wrong kind/version/order/IDs and contradictory generated versus unsupported shapes. The provider schema is intentionally a weaker supported subset; strict local acceptance remains necessary. Production gateway wiring contains no fallback to the removed legacy client.
- The independent browser mutation tests execute syntactically permitted wrong-account and omitted-action artifacts through the real validator/executor. They establish that executor PASS can disagree with fixture outcomes. They are small T2 controls, not a measured English-to-model corpus or a complete isolated fixture service.
- The evaluation run command's explicit incomplete result was known and was not relabelled a completed feature. It must acquire a real lifecycle adapter before local F implementation is complete. Unsupported/clarification trials need their own non-executable expectation schema: they must not fabricate candidate/execution identities to satisfy an execution-only oracle.
- The oracle browser test imports existing `dist/` directly. Its supported invocation should rebuild or assert an exact source/build digest so a future self-test cannot unknowingly validate stale binaries. The existing fixture tier already uses global setup for this reason.
- Quantitative quality/latency/cost targets remain proposed until the documented accountable freeze. Neither the current simple summary nor the developer test counts establish those targets. Final reporting must retain per-mode/family denominators, repeated-trial dependence, missing usage and unavailable external prerequisites.

## Verification performed in this packet

| Check | Result |
| --- | --- |
| Read story 10.21 implementation/tests, new oracle/CLI, gateway/parser/budget/executor | Completed against the working tree; active integration changes limit snapshot stability |
| Incomplete expected/observed oracle probe | Reproduced initial false `correct:true` |
| Summary CLI probe with a complete but incorrect supported trial | Reproduced initial exit 0 and `correctTrials:0` |
| Same-step non-assertion failure probe | Reproduced `correct:true` despite contradictory transport/crash classification |
| Real Chromium late-condition comparison, isolated page per implementation | Playwright FAIL at 306 ms; Studio PASS at 496 ms for timeout 300 ms |
| Installed Gen AI SDK credential/request ordering inspection | Confirmed credential refresh precedes model HTTP call/cancellation registration |
| Backend Gradle, full runner/oracle suites, live model calls | Not run in this bounded packet; shared backend build ownership retained by coordinator |

Developer-reported prior counts (965 runner unit tests, 116 browser fixtures, 17 initial oracle tests) are contextual handoff evidence, not independent reruns by this reviewer. They do not negate the reproduced defects.

Follow-up QA should use a stable integrated snapshot after QF1–QF4 corrections, run their specific negative regressions first, then the affected suites and complete full/incremental lifecycle tests. This review does not approve the incomplete feature, close story 10.21/10.22, or establish release readiness.

## Re-review — QF1–QF4 corrections and frontend/evaluation integration

The coordinator requested this second bounded pass after implementing corrections. Files were still receiving targeted fixes; results below identify what was actually executed rather than treating ongoing changes as verified automatically.

| Finding / surface | Re-review disposition | Evidence |
| --- | --- | --- |
| QF1 — late assertion PASS | **Addressed for the reported case and independently re-tested** | `pollUntil` now caps reads/sleep with remaining time and checks guard/deadline after the read. Fresh `npx vitest run --config vitest.fixtures.config.ts test/fixtures-tier/assertion-semantics.test.ts`: **29 passed**, including detached/recreated element positive at 150 ms and negative at 500 ms against timeout 300 ms, each compared with pinned Playwright |
| QF2 — absent identities, duplicate/missing planned trials, incorrect-result exit | **Addressed, including the summary follow-up; independently re-tested** | Initial fresh self-test: **22 passed**. After the final summary correction, targeted oracle/lifecycle run: **20 passed**, including contradictory verdict, missing timing, duplicate identities and incorrect completed outcomes |
| QF3 — same-step crash accepted as assertion failure | **Addressed at the oracle boundary and independently re-tested** | Expected/observed assertion failures now require `failureKind: ASSERTION` and null error code; same-step browser-crash regression passed in the 22-test run. The live execution API still lacks typed assertion-origin evidence, so the adapter correctly leaves that origin unknown; intended failing T3 cases cannot yet score correct |
| QF4 — unbounded credential refresh | **Code correction and concrete test evidence reviewed; no new Gradle invocation by this reviewer** | `BoundedCredentialProvider` runs synchronous refresh through `BudgetedAuthTransport` with shared deadline/cancellation, and the SDK receives static credentials. Actual test-result XML inspected: `CredentialBudgetTest` **4 passed**, including real Google service-account and ADC-user token refresh against a held local server, explicit cancellation and unsupported-provider refusal; `GenAiLlmGatewayClientTest` **7 passed**. Reports timestamped 2026-09-17 02:35 UTC. Backend build ownership remained with the implementation agent |
| Frontend versioned authoring/review/run | **Focused independent checks passed; no new critical UI defect identified in this pass** | `npm test -- --run src/components/studio/inference/InferenceStudio.test.tsx`: **14 passed**. Cases include exact six-field confirmation, stale-confirmation reload/acknowledgment reset, no browser until explicit Run, historical/current result separation, suffix reuse and repeat-run idempotency. These MSW cases do not substitute for the integrated backend lifecycle |

Fresh logs: `/tmp/studio-inference-qa-rereview-assertions.log`, `/tmp/studio-inference-qa-rereview-oracle.log`, and `/tmp/studio-inference-qa-rereview-frontend.log`. Counts and the tested boundaries above are retained here; temporary logs are supporting local evidence only.

### QF2 follow-up — contradictory summary verdict and incomplete metric coverage

The updated summary still accepted a supplied complete trial with `oracle: {correct: true, falseSuccess: true}`. A direct probe returned `correctTrials: 1`, `incorrectTrials: 0`, and `falseSuccesses: 1`; the CLI's current exit logic checked `incorrectTrials` and would return 0. The summary therefore needs consistency validation for its input verdict, even though ordinary `evaluateOracle` output does not produce this contradiction.

The correction rejects contradictory oracle flags and missing/invalid timing, records timing coverage, and refuses a successful exit when false successes exist. The final targeted run independently passed its new contradictory-correctness/missing-timing regression. The original finding is retained above to explain why this check is required.

### QF5 — P1: the new lifecycle adapter initially did not establish full execution correspondence

The new [`lifecycle.mjs`](../../studio-runner/evaluation/lifecycle.mjs) initially accepted a terminal PASSED response with `stepResults: []` as complete full execution. Its own positive scripted lifecycle fixture returned exactly that shape. It did not check the returned execution/test identity or complete ordered step coverage. Additionally, an explicitly contradictory `configurationRevision` was overwritten with the expected value whenever `revisionId` matched.

The behavioral oracle remains necessary, but an app state matching the goal cannot prove that all reviewed checks actually executed. Require the accepted execution ID, test ID, exact candidate revision, noncontradictory configuration identity, and a complete ordered source-aligned step result set. PASSED requires every expected step to be PASS; failed/error cases require the corresponding valid terminal shape. When an API omits configuration identity, deriving it through a verified immutable revision association is distinct from ignoring an explicit mismatch.

**Correction and independent verification:** the coordinator added execution/test/revision checks, rejected present configuration mismatches, required every ordered step's index/source/status, and restricted configuration inference to the omitted-field case. The final targeted run passed the new missing-step, wrong-execution and wrong-configuration negative lifecycle cases, together with correct-lifecycle and wrong-app-state controls. QF5 is addressed for the reported cases. This verifies the local scripted transport path, not a live full execution.

The separate fixture control server and live lifecycle adapter are now implemented as development evaluation plumbing. Live calls were not performed. The current example corpus is a smoke corpus, and `releaseReady` remains false. Full held-out evaluation, runtime assertion-failure classification, measured release criteria, approved images/gateway and integrated backend race/confirmation behavior remain separate required evidence.

**Final targeted verification:** `node --test evaluation/oracle.test.mjs evaluation/lifecycle.test.mjs` passed **20/20** with zero skips. Log: `/tmp/studio-inference-qa-rereview-final-oracle.log`. This supersedes the pending QF2/QF5 correction status recorded earlier in the pass.

**Latest disposition:** the reported QF1, QF2, QF3 and QF5 cases have fresh independent regression evidence. QF4 has a reviewed bounded implementation and inspected local test results; this reviewer did not rerun backend Gradle. No further critical finding remains open from this bounded packet. Broader backend integration, complete-suite gates and live evidence remain outside that statement. No production readiness or formal story approval is asserted. This re-review edited only this document and ran the named Node/browser/frontend checks; no backend Gradle, live gateway calls, commits or deployment actions occurred.
