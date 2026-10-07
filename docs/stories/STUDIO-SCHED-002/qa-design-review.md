# STUDIO-SCHED-002 — independent design perspective

Reviewer: Quinn. Date: 2026-10-05. **Design disposition: ACCEPTED for PO readiness and implementation**, subject to the behavioral checks below. This validates Aria's selected Option B against inspected source; it is not an implementation quality gate, executed-test result or production approval. No application code or test was changed or executed by this perspective. STUDIO-SCHED-001's Done/CONCERNS evidence remains unchanged.

Reviewed [architecture](architecture.md), the associated [story](STUDIO-SCHED-002.story.md), actual `CronDispatcher`, `ScheduleService`, `CheckExecutorDispatcher`, `StudioSchedulePoller`/processor/resolver, `ReportScheduleResolver`, worker/API configuration, `ShedLockConfig`, async executors and existing scheduling/profile tests.

## Why the selected boundary meets the request

The neutral `CronRecurrence` owns reusable normalization/parsing/zone/next-slot code. `ScheduleService`, ordinary advancement, Studio preview/due and the optional report wrapper consume that implementation with explicit policy differences. The neutral coordinator and per-target worker own the recurring due heartbeat, cadence, bounded execution and failure isolation. Existing `CronDispatcher` becomes an externally invoked target; the Studio target calls its existing atomic processor. The former Studio due poller is removed. These are actual shared production algorithms rather than two copies importing Spring.

HTTP/TCP/Splunk remain under their existing check executor/result/retry pipeline. Studio remains under confirmed-revision acceptance and its durable ledger, admission, browser runner and recovery. This is the compatible specialization needed to satisfy the user's reuse request without converting Studio UUIDs into catalog check IDs or replaying uncertain browser effects. Distinct execution/recovery timers are outside due-definition polling and remain.

## Risks addressed in the final design

| Source-derived concern | Accepted contract |
| --- | --- |
| Ordinary dispatcher bean disappears when its flag is false. | Shared hub exists independently; the Studio target can run with ordinary scheduling disabled. No direct Studio import enters neutral scheduling core. |
| Ordinary global backpressure/disabled types can return before work selection. | Capacity is handled inside that target; another target has its own bounded worker. A blocked or throwing target cannot suppress the other target's eligible pass. |
| Shared outer ShedLock would suppress Studio with the ordinary lease. Self-calling a newly locked method would bypass proxy advice. | Unlocked common heartbeat invokes the existing **proxied** ordinary target, whose lease covers its actual synchronous dispatch pass. No asynchronous submit-and-immediately-release lease or `this` call. Studio correctness remains database deduplication. |
| Cadence measured at submit time allows overlap or shortens fixed delay after a slow pass. Wall-clock shifts can distort eligibility. | Shared worker uses monotonic time, initial delay and next eligibility at completion plus target interval; guard prevents overlapping/queued replay. UTC time remains for cron/occurrence timestamps. |
| New default 1000ms heartbeat could reject a formerly valid subsecond ordinary interval. | **Corrected during review:** effective heartbeat is clamped to the minimum requested/configured target interval, including a currently disabled Studio target. Existing 250ms settings do not require a new override. |
| Shared strict Studio grammar could change ordinary schedule acceptance and next times. | Preserve ordinary edge trimming/interior whitespace, macros/nonzero seconds, `ZoneId` fixed offsets, configurable two-UTC-sample minimum, nullable future, stored-due catch-up and native fallback sequence. Studio restrictions/earlier-only slots remain explicit policy. |
| Report custom input was described as strictly six fields, but current raw Spring parsing also accepts macros. | **Corrected during review:** reports retain six-field/macros parsing, no five-field normalization, short aliases, nullable next and existing frequency builders. No report delivery orchestration change. |
| A removed private poller can leave duplicate automatic owners or disable accepted recovery. | One common due heartbeat, explicit Studio worker/local-without-API adapter, old poller removed. Existing Studio dispatcher/recovery/cancel schedules and independent execution flag remain. |

API-only automatic polling is excluded by the selected hub role, including an erroneous ordinary enable override; intentionally combined API+worker mode retains worker ownership. This makes role ownership explicit. Existing `ApiProfileIT` establishes the API-only non-scheduler role; the complete chosen profile matrix must be exercised rather than inferred from annotations.

Stop order closes shared submission guards before the ordinary dispatcher's existing async drain. Already submitted domain transactions and accepted Studio ledger work retain their existing recovery/cancel semantics. A bounded shutdown wait is not a claim that arbitrary external calls can be terminated safely or that production latency has been measured.

## Required future behavioral evidence

All cases below are implementation targets; none is represented as already passing. Tests should assert outputs, actual target invocation, persistence and lock behavior. Source-string checks alone cannot establish reuse, ownership or safety.

| ID / priority | Trace | Required behavior |
| --- | --- | --- |
| REUSE-CRON-01 / P0 | AC-01/02 | Generic five/six fields, exact whitespace, Spring macros and nonzero seconds use the shared kernel and preserve existing results/errors. Configure a generic one-second floor to prove seconds remain supported. |
| REUSE-CRON-02 / P0 | AC-02 | Preserve configured two-UTC-sample validation/reference date and null-next acceptance; do not silently strengthen irregular cron validation. Generic fixed-offset zones remain accepted. |
| REUSE-CRON-03 / P0 | AC-02/03 | Daily New York 01:30 gives both native generic UTC offsets but only the earlier Studio slot; spring gaps skip. Ordinary advancement uses stored overdue due time and Studio uses future/grace policy. |
| REUSE-CRON-04 / P1 | AC-03 | Studio canonical zero-second/IANA rules, five previews, bounded latest-in-grace and NY/Lord Howe/Casey behavior remain; no-future remains typed 400. |
| REUSE-CRON-05 / P1 | AC-02/08 | Reports preserve raw six-field/macros input, reject unnormalized five fields, honor SHORT_IDS/default UTC, nullable exhaustion and supplied-base advancement; existing builders unchanged. |
| REUSE-WORKER-01 / P0 | AC-05/06 | Injected monotonic ticker proves target initial delay, fixed delay after completion, no overlap/queued pass, future recovery after a thrown pass and no cadence bypass on UTC clock changes. |
| REUSE-WORKER-02 / P0 | AC-05 | Block one target with a deterministic latch and prove the other completes its pass on the same heartbeat. Failure from target dispatch must release only its own guard. |
| REUSE-WORKER-03 / P1 | AC-06 | Ordinary 250ms without a new heartbeat override starts and honors its cadence; a requested slower heartbeat clamps safely; disabled Studio can later enable without inherited slow cadence. |
| REUSE-WORKER-04 / P0 | AC-06 | Close prevents further submissions, existing in-flight work is bounded/drained according to domain lifecycle and no new poll owner appears on restart. Common lifecycle stops before ordinary drain. |
| REUSE-LOCK-01 / P0 | AC-04/06 | Actual ordinary ShedLock held by another worker suppresses only ordinary dispatch; Studio still creates a due decision through the hub. Two ordinary workers do not both dispatch while the lease is held. Preserve lease name/durations. |
| REUSE-FLAGS-01 / P0 | AC-06 | Both flags off, ordinary-only, Studio-only, both on: independent target behavior. An ordinary dispatcher absent due to its flag cannot remove the common Studio hub. |
| REUSE-PROFILE-01 / P0 | AC-06 | Worker, local, dev, test, API, local+API and worker+API follow the selected ownership matrix. One common automatic due heartbeat, no old Studio due owner and no API-only Studio production. |
| REUSE-CHECKS-01 / P0 | AC-01/04/08/09 | Registered HTTP/TCP/Splunk controlled executors persist ordinary outcomes through the same coordinator used by a real PostgreSQL Studio occurrence; disabled check kinds remain suppressed. Verify actual shared behavior, not class names alone. |
| REUSE-STUDIO-01 / P0 | AC-04/07/09 | Real PostgreSQL shared-target pass preserves occurrence/history/ledger/cursor atomicity, activated revision/human provenance, quotas, ambiguity and typed identity. Browser handoff remains through the existing Studio dispatch client/admission seam. No ordinary failed-dispatch/retry entry. |
| REUSE-PRESSURE-01 / P0 | AC-05 | Ordinary global/type saturation still lets Studio attempt; Studio quota refusal or SQL failure still lets an eligible ordinary check execute. No cross-target permit accounting. |
| REUSE-CONTRACT-01 / P1 | AC-08/10 | Current route/status/schema/runner body checks remain; no wire/schema migration or frontend mutation. Existing ordinary CRUD/validation/drift/batch/leadership/throttle and Studio acceptance/dispatch/recovery cases are retained where seams change. |

The current generic ShedLock test pins its annotation on `CronDispatcher.pollAndDispatch`. That lock location can remain in this design; any test update must preserve actual lease exclusion instead of weakening the pin to make the suite pass. Existing manual constructors/direct calls remain compatible while integration tests prove the coordinator obtains the proxied Spring target.

## Entry and release boundary

No structural blocker remains after the two recorded compatibility corrections. Pax can validate final story consistency and apply Draft → Ready; Dex can then implement the selected design and its concrete test plan. Architecture approval does not permit implementation before that Ready transition.

The inherited four frontend baseline failures, unfiltered backend/Jacoco/global checks and production identity/pilot/load/retention/restore obligations remain open. This backend reuse refactor neither resolves nor expands those external claims. Its own independent implementation gate must record actual final code, tests, static checks and source revision, without overwriting STUDIO-SCHED-001's historical QA artifact.
