# QA source review 02: r1-diagnosis01 section 6 window (STUDIO-OBS-015)

Reviewer: Quinn (@qa), independent. Date: 2026-10-15. This was a read-only static review. I ran no
Gradle, JVM, Node or test. I edited no source file. The only shell commands were `shasum`, `grep`,
`sed`, `awk`, `jq`, `diff` and `stat`. Reconstructions were written to my session scratchpad only.
This review gives no lifecycle or Done credit.

Subject: Dex `../review.md` section 6 (sha256 `ea90eccd…`) and `../manifest.json` (`cdb63154…`).
Specs checked against: my `../qa-source-review01/review.md` (`f115fb0f…`, F1/F4) and
`../../b1bcd-design01/qa-d1-review01/review.md` (`946cdaaa…`, D1 §1.5, F2 §2.3).

## Verdict: PASS_WITH_REQUIRED_CHANGES

All three production changes (ExecutionReferences single shape, D1 `verifyPrefixReceipt`, F2
predicate) are correct and match my specs exactly. Fix F (observer install order) is correct. But the
ReplayIT in this window carries an **undisclosed second edit** to a labelled variant's input, and two
test amendments that my D1/F2 spec made a precondition for R3 are not yet made.

## 1. Hashes (verified)

All 8 files match the coordinator's hashes and Dex's 6.4 "after" column. They also match the source
snapshot of run `backend-r1-order9-quinn-d1f2-attempt01` (both `-before.json` and `-after.json`), so
the run executed exactly this source.

| File | sha256 (current) |
|---|---|
| `dispatch/ExecutionReferences.java` | `75b6ec153d608bcd14e4b4a4b81c3983758673c462ec5b45ff686ecaf25d2912` |
| `guided/bridge/GuidedMaterializationService.java` | `ad8742a8426d757b198883be5fe089eae558e90e02d7b256340e24ac4dbf8fbe` |
| `guided/session/GuidedSessionService.java` | `055081ff6551de8eb640e589ffa8f5dd6d18876f64fd7264c1a1a6d432d1e3f8` |
| `dispatch/TypedReferenceAdapterTest.java` | `a3fcca289fdba201db0adb5d877f1bf4f3717b153cac2ffbd246644b83e4281c` |
| `studio/StudioExecutionFixtures.java` | `2a71a31845121f639c834b5990ae37a199896cdced42f355fd08cc006eda8c8f` |
| `guided/publication/GuidedPublicationReplayIT.java` | `84c3d496244991723520f270a6591b11a820edbbbeda48319fecc1ad5adbea96` |
| `guided/bridge/GuidedPrefixReceiptVerificationTest.java` (new) | `44a0759b6b0447c9a4c3a4458b9a35aa8f2f1239a7210bf3ce2c360cbfa5ea9c` |
| `guided/session/GuidedCommittedRefreshStateTest.java` (new) | `8cd157c4e0d4f6d990570b38d6bb6900361e79b5423a6edd0996a9edde49321a` |

## 2. How the window diff was established (verified)

- **GuidedSessionService.** An exact "before" copy exists in evidence
  (`low2048-accounting-fix01/source-after/GuidedSessionService.java` = `e3b1f3c0…`, Dex's before).
  `diff` shows exactly two hunks: the F2 predicate (2026→2026–2031) and `verify`→`verifyPrefixReceipt`
  (2260→2265). Nothing else changed. All later line numbers shift by +5; the other `verify` callers
  (now 1817, 1849, 2010, 2158, 2194, 2326), `verifyAndCapture` (2068) and `identity` are untouched.
- **GuidedMaterializationService.** No before copy exists. Deleting current lines 294–317 (the new
  javadoc and method) reproduces `d61340b7…` exactly (Dex's before). So the only change is the added
  method; `verify`, `verifyAndCapture`, `identity` and `context` are unchanged.
- **GuidedPublicationReplayIT.** No `9f54372c…` copy exists. Reverting fix F alone (drop the 2
  comment lines and swap back the two calls) gives `23722e05…`, **not** `9f54372c…`. Diffing against
  the evidence copy `feedback05-fixture-fixes-source01/source-after` (`f279684c…`, part-1 "before")
  shows one more hunk. Reverting that hunk too reproduces `9f54372c…` exactly. So the window diff is
  exactly two hunks: fix F and the hunk in §5 R1.
- **ExecutionReferences / TypedReferenceAdapterTest / StudioExecutionFixtures.** No before copies.
  I reviewed the current content in full against my F1/F4 spec.

## 3. Production review

### 3.1 `ExecutionReferences.declared`: PASS (F1 closed)
- The key loop rejects anything outside the 4-key `SHAPE`. The identity guard requires
  `authoringIdentityVersion` `isInt()` and `== 1`, plus `authoredDeclarations.isArray()`.
  `names()` requires `variables` and `secrets`. So exactly the 4-key set is accepted and all four keys
  are required. `{variables, secrets}` alone throws with the constant message "has no version-1
  authoring identity".
- The javadoc names the single V21 `studio_015_declarations` / `RevisionReferences` shape written by
  `GuidedPublicationRepository.commit`. The two-key text and the `ReferenceDeclarations` contract
  claim are gone. Every message is constant, and `JsonProcessingException` is still not chained.
- The callers (`StudioAcceptanceService:359`, `StudioScheduleService:212`, `StudioDispatcher:324,499`)
  are unchanged.

### 3.2 D1 `verifyPrefixReceipt`: PASS (matches §1.5)
- It runs `requireAcknowledged`, then `context(session)`, then `identity(context)` (which
  schema-validates the server identity, including `versions`). It then removes `versions` and adds
  `authoredInputsHash` and `prefixProgramHash`. Exactly 11 fields are bound, each giving 409
  STALE_FENCE on mismatch.
- The call site is at the specified position: after `active`, `owner`, `checkCurrent` and
  `checkSourceCurrent`, and before the `REPLAYING_PREFIX && pending` check. Error precedence for the
  other probe rows is unchanged.
- No contract or runner change. `bridge.schema.json` is still `039ad401…`, the same hash as my D1
  review.

### 3.3 "A server-side missing value never counts as a match": ACCEPTED (non-blocking note)
- **Correct and strictly narrower.** Without the guard, `ObjectNode.set(k, MissingNode)` stores
  `MissingNode`, and `MissingNode.equals(receipt.path(k))` is true when the receipt also lacks `k`.
  The guard closes that.
- **Not reachable on the validated path today (verified).**
  - The 9 identity fields cannot be missing, because `identity()` validates them against
    `v3/bridge#/definitions/identity` first.
  - `PreAdmissionDrift` and `AdmittedDrift` both **require** `authoredInputsHash` and
    `prefixProgramHash`. `PrefixDriftCallback` is validated at `GuidedSessionService:2249` before
    the guard runs.
  - So the only server-missing case is `prefixProgramHash` with no relearn plan. The receipt then
    carries a string, and the result is STALE_FENCE with or without the guard.
- Conclusion: there is no observable behaviour or precedence change; this is defence in depth. Dex's
  rationale ("MissingNode on both sides") holds only for an unvalidated caller. That is slightly
  overstated, but harmless.
- `authored_inputs_hash` NULL in the database would become `NullNode` (not missing). The schema
  requires a string in the receipt, so that is still a mismatch.

### 3.4 F2 `committedRefresh`: PASS (matches §2.3)
- The predicate is `state == (incremental.pending(id) ? "REPLAYING_PREFIX" : "PROPOSING")`. That is
  the writer's predicate at 1181 and 1883.
- The three other conjuncts and the `observation-refresh-result` lookup are byte-identical to the
  before copy.

## 4. Fix F (observer install order): PASS

- **Mechanism.** The S2 loop (ReplayIT ~14957–14976) records `[prototype, name, descriptor,
  wrapped]`. `s2Restore` (14911) requires the current value `=== wrapped`, otherwise `S2_DESCRIPTOR`.
  With i15 installed after p4, `start` and `dispatch` held i15 wrappers, so restore failed.
  - With i15 first, S2 is outermost. Restore reinstalls the captured descriptor, which is the i15
    wrapper, so i15 stays installed after restore.
  - The `options.callback` restore entry does not depend on prototype order: i15's drift-auth callback
    patch runs after `start` resolves in both orders.
- **TDZ / hoisting (verified by grep).** The i15 block (15565–15688) references `fs` (static
  `import fs`, 15538) and `RevRuntime` (static `import {GuidedRuntime as RevRuntime}`, 14719). Both are
  hoisted ESM imports. The block references **no** `rev*`, `s2*` or `p4*` binding.
  - i15's top-level `await import(i15CaptureRoot)` now runs before p4's top-level code. That is
    harmless: no runtime method is called before the final `await import(main)`.
- **Inert when inactive (verified by reading).**
  - **p4 wrappers.**
    - `start`: gated by `revMode()?.active && path===1`.
    - kind3 `dispatch`/`refreshObservation`: gated by `revRuntimes.get(this)?.c6===3`.
    - S2: `s2Mode()` is null unless `s2===true && active===false`, so the wrapper passes through.
    - `checkGrant` C5 recording: gated by `c5ValuesFile` existence (pre-existing).
  - **i15 wrappers.**
    - `start`: gated by mode `drift-auth*`.
    - `update`: `pfxRead()` returns null without the control file; `append-input` is mode-gated.
    - `preparePrefix`: `pfxCases` is empty, and the event is mode-gated.
    - `dispatch`: `selected` is false without `mode.stepId`.
  - **Caveat.** "Inert" means behaviour-preserving, not side-effect-free. i15's `dispatch` calls
    `i15Capture(original)` on every non-selected dispatch, which writes value-free capture rows to TEMP.
    This is pre-existing and unchanged by the reorder. The captured object is identical in both orders,
    because the kind3 and S2 wrappers return the inner `result` unchanged.

## 5. Required changes

**R1 (required, disclosure plus ruling). Undisclosed edit to the `config` variant input.**
- **The edit.** ReplayIT 3971–3972, inside `case "config"`, changes
  `put("timeoutSeconds", 31)` to `put("timeoutSeconds", 29)` and adds the comment *"within the
  runner's default step ceiling (30 s; observed jobs above it are LIMIT_EXCEEDED)"*.
- **Disclosure.** Section 6.1/6.4 describe the ReplayIT change only as "S2 order". The statement "No
  assertion, budget, identity (85) or label (35) changed" omits it. `config` is one of the 35 labels,
  and this is its edit input.
- **Static inference (not executed).** `revision.schema.json` allows `timeoutSeconds` 1–120. The
  runner clamps it (`run/deadline.ts:172 effectiveStepTimeoutMs` → `maxStepTimeoutMs`, 30 s per
  `server/config.ts:146`), then demands `stepTimeoutMs === timeoutSeconds*1000`
  (`validator/observedReplay.ts:465`, `INVALID_CONTRACT`). So a contract-valid authored timeout
  above 30 s looks unrunnable. That is a production or contract question, and moving the fixture
  under the ceiling hides it.
- **Run evidence.** The run `attempt01` already used 29 (its source snapshot is `84c3d496…`), and
  `config` still failed with a 400 DEFINITE_REFUSAL (open item G). So this edit did not resolve G.
- **Required.**
  - Disclose the edit in 6.4 and the manifest, and correct the invariant sentence.
  - Then either revert to 31 and treat the clamp-versus-equality behaviour as a production finding
    within G, or get an explicit @po/@architect ruling that authored `timeoutSeconds > 30` is out of
    policy. In that case, publication or authoring must refuse it, and the 29 stays with that ruling
    cited.

**R2 (required, from my F2 spec). ReplayIT 3451–3458 still tolerates the F2 defect.**
- The PFXSYNC `evidence` race wraps `GuidedDispatchService.observe` in
  `catch (GuidedSessionException) { assertThat(...).isEqualTo("STALE_GENERATION"); }`, with the
  comment "Existing committedRefresh expects PROPOSING…".
- After F2 that tolerance can mask an F2 regression. Remove the catch so that `observe` must
  complete without exception, and delete the stale comment.
- The B1B-05 REFRESH row amendment (§2.3 of the spec: 200, zero `committedRefresh`
  STALE_GENERATION) is also still to be done.

**R3 (required before R3 gate, from my D1 spec §1.5 "Test consequence"). Drift probe rows are still vacuous.**
- `assertActualDriftCallbackAuthorityThenRelease` (4557, row assert at 4585) still asserts
  `isIn(403, 409, 422)`.
- Pin `409 STALE_FENCE` for `scopeHash`, `authoredInputsHash`, `contextRevision`, `workerId`,
  `prefixProgramHash` and `sourceRevision`.
- Pin the first observed code for the trigger-only fields `requestDigest`, `operationHash` and
  `evidenceHash`.
- This may land after G unblocks the drift variants, but it must land before any R3 credit.

## 6. Non-blocking observations
- `StudioExecutionFixtures:97`. The `NO_REFERENCES` javadoc still says "The reference declaration of
  a revision". It is a publisher input, like `references(...)` (whose javadoc is now correct).
- `GuidedCommittedRefreshStateTest` reaches the private `committedRefresh` by reflection. That is
  brittle under a rename, but acceptable. `(Exception) wrapped.getCause()` would throw a
  ClassCastException on an `Error` cause.
- `GuidedPrefixReceiptVerificationTest` proves the lower bound (each of the 11 bound fields, both
  mismatched and absent) and the upper bound within its stub (`versions` and receipt-only fields are
  unbound). Its `aSessionWithoutAPrefixProgramNeverMatches` case exercises only the unvalidated
  double-missing path (see §3.3).
- Run evidence (verified from the JUnit XML of `attempt01/test`): TypedReferenceAdapterTest 9/0/0,
  GuidedPrefixReceiptVerificationTest 3/0/0, GuidedCommittedRefreshStateTest 3/0/0. D1 and F2 have no
  joined proof: the 9 drift variants never ran (blocked by G). My D1 "sufficiency caveat" stands.
- Items E and G are outside this review.

## 7. Skipped
- No Gradle or test execution, per instruction. CodeRabbit not run (it requires WSL; this host is
  darwin). SYNAPSE diagnostics not run (outside the mission).
