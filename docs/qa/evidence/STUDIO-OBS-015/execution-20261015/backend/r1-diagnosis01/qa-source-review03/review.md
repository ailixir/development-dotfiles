# QA source review 03: r1-diagnosis01 sections 7–8 window (STUDIO-OBS-015)

Reviewer: Quinn (@qa), independent. Date: 2026-10-16 UTC. This was a read-only static review. I ran no
Gradle, JVM, Node or test. I edited no source file. The only commands I ran were `shasum`, `diff`, `grep`,
`sed`, `awk`, `jq`, `git apply --check -p0` (read-only) and one `git apply -p0` against a **scratchpad
copy** of AuthorityIT. I also ran a Python string-replace that rebuilt a "before" copy in the scratchpad.
This review gives no lifecycle, Done or R1/R3 credit.

Subject: Dex `../review.md` §7–8 (`706cf973…`) and `../manifest.json` (`66e7649b…`, part3).
Specs: Aria `../aria-e-ruling01/ruling.md` (`481db58a…`) and my `../qa-source-review02/review.md`
(`cf2b8809…`, R1–R3).

## Verdict: PASS

- E-1 (a/b/c) and E-2 match Aria's spec text exactly.
- E-2 preserves the verdict. It never skips validation for an absent, unequal or unvalidated basis.
- R2 is applied, and `config` is back at the frozen 31.
- The R3 pins agree with production code (by reading; the rows have not been executed).
- The only ReplayIT deltas are the disclosed ones. 85 identities / 35 labels are unchanged.

There are no required changes. Carry-forwards are listed in §8.

## 1. Hashes (verified with `shasum -a 256`)

All 7 files match Dex's "after" column and part3 of the manifest. They also match the source snapshots of
`backend-r1-e2-authority-attempt01` (before and after). `backend-r1-e12-g-window-attempt01` matches for 6 of 7.
Its AuthorityIT was `aa613cef…`, the pre-fix version, which Dex disclosed.

| File | current sha256 | Dex after |
|---|---|---|
| `resources/application.yml` | `2c781928…91e7` | match |
| `publication/GuidedPlanBuilder.java` | `23f102d7…a0da52` | match |
| `publication/GuidedPlanPublisher.java` | `42031c66…a6ca70` | match |
| `publication/GuidedPublicationRepository.java` | `a6895c62…2c2368` | match |
| `GuidedPublicationReplayIT.java` | `77f47e41…b0203f` | match |
| `GuidedPublicationAuthorityIT.java` | `84ada478…3a4a` | match |
| `config/logging/SchemaValidatorLogCapTest.java` (new) | `24271b88…40ac` | match |

- `backend/build.gradle.kts` is `1cc4cee0…`. That is the same value in the order9-d1f2 snapshot and in both
  window run snapshots, so this window did not change it.
- `GuidedSessionService` (`055081ff…`) and `GuidedMaterializationService` (`ad8742a8…`) are unchanged since review02.
- Result files `17cffcb0…` (e12) and `b52f016e…` (e2-authority) match the manifest. Their counts match too:
  139/104/35 and 25/25/0.

## 2. How the window diff was established (verified)

| File | "Before" source | Diff result |
|---|---|---|
| application.yml | `d34f9134…` copy (b14 scratch `s3base`) | one 5-line insertion after `io.grpc: WARN` |
| GuidedPlanBuilder | evidence `raw-input-consistency-source01/source-after` = `92899488…` | `basis` split into `derive` + validate, new `basisMatching`, constant; line 477 validate moved out of `derive` |
| GuidedPlanPublisher | `c9a36bac…` copy (b14 scratch) | exactly two call sites, `basis`→`basisMatching`, plus two comment lines |
| GuidedPublicationRepository | no copy exists. Reverting the single E-2 hunk in my scratchpad reproduces `28aafe98…` exactly | exactly one hunk (lines 236–239) |
| ReplayIT | my review02 reconstruction `9f54372c…` | exactly 5 hunks: R2 (3451), R3 (4579–4583), fix F (15552–15555, already reviewed in review02 §4), E-1b ×2 (18006, 18349) |
| AuthorityIT | evidence `b3a-private-authority-source01/source-after` = `e6228117…` | pure 36-line insertion (new method); nothing else changed |

## 3. E-1: PASS

- **E-1a.** `logging.level.com.networknt: WARN` is placed with the ruling's exact comment, after `io.grpc: WARN`.
  - No `application-*.yml` and no test resource sets `com.networknt`.
- **E-1b.** Both assertions are as specified.
  - In `armTrace`: after `appLogger` TRACE and before `traceArmed = true`.
  - In collection: after the `traceArmed && rootTraceObserved && appTraceObserved` assertion.
  - C-5 never sets, saves or restores `com.networknt`. Its only other references (826, 17645) were already
    present and are unchanged.
- **E-1c.** `SchemaValidatorLogCapTest` follows the spec's three tests.
  - Levels and the appender are restored in `finally`.
  - Profiles are checked with `name.equals(...) || startsWith("logging.level.com.networknt.")`. That is
    correct: it does not wrongly match a sibling logger such as `com.networkntX`.
  - The build configures no JUnit parallel execution, so the global logger mutation is safe.
- **Run evidence (verified from the results JSON).** e12 shows SchemaValidatorLogCapTest 3/3, and Order 9
  `actualSecretLogin…` PASS.

## 4. E-2: PASS (behaviour-preserving)

**Builder.**
- `basis()` = `derive()` + `contracts.validate(VALIDATION_BASIS, result)`. The error and its position are the
  same as before, and `bounded` is still inside `derive`.
- `basisMatching()` skips validation only when `validated != null && result.equals(validated)`.
- `plan()` is untouched (its validate is now at 1020).
- No instance state was added; the only new field is a static final constant. The witness is a per-call
  argument, so there is no cross-request cache and no thread-safety exposure.

**Equality semantics.**
- Jackson `ObjectNode.equals` is deep and type-sensitive for numbers (IntNode≠LongNode; DecimalNode compares
  scale).
- `GuidedContracts.validate` = `canonical(value)` + networknt `valid(value)`. Both are pure functions of the
  node tree, and both are insensitive to object field order.
- So an equal document gets the same verdict, and returns or throws the same as `basis()`.

**Witness provenance and aliasing (verified by reading):**
1. *Publisher `prepare`.* The witness is `lowering.input().basis()`.
   - It is the `ownLoweringInput` deep copy of a `basis()` result that was validated before the lock at
     `prepareLoweringInput`.
   - `LoweringPreparation` / `LoweringInput` are **private records**, built only in `prepareLowering` in the
     same `finalizeForUser` call, and gated by `owner() == this`.
   - The input basis is never mutated: lowering uses `input.basis().deepCopy()`, and `preparedOrOriginal`
     only compares it.
   - If pre-lock validation fails, `prepareLowering` returns null, so the witness is null and the in-lock
     code revalidates with today's error.
2. *Publisher commit transaction.* The witness is `prepared.snapshot().basis()`.
   - `Snapshot` deep-copies on construction (`bounded`→`copy`) and on every accessor, so the witness is a
     fresh copy of an encapsulated document.
   - That document was validated in `prepare`, either directly or by equality to (1).
   - `Prepared` is built only at `prepare` (:493/:500). It is never reconstructed from stored or wire data.
   - Even in a hypothetical in-place mutation by `lowerer.lower(basis, …)` (I found no such mutation), the
     same transaction's `publications.commit` → `verifyCandidate` validates the snapshot basis before any
     write.
3. *Repository `commit`.* The witness is `commit.snapshot().basis()`.
   - `verifyCandidate` (227) runs unconditionally first, and it is not inside a try/catch.
   - It runs `lower(snapshot.basis()) → plan() → validate(ValidationBasis)` at plan's entry, on an
     unmutated copy of the same encapsulated document.
   - So the witness was validated in this transaction regardless of who built the `Commit`, including
     B3a-style forged snapshots.
   - The constraint comment ("if verifyCandidate ever moves after this line, the witness must become null")
     is present.
   - `currentBasis.equals(basis) && basisHash` (240–241) is unchanged.

**Errors unchanged, and no other behavioural change.**
- An absent or unequal witness revalidates with the identical exception at the identical point.
- An equal witness skips only a check that cannot fail.
- No other production line changed (§2).

**Test.**
- `lockedRederivationRevalidatesOnlyWhenTheDerivedBasisDiffers` follows the spec: a spy with counts
  1 → 1 (equal) → 2 (null) → 3 (unequal); it reuses `GuidedPublicationRaceTest.prepared`, and rolls back.
- It PASSED in `backend-r1-e2-authority-attempt01` (verified: 25/25, exit 0, method listed PASS).
- Limitation: it proves builder semantics only. No test counts the in-lock validations per finalize at the
  three call sites (see §8).

## 5. R2: PASS. `config` revert: PASS

- **R2.** ReplayIT 3451–3453: the `try/catch (GuidedSessionException)` that tolerated `STALE_GENERATION`
  is removed, and so is the stale comment. `observe` must now complete.
  - `GuidedSessionException` is still imported and still used elsewhere.
  - Verified PASS in e12 and g-quinn02 (results JSON).
- **Revert.** ReplayIT 3966 is `put("timeoutSeconds", 31)`, the frozen value. There is no hunk at the
  `config` case relative to `9f54372c…`.
  - The 29 is gone. The 29-value run is correctly marked `creditable: false` and disclosed in §7.1 and the
    manifest.
  - That closes review02 R1's disclosure requirement. G itself stays OPEN for a design ruling.

## 6. R3 pins vs production: CONSISTENT (static; not executed)

Path: `POST /internal/v2/.../outcomes` → `GuidedInternalController.outcomes` → `outcomeV2` →
`prefixDrift` (GuidedSessionService 2246).

- **Schema.** `PrefixDriftCallback`/`DriftReceipt` accepts every forged value:
  - `0`×64 matches `^[a-f0-9]{64}$`;
  - `"999"` matches the sourceRevision pattern;
  - `"foreign-worker"` is a valid string.
  - (I) `contextRevision+1` stays ≤ 201 for realistic fixtures.
  - The test recomputes `receiptHash` over the preimage without `receiptHash`, which is what
    `GuidedIncrementalStore.receipt` checks.
- **409 `STALE_FENCE` ×6** (`scopeHash`, `authoredInputsHash`, `contextRevision`, `workerId`,
  `prefixProgramHash`, `sourceRevision`).
  - Owner, fence, `active`, `checkCurrent` and `checkSourceCurrent` all use the authentic session and
    worker.
  - `verifyPrefixReceipt` binds identity minus `versions` (schemaVersion, sessionId, workerId, ownerFence,
    scopeHash, contextId, contextRevision, sourceRevision, configurationRevision) plus
    `authoredInputsHash` and `prefixProgramHash`. All 6 forged fields are in that set → `STALE_FENCE` 409.
- **409 `UNKNOWN_OUTCOME` ×3** (`requestDigest`, `operationHash`, `evidenceHash`).
  - These fields are not bound by `verifyPrefixReceipt`.
  - The admitted branch checks only the ledger, `admissionId` and `preparationId`.
  - `incremental.receipt` passes its schema and hash checks.
  - The INSERT then hits V21 `studio_015_no_invocation_guard` (BEFORE INSERT):
    - `requestDigest`: the `STRICT` lookup finds no `studio_guided_prefix_requests` row, so it raises.
    - `evidenceHash`: `NEW.document - [...] IS DISTINCT FROM q.document`, so it raises.
    - `operationHash`: no program action has that coordinate/operationHash pair, so it raises.
  - `repository.transaction` is a plain `TransactionTemplate.execute`, so the `DataAccessException`
    propagates. The controller-local `@ExceptionHandler(RuntimeException)` `unexpected` then maps it to
    409 `UNKNOWN_OUTCOME`. Controller-local handlers take precedence over the global
    `@RestControllerAdvice`.
  - The response body carries `code` (`GuidedSessionException.response()`).
- **Assumption (I).** The 3 UNKNOWN_OUTCOME rows also need the session to be `REPLAYING_PREFIX` with a
  pending prefix when the probe runs. Otherwise all three would be `STALE_GENERATION` (line 2266).
  - This holds while the authentic callback is held on `INCREMENTAL_ACK_RELEASE`, because the authentic
    receipt needs the same precondition.
  - If the first execution shows otherwise, treat it as a finding. Per Dex §7.3, do not re-pin.

## 7. Frozen identities/labels and the ReplayIT delta (verified)

- `INCREMENTAL_VARIANTS` (136) and the second list (3351) each hold 35 labels.
- `@Test` count is 51 in current, `9f54372c…` and `f279684c…` alike. The diff touches no test method
  declaration and no label list.
- The 85/35 invariant therefore holds as at the f279 baseline accepted in earlier reviews.
- The ReplayIT delta vs `84c3d496…` (Dex's before) is: 29→31 (the revert), R2, R3 and E-1b ×2. That is
  exactly what §7/8 disclose. Fix F was in the previous window.

## 8. B3a patch and carry-forwards (non-blocking)

**B3a patch (`b3a-source01/b3a.patch`, `556c146a…`).**
- `git apply --check -p0` against the current AuthorityIT (`84ada478…`) returned **exit 0**:
  "Hunk #1 succeeded at 601 (offset 36 lines)".
- Applied to a scratch copy, the result equals B3a's `work/GuidedPublicationAuthorityIT.java`
  (`a0dd022d…`) plus exactly the 36-line E-2 method (scratch result `42df66ed…`).
- **However, two B3a manifest inputs have drifted:**
  - AuthorityIT `e6228117…`→`84ada478…`;
  - GuidedPublicationRepository `28aafe98…`→`a6895c62…` (E-2).
- (I) By §4(3), B3a's expected refusals are unchanged: a forged witness is validated by `verifyCandidate`
  first, and an unequal one revalidates.
- B3a's compile and run evidence is stale, so it **must be re-run under a fresh label**.

**Carry-forwards.**
- **C1.** The second half of review02 R2 (the B1B-05 REFRESH row: `/plans` 200, zero `committedRefresh`
  STALE_GENERATION) has no target yet. `incrementalPrefixContinuationMatrixDoneAndRefreshRows` does not exist
  in `backend/src/test` (grep). Whoever implements B1B-05 must use the amended row, not the design's
  STALE_GENERATION pin.
- **C2.** R3 rows and D1/F2 have no joined proof. All drift variants are still blocked by G.
- **C3.** E-2's in-lock reduction (about 4→1 validations per finalize) is not directly measured. Order 9
  passing is explained by E-1 alone. Aria's optional `STUDIO_C5_CLAIM_DIAGNOSTIC` run was not executed.
  Residual R-1 (one in-lock whole-native validation via `verifyCandidate`) stays tracked for GA.
- **C4.** (I) An environment override `LOGGING_LEVEL_COM_NETWORKNT=DEBUG` can still lower the cap at deploy
  time. E-1c covers yml profiles only. Consider a deploy-policy note.
- **C5.** Formatting: Repository line 238 is 106 columns, inside an already non-gjf file. Dex disclosed it.
  I did not run spotless.

## 9. Skipped
- No Gradle or test execution, per instruction.
- CodeRabbit not run: the skill requires WSL, and this host is darwin.
- SYNAPSE diagnostics and the checklist-runner skill not run: outside this mission.
