# QA review 01 of the Dex-FIX R2 diagnosis window (`r2-diagnosis01`) and the default-lane `fix.patch`

Reviewer: Quinn (@qa), independent. 2026-10-16 (07:46Z). Read-only on source. No Gradle, no runtime, no git write.
This review gives no QA credit to any run and changes no story lifecycle.

## 0. What I reviewed, and how
- **ReplayIT was reviewed from the saved bytes, not the live file.**
  - I rebuilt the ReplayIT final from the scratch before-copy `4242ac27…` plus `replayit-4242ac27-to-final.diff`. Result: **`9d13eeb7…`**, which matches the manifest.
  - `fix.patch` (`42d7e8ba…`) applied to `4242ac27…` gives **`25f12ca2…`**, which also matches. So the patch went in unchanged.
  - The live ReplayIT now hashes `daa97aee…`. Another developer is already editing it. Nothing below is about those bytes.
- **The repository and fixture rebuilds match the recorded hashes.**
  - Repository: before `8aa40c60…` + `evidence-repository-h3.diff` gives `ffb8ffd4…`. That is also the live hash.
  - Fixture: before `417e605d…` + `legacyv20-fixture-h10.diff` gives `ae407fef…`. That is also the live hash.
- **Production code I read live:**
  - `GuidedPlanBuilder` `23f102d7…`. Its hash matches the one review.md records for R2.
  - `GuidedBasisValidator`, `GuidedIncrementalStore`, `GuidedSourceClassifier` (and the same rule at HEAD), `StudioDispatchLedgerStatements` (and the same rule at HEAD), `RunningReaper`, `GuidedActionGuard`, `GuardDecisionTally`, and `GuidedProposalValidator` `2411f9ac…`.
- **Rulings I read:** `t0-architect-rulings.json` ruling2, `final-design/architect/acceptance-delta.json`, and `po-qa014-rulings.json` a1.
- **Run counts are Dex's.** I did not re-run anything. Per run: attempt03 is 115 total / 92 pass / 23 fail, and the focused legacy run is 4 / 3 / 1.

## 1. H3 production fix (GuidedPublicationEvidenceRepository.read) — **ACCEPT (APPROVED)**

**The defect is real.** I confirmed it by reading the code.
- `read` reduces `observations` to the hashes needed by SUCCEEDED action associations and question proofs (lines 638-666). After that it adds nothing else.
- Two consumers still need the observation that each prefix request was issued against:
  - `GuidedPlanBuilder.derive` 471-491 looks for it in `raw.observations`. If it is missing, the request must equal `bootstrap.initialEvidence`, otherwise line 489 refuses with `EVIDENCE_MISMATCH 422`.
  - `GuidedBasisValidator.validatePrefix` 215-226 requires `generation >= 0` and marks the observation used. Line 84 then requires `used == observations.keySet()`.
- A drifted request has no SUCCEEDED action, so its observation is filtered out and finalize refuses.
- `GuidedIncrementalStore.evidence` 414-435 matches the same request against the full session table without throwing. So the row exists and only `read` dropped it.

**The fix is minimal and correct.**
- It adds one loop, placed before the used-filter. For each request in `incrementalEvidence.prefixRequests`, it adds the session observation whose `observedDocument` execution evidence hashes to the request's `evidenceHash`. The hashed fields are `{kind, sessionId=id, contextId, documentId, generation, origin, observationHash}`.
- This is the same correlation used in the store, the builder and the validator.
- `List` is already imported, and Dex's compile exited 0.

**It does not widen what evidence is admitted.**
- *Source.* Candidates are only rows of `studio_guided_publication_observations WHERE session_id=id`, so nothing foreign is in the pool.
- *Binding.* An observation is admitted only if one of this session's persisted prefix requests commits to it by hash. That hash covers the session id, the context and the exact `observationHash`. Nothing is admitted on a partial or loose match.
- *Authority.* The authority checks are untouched:
  - `validatePrefix` still checks every request field against the versioned context (worker, fence, context, revision, inputs, scope, source/config revision, program hash) and the ordering.
  - The drift receipt must still match its request field by field.
  - `used == observations` stays strict.
- *No-op elsewhere.* For any session that finalized before this change, `validatePrefix` already required every request's observation to be in the basis. So the addition changes nothing there and only unblocks the drift path. That matches the R2 result: only drift2 and admitted-drift2 moved.
- *Stale or forged rows.* No stale observation can enter without a request that committed to it. A forged request row would still have to pass `validatePrefix`.

**Follow-ups. These are not blockers.**
- (MEDIUM) Add a focused negative regression next to the joined drift2/admitted-drift2 cases. Suggested home: an AuthorityIT-style test where a prefix request's `evidenceHash` names no observation. It must still refuse 422, with the store refusing first.
- (LOW) The block comment at 638-639 ("only … successful actions or their question proof") is now incomplete. It should name the prefix-request binding.
- (LOW) The same observedDocument correlation is now copied in four places (store, repository, builder, validator). It is a candidate for one shared function.

## 2. Test-expectation and harness changes

| Item | Verdict | Basis |
|---|---|---|
| **H1** per-case `CSI-INC-<n>` | **ACCEPT** | Same isolation pattern as the PFX (3909), B1A (4514) and P3 (12317) cases. It shares the same `p3CsiOrdinal`, and the class is PER_CLASS, so names never repeat. The budget (OBS-014 AC-8) is not relaxed. On failure, `@AfterEach` restores CSI-123 in its `finally`, after the failed-session cleanup runs as the case's CSI owner. The BeforeEach unrestored-CSI guard is unchanged. No `CSI-123` literal remains in `incrementalJoinedCase`. |
| **H2** `plans.state` inside `sessions.transaction` | **ACCEPT** | A test-side read moved to the existing transactional pattern. The probe's own assertions (409, unchanged pending snapshot) are untouched. |
| **H4** tail7 snapshot hash `isEqualTo(base)` at `index == boundary` | **ACCEPT** | T0 ruling2 defines `snapshotHash_stored` = `snapshot_i = SHA-256(canonical{studio.step-snapshot, v1, stepId, inputChain_i, learnedStepHash_i})`. Ruling2 `k` says pure tail deletion ⇒ k = the draft's last step. Ruling2 `whyThisShape` says "'Re-learned, not reused' is the absence of reusedFrom, never a forced hash difference". With the step id, chain and learned content unchanged, equality is what the rule requires. The `reusedFrom.has(stepId) == false` assertion for every index ≥ boundary is still unconditional (recon 5239), so "relearned" is still proven. The same equality form is already used by `before4at2`. Only tail7 at the boundary changes; every other variant keeps `isNotEqualTo`. Caveat (LOW): exact equality assumes the scripted model replies deterministically. That assumption is the fixture's, and Dex saw the same hash in 2 independent runs. |
| **H5** empty draft `409 RUNTIME_INCOMPATIBLE` | **ACCEPT. Not a product defect.** | 422 is not a spec requirement. The acceptance-delta row `IncrementalStartIT.deleteAllRefusesWithoutAnyWrite` says "Empty draft POST start**409/422 existing**…". T0 ruling2 `k` says "an empty draft cannot be learned (**existing rule**)". The existing rule is `GuidedSourceClassifier.classify` `steps.isEmpty() → RUNTIME_INCOMPATIBLE 409`, the same at HEAD. Asking for `INVALID_CONTRACT` would have invented a refusal. All zero-write, zero-model, zero-navigation and zero-effect assertions are kept. Note for @architect/OBS-008 (not 015): RUNTIME_INCOMPATIBLE carries no messageCode that tells "empty draft" apart from "unsupported authoring". |
| **H9** restart guard accepts `ERROR` + `STALE` + `video_status IS NULL` | **ACCEPT** | Checked against the product code. `closeByReaper` sets the ledger to `DONE`, the execution to `ERROR`/code, and never sets `video_status`. `findEvidenceUnsettled` selects only `l.state='FINALIZING'`. Both are the same at HEAD, so this is a permanent terminal state, not an open item. The predicate still requires ledger `DONE`, and the live-descendant and session/recording checks are unchanged. It is narrow: START_TIMEOUT and CANCELLED reaper closes are not exempt. If they ever reach the guard they will refuse loudly, which is acceptable. Observation for @architect (pre-existing, not 015): reaper-closed executions never get a video status (they are not UNAVAILABLE). |
| **H10** jsonb `?` → `??` | **ACCEPT** | pgjdbc's escape for a literal `?` in a prepared statement. Same SQL semantics, one bind. The fixture passes in the focused run. |
| **fix.patch A** validator line pin 363 → 381 (3 sites) | **ACCEPT** | Live `GuidedProposalValidator` `2411f9ac…`: line 381 is the `require(` of the `passwordControls == 1` POLICY_DENIED 422 predicate. The R2 diagnostics recorded 381. The full oracle (frame, POLICY_DENIED, 422, rollback, count) is kept. (LOW) The pin will break again on any line shift above it. |
| **fix.patch B** `p8KillRefusedWhileAlive` zombie path | **ACCEPT** | No signal is ever sent without verified identity. An unverifiable process is treated as "not refused" only if it is not alive or `ps` shows X/Z. That is the same rule as `p6KillOwnedTree`. Otherwise the original failure is rethrown, and release is still proven by `p6AwaitProcesses`. A zombie keeps its PID, so there is no PID-reuse risk. |
| **fix.patch C** single `parent()` read per hop + `ownedCommandHash(String)` | **ACCEPT** | Removes the TOCTOU. An unlinked walk is still refused at signal time by the ancestry assertion. |
| **fix.patch F2** drop the `baseRevisionId`/`revisionId` strings from the p3 evidence | **ACCEPT** | `requireNumericBudgetEvidence` admits only numbers and booleans. The base → merged relation is still asserted in the body (recon `reusedFrom…revisionId == base.revision()`). The evidence file has no consumer. No assertion was removed. |
| H8 diagnostic writer | ACCEPT (no oracle change) | Value-free, swallows its own failure, and the guard's refusal is unchanged. |

## 3. H7 policy-prefix guard tally — the refusal is the variant's oracle; register it per invocation

**What the refusal means.**
- This refusal is not a new symptom.
- The variant sets the governed `sideEffectStance` to DENY. Under T0 ruling3, the single frozen governed policy authorises the prefix replay. The prefix side-effect step (`INCREMENTAL_STEPS.get(4)`, inside boundary 5) is therefore refused by `GuidedActionGuard` with `SIDE_EFFECT_DENIED`.
- The body pins the consequences: session FAILED, result contains `POLICY_DENIED`, no ledger action for that step, zero model calls and attempts, no switch, no new revision.
- This is the same refusal class that `GuidedPlanningIntegrationTest.PLANTED_GUARD_REFUSALS` already plants for governed deny.
- po-qa014 a1: "Every refusal (… SIDE_EFFECT_DENIED) must come from a test that plants it, listed by name." Declaring it complies with a1. It is not a change to the ruling.

**Rejected mechanism.** Do NOT add the method name `incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser` to the planted set. `GuardDecisionTally.record` keys on the name it is given, and all 35 variants share that method. It would silently permit refusals in the other 34 variants.

**Required mechanism (ReplayIT only; `GuardDecisionTally` unchanged):**
1. In `cancelFailedTestOwnedSessions`, build the tally name per invocation: `method + "[" + testInfo.getDisplayName() + "]"` when the display name starts with `incremental joined ` (`@ParameterizedTest(name = "incremental joined {0}")`), otherwise the method name. Pass it as `testName`.
   - The S4 tally file then lists every variant by name, as a1 asks.
2. Use the planted set `Set.of("incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser[incremental joined policy-prefix]")`, and replace the comment "this class plants no guard refusal".
3. `record` only checks "zero refusals, or the test is planted". Add an exactness check in the policy-prefix branch, after `assertIncrementalTerminalRefusal`. Over `AUDIT_EVENTS.list.subList(tallyAuditStart, …)`, require exactly one `GUIDED_ACTION_REFUSED`, and require its `reasonCode=SIDE_EFFECT_DENIED`. If the audit event carries the session or coordinate, also bind it to `mixed` and `INCREMENTAL_STEPS.get(4)`.
   - Net effect: the planted refusal is pinned to exactly `{SIDE_EFFECT_DENIED:1}` on the intended step. Any other refusal in this or any other variant still fails AC-4.

QA owns AC-4 verification (a3), and this is the QA ruling. Notifying @po is courtesy only and does not block.

## 4. Overall decision: **NEEDS_WORK** for the lane. The reviewed changes themselves are APPROVED.
- **APPROVED:**
  - H3 (production);
  - ACK for H1, H2, H4, H5, H9, H10 and fix.patch A/B/C/F2.
- **Still open, and blocking any lane credit:**
  - H7: the mechanism above is not yet applied.
  - H6: runner `containsText`/`read` text extraction, for Aria / the runner owner.
  - H8: expiry teardown never confirmed, for Aria. The 17 labels behind it have never run their bodies.
  - `executionError` in both lanes.
- **Verification gap.** No full-lane run has used the final fixture `ae407fef…` together with ReplayIT `9d13eeb7…`. attempt03 compiled the pre-H10 fixture, which Dex disclosed. The live ReplayIT has since moved to `daa97aee…`, so the next credited run must name its own bytes.
