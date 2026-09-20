# Studio inference story readiness

Date: 2026-09-16. Reviewer: Pax, Product Owner. Scope: stories 10.20–10.26. This is a story-readiness assessment, not implementation QA or production approval.

The review used the repository's `aiox-po` agent, `validate-story-draft` skill and `.aiox-core/development/tasks/validate-next-story.md`, in autonomous mode under the user's authorization to execute the reviewed plan. Inputs were the actual story files, the [implementation plan](../architecture/studio-inference-implementation-plan.md), [inference findings](../architecture/studio-inference-review-2026-09-16.md), [existing architecture](../architecture/studio-execution.md), [Epic 10 manifest](../epics/EPIC-10-EXECUTION.yaml), repository configuration/template, and Aria's bounded runner/verdict freeze communicated through the coordinator. The incomplete remainder of C0 is not represented as frozen.

## Decisions

| Story | Verdict / score | Scope that may start | Remaining prerequisite |
| --- | --- | --- | --- |
| [10.20](../stories/10.20.story.md) | GO, 8/10; Ready | Contract and independent evaluation specification | Completion still requires Aria/Dara/Quinn agreement on each contract; this readiness decision does not complete C0 |
| [10.21](../stories/10.21.story.md) | GO, 9/10; Ready | Runner F4/F6 assertion/action correctness and meaningful browser regressions | Coordinate policy pins/reference generation; independent QA before completion |
| [10.22](../stories/10.22.story.md) | Conditional GO, 8/10; Ready after C0 landed | Gateway/schema/deadline foundations and local wire tests under C0 §§4–5 | Coordinator transfers shared build/config/budget/repair paths before editing; verify schema outputs before integration; live gates stay closed |
| [10.23](../stories/10.23.story.md) | Conditional GO, 8/10; Ready after C0 landed | Additive V18, owned migration tests, V19 cutover design/rollback notes under C0 §§2–3 | No automatically applying V19 on mixed writers; distinct-candidate integration awaits cutover/backend handoff |
| [10.24](../stories/10.24.story.md) | GO, 8/10; implementation active | All implementation against frozen C0, including pure planner/assembler | Integrated QA waits for tested 10.21–10.23 handoffs; exclusive writes/build token required |
| [10.25](../stories/10.25.story.md) | Conditional GO, 8/10; Ready | Frontend/MSW flow against C0 and Uma UX | V2 UI disabled until server/schema capability; integrated acceptance depends on 10.24 |
| [10.26](../stories/10.26.story.md) | Conditional GO, 8/10; Ready after QA spec landed | Versioned local CLI/schema, fixture/oracle/mutation foundations | Integrated API flow waits for dependencies; live targets, approved environment and T3 remain open |

Confidence is high for the two isolated correctness slices, and medium for the remaining stories until the identified handoffs are recorded. Revalidate only the newly supplied contracts/ownership when those inputs land; do not repeat unrelated readiness work.

Same-day follow-up: [C0](../architecture/studio-inference-contract-v1.md) was persisted after the initial pass. Its frozen interfaces resolve the missing-contract blockers for gateway and additive persistence foundations; stories 10.22/10.23 now have bounded conditional GO. Their earlier NO-GO remains in the change log for traceability. Source §6 also records the runner/verdict decisions, replacing reliance on the coordinator message. No Gradle/migration process starts while the coordinator holds the shared build token.

Quinn's [evaluation specification](studio-inference-evaluation-spec.md) subsequently supplied the local harness contract, and the coordinator assigned `studio-runner/evaluation/**`, `test/evaluation/**` and the package evaluation script to its Dex. This resolves story 10.26's local-foundation blocker. The specification's proposed numerical targets remain unapproved; this pass makes no product-SLO or live-release decision. Shared gateway/budget and migration test paths are now recorded in stories 10.22/10.23; the coordinator retains pipeline/config ownership until handoff.

## Frozen implementation boundaries

Runner story 10.21 preserves the semantics authors see: normalize whitespace for string text assertions, preserve regex matching and explicit `ignoreCase` overrides in both directions, and reject trial actions deterministically. Unit tests alone are insufficient: real Chromium tests must show both previously wrong passes and wrong failures, with negative companions. The runner executor owns the adapter/validator and matching tests. Shared language references, policy pins and frontend summaries require a named owner/handoff.

The story 10.24 slice keeps the existing validator envelope and tightens its consumption. Require the actual expected validator version, exact source-step coverage, valid unique indices, coherent aggregate/per-step booleans and correctly shaped/indexed diagnostics. Reject duplicate/unknown JSON keys and missing or contradictory data. Never fill a missing validator version from configured provenance. The coordinator owns `RunnerValidationClient.java`, `RunnerValidationClientTest.java` and the minimal `CompilePipeline.java` provenance/version guard for this packet. New authoring, outcome, persistence and incremental behavior remain outside this packet.

## Task-defined validation findings

| Area | Assessment |
| --- | --- |
| Template / assignment | Existing concise story layout is usable. Each story has its role, distinct executor/reviewer, acceptance criteria, mapped tasks, sources, ownership, change log and future QA record. Status markup and versioned change logs were normalized mechanically. No invented implementation scope was added. |
| Paths / sources | Existing runner adapter/validator, backend compile/validator, entities, repositories and migrations were inspected. Current migrations end at V17; V18/V19 are reserved by the coordinator. Future contract/UX/harness files are deliverables, not evidence that already exists. |
| Acceptance / edge cases | The immediate slices have observable positive/negative outcomes and existing test seams. Remaining stories identify required C0 decisions instead of asking implementers to invent them. |
| Test instructions | The plan's Gradle, runner/browser and frontend/MSW commands apply. The ready stories name the relevant regression families. New SQL/concurrency cases need real PostgreSQL; live inference quality remains a separate evidence tier. No builds or application tests ran in this readiness review. |
| Security / privacy | Preserve same-test/CSI authorization, exact revision confirmation, revoked-policy behavior and secret exclusion. Nothing in readiness enables live inference or deployment. |
| Dependencies / sequence | Contract/specification work can start. Independent runner/verdict fixes can start against their frozen boundaries. Full/incremental backend work cannot begin solely because the strict-verdict slice is ready. |
| CodeRabbit | Enabled with repository-configured missing-tool fallback. Stories specify bounded review/correction and independent human-agent review; CLI availability or success was not assumed or tested here. Further implementation packets should name their exact focus areas and commands. |
| Anti-hallucination | Requirement claims trace to the plan/findings or existing code. Old source/artifact shapes, uniqueness and immutable-trigger behavior were checked directly. No cloud/SDK compatibility, benchmark result or migration rehearsal is claimed. |
| Actionability | Ready boundaries have exclusive writers and enough detail to proceed. Draft stories list the missing handoff that would make them executable. |

## Required corrections and handoffs

1. Aria completes the canonical C0 document; downstream stories replace “once frozen” with its precise applicable sections. The frozen runner/verdict subsets do not wait for unrelated persistence work.
2. Dara's persistence design must preserve string-array/runtime hashes while adding immutable ID/scope/request snapshots. V19 removes the old content-identity uniqueness only after incompatible publishers drain. An old `ON CONFLICT` writer cannot run after that cutover. Retain the compatible rollback floor and preserve legacy history.
3. Stable IDs, dependency scope and edit reaffirmations participate in captured immutable identity and publication guards. Scope-only changes invalidate in-flight work. Compile, confirmation and execution acceptance need coherent draft/revision/configuration capture and a consistent lock order.
4. Uma supplies the scope/review interaction specification before frontend implementation. Quinn supplies independent evaluation cases, CLI/evidence shape and mutation controls before harness implementation.
5. The coordinator assigns shared-file and rollout-runbook ownership explicitly. SQL migrations/DB tests belong to Dara; Java entity/repository/CAS integration belongs to backend Dex. The strict-verdict packet is coordinator-owned until handed back.
6. Live evaluation targets and external prerequisites remain visible release gates. Missing cloud access does not block the ready local correctness slices or a subsequently specified local evaluation harness.

## Recorded changes and limits

Only this report and story readiness notes/status/change logs were changed. Story 10.19 and existing integration/application work were untouched. Ready is not Done; no QA result, release gate, migration or deployment was completed. Existing incomplete Epic 10 release stories were not silently closed or reinterpreted.

Final same-day readiness update: C0 persistence/gateway interfaces and on-disk V18 design now permit story10.24 implementation in parallel with foundation validation; its former strict-verdict-only limit is superseded. Pure planner/assembler code is independently implementable. [Uma UX](../architecture/studio-inference-ux.md) also resolves story10.25: the named frontend/MSW paths are assigned and v2 UI remains disabled pending server capability. These are dependency-aware implementation GOs, never claims that integration tests or live targets passed.
