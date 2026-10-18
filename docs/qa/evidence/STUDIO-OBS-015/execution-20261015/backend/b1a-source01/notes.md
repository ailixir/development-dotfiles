# B1a source 01: apply-ready patch for B1A-CB-01

Dex (@dev, JOIN). 2026-10-16. Test-only patch. Nothing under `backend/`, `frontend/`, `studio-runner/`,
`tools/`, `docs/specs/` or `.github/` was modified. No Gradle, JVM test run, database or runner ran.
This is not QA credit, and it is not a lifecycle change. HOLD.

## Files
| Path (repo-root) | Base sha256 | Patched sha256 |
|---|---|---|
| `backend/build.gradle.kts` | `1cc4cee0f683661eb5373738d00e30cbc53c3f4716ba3b008a33ec270bdbdef8` | `92bfae6d53140e172e1948bcf6e4f328e1b0b49b7fa497fed1ebf245dfcc5991` |
| `backend/src/test/java/.../publication/GuidedPublicationReplayIT.java` | `77f47e4148f732151cf9e9c05b712cce3643d62e57d1fad43c8ee25624b0203f` | `4242ac27020814fe57355116a06ef1271b4a0c2f247d2847ea3c28888ec55b33` |

- The ReplayIT base is the r1-diagnosis §7/8 final hash (`77f47e41…`). It is not Quinn's f279. All anchors
  below are identifiers (C1).
- Apply: `git apply -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/b1a-source01/b1a.patch`.
  This applies only when both base hashes still match.

## What the patch adds (ReplayIT)
1. **The name in both closed sets.** `SINGLETON_METHODS` and `INCREMENTAL_METHODS` each gain
   `incrementalPrefixCallbacksKeepStateAndFenceBothReservations` (C8).
2. **The seam (`RuntimeHooks.observedOriginalSessionRepository`).** There is one new first branch, taken only
   when `c5Capture == null`, `b1aCallbackCut != null` and no transaction is active. It runs the same
   `super.execute` with a wrapper that records `isNewTransaction && !isRollbackOnly`. After a real commit it
   calls `b1a.afterCommit(jdbc, result)`. Rollback, exceptions and nested REQUIRED calls get no checkpoint.
   The existing C5/P4 branches are byte-identical. With the cut disarmed, the behaviour is the original
   `super.execute(callback)`.
3. **`B1aCallbackCut`, inactive by default, value-free.**
   - It walks the stack for `GuidedSessionService` frames `observeV2`, `admitChecked`, `consume` and
     `outcomeV2`. For `consume`, only a `WonConsumption` counts.
   - It binds the session by fact: the session belongs to this test (`test_id`) and
     `studio_015_prefix_pending` is true.
   - It selects the phase from committed facts (C9; no generation literal):
     - `ADMIT`: step0 has only nav, ADMITTED.
     - `CONSUME`: step0 has only nav, DISPATCHING.
     - `NAVIGATION_SUCCESS`: step0 has only nav, SUCCEEDED/1.
     - `OBSERVATION`: the first observeV2 commit with only nav SUCCEEDED/1 and no read row.
     - `READ_SUCCESS`: nav and read both SUCCEEDED/1.
   - It copies IDs, hashes, states and counts with one autocommit `jdbc` read (`b1aStoredFacts`). There is
     no SQL lock, and a ThreadLocal stops re-entry.
   - It then holds the real caller outside every transaction. Each phase is held once. Test-thread calls are
     ignored. The capability, proposal and context are never copied.
4. **The method itself, `incrementalPrefixCallbacksKeepStateAndFenceBothReservations`.** It uses two parents
   and helpers: `B1aParent`, `b1aParent`, `b1aControls`, `b1aAwait`, `b1aRelease`,
   `b1aAssertReadUnperformed`, `b1aPredicates`, `b1aAccounting`, `b1aNativeEvents`, `b1aPlanningCommand`,
   `b1aFenceProbes` and `b1aRouteDiagnostic`.
   - **Parent 1.** All five cuts are held in order, ADMIT → CONSUME → NAVIGATION_SUCCESS → OBSERVATION →
     READ_SUCCESS. The fence suite runs at every cut. The completeStep companion runs at OBSERVATION and the
     completeStep positive at READ_SUCCESS. The parent is then cancelled while still held.
   - **Parent 2.** It is fresh, with its own CSI, and holds OBSERVATION only. It runs the destructive
     `/proposals` probe.

## Quinn C1–C9
| # | How it is met |
|---|---|
| C1 | Rebound to the current hash `77f47e41`. Inserted by identifier: after `prefixSyncCallback`, before `b1AssertTrustedCeilingStart`, and the first branch inside the RuntimeHooks `execute`. No a079/f279 offsets are used. |
| C2 | `b1aFenceProbes` records `studio_015_prefix_pending` and `studio_015_delivery_pending` before each cut's refusals, and re-asserts them unchanged afterwards. The proposal probe records them too. The final asserts are `allMatch(prefixPending)` and `anyMatch(credited)`, where credited means prefix=true and delivery=false. A cut whose delivery is true stays delivery-fence evidence only and is not credited. |
| C3 | `b1aAccounting` covers: the CSI token-day rows (existence and both columns), `counters`, `progress.modelReservations`, the session's model-attempt rows, the `model-reserve` command rows, `COMMITTED_MODEL_BUDGET_WITNESSES`, `MODEL_CALL_JOINS`, `MODEL_WIRE`, `MODEL_KINDS`, `PROVIDER_FAILURES`, `MODEL_RESPONSE_FACTS` and `LEGACY_MODEL_CALLS`. It must be equal before and after every probe. `progress.translationAcquisition` is excluded by name, with a javadoc reason. The test asserts "no committed reservation". It does not claim the CSI charge never executed. |
| C4 | Option **(a)**: a second parent inside the same singleton, with its own CSI isolation and teardown. The parent must end `FAILED` with `errorCode` `REVISION_CONFLICT`. `RECEIPTS`, `NAVIGATIONS`, `VALUES` and the session's `NATIVE_*` events must be unchanged both at probe return and after the drain. |
| C5 | Immediately before `/proposals`, on a fresh read, `b1aAssertReadUnperformed` checks three things: actions == [nav SUCCEEDED/1], exactly one step0 obligation (nav), and every preparation attached to nav. Separately: bootstrap is READY and the actual `GuidedStepVerifier` is false. Each hold asserts it was released within 12 s of entry. The hook's own latch bound is 13 s (see Risks). |
| C6 | At OBSERVATION, `completeStep` raises exactly `RUNTIME_INCOMPATIBLE`. The stored facts are then equal to the checkpoint (stepIndex 0, `step-complete` rows 0). The later positive runs on the same bean. |
| C7 | After the positive, the parent is cancelled while READ_SUCCESS is still held, then released and torn down. It must end `CANCELLED`, with 0 switches, 0 publications and 0 model attempts. It earns no other credit. |
| C8 | The Gradle registration is a separate set, `joinedAddedLowMethods`, used at the include filter, the default-lane exclude and the expected union. The name is also in the ReplayIT SINGLETON and INCREMENTAL sets. The indexed `joinedIncrementalMethods` list is not touched. |
| C9 | The OBSERVATION cut is the first observeV2 commit for this session where navigation is SUCCEEDED and no read row exists. There is no generation literal. Generation and evidenceHash must advance relative to NAVIGATION_SUCCESS, and the `observations` command count must go up by +1. |

## Assertion → ledger16 (`IncrementalSessionIT.prefixCallbacksNeverOpenModelReservation`)
| ledger16 clause | Assertion |
|---|---|
| observe keeps REPLAYING_PREFIX | `b1aAwait(OBSERVATION)` checks: state, continuation, prefixPending, bootstrap READY, stepIndex 0, switches 0, attempts 0. It also checks generation and evidenceHash advance and observation command +1. |
| admit keeps prefix, dispatchCount 0, sole admission with actual joins | `ADMIT` checks: nav ADMITTED/0. The obligation→admission and proposal_digest==requestDigest joins hold. The action's preparationId equals its attached preparation. operationHash is 64-hex. contextRevision and authoredInputsHash equal the live materialization. |
| consume (typed WonConsumption) | `CONSUME` checks: resultType `WonConsumption`, ledger DISPATCHING/1, stored DISPATCHING/1, and `v2-consume` rows == 1. |
| success (nav, read separately) | `NAVIGATION_SUCCESS`: nav SUCCEEDED/1. `READ_SUCCESS`: the read is SUCCEEDED/1, there is one producer joined to the read admission, materialization_revision is bumped, and both obligation joins hold. |
| complete | Positive `completeStep` at READ_SUCCESS: the returned state is REPLAYING_PREFIX, stepIndex goes 0→1, continuation stays REPLAYING_PREFIX, prefix is still pending, and `step-complete` rows == 1. The companion refusal is in C6. |
| SOURCE_PLAN fenced before model | `/dependency-admissions` at all 5 cuts returns 409 `REVISION_CONFLICT`. The diagnostic frame is `GuidedTranslationService#lambda$learnSuffix$` with no `checkCommand` frame. Accounting is unchanged. |
| proposal/model path fenced | `/proposals` (parent 2) returns 409 `REVISION_CONFLICT`. Its frames are `GuidedTranslationStore#reserveAttempt` and `GuidedTranslationService#lambda$call$`, and there is no `checkCommand` frame. The parent ends FAILED. Accounting, wire and witnesses are unchanged. |
| direct reservations fenced | At all 5 cuts, `reserveModel` raises `REVISION_CONFLICT`, and `reserveAttempt` for SOURCE_PLAN and NEXT_ACTION raises `REVISION_CONFLICT` with no row for the request id. The `pending` snapshot and accounting are unchanged. |
| valid controls (not malformed negatives) | `b1aControls` takes projectionHash, inputCeiling and outputCeiling from a real committed base attempt of the same kind. It asserts the hash is 64-hex, the input ceiling is >0 and the output ceiling is the declared 2048. The planRevision is read in the same locked transaction. |

## Registration pattern (proposed for B2/B3)
- **Low-lane singletons.** Append the name to `joinedAddedLowMethods` in `build.gradle.kts`. Do not create a
  per-batch set. That set is already wired into the three sites: the `guidedIncrementalTest` include, the
  `tasks.test` exclude and the `requireFreshGuidedPartitions` expected set. In ReplayIT, add the name to both
  `SINGLETON_METHODS` and `INCREMENTAL_METHODS`.
  - B2B-01 and the B3b/B3c five use this set.
  - This replaces the per-batch `joinedLowAdditionMethods` / `joinedB3Methods` sketches in
    b2ab §7.1 and b3abc §5.2. It is the single merged set that b3abc §5.2 already asks for.
- **Default-lane singletons.** Append the name to `joinedDefaultMethods`, and add it to `SINGLETON_METHODS`
  only. This is B2a's pattern and is unchanged.
- **Inventory after B1a.** 43 default + 43 low = 86 JOIN identities. B1A-CB-01 is disclosed as an addition
  and is not a renamed original.
- **Selector.** `guidedIncrementalTest --tests com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.incrementalPrefixCallbacksKeepStateAndFenceBothReservations`

## Verification actually run
- `git apply --check -p0 b1a.patch` against the live tree passed. Both files were checked. This check is
  read-only.
- The patch was applied to scratch copies of the two base files with `git apply -p0`. The resulting hashes
  equal the patched hashes in the table above.
- javac 21.0.10 (`-proc:none`) compiled both the base and the patched ReplayIT to scratch-only output dirs.
  Both compiled with 0 errors.
  - Classpath: `backend/build/classes/java/{main,test}`, `backend/build/resources/{main,test}`, and the
    newest-version jars in `~/.gradle/caches/modules-2`.
  - That classpath approximates the real one. It is **not** Gradle's resolved `testCompileClasspath`.
  - The main classes there postdate the relevant sources: GuidedSessionService.class is 23:08 and its
    source 23:07. javap confirmed the methods `admitChecked`, `observeV2`, `consume`, `outcomeV2`,
    `completeStep` and `reserveModel`, and the lambda families `lambda$learnSuffix$*` and `lambda$call$*`.
- google-java-format 1.22.0 was run on the two new blocks and on the edited `RuntimeHooks` class region. The
  output is stable under `--skip-reflowing-long-strings`, and no added Java line exceeds 100 columns. The
  whole file still fails `spotlessCheck` because of pre-existing lines (r1-diagnosis §3.2). The patch
  neither fixes nor adds to that.

## Not verified / OPEN (report, do not credit)
- **Runtime reachability of every cut is unverified.** It needs a source-frozen
  `guidedIncrementalTest --no-daemon` run. If an earlier guard fires, the method fails at the exact
  assertion and that cut is OPEN.
  - One case: `/proposals` reaches `request(...)`/`call` for a NEXT_ACTION projection in
    REPLAYING_PREFIX (Quinn's non-blocking note).
  - Another: the runner posts outcome, then observation, inside dispatch (V7).
- **The hook's 13 s latch bound** is an instrumentation safety, like PFXSYNC's 20 s gate, and not a product
  timeout. It sits under the 15 s callback transport deadline. On expiry it records `cut.failure` and returns
  the original result unchanged.
- **The cancel happens while READ_SUCCESS is held (C7).** That relies on the runner's stop path being
  independent of the held `/outcomes` response, as in PFXSYNC-03. This is inferred.
- **Retained OPENs are not closed by B1a.** They are: the current-access + fresh-producer cut, the exact
  ADMITTED-recovery matrix, item85, and the full gates. R1 open items E/G (r1-diagnosis §6.6/§7.1) still
  gate any joined run.

## Decisions
- [AUTO-DECISION] C4 (a) or (b) → (a) a second parent. Reason: (b) cannot make step0's read unperformed at
  any later cut, so it cannot be lawful.
- [AUTO-DECISION] Reuse or copy the PFXSYNC base setup → copy it into `b1aParent`. Reason: the five PFXSYNC
  methods and `prefixSyncParent` bytes stay untouched for review. `prefixSyncEdit`, `startLearning`,
  `p3AwaitTeardown`, `incrementalPendingSnapshot`, `incrementalControllerProbe` and the finalize diagnostics
  are reused.
- [AUTO-DECISION] The native mode is `{"mode":"b1a-callback","stepId":step0,"ordinal":0}`. The existing
  inert dispatch wrapper then logs `NATIVE_*` events for step0, which makes C4's native-event check
  non-vacuous. The mode is reset to `{}` in close.
- **IDS.** The seam is ADAPTED, extending the existing RuntimeHooks TransactionTemplate. These are REUSED:
  `incrementalPendingSnapshot`, `incrementalControllerProbe`, `prefixSyncEdit`, `persistFinalizeDiagnostic`
  files, `p3AwaitTeardown`, `assertDeclaredFixtureCeiling` and `throwTeardownFailures`. These are CREATED:
  `B1aCallbackCut`, `b1aStoredFacts`, `b1aAccounting`, `b1aRouteDiagnostic` and `B1aParent`. Nothing in the
  existing code captures post-commit service-frame facts or both pending predicates.
