# new22-qa-ack01: QA ACK/NACK for the new22 B1/B3 and B2 diagnosis patches

Quinn (@qa). 2026-10-16. Read-only review. I did not run Gradle, JUnit, javac or Chromium, did not commit, and did not edit source. This grants no lifecycle credit. Every verdict below covers the **patch design only**. Each fix still needs its own executed run.

## 0. Inputs (hashes at review time)
- `new22-b1b3-diagnosis01/fix.patch` `cc757676…`, `review.md` `bab2f150…`
- `new22-b2-diagnosis01/fix.patch` `1d8a501c…`, `review.md` `0596a16d…`
- Live ReplayIT `217950c7…` and `build.gradle.kts` `2d43ae4d…`. Both were still unpatched when I read them, and they match both patch bases.
- Production code read for the rulings:
  - `GuidedTranslationService.java` `d8c494b2…`
  - `GuidedProductionSessionAccess.java`
  - `GuidedSessionService.java`
  - `studio-runner/src/run/observationCollector.ts` `e073909b…`
  - `docs/specs/studio-observed-authoring/translation-design.md` REL-001 and the metadata-ACK paragraph
- Run artifacts read:
  - `execution/backend-merge-new22-low-attempt01-results.json` and its XML
  - `execution/backend-merge-h7h3-attempt01` XML
  - 10 `*-results.json` files that contain `incremental joined drift-first`

## 1. Summary

| Item | Verdict |
|---|---|
| B1D-01 delivery-id hook | **NACK as patched.** The approach is lawful, but the keying is unsafe (§2). |
| B1D-01 marker replacement | **Not a product defect** (§2.3) |
| B3B-2 / joined `drift-first` page change | **ACK, conditional** (§3) |
| B1B-02, B1D-02 (both reads), B1B-05 mid-run read: 202 | **ACK** (§4) |
| B2A-01 publish-first then 200 | **ACK** (§4) |
| B2A-04, B2B-02 re-laned to 2048 (Java and Gradle together) | **ACK, conditional** (§5) |
| B2A-02 site-password rotation moved, plus the sign-in pin | **ACK.** Ledger 45 is still proven (§6). |
| B1B-05 and B2B-01 `sessions.transaction(...)` wraps | ACK. Mechanical. Same values, same assertions. |
| B1B-04 / B1B-05 `incrementalTenModel` null guard | ACK. Identical for every non-null variant. It only removes a fixture NPE that caused a provider 500. |
| B3B-1 `exact-alias` scope seed plus canary | ACK. It seeds the case's own fresh scope, as every other secret case does. The canary is registered. The refusal sub-cases are untouched. |
| B1C-01 | No hunk. It depends on the live H6 runner fix and must be re-run against it. |
| B1C-03 `{DESTRUCTIVE_VERB:3}` | No hunk. Provisional ruling in §7. |

## 2. B1D-01: deliveries[] replaced at READY

### 2.1 Is it still a lawful proof of ledger 55? Yes, in principle.
- The old oracle read `progress.translationBootstrap.deliveries`. That is **private internal progress**, not a public or openapi contract.
- The replacement observes the actual return value of the committed `beginBootstrapDelivery` transaction, which is the same transaction that appended to `deliveries[]` (GuidedTranslationService:492-526).
- It observes through the existing `b1AfterCommit` seam. That seam runs only when `status.isNewTransaction() && !isRollbackOnly()` holds and no transaction is active afterwards (ReplayIT:2074-2086).
- The persisted `metadataAcknowledgement.deliveryId` stays the durable anchor (:632-636).
- The authority tier is unchanged: in-JVM, Postgres-committed state, plus runner pair events.
- The ledger-55 clause itself ("every delivery incl. rebootstrap carries the exact pair") is still proven by:
  - the START, START_HELD, START_RELEASED and UPDATE_ACCEPTED pair rows;
  - the `studio_guided_materialization_deliveries.context_metadata` rows.
- The 2-delivery count only proves that the rebootstrap was real: the first push was withheld for 16 s, past the 15 s deadline, so a bounded retry ran under the same CONTEXT_PENDING phase.
- This is not lower authority, **provided the observation is isolated to the mixed session.**

### 2.2 Why the patch is NACKed: the key is not session-unique (verified from code)
- `bootstrapIdentity.scopeHash` = `hash(session.scope)` (GuidedSessionService:649).
- The scope is built from {sourceRevision, configurationRevision, environmentId, applicationId, csiId, modelDataPolicyId, valueTransferPolicyId, principalId, approvedOrigins, capabilities} (GuidedProductionSessionAccess:60-82). It has **no sessionId or testId**.
- B1D-01 uses `ready(0)` and no `edit4`, so the base and mixed sessions share the same revisions, CSI, principal and policy. Their scopeHash is therefore the same.
- `b1Recording = true` is set at ReplayIT:11696, **before** the base `startLearning` at :11729. So the base session's own committed bootstrap delivery is recorded under the same key.
- Consequences (inferred, not run):
  - With a real rebootstrap, the list has 3 entries, so the test goes red on correct behaviour.
  - Worse, if the mixed session made only **one** delivery, the list is [base, mixed] and `ack == deliveries[1]` holds. That is a **false green**: exactly the substitution this check must not allow.

**Required changes (B1D-01):**
1. Reset `B1_BOOTSTRAP_DELIVERIES.clear()` in `b1Parent` immediately before the mixed-session `publicCall(".../guided-sessions", start, 202, …)`, after `p3AwaitTeardown(original)`. Keep the clear in `b1ResetInstruments`.
2. For each committed delivery, record `deliveryId`, `GuidedContracts.hash(identity)` and `GuidedContracts.hash(context)`. Then assert:
   - exactly 2 entries;
   - the two ids are distinct;
   - both identity hashes equal the persisted `metadataAcknowledgement.identityHash`;
   - both context hashes equal `metadataAcknowledgement.contextHash` (the same pending context was re-delivered);
   - `metadataAcknowledgement.deliveryId == entries[1].deliveryId` and `!= entries[0].deliveryId`.
3. Keep `phase == READY`. Keep the existing `UPDATE_ACCEPTED >= 2` and START_HELD/RELEASED assertions unchanged.

### 2.3 Is the marker replacement a product defect? No.
- translation-design.md REL-001 and the metadata-ACK paragraph define delivery attempts as **"private bounded"** attempts committed before each delivery. READY must persist a private `metadataAcknowledgement` with the delivery attempt ID and the canonical pending-context hash. The code does exactly that (:627-637).
- No spec or contract I found requires attempt history to survive READY.
- The only other reader of `deliveries[]` is `refusedBootstrapSession` (:2512-2528). It reads them only on FAILED, and a FAILED session never reaches READY, so nothing is lost on that path.
- At most this is an observability note (the attempt count is gone after READY). It is **not** a defect and does not need to go to Aria to unblock B1D-01.

## 3. B3B-2: drift-first page `<span role=status>` → `<output role='region'>`

- **B3B-2 is the joined drift-first case.** Its body is `incrementalJoined("drift-first")` plus B3 hooks (ReplayIT:4027). It uses the same oracle as the parameterized label: `drifted` includes `drift-first`, with DRIFT, `effective 0`, `initial 3` (:13191-13195), plus the drift-first block at :13295.
- A separate page for B3B-2 would **not** isolate anything. The frozen joined label would stay on a page that cannot drift and would keep failing at the same BOUNDARY≠DRIFT assertion.
- **Was drift-first ever green? No (verified).** All 10 recorded result files list `incremental joined drift-first` as FAIL. The latest one (merge-h7h3) failed earlier, on the H8 restart guard ("Prior generation … no restart authorized"). No green proof is invalidated.
- So the fixture never realized its design intent: drift at the first-step read. Dex's guard-identity trace is consistent with the runner source I read:
  - `output` gets native role `status` (observationCollector.ts:366);
  - explicit `region` is a supported role (:189);
  - read eligibility is tag OUTPUT or role status (:230), so the OUTPUT tag keeps the read grant;
  - the model fixture relearns by name and uses the node's observed role (ReplayIT:29758-29763).
- **The frozen inventory freezes labels and oracles, not fixture bytes.** Correcting a fixture so it realizes its declared intent, inside a branch used only by `drift-first`, is lawful. No other variant is touched: the `assert-fail` selector `output[aria-label=…]` still matches.

**Conditions:**
- (a) Execute both `incremental joined drift-first` (low lane, 35-label method) and B3B-2 in Chromium on the patched file. Both must show:
  - switch DRIFT, `effective_step_index 0`, `next_ordinal 1`;
  - TARGET_DRIFT at the read (ordinal 1), with the navigate retained (`retainedPrefixAdmissionIds` 1);
  - the drift-first block at :13295 green.
- (b) Disclose the fixture byte change in that run's manifest as a fixture correction to the frozen `drift-first` label: old and new branch text, plus the ReplayIT hash.
- (c) Static only so far. If Chromium does not drift, return to Dex. Do not change the oracle.

## 4. The 202 reads (B1) vs publish-first (B2A-01): both lawful and consistent
- **Single rule:** the expected status must equal the contract projection.
  - `GuidedSessionController#result` returns 202 when `publication.status == PENDING`, else 200.
  - openapi `readGuidedResult` defines 202 as "Pending publication".
- **Where the test publishes first:**
  - The clause is about a pre-publication projection, so the read stays mid-run and must expect 202, with PENDING pinned:
    - B1B-02: after `awaitFinalizing`. Publication happens only through explicit `/finalize`, so this read is deterministic.
    - B1D-02, first read: held at ADMIT.
    - B1B-05: running, after release. A failure here would show up as a real red, not a masked one.
  - The read belongs to the post-publication recording or sinks, so the test publishes first and expects 200:
    - B2A-01, via `assertGuidedLearnRunRecorded`. This matches every pre-existing caller (e.g. :15718→15719) and the "A28-5 original OBS-007 sink set".
- **B1D-02 second read:** this read is unheld and genuinely races the failure. `b1ResultPerContract`, which asserts status == (PENDING ? 202 : 200) and validates v3/result, is lawful.
  - It bypasses `publicCall`, which only records C5 capture HTTP.
  - B1 cuts assert that `c5Capture` is null, so no sink is lost.
  - The `relearnedFrom` oracle is unchanged, and `b1AwaitTerminal` still pins the terminal outcome.
- **Wording correction for B2A-01:** the sinks are not a strict "superset". They now hold the post-publication `/result` instead of the PENDING one, which is the same as the OBS-007 reference set. Acceptable, no change required.

## 5. B2A-04 / B2B-02 moved to the 2048 lane (reverses b2ab design §6.1)
- **The arithmetic** is from Dex's summary of the failed run: modelProposals 8, output 32000, extraPolls 0. I did not re-open the per-session failed state.
  - 1 SOURCE_PLAN + 8 NEXT_ACTION = 9 calls.
  - 9 × 4000 = 36000 > 32000, so the program can never fit on the default lane.
  - 9 × 2048 = 18432 fits.
  - This is the same situation as Core05, and the ruled remedy is the same: change the lane, never the caps.
- **The design reason no longer holds (verified).** §6.1 reversed a re-lane of secret subjects "onto 2048 untested". That is now tested: B1C-02 `incrementalPrefixPolicyRefusalsNeverBecomeDrift` runs a `p3Case` LOGIN secret base learn plus `p3Publish` in `guidedIncrementalTest`, and it **PASSED** in `backend-merge-new22-low-attempt01`.
- **No lane-specific constants:** neither moved method contains 4000/2048/profile/`modelOutputTokens` (grep over :7282-7539 and :8138-9005).
- **Conditions:**
  - (a) Apply the Java `INCREMENTAL_METHODS` hunk and the Gradle hunks atomically.
  - (b) The re-run must show the derived partition counts (default 46 / low 62) and a once-only union against the frozen inventory.
  - (c) B2B-02's IPC P08 / ledger-68 privacy proof now depends on the **low-lane** final scans (`scanFinalOwnedSinks`, `scanFinalAuditBoundary` in `@AfterAll`). They must be green in that run.
  - (d) The low-lane class-level `executionError` (Testcontainers "Mapped port …") must be resolved before any credit. A run with a lifecycle error gives no privacy credit.

## 6. B2A-02: password-rotation timing
- Ledger 45 is "the version-1 use survives the suffix version-2 ACK". Every A45 oracle stays at the same point:
  - **A45-1 at the held v2 ACK:** the v1 action and proof have `contextRevision 1` and the v1 hash; RELEASE carries the read `vault_version`; USAGE USED is 1.
  - The **real Vault rotation (`p3Seed(scope, rotated)`) still happens at the cut.**
  - **A45-2 at ACK and after terminal settlement:** the audit is byte-equal, the v1 action bytes are unchanged, and there are no false usage rows.
  - **A45-3:** lost ACK plus live recheck add nothing.
  - **No suffix or finalize read.**
- Only the **fixture site's** accepted password moves, to just before `p3Execute`. That models a target system that still accepts the already-filled v1 value during the suffix. Ledger 45 makes no claim about the site rejecting v1, so the old timing was a design bug: it made the suffix Sign-in fail and the passive-acquisition poll cap run out (32 polls).
- The new pin **strengthens** the proof. `P3_RECEIPTS` is cleared before the mixed start (:6829), and `/p3/login` POST is the only writer (:24907). The pin asserts exactly one suffix sign-in, accepted, that submitted `used`. That is effect-level evidence that the v1 use survived the v2 ACK.
- The ordinary-replay `getLast()==rotated` oracle is unchanged.
- **ACK.**

## 7. B1C-03 (provisional, no hunk)
- The three DESTRUCTIVE_VERB refusals are the method's own oracle, and the body pins exactly 1 per sub-session.
- Registering `{DESTRUCTIVE_VERB:3}` is consistent with AC-4 if both hold:
  - it is keyed to that exact method name, as a non-parameterized method;
  - the count is exact (3), not a minimum.
- Wildcards or `>=` are not acceptable. Final acceptance waits for the tally of an executed run.

## 8. Not verified by me
- No test, compile or browser run.
- The 2048 call count was taken from Dex's run summary.
- The B1D-01 base/mixed collision is a static inference from the scope construction plus the recording window. I did not observe it at runtime.
- Dex-W may change the live files after these hashes were taken.
