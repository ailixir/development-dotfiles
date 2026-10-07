# Studio scheduling — product-owner planning readiness review

Date: 2026-10-05. Reviewer: Pax. Target: the brownfield-fullstack planning package, with UI. Mode: autonomous/comprehensive, using the declared [PO master checklist](../../../../.aiox-core/product/checklists/po-master-checklist.md), [execute-checklist task](../../../../.aiox-core/development/tasks/execute-checklist.md) and repository checklist-runner skill. This is a scoped planning-evidence review, not a lifecycle story validation, completed-story QA gate or production approval.

**Planning review complete; implementation entry is conditional.** Discovery, requirements, proposed architecture/database alternatives, UX, dependency-ordered work packages and independent QA review form a coherent reviewable plan. Relevant policies and design contracts remain draft. No scheduling implementation story is created or marked Ready, and no implementation or production test pass is claimed. Quinn's independent **planning CONCERNS** remain authoritative within their stated scope; this PO review does not replace that assessment.

## Inputs, scope and evidence boundary

Reviewed [discovery](discovery.md), [requirements](requirements.md), [architecture](architecture.md), [database review](database-review.md), [UX](ux.md), [implementation plan](implementation-plan.md), [QA review](qa-review.md), the package [index](README.md) and [workflow state](../../../../.aiox/studio-scheduling-planning-state.yaml). Existing source remained available for cross-checks. In particular, `backend/src/main/java/com/citi/put/checks/studio/dispatch/ProvisionalDispatchAuthorization.java:33`–`:44` confirms deleted/quarantined drafts fail pre-send authorization.

The current working tree, including pre-existing uncommitted Studio work, remains the baseline. Editorial corrections affected this new scheduling documentation only. There was no application edit, migration, test-suite execution, deployment, external message, story status transition or git commit/push.

The checklist normally reviews readiness for development. Here, PASS means the **selected planning obligation is documented with evidence and sequence**; it does not mean the future code or tests satisfy it. PARTIAL means a named entry or release contract still needs closure. Greenfield scaffolding, account purchases/domain/email/CDN setup, implemented UI journeys, actual CI/feature-flag installation and full lifecycle story validation are outside this scoped review. Existing project tools are reused; no unsupported new service setup is mandated.

## Checklist result

Thirty selected planning obligations were assessed: **23 PASS, 7 PARTIAL, 0 FAIL**. Planning coverage is **76.7%** (23/30); this is a scoped checklist-evidence percentage, not an implementation-readiness or reliability score. Under checklist-runner thresholds the implementation-entry disposition is **NEEDS_WORK**; under the PO checklist's categories it is **CONDITIONAL**. Open contract decisions do not make the user's requested analysis/plan incomplete.

| Checklist category | Assessed | Pass | Partial | Fail | Planning pass rate |
|---|---:|---:|---:|---:|---:|
| 1. Brownfield setup/integration | 3 | 3 | 0 | 0 | 100% |
| 2. Infrastructure and deployment | 3 | 2 | 1 | 0 | 66.7% |
| 3. External dependencies/integrations | 3 | 2 | 1 | 0 | 66.7% |
| 4. UI/UX considerations | 3 | 3 | 0 | 0 | 100% |
| 5. User/agent responsibility | 3 | 3 | 0 | 0 | 100% |
| 6. Sequencing/dependencies | 3 | 3 | 0 | 0 | 100% |
| 7. Brownfield risk management | 3 | 1 | 2 | 0 | 33.3% |
| 8. MVP alignment | 3 | 2 | 1 | 0 | 66.7% |
| 9. Documentation/handoff | 3 | 2 | 1 | 0 | 66.7% |
| 10. Future/monitoring considerations | 3 | 2 | 1 | 0 | 66.7% |

Selected-item evidence and remaining action:

| Checklist item | Verdict | Evidence / closure |
|---|---|---|
| 1.2 Existing analysis documented | PASS | Discovery records source traces, scope and current implementation gaps. |
| 1.2 Integration points identified | PASS | Architecture §§2–5 names check-ID limitation, Studio acceptance/readiness/ledger, worker profiles and callbacks. |
| 1.2 Rollback procedures per integration | PASS | Each WP has rollback treatment; plan migration/reversal sequence retains additive audit and compatible recovery. |
| 2.1 Schema defined before data operations | PASS | WP1/E-02 precedes WP2 and all data operations; conceptual schema is explicitly not approved DDL. |
| 2.1 Migration risks identified/mitigated | PARTIAL | DB-05/06/08/10 and WP2 identify constraints, history retention and mixed versions. E-02 must select exact ownership/linkage/replay contracts; DDL lock/index evidence is future work. |
| 2.4 Regression testing covers existing behavior | PASS, plan only | WP3/WP5/WP8 and QA matrix require generic scheduling/manual Studio regressions; no current result is asserted. |
| 3.2 External API integration points identified | PASS | WP4 and architecture §7 separate PUT Core grants, secret-use policy, vault materialization and source manual eligibility. |
| 3.2 External authentication properly sequenced | PARTIAL | WP1/E-03→WP4→due acceptance sequence is clear; approved unattended principal/live-grant contract remains open. Real evidence is R-02. |
| 3.2 API limits/constraints acknowledged | PASS | Quotas, bounded cron/polling/network work and latency/capacity evidence are explicit; defaults are not treated as measured capacity. |
| 4.2 UI consistency maintained | PASS | UX retains MUI/theme/routing, Tests/editor entry points, existing Runs drawer and centralized Studio client. |
| 4.3 User journeys mapped | PASS | UX covers create-paused→Resume, edits, blocked/reconfirmed state, pause/removal, distinct test deletion and occurrence/run links. |
| 4.1 Accessibility defined upfront | PASS | Labels, errors, keyboard/focus/announcements and responsive metadata have proposed acceptance scenarios. |
| 5.2 Code tasks assigned to developer agents | PASS | Dex owns implementation work; no implementation is performed by this review. |
| 5.2 Configuration management assigned | PASS | Architect/Data/DevOps roles and compatible rollout/migration ownership are separated. |
| 5.2 Testing/validation assigned appropriately | PASS | Quinn owns quality evidence/verdict; Pax validates future stories; Gage owns release/repository actions. |
| 6.1 Functional features correctly sequenced | PASS | WP1 contracts→storage/admin/auth→atomic due acceptance→evidence/rollout; mocks prepare against adopted contracts. |
| 6.2 Data models before operations | PASS | WP2 precedes WP3/WP5/WP7; WP4 uses its adopted identity/persistence references. |
| 6.3 No dependency on later epic functionality | PASS | Catalog/report integration, suites and notifications remain excluded; no dummy check FK workaround is required. |
| 7.1 Existing functionality risk assessed | PASS | Discovery, DB/QA findings and compatibility requirements cover manual idempotency, callback locks, partition pruning and authorization drift. |
| 7.2 Backup/recovery procedures updated | PARTIAL | Restore older than accepted cursor and retained anchor risks are named; E-02/R-03/R-04 need concrete reconciliation/runbook/evidence. |
| 7.2 Rollback triggers/thresholds defined | PARTIAL | Disable/pause/drain sequence is concrete; actual lag/load/grant/transaction thresholds and named pilot operators require R-03/R-04. |
| 8.1 Core PRD goals addressed | PASS | SRC-01–10 trace to the proposed scheduled-test capability and inherited execution/evidence controls. |
| 8.1 No extraneous MVP features | PASS | Individual saved test/one schedule is an explicit assumption; suites, reports/catalog and notifications are deferred. |
| 8.3 Architecture aligns with constraints | PARTIAL | Reuse/atomicity/identity direction is coherent, but policy adoption and E-02 exact schema/outcome contracts still govern readiness. |
| 9.1 Architecture decisions documented | PASS | Proposals and alternatives are marked, with explicit DB/QA findings and E/D gates. |
| 9.1 Integration points documented in detail | PASS | Test/schedule/occurrence locks, expected business outcomes, typed scheduled identity, soft history locator and compatible rollout are described. |
| 9.1 API documentation accompanies implementation | PARTIAL | Proposed routes/fields exist; exact versioned OpenAPI bodies/error enums/state invariants/examples are WP1, not already frozen. |
| 10.1 MVP and future features separated | PASS | Requirements and plan explicitly distinguish later suites/catalog/reporting/notifications. |
| 10.1 Extensibility points identified | PASS | Typed Studio schedule target, shared recurrence/admission seams and additive provenance avoid broad generic scheduler rewrites. |
| 10.2 Performance measurement incorporated | PARTIAL | Due/decision lag, quotas, lock/network/DB duration and ordinary-check isolation are specified; sizing and accepted budgets require R-03. |

## Reconciled editorial findings

The final package carries the following obligations consistently. These corrections align existing expert proposals and source behavior; they do not approve product policies or choose new architecture.

1. WP2 includes both per-version UTC identity and **version-independent local-slot uniqueness**, with stable protection across removal/recreation. It keeps scheduled ledger identity separate from public manual keys/digests.
2. Accepted identity belongs to the **unpartitioned ledger**, with an immutable soft history locator. No new FK into partitioned history is prescribed. E-02 explicitly selects ledger-joined mapping versus reviewed deferred occurrence→ledger linkage.
3. WP5 carries **test → schedule → occurrence → global quota → CSI quota**, one candidate transaction at a time. Overlap uses nonlocking indexed `EXISTS`; callbacks already take ledger/history before test-summary locks.
4. Architecture/WP2/WP5 distinguish immutable nominal `next_due_at` from eligible `poll_after_at`, preventing a deferred occurrence from becoming a hot due row or new identity.
5. E-02 explicitly includes DB-05 ownership enforcement, DB-09 state/cursor eligibility and DB-10 stable anchor/replay/retention horizons. Composite FK/constraint-trigger and linkage alternatives remain choices to close before DDL.
6. UX matches paused creation followed by explicit validated Resume. Partial success leaves the created Paused schedule visible. Confirmation alone never resumes recurrence; optional failed recompilation of unchanged approved input does not establish unready state.
7. Relevant terminal `DISPATCH_UNKNOWN`/`STALE` retains proposed durable recurrence blocking until investigation and audited Resume. `DONE` alone is not proof of known side effects.
8. **Schedule pause/removal differs from test deletion/quarantine.** Schedule mutation does not itself cancel accepted work. Test lifecycle changes preserve existing pre-send rejection; admitted work remains under recovery/cancel. Requirements, architecture, UX, plan and README now reflect this distinction.

Quinn reviewed the reconciliation and retained planning CONCERNS for open contract adoption and future evidence, rather than unresolved accidental wording contradictions.

## Requirement and acceptance coverage

| Requirement group | Delivery coverage | Future evidence |
|---|---|---|
| FR-01–03, FR-12: target, administration, recurrence, terminal operation | WP1–3, WP6 | QA UNIT-01–04, INT-01/11, FE-01/02 and E2E-01; freeze exact wire contract first. |
| FR-04–06: readiness, revision activation, atomic occurrence identity | WP2–5 | QA INT-02–08/16–19; PostgreSQL concurrency/failure injection, not repository mocks alone. |
| FR-07–10: refusals, misfire/overlap/ambiguity, lifecycle, evidence | WP2/3/5–7 | QA UNIT-04/05, INT-09/10/14/20, FE-03, E2E-02. |
| FR-11: background principal/live authorization | WP1/4/5/8 | E-03 local fail-closed seam; real INT-12/13 and E2E-03 evidence remains R-02. |
| NFR-01–05: capacity, durability, time, security, bounded accessible UI | WP2–8 | QA UNIT, P0 integration, MSW/component and LOAD-01 scenarios; sizing thresholds need adoption. |
| CR-01–04: current manual/generic behavior, additive storage/contracts, UI consistency, mock-first | All relevant packages | Manual/generic regressions, populated migration/partition tests, OpenAPI/MSW parity and existing list/drawer behavior. |

Every FR/NFR/CR group has a planned delivery/evidence route. This is coverage of acceptance intent, not proof the future scenarios exist or pass. SRC-10's later unified projections do not become phantom MVP requirements. D-12 requires current established on-demand trust before release; the package does not invent a mandatory prior-PASS guard per test.

## Entry closure and concrete next story

The next concrete entry point is **River/Pax drafting from WP1: Adopt Studio scheduling policies and freeze integration contracts**, with status Draft and no allocated story ID implied here. The first implementation-ready slices are WP2 storage/provenance and WP4's fail-closed authorization seam, after their relevant adopted contracts; WP3 uses WP2 before UI delivery. Work packages may split into several stories and are not eight pre-approved stories.

Before an affected implementation story reaches Ready:

- **E-01 / PM + user:** adopt relevant D-01–14, including cardinality, initial paused activation, revision Resume, overlap/misfire, DST and uncertainty semantics. Numerical cadence/grace choices are proposals, not inherited guarantees.
- **E-02 / Aria + Dara:** close copied CSI/revision ownership, stable local-slot identity/anchor, intent/effective-state invariants, nominal-versus-eligible cursor, retained deduplication horizon, ledger linkage option and exact atomic expected-outcome/lock contract. Freeze versioned API request/response/error/preview examples and reserve migration number against consolidated baseline. Reconcile historical Quartz prose through a scoped feature decision.
- **E-03 / Security + platform identity/vault + architect:** agree execution principal/grant lifecycle and fail-closed local adapter seam, preserving manual eligibility. External production proof belongs to release gates, not a blanket ban on scoped local implementation.
- **E-04 / River + Pax:** create and validate actual associated lifecycle stories with traceable AC, dependencies, task checkboxes, impacted File List, test/rollback plan and declared executor/QA gate. This report did not run `validate-next-story` against a nonexistent story.

The dependency map does not authorize code before associated valid stories. CLI/API operational acceptance precedes delivered UI; types/MSW/UX preparation can proceed against adopted contracts. The package creates no new standalone product CLI assumption.

## Highest integration risks and release boundary

The five highest-consequence risks are duplicate/partial acceptance, callback lock inversion, unauthorized unattended execution after revocation, repeated effects after ambiguous termination, and lost duplicate protection through DST/version/recreation/restore/retention. The mitigation is the explicit transaction/identity/lock/uncertainty/retained-anchor contracts and Quinn's real PostgreSQL/runner/identity scenarios. No delivery dates or confidence assurances are inferred from source inspection.

Rollout readiness is currently **documented, not demonstrated**. Production requires R-01 current on-demand trust evidence, R-02 real unattended grants/secret revocation, R-03 adopted sizing/retention and measured isolation, and R-04 independent QA plus Gage's compatible staged rollout decision. Update all writers and dispatch consumers with scheduling default off; rollback disables new production and retains compatible recovery plus additive audit. No downlevel consumer may silently dispatch scheduled work without the approved live policy.

The user's requested analysis and plan are complete as a reviewed draft package. Product/design adoption, actual story readiness, implementation verification and production enablement remain separate subsequent work.
