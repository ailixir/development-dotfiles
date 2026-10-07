# Independent implementation QA — STUDIO-SCHED-002

Reviewer: Quinn (`scheduling_reuse_final_qa`, separate from the implementation executor). Review date: 2026-10-05 (America/New_York). **Gate: CONCERNS for the local, default-off implementation.** All ten acceptance criteria are met within that scope; no unresolved high-severity feature defect was identified. Existing global-validation and production-release obligations remain open, with no waiver or merge/production approval.

Reviewed revision: `working-tree-source-sha256:25bbb70a6a30ab38962b15c7665f75386fac259b788dd4e2253df9f9d487f415`. [Input manifest](qa-review-inputs.json) pins 45 source/contract inputs and the story's pre-transition digest. All 19 implementation-evidence hashes match current files; all 23 recorded contract inputs (19 frontend sources plus public schema/DTO/migration/runner input) match historical QA hashes. The deleted `StudioSchedulePoller` is absent. Processor/acceptance hashes match the historical review; current dispatcher commit/send/ambiguity behavior was inspected and fingerprinted without claiming a historical byte comparison unavailable in that manifest.

## Acceptance and evidence

| Criteria | Independent finding and evidence |
| --- | --- |
| AC-01 | One production `CronRecurrence` and one `SchedulingCoordinator`/`SchedulingTargetWorker` algorithm serve ordinary and Studio target adapters. The duplicate due poller is removed. `SharedSchedulingIT` demonstrates actual HTTP/TCP/Splunk outcomes and Studio occurrence/ledger production through the same Spring coordinator. |
| AC-02 | Compatible normalization, macros/seconds, accepted ZoneId forms, two-UTC-sample minimum, nullable exhaustion, stored-due advancement and native DST sequence remain explicit generic policies. Report macros/short aliases/raw six-field input remain. Recurrence, validation, DST, drift and report regressions passed. |
| AC-03 | Studio preserves minute/IANA/earlier-offset policy, five-slot previews, bounded latest-in-grace and nominal/eligible cursor behavior through the shared kernel. Resolver/API/schema regressions passed. |
| AC-04 | Ordinary result/executor/throttle/retry paths remain target-owned. Studio target delegates to the existing atomic processor/acceptance and durable ledger; existing dispatcher commits before send and retains ambiguity without replay or generic retry. Real integration plus acceptance/dispatcher/recovery regressions passed. |
| AC-05 | Bounded per-target pools and guards isolate blocked/throwing/failed-eligibility targets; domain capacity remains inside adapters. Controlled coordinator isolation and retained backpressure/capacity tests passed. |
| AC-06 | Ordinary-only proxied ShedLock is exercised with a held real lease while Studio proceeds. Independent flags and worker/local/dev/test/API/mixed role ownership are covered. Full Boot establishes one 250ms due timer and ISO/SpEL compatibility without circular references. Monotonic completion/initial cadence, stop/restart and unfinished-old-generation nonoverlap are covered. |
| AC-07 | Processor/acceptance invariants remain; schema/API and acceptance/dispatcher/recovery tests cover retained provenance, authorization, deduplication and uncertainty behavior. Two real PostgreSQL worker contexts produce one Studio ledger occurrence with the catalog flag disabled. Production identity remains separately gated. |
| AC-08 | HTTP/TCP/Splunk execute under current contracts; disabled types stay suppressed; no UI_TEST catalog row is created. Public/client/schema inputs remain unchanged. Runner compatibility passed in the coordinator's separate scoped run. |
| AC-09 | Tests assert returned instants, target calls, persisted outcomes, real Spring timer/proxy behavior, real replica deduplication and runner-seam behavior; source presence alone is not the proof. |
| AC-10 | Architecture/operational notes, actual file inventory and separate evidence describe the final design. This review has its own gate and fingerprint; historical STUDIO-SCHED-001 approval is preserved. |

## Verification attribution

- Executor's [backend evidence](backend-verification.json): **214 tests passed**, zero failures/errors/skips. QA independently parsed all **45 current JUnit XML suites**, matching those totals and every recorded suite. No broad test rerun was needed.
- Executor's final separate Spotless Java, Checkstyle Main/Test and SpotBugs Main command: **PASS**. The earlier combined command exited for test formatting; narrow formatting was corrected before the successful final static run. Behavioral XML and final source hashes remain consistent.
- Coordinator's [contract evidence](../verification/contract-compatibility.json): **35 runner assertions passed** in two files with global coverage disabled. QA independently verified all recorded unchanged inputs against the historical manifest. No frontend rerun or full runner coverage claim is made.
- CodeRabbit and configured WSL tooling are unavailable; repository `graceful_degradation.skip_if_not_installed: true` permits documented manual fallback. This independent source/test/evidence review is that fallback; no automated-review pass is claimed.

## Open inherited concerns

1. **TEST-001 (medium):** four pre-existing frontend failures remain; the latest whole suite is not green. Close the existing InferenceStudio/video-playback accessibility baseline gate before merge/release.
2. **TEST-002 (medium):** unfiltered backend test/check/Jacoco and whole-runner coverage remain unverified. Complete required repository-wide validation before merge/release; scoped passes cannot close it.
3. **SEC-001 (medium):** approved live background/secret grants and production policy identity remain external obligations. Keep fail-closed local fixtures and obtain security/platform evidence before production enablement.
4. **OPS-001 (medium):** real scheduled-browser pilot, representative capacity, retention/restore and compatible rollout evidence remain release-gated. Keep scheduling default off until owners close them.

No application edits, new finding-driven fix, waived obligation, remote action or historical QA rewrite was made during this finalization. QA owns the verdict-driven **InReview → Done** transition; Done records the reviewed local implementation and does not close these inherited release gates.
