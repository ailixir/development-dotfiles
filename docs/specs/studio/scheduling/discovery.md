# Studio test scheduling — brownfield discovery

Date: 2026-10-05. Analyst: Atlas. Scope: analysis and planning only; current working-tree files are the baseline, including uncommitted work. No application code or existing product artifacts were changed for this analysis.

## Classification and workflow

**Significant brownfield enhancement requiring a fullstack plan and multiple stories.** Scheduling crosses product scope, schedule persistence/administration, background acceptance, execution identity/authorization, Studio history, frontend controls, mocks and operational validation. It is not an isolated scheduler-dialog change or a single safe patch.

Use the existing `brownfield-fullstack` workflow's analyst classification/documentation checks, then PM requirements definition, architect integration design, UX interaction design, PO validation and SM story drafting. The implementation boundary belongs to a later story-driven delivery cycle. No new scheduler vendor or delivery estimate is established by this discovery.

The classification follows directly from these integration seams:

| Seam | Current evidence | Planning consequence |
|---|---|---|
| Product scope | `PRD.md:99`, `PRD.md:106`, `PRD.md:111`; `docs/brd/checks-ui-studio.brd.md:56`, `:116` | Scheduling is explicitly post-V1 and is now the requested enhancement. Existing artifacts establish direction, not its complete acceptance contract. |
| Schedule target | `backend/src/main/java/com/citi/put/checks/scheduling/entity/Schedule.java:23`; `.../scheduling/ScheduleService.java:59` | Existing schedule CRUD requires a check ID. Studio tests have separate IDs and do not become catalog checks merely because a schedule is added. |
| Execution lifecycle | `docs/architecture/studio-execution.md:229`; `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioAcceptanceService.java:164` | Due occurrences must reuse Studio readiness, acceptance, quotas and ledger, while retaining exclusive runner admission. |
| Retry behavior | `backend/src/main/java/com/citi/put/checks/scheduling/CronDispatcher.java:269`, `:304`; `docs/architecture/studio-execution.md:158`, `:229` | Generic automatic retries are unsuitable for ambiguous browser attempts that may already have changed the target application. |
| UI and API | `frontend/src/components/scheduling/ScheduleDialog.tsx:35`, `:104`; `frontend/src/services/api/studioApi.ts:81` | Existing dialog is bound to `CheckEntity` and checks API state; Studio API exposes no schedule administration methods. |

`.../` above abbreviates only the already named Java package root `backend/src/main/java/com/citi/put/checks/`.

## What the existing requirements actually establish

The following are source requirements, rather than new feature proposals. Local IDs are discovery trace labels, not previously approved FR numbers.

| Trace | Existing requirement | Source |
|---|---|---|
| SRC-01 | Allow a confirmed Studio test to attach to platform scheduling after on-demand execution is proven. | `docs/brd/checks-ui-studio.brd.md:116`; `PRD.md:78` |
| SRC-02 | Extend worker due-work selection and schedule administration, reusing acceptance/readiness/authorization/quotas and the same dispatch ledger. | `docs/architecture/studio-execution.md:229` |
| SRC-03 | Scheduled work never compiles implicitly; unready scheduled tests produce explicit `COMPILE_REQUIRED`. | `docs/architecture/studio-execution.md:229` |
| SRC-04 | Exact confirmed source/configuration stays immutable; execution-affecting edits require confirmation. | `docs/brd/checks-ui-studio.brd.md:105`, `:106`, `:107` |
| SRC-05 | Unchanged confirmed tests remain runnable during a compile-gateway outage, subject to current access/runtime policy. | `docs/brd/checks-ui-studio.brd.md:109`; `backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java:24` |
| SRC-06 | Browser execution has its own bounded capacity; Studio must preserve ordinary REST/check responsiveness. | `docs/brd/checks-ui-studio.brd.md:111`; `ARCH.md:150` |
| SRC-07 | Accepted execution and results are durable; ambiguous attempts are never automatically replayed. | `docs/brd/checks-ui-studio.brd.md:52`; `docs/architecture/studio-execution.md:158`, `:229` |
| SRC-08 | Secret values remain transient; current secret-use authorization must be checked separately from ordinary execution permission. | `docs/brd/checks-ui-studio.brd.md:114`; `backend/src/main/java/com/citi/put/checks/studio/secrets/StudioSecretUseAuthorization.java:3` |
| SRC-09 | Video and execution outcome remain separate; immutable execution provenance/history and protected evidence remain intact. | `docs/brd/checks-ui-studio.brd.md:112`, `:113`; `docs/architecture/studio-execution.md:243` |
| SRC-10 | Unified UI_TEST catalog/application-component/dashboard/report integration is a separately specified later integration, not an automatic result of Studio-row updates. | `docs/architecture/studio-execution.md:231`; `PRD.md:115`, `:121` |

UC-02 (`PRD.md:144`) describes five-minute scheduling for a critical check generally. It does **not** establish a five-minute minimum, default frequency or service-level objective for Studio browser tests.

## Documentation adequacy

**Enough evidence exists to start planning; not enough exists to start implementation.** The core product and Studio architecture are present, but post-V1 scheduling currently occupies only a high-level paragraph. A focused amendment/specification should fill the scheduling decisions rather than rediscover the complete platform.

Documentation conflicts and historical artifacts must be resolved explicitly:

1. **Authorization drift.** Studio architecture `docs/architecture/studio-execution.md:152` says CSI execute permission. Current `StudioService.java:929` and `:944` instead permit ordinary execution to any authenticated application user; `StudioAcceptanceService.java:220` confirms that secret use is narrower. Run reads/cancellation also have an initiating-principal exception (`StudioService.java:990`, `:1045`). Scheduling must define its own background principal and preserve the chosen actual policy. Do not assume CSI-owner-only execution from the older prose, and do not impersonate the confirming user without a policy decision.
2. **Scheduler technology drift.** `ARCH.md:130` anticipates Quartz when multiple replicas exist. Current scheduler actually uses Spring scheduling with ShedLock (`CronDispatcher.java:140`; `backend/build.gradle.kts:50`; `backend/src/main/java/com/citi/put/checks/config/ShedLockConfig.java:4`). Architect must reconcile this before choosing the integration mechanism. Quartz is neither a demonstrated current dependency nor an established prerequisite for this feature.
3. **Legacy schema is not shipped functionality.** Story 3.11 names a `schedule` create-body field (`docs/stories/3.11.story.md:32`), while current `UITestRequest.java:31` contains no schedule/status edit fields. `ui_tests.schedule` remains JSONB mapped as a Java string (`entity/UITest.java:70`); `TestDto.schedule` remains `string | null` (`frontend/src/types/studio/studioTypes.ts:388`). Architecture explicitly warns against interpreting those fields as operative scheduling (`studio-execution.md:229`, `:277`).
4. **On-demand production acceptance remains distinct from local completeness.** `docs/stories/10.43-ui-studio-production-readiness/spec/spec.md:6` records an external production-acceptance block; `:58` lists real gateway, identity/vault, storage, sandbox/egress and ingress pilot dependencies. The analyst did not rerun or certify these gates. Scheduling can be designed now; its release plan must obtain current evidence and explicitly decide how the existing on-demand trust prerequisite is satisfied.
5. **Lists are part of the present baseline.** `docs/stories/10.46.story.md:5` records Done, and `:40`–`:48` establish server pagination/filtering, deep-linked run details and matching OpenAPI/MSW contracts. Scheduling should extend those list/history surfaces instead of introducing unbounded client-side fetching. That story's accessibility deferral (`:45`) is scoped to that story; it is not an automatic scheduling-wide exclusion.

## Current reusable capabilities and limits

### Platform scheduling

- One schedule is uniquely associated with a check (`Schedule.java:23`); schedule creation loads that check and authorizes writes by CSI (`ScheduleService.java:60`). List visibility also joins the check entity (`ScheduleRepository.java:34`). A saved Studio test cannot be passed as a check ID.
- Existing schedule service normalizes five-field cron to six fields (`ScheduleService.java:190`), parses with Spring `CronExpression`, applies an existing configurable interval check (`:201`) and validates a `ZoneId` (`:230`). These are reusable design/reference behaviors; their Studio policy and preview contract still need decisions.
- `CronDispatcher` polls due work with bounded type/global capacity (`CronDispatcher.java:140`, `:163`) and advances `nextExecutionAt` before submitting to an in-memory executor after commit (`:228`, `:234`). Copying that handoff would not provide Studio's atomic durable acceptance semantics.
- Generic execution failure records `FailedDispatch("CHECK", ...)` (`CronDispatcher.java:304`). Studio dispatch must not inherit that path for ambiguous browser executions.
- The generic cron implementation computes next time from the stored due timestamp (`CronDispatcher.java:340`). Overdue processing can therefore imply catch-up behavior; scheduling downtime/misfires need an explicit Studio decision. The DST comment at `:332` is not verification evidence for the new feature: add timezone/DST contract cases before making a guarantee.

### Studio execution

- `StudioAcceptanceService.accept` locks the draft, checks deletion/quarantine, readiness and references, enforces global/per-CSI pending quotas, then stores a confirmed-revision execution snapshot and dispatch ledger in one transaction (`StudioAcceptanceService.java:164`–`:263`). This is the intended execution reuse seam.
- Readiness validates confirmed ownership/hashes/revisions/runtime pins; it does not equate readiness with `compileStatus === READY` (`ExecutionReadinessService.java:24`, `:44`, `:91`). An optional failed recompile does not revoke an unchanged approval.
- Existing durable idempotency is principal-scoped and protected by the ledger's unique index (`StudioAcceptanceService.java:44`, `:185`, `:279`). Its digest describes a manual request, not a schedule version/time occurrence (`:331`). A scheduled occurrence contract must be added deliberately; random IDs at each scheduler poll do not establish occurrence deduplication.
- The existing disabled-execution behavior rejects new acceptance and settles queued undispatched work while admitted work completes (`docs/architecture/studio-execution.md:186`). Schedule pause/delete and the global kill switch require distinct product descriptions so operators know whether accepted work is affected.
- There is no current schedule administration method in `frontend/src/services/api/studioApi.ts:81`. Existing Studio mock test rows use `schedule: null` (`frontend/src/services/mocks/studio/handlers.ts:348`).

### Existing scheduler UI

`ScheduleDialog.tsx:35` accepts `CheckEntity`, performs checks-specific scheduling reads/writes (`:104`) and refreshes `checksSlice` (`:118`). Its frequency controls can inform the design, but it cannot be reused unchanged for Studio. Its preset preview often adds a relative duration to the current client time (`:127`), even though saved cron rules align to calendar boundaries (`:82`); its timezone is drawn from a check or a fixed fallback (`:110`). A scheduling plan should define one authoritative timezone-aware preview contract and verify UI/API agreement.

## Recommended minimum boundary — pending product confirmation

These are analyst recommendations for PM/architect review, **not additional approved requirements**:

1. Start with one recurring schedule on an individual saved Studio test, using the test's existing immutable CSI and saved environment/configuration. Test suites, dependencies between tests and bulk scheduling introduce an additional orchestration model unsupported by the inspected requirements.
2. Offer cron/frequency and explicit timezone, next-run preview, enable/pause, edit and removal. Reuse existing platform scheduling concepts and validation where appropriate, while using the Studio execution path.
3. Schedule only reviewed and confirmed execution; preserve readiness gates on every due occurrence. Expose why a scheduled occurrence did not run, including the existing required `COMPILE_REQUIRED` outcome.
4. Keep Studio history/run drawer/video as the execution evidence surface, adding schedule origin/occurrence provenance where specified. Track scheduling refusals visibly even when no execution was accepted; the persistence/read contract for this is an architect decision.
5. Exclude implicit compile/confirmation, generic browser replay, scheduler-triggered notifications/remediation, suites and unified catalog/report projections from the first scheduling increment unless the user expands scope.

No recurrence presets, numerical interval limits, polling latency, execution throughput, catch-up limit or estimate is newly mandated here. Existing configuration defaults are evidence about current behavior, not approved sizing for scheduled Studio volume.

## Decisions required before implementation stories are Ready

| Decision | Why it is material | Proposed owner |
|---|---|---|
| Individual tests versus suites; one versus multiple schedules per test | Determines data model, UX and orchestration scope. | User / PM |
| Scheduling execution identity and entitlement lifetime | A background tick lacks the user's active HTTP session; secret use and revocation must remain fail-closed. | Architect with Security / PM |
| Revision selection after edits/reconfirmation | Existing readiness forbids stale confirmed input; choose whether a schedule follows the current confirmed test, pins a revision or requires re-enablement. | PM / architect |
| Overlap behavior, including manual versus scheduled runs | Browser workflows can mutate application state; silently overlapping runs may conflict. | PM / architect |
| Missed-occurrence policy after outage/disable/full quota | Catch-up, skip or coalesce affect target side effects and evidence; avoid an unbounded backlog. | PM / architect |
| Refusal record and meaning of last run | A due unready test must show `COMPILE_REQUIRED`; acceptance currently throws before creating an execution row. Define schedule occurrence versus actual execution history explicitly. | Architect / PM / QA |
| Cron dialect, timezone preview, DST behavior and interval floor | Existing platform handling is useful but not a complete Studio schedule contract. | Architect / UX / QA |
| Link Studio tests into generalized schedules versus introduce a Studio target abstraction | Existing `check_id` constraint and unresolved unified UI_TEST linkage make this a real schema/API choice. Avoid creating dummy catalog checks by assumption. | Architect / data engineer |
| Occurrence identity and atomicity with accepted work | Prevent duplicate browser execution or lost occurrences across polling races/restarts/schedule edits. | Architect / QA |
| Pause/remove/delete semantics after acceptance | Clarify whether only future ticks stop, whether pending work is cancelled, and what audit/history survives. | PM / UX / architect |
| Production release dependency on existing on-demand evidence | BRD requires established on-demand trust; recorded external acceptance block must be assessed with current evidence. | PM / QA / DevOps |

## Follow-on plan inputs

PM should turn SRC-01–SRC-10 and resolved decisions into traceable feature requirements. Architect should specify the schedule target model/API, occurrence transaction/idempotency, background identity/revocation, refusal recording and bounded due-work integration. UX should design schedule controls, timezone previews and truthful pending/paused/not-ready/refused states within the existing Tests and Runs experience. SM/PO should draft and validate a dependency-ordered epic only after those contracts are settled. QA should test cron/timezone boundaries, duplicate polling/replicas, crash before/after acceptance, edit/confirm races, revoked secrets, quotas, overlap/misfires, pause/delete and ordinary-check isolation. These are validation topics for the plan, not evidence that tests have already passed.

This discovery does not decide architecture, estimate delivery, approve a QA gate, create implementation stories, or imply that unimplemented scheduling is operational.
