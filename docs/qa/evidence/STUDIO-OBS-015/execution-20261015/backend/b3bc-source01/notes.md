# B3b + B3c source 01: apply-ready test-only patch (5 low-lane ReplayIT singletons)

Dex (@dev, JOIN). 2026-10-16. HOLD. This is a test-only patch. It gives no QA credit and changes no lifecycle.
Nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/` or `.github/` was modified.
No Gradle, JVM test, database, runner or browser ran. The only writes are this folder (plus scratch).

## Files
| Path | sha256 |
|---|---|
| Base (live) `backend/src/test/java/.../publication/GuidedPublicationReplayIT.java` | `4242ac27020814fe57355116a06ef1271b4a0c2f247d2847ea3c28888ec55b33` (verified before work and again at `git apply --check`) |
| Patched result (`work/GuidedPublicationReplayIT.java`) | `d83043e36382e7a0823a6d7e5334d83fd7b29040ba0f1ed6579d0a7fe01e44ef` |
| `b3bc.patch` | `ac04aaf11d5f326931f7a5fe6e598bac448be1574dd176bf86d0dcf32826c3e9` |
| `work/b3bc-block.java` (the new contiguous block alone) | `a1747c529c9aedd537e1a2b7294911ecd1b9af64c27e9887e411fa71f08ee761` |
| `work/base/GuidedPublicationReplayIT.java` | copy of the live base |

- Apply: `git apply -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/b3bc-source01/b3bc.patch`
- Size: 9 hunks, +2354 / -2 lines, in one file. `build.gradle.kts` (`92bfae6d…`) is **not** touched.
- **Apply dependency:** the registration lines below must land in the same merge. Without them, the
  default `test` lane would select these 5 methods (they are not excluded there), and
  `beginFixtureInvocation` would refuse them, because they are not in `SINGLETON_METHODS`.

## Methods, lane, registration (not applied, per the parallel-merge rule)
All five are `@Test` singletons that use `incrementalTenScenario`, so they belong to the **guidedIncrementalTest / incremental2048**
low lane. Each one runs under its own CSI (`CSI-B3-<p3CsiOrdinal>`).

| ID | Method | Parent |
|---|---|---|
| B3B-1 | `incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution` | `append-input` (gen 1), then gen 2 on the same test |
| B3B-2 | `incrementalNonemptyOriginalPrefixRetainsBaseProofAfterDriftAtOne` | `drift-first` |
| B3B-3 | `incrementalFirstSuffixAcceptanceIsOnceAndLaterPairsCannotDisappear` | `admitted-drift2` |
| B3C-1 | `incrementalPartialDriftStepReadPublishesAndReplaysTwice` | `drift2` + read-at-j texts/model |
| B3C-2 | `incrementalMeasuredAdmissionRowsPreserveIdentityAndActualMediaSeek` | `admitted-drift2` |

Exact registration lines. They follow the B1a pattern: append to the existing sets and create no new set.
- `backend/build.gradle.kts`, `joinedAddedLowMethods`: put a comma after
  `"incrementalPrefixCallbacksKeepStateAndFenceBothReservations"`, then add:
  ```kotlin
      "incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution",
      "incrementalNonemptyOriginalPrefixRetainsBaseProofAfterDriftAtOne",
      "incrementalFirstSuffixAcceptanceIsOnceAndLaterPairsCannotDisappear",
      "incrementalPartialDriftStepReadPublishesAndReplaysTwice",
      "incrementalMeasuredAdmissionRowsPreserveIdentityAndActualMediaSeek"
  ```
  That set is already wired into the include filter, the `tasks.test` exclude and the `requireFreshGuidedPartitions` expected set.
- `GuidedPublicationReplayIT.SINGLETON_METHODS` **and** `INCREMENTAL_METHODS`: add the same 5 string literals to
  both sets, for example right after `"incrementalPrefixCallbacksKeepStateAndFenceBothReservations",`.
- Inventory: the low lane grows by 5. Over B1a's 43 that is 48 low, or 91 JOIN identities when only B1a and
  B3b/c are counted. Other batches add on top of that.
- Selector: `guidedIncrementalTest --tests com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.<method>`

## Hunks (anchored by identifier; base line numbers shown only for orientation)
1. **New block (B3-owned, contiguous).** It sits immediately after the method
   `incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser`, before
   `incrementalStartCannotWidenTrustedOriginCeiling` (base ~3646). It contains the 5 `@Test` methods, then the §1.3 declarations, `B3WriterProbe`, and the
   §3/§4 helpers.
2. **Shared hunks.** These are minimal and inert when nothing selects them (null or false by default):
   - S1 `incrementalJoined`, placed before `AUDIT_CANARIES.addAll(texts); // Audit-only…`:
     `if (b3Hooks != null) b3Hooks.texts(variant, texts);`
   - S2 `incrementalJoined`, placed after `assertIncrementalImmutableSourceAndPlanHistory(mixed, base.path("revisionId").asText());`:
     it adds `B3Hooks b3Active = b3Hooks;`, builds `B3Parent` only when that is non-null, and calls `beforeFinalize`.
   - S3 `incrementalJoined`, as the last statement of the try body (after the `if (expectedSubmit == 1) {…}` block,
     before `} finally {`): `if (b3Active != null) b3Active.afterFirstOrdinaryReplay(b3Parent, merged, execution);`
   - S4 `incrementalTenModel`, SOURCE_PLAN branch, after the `drift-plan-fail` return:
     - The `b3FirstSuffixHold` hold, used when a learning window exists.
     - `boolean partialRead = b3ReadInsideDriftStep;`.
     - The need producer becomes `INCREMENTAL_STEPS.get(partialRead ? 1 : 0)`.
     - The step-0 read gets `&& !partialRead`.
     - The step-1 non-literal branch gets a new `else if (partialRead) {read(0) unless completed; fill(1)}` ahead of the unchanged `else`.
   - S5 `observedReportCapture` filter lambda: the B3 evidence-callback capture branch.
     - Placement: just **before** `UUID p3Execution =`, which is after the C5/P4 branches. The design put it as the
       first branch. I moved it so it does not collide with B1bcd's "first statements" filter hunk.
     - Behaviour is unchanged: the C5/P4 branches return only when their own captures are armed, and B3C-2 arms neither.
   - Expected textual overlap: B1bcd T4 also edits the `incrementalTenModel` SOURCE_PLAN branch, and B2 edits `model()`.
     Whoever merges second has to rebase those hunks. Their semantics are independent: each is gated by its own static field.

## How the design was adapted (each deviation is deliberate and disclosed)
- **[AUTO-DECISION] Validator call outside the transaction.**
  - Why: `ObservedValidationClient.validate` (lines 53-57) refuses any active transaction with `RUNTIME_INCOMPATIBLE`. Design §1.4 calls it inside the rolled-back staged transaction, so every positive would have failed.
  - Fix: `B3WriterProbe` makes that call through a `PROPAGATION_NOT_SUPPORTED` TransactionTemplate, which suspends the outer transaction. This matches the publisher, which also calls it between transactions.
  - Side effect: the suspended connection keeps its session/ui_tests row locks for the length of one validator HTTP call. That can delay one worker lease renewal by that duration (see R-LOCK).
- **[AUTO-DECISION] DB-guard catch.**
  - `staged` also catches `DataAccessException` and records it as `DATABASE_REFUSED`, keeping only the exception class name and never a value.
  - Without this, a genuine database guard would crash the test instead of being recorded. Both `refuse` and `requireStored` still forbid adoption, and `requireStored` still pins `WRITER_REFUSED`.
- **R-42, confirmed by reading.**
  - `CanonicalStudioCodec.variablesFromNode` (`names.add(name)` → `INVALID_AUTHORING`) refuses duplicate stored names before `IncrementalAuthoringIdentity`, which takes the parsed `List<StudioVariable>`. A stored duplicate cannot be written by the product (T3).
  - So `duplicate-conflict` is **OPEN**. It asserts only a 4xx and zero writes, and records status/code into the B3 outcomes. The other 4 refusal pins and `exact-alias` are kept as designed.
  - The stored `authoring` is written as `JSON.writeValueAsString(dto)`, the canonical DTO serialization that `incrementalJoined` also uses, rather than the raw tree. The design's separate mapper is replaced by the class `JSON`.
- **B3PrivateReadBoundary labels earn no credit.** Labels `v1/v2-private-value` and `v1-cutoff-includes-v2-input` substitute returned rows at a JdbcTemplate boundary. Authority ruling T3 says mock JDBC does not qualify, so these labels are recorded as `returned-read-no-t3-credit-*` and kept as disclosed evidence only. Route 6 credit relies on `wrong-private-input-hash-v2` (STORED pin over production-written rows).
- **Gen-2 quiescence:** `p3AwaitTeardown(gen1.id())` runs before the all-tenant `incrementalAuthoritySnapshot` no-write comparison.
- **B3B-3 contender command copies nodes.** It copies `scope.sourceRevision` and `scope.configurationRevision` as nodes, because `checkCommand` compares JsonNode equality. Type is never changed.
- **B3B-3 hardening:**
  - It also asserts exactly 2 contender rows, so the loop cannot pass vacuously.
  - It cancels the watcher future in `finally`, so an earlier failure does not leave a 120 s wait behind.
- **B3B-3 SQL:** it uses `m.kind='SOURCE_PLAN'` instead of `identity->>'kind'`. They are equal by the V-schema CHECK.
- **B3C-2 manifest comparison:** `manifest.timings` is filtered to `kind=action`, the same filter applied to the served and stored rows. The design compared the unfiltered manifest list, which would include derived step items (`GuidedRecordingTimings.acceptAndDerive` merges step items). The replacement timing also asserts that `endMs` is integral before the order check.
- **Stage records are retained.** `B3_OUTCOMES` (value-free: session hash, label, stage, code, readsDelta, lowering) is written once per invocation to `build/guided-cohorts/<lane>/<run>/<cohort>/b3-outcomes-<invocationKey>.json` by `b3RetainOutcomes()` in each method's `finally`. Gradle checks read only `cohort.json` and `guard-tally.json`, so this extra file is inert to them.

## Production changes honoured (r1-diagnosis §6-8)
- **E-2.** `GuidedPublicationRepository.commit` (`a6895c62…`, lines 233-241) still calls the stored reader at line 234, before `basisMatching(..., basis)`. So `readsDelta` still separates pure (0) from stored (1) refusals. For an offered basis that differs, the derived basis is re-validated and then `currentBasis.equals(basis)` fails with `PUBLICATION_CONFLICT`. The probe's genuine basis uses `builder.basis`, which is the publisher's `prepareLoweringInput` path.
- **E-1.** B3 never arms C5/TRACE, so there is no interaction with the `com.networknt` WARN cap.
- **D1 / F2.** The drift parents (`drift-first`, `drift2`, `admitted-drift2`) go through `prefixDrift` → `verifyPrefixReceipt` and the F2 `committedRefresh` predicate. The B3 edge label `excluded-native-started` reseals the receipt hash only inside the offered basis, not on a callback, so D1 is not involved. r1 §6.5/§7.1 records that no drift variant has run yet. Joined reachability of these parents is therefore unverified.

## Authority-tier ruling (T1-T5)
- **T1.** The controlled inputs are disclosed in code:
  - The staged publication **grant**. It is built from the stored base's principal and CSI and re-checked by the writer.
  - The in-JVM Core and fake Vault used by the parents. They are leaf fixtures.
- **T2.** No new "actual Core" claim is made.
- **T3.** Every STORED pin reads production-written rows. The returned-read labels earn no credit (see above).
- **T4.** B3C-2 meets it as follows:
  - It reads the bytes served by the production `/video` route and asserts they equal the stored object.
  - It runs real local `ffprobe` to find the last packet, then one real `ffmpeg -ss` decode per served admission stamp.
  - The native0 admission has no stamp, so it gets no seek. Stamps are never fabricated.
  - Probe sanity was checked locally: a 3 s VP8 WebM gave a 2304-byte frame at 1.5 s, and 0 bytes with exit 0 beyond the end.

## Verification actually run
- The base sha256 equals `4242ac27…`. `git apply --check -p0 b3bc.patch` against the live tree: **OK**.
- Applying the patch to a scratch copy reproduces `d83043e3…` byte for byte.
- javac 21.0.10 (`-proc:none`) compiled both the base and the patched ReplayIT, with **0 errors**. All 5 methods and the 8 `B3*` nested types are present in the class files.
  - Classpath: a scratch snapshot of `backend/build/classes/java/{main,test}` plus the newest jar per artifact from `~/.gradle/caches/modules-2`.
  - This approximates Gradle's `testCompileClasspath`; it is not that classpath.
  - The main classes do contain the E-2 `basisMatching`, confirmed with javap.
- google-java-format 1.22.0 (`--skip-reflowing-long-strings`) on the new block: stable, and no line is over 100 columns. The new shared-hunk lines are each ≤ 100 columns. The exceptions are the two existing `incrementalTenModel` lines that S4 modifies in place (producer 126 columns, step-0 read 140 columns). They keep their original over-width shape so the hunk stays a one-line change. The file is already non-gjf (r1 §3.2), and the patch does not fix that.
- **Not run:** Gradle, any JVM test, `npm run lint`/`typecheck` (no FE change), CodeRabbit (WSL-only), SYNAPSE diagnostics.

## OPEN / risks (report, do not credit)
- **R-STAGE.** Each pinned stage (`requireStored`, `requireBackendPure`, the alias codes, the B3B-3 `IDEMPOTENCY_CONFLICT`, the B3C-2 sink equality) is a prediction from reading. If a run shows a different stage, that label is OPEN for Aria/Quinn. It must not be re-pointed.
- **R-P03.** If the backend refuses the read-inside-drift-step parent (B3C-1), that is a candidate production defect against P03/76. The fixture must not be changed to avoid it.
- **R-LOCK.** Each staged probe holds the session row lock across one runner-validator call. That is about 30 calls in B3B-3, each expected to be short. A slow validator could delay a lease renewal; compare r1 §6.1 E.
- **R-ALIAS-TEARDOWN.** `exact-alias` cancels immediately after start. `p3AwaitTeardown` relies on `stop()` finding the assignment; if it does not, the 20 s wait fails.
- **R-RUNTIME.** B3B-1 runs 3 learning sessions plus 6 starts. Put it in a window alone if CPU contention appears.
- **Carried over.** Route 7 (precondition), route 8 "other failed", the ledger-85 positive tie, visual frame identity and truly simultaneous acceptance (design §8) all stay OPEN. Routes 9/10/13/14 belong to B1 and are not in this patch.

## IDS
- **REUSE.**
  - Methods: `incrementalJoined`, `prefixSyncEdit`, `p3AwaitTeardown`, `incrementalAuthoritySnapshot`, `incrementalImmutableSnapshot`, `incrementalNativeEvents`, `awaitGuidedVideoSettled`, `guidedRecordingRow`, `guidedVideoRead`, `registerOwnedTool`, `awaitJoinedProcess`, `privateImmutableJson`, `observedBinding`, `token`, `versions`, `publicCall`.
  - Fields: `JSON`, `p3CsiOrdinal`.
- **ADAPT.**
  - `incrementalJoined`: 3 hook lines.
  - `incrementalTenModel`: the hold plus the read-at-j branch.
  - `observedReportCapture`: the capture branch.
- **CREATE.** Everything named in design §1.3/§1.4/§3/§4: `B3Hooks`, `B3Parent`, `B3Outcome`, `B3WriterProbe`, `B3PrivateReadBoundary`, `B3FirstSuffixHold`, `B3EvidenceCapture`, `B3MediaProbe` and the `b3*` helpers. `b3Tool` mirrors the PATH scan in `decodeJoinedVideo`, which is inline and not reusable. No existing helper stages a writer attempt against the actual runner validator.
