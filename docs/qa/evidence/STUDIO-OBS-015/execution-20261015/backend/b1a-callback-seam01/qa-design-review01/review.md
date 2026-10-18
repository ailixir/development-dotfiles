# B1a design re-review (QA design adequacy, read-only)

Reviewer: Quinn (@qa), independent. Date 2026-10-15. Subject: Aria's B1a preparation `backend/b1a-callback-seam01/` (manifest sha256 `e72f94a493a1efccdec99daf9fed3f2a0882765ea04610075e5f63673580da13`, re-hashed and matching). Scope follows the saved intent `quinn015-b1a-design-review01-intent.txt`. The output directory is `qa-design-review01/` (the coordinator's instruction), not the intent's `qa-design-review/`.

**Verdict: READY_WITH_REQUIRED_CORRECTIONS.** The design's core claims hold against current source. Implementation should start only after the corrections C1 to C9 below are written into the implementation handoff. None of them needs a production change.

## What I did and did not do

- Read only. No Gradle, compiler, JVM, Node, pnpm, database, Docker, browser or git-mutating command was run. Nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/` or `.github/` was modified. A backend validation run (R1) was live during this review.
- Re-hashed all 21 inventory references in the design. 20 match. **`GuidedPublicationReplayIT.java` differs**: the design bound `a079ed21…`, and current is `f279684c…`, the four feedback05 fixture fixes. The source seams the design depends on are still present at f279, but line anchors moved (see C1).
- Every claim below that says "verified" was checked by reading the cited current line. Runtime reachability of each cut is **not** verified. It can only be shown by the future run.

## Claims verified against current source

| # | Design claim | Result | Current anchor |
|---|---|---|---|
| V1 | No step-complete HTTP route exists | Verified. Internal routes are claim, observations, admissions, advance, outcomes, bootstrap-evidence, lifecycle. Planning routes are plans, proposals, dependency-admissions, planning-context. | GuidedInternalController:31-106; GuidedPlanningController:29-66 |
| V2 | `/plans` is the legitimate prefix driver, not a SOURCE_PLAN refusal route | Verified. `plan()` takes the prefix branch and returns `advancePrefix`. A prefix session never enters `call(SOURCE_PLAN)` via `/plans`. | GuidedTranslationService:157-172, 332-490 |
| V3 | Production `completeStep` is reached only from ordinary `advance` → `complete` → `completeCurrent`. `advancePrefix` never calls it. | Verified | GuidedTranslationService:827-829, 2192-2235; no call in 332-490 |
| V4 | `completeStep` on a pending prefix keeps `REPLAYING_PREFIX`, checks state/step/actions/assertion and the installed StepVerifier, and leaves continuation untouched | Verified. Production access `GuidedProductionSessionAccess implements StepVerifier` delegates to `GuidedStepVerifier`, which joins plan obligations → association `admissionId` → action `requestDigest == hash(proposal)`. | GuidedSessionService:1377-1431; GuidedProductionSessionAccess:21,179-180; GuidedStepVerifier:17-52 |
| V5 | Prefix admissions create the joins StepVerifier needs | Verified. advancePrefix `reserveObligation` → `admit`, then `translation.attachAdmission`. | GuidedTranslationService:459-484; GuidedTranslationStore:1224-1319; GuidedSessionService:1357 |
| V6 | Step0 is navigation plus read; step1 consumes the binding | Verified in the PFXSYNC parent texts | ReplayIT:3580-3582 |
| V7 | Runner posts the outcome before the observation, so the post-navigation observation sees navigation SUCCEEDED | Verified | studio-runner/src/guided/runtime.ts:431-433, 484 |
| V8 | observe/admit/consume/outcomeV2 each commit their own new transaction outside callers, and keep `REPLAYING_PREFIX` while pending | Verified. consume requires no active transaction. admit is called outside `translationTransaction`. observeV2 is the outer transaction for the nested `observe`. outcomeV2 state: `incremental.pending ? REPLAYING_PREFIX`. | GuidedSessionService:1181, 2056, 2113-2124, 2231; GuidedTranslationService:484 |
| V9 | Test seam exists: primary `GuidedSessionRepository` with an overriding `TransactionTemplate`, and `repository.transaction` uses it | Verified | ReplayIT:1674-1772; GuidedSessionRepository:29-31 |
| V10 | SOURCE_PLAN fence: `/dependency-admissions` → `replan` → `learnSuffix` refuses `REVISION_CONFLICT` on pending before `call` | Verified. `!pending && bootstrapReady` short-circuits, and the throw is not routed through `stopRejected`, so it is non-destructive. | GuidedTranslationService:918-934, 974-979 |
| V11 | Direct `reserveModel` rejects pending first in its transition | Verified, after the role/key/lock/current/owner/duplicate/active/source checks in `internal` | GuidedSessionService:1438-1451, 2342-2380 |
| V12 | Direct `reserveAttempt` pending predicate is first, before argument validation and INSERT | Verified, **but the predicate is `prefix_pending OR delivery_pending`** (see C2) | GuidedTranslationStore:861-876 |
| V13 | Proposal path reaches `call(NEXT_ACTION)` only with an unfinished step, no ADMITTED/DISPATCHING recovery and an available target. The reservation refusal then hits `stopRejected` and can fail the parent terminally. | Verified. `recover` runs before; StepVerifier must be false; `acquireBeforeProposal` must be READY. `REVISION_CONFLICT` is in `stopRejected`'s terminal list → `failTranslation`. | GuidedTranslationService:786-835, 1341-1345, 1666-1699, 2146-2166, 2359-2441 |
| V14 | Gateway entry is wrapped by the existing diagnostics bean and delegates to the real qualifier | Verified | ReplayIT:1789-1814 |
| V15 | Do not call a bare gateway `propose` as a pending fence | Agreed. Transport has no session authority. | GenAiGuidedLlmGatewayClient (hash matches) |

I accept the design's two scope rulings. `/plans` is not used as a denied SOURCE_PLAN route, and no step-complete HTTP route is invented. The service-level `completeStep` positive matches ledger16's "complete" wording, because the service has an explicit pending-prefix branch at line 1425.

## Required corrections (before implementation)

**C1. Rebind to ReplayIT f279.** The design's ReplayIT anchors (1671, 1690, 1712, 1784, 1980, 3560, 4676) were taken at a079. The current seams are: RuntimeHooks 1674-1772, gateway diagnostics 1789-1814, translation poll 1649, PFXSYNC CSI isolation 3573-3577, `PrefixSyncParent` 3521, existing pending-context direct probes 4684-4688, `incrementalPendingSnapshot` 4822, `incrementalControllerProbe` 4845-4857, `SINGLETON_METHODS` 137, `INCREMENTAL_METHODS` 187. Dex must re-read f279 (or whatever is frozen after R1/FIX-R1) and must not apply a079-relative offsets.

**C2. Attribute the direct `reserveAttempt` refusal to the prefix fence.** `reserveAttempt` refuses when `studio_015_prefix_pending(id) OR studio_015_delivery_pending(id)`. `reserveModel` and `learnSuffix` use prefix-pending only (`GuidedIncrementalStore.pending`, :120-122). At the read-success cut a producer-metadata delivery can also be pending. ReplayIT:4686 already credits the delivery-pending refusal, and that is not ledger16. At each direct `reserveAttempt` probe:
- read both SQL predicates (read-only `SELECT`) and record them;
- at least one credited refusal must have prefix=true and delivery=false;
- otherwise report that cut as delivery-fence evidence only.

**C3. Disclose the CSI charge on the proposal path and assert its rollback.** In `call()`, `modelReservationFitsLocked` runs `csiBudget.charge` (upsert plus conditional UPDATE) in the same transaction before `reserveAttempt` (GuidedTranslationService:1290-1294 before 1310; GuidedSessionService:242-247; GuidedCsiBudget:85-100). The refusal therefore occurs before the attempt INSERT, `reserveModel` and the gateway, but **after** the CSI charge statement executed. The zero effect comes from rollback. The design text "refuses before … reservation" must say "no committed reservation". The test must assert that the per-case CSI token-day row (existence and both columns), session counters, `modelReservations`, model attempts, `COMMITTED_MODEL_BUDGET_WITNESSES`, `MODEL_CALL_JOINS`, `MODEL_WIRE` and provider requests are unchanged. Also, `store.acquire` on that path commits a write to the acquisition book (GuidedTranslationStore:478-481). That write is not "read-only". Exclude it from the equality snapshot by name, with this justification.

**C4. Fix the proposal-probe placement deterministically.** "Fresh sibling or final ordering" is not implementation-ready. The probe needs step0's read unperformed at the post-navigation observation cut. The admit, consume, read-success and completeStep checkpoints come later in the same step, so "last in the same parent at step0" is impossible. Choose one before implementation:
- (a) a second `PrefixSyncParent` inside the same singleton, run after all assertions on the first parent, with its own per-case CSI isolation and teardown; or
- (b) the same parent, last, at a later post-observation cut where unfinished-step, available-target and no-recovery are asserted in-test immediately before the call.

Either way, assert that the parent ends `FAILED` with errorCode `REVISION_CONFLICT`, and that `NAVIGATIONS`, `RECEIPTS`, `VALUES` and native events are unchanged by the probe.

**C5. Account for the live coordinator.** The primary context runs the real `GuidedTranslationCoordinator` at `poll-ms=100` (ReplayIT:1649; GuidedTranslationCoordinator:53-95), and it is the `/plans` caller. The design does not mention it. The holds are safe only because the coordinator's in-flight `/plans` is synchronously blocked. I infer from source that this blocking happens: `advancePrefix` → `dispatch` waits on the runner, and the runner waits for the outcome and observation ACKs, while `fixedDelay` scheduling does not overlap. This is not runtime-verified. Immediately before `/proposals`, the test must assert all of these:
- no read obligation association exists for step0;
- actions = [navigation SUCCEEDED, dispatchCount 1];
- no read preparation row exists.

The reason: an ADMITTED read would turn `/proposals` into `recover` → `admitAndDispatch`, which is a native effect caused by the probe. Each hold must also stay inside the runner callback and 65 s coordinator deadlines (no new timeout).

**C6. Exact companion refusal.** At the post-navigation cut, `completeStep` passes the `UNKNOWN_OUTCOME` gate (navigation alone is SUCCEEDED/1) and fails at StepVerifier with `RUNTIME_INCOMPATIBLE` (GuidedSessionService:1400-1419). Assert that exact code, plus unchanged `stepIndex`, state and `step-complete` command rows. The later positive on the same bean is what shows the refusal came from the verifier and not from a missing verifier.

**C7. Do not credit the parent after injection.** Production never calls `completeStep` during a prefix. After the test's call, `stepIndex` is 1 and a `step-complete` command row exists, a progression the production driver would not create. The handoff must state how that parent is drained (continued to boundary, or cancelled) and must give it **no credit** for any publication, replay, video or ledger subject other than B1a.

**C8. Gradle registration shape.** Do not append the method to the indexed `joinedIncrementalMethods` list. `requireFreshGuidedPartitions` builds the expected set from indices `[0]`, `[2]` and `[1]`-labels (build.gradle.kts:324-327), so an appended index 3 would be omitted and fail with "JOIN partition omission". Use a separate set and add it in four places: the include filter (:259), the default-lane exclude (:265), the expected union (:325), and ReplayIT `SINGLETON_METHODS`/`INCREMENTAL_METHODS`. next-batches B1a lists only ReplayIT as its exclusive write path, so root must extend the lease to `backend/build.gradle.kts`. Plan invariant 5 already requires this.

**C9. Select the observation cut by fact, not a literal generation.** Select it as "the first `observeV2` commit for this session after navigation SUCCEEDED with no read association". Do not hard-code `generation == 1`.

## Non-blocking notes

- The planning-context schema has no state enum (`docs/specs/.../v3/planning-context.schema.json`), so I found no static earlier refusal for a NEXT_ACTION projection in `REPLAYING_PREFIX`. Whether `buildPositiveContext`/assembler accept the prefix projection is a runtime fact. If an earlier guard fires, report it as OPEN, as the design already requires.
- The `safeFinalizeDiagnostics` resolver (ReplayIT:1816-1844) persists a diagnostic for failed planning routes. Keep it out of product zero-effect snapshots.
- The design's retained OPENs stay OPEN and are not closed by B1a: current-access plus fresh-producer cut, the exact ADMITTED-recovery matrix, item85, full gates.

## Minimum next lease (unchanged from the design apart from C8)

ReplayIT plus `backend/build.gradle.kts`, Dex-JOIN, after R1 is terminal and source is frozen. Add one low/2048 singleton, `incrementalPrefixCallbacksKeepStateAndFenceBothReservations` (disclosed addition B1A-CB-01, never a renamed original). The future identity count is 43 default + 43 low = 86. Selector: `guidedIncrementalTest --tests com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.incrementalPrefixCallbacksKeepStateAndFenceBothReservations`. No production, fixture, V21, schema, property or runner-dist change.

No formal story QA, release or lifecycle change. HOLD.
