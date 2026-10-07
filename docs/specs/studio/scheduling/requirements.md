# Studio test scheduling — scoped requirements draft

Date: 2026-10-05. Owner: Morgan (PM), coordinated by Orion. Status: **Draft planning input; not an approved PRD, specification, or Ready story.**

This document uses the declared brownfield PRD template's analysis, requirements, compatibility, UX, integration and epic topics. It does not claim completion of the template's interactive elicitation workflow. The user requested analysis and a build plan; stakeholder answers and production integration evidence remain outstanding. The source baseline includes existing uncommitted application work. This planning exercise neither certifies that baseline nor changes application code.

## Problem and outcome

Operators can author, compile, review, confirm and execute saved Studio browser tests, then inspect durable results and video. They cannot presently attach an operational recurring schedule to those saved tests. Existing generic scheduling targets catalog checks; Studio test IDs are separate, and the legacy Studio `schedule` field does not implement dispatch.

The proposed enhancement lets operators schedule previously proven, confirmed Studio tests and inspect both accepted executions and explicit reasons a due occurrence did not execute. It must preserve reviewed execution inputs, current authorization, bounded browser capacity and the existing durable acceptance ledger. A schedule cannot turn an unconfirmed draft into unattended application changes.

Desired outcomes are observable through successful schedule administration, deterministic previews, durable due-occurrence dispositions, scheduled execution provenance and evidence, and ordinary-check responsiveness under browser load. Frequency, throughput and dispatch-latency targets require sizing; no numerical SLA or delivery estimate is established here.

## Evidence and traceability

[Discovery](discovery.md) contains the current-code analysis and exact source references. [Architecture](architecture.md) specifies the proposed integration and transactional seams; [UX](ux.md) specifies proposed interactions. All architecture and UX choices in this planning package remain recommendations until their gates are resolved.

| Trace | Existing requirement or constraint | Source |
|---|---|---|
| SRC-01 | Scheduling follows proven on-demand execution of a confirmed test. | `docs/brd/checks-ui-studio.brd.md:116`; `PRD.md:78` |
| SRC-02 | Extend due-work selection and administration through Studio acceptance/readiness/authorization/quotas and ledger. | `docs/architecture/studio-execution.md:229` |
| SRC-03 | No implicit compile; unready scheduled work explicitly records `COMPILE_REQUIRED`. | `docs/architecture/studio-execution.md:229` |
| SRC-04 | Preserve exact confirmed source/configuration; affecting edits require confirmation. | `docs/brd/checks-ui-studio.brd.md:105–107` |
| SRC-05 | Unchanged confirmed tests can execute during compile-gateway outage, subject to access/runtime policy. | `docs/brd/checks-ui-studio.brd.md:109`; `ExecutionReadinessService.java` |
| SRC-06 | Browser execution has bounded capacity and must preserve ordinary API/check responsiveness. | `docs/brd/checks-ui-studio.brd.md:111`; `ARCH.md:150` |
| SRC-07 | Accepted execution/results are durable; ambiguous browser attempts never replay automatically. | `docs/brd/checks-ui-studio.brd.md:52`; `docs/architecture/studio-execution.md:158,229` |
| SRC-08 | Secrets stay transient and require current, separate secret-use authorization. | `docs/brd/checks-ui-studio.brd.md:114`; `StudioSecretUseAuthorization.java` |
| SRC-09 | Immutable execution provenance and protected evidence persist; video availability is separate from execution outcome. | `docs/brd/checks-ui-studio.brd.md:112–113`; `docs/architecture/studio-execution.md:243` |
| SRC-10 | Unified catalog/dashboard/report integration is a separate later integration. | `docs/architecture/studio-execution.md:231`; `PRD.md:115,121` |
| CON-01 | Studio schedules cannot masquerade as `check_id` schedules or treat legacy JSON as operative scheduling. | `Schedule.java`; `UITest.java`; discovery |
| CON-02 | Current implementation uses Spring cron and ShedLock, despite older Quartz prose. | `CronDispatcher.java`; `backend/build.gradle.kts`; discovery |
| CON-03 | Current manual execution permits application-authenticated users; secret permission is narrower. Background execution needs an explicit policy. | `StudioService.java`; `StudioAcceptanceService.java`; discovery |
| CON-04 | Mock-first frontend, centralized API client, typed contracts and paginated Studio lists must remain. | repository AGENTS guidance; `frontend/package.json`; `docs/stories/10.46.story.md` |
| CON-05 | Existing on-demand production acceptance evidence remains a release dependency. | `docs/stories/10.43-ui-studio-production-readiness/spec/spec.md` |

Path abbreviations in this table identify existing classes found in discovery, not new files. SRC labels are planning trace labels, not newly approved product requirements.

## Proposed first increment

**Assumption pending user confirmation:** one recurring schedule per individual saved Studio test, tied to its immutable CSI and saved environment/configuration. New schedule operations are create, inspect, edit, pause, explicitly resume, remove and preview. Schedule occurrences appear alongside links to actual Studio runs, including visible refusals when no run was accepted.

Deferred scope: suites, dependency graphs, bulk scheduling, multiple schedules per test, environment matrices, implicit compile/confirmation, automatic browser retries, notifications/remediation and unified catalog/dashboard/report projections. These exclusions narrow this proposal; they do not remove capabilities promised in other epics.

## Functional requirements

Rows marked **Existing** restate established requirements. Rows marked **Proposed** describe the recommended contract to validate before implementation. Compound requirements explicitly identify inherited behavior and the additional proposal.

| ID | Requirement | Basis / status |
|---|---|---|
| FR-01 | Schedule a saved, confirmed Studio test without creating a dummy catalog check. Proposed MVP permits one schedule per test. | SRC-01, CON-01; cardinality **Proposed** |
| FR-02 | Create/read/edit/pause/resume/remove through a typed Studio API and centralized frontend client. Authorize administration against the test's CSI write permission; preserve revision/version conflict detection. | SRC-02, CON-03, CON-04; exact operations and manage permission **Proposed** |
| FR-03 | Store normalized Spring cron and an explicit valid IANA timezone; use one server recurrence calculation for preview and actual dispatch. UI shows timezone and absolute next occurrences, with offsets when ambiguous. | CON-02; **Proposed** |
| FR-04 | Before accepting any due occurrence, run Studio readiness, deletion/quarantine, current execution/secret permissions and pending-quota checks. Never compile or confirm from the scheduler. | SRC-02, SRC-03, SRC-08; **Existing** |
| FR-05 | Read the current confirmed executable inputs under acceptance locking. Affecting test changes suspend future schedule acceptance until explicit Resume after confirmation. Preserve already accepted immutable snapshots. | SRC-04; suspension/resume policy **Proposed** |
| FR-06 | Give each due occurrence stable identity, durable disposition and optional accepted execution ID; deduplicate concurrent polling/restarts/replicas and repeated local slots across schedule versions/removal-recreation. Persist schedule advancement, occurrence result and accepted Studio ledger work atomically. Preserve nominal identity during deferral; eligible-poll time is separate. | SRC-02, SRC-07; occurrence contract and architect/data-engineer invariants **Proposed** |
| FR-07 | Refusals are visible even when no execution exists; unready work explicitly records `COMPILE_REQUIRED`. Separately show readiness, permission denial, capacity refusal, overlap, misfire and lifecycle outcomes using a documented taxonomy. | SRC-03, SRC-09; broader taxonomy **Proposed** |
| FR-08 | Do not automatically replay ambiguous or terminal browser attempts. Proposed missed-slot policy skips historical catch-up, allowing at most the latest eligible slot within a bounded grace. Pre-acceptance capacity/outage may defer that same occurrence until grace expiry. Proposed overlap policy skips a scheduled occurrence while any ledger row for the same test is non-`DONE`, including manual and ambiguous attempts. | SRC-07; overlap/misfire/defer policies **Proposed** |
| FR-09 | Pause/removal/test deletion prevent future acceptance, preserving occurrence and run audit. Schedule pause/removal does not cancel accepted work. Test deletion/quarantine retains existing pre-send lifecycle rejection, so accepted but undispatched work can be refused; already admitted work follows existing recovery/cancel. Global execution disable remains independently effective. | SRC-07, SRC-09; pause/removal boundary **Proposed**, test lifecycle retains current dispatch policy |
| FR-10 | Add scheduled origin and occurrence provenance to existing paginated Runs and run details. Link accepted occurrences to their run and protected video; refused occurrences do not invent a failed run or video. | SRC-09, CON-04; scheduling projections **Proposed** |
| FR-11 | Background execution uses an explicitly approved principal/delegation model, checks current entitlements at due acceptance and secret materialization, and fails closed when these cannot be verified. Store principal/reference metadata, never user sessions or secret values. | SRC-08, CON-03; concrete principal model **Open integration gate** |
| FR-12 | Expose safe administration, health and due-occurrence outcomes for operations without requiring the frontend. Provide terminal-runnable API examples and functional integration tests. | CON-04; AIOX CLI-first constraint; **Proposed delivery contract** |

## Nonfunctional and compatibility requirements

| ID | Requirement | Basis / status |
|---|---|---|
| NFR-01 | Studio scheduled work respects global/per-CSI pending quotas and exclusive runner admission; bounded polling must not monopolize ordinary-check capacity. Validate with representative load before release. | SRC-02, SRC-06; **Existing**, load envelope unresolved |
| NFR-02 | Two replicas and crash/restart cannot create a duplicate accepted execution for one occurrence. Recovery uses durable occurrence/ledger state, without reissuing ambiguous browser attempts. | SRC-07; **Proposed atomicity acceptance contract** |
| NFR-03 | Preview and dispatcher use deterministic injected time and the same timezone policy. Validate Spring runtime behavior around DST rather than rely on comments. | CON-02; **Proposed** |
| NFR-04 | Diagnostics, schedule metadata and logs contain secret references only. Existing evidence authorization, source immutability and retention restrictions remain in force. | SRC-04, SRC-08, SRC-09; **Existing** |
| NFR-05 | Schedule/occurrence endpoints stay bounded and paginated; list APIs do not perform client-side unbounded enumeration. Schedule controls are keyboard operable and expose meaningful state and errors to assistive technology. | CON-04; scheduling accessibility detail **Proposed** |
| CR-01 | Manual execution/readiness/confirmation/cancellation behavior and existing check scheduling stay compatible; new background authorization must not silently narrow current manual policy. | SRC-02, CON-03; **Existing constraint** |
| CR-02 | Add typed Studio scheduling storage/API without overwriting legacy `ui_tests.schedule` or retroactively activating it. Preserve existing test/run response compatibility when adding optional metadata. | CON-01, CON-04; **Proposed migration contract** |
| CR-03 | Extend Tests/authoring and existing Runs/drawer UX using current project MUI and routing patterns. Use dependency manifests as the version baseline; repository prose is not evidence of installed MUI7/router7. | CON-04; **Existing constraint** |
| CR-04 | Continue mock-first frontend flows with representative MSW scheduling fixtures and API/OpenAPI parity. | CON-04; **Existing constraint** |

## Decision register and gates

These are concrete recommendations with rationale and explicit decision owners. Implementation may proceed only after relevant assumptions become validated contracts; “proceed” below means draft/refine the indicated slice, not mark all stories Ready.

| ID / decision | Recommended default and rationale | Owner and gate |
|---|---|---|
| D-01 Target/cardinality | Individual saved test; one schedule per test. Avoid introducing suite orchestration and multiple competing test schedules. | User / PM: answer scope question before schema/API stories Ready; draft on stated assumption now. |
| D-02 Revision policy | Current confirmed inputs, with explicit Resume after affecting changes/reconfirmation. Makes the operator's unattended execution intent visible without pinning obsolete inputs. Optional unsuccessful recompile of unchanged approved input alone does not revoke readiness. | PM + architect + PO: confirm exact invalidation triggers and concurrent edit/acceptance behavior before lifecycle stories Ready. |
| D-03 Schedule administration | CSI write for administration; established visibility policy for reads. A management permission does not grant runtime secret access. | Security + architect + PM: policy review before management acceptance criteria become final. |
| D-04 Execution principal | Platform-approved CSI/environment service principal, recording the human activator separately, with live entitlement/secret checks at activation, acceptance and send. Use delegated human identity only if PUT Core requires it. Do not impersonate a confirming user or rely on stored login JWT. | Security/identity/vault owners + architect: external design decision; contract seam can be built fail-closed, but enabling execution cannot proceed without integration evidence. |
| D-05 Overlap | Skip a scheduled slot while the same test has nonterminal manual or scheduled execution. Avoid unattended side-effect collision; do not change manual admission policy by implication. | PM + architect: choose atomic race semantics before dispatcher stories Ready. Manual-start race must be covered explicitly. |
| D-06 Misfires/capacity | No historical replay/catch-up. At most latest eligible due slot within proposed configurable five-minute grace; defer that same not-yet-accepted occurrence within grace on capacity/temporary outage, then record expiry and advance. Bounded misfire summary records outage gaps rather than backfilling an unbounded ledger. | PM + architect + QA: adopt grace and disposition semantics before recurrence/dispatch Ready; five minutes is an architect proposal, not an existing requirement. |
| D-07 Cron/DST | Normalize to Spring six-field cron; timezone required; skip nonexistent local time; execute once per repeated wall-clock slot, selecting its first offset. Same rule for preview and dispatch. | Architect + QA + PM: validate runtime evidence and tests; plain Spring `next` does not establish once-only overlap policy. |
| D-08 Interval/limits | Minute-granularity cron with zero seconds; architect proposes configurable 60-second minimum matching current generic baseline, subject to browser sizing. Bound parser iteration for irregular cron and enforce the adopted minimum consistently. Never infer a Studio five-minute minimum from UC-02. | Architect + operations + PM: numerical floor, polling batch/tolerance and capacity values require sizing before dispatcher Ready. Pure parser/contract work can proceed. |
| D-09 Pause/removal | Stop future acceptance, keep historical provenance; schedule pause/removal does not cancel accepted work, and explicit run cancellation is separate. Test delete/quarantine retains existing pre-send refusal for queued accepted work; admitted work follows recovery/cancel. Do not run missed slots on Resume. | PM + UX + architect: validate distinct schedule-versus-test lifecycle wording and acceptance/send race semantics before lifecycle Ready. |
| D-10 Provenance/retention | Typed occurrences link real executions through the durable unpartitioned ledger, retaining a soft history partition locator; paginated refusal history; stable schedule/deduplication anchor survives removal/recreation. Preserve linked accepted identities independently of history/video expiry. | Architect + data engineer + operations: E-02 closes ownership enforcement (DB-05), nominal-versus-eligible polling (DB-09), stable recreate anchor/replay horizon and retention/linkage invariants (DB-10), including join-link versus deferred-FK choice. Finalize approved detail retention/archival settings before release; no new duration invented here. |
| D-11 Storage/runtime | Dedicated typed Studio schedules/occurrences reuse current worker/ShedLock infrastructure and Studio ledger. Avoid check-FK hacks and new Quartz infrastructure. | Architect proposal: reconcile existing ARCH prose in feature ADR before implementation entry. |
| D-12 Proven-on-demand condition | Require established on-demand pilot/production evidence before scheduling release. A new enforced prior-PASS guard on every test/revision is additional scope and is not proposed for this MVP. | PM + QA + user: confirm interpretation at release planning; external production evidence is a release gate, not a prerequisite for local create/enable stories. A future per-test guard would need explicit separate requirements. |
| D-13 Ambiguous terminal run | Block while ambiguity remains non-`DONE`; after terminal `DISPATCH_UNKNOWN` or `STALE`, durably block recurrence pending investigation and explicit audited Resume acknowledging uncertainty. Applies to ambiguous manual or scheduled activity relevant to this test. Resume permits future slots only; never replay the ambiguous slot. | PM + architect + operations: adopt durable block/recovery contract before dispatcher Ready. This recommendation adds a policy gate; it is not a claim existing recovery does this. |
| D-14 Initial state | Create paused by default, then explicitly activate/Resume with acknowledged exact confirmed revision and approved execution principal. Recommend this two-step API flow for MVP. If the form offers Active, it must make that acknowledgment explicit and perform paused create then validated activation; failed activation truthfully leaves a created Paused schedule. | PM + UX + architect: agree this flow/copy before OpenAPI freeze; an atomic create+activate route is an alternative requiring an explicit contract change. No temporary unvalidated enabled state. |

## UX and technical integration boundary

The proposal extends current Tests and authoring actions with scheduling controls, timezone-aware preview and paused/blocked states, then extends Runs and its drawer with origin/provenance. The check-specific `ScheduleDialog` cannot be reused unchanged because it operates on `CheckEntity` and checks state. [UX design](ux.md) should settle the entry points and copy; [architecture](architecture.md) owns endpoint/schema shapes and acceptance locking.

The runtime proposal uses existing Java/Spring/PostgreSQL, worker leadership and Studio execution infrastructure. The frontend uses the existing React/TypeScript/MUI project, centralized client, Redux/hooks and MSW contracts. Shared cron rules may be extracted into a dependency-safe reusable policy, while Studio keeps its distinct authorization, occurrence identity and browser retry contract. Numerical scheduler policies, background principal integration and retention are deliberate gates rather than hidden implementation defaults.

## Completion and approval boundary

This draft planning package is complete when discovery, architecture, UX, requirements and the dependency-ordered [implementation plan](implementation-plan.md) agree on proposals, risks and open gates. This does not mean implementation has begun or scheduling works.

Implementation entry requires scope/policy resolution, architect-reviewed API/transaction contracts, and SM/PO-created and validated stories. Production enablement separately requires real on-demand evidence, identity/vault authorization, operational sizing and QA/DevOps rollout evidence. PM supplies one epic and draft work-package briefs; SM/PO own lifecycle story creation, QA owns quality verdicts, and DevOps owns push/PR/release operations.
