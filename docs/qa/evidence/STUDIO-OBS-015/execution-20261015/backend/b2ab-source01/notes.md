# B2a + B2b source 01: apply-ready patch (6 methods)

Dex (@dev, JOIN). 2026-10-16. Test-only patch against the live ReplayIT. HOLD: an R2 backend run was
live, so nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/` or
`.github/` was written, and no Gradle, JVM test, database or runner process ran. This grants no QA
credit and changes no lifecycle. Every method below is **planned and has not run**.

## Files
| Path | sha256 |
|---|---|
| ReplayIT base (live, verified before and after work) | `4242ac27020814fe57355116a06ef1271b4a0c2f247d2847ea3c28888ec55b33` |
| ReplayIT after `git apply -p0 b2ab.patch` | `1791c15feba87ce949f1ee846b0138baf0aebce1b9e40440fa92a35527b991fd` |
| `b2ab.patch` | `f088b290b1a4f773383ca5ef5174cc9f77c6199014269076702ebd6b84de5548` |
| `backend/build.gradle.kts` (not edited) | `92bfae6d53140e172e1948bcf6e4f328e1b0b49b7fa497fed1ebf245dfcc5991` |

Apply from the repo root: `git apply -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/b2ab-source01/b2ab.patch`.
The patch is a patience diff, so the new block is a single pure-insertion hunk. A plain `diff -u` had
produced a 602-line replace hunk, which would have collided with the parallel B1b-d and B3 patches.

## Methods and lanes
| ID | Method | Lane | Ledger |
|---|---|---|---|
| B2A-01 | `incrementalSecretPrefixPreservesEveryVaultFaultOracle` | default `test` | 28 |
| B2A-02 | `incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck` | default `test` | 45 |
| B2A-03 | `incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent` | default `test` | OPEN worker checkCurrent, separate secret parent |
| B2A-04 | `incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation` | default `test` | OPEN combined grant revocation at fresh-producer ACK |
| B2B-01 | `incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority` | **low** `guidedIncrementalTest` | 18, 46, 77 (A18-4 OPEN, F1) |
| B2B-02 | `incrementalPlainAndContextCanariesRemainPrivateAcrossMergedPublication` | default `test` | 68, IPC P08 |

## Placement
- All six methods and every new helper, field, enum, record and nested class are **one contiguous
  block** placed immediately after `prefixProducerContextPostAckRevalidationRejectsChangedAuthorityOrEvidence`.
  It sits before the `/** PFXSYNC-05 …` javadoc, as hunk `@@ -3774,6 +3774,2710 @@`, and it is insertion only.
- The block's members were formatted with google-java-format 1.22.0 (`--skip-reflowing-long-strings`).
  The output is stable on a second pass, and no added line is over 100 columns. The JS text block was
  hand-wrapped to stay within that limit.

## Shared hunks (6; each defaults to the unchanged bytes)
| # | Anchor (identifier) | Change |
|---|---|---|
| S1 | `p3GuidedLaunchCounter()`, between `+ incrementalNativeFaultObserver()` and `+ p4GuidedRevocationObservers()` | `+ b2SecretContextObserver()` plus a 1-line comment |
| S2 | `p3Application`, after `P3_RECEIPTS.add(new P3Receipt(...))` | `b2SignIn(values);` |
| S3 | `p3Application` response wrapper | `"<!doctype html><html>" + b2TitleHead(path) + "<body>"…` (`""` unless `b2aTitleSuffix`) |
| S4 | top of `p3LoginDocument()` | `if (b2PageArmed()) { return b2LoginDocument(); }` |
| S5 | top of `p3Model(...)` | `ObjectNode b2 = b2Model(...); if (b2 != null) { return b2; }` |
| S6 | `model()`, `incrementalTenScenario` branch, before `return incrementalTenModel` | `b2bHoldSuffixPlan(kind, context);` |

- **Not edited:** the `p3Case` finally (knobs are reset by `b2ResetKnobs()` in each method's own
  finally), `/obs015-ack` (see F1), `incrementalNativeFaultObserver()`, `pfxRead`/`pfxSelect`, and the
  closed PFX modes.
- **The cut layer.** The SECRET_HOLD cut is its own layer. It is installed after the 015 observer and
  before the S2 observers, so the S2 wrappers stay outermost (r1-diagnosis F). It reuses
  `pfxEvent`, `pfxSignal` and `prefixSyncCallback` unchanged.

## Registration needed (NOT applied: build.gradle.kts and the ReplayIT method-set constants)
- **`backend/build.gradle.kts` `joinedDefaultMethods`.** Append these five names, for example before
  `"auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass"`:
  ```kotlin
      "incrementalSecretPrefixPreservesEveryVaultFaultOracle",
      "incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck",
      "incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent",
      "incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation",
      "incrementalPlainAndContextCanariesRemainPrivateAcrossMergedPublication",
  ```
- **`backend/build.gradle.kts` `joinedAddedLowMethods`.** This is the B1a set. It is already wired into
  the `guidedIncrementalTest` include, the `tasks.test` exclude and the `requireFreshGuidedPartitions`
  expected set:
  ```kotlin
  val joinedAddedLowMethods = setOf(
      "incrementalPrefixCallbacksKeepStateAndFenceBothReservations",
      "incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority"
  )
  ```
  Do not touch the indexed `joinedIncrementalMethods`.
- **ReplayIT `SINGLETON_METHODS`.** Add all six names. `beginFixtureInvocation` requires the singleton
  membership and the `<method>()` display name.
- **ReplayIT `INCREMENTAL_METHODS`.** Add only `"incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority"`.
- **Default-lane rule.** A default-lane method goes in `joinedDefaultMethods` and in
  `SINGLETON_METHODS` only. This is the same pattern as the existing default JOIN methods, and the
  default task's partition check uses `expected = joinedDefaultMethods`.
- **Inventory.** After B1a: 43 default + 43 low. After B2: **48 default + 44 low = 92**, before
  whatever B1b-d and B3 add. Without the registration, each new method fails at `@BeforeEach`
  (`SINGLETON_METHODS`).
- **Selectors.** As in b2ab-design01 §7.3: the 5 default names plus
  `actualIncrementalSecretPrefixRecaptures…` on `test`, and the low name plus the two regression
  selectors on `guidedIncrementalTest`. Use `--no-daemon` (r1-diagnosis cause A).

## Verification actually run
- The base hash `4242ac27…` matched before and after the work. The same hash was checked as
  `liveSha256AtPatch`.
- `git apply --check -p0 b2ab.patch` against the live tree: **OK**. This check is read-only.
- I applied the patch to a scratch copy of the base. The result is byte-identical to `work/GuidedPublicationReplayIT.java`.
- **javac.** javac 21.0.10 `-proc:none` compiled the base and the patched ReplayIT into scratch-only
  output dirs, with **0 errors** each.
  - The classpath was `backend/build/classes/java/{main,test}` and `backend/build/resources/*` plus the
    newest jars in `~/.gradle/caches/modules-2`.
  - That approximates Gradle's `testCompileClasspath` but is not it.
  - `javap` lists all six methods.
- **JS fragment.**
  - Node `v23.10.0` loaded the fragment with stubs. It passed through unchanged with no control file.
  - A stubbed selector smoke (`work/sc-logic-smoke.mjs.txt`) showed the expected selection:
    - it selects only when ONE/0 and TWO/0 are done and TWO/1 is not;
    - it selects once per caseId;
    - target events fire only for the exact coordinate;
    - the order is UPDATED_BEFORE_ACK, then signal AFTER, then ACK_RELEASED.
  - This is not the real runtime.
- **Not run:** Gradle, Spotless, Checkstyle, SpotBugs, any JUnit, PG, the runner or Chromium.
  Runtime reachability of every cut and oracle is therefore unverified.

## Findings (code-reading only; not executed)
- **F1. A18-4 is unreachable as designed, so it stays OPEN.**
  - Java `pushContext` sends the pending delivery id as the HTTP `Idempotency-Key`
    (`GuidedDispatchService.pushContext:98`, `GuidedRunnerClient.send` header).
  - The runner transport caches each first promise under `[sessionId, operation, key]` and never
    evicts it (`studio-runner/dist/guided/transport.js` 75/107-139, sha `1ee83f23…`).
  - After a lost context-ACK response, a coordinator retry with the same body awaits the same rejected
    promise and gets `CONTEXT_LOST` 409 again. With a renewed `leaseExpiresAt` the body digest changes,
    so it gets `IDEMPOTENCY_CONFLICT`.
  - Either way the retry never reaches `runtime.update`'s stored-ACK path (`contextAcknowledgements`,
    `runtime.js` 166-170).
  - `CONTEXT_LOST` is not a definite refusal, so the session is not stopped. It would stay
    PENDING/REPLAY until expiry (inferred).
  - Per design §10, the lost-response injection (§3.5 `INCREMENTAL_ACK_LOSE`) was **not added**.
    B2B-01 releases the ACK normally and asserts the same delivery id, one delivery and 2 versions,
    and earns **no A18-4 credit**.
  - Deciding the product behaviour belongs to Aria and the runner owner.
- **F2. Pre-existing, outside my scope.** The regression selector
  `actualIncrementalSecretPrefixRecapturesRotatedValueWithScopedAuditAndOrdinaryReplay` passes the
  strings `baseRevisionId` and `revisionId` to `p3WriteEvidence`. `requireNumericBudgetEvidence`
  accepts only numbers and booleans, so the method would fail on its last statement (inferred). All
  my evidence objects are numeric or boolean.
- **F3. Inherited risk.** `p3CreateSource` writes `AuthoringRevisionIdentity.create(authoring, Map.of())`
  although TWO references `<var USER>`, which `AuthoringRevisionIdentity.valid` would reject (count
  mismatch). B2A-01, B2A-02 and B2A-03 reuse it, like the reference method. My combined source writes
  `Map.of("USER", user)`.

## Deviations from b2ab-design01 (all disclosed; no oracle weakened)
1. **A18-4 OPEN** (F1). The `/obs015-ack` hunk was dropped.
2. **`b2CreateCombinedSource`.** The `secretRef` now carries `"secretId":"PASS"` (r1-diagnosis cause
   C). The design literal would have hit 400 `INVALID_VARIABLES`.
3. **Raw-evidence "outside authoring" (B2B-02, A68-3).** It removes both `current.authoring` and
   `baseProof.authoringIdentity.authoring`.
   - The pinned base revision's authoring is copied into the evidence for a mixed session
     (`GuidedPublicationEvidenceRepository` 784-788). It carries the same step context.
   - Both are internal-validation inputs.
   - QA should confirm this is the intended reading.
4. **B2B-02 scan windows** (gateway contexts, raw wire, order values) cover the whole case (base learn
   plus mixed run). This is a superset of the design's mixed window, so it is stronger.
5. **A77-1.** The narrower need is built from the stored allocation (needId, producer and its first
   consumer) instead of `plan.needs[0]`. Inferred reason: the suffix window plan has no need for an
   edit at step 3 (`incrementalTenModel`).
6. **Phase A** also sends `runner.send("context", context)` before `prepare`. That mirrors
   `prepareAndAdmit` exactly, minus its admit.
7. **A77-4** compares only actions, model attempts, switches and preparations
   (`b2bWorkSnapshot`), per design note 1. Versions, deliveries, allocations, producers and revision
   are still exact.
8. **Base-session audit in B2A-01** uses snapshot equality, because the table has `occurred_at`, not
   `created_at` (VERIFY-3). **VERIFY-4** is a typed walk over `guards`, `steps[].operations[]`,
   `inputRecipes` and the materialization inputs. The design's placeholder was not shipped.
9. **Process scan (AP08-1).** The ordinary child REUSES `p3OrdinaryChildren` and
   `p3ScanOwnedChildArguments`. The guided worker uses an adapted copy without the child-only env
   positives.
10. **Concurrency and value hygiene.**
    - Concurrently appended fixture lists are snapshotted before slicing (`b2Tail`).
    - Private values are only ever compared as booleans or sizes.
    - Audit predicates use bound parameters.
    - B2B-01 cleans up in `finally` (cancel any non-terminal session, await teardown), like
      `PrefixSyncParent.close`.
11. **Design order values** are also added to `VALUES` (design §3.2). This is safe only because the
    `@Order(1)` `RECEIPTS containsExactlyElementsOf(VALUES)` runs before every unordered method.

## VERIFY gates
| Gate | Status |
|---|---|
| 1 | Inferred from the `POLICY`/`P3_OTHER_POLICY` grant JSON (main "Operations", origin `ORIGIN`). The combined page uses that region. |
| 2 | **OPEN.** The ZERO/TWO terminal is `isIn(FAILED, UNKNOWN_OUTCOME)` until the first run pins it. |
| 3 | Resolved. |
| 4 | Resolved. |
| 5 | Resolved: the plain value key is the reference id, the token name `USER` (`AuthoringRevisionIdentity.nonsecret`). |
| 6 | Resolved: route `materialization`. |
| 7 | Resolved: `{kind:plain,referenceId,valueHash}` and `{kind:secretRef,referenceId,secretId}`. |
| 8 | Kept the design list, not shrunk. Each excluded table holds private source, config or input data by reading. Nonsecret materialization inputs carry `value` (V21 CHECK), and the commands table stores materialization responses. Not verified by a run. |
| §10 last | `CONTEXT_LOST` maps to non-definite UNKNOWN_OUTCOME (r1 §2.1), so it is not definite. F1 still blocks the retry. |

## Authority-tier disclosure (ruling T1/T2)
- "Vault" is the in-JVM `FakeStudioVaultProvider` behind `CountedLoginVault`.
- "Core" is the in-JVM Core contract fixture. Real Citi Core/COIN is not exercised.
- Grants are the `controlledLoginEntitlement`/`P3_PERMITTED` fixture entitlement, never Core policy.
- These are stated in the block header comment, the method javadocs and the assertion texts.

## Not lawfully provable here (unchanged from design §9)
These stay OPEN:
- the real Vault/Core tier;
- restart-continuation identity (ledger 77);
- runtime old-admission consume-crossing (ledger 46);
- the native-only halves of the faults.

## Decisions
- [AUTO-DECISION] Fold the knob reset into each method rather than the `p3Case` finally → in-method `b2ResetKnobs()`. Reason: one fewer shared hunk.
- [AUTO-DECISION] The design's in-place JS edit of `incrementalNativeFaultObserver` → a separate layer, `b2SecretContextObserver()`. Reason: the pfx bytes stay identical and S2 stays outermost.
- [AUTO-DECISION] Reuse `p4PasswordControls` for ZERO/TWO → no; a new `b2PasswordPage` knob. Reason: the P4 knob also arms the P4 page observer, the effect witnesses and the native-submit fence.
- **IDS.**
  - REUSED: `p3*` helpers, `PrefixSyncCut`, `prefixSyncCallback`, `pfxEvent`/`pfxSignal`, `writePrefixSyncControl`, `prefixSyncEdit`, `incremental*Snapshot`, `collectJoinedSinks`, `assertJoinedSinkAbsent`, `p3OrdinaryChildren`, `p3ScanOwnedChildArguments`, `C5CanaryStream`, `p3RunnerReport`.
  - ADAPTED: `writeOwnedControl` (from `writePrefixSyncControl`), `b2Edit` (from `prefixSyncEdit`), `b2Publish` (from `p3Publish`), `b2SourcePlan` (from `p3Model` LOGIN), the guided-worker scan.
  - CREATED: the B2 knobs, holds, cut JS and gate helpers. No existing seam selects a secret prefix coordinate.
