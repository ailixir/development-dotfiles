# Story STUDIO-SCHED-001 — Schedule confirmed Studio tests

| Field | Value |
|---|---|
| Status | **Done** — local default-off implementation reviewed with CONCERNS; baseline/global validation and production release gates remain open |
| Epic | Scheduled execution of confirmed Studio tests; authorized local implementation of the scheduling build plan |
| Scope | Individual saved tests, one stable schedule anchor per test, paused creation and explicit Resume |
| Baseline | Current dirty working tree; preserve all pre-existing changes and attribute only scheduling changes to this story |
| Source | [Requirements](spec/requirements.json), [implementation contract](spec/implementation-contract.md), [specification](spec/spec.md) and [epic plan](../../specs/studio/scheduling/implementation-plan.md) |
| Depends on | Existing confirmed-revision Studio acceptance/ledger/dispatcher, readiness/reference authorization and paginated Tests/Runs baseline; new schema/admission tracks below precede due producer integration |
| Drafted by | River (@sm), 2026-10-05, from Morgan requirements and Aria design |
| Estimate | No delivery time or cost estimate established |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["requirements-schema", "OpenAPI-contract-parity", "PostgreSQL-Testcontainers", "Vitest-MSW", "Playwright-critical-path", "type-check", "lint", "gradle-check", "CodeRabbit-or-documented-manual-fallback"]

This is the associated local delivery story requested for the spec pipeline. Its tracks preserve one story binding for coordinated implementation; they are not separate unapproved shadow stories. Production activation is explicitly excluded from local Done criteria. No code should start before the independent specification gate and PO readiness validation.

## Story

**As a** Studio author or operator,
**I want** recurring execution of a saved, confirmed browser test with explicit activation and honest schedule/run history,
**so that** I can monitor the application unattended without silently changing reviewed instructions, duplicating browser effects or losing the reason a scheduled slot did not run.

## Context and adopted local defaults

Generic check scheduling requires a catalog check ID and invokes an execution/retry path unsuitable for Studio browser effects. Legacy `ui_tests.schedule` is inert metadata. Studio already has immutable confirmation/readiness, durable acceptance and browser dispatch/recovery; scheduling must produce work through those seams.

Local engineering defaults: one stable per-test schedule; Paused create; exact current confirmed revision acknowledgment on Resume; changing cron/timezone/principal also leaves Paused; affecting authoring/configuration changes block enabled intent until explicit Resume; no implicit save/compile/confirm. Zero seconds, minute cron, five-field normalization, fixed 60-second minimum, explicit region timezone/UTC fallback, five preview slots. Configurable grace defaults 300 seconds; bounded pre-acceptance backoff 5–30 seconds; no historical browser catch-up. DST gaps skip, fallback chooses earlier offset once per local slot across schedule versions/removal/recreation. Existing manual permissions remain unchanged.

Scheduling defaults off. Local/test authorization permits only explicitly enabled per-CSI/environment principal allowlists; default and unwired production authorization deny. These defaults authorize implementing and testing local behavior; they do not approve live grants or production scheduling.

## Acceptance Criteria — local implementation

The AC labels retain [requirements.json](spec/requirements.json) correspondence; several criteria summarize multiple related scenarios rather than changing their scope.

1. **AC-01 / FR-01, FR-02, FR-12:** CSI-authorized readers/writers can inspect capabilities and create/read/edit/pause/resume/remove one typed schedule for a saved Studio test by API/terminal and UI, without catalog check creation or activation of legacy JSON. Create returns Paused; removed/recreated schedules reuse a stable dedup anchor and monotonic version.
2. **AC-02 / FR-02, FR-05, FR-16:** optimistic schedule version conflicts are deterministic. Resume requires the exact current ready confirmed revision and exact unacknowledged uncertainty set. Scope-authorized capability reads expose only approved CSI/environment principal references. Scheduling disabled exposes truthfully inspectable read state and returns `503/SCHEDULING_DISABLED` for unavailable mutations; no producer work occurs. Every successful Resume records immutable server-derived actor/time activation even for an empty uncertainty set.
3. **AC-03 / FR-03, FR-15:** server validation/preview and due producer share one injected-clock resolver: canonical six-field zero-second cron, minimum 60 seconds, valid timezone, five UTC/local/offset preview slots, earlier offset once during fallback, skipped gap. Invalid cron/timezone/nonzero seconds and invalid pagination are rejected with stable codes. Preview is due time, not guaranteed browser start.
4. **AC-04 / FR-04, FR-07:** due readiness, runtime/reference/lifecycle/authorization refusal commits the specific visible occurrence reason, including `COMPILE_REQUIRED`, without automatic compile/confirmation, synthetic execution or video. Refusal must not be lost through a rollback-only transactional exception.
5. **AC-05 / FR-05, FR-16:** saved execution-affecting updates and new confirmation invalidate effective active scheduling atomically under the test lock, preserving author enabled/paused intent and exact accepted snapshots. Metadata-only edits and failed optional recompile of unchanged confirmed inputs do not falsely block. Confirmation alone never resumes.
6. **AC-06 / FR-06:** two replicas or injected crash at every persistence boundary yield one accepted execution/ledger link or a complete rollback. Occurrence decision, accepted history/ledger and nominal/eligible cursor changes commit together. Scheduled identity is a DB-enforced nullable unique occurrence FK; manual arbitrary keys/digests cannot alias it.
7. **AC-07 / FR-06, FR-08, FR-15:** version-independent stable local-slot uniqueness prevents duplicate fallback effects across update/activation/removal/recreation. Long downtime is handled with bounded missed-range summaries and latest eligible slot within grace; no unbounded enumeration or historical browser replay.
8. **AC-08 / FR-07, FR-08:** capacity or temporary pre-acceptance outage defers the same nominal occurrence with unchanged due cursor and fixed grace, updating only eligible poll time. After expiry it settles visibly and advances future recurrence. Pause/update/remove or affecting input/revision/lifecycle changes atomically settle the deferred slot with specific SKIPPED/REFUSED reason, retain audit, and never leave an orphan deferred identity or revive it on Resume. Accepted work belongs solely to existing ledger dispatch/recovery. Capability-off reads show disabled/expired truthfully; reenable settles expired old identity as GRACE_EXPIRED without send before future-only advancement, or accepts the same still-within-grace identity once. Bounded CSI-rotating selection lets another eligible CSI proceed when one is saturated.
9. **AC-09 / FR-09:** acceptance races serialize with pause/remove/test deletion; pause/remove retain accepted work/audit, while existing deleted/quarantined pre-send denial and global disable behavior remain. Explicit run cancel is separate. Producer disable does not disable accepted scheduled work's live authorization/recovery checks.
10. **AC-10 / FR-07, FR-10:** paginated occurrence reads use `{data,page,size,totalElements,totalPages}`, including retained removed-anchor history. Real runs/details expose optional immutable scheduled provenance and actual revision; due/acceptance/start are distinct, legacy source is Unknown, history/evidence expiry is honest and refusal has no fake duration/video. Every successful Resume, including a clean empty uncertainty set, creates an immutable human activation actor/time event; occurrence linkage preserves version/principal/environment/revision and the old actor after later update/Resume/recreation. Run GET/list/SSE/withTestName preserve activationId/activatedBy/activatedAt from that event; manual/legacy activation metadata remains null.
11. **AC-11 / FR-11:** activation/acceptance/pre-send use live background authorization plus existing separate secret preflight. Denial/missing wiring never permits send; temporary lookup outage cannot become permission. Local allowlist revocation between acceptance and send is tested. No login JWT or resolved secret is retained. Manual dispatch eligibility remains compatible.
12. **AC-12 / FR-12, FR-16:** centralized typed Studio API/MSW mocks precede frontend controls. Tests menu/editor surface accessible schedule state, timezone preview, explicit Resume and actual occurrence history. Dirty authoring does not silently save/compile/confirm; network/version/readiness errors retain input and explain recovery. Keyboard/focus/status and responsive behavior are covered. Create Active, if offered, uses explicitly acknowledged paused-create then validated Resume and honestly retains Paused when activation fails.
13. **AC-13 / FR-13:** non-`DONE` manual/scheduled/finalizing/ambiguous ledger work for the test causes scheduled overlap skip under test locking, with a nonlocking ledger `EXISTS` query; no callback lock inversion or implicit manual-run serialization.
14. **AC-14 / FR-14:** terminal `DISPATCH_UNKNOWN`/`START_TIMEOUT`/`STALE` relevant to the test durably blocks future recurrence until investigation plus audited explicit acknowledgment/Resume. A prior accepted execution becoming uncertain later remains unacknowledged. Only future slots may run; ambiguous browser work is never automatically replayed.

## Production release gates — separate from local AC

- Approved real PUT Core principal/delegation and live grant/secret entitlement/revocation adapter, including owner departure/expiry, accepted by Security/platform owners.
- Current real on-demand gateway, identity/vault, storage, sandbox/egress and ingress pilot evidence from existing Studio production-readiness scope. No per-test prior-PASS gate is added.
- Capacity/frequency/grace/batch/retention configuration accepted from representative operational load; explicit restore reconciliation prevents re-execution after restoring an older database cursor.
- Independent Quinn release evidence, Gage rollout/rollback runbook and bounded pilot CSI/environment. Local/MSW tests never close these external gates.

## Tasks / Subtasks

### A — Schema, recurrence and API foundation

- [x] A.1 Add forward-only V26 after verifying V25 baseline; typed schedule/activation/occurrence/uncertainty-ack tables, ownership/state/identity constraints, due indexes and ledger linkage/terminal uncertainty summary. Retain stable anchors indefinitely; history locator stays soft. Add deferred ACCEPTED-to-ledger consistency trigger, no circular execution fields. Owned immutable activation events link all occurrences and acknowledgment audit, preserve prior human attribution on clean Resume/update/recreation, and enforce matching accepted snapshot ownership. (AC: 1, 6, 7, 10, 14)
- [x] A.2 Implement shared injected-clock resolver: minute syntax/60-second minimum, UTC/IANA validation, five preview slots, once-per-local fallback and bounded grace-window backlog summary. (AC: 3, 7)
- [x] A.3 Implement versioned controller/service/repository with capabilities, paused create, update pause, explicit activation/uncertainty set and immutable server-derived actor/time activation event for every Resume, independent pause/remove and paginated occurrence envelope. Controllers on `!worker`; default-off properties. (AC: 1, 2, 3, 9, 10)
- [x] A.4 Verify schema upgrade/fresh constraints and API/terminal happy/conflict/denial/disabled paths before integrated UI delivery. (AC: 1, 2, 6)

### B — Background authorization and acceptance integration

- [x] B.1 Add fail-closed background interface/default/local per-CSI/environment provider and scheduled dispatch authorization decorator; preserve manual provisional behavior and separate secret-use policy. (AC: 2, 11)
- [x] B.2 Extract shared acceptance core returning typed expected outcomes without nested throwing transactional proxy; preserve manual request digest/race behavior. Scheduled rows use typed occurrence identity and DB FK separation; enrich immutable execution DTOs. (AC: 4, 6, 10)
- [x] B.3 Persist terminal code/time in durable ledger atomically through existing close statements and retained-history backfill; add exact uncertainty acknowledgments and no new schedule/test callback locks. (AC: 14)
- [x] B.4 Wire true-input invalidation through `StudioService` update/v2 authoring/both delete paths and `CompileStateService.confirm`; preserve optional unchanged recompile and metadata compatibility. (AC: 5, 9)

### C — Due producer and resilience

- [x] C.1 Implement one candidate/test transaction with test → schedule → occurrence → global quota → CSI quota locks; current lifecycle/JPA refresh and nonlocking ledger overlap/uncertainty queries. (AC: 4, 6, 13, 14)
- [x] C.2 Worker/local default-off poller: bounded CSI rotation/batch/time budget, independent eligible cursor, same-occurrence deferral/backoff/grace, atomic lifecycle-interruption settlement, capability-off truthful expiry and old-identity-first no-send settlement on reenable, bounded misfire audit and atomic acceptance/advancement. Send only through existing ledger dispatcher. (AC: 6, 7, 8, 9)
- [x] C.3 Test two workers, rollback boundaries, save/confirm/pause/delete races, callbacks, saturated CSI, defer expiry/interruption races across pause/update/remove/invalidation/Resume, capability-off/reenable expiry and no catch-up, immutable clean activation provenance across actors/recreation and GET/list/SSE projection, overlap and uncertainty closure; no generic retries. (AC: 4–9, 11, 13, 14)

### D — Frontend mock-first management and evidence

- [x] D.1 Add typed API/domain adapters and fixed-clock MSW schedule/capability/occurrence scenarios matching frozen OpenAPI, preserving legacy strings and optional run source compatibility. (AC: 1, 2, 3, 10, 12)
- [x] D.2 Saved-test Schedule/Manage schedule editor and Tests row action/dialog/summary; explicit principal/timezone/current revision; paused/blocked/ready to resume; conflicts/errors/dirty draft and uncertainty investigation acknowledgment. (AC: 2, 3, 5, 12, 14)
- [x] D.3 Paginated occurrence/history and actual run links; Runs/list/drawer trigger/source/time metadata; unknown legacy attribution and honest expired evidence. (AC: 10)
- [x] D.4 Meaningful MSW component/integration/accessibility tests and Playwright critical-path coverage; no frontend worker or fake production acceptance. (AC: 1, 3, 5, 9, 10, 12)

### E — Contract, documentation and independent gates

- [x] E.1 Root updates Studio OpenAPI and operational runbook to exact contract, configuration/default-off behavior and release/restore obligations. (AC: all)
- [x] E.2 Required frontend/backend gates, schema/OpenAPI/MSW parity and targeted meaningful regression tests; report unrelated baseline failures separately. Record CodeRabbit result or configured documented manual fallback. (AC: all)
- [ ] E.3 Quinn independent implementation quality verdict; record remaining external release gates without misclassifying local feature completeness. Gage handles authorized remote/release actions. (AC: all)
- [ ] E.4 Maintain tasks, completion evidence and actual File List; PO closes lifecycle only after appropriate independent evidence. (AC: all)

## Dev Notes

**Source authority:** [implementation contract API wire section](spec/implementation-contract.md#api-wire-contract) owns exact names, paths, codes and envelopes. [Storage decisions](spec/implementation-contract.md#storage-decisions-closing-e-02) and [admission/invalidation boundaries](spec/implementation-contract.md#admission-invalidation-and-background-authorization-boundaries) own transaction details. [Requirements](spec/requirements.json) owns FR/NFR/constraint traces; [specification](spec/spec.md) consolidates verified research. Earlier planning documents remain evidence, not overriding wire alternatives.

All public routes prepend `/api/v1`: test-scoped `/studio/tests/{id}/schedule`, `/schedule/capabilities`, `/schedule/enabled`, `/schedule/occurrences`; read-only `/studio/schedules/preview`. Create payload `{cronExpression,timeZone,executionPrincipal}`, update adds `expectedVersion`, Resume adds `enabled:true,confirmedRevisionId,acknowledgedUncertaintyExecutionIds`; delete uses `?expectedVersion=N`. No global principal enumeration. Occurrence page size 1..100, page nonnegative, descending due/UUID tie-breaker. Full DTOs and stable validation codes are in the exact wire contract.

Storage uses JDBC-backed Studio schedules, immutable activation events and occurrence records, separate from generic `schedules.check_id`. Ledger UNIQUE nullable `scheduled_occurrence_id` owns accepted link; scheduled manual key/digest null. History source fields are nullable/additive; no FK into partitioned history. Constraint triggers require exactly one matching ledger for ACCEPTED and none for refused/skipped/deferred decisions at commit. Retain schedule/activation/occurrence/ledger/ack identity independently of existing history/video pruning.

Candidate discovery is advisory. Test-first `SKIP LOCKED` transaction re-reads lifecycle/current state and processes one candidate, then schedule/occurrence/global/CSI locks. Do not lock existing ledger overlap rows under test or synchronously cancel existing runs there. `next_due_at` remains nominal during defer; only `poll_after_at` changes until accepted/refused/skipped. Version increments on mutation/invalidation, not every tick. Producer off does not exempt accepted scheduled dispatch from live grants.

**Ownership for parallel implementation:** backend owner handles `backend/src/**` and tests; frontend owner handles `frontend/src/**` and frontend tests; root handles OpenAPI/runbook; spec/story owner handles this folder. Backend acceptance/schema/identity foundations precede producer integration. Frontend types/MSW can proceed from frozen contract alongside backend; integrated UI operation follows functional API/terminal behavior. Do not alter disjoint pre-existing changes or claim all dirty files in this story.

**Configuration and source fallback:** `.aiox-core/core-config.yaml` is present but historical generic framework paths/monolithic PRD locations are not the feature source. Use current repository AGENTS guidance, actual dependency manifests, existing Studio architecture and this explicit requested feature ID/path. This is local extraction/adaptation, not a completed ClickUp or interactive story-template workflow. No framework/core configuration is changed.

Every successful Resume persists immutable `studio_schedule_activations` actor/time, version, revision, environment/principal; schedule points to latest activation and occurrences link their exact historical event. Pause/update/remove settle DEFERRED as SKIPPED/SCHEDULE_PAUSED, SCHEDULE_UPDATED or SCHEDULE_REMOVED; affecting test/revision/deletion/quarantine use REFUSED specific existing codes. Test/schedule/occurrence locking atomically clears retry eligibility, preserves nominal/grace/provenance and updates state; no orphan delay or old-slot resurrection. Capability-off preserves the original deferred identity/grace for inspectable suspended/expired state; reenable settles expired GRACE_EXPIRED without send before moving future-only, or accepts same still-within-grace identity once. Feature-off authoring invalidation still settles outstanding deferral. [Source: spec/implementation-contract.md#storage-decisions-closing-e-02 and #admission-invalidation-and-background-authorization-boundaries; critique-1 CRIT-1/CRIT-2]

### Testing

- Backend unit tests cover injected-clock cron/timezone/DST and bounded missed-range policy. PostgreSQL/Testcontainers integration proves migration ownership/uniqueness/deferred linkage integrity, atomic acceptance/crash and concurrency races; mocks alone are insufficient.
- Retain targeted existing acceptance/idempotency/readiness, dispatcher/recovery/cancel, revision retention and ordinary-check scheduler regressions when their seams change. Validate background allowlist revocation and separate secret authorization without invented permissive grants.
- Frontend Vitest/Testing Library/MSW covers meaningful operator flows and API parity; Playwright covers management-to-real-history surface, pause/resume and critical errors. Focus/keyboard/error announcements use existing MUI conventions.
- From `frontend/`: `npm run type-check`, `npm run lint`, `npm run test -- --run`, relevant `npm run test:e2e`, `npm run build`, standalone build when affected. From `backend/`: `./gradlew test`, `./gradlew check`. Record actual executed scope/results; baseline failures remain separate.

### Rollback and recovery

Disable scheduling/due producer first; keep inspected reads, durable audit and accepted execution recovery/cancel operable. Pause/remove are future-only; global kill switch has existing queued/admitted behavior. Retain additive schema and forward-fix deployed defects. No legacy import/activation or catch-up on Resume. A restore older than executed cursor requires operator reconciliation before enabling scheduling; software cannot infer erased browser effects. Real production enablement remains separately gated.

## CodeRabbit Integration

### Story Type Analysis

Primary type: fullstack feature. Complexity: COMPLEX, as assessed in `spec/complexity.json`. Secondary types: database, API, security, scheduling, frontend and recovery integration.

### Specialized Agent Assignment

Primary implementation Dex; independent quality Quinn; supporting Aria/Dara on lock/schema, Uma on interactions, Gage on remote/release. Executor and verdict owner differ. Project constitution's QA authority governs the older generic task mapping; no executor self-approval is permitted.

### Self-Healing Configuration

**Configuration:** enabled in `.aiox-core/core-config.yaml`, WSL installation mode with graceful degradation if CLI is unavailable. This story does not claim CodeRabbit was run or installed. Apply the declared review skill during implementation QA; if runtime/tool availability prevents it, record exact configured fallback and independent manual review.

Expected configured QA self-healing: full mode, up to three iterations/30 minutes, critical/high findings fixed and re-reviewed; medium debt documented, low ignored per configuration. A review loop does not self-approve lifecycle.

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): configured CodeRabbit review or exact documented graceful-degradation/manual fallback before local completion review.
- [ ] Independent review (@qa): implementation evidence and critical/high remediation; verdict remains separate from executor.
- [ ] Pre-PR (@devops, only if a PR is later authorized): compatibility/security review; no PR creation is implied here.
- [ ] Pre-Deployment (@devops, only for later separately approved production release): real authorization/configuration/rollback gates, excluded from local Done criteria.

### Focus Areas

**Focus:** stable occurrence/local-slot dedup, deferred accepted-link consistency, no lock inversion, no rollback-only refusal loss, unchanged manual digest/permissions, live background/secret fail-closed checks, immutable audit and partition retention, cron/DST parity, mock/API parity and accessible truthfulness.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-05 | 0.1.0 | Draft associated local story from requirements and concrete contract. | River (@sm) |
| 2026-10-05 | 0.1.1 | PO NO-GO pending final spec and independent critique; mechanical readiness corrections. | Pax (@po) |
| 2026-10-05 | 0.1.2 | Required spec revision: immutable activation audit, deferred lifecycle settlement and fixed cadence. | Morgan (@pm) / River (@sm) |
| 2026-10-05 | 0.1.3 | PO GO (9/10) against final spec and APPROVED critique; Draft → Ready. Production gates remain open. | Pax (@po) |
| 2026-10-05 | 0.2.0 | Local implementation and QA fixes; InProgress → InReview. Scoped tests pass; baseline failures and production gates recorded separately. | Dex / Dara / Orion |
| 2026-10-05 | 0.2.1 | QA Gate CONCERNS — Status: InReview → Done. Local default-off delivery complete; baseline failures, full global checks and external production evidence remain explicit. | @qa |

## Dev Agent Record

### Agent Model Used

Native Codex specialist threads using the inherited session model; no model override.

### Debug Log References

See implementation/validation.json, implementation/browser-smoke.json and implementation/qa-runner-contract.json. Temporary execution logs are referenced in validation evidence.

### Completion Notes

Local scheduling implemented through the approved spec pipeline. Independent QA corrections cover immutable activation audit, deferred lifecycle settlement, CSI fairness, late authorization/grace, and uncertainty recovery. Production producer/grants remain disabled by default. Known pre-existing frontend failures are recorded separately; no production integration or whole-repository green claim.

### File List

Actual feature files and modified integration seams are listed below. Several modified paths were already uncommitted at the task baseline; only scheduling contributions are attributed here. Other pre-existing changes are excluded. The associated story, spec artifacts and implementation evidence are also maintained under `docs/stories/STUDIO-SCHED-001/`.

- `backend/src/main/java/com/citi/put/checks/studio/scheduling/ConfiguredBackgroundAuthorization.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioBackgroundAuthorization.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioCronResolver.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleController.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleDtos.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleException.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleInvalidation.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioSchedulePoller.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleRepository.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleService.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduledDispatchAuthorization.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioSchedulingHealthIndicator.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioSchedulingProperties.java`
- `backend/src/test/java/com/citi/put/checks/studio/scheduling/StudioCronResolverTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/scheduling/StudioScheduleApiIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/scheduling/StudioSchedulingIsolationTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/scheduling/StudioSchedulingSchemaIT.java`
- `backend/src/main/resources/db/migration/V26__studio_scheduling.sql`
- `backend/src/main/java/com/citi/put/checks/studio/StudioService.java`
- `backend/src/main/java/com/citi/put/checks/studio/compile/CompileStateService.java`
- `backend/src/main/java/com/citi/put/checks/studio/ExecutionSnapshotMapper.java`
- `backend/src/main/java/com/citi/put/checks/studio/dto/ExecutionSnapshotDto.java`
- `backend/src/main/java/com/citi/put/checks/studio/entity/UITestExecution.java`
- `backend/src/main/java/com/citi/put/checks/studio/entity/StudioDispatchLedger.java`
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioAcceptanceService.java`
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatchLedgerStatements.java`
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/ProvisionalDispatchAuthorization.java`
- `frontend/src/types/studio/studioScheduling.ts`
- `frontend/src/services/api/studioSchedulesApi.ts`
- `frontend/src/services/api/studioSchedulesApi.test.ts`
- `frontend/src/services/mocks/studio/schedulePreview.ts`
- `frontend/src/services/mocks/studio/schedulingHandlers.ts`
- `frontend/src/components/studio/scheduling/StudioScheduleDialog.test.tsx`
- `frontend/src/components/studio/scheduling/StudioScheduleDialog.tsx`
- `frontend/src/components/studio/scheduling/StudioScheduleSummary.tsx`
- `frontend/src/components/studio/scheduling/schedulePresentation.ts`
- `frontend/src/components/studio/scheduling/scheduleProvenance.test.tsx`
- `frontend/src/services/mocks/studio/handlers.ts`
- `frontend/src/components/studio/tests/TestRow.tsx`
- `frontend/src/components/studio/tests/TestRowMenu.tsx`
- `frontend/src/components/studio/tests/DeleteTestDialog.tsx`
- `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`
- `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`
- `frontend/src/types/studio/studioTypes.ts`
- `frontend/src/components/studio/runs/RunRow.tsx`
- `frontend/src/components/studio/runs/RunDetailsDrawer.tsx`
- `docs/specs/studio/openapi.yaml`
- `docs/specs/studio/scheduling/README.md`
- `docs/specs/studio/scheduling/operations.md`
- `docs/architecture/ADR-003-studio-test-scheduling.md`
- `docs/architecture/ADR-002-internal-contract-surface.md`
- `docs/architecture/studio-execution.md`
- `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java`
- `studio-runner/test/run/confinement.test.ts`
- `.aiox/studio-scheduling-spec-state.json`

## QA Results

### Review Date: 2026-10-05

### Reviewed By: Quinn (Test Architect)

Reviewed Revision: `working-tree-source-sha256:2d38f01546eb1551cf8d33ee198b8f71089b46d8ea521bea3e446e8bb3207756` (53 source/contract inputs, including the reviewed final architect wiring amendment; InReview story digest 1d8d48f8adc5d2ae2252031c4f12f855b3355bb57e14abd700ae54419518053c was captured separately before the QA-owned lifecycle transition).

Independent local implementation review: no unresolved high-severity scheduling finding. The high CSI fairness defect and medium uncertainty/UI/mock/validation/contract issues found during review were corrected by the implementation owners and verified by targeted tests. QA made only the specifically authorized contract-test status/marker and reviewed runner-hash changes; application fixes remain independently authored.

Evidence: final real PostgreSQL/unit/contract backend run 63/63 with zero skips; additional manual acceptance 11, dispatcher 26, recovery 25 and generic dispatch 8 passed in separate batches. Latest focused frontend 119/119, including 22 new focused tests; type check, lint (0 errors, 303 pre-existing warnings), Webpack/Vite builds and fixture Chromium flow passed. QA-executed scoped runner contract/confinement 35/35 passed without global coverage. Backend Spotless Java, Checkstyle main/test and SpotBugs main passed; SpotBugs test is disabled by existing build configuration.

The whole frontend run was 913/917 with the same four pre-existing inference/accessibility failures and preceded the last focused corrections. Unfiltered backend test/check/Jacoco and full runner coverage were not run. CodeRabbit was unavailable; configured graceful degradation and independent manual review apply. No whole-repository green, real scheduled-browser pilot or production authorization claim is made.

Detailed review and evidence: [qa-review.md](implementation/qa-review.md), [validation.json](implementation/validation.json), [backend-verification.json](implementation/backend-verification.json), [qa-runner-contract.json](implementation/qa-runner-contract.json) and [browser-smoke.json](implementation/browser-smoke.json).

### Gate Status

Gate: CONCERNS → docs/qa/gates/STUDIO-SCHED-001-studio-test-scheduling.yml

Local lifecycle: InReview → Done. Scheduling remains default off. Baseline/global validation, real platform principal/secret policy, on-demand trust, capacity/pilot and retention/restore/compatible rollout must close before merge/release or production enablement; this gate does not approve those actions.
