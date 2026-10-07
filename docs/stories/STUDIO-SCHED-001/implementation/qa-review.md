# STUDIO-SCHED-001 — independent implementation QA

Reviewer: Quinn. Review date: 2026-10-05 (America/New_York). **Gate: CONCERNS for the local, default-off implementation.** No unresolved high-severity scheduling defect remains in the reviewed source. Baseline failures, incomplete whole-repository verification and external production evidence remain explicit concerns; this is not a production or merge approval.

Reviewed revision: `working-tree-source-sha256:2d38f01546eb1551cf8d33ee198b8f71089b46d8ea521bea3e446e8bb3207756`, covering 53 source/contract inputs at final review. The story was reviewed separately at its InReview digest `1d8d48f8adc5d2ae2252031c4f12f855b3355bb57e14abd700ae54419518053c` before the QA-owned lifecycle transition. Backend executor hashes match the inspected files; current JUnit XML confirms the final 63 tests passed with zero errors, failures or skips. The reviewer executed the scoped runner checks, inspected code and test assertions, and reviewed coordinator/executor evidence. Test batches reported by other specialists are attributed below rather than represented as rerun by QA.

The final fingerprint includes the architect's documented wiring amendment: the scheduled helper runs inside the existing dispatch authorization bean, preserving constructor/test-primary compatibility, and the local require guard supplies provisional attribution while real policy identity remains release-gated. QA reviewed this amendment against the already-inspected implementation; no application source changed. Source-only hashing excludes subsequent QA story metadata, preventing a self-referential review digest. Individual hashes are retained in `qa-review-inputs.json`.

## Scope and evidence

The review used the approved iteration-2 specification, requirements, architect contract, V26 migration, all new scheduling classes and their acceptance/lifecycle/confirmation/dispatch/provenance seams, frontend dialog/API/types/MSW/Tests/Runs surfaces, OpenAPI, operations and ADR-003. Pre-existing uncommitted work is the baseline; the entire working-tree diff is not attributed to scheduling.

| Evidence | Result and boundary |
| --- | --- |
| Final backend feature/regression run, inspected XML and [executor report](backend-verification.json) | **63/63 passed, 0 skipped**: API/processor 19, schema 20, resolver 4, isolation 2, Studio contract 14, generic CRUD/toggle/backpressure 4. Real private PostgreSQL 15 exercised migration/transactions. |
| Additional backend executor batches | Manual acceptance 11, dispatcher 26, recovery 25 and generic cron/ShedLock/retry/report dispatch 8 passed. These are separate batches, not a full unfiltered suite claim. |
| Backend static checks | Spotless Java, Checkstyle main/test and SpotBugs main passed. SpotBugs test is disabled by the existing build configuration; it did not pass an executed analysis. |
| Latest frontend focused verification, [coordinator record](validation.json) | **119/119 passed**, including **22 new focused tests**, after final UI/mock corrections. Type check and lint passed with 0 errors and 303 pre-existing warnings. Webpack and Vite builds passed sequentially. |
| Whole frontend run | 913/917 passed, with the same 4 pre-existing failures reproduced before this task. This run preceded the final isolated QA corrections; the latest 119-test focused run verified those corrections. The whole frontend suite is not green. |
| [Browser smoke](browser-smoke.json) | Chromium fixture flow passed create Paused → exact revision Resume → pause → versioned edit → remove. This exercised isolated routes/MSW data, not real scheduling mutations, browser test execution or production authorization. |
| QA-executed [runner evidence](qa-runner-contract.json) | **35/35 passed**: confinement 19 and actual producer/internal contract 16. Scoped execution disables global coverage. The first filtered run passed all assertions but exited 1 due to whole-repository coverage thresholds; no full runner coverage pass is claimed. |
| Automated review | CodeRabbit executable and configured WSL runtime are unavailable. `.aiox-core/core-config.yaml` explicitly permits `graceful_degradation.skip_if_not_installed: true`. Independent manual review and static checks were used; no automated CodeRabbit pass is claimed. |

Unfiltered backend `./gradlew test`, full `./gradlew check`/whole-repository Jacoco verification and a real scheduled browser/production load pilot were **not run**. Scope and exact commands are retained in the linked evidence. Required whole-repository gates must close before merge/release.

## Correctness findings and resolved fixes

| Finding | Final disposition |
| --- | --- |
| High: due-pass CSI cursor advanced past unattempted candidates, allowing a slow first CSI to starve later CSIs every pass. | **Resolved.** Cursor advances only for an attempted CSI. Real PostgreSQL tests cover both persistent SQL failure and a first-CSI deadline overrun; the next CSI gets an attempt. |
| Medium: late terminal uncertainty appeared in reads while persisted schedule state remained ENABLED, hiding investigation/Resume until the next due tick. | **Resolved.** Nonmutating backend projection exposes effective BLOCKED; frontend also handles persisted ENABLED plus uncertainty IDs, retains author-paused intent and offers exact-set future-only Resume before the due time. |
| Medium: mock no-op updates/confirmation/refusal and outstanding deferred Resume differed from the backend. | **Resolved.** Mock lifecycle, revision replacement reason and deferred settlement now follow the contract; read-time uncertainty does not mutate stored author intent/version. |
| Medium: primitive missing `enabled` silently interpreted a malformed request as pause. | **Resolved.** Boxed Boolean with explicit 400 validation; actual API test verifies unchanged schedule version. |
| Medium: new public operations broke the frozen 23-operation status pin and the runner whole-document hash pin. | **Resolved by authorized test-only QA edits.** All prior 23 entries remain unchanged, 8 reviewed operations are explicitly added and total 31 pinned, with implementation/pending markers checked. Runner hash assertion remains, reanchored to the reviewed public amendment. Current runner producer compatibility passed. |
| P0 evidence gaps around quota waits, callback locks and actual input races | **Resolved in the final targeted tests.** Actual advisory lock waits cross grace/revocation with zero accepted writes; a held ledger callback cannot block scheduled overlap; late START_TIMEOUT blocks the next tick; injected history/ledger/cursor failures roll back; edit/admission and cross-actor activation provenance are exercised. |

QA changed only the two specifically authorized contract tests and review artifacts. It did not author application fixes. The separate backend/frontend owners applied the code changes and supplied their final verification.

## Acceptance trace

| Local AC | Reviewed implementation and meaningful evidence |
| --- | --- |
| AC-01/02 | Owned typed schedules, stable tombstones, capabilities, paused creation, expected versions and exact activation/uncertainty checks; actual API conflicts/default/disabled and schema ownership tests. |
| AC-03 | One server resolver, zero seconds/fixed 60-second floor, explicit UTC/IANA, exact New York gap/overlap plus half-hour/three-hour transitions, bounded grace-window preview/due behavior. |
| AC-04 | Expected business outcomes remain inside the nonproxied scheduled path and persist refusal without a synthetic run. Unexpected SQL errors roll back the entire unit. |
| AC-05 | Test-first authoring/metadata/confirmation/delete integration and activated-revision readiness; unchanged optional failed recompile remains runnable. Actual input mutation/acceptance race and retained immutable snapshots verified. |
| AC-06/07 | Unique typed ledger occurrence identity, version-independent local slot and deferred commit-time matching constraints, stable anchors; real replica threads and injected write failures leave one accepted linkage or rollback. |
| AC-08/09 | Fixed nominal cursor, bounded eligible backoff, lifecycle settlement, feature-off expiry and future-only reenable; accepted work remains under existing dispatch/recovery/cancel and test lifecycle denial. CSI fairness and isolated producer executor tested. |
| AC-10 | Retained immutable human activation events and matching accepted metadata; real run/source/actor linkage, later operators/recreation, paginated history and deleted-parent authorized occurrence audit. Nullable legacy attribution remains Unknown. |
| AC-11 | Default-deny production/mixed profiles, explicit CSI/environment local grants and independent secret preflight; grant revocation before admission/send and after quota/preflight waits fails closed. No login JWT/secret values in new persistence. |
| AC-12 | Centralized transport, MSW contract, saved/dirty boundaries, preview, errors/conflicts, labelled dialog, keyboard/focus/status, history and mock browser journey. No implicit save/compile/confirm or mutation retry. |
| AC-13 | Nonlocking active-ledger EXISTS under the test lock, demonstrated while a callback owns that ledger row. Manual policy stays compatible. |
| AC-14 | Atomic retained ledger uncertainty code/time, exact acknowledgment tied to immutable activation, preserved after history detail pruning and late uncertainty. Resume never replays an uncertain slot. |

Source and real PostgreSQL evidence support the local invariants. The browser fixture flow does not substitute for a real scheduled browser pilot, and source inspection is not itself experimental load or restore evidence.

## Remaining concerns and release obligations

1. **TEST-001 (medium, baseline):** three existing InferenceStudio tests and the existing video-playback accessibility surface fail. Exact names and before-task reproduction are in `validation.json.knownPreexistingFailures`. They are not scheduling regressions, and no waiver or whole-suite pass is fabricated.
2. **TEST-002 (medium, global verification):** full unfiltered backend test/check/Jacoco and full runner coverage are unverified. The latest whole frontend suite was before the last scoped fixes and retains the four known failures. DevOps must close the required global gates before merge/release.
3. **SEC-001 (medium, external release):** real PUT Core service-principal/delegation, live grants/secret revocation and actual policy/grant identity/version remain unwired. The local interface/dispatch audit is development policy; a real provider must expose the approved policy identity before production acceptance. Current production and unknown-profile combinations deny.
4. **OPS-001 (medium, external release):** real on-demand trust, actual scheduled browser pilot, representative capacity/ordinary-check isolation, retention/restore reconciliation and compatible rollout remain outstanding. Pass budgets bound processing/rotation and isolate the timer; they do not prove a measured production latency SLA or hard bound on every external call.

Scheduling remains default off. Upgrade all writers and dispatch/authorization consumers before any enablement, preserve additive identity/audit storage, and drain compatible accepted-work consumers before downlevel rollback. A database restore cannot reconstruct erased browser effects. The operations runbook makes explicit pause/removal, global disable, accepted-run cancellation and investigated future-only Resume distinct.

## Gate and lifecycle

Gate: **CONCERNS** → [STUDIO-SCHED-001-studio-test-scheduling.yml](../../../qa/gates/STUDIO-SCHED-001-studio-test-scheduling.yml)

The local implementation is complete within the associated story's explicit release boundary. This verdict transitions InReview → Done under the declared QA lifecycle rule, with the above concerns retained. It authorizes neither remote publishing/merge nor unattended production scheduling.
