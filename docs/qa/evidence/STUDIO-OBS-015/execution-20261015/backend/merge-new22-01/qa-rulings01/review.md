# merge-new22-01 QA rulings 01: B1C-03 planting, confirm-expire wait, H8 re-send, H7 binding

Quinn (@qa). 2026-10-16 UTC. Read-only on source. No Gradle, no test run. No commit.
These rulings release no QA credit and change no lifecycle. Input hashes are in `manifest.json`.

Evidence labels:
- **[V]** verified: I read the cited live code or document.
- **[I]** inferred: not measured or not run.

---

## R1. B1C-03 `incrementalFreshPostConsentGuardsDenyDangerousProposals`: the 3 refusals are INTENDED

### Ruling
**The `{DESTRUCTIVE_VERB:3}` refusals are the designed oracle, not a finding.** The failure is a registration gap in
the B1bcd design: it never accounted for the AC-4 tally. Plant the method, and pin the refusals exactly in the body.

### Basis
- **[V] Design.** `b1bcd-design01/design.md` §B1C-03 (lines 1407–1415):
  - three hostile parents (`Save all`, `Delete all`, `Archive all` with form-Enter) each expect POLICY_DENIED / DESTRUCTIVE_VERB;
  - "exactly one audit `GUIDED_ACTION_REFUSED` carrying `DESTRUCTIVE_VERB` for the session" per hostile parent;
  - the fourth parent (`Press Enter in Destination`) is **allowed**.
  - 3 hostile parents × 1 refusal = 3. The tally `{DESTRUCTIVE_VERB:3}` matches the design count exactly.
- **[V] The body passed.** `cancelFailedTestOwnedSessions` throws the tally failure only when `failedTest == null`
  (ReplayIT :2763); otherwise it is suppressed. The manifest reports the tally as the *first* failure, so every
  per-parent assertion passed, including `b1AuditRefusals(parent.id, "DESTRUCTIVE_VERB") == 1` (ReplayIT :10780).
- **[V] Same refusal class as precedent.** This is a governed-vocabulary guard refusal. po-qa014 a1 says every refusal
  must come from a test that plants it, listed by name. Declaring it complies with a1; it does not change the ruling.
- **Why this is not the H7 hazard.** B1C-03 is a single `@Test`, not a `@ParameterizedTest` (ReplayIT :10717–10718).
  Its display name does not start with `incremental joined `, so the tally keys it by the bare method name (:2748–2751).
  That name maps to exactly one JUnit invocation, so planting it cannot permit refusals in any other test.
  - The four parents are loop iterations inside that one invocation. The tally cannot key them separately.
  - So per-parent exactness must live in the body (below), not in the planted set.

### Required change (ReplayIT only; `GuardDecisionTally` unchanged; no production change)
1. **Planted set** in `cancelFailedTestOwnedSessions` becomes exactly these two entries:
   ```java
   java.util.Set.of(
       "incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser"
           + "[incremental joined policy-prefix]",
       "incrementalFreshPostConsentGuardsDenyDangerousProposals")
   ```
   - Update the comment. Today it says "Only the policy-prefix variant plants a guard refusal". It must name both and
     say that B1C-03 plants three DESTRUCTIVE_VERB refusals, pinned in its body.
   - No other method name is added.
2. **In-body exactness check.** Collect the three hostile `parent.id` values while the loop runs, and collect the
   allowed parent's id. After the loop ends (after every parent's try-with-resources has closed), scan
   `AUDIT_EVENTS.list.subList(tallyAuditStart, AUDIT_EVENTS.list.size())`. Parse the fields with exact `key=value`
   matching, as `assertPolicyPrefixPlantedRefusal` does. Do not use the substring matching of `b1AuditRefusals`.
   Then assert:
   - (a) there are exactly **3** `GUIDED_ACTION_REFUSED` events in the window;
   - (b) every one has `reasonCode` **equal to** `DESTRUCTIVE_VERB`;
   - (c) the multiset of their `sessionId` values equals the 3 hostile parent ids, **one each** (so `hasSize(3)` and
     `containsExactlyInAnyOrderElementsOf(hostileIds)`);
   - (d) no event has `sessionId` equal to the allowed parent's id.
   - Message: `"B1C-03 plants exactly one DESTRUCTIVE_VERB refusal per hostile parent"`.
   - You may generalize `assertPolicyPrefixPlantedRefusal` into one helper that takes the expected
     `sessionId → reasonCode` multiset. If you do, the policy-prefix call must keep its exact semantics
     (`{SIDE_EFFECT_DENIED:1}` on `mixed`).
3. **Keep** the existing per-parent assertion `b1AuditRefusals(parent.id, "DESTRUCTIVE_VERB") == 1`. It localizes a
   failure to the parent. The check in item 2 is the authoritative one.
4. **Optional, non-blocking.** Also bind `obligationKind`, which the event carries (`StudioActionAudit.KEYS` [V]).
   Expected: `click`, `click`, `press` for Save, Delete and Archive respectively **[I]**: the design says
   "Click … Save", "Click … Delete" and form-Enter. If you add it, verify the expected values in the run, and do not
   guess `targetRole`.

### What stays a finding
- A 4th refusal, any reason other than `DESTRUCTIVE_VERB`, or a refusal on the allowed parent fails the build. That is
  the point of item 2.
- Any refusal in any other new-22 method is still unplanted and still fails AC-4. This ruling plants nothing else.

---

## R2. confirm-expire bounded wait for teardown CONFIRMED: **ACK, with conditions**

### Ruling
A bounded wait inside the `confirm-expire` branch for the variant's own session to reach `teardownStatus CONFIRMED`
is a lawful test change. It does not weaken the guard. It adds a positive assertion of the H8 fix to the one variant
that exercises natural expiry.

### Basis
- **[V] The guard.** `verifyPreviousWorkerGenerationClosed` (ReplayIT :682–721) refuses a restart unless every prior
  assigned session is terminal with `CONFIRMED` teardown, recordings are settled, and no descendant processes are alive.
  The wait does not touch it.
- **[V] Today the variant returns without waiting.** It calls `GuidedSessionService.expire()` and a 409 `clarify`, then
  returns (ReplayIT :13622–13648). Teardown completion is left to whichever label comes next, so the next label's
  guard pays for this variant's close.
- **[V] H8 is in the live tree.** `GuidedSessionReaper.expire()` calls `redriveTeardowns` on every tick
  (`GuidedSessionReaper.java:28–31`). `GuidedSessionService.teardownAttempt` re-sends on UNKNOWN_OUTCOME (:2595–2606).
- **[V] The latency is real.** A 600 s idle close took 22.98 s (Aria's ruling H8.1). The guard window is 20 s.
  **[I]** The CI host is likely slower.

### Conditions (all required)
1. **New helper, scoped to this variant.** Add, for example, `incrementalAwaitExpiredTeardownConfirmed(String id)`
   with a **120 s** deadline, and call it only in the `confirm-expire` branch.
   - Place the call after the 409 `clarify` and before the shared `confirm-*` assertion block, so those assertions also
     observe the post-teardown state.
   - **Do not change** `p3AwaitTeardown`, whose 20 s bound has about 25 other callers. **Do not change**
     `verifyPreviousWorkerGenerationClosed`: not its 20 s window, its predicates, or its diagnostic.
2. **Read-only polling.** Poll only `progress.teardownStatus` for `id`, with a short read (the same lock/read as
   `p3AwaitTeardown` or a plain SELECT), every ≥ 30 ms. Hold no transaction across the sleep. Keep the
   `refreshFixtureCredentials()` cadence of 10 s used by the existing wait loop.
3. **CONFIRMED must come from production paths only.** These are the `afterCompletion` attempt with its 2 re-sends, and
   the scheduled `GuidedSessionReaper` re-drive.
   - The test must **not** call `redriveTeardowns`, `teardownAttempt`, `GuidedDispatchService.stop`, the stop sender, or
     `expire()` a second time.
   - It must not write SQL to `studio_guided_sessions` or alter the clock or `expires_at`.
4. **Fail, never pass through, on timeout.** When the deadline passes, throw an `AssertionError` that names H8 (for
   example `"H8: expired teardown not CONFIRMED within 120 s"`). Before throwing, write a value-free diagnostic with
   the session ordinal, state, teardownStatus, whether `teardownRequest` is present, and the elapsed ms. A timeout is an
   H8 product finding. It does not license raising the bound.
5. **Assert the H8 invariants at CONFIRMED.**
   - The state is still `EXPIRED`.
   - `progress.teardownRequest` is absent.
   - The step's action count is still 0 and the relearn switch count is still 0; the shared block already asserts both.
6. **Measure.** Record the elapsed time from T (`expiresAt`) to CONFIRMED, in ms, in the run evidence (value-free).
   Aria's H8.5 asks for this measurement. Report the value in the next run note.
7. **Scope of the wait.** It covers only this variant's own session and only the teardown predicate. Suppose the next
   label's guard then refuses because this session's recording has not settled (`executionEvidence` is present and the
   recording state is not terminal). The same helper may then also wait, within the same 120 s, for that session's
   recording row to reach `AVAILABLE`, `FAILED` or `UNAVAILABLE`. Nothing broader is allowed: no waiting on other
   sessions or executions, and no process-tree checks. Any of those needs a new ruling.

### Why 120 s
- The worst case for `afterCompletion` is 3 × 15 s = 45 s. After that, the reaper re-drives on a 10 s tick, with each
  attempt capped at 15 s plus 2 re-sends.
- 120 s covers roughly 5× the measured close plus at least one full sweep cycle. It is far inside the PT15M re-drive
  window.

---

## R3. H8 deviation: re-send of a fast non-200 stop refusal is **ACCEPTABLE**

### Ruling
For `stop`, a non-200 response is **not** a definite refusal in this codebase. It is correctly `UNKNOWN_OUTCOME`.
At most 2 immediate re-sends with the same deterministic key are acceptable product behavior. The test expectation of
3 sends in `actualStopOwnershipRecordsRealSenderRefusalWithoutConfirmation` is correct. No client change in OBS-015.

### Basis
- **[V] "Definite" has a precise, existing meaning.**
  - `GuidedRunnerClient.contextRefusal` (ar-2-r14-stops ruling 2) classifies a runner 409 as definite only when two
    things hold: the body validates against the closed `v3/bridge#/definitions/refusal`, and its code is deterministic
    (`IDENTITY_MISMATCH` or `SCHEMA`).
  - Everything else "stays UNKNOWN_OUTCOME with today's bounded retry".
  - For `stop`, the client does not even read a non-200 body: `BoundedResponse(context && 409, REFUSAL_LIMIT)`. So no
    stop refusal can be proven definite. "Non-200 with a response" is not enough.
- **[V] The status alone is ambiguous.** The relay 503 in this IT is the realistic case. An intermediary can give up
  while the runner is still in `closeResources`. Treating that as definite would be the "lost acknowledgement equals
  teardown known" error that bridge-design.md:73 forbids.
- **[V] A re-send is harmless.**
  - The key is `teardown-` + hash(body), so it is deterministic (H8.4.1, `GuidedDispatchStopKeyTest`), and the body is
    identical. The runner joins the same `closing` or replays it.
  - Stop is not an application effect, so at-most-once dispatch is untouched.
  - `CONFIRMED` still requires a validated 200 (identity echo or `STOPPED`).
- **[V] The difference is bounded.**
  - Definite in-band failures still end the attempt without a re-send. These are a 200 with an identity mismatch
    (`STALE_FENCE`) or a non-`STOPPED` status (`RUNTIME_INCOMPATIBLE`); both are non-UNKNOWN codes, which
    `teardownAttempt` swallows.
  - The sweep re-drives any `PENDING` row with a request inside the window anyway. So separating "refused" from "timed
    out" would save at most 2 calls per stop and would add no safety.

### Conditions
- The re-sends stay **immediate, at most 2, same key and same body**. No backoff loop and no further in-call retries.
- The IT must keep asserting all of these after the 3 sends: `confirmationCalls == 0`, the row `PENDING`, and
  `teardownRequest.reason == CANCELLED` retained (`assertUnconfirmedClosedMaterialization`, [V] in the patch).
- **Follow-up, not OBS-015.** A closed stop-refusal vocabulary (for example a validated `NOT_OWNER` that should not be
  re-sent) would be a bridge contract change. Raise it with @architect only if the WARN or re-send volume shows up in
  operations. There is no evidence of that today.

---

## R4. H7 binding to the session only: **ACCEPTABLE**

### Ruling
The session-only binding meets the qa-review01 H7 requirement: "if the audit event carries the session or coordinate,
also bind it". No change is required.

### Basis
- **[V]** `StudioActionAudit.KEYS` is a closed set with no `stepId`, ordinal or coordinate field. Adding one would
  change the production audit schema, which is out of scope for a test-registration fix.
- **[V] The step is pinned by other assertions in the same branch.**
  - `assertIncrementalTerminalRefusal` requires the state `FAILED`, `POLICY_DENIED` in the result, and **no ledger
    action at `INCREMENTAL_STEPS.get(4)`**. It also requires zero model attempts, receipts and switches, and one
    revision (ReplayIT :13373–13417).
  - The guard refusal makes the session terminal, so the session cannot make a second guard decision after it.
  - `hasSize(1)` over the invocation window excludes any other refusal.
  - Together these tie the single refusal to the step-4 decision. **[I]**: this is a logical tie, not a field binding.
- **Optional, non-blocking.** The event does carry `obligationKind` and `targetRole`. Asserting them against the
  step-4 proposal's kind and role would narrow the binding further at no cost. Do it only if the expected values are
  read from the fixture, not guessed.

---

## Decision
- **R1:** intended refusals. **NEEDS_WORK** (registration). The change in R1 is required before any credit for B1C-03.
- **R2:** **ACK** with conditions 1–7.
- **R3:** **ACCEPTABLE**, with the conditions above.
- **R4:** **ACCEPTABLE**. No change required.
- **Lane gate stays NEEDS_WORK.** Still open: 13 other new-22 failures, H6 (`assert-fail`), the class-level
  `executionError` in both lanes, and no run of `requireFreshGuidedPartitions` or the full lanes.

## What I ran
- Read the inputs listed in `manifest.json` and the live sources at the cited lines.
- **Not run:** Gradle, any test, Spotless, CodeRabbit (WSL-only), and SYNAPSE diagnostics. The last two are not
  applicable to this read-only ruling.
