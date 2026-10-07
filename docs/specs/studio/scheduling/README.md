# Studio test scheduling — planning package

Date: 2026-10-05. Coordinator: Orion. Workflow: the analysis and planning stages of `brownfield-fullstack`, with delegated product, architecture, database, UX, QA and product-readiness reviews.

The requested analysis and build plan use the current working tree, including pre-existing Studio changes. This is a proposed feature plan. It does not activate scheduling, approve policies, create Ready implementation stories or certify production integrations.

## Implementation follow-up

The later user-authorized `STUDIO-SCHED-001` spec pipeline approved the concrete local contract and implemented this capability. See the [specification](../../../stories/STUDIO-SCHED-001/spec/spec.md), [delivery story](../../../stories/STUDIO-SCHED-001/STUDIO-SCHED-001.story.md), [implementation evidence](../../../stories/STUDIO-SCHED-001/implementation/), and [operations guide](operations.md). The planning proposals below remain historical inputs; the approved feature contract governs implementation. Production scheduling remains disabled by default and live integration evidence is still a release gate.

## Recommended direction

Schedule individual saved, confirmed Studio tests through the existing platform worker and Studio acceptance/dispatch ledger. Add typed schedule and occurrence records; keep browser execution, callbacks, recovery, cancellation and evidence on their existing paths. The existing generic check scheduler is check-ID-bound, and Studio's legacy schedule field does not provide operational scheduling.

The proposed first release supports one recurring schedule per test, timezone-aware preview, create/edit/pause/explicit resume/removal, and occurrence history linked to real runs. Suites, bulk orchestration, notifications and unified catalog/report projections need separate scope.

The following are proposed policies, rather than previously approved requirements:

- Create paused; activation acknowledges the exact confirmed revision and approved background identity.
- Execution-affecting edits require preparation/confirmation and explicit Resume. Metadata edits preserve eligibility; confirming alone never resumes a paused or blocked schedule.
- Normalize cron to six fields with zero seconds; use an explicit timezone and the same server resolver for preview and dispatch. The proposed interval floor is 60 seconds, subject to browser-capacity validation.
- Skip nonexistent DST times; run once per repeated local slot, choosing the earlier offset. The actual Spring 6.1.14 dependency returns both repeated 01:30 instants, so this policy needs explicit suppression and tests.
- Skip historical catch-up; consider at most the latest eligible due slot within a proposed configurable five-minute grace. Defer temporary pre-acceptance failures using the same occurrence identity within that grace.
- Skip scheduled acceptance while the test has active manual or scheduled work. Ambiguous/stale execution blocks later scheduling until investigation and audited Resume; never automatically replay an uncertain browser attempt.
- Schedule pause/removal stops future acceptance without cancelling accepted work. Test deletion/quarantine additionally preserves existing pre-send refusal for queued accepted work; admitted runs retain their immutable inputs and use current recovery/cancellation semantics.

## Documents and owners

| Document | Owner | Purpose |
| --- | --- | --- |
| [Discovery](discovery.md) | Atlas, analyst | Existing requirements, implementation gaps and documentation drift. |
| [Requirements and decisions](requirements.md) | Morgan, PM | Source traceability, proposed MVP policies and entry/release decisions. |
| [Architecture](architecture.md) | Aria, architect | Reuse seams, typed API/storage, acceptance transaction, clock and identity model. |
| [Database review](database-review.md) | Dara, data engineer | Ownership constraints, idempotency, lock order, DST identity, retention and migration review. |
| [UX plan](ux.md) | Uma, UX expert | Editor/list controls, schedule/readiness states, history, accessibility and MSW-first flows. |
| [Build plan](implementation-plan.md) | Morgan, PM | Eight work packages with dependencies, owners, acceptance drafts and rollout. |
| [QA review](qa-review.md) | Quinn, QA | Independent planning critique and required correctness/release evidence. |
| [Readiness review](readiness-review.md) | Pax, PO | Cross-document alignment, relevant checklist coverage and story-entry gates. |

## Proposed delivery sequence

1. Adopt policies and freeze API, state, authorization and database contracts.
2. Add typed schedule/occurrence storage and immutable provenance.
3. Implement terminal-operable administration and the shared recurrence resolver.
4. Implement the fail-closed background authorization seam; real platform evidence remains a release gate.
5. Implement bounded, atomic due-occurrence acceptance through Studio's ledger.
6. Build Studio controls against the agreed API and MSW scenarios.
7. Expose occurrence history and scheduled-run evidence in existing Studio views.
8. Verify concurrency/recovery, size capacity and conduct a gated pilot rollout.

These are work-package briefs, not eight pre-approved stories or a time estimate. The build plan identifies which preparations can proceed independently. SM/PO should draft and validate lifecycle stories only after the relevant entry contracts are settled.

## Important review findings

Durable duplicate protection must be independent of poller leases and public manual idempotency keys. The proposed ledger uses a unique typed scheduled-occurrence reference; manual keys remain separate. A second local-slot identity spans schedule versions, preventing a fall-back repeat after an edit or activation.

Acceptance and refused-occurrence recording require a reviewed transaction design: expected admission refusals return typed outcomes, and unexpected persistence failures roll back the whole unit. Lock one test/occurrence at a time in the reviewed order. Overlap reads must not lock existing ledger rows while holding the test, because completion callbacks acquire those locks in the opposite order.

Keep accepted-run linkage on the unpartitioned ledger with an immutable history locator; a new foreign key into partitioned execution history could interfere with retention. Preserve schedule/occurrence identity through removal, recreation and the agreed replay horizon. The database review names the exact ownership, state, backoff and linkage choices to close before DDL.

## Implementation and production boundaries

Local schema/API/mock work can proceed after the relevant design decisions and fail-closed identity contract are adopted and stories validated. Production activation separately needs approved unattended identity/grant integration, live secret authorization/revocation, current on-demand Studio acceptance evidence, operational sizing, and independent QA/DevOps release evidence. Development entitlement adapters do not establish those production guarantees.

Deploy additive storage and compatible writers/consumers with scheduling disabled by default. Verify every executable-edit path invalidates schedules and every background execution rechecks authority before enabling a pilot. Disable the producer and new activation before any rollback; retain compatible recovery for accepted runs and preserve audit storage.

Workflow progress and scoped decisions are recorded in [the planning state](../../../../.aiox/studio-scheduling-planning-state.yaml). The full development workflow has not been executed. Future testing and release gates are defined in the reviews; no application test-suite pass is claimed by this documentation-only task.
