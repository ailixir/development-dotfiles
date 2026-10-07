# Story STUDIO-SCHED-002 — Share scheduling orchestration across checks and Studio

| Field | Value |
|---|---|
| Status | **Done** — independent QA CONCERNS for local default-off implementation; inherited global/production gates remain open |
| Epic | Scheduling implementation reuse and dispatcher/runner compatibility |
| Requested outcome | Studio scheduling reuses the actual scheduling implementation/approach used by HTTP, TCP and integration checks |
| Source | Current user instruction; [STUDIO-SCHED-001](../STUDIO-SCHED-001/STUDIO-SCHED-001.story.md); current scheduling/Studio code; [architecture](architecture.md); [independent QA design](qa-design-review.md) |
| Baseline | Current dirty working tree; STUDIO-SCHED-001 is Done with CONCERNS and its approval/history remain intact |
| Depends on | Existing generic schedule CRUD/CronDispatcher/executor pipeline and completed Studio schedule/atomic acceptance/ledger/runner pipeline; architect-first gate below |
| Drafted by | River (@sm), 2026-10-05 |
| Delivery estimate | None established |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["shared-recurrence-unit-tests", "generic-and-Studio-dispatch-integration", "profile-and-feature-flag-matrix", "PostgreSQL-atomicity-regressions", "gradle-check", "API-contract-regressions", "CodeRabbit-or-documented-manual-fallback"]

## Story

**As an** operator and maintainer of production checks,
**I want** HTTP/TCP/integration checks and Studio tests to use shared recurrence and due-work orchestration with target adapters,
**so that** scheduling changes and operational controls follow one implementation while each execution pipeline retains its proven admission, authorization and recovery behavior.

## Scope and product interpretation

The user requests implementation reuse. Merely importing Spring `CronExpression` in two independent classes does not satisfy this story. Shared production code must own the reusable recurrence and polling/orchestration responsibilities and be consumed by the existing `CronDispatcher` path and Studio path. Target adapters keep the ordinary check executors and Studio durable acceptance/runner separate where their semantics differ.

This is a compatibility refactor. It does not introduce suites, catalog linkage, new check rows, a new scheduler/queue, a migration of schedule storage, new frontend flows or new authorization/retry policy. Source callbacks, runner admission, confirmed revisions, occurrence identity and existing API/timezone/cron contracts stay authoritative. Aria owns the exact shared-code boundary and adapter interfaces in the architecture document; this story does not invent their class signatures.

The user's explicit request validates the structural direction. Architect and independent QA validation must precede code; PO checks business scope/capability preservation before Draft → Ready. No additional permission is required for the authorized reversible refactor. The prior story's global-validation and production release concerns remain open and are not erased by this story.

## Acceptance Criteria

1. **AC-01 — Actual shared implementation:** ordinary schedules and Studio consume one reusable backend recurrence implementation and one reusable due-poll orchestration implementation through target adapters. `CronDispatcher` participates in/consumes that shared code; Studio no longer owns a duplicate orchestration algorithm or private replacement scheduling engine. Source evidence plus behavior tests establish actual reuse; a shared library import or renamed duplicate is insufficient.
2. **AC-02 — Existing check recurrence compatibility:** preserve existing five/six-field cron normalization/interior whitespace, seconds/macros/calendar modifiers, accepted `ZoneId` forms including fixed offsets, the configured generic minimum's existing two-UTC-sample behavior, nullable no-future/exhaustion behavior, raw Spring calendar/DST sequence and advancement from stored due time. Shared APIs support policy variation; Studio's zero-seconds/fixed-60-second grammar, UTC/IANA restrictions and earlier-offset DST policy must not silently narrow HTTP/TCP/integration schedules. Report recurrence, when adapted to the same kernel, retains six-field/macros without five-field normalization and short timezone aliases; report delivery orchestration stays outside this refactor.
3. **AC-03 — Studio recurrence compatibility:** Studio preview and due acceptance retain shared authoritative next-slot calculation, exactly five preview slots, skipped gaps/once-per-local fallback, bounded latest-slot/grace handling, stable nominal versus eligible cursor, explicit lifecycle settlement and no historical catch-up. Existing Studio request/response/error DTOs remain compatible.
4. **AC-04 — Target execution adapters:** the ordinary adapter retains `CheckExecutorDispatcher`, existing result persistence, permits/concurrency budgets, source-enabled check kinds and ordinary failure/throttle/retry behavior. The Studio adapter calls `StudioScheduleProcessor`/shared acceptance and commits occurrence/accepted history/ledger/cursor atomically; actual browser execution stays with the existing Studio dispatcher/admission/runner. No Studio browser attempt enters `RetryDispatcher`/ordinary `failed_dispatches` or direct generic runner invocation.
5. **AC-05 — Backpressure and failure isolation:** ordinary global/type saturation or one adapter failure cannot consume Studio's independent pending/runner quotas or suppress an otherwise eligible target pass. Studio saturation/failure cannot prevent ordinary due checks or ordinary API responsiveness. Shared orchestration bounds work and isolates target failures while preserving the existing capacity/CSI fairness semantics.
6. **AC-06 — Flags, profiles and ownership:** preserve each existing feature flag's meaning, configured domain intervals/initial delays, ordinary proxied ShedLock/async drain and Studio default-off role boundaries. The shared hub owns one due heartbeat on `!api | worker`, while Studio target ownership remains `worker | (local & !api)`; standalone dev/test ordinary scheduling remains. Independent flags permit either target alone. API-only/local+API without worker have no automatic due hub; mixed worker+API intentionally permits worker roles. Shared cadence uses monotonic full-pass completion time plus interval, never UTC jumps/submission time. This preserves ordinary completion-based fixed delay and intentionally aligns Studio to it, replacing Studio's prior enqueue-callback timer phase/busy-skip behavior; nominal cron slots/grace/API stay unchanged. Initial delay, nonoverlap and bounded shutdown remain explicit. Effective heartbeat honors previously valid subsecond target intervals (including ordinary 250ms) without new required settings. Separate Studio execution/recovery/cancel schedules stay intact.
7. **AC-07 — Studio trust/authorization/ambiguity:** exact activated confirmed revision, affecting-edit invalidation/explicit Resume, immutable activation/occurrence provenance, fail-closed background/secret checks, overlap, durable uncertainty acknowledgment and accepted-run recovery/cancel behavior remain. Ambiguous browser effects are not automatically replayed and typed scheduled identity never aliases public manual keys.
8. **AC-08 — Check-kind/client compatibility:** HTTP, TCP, Splunk and all currently supported enabled integration check kinds retain scheduling functionality under their existing CRUD and dispatch contracts. Frontend centralized clients/MSW, generic and Studio OpenAPI routes, field names, response envelopes and status/error meanings stay compatible. No dummy `UI_TEST` catalog row or forced schedule-table conversion appears.
9. **AC-09 — Deterministic behavioral evidence:** add focused shared-code policy tests plus actual adapter/coordinator integration tests proving both paths use shared behavior, preserve seconds/timezone/DST policy differences, isolate target saturation/failure, honor mixed flag/profile states and stop duplicate ownership. Retain meaningful ordinary check dispatch and Studio PostgreSQL acceptance/idempotency/recovery tests where their seams change. Pure class-presence or source-string assertions alone cannot satisfy reuse or atomicity.
10. **AC-10 — Reviewable completion:** architecture, configuration/operational notes, tests, actual File List and story tasks describe the final shared implementation and removed duplication. Independent QA records the refactor's own verdict/results and inherited baseline limits; it never rewrites STUDIO-SCHED-001's prior approval or claims the unresolved global/production gates passed.

## Architect-first entry gate and dependencies

- Aria publishes mapped current paths, A/B/C options with trade-offs, selected shared-code interfaces, policy boundaries, configuration/profile ownership and a capability-preservation comparison in `architecture.md` before code.
- Independent Quinn perspective reviews transaction/retry, fairness, lifecycle and compatibility risks in that proposed design; fix any local design concerns before readiness.
- Pax validates this story against the final architecture and records the business-alignment/structural review. The explicit user direction supplies the requested reuse decision; no fabricated stakeholder approval is claimed.
- Root coordinates implementation only after this story becomes Ready. Concrete implementation class names/file split follow Aria's documented design.

## Tasks / Subtasks

### A — Freeze shared boundaries before code

- [x] A.1 Finish current-state and capability map, compare options, adopt shared recurrence/orchestration design with explicit ordinary-versus-Studio policies and target adapters. (AC: 1–8)
- [x] A.2 Obtain independent QA perspective and PO business/Ready validation; record sources and remaining release concerns. (AC: 9, 10)

### B — Shared recurrence

- [x] B.1 Extract pure reusable normalization/cron/timezone/next-slot primitives into the generic scheduling package; explicit policy inputs preserve differing seconds, interval, timezone and DST contracts. No Studio types/errors leak into ordinary schedule APIs. (AC: 1–3, 8)
- [x] B.2 Adapt `ScheduleService` and ordinary `CronDispatcher` advancement plus `StudioCronResolver` preview/due wrapper to consume `CronRecurrence`. Adapt compatible report resolver primitives without changing its custom input/timezone/delivery semantics. Preserve generic null-next/UTC sample behavior; remove the inaccurate generic fallback comment without altering actual sequence. (AC: 1–3)
- [x] B.3 Add behavioral grammar/timezone/DST/calendar/preview policy regressions, including nonzero generic seconds and both existing fallback outcomes where supported. (AC: 2, 3, 9)

### C — Shared due-work orchestration and target adapters

- [x] C.1 Implement neutral `ScheduledTarget`, `SchedulingTargetWorker` and `SchedulingCoordinator` with per-target bounded isolated workers, monotonic completion-based cadence, initial delay and failure/closed guards. Retain target-owned persistence, execution and errors. (AC: 1, 4, 5)
- [x] C.2 Existing `CronDispatcher` implements the target port and retains public constructor/direct-call API plus externally proxied ordinary-only ShedLock; remove its independent `@Scheduled`. Add `StudioScheduledTarget` for the unchanged processor and remove `StudioSchedulePoller`/its independent executor. Hub role/flags/heartbeat and shutdown phase preserve documented target ownership; no shared lock suppresses Studio. Move conditional Clock default into neutral scheduling configuration. (AC: 1, 6)
- [x] C.3 Prove mixed feature flags/profiles, per-target saturation and thrown failure, existing check-type enabled filtering and target-independent quotas/permits. (AC: 4–6, 8, 9)

### D — Compatibility evidence and review

- [x] D.1 Retain targeted ordinary scheduler CRUD/validation/dispatch/leadership/throttle and Studio schema/API/processor/acceptance/dispatcher/recovery regressions; add PostgreSQL adapter integration when admission/lock seams change. (AC: 4, 7–9)
- [x] D.2 Run applicable backend quality gates and API contracts; frontend verification is limited to contract consumers unless frontend code becomes necessary through an explicitly documented compatibility finding. Record inherited failures separately. (AC: 8–10)
- [x] D.3 Update architecture/operational configuration notes and actual File List; independent Quinn implementation verdict follows. Gage alone owns later remote/merge/release actions. (AC: 10)

## Dev Notes

### Selected architect-owned design

Option B in [architecture](architecture.md#abc-options-and-decision) selects actual neutral shared orchestration plus pure recurrence. `scheduling/CronRecurrence` owns normalization/parse/zone/next primitives with explicit ordinary/Studio policies and nullable next values; adapters translate existing domain errors. `ScheduledTarget` exposes bounded target ID, enabled state, interval, initial delay and one domain `pollAndDispatch` pass. `SchedulingTargetWorker` owns the same bounded/nonoverlap executor algorithm for each target; `SchedulingCoordinator` owns the sole recurring due heartbeat. Ordinary `CronDispatcher` and `StudioScheduledTarget` implement/bind the port; core imports no Studio classes. No common repository/transaction/executor/runner coupling is introduced.

Completion-based eligibility uses an injected monotonic ticker, while recurrence retains injected UTC Clock. The heartbeat is the minimum of requested coordinator heartbeat and configured target intervals (positive millisecond floor), so default 1000ms does not break existing 250ms ordinary configuration. Domain intervals/default initial delays remain independent. Shared hub profile `!api | worker` preserves dev/test/worker/local ordinary operation; Studio adapter still requires worker or local without API. Coordinator stops before existing ordinary async drain and cannot submit new due passes after close; accepted work stays with domain recovery.

**Intentional Studio cadence alignment:** the old Studio Spring fixed-delay callback enqueued asynchronous work and returned; subsequent callbacks skipped while its private pass was busy, so callback phase could allow another pass soon after completion. Shared workers now wait the configured interval after actual full-pass completion, matching ordinary HTTP/check scheduling. This requested reuse change removes a timing quirk rather than preserving it as a separate Studio algorithm. Configured values, nominal cron, occurrence/grace and client contracts remain; due time has never guaranteed exact browser start. No extra approval is inferred for this documented alignment.

Neutral coordinator tuning adds `checks.scheduling.coordinator.heartbeat-ms: 1000` and `shutdown-timeout-ms: 5000`; original domain settings remain. Exact ports/configuration/ownership and compatibility tests are architect-owned in [shared contracts](architecture.md#exact-shared-contracts) and [profiles/timing](architecture.md#profiles-flags-and-timing). This is the design selected under the explicit user reuse instruction; independent QA design is ACCEPTED in qa-design-review.md and PO readiness validates this documented boundary. Implementation evidence remains a later independent gate.

### Verified baseline and preservation

`scheduling/CronDispatcher.java` currently selects ordinary schedules by enabled `CheckType`, accounts for global/type permits, runs bounded dispatch transactions through `dispatchExecutor`, advances `nextExecutionAt`, submits ordinary execution after commit, persists outcomes, reverts throttles and records ordinary failures for generic retry. Its `@Scheduled`/ShedLock leadership and `SmartLifecycle` shutdown are real behavior, not a generic template.

`scheduling/ScheduleService.java` currently accepts normalized five/six-field Spring cron, validates against its configured interval floor and resolves `ZoneId` timezone forms. Its existing behavior must be captured before extraction; this story is not a hidden grammar/minimum-policy redesign.

`studio/scheduling/StudioSchedulePoller.java` currently owns a worker/local scheduled callback and private single-thread executor/in-flight guard calling `StudioScheduleProcessor`. `StudioCronResolver.java` independently normalizes/validates minute cron, resolves earlier-offset slots and bounds preview/latest-due work. Sharing only `CronExpression` leaves these parallel orchestration/recurrence implementations in place, which is the user's concern.

Studio processor/acceptance already owns test-first locking, current readiness, occurrence identity, fixed grace/eligible cursor, immutable revision/activation inputs, quota checks and durable ledger handoff. Runner sends, callbacks, ambiguity and cancellation remain outside the shared due producer. Generic check retries must not become Studio browser replay.

Existing STUDIO-SCHED-001 QA recorded local scheduling evidence with CONCERNS: four frontend baseline failures, incomplete broader/global coverage and live production identity/pilot gates remain separate. These are carried forward rather than represented as caused/fixed by a backend reuse refactor. No historic QA artifact is edited.

### Configuration and role boundaries

Keep the existing `checks.scheduling.*`, check source/executor flags and `studio.scheduling.*` settings/overrides meaningful. Document where shared code receives each target's interval, enabled state, budgets and failure policy. A common implementation may have compatibility entry adapters, but it cannot silently tie Studio activation to the ordinary check-dispatch flag or create Studio workers on API-only profiles. YAML owns mutable operational values; fixed public grammar/security rules remain explicit policy, not invented universal configuration.

Core shared scheduling types must depend on neutral policy/target interfaces, not Studio entity/acceptance/runner implementations. Concrete adapters bind targets at the application edge. This is ordinary-module reuse; architect-first expansion-pack independence checks are evaluated for applicability, not used to invent a new runtime plugin architecture.

### Testing

- Shared recurrence tests exercise actual returned instants/canonical rules for ordinary five/six-field/nonzero-seconds and timezone forms, Studio zero-seconds/IANA/UTC restrictions, DST repeated/gap slots, calendar boundaries and preview/due agreement. Preserve baseline policies deliberately.
- Coordinator/target integration demonstrates an ordinary HTTP/TCP/Splunk due result and a Studio accepted ledger occurrence through the shared orchestration, with stubs only at external executor/runner boundaries. Verify one target saturated/throwing does not suppress another, source-disabled kinds stay suppressed, and no direct Studio browser replay occurs.
- Spring profile/property tests cover ordinary enabled/disabled × Studio enabled/disabled, worker/local/API combinations, single Studio due owner and graceful shutdown. Existing ShedLock and ordinary drain behavior stay visible.
- Real PostgreSQL Studio schema/processor/acceptance tests remain necessary for atomicity, duplicate replicas, pause/edit/confirmation races and retained ambiguity. Use isolated scheduling databases because immutable audit anchors reject fixture DELETE; do not weaken triggers for tests.
- From `backend/`: focused Vitest-equivalent Java/JUnit tests through `./gradlew test --tests ...`, then applicable Spotless/Checkstyle/SpotBugs and `./gradlew check` when safe. Match existing repository scripts; no numerical coverage or latency promise is invented.
- Frontend clients/routes/types/MSW remain contract consumers. If their code stays unchanged, existing contract regressions suffice for this refactor; inherited frontend failures stay documented.

### Rollback

Preserve public API and persisted data so reverting the compatible shared-code change restores previous producer paths without database downgrade. Disable due work before a producer ownership rollback; verify exactly one Studio owner on restart, then resume ordinary/Studio paths through existing flags. Accepted Studio executions remain governed by their durable ledger and recovery. No schedule migration, legacy activation or catch-up burst accompanies rollback.

## CodeRabbit Integration

### Story Type Analysis

Primary: backend compatibility refactor. Secondary: scheduling orchestration, transaction/security and profile/configuration integration. Complexity crosses ordinary and Studio pipelines; architecture and independent QA precede implementation.

### Specialized Agent Assignment

Dex implements; Aria owns shared-boundary design and technical review; Pax validates scope/Ready; Quinn owns independent quality verdict; Dara reviews if storage/admission invariants are touched; Gage owns later remote/release work. Executor and quality owner differ.

### Quality Gate Tasks

- [x] Pre-commit implementation review with focused behavioral tests and documented manual fallback; CodeRabbit/WSL unavailable and configured graceful degradation applies. No automated review pass claimed.
- [x] Independent Quinn compatibility/atomicity/profile review; no self-approval.
- [ ] Pre-PR Gage review only if remote work is authorized later.
- [ ] Production enablement remains under inherited real-grant/pilot/load/restore gates.

### Self-Healing Configuration

Project configuration enables CodeRabbit with WSL tooling and graceful degradation. Actual configured QA policy is full mode, at most three iterations/30 minutes, fixing critical/high and documenting medium debt; unavailable tooling requires exact recorded fallback. No review/tool execution is claimed by this draft.

### Focus Areas

Actual shared algorithm ownership; ordinary grammar/timezone/seconds preservation; shared orchestration without target failure coupling; mixed flags/profiles and one due owner; test-first Studio acceptance; exclusive runner admission; no generic ambiguous browser retries; compatible metrics/shutdown/client/error contracts.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-05 | 0.1.0 | Draft actual shared-scheduling reuse story with capability-preservation AC, architecture-first gate and independent test plan. | River (@sm) |
| 2026-10-05 | 0.1.1 | PO business/scope review passed; readiness NO-GO pending architect-owned design and independent QA perspective. Status remains Draft. | Pax (@po) |
| 2026-10-05 | 0.1.2 | Validated GO (9/10) — Status: Draft → Ready; Aria Option B and independent QA design accepted; explicit Studio full-pass cadence alignment recorded. | Pax (@po) |
| 2026-10-05 | 0.1.3 | Implemented shared recurrence and one due coordinator with target isolation; 214 behavior tests and static gates passed. Status: Ready → InReview; independent QA and inherited global/production gates remain separate. | Dex (@dev) |
| 2026-10-05 | 0.1.4 | QA Gate CONCERNS — Status: InReview → Done; shared scheduling/runner compatibility verified for local default-off scope; inherited global and production gates remain open. | @qa |

## Dev Agent Record

### Agent Model Used

Codex execution in the active session; Aria design followed by Dex implementation, with independent PO/QA gates. No model override or external automated model dispatch.

### Debug Log References

[Backend verification](implementation/backend-verification.json) records the exact commands, 214 successful tests with no skips, final static passes, actual source hashes and files. Initial test-only fixture issues (recording client method name and ShedLock known-row cache after deletion) and narrow formatting issues were corrected before the final evidence. No production workaround, broad formatting or unrelated code replacement was introduced.

### Completion Notes

Implemented the selected common kernel/coordinator/target port. Existing catalog checks, Studio and compatible report recurrence call the same production kernel. Existing CronDispatcher is the ordinary target with its proxied ShedLock; Studio contributes its unchanged atomic processor and the existing runner/ledger consumer. The duplicate private Studio due poller was removed. Monotonic per-target completion cadence, bounded pools, independent flags/roles, failure isolation, ISO/SpEL configuration, completed heartbeat bean and safe lifecycle restart are verified with real Spring/PostgreSQL plus controlled HTTP/TCP/Splunk and runner-seam fixtures.

214 relevant backend behavior tests passed, zero failures/skips. Spotless Java Check, Checkstyle Main/Test and SpotBugs Main passed. Full unfiltered Gradle/Jacoco and live production grants/pilot/load/restore are not claimed; inherited concerns remain. No public API/DTO, migration, frontend or runner payload change. CodeRabbit executable/configured WSL unavailable; `.aiox-core/core-config.yaml` permits `graceful_degradation.skip_if_not_installed`; focused executor manual review/static gates performed and Quinn's independent final review is pending. No automated CodeRabbit pass or self-issued quality verdict.

### File List

Actual refactor source/test files (created or modified):

- backend/src/main/java/com/citi/put/checks/scheduling/CronRecurrence.java
- backend/src/main/java/com/citi/put/checks/scheduling/ScheduledTarget.java
- backend/src/main/java/com/citi/put/checks/scheduling/SchedulingTicker.java
- backend/src/main/java/com/citi/put/checks/scheduling/SchedulingConfiguration.java
- backend/src/main/java/com/citi/put/checks/scheduling/SchedulingCoordinatorProperties.java
- backend/src/main/java/com/citi/put/checks/scheduling/SchedulingTargetWorker.java
- backend/src/main/java/com/citi/put/checks/scheduling/SchedulingCoordinator.java
- backend/src/main/java/com/citi/put/checks/scheduling/SchedulingHeartbeat.java
- backend/src/main/java/com/citi/put/checks/scheduling/SchedulingDelays.java
- backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduledTarget.java
- backend/src/test/java/com/citi/put/checks/scheduling/CronRecurrenceTest.java
- backend/src/test/java/com/citi/put/checks/scheduling/SchedulingCoordinatorTest.java
- backend/src/test/java/com/citi/put/checks/scheduling/SharedSchedulingIT.java
- backend/src/main/java/com/citi/put/checks/scheduling/CronDispatcher.java
- backend/src/main/java/com/citi/put/checks/scheduling/ScheduleService.java
- backend/src/main/java/com/citi/put/checks/reports/schedule/ReportScheduleResolver.java
- backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioCronResolver.java
- backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioSchedulingProperties.java
- backend/src/test/java/com/citi/put/checks/studio/scheduling/StudioSchedulingIsolationTest.java

Removed duplicated implementation:

- backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioSchedulePoller.java

Documentation/evidence: this story, `architecture.md`, `implementation/backend-verification.json`, independent `qa-design-review.md` and `story-validation.json`; root-owned ADR-004/operations/architecture notes are recorded by their owner. No unrelated baseline file is attributed to this refactor.

## QA Results

Independent design perspective: ACCEPTED by Quinn in [qa-design-review.md](qa-design-review.md), with 16 future behavioral obligations. Aria Option B is documented and PO validated business/capability alignment GO (9/10), applying Draft → Ready. This is implementation-entry validation, not an executed-test or implementation-quality verdict. STUDIO-SCHED-001's Done/CONCERNS history and inherited baseline/global/production gates remain intact.


### Independent implementation review — 2026-10-05

Reviewed by Quinn (`scheduling_reuse_final_qa`), independent of the implementation executor. **CONCERNS** for the local default-off scope: all AC-01–10 met, no unresolved high-severity feature finding. Current source hashes match the implementation evidence; all 45 current JUnit suites confirm 214 passed with zero failures/errors/skips. Final executor static gates passed; coordinator runner evidence is 35 scoped assertions with coverage disabled; 23 unchanged contract inputs independently match historical QA hashes. CodeRabbit unavailable; configured manual fallback applied, with no automated pass.

Gate: CONCERNS → docs/qa/gates/STUDIO-SCHED-002-shared-scheduling.yml

[Independent report](implementation/qa-review.md) and [review fingerprint](implementation/qa-review-inputs.json) record source/behavior/role/lock/ledger/runner checks and inherited TEST-001/TEST-002/SEC-001/OPS-001 concerns. No waiver, whole-repository green claim, merge approval or production enablement approval; STUDIO-SCHED-001 historical QA is untouched. Verdict-owned lifecycle transition: **InReview → Done**.
