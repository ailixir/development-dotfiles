# B2a + B2b: secret-prefix Vault oracles, version-1 lineage, append retry/expiry, private canaries

Aria (@architect), read-only design. Root remains Orion. Written 2026-10-15 local / 2026-10-16T02:34Z.

**HOLD.** A backend Gradle validation run was live while this was prepared. Nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`, `package.json` or `AGENTS.md` was written. No Gradle, pnpm, Node, JVM, database, Docker or test command ran. Only source and evidence documents were read and hashed. The only writes are this file and `manifest.json` in this directory. This design releases no source, grants no QA credit and changes no lifecycle. Every proposed method is planned and has not run.

## 0. Verdict in one paragraph

Six new ReplayIT methods are recommended. Four are B2a methods in the default `test` lane (the P3 secret family, profile `original4000`): the two planned ones plus one method for each explicit OPEN. Two are B2b methods: one in the low `guidedIncrementalTest` lane (ten-step append family) and one in the default lane (P3 combined family). **No production seam is needed.** Every cut, fault and knob is test-owned: Java fixture state, the in-JVM fake Vault, the P3 page and model fixture, the in-JVM provider, and the test-owned JS wrapper `incrementalNativeFaultObserver()` inside ReplayIT. Four clauses cannot be lawfully proven in-repo. Section 9 lists them, and none is weakened.

| ID | Method | Lane | Ledger subjects (index0) |
|---|---|---|---|
| B2A-01 | `incrementalSecretPrefixPreservesEveryVaultFaultOracle` | default `test` | 28 |
| B2A-02 | `incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck` | default `test` | 45 (and 18's "old preparation joins old version" for the secret action) |
| B2A-03 | `incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent` | default `test` | OPEN "exact worker current-access guard ... separate secret-bearing parent" (access-mapping decision) |
| B2A-04 | `incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation` | default `test` | OPEN "combined secret-use grant revocation at fresh-producer ACK cut" |
| B2B-01 | `incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority` | low `guidedIncrementalTest` | 18, 46, 77 |
| B2B-02 | `incrementalPlainAndContextCanariesRemainPrivateAcrossMergedPublication` | default `test` | 68, IPC P08 |

Inventory delta: +5 default identities and +1 low identity. The resume plan projected 2 + 2 for B2a/B2b. The +2 difference is the two OPEN subjects, which previously had no method. This adds to whatever B1a–B1d register. The 80 original identities, the 35 labels, the five PFXSYNC methods and the `append-input` pending-accounting transfer stay byte-for-byte untouched.

## 1. Verified source facts this design depends on

All facts below were read in the current tree (hashes in `manifest.json`).

1. **Prefix secret path.** `GuidedTranslationService.advancePrefix` (d8c494b2) issues the next coordinate. It then calls `dispatch.pushContext` at line 398 (runner `update`, a same-version context). The post-I/O `sessions.translationTransaction` at **line 405** follows, then `preparePrefix`, `storePreparation`, `admit` and `GuidedDispatchService.dispatch`. `dispatch` resolves the secret through `VaultStudioReferenceResolver.resolve`. `recordSecretDecision` writes RELEASE. An origin mismatch goes to `refuseResolvedSecret` (FAILED, `ORIGIN_NOT_ALLOWED`, `guidedNoSend` → USAGE `REFUSED`). `SecretTooLongException` gives `SECRET_TOO_LONG`. Otherwise `runner.sendSecret`. `preflight` (names only: `mayUse`, then `listSecretNames`) runs at session start in `GuidedProductionSessionAccess.resolve` and in `prepareAndAdmit`. **It does not run in the prefix path.**
2. **Worker current-access guard.** `GuidedSessionService.translationTransaction` (line 151) calls `access.checkCurrent` first. `GuidedProductionSessionAccess.checkCurrent` (lines 116–136) requires `secretUse.mayUse(principal,csi,environment,referenceName)` for every frozen-manifest `secretRef`. Otherwise it refuses `SECRET_USE_REVOKED`/409. Public Core ownership (`ownership.canExecute`) lives only in `resolve`/`checkUser`.
3. **Renewal is a second revocation observer.** The worker claim/renewal path calls `SecretRevocationSweep.guidedRevoked(id)` before `checkCurrent`. `recheck` also tests manifest `secretRef` grants when nothing has been released, and stops the session through `secretRevoked` (CANCELLED, `errorCode=SECRET_USE_REVOKED`, `revoked_at` set). Lease length is 30 s (`clock.instant().plusSeconds(30)`).
4. **Default-tuple trap.** ReplayIT `controlledLoginEntitlement()` (line 1938) grants `(primaryCsi,"fixture",PASS)` unconditionally, OR-ed with `p3Entitled`. `(primaryCsi,"fixture-other",PASS)` is revocable through `P3_PERMITTED` only. `seedGovernedPolicies(primaryCsi)` seeds both `POLICY` and `P3_OTHER_POLICY`, and `p3CoreCookie` owns `primaryCsi`. So `(primaryCsi,"fixture-other")` is a genuinely isolated non-default tuple that the fixture already supports. It is also budget-isolated per `p3Case` (fresh `CSI-P3-n`), so B2a never touches shared `CSI-456`.
5. **Audit mapping.** `SecretAuditLifecycle`: `guidedOutcome` gives USAGE `USED` iff outcomeCode `OK`, otherwise `UNKNOWN_OUTCOME`. `guidedNoSend` gives `REFUSED` (backend decision before any frame). `guidedTerminal` writes one `recordUnreachedGuided` per declared `secretRef` with no consumed admission. It joins consumed actions to `studio_guided_materialization_snapshots` on the **action's own** `contextRevision` and `authoredInputsHash`. That join is exactly the v1-after-v2 hazard ledger 45 guards.
6. **Append guard is in PostgreSQL.** V21 `studio_015_materialization_*` refuses an append (`context_revision+1`) while a delivery is pending, a prefix is pending, any action is ADMITTED/DISPATCHING/UNKNOWN_OUTCOME, **or any `studio_guided_preparations` row has `admission_id IS NULL AND expires_at>clock_timestamp()`**. The continuation must be MATERIALIZE. A same-version metadata bump during a pending delivery raises `context delivery pending`. The runner independently refuses an appended `update` while any local preparation is unexpired (`BUSY`).
7. **Append identity.** `finishSuffixMaterialization` calls `sessions.materialize(controller,id,fence,"suffix-materialize-"+planRevision,refs)`. `internal(...)` deduplicates by key and digest. `freeze` leaves the version unchanged when every reference already exists. `pushContext` re-sends the PENDING delivery id. The runner returns its stored acknowledgement for a repeated delivery id (`contextAcknowledgements`).
8. **Preparation authority.** `GuidedPreparationStore.authorize` selects only `admission_id IS NULL AND expires_at>now` rows matching the proposal digest, then requires identical `contextRevision`/`authoredInputsHash`. `GuidedMaterializationService.verify(session,envelope)` refuses a crossed `contextRevision` (`STALE_FENCE`). `storePreparation` caps `proof.expiresAt` at the current `owner.leaseExpiresAt`.
9. **Coordinator retries.** `GuidedTranslationCoordinator.continueRuns` polls every 1 s and ignores the status. `/internal/v2/**` is **not** covered by `IdempotencyFilter` (`COVERED_PATHS` are `/api/v1/**` only), so a refused `/plans` is re-executed on the next poll.
10. **Model projection.** `GuidedPromptAssembler` sends `authoringContext`, which is the **text** context entries only (`GuidedSourceClassifier.safeContext`). Model inputs are value-free `{inputId,sourceStepId,kind,intendedSlot}` (`capturePromptInputsLocked`). `LiteralInput` and variable values are never in the model context. The `InputRecipe` schema has no value field (`replay-operation.schema.json`), so published artifacts are value-free by contract.
11. **Native prefix faults** (studio-runner `secret-login.test.ts`, native03). Zero or two password controls make `preparePrefix` reject (`PASSWORD_TARGET_ABSENT`/`AMBIGUOUS`) and stop the runtime (CONTEXT_LOST). This is **not** a drift. Focus type-flip (`/trap`) and native bad-origin give a ledger `UNKNOWN_OUTCOME` after INVOKING. The alias-origin native case is unreachable in the joined path, because the backend's exact Vault-origin check fires first (fact 1). The joined bad-origin oracle is therefore the backend `ORIGIN_NOT_ALLOWED`.
12. **Instrumentation.** `incrementalNativeFaultObserver()` is appended unconditionally to the guided worker wrapper (`p3GuidedLaunchCounter`), in both lanes. `pfxRead` validates a **closed** mode list. `pfxSelect` requires `next.producers.length>0` plus a prefix `fill` at the control step (the fresh-producer selector). The finalize/planning diagnostic resolver records `/plans` `GuidedSessionException` stack frames to `finalize-exception-N.json`.
13. **Fixtures.** The P3 page (`p3LoginDocument`) has no `<title>` and a single password control. The `/obs015-ack` handler holds the appended (contextRevision 2) runner update per session and replies 503 on timeout, which makes the JS wrapper throw `CONTEXT_LOST` after the runner already applied and stored its ACK. `model()` routes `p3Mode != null` to `p3Model` and `incrementalTenScenario` to `incrementalTenModel`.

## 2. Exact ledger mapping

Ledger text is verbatim from `validation-ledger.json` (sha 429b4fc7). Each assertion ID below is used in the code comments.

### Ledger 28: `IncrementalRelearnIT.secretPrefixPreservesOBS007Oracles`
Tier: "REAL JOINED password fixture + test Vault". Assertions: "Prefix secretRef fill uses recorded handle/password-only adapter; preflight and release/use audit joined to new session; current secret resolved per existing OBS007 rules; planted bytes absent from model/log/evidence/video; bad origin/0or2 passwords/type-flip/oversized/revoked secret fail unchanged; no literal/spanning token lowering".

| Clause | Assertion IDs (B2A-01) |
|---|---|
| recorded handle / password-only adapter | A28-1: the mixed TWO/1 proposal target kind is `passwordControl` and the operation value is `secretRef` with the frozen inputId. The prefix request is issued from the base program (`studio_guided_prefix_requests`). It runs on the same guided browser (one `P3_NATIVE_SESSIONS` entry, one launch-counter increment). There are 0 model attempts before the switch. |
| preflight joined to new session | A28-2: mixed start adds exactly one `CountedLoginVault.lists` entry for the mixed scope and the `P3_MAY_USE` entries for the session principal and tuple, with **zero value reads at start**. A28-3: every RELEASE/USAGE row for PASS carries `session_id` = mixed, `admission_id` = the mixed TWO/1 admission and `source_reference_id` = the mixed manifest PASS referenceId. No row of the mixed run names the base session. |
| current secret per OBS007 | A28-4: exactly one Vault value read during the mixed run, at dispatch, of the post-base rotated value. Boolean equality only against the P3 receipt. `vault_version` equals the version returned by that read. |
| planted bytes absent | A28-5: the original, rotated, bad-origin, oversize and type-flip canaries (all variants via `canaryByteVariants`) are absent from `collectJoinedSinks` (PG tables, gateway, guided/ordinary logs, journal/scratch/objects including video, prefix-sync files), from `P3_FINAL_REPORTS`, and from mixed public responses (`/guided-sessions/{id}`, `/result`). All `COUNTED_VAULT` arrays are erased. |
| fault matrix "fail unchanged" | A28-6..A28-11, table in §4.1. |
| no literal / spanning lowering | A28-12: merged artifact plan TWO/1 has value `{kind:secretRef}` on a `passwordControl` target. No `inputRecipes` entry and no mixed `studio_guided_materialization_inputs` row with `sourceSpan` provenance on step TWO overlaps the UTF-16 range of `<secret PASS>`. No `nonsecretText`/`destination` input has `secretId`. |

### Ledger 45: `IncrementalMaterializationIT.secretLineagePinsActualHistoricalVersion`
Tier: "Postgres+runner secret fixture". Assertions: "Secret read/release/use proves action version1 after headversion2; original release/usage unchanged; no false NOT_USED/REFUSED on stale/lost response".

| Clause | IDs (B2A-02) |
|---|---|
| action version 1 after head version 2 | A45-1: the TWO/1 action has `contextRevision=1` and `authoredInputsHash` = versions[0] hash. Its preparation proof is `contextRevision=1`. After the v2 append the versions table has 2 rows and delivery `ACKNOWLEDGED` with `ack.contextRevision=2`. The action still equals its pre-append bytes. |
| release/use unchanged | A45-2: canonical hash of all `studio_secret_use_audit` rows for the mixed session is identical at the held v2 ACK, after ACK, after finalize and after terminal settlement. That is exactly 1 RELEASE `RESOLVED` with `vault_version` = the read's version (not the post-fill Vault rotation) and exactly 1 USAGE `USED` linked by `release_id`. |
| no false NOT_USED/REFUSED on stale/lost response | A45-3: the real `GuidedSessionService.lostAcknowledgment(id, v1Admission)` and `SecretRevocationSweep.guidedRevoked(id)` (grant present) run after v2 ACK. `guidedTerminal` runs at finalize. All of them add 0 rows, and 0 `NOT_USED`/`REFUSED`/`UNKNOWN_OUTCOME` rows exist for PASS. |

### Ledger 18: `IncrementalMaterializationIT.appendedSuffixInputPreservesEarlierEvidence`
Tier: "Java + Postgres + runner metadata". Assertions: "A3 initial prefix version and suffix sourceSpan append; old input records/id/values unchanged; old preparation joins old version; append retry once; illegal replacement rejected". The remaining subject per requirement-map is "Duplicate same append request/dependency request at real application authority must prove one immutable append/delivery".

IDs (B2B-01):
- A18-1: duplicate `materialize` with the same production key and body returns the identical stored response, with 0 writes.
- A18-2: same key with a mutated body gives `IDEMPOTENCY_CONFLICT`, with 0 writes.
- A18-3: a fresh key with the same body adds no version, input or delivery.
- A18-4: a lost v2 ACK response is followed by one coordinator retry, which re-delivers the **same** delivery id and receives the runner's stored ACK. Result: one delivery, one v2 version.
- A18-5: every completed v1 preparation still joins v1 (`proof.contextRevision=1`, its hash = versions[0]) and its admitted action. The publication-preparation snapshot is unchanged across the append.
- "Illegal replacement rejected" stays credited to the retained `assertIncrementalImmutableSourceAndPlanHistory` (UPDATE refusals) in the 35-label method. It is not duplicated.

### Ledger 46: `IncrementalMaterializationIT.stalePreparedCommandCannotCrossAppend`
Tier: "Postgres concurrent callbacks". Assertions: "Unexpired/unconsumed prep blocks append; expired old prep cannot admit/consume after new ACK; completed old prep remains verifiable".

IDs (B2B-01):
- A46-1: a real runner preparation is stored by the real controller service while the suffix SOURCE_PLAN is in flight. With continuation MATERIALIZE, the production append (coordinator plus a direct call with the exact production key) is refused. Versions stay 1 and deliveries 0 for at least 2 coordinator polls.
- A46-2: after **natural** expiry (no clock or SQL time change), the same coordinator appends v2.
- A46-3: after the v2 ACK, the old proposal is refused at `admit` with 0 writes. `GuidedPreparationStore.authorize` gives `STALE_GENERATION` (expired). `GuidedMaterializationService.verify(oldProof)` gives `STALE_FENCE` (v1 vs v2). The preparation stays `admission_id IS NULL`, and no ledger or action references it.
- A46-4 = A18-5.
- Consume crossing is structurally unreachable (§9, item 3).

### Ledger 77: `IncrementalDependencyIT.cumulativeAllocationAdapterPreservesPendingDeliveryOrder`
Tier: "PG+runner". Assertions: "Firstsuffix narrower effective need causes cumulative union raw allocator request, not409shrink or historyrewrite; addnewconsumer beforeappend, preserve old metadata/proofs; stable retries no duplicate append/keybody mutation; no allocation bump during pendingACK/rebootstrap/browserrestart."

IDs (B2B-01):
- A77-1: during the held v2 ACK, `cumulativeAllocationRequest(narrow need)` returns consumers ⊇ the stored allocation consumers. There is no 409, and the allocation and producer rows are byte-identical.
- A77-2 = A18-1..A18-4.
- A77-3: a same-body `allocateBinding` during the pending ACK writes nothing (allocation, materialization_revision and delivery unchanged).
- A77-4 (sibling parent): owner/browser loss through the authenticated `GuidedDispatchService.stop(…,"LEASE_LOST")` while the v2 ACK is pending adds 0 versions, 0 deliveries, 0 allocation/producer/materialization_revision changes and 0 actions or preparations.
- "Add new consumer before append" is evidenced by the allocation row's consumers already containing the prefix consumers before v2 (A77-1 baseline). The retained `bump()` REVISION_CONFLICT guard in `assertPendingContextGuardsThenRelease` stays credited and is not duplicated.
- Restart **continuation** identity is not provable (§9, item 2).

### Ledger 68: `SnapshotBasisPrivacyIT.authoringSourceNeverEscapesPrivateValidation`
Tier: "source+HTTP+runner no-leak fixture". Assertions: "Secret and referenced plain value canaries absent corrected purebasis declarations/provider/public/log/media sinks; IDs and valueHash present. Authored context source may enter internalvalidation only. Real originalOBS007 sinks remain mandatory; no rawmaterialization input values copied."

IDs (B2B-02):
- A68-1: the raw publication evidence `snapshotEvidence.current.authoredDeclarations` contains USER with a 64-hex `valueHash` and no value, and PASS with `secretId` and no value.
- A68-2: PLAIN, PASS and ORDER canaries are absent from the whole raw evidence document, the gateway (raw `MODEL_WIRE` and decoded contexts), public responses, logs (guided/ordinary/audit stream), media/journal/scratch, the artifact column and the forbidden PG sinks (§6.2).
- A68-3: CTX_TEXT and CTX_LITERAL are present in raw evidence **only** under `snapshotEvidence.current.authoring` (positive control). CTX_LITERAL is absent from every gateway context. CTX_TEXT appears in a gateway context **only** inside `authoringContext[]` (the approved text projection, fact 10). No gateway context has `authoringSnapshot`/`authoredDeclarations`/`snapshotEvidence`/`configurationValues`. Both are absent from public, log, media and audit sinks.
- A68-4: `materializationEvidence.entries[*].metadata` has no `value` and contains no canary.
- A68-5: the original OBS-007 sinks (`p3Scan`, the final whole-class scan, audit stream) run unchanged.

### IPC P08 (requirement-map `IPCfacets[P08]`)
"Private canaries in fresh read/resolved secret/input values with retained proof → No proof enrichment; current withholding/clear/usage behavior; provider/log/report/result/media/argv/env outputs do not contain values".

IDs (B2B-02):
- AP08-1: the ORDER (fresh read), PASS (resolved secret) and USER (input) canaries are absent from provider, log, report (`P3_FINAL_REPORTS`), result (`/result`, `/executions/{id}`), media, and the **argv/env** of the live ordinary compiled child and the guided worker (`ps eww`).
- AP08-2: no proof enrichment. The raw evidence materialization entries are metadata-minus-value, and publication preparation proofs contain no canary.
- AP08-3: withholding works: no PG observation, action or proposal row contains the USER or ORDER value.
- Runner pure/executor tiers (Node15 `released-values-are-outside-inert-proof`) stay separately credited.

## 3. Shared test-only fixture extensions (ReplayIT only)

Every knob below defaults to the current behavior. With knobs at their defaults, the produced bytes are identical, so the original 80, 35 and 5 identities are unaffected.

### 3.1 Knobs and records (field section near `P3Mode`)

```java
  // B2a/B2b (STUDIO-OBS-015 b2ab-design01): test-owned page/model/cut knobs; defaults reproduce current bytes.
  private enum B2aPasswordPage { SINGLE, NONE, TWO, TYPE_FLIP }
  private static volatile B2aPasswordPage b2aPasswordPage = B2aPasswordPage.SINGLE;
  private static volatile boolean b2Combined, b2aTitleSuffix;
  private static final List<String> B2_ORDER_VALUES = new CopyOnWriteArrayList<>();
  // Private fixture receipts (like P3_RECEIPTS); never a production sink, never printed.
  private static final List<String> B2_REFERENCE_RECEIPTS = new CopyOnWriteArrayList<>();
  private static final List<JsonNode> B2_MODEL_CONTEXTS = new CopyOnWriteArrayList<>();
  private static final java.util.Set<String> INCREMENTAL_ACK_LOSE = java.util.concurrent.ConcurrentHashMap.newKeySet();
  private static final java.util.concurrent.ConcurrentMap<String, B2bPlanHold> B2B_PLAN_HOLDS =
      new java.util.concurrent.ConcurrentHashMap<>();
  private static volatile java.util.concurrent.CountDownLatch b2bSignInHold;
  private static volatile java.util.concurrent.CountDownLatch b2bSignInEntered;

  private static final class B2bPlanHold {
    final java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(1);
    final java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
    final AtomicInteger hits = new AtomicInteger();
    volatile Throwable failure;
  }

  private record B2SecretCut(String sessionId, JsonNode request, String requestDigest, String principal,
      int preparations, int actions, int reads, int lists, int receipts, int models, String audit) {}
```

Reset in `p3Case` `finally` (confirmed branch), next to the `P3_*` resets: `b2aPasswordPage = B2aPasswordPage.SINGLE; b2Combined = false; b2aTitleSuffix = false; B2_REFERENCE_RECEIPTS.clear(); B2_MODEL_CONTEXTS.clear(); b2bSignInHold = null; b2bSignInEntered = null;`. `B2_ORDER_VALUES` stays (append-only, like `VALUES`, for the final scan).

### 3.2 Page fixture (`p3LoginDocument`, `p3Application`)

```java
  private static String p3LoginDocument() {
    if (p4PasswordControls >= 0) { /* unchanged P4 branch */ }
    B2aPasswordPage page = b2aPasswordPage;
    String passwords = switch (page) {
      case NONE -> "";
      case TWO -> "<input name='password' type='password'><input name='password2' type='password'>";
      default -> "<input name='password' type='password'>";
    };
    // Same semantics as the OBS-007 fixture /trap (studio-runner/test/fixtures/secret-login/server.ts:37).
    String trap = page == B2aPasswordPage.TYPE_FLIP
        ? "<script>document.querySelector(\"input[type=password]\").addEventListener(\"focus\","
            + "event=>event.target.type=\"text\")</script>" : "";
    if (b2Combined) {
      String fresh = "  b2-order-" + UUID.randomUUID() + "-é  ";
      B2_ORDER_VALUES.add(fresh); VALUES.add(fresh); // private observed value: final whole-class scan
      return "<main aria-label='Operations'><output aria-label='Order reference'>" + fresh + "</output>"
          + "<form method='post' action='/p3/login'><label>Reference<input name='reference'></label>"
          + "<label>User<input name='username'></label>" + passwords
          + "<button type='submit'>Sign in</button></form><button type='button'>Reports</button></main>" + trap;
    }
    return "<form method='post' action='/p3/login'><label>User<input name='username'></label>"
        + passwords + "<button type='submit'>Sign in</button></form>"
        + "<button type='button'>Reports</button>" + trap;
  }
```

In the `p3Application` POST `/p3/login` branch, right after `P3_RECEIPTS.add(...)`:

```java
        if (b2Combined) B2_REFERENCE_RECEIPTS.add(values.getOrDefault("reference", ""));
        java.util.concurrent.CountDownLatch b2Hold = b2bSignInHold;
        if (b2Hold != null) {
          java.util.concurrent.CountDownLatch entered = b2bSignInEntered;
          if (entered != null) entered.countDown();
          try { if (!b2Hold.await(20, java.util.concurrent.TimeUnit.SECONDS)) b2bSignInHold = null; }
          catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        }
```

In the response wrapper:
`("<!doctype html><html>" + (b2aTitleSuffix && path.equals("/p3/reports") ? "<head><title>Reports</title></head>" : "") + "<body>" + document + "</body></html>")`.

`<main aria-label='Operations'>` puts the read inside the existing `business-read` grant region (`role main, name Operations, origin ORIGIN`). `P3_OTHER_POLICY` is a deep copy of `POLICY`, so the grant also holds in `fixture-other`. That the combined page satisfies the grant is **inferred** from the grant JSON (VERIFY-1).

### 3.3 Model fixture (`p3Model`, `model`)

In `model()`: `if (p3Mode != null) { if (b2Combined) B2_MODEL_CONTEXTS.add(request.path("context").deepCopy()); return p3Model(result, context, kind); }`. In the `incrementalTenScenario` branch, call `b2bHoldSuffixPlan(kind, context);` before `incrementalTenModel`.

```java
  private static void b2bHoldSuffixPlan(String kind, JsonNode context) {
    if (!kind.equals("SOURCE_PLAN") || !context.has("learningWindow")) return;
    B2bPlanHold hold = B2B_PLAN_HOLDS.get(context.path("sessionId").asText());
    if (hold == null || hold.hits.getAndIncrement() > 0) return; // only the first suffix SOURCE_PLAN
    hold.entered.countDown();
    try { if (!hold.release.await(8, java.util.concurrent.TimeUnit.SECONDS)) hold.failure = new IllegalStateException("B2b plan hold deadline"); }
    catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); hold.failure = interrupted; }
  }
```

`p3Model` SOURCE_PLAN (LOGIN). Replace the fixed TWO/THREE block and the trailing `result.putArray("needs")` with the following:

```java
        boolean windowHasTwo = !context.has("learningWindow");
        for (JsonNode step : context.path("learningWindow").path("learnableStepIds")) windowHasTwo |= step.asText().equals(TWO);
        if (b2Combined) {
          obligations.add(obligation(ONE, 1, "read", "Order reference", null, "order"));
          obligations.add(obligation(TWO, 0, "fill", "Reference", null, "order"));
          obligations.add(obligation(TWO, 1, "fill", "User", 1, null));
          obligations.add(obligation(TWO, 2, "fill", "password", 2, null));
        } else {
          obligations.add(obligation(TWO, 0, "fill", "User", 1, null));
          obligations.add(obligation(TWO, 1, "fill", "password", 2, null));
        }
        obligations.add(obligation(THREE, 0, "click", "Sign in", null, null));
        obligations.add(obligation(THREE, 1, "click", "Reports", null, null));
        obligations.add(obligation(THREE, 2, "assert", "Reports", null, null).put("predicate", "visible"));
        if (b2aTitleSuffix) {
          for (JsonNode step : context.path("sourceSteps")) {
            String text = step.path("text").asText(), sentence = "Check page title is Reports.";
            int at = text.indexOf(sentence);
            if (!step.path("stepId").asText().equals(THREE) || at < 0) continue;
            int offset = at + "Check page title is ".length(), reference = references.size();
            references.addObject().put("referenceKind", "sourceSpan").put("sourceRevision", context.path("sourceRevision").asText())
                .put("stepId", THREE).put("startUtf16", offset).put("endUtf16", offset + "Reports".length())
                .put("kind", "nonsecretText").put("intendedSlot", "assert.expected");
            obligations.add(obligation(THREE, 3, "assert", "page", reference, null).put("predicate", "title"));
          }
        }
      } else { /* unchanged REPORTS/REGISTRATION obligations */ }
      var needs = result.putArray("needs");
      if (b2Combined && windowHasTwo) {
        var need = needs.addObject().put("needId", "order").put("producerStepId", ONE);
        need.putArray("consumers").addObject().put("stepId", TWO).put("argumentSlot", "fill.value");
      }
      return incrementalSourcePlanWindow(result, context);
```

The read obligation `ONE/1` is emitted only when `b2Combined` is set. Insert it right after the navigate obligation, so obligation order stays coordinate-ordered.

`p3Model` NEXT_ACTION. Insert after `JsonNode obligation = context.path("obligations").get(0);` and the P4 block, before `operationKind`:

```java
    if (obligation.path("operationKind").asText().equals("assert") && obligation.path("predicate").asText().equals("title")) {
      JsonNode input = context.path("inputs").get(obligation.path("referenceIndex").asInt());
      if (input == null || !input.path("intendedSlot").asText().equals("assert.expected")) throw new IllegalStateException("B2 title input missing");
      result.put("status", "ACTION").put("obligationId", obligation.path("obligationId").asText()).putNull("question");
      var action = result.putObject("action");
      action.putObject("target").put("kind", "page");
      action.putObject("operation").put("kind", "assert").put("predicate", "title")
          .putObject("expected").put("kind", "authoredLiteral").put("sourceInputId", input.path("inputId").asText());
      return result;
    }
    if (b2Combined && (obligation.path("operationKind").asText().equals("read")
        || obligation.path("targetIntent").asText().equals("Reference"))) {
      JsonNode node = null;
      for (JsonNode candidate : context.path("observation").path("nodes"))
        if (candidate.path("name").equals(obligation.path("targetIntent"))) node = candidate;
      if (node == null) return result.put("status", "UNSUPPORTED").put("reasonCode", "INSUFFICIENT_EVIDENCE");
      result.put("status", "ACTION").put("obligationId", obligation.path("obligationId").asText()).putNull("question");
      var action = result.putObject("action");
      action.putObject("target").put("nodeId", node.path("nodeId").asText()).putObject("locator").put("kind", "role")
          .put("role", node.path("role").asText()).put("name", node.path("name").asText()).put("exact", true);
      String binding = context.path("needs").get(0).path("bindingId").asText();
      if (obligation.path("operationKind").asText().equals("read")) {
        action.putObject("operation").put("kind", "read").put("bindingId", binding).putObject("recipe")
            .put("kind", "visibleText").put("classification", "permittedBusinessData").put("policyRuleId", "business-read");
      } else {
        action.putObject("operation").put("kind", "fill").putObject("value").put("kind", "binding").put("bindingId", binding);
      }
      return result;
    }
```

### 3.4 Secret-context ACK cut (test JS wrapper; separately named, fresh-producer selector untouched)

Append inside `incrementalNativeFaultObserver()`, after `pfxSelect`. Add one `.formatted` argument, the JSON path of `TEMP/obs015-secret-context-control.json`.

```js
// B2A-03: separately named secret-context ACK cut; never alters pfxRead/pfxSelect/closed PFX modes.
const scControl=%s,scCases=new Map();
function scRead(){
 if(!fs.existsSync(scControl))return null;
 const b=fs.readFileSync(scControl);if(b.length>4096)throw new Error('SC_CONTROL_BOUND');
 const c=JSON.parse(b.toString('utf8'));if(Object.keys(c).length===0)return null;
 if(Object.keys(c).sort().join(',')!=='caseId,mode,ordinal,stepId'||!/^[0-9a-f-]{36}$/u.test(c.caseId)||
  typeof c.stepId!=='string'||!Number.isInteger(c.ordinal)||c.ordinal<0||c.ordinal>31||c.mode!=='SECRET_HOLD')throw new Error('SC_CONTROL_SHAPE');
 return c;
}
function scSelect(runtime,next){
 const control=scRead();if(!control||scCases.has(control.caseId))return null;
 const program=next?.prefixProgram;
 if(!program?.actions?.length||next.contextRevision!==1||runtime.prefixExited||!runtime.hasSecretInputs)return null;
 const at=program.actions.findIndex(a=>a.coordinate.stepId===control.stepId&&a.coordinate.ordinal===control.ordinal);if(at<0)return null;
 const target=program.actions[at];
 if(target.operation.kind!=='fill'||target.operation.value?.kind!=='secretRef'||target.guard?.target?.kind!=='passwordControl')return null;
 for(let i=0;i<program.actions.length;i++){const a=program.actions[i],done=(runtime.ordinals.get(a.coordinate.stepId)??0)>a.coordinate.ordinal;
  if((i<at)!==done)return null;} // exactly: every earlier action executed, the secret coordinate and later not yet
 const c={...control,sessionId:next.sessionId,browser:runtime.browser,observations:runtime.browser?.observations,count:1};
 scCases.set(control.caseId,c);return c;
}
```

In the `update` wrapper, after the `pfx` block, add `const sc=pfx?null:scSelect(this,args[0]);` **before** `Reflect.apply`, and after it:
`if(sc){await pfxEvent(sc,'UPDATED_BEFORE_ACK',this,args[0]);await pfxSignal(sc,args[0],'AFTER');await pfxEvent(sc,'ACK_RELEASED',this,args[0]);}`.

In the `preparePrefix` wrapper add `const sc=[...scCases.values()].find(c=>c.sessionId===args[0]?.request?.sessionId&&c.stepId===args[0]?.request?.coordinate?.stepId&&c.ordinal===args[0]?.request?.coordinate?.ordinal);if(sc)await pfxEvent(sc,'TARGET_PREPARE_ENTER',this,this.context);`. In the `dispatch` wrapper, add the same lookup with `request.proposal.coordinate` and `TARGET_DISPATCH_ENTER`.

`pfxEvent`/`pfxSignal`/`prefixSyncCallback`/`PREFIX_SYNC_CUTS` are reused unchanged. Mode `SECRET_HOLD` is held because the Java callback holds `AFTER` for every mode except `BUSY`. Event rows keep the closed 9-key shape and are scanned by `collectJoinedSinks` (`obs015-prefix-sync-*`). `runtime.ordinals`, `prefixExited` and `hasSecretInputs` are real runtime fields (`studio-runner/src/guided/runtime.ts` 23d89e6d, lines 66, 72, 85). TS `private` is compile-time only. **No dist or runner source change.**

### 3.5 `/obs015-ack` lost-response option

After the existing `release.await(...)`, add `if (INCREMENTAL_ACK_LOSE.remove(id)) delivered = false;`. That reuses the existing 503 to `CONTEXT_LOST` path, after the runner has truly applied and stored its ACK. The default (empty set) is byte-identical.

### 3.6 Small helpers

```java
  private static void writeOwnedControl(Path file, JsonNode value) throws Exception { // generalizes writePrefixSyncControl
    byte[] bytes = GuidedContracts.canonical(value).getBytes(StandardCharsets.UTF_8);
    assertThat(bytes.length).isLessThanOrEqualTo(4096);
    if (!Files.exists(file)) Files.createFile(file, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(
        java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")));
    assertThat(Files.isSymbolicLink(file)).isFalse();
    assertThat(Files.getPosixFilePermissions(file)).isEqualTo(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
    Files.write(file, bytes);
  }

  private String b2AuditSnapshot(String session) {
    return GuidedContracts.hash(C.parse(jdbc.queryForObject("SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY to_jsonb(a)::text),"
        + "'[]'::jsonb)::text FROM studio_secret_use_audit a WHERE session_id=?", String.class, session)));
  }

  private long b2AuditCount(String session, String predicate) {
    return jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? AND secret_id='PASS' AND "
        + predicate, Long.class, session);
  }

  private String b2PassReferenceId(String session) {
    for (JsonNode reference : C.parse(jdbc.queryForObject("SELECT manifest::text FROM studio_guided_source_manifests WHERE session_id=?",
        String.class, session)).path("configurationReferences"))
      if (reference.path("kind").asText().equals("secretRef") && reference.path("referenceName").asText().equals("PASS"))
        return reference.path("referenceId").asText();
    throw new AssertionError("frozen PASS secretRef missing");
  }

  /** Exact post-ACK gate: checkCurrent inside translationTransaction entered from advancePrefix:405 (d8c494b2). */
  private void b2AwaitCheckCurrentGate(int after) throws Exception {
    long end = System.nanoTime() + Duration.ofSeconds(20).toNanos();
    do {
      var matches = new ArrayList<JsonNode>();
      for (int n = after + 1; n <= FINALIZE_DIAGNOSTICS.get(); n++) {
        Path file = TEMP.resolve("finalize-exception-" + n + ".json");
        if (!Files.isRegularFile(file)) continue;
        JsonNode row; try { row = C.parse(Files.readString(file)); } catch (RuntimeException incomplete) { continue; }
        if (!row.path("exceptionCode").asText().equals("SECRET_USE_REVOKED")) continue;
        boolean access = false, transaction = false, gate = false;
        for (JsonNode frame : row.path("stackFrames")) {
          String type = frame.path("class").asText(), method = frame.path("method").asText();
          access |= type.equals("com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess") && method.equals("checkCurrent");
          transaction |= type.equals("com.citi.put.checks.studio.guided.session.GuidedSessionService") && method.startsWith("lambda$translationTransaction");
          gate |= type.equals("com.citi.put.checks.studio.guided.translation.GuidedTranslationService")
              && method.equals("advancePrefix") && frame.path("line").asInt() == 405;
        }
        if (access && transaction && gate) matches.add(row);
      }
      if (!matches.isEmpty()) { assertThat(matches).as("one exact post-ACK checkCurrent refusal").hasSize(1); return; }
      Thread.sleep(10);
    } while (System.nanoTime() < end);
    throw new AssertionError("post-ACK worker checkCurrent SECRET_USE_REVOKED not observed; no other revocation observer is credited");
  }

  private JsonNode b2Edit(UUID test, int index, String text) throws Exception {
    JsonNode draft = publicCall("/api/v1/studio/tests/" + test, null, 200, null);
    ObjectNode edit = C.object();
    for (String field : List.of("authoringSchemaVersion", "globalContext", "steps", "name", "description", "csiId", "environment",
        "variables", "configuration", "sourceRevision", "configurationRevision")) edit.set(field, draft.path(field).deepCopy());
    ((ObjectNode) edit.path("steps").get(index)).put("text", text);
    var put = HttpRequest.newBuilder(URI.create("https://localhost:" + port + "/api/v1/studio/tests/" + test))
        .header("Cookie", "put_session=" + COOKIE).header("Content-Type", "application/json")
        .header("Idempotency-Key", UUID.randomUUID().toString()).PUT(HttpRequest.BodyPublishers.ofString(edit.toString())).build();
    var response = HttpClient.newBuilder().sslContext(TLS).build().send(put, HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).isEqualTo(200);
    return C.parse(response.body());
  }

  private P3Publication b2Publish(String id, JsonNode edited) throws Exception { // p3Publish for edited revisions
    int models = MODEL_WIRE.size(), reads = COUNTED_VAULT.reads.size();
    JsonNode published = p3Call(p3Cookie, "/api/v1/studio/guided-sessions/" + id + "/finalize", C.object().put("schemaVersion", 3)
        .put("expectedSourceRevision", edited.path("sourceRevision").asText())
        .put("expectedConfigurationRevision", edited.path("configurationRevision").asText()), 200);
    UUID revision = UUID.fromString(published.path("revisionId").asText());
    String artifact = jdbc.queryForObject("SELECT artifact::text FROM ui_test_revisions WHERE id=?", String.class, revision);
    String hash = jdbc.queryForObject("SELECT artifact_hash FROM ui_test_revisions WHERE id=?", String.class, revision);
    assertThat(independentArtifactHash(C.parse(artifact))).isEqualTo(hash);
    assertThat(MODEL_WIRE).hasSize(models); assertThat(COUNTED_VAULT.reads).hasSize(reads);
    p3AwaitTeardown(id);
    return new P3Publication(revision, hash, artifact);
  }
```

`COOKIE` is used for the draft PUT because `prefixSyncEdit` already uses it for `primaryCsi` (Core fixture returns `primaryCsi` ownership for `user-1`). The session principal stays `user-1`.

## 4. B2a methods

### 4.1 B2A-01 `incrementalSecretPrefixPreservesEveryVaultFaultOracle` (default lane)

Parent: one P3 LOGIN base on `(primaryCsi,"fixture-other")`, learned, published and torn down once. Each fault runs a **separate** real mixed session against that same confirmed base: unchanged source, explicit `firstLearnStepId=THREE`, as in `actualIncrementalSecretPrefixRecapturesRotatedValueWithScopedAuditAndOrdinaryReplay`. Every fault session is terminal, so none publishes, and the base stays the confirmed head for the next fault. Model budget is spent only by the base learn and the final valid control (fresh per-case CSI).

| Fault | Lawful setup (between sessions) | Expected terminal | Δ value reads | RELEASE | USAGE | Other |
|---|---|---|---|---|---|---|
| A28-6 `BAD_ORIGIN` | `VAULT.bindOrigins(SECRET, scope, "PASS", SECRET_ORIGIN)` (approved policy origin, not the page origin) | FAILED, `errorCode=ORIGIN_NOT_ALLOWED` | 1 | 1 `RESOLVED`, version = read | 1 `REFUSED` linked | TWO/1 FAILED `POLICY_DENIED`, dispatchCount 1; 0 `TARGET_DISPATCH`/`NATIVE_*` for TWO/1; 0 receipts |
| A28-7 `OVERSIZE` | `VAULT.rotate(..., 4097-char value)` + `bindOrigins(ORIGIN)` | FAILED, `SECRET_TOO_LONG` | 1 | 1 `UNAVAILABLE` | 1 `REFUSED` linked | value array erased; 0 receipts |
| A28-8 `ZERO` | `b2aPasswordPage=NONE` | terminal non-success (pin code, VERIFY-2) | 0 | 0 | exactly 1 unlinked `NOT_USED` | no TWO/1 action; TWO/1 prefix request never `PREPARED`; 0 model attempts; 0 receipts |
| A28-9 `TWO` | `b2aPasswordPage=TWO` | same as ZERO | 0 | 0 | exactly 1 unlinked `NOT_USED` | same |
| A28-10 `TYPE_FLIP` | `b2aPasswordPage=TYPE_FLIP` | `UNKNOWN_OUTCOME` | 1 | 1 `RESOLVED` | 1 `UNKNOWN_OUTCOME` linked, **0 NOT_USED/REFUSED** | TWO/1 `UNKNOWN_OUTCOME`/`TARGET_CHANGED`, dispatchCount 1, no second admission; 0 receipts |
| A28-11 `REVOKED` | remove both exact `P3Entitlement(actor,primaryCsi,"fixture-other","PASS")` | start **403 `SECRET_USE_NOT_AUTHORIZED`** | 0 (and 0 lists) | 0 | 0 | `b1ScopedSnapshot(test)` and launch counter unchanged |
| A28-1..5, 12 `VALID` (last) | restore page, value (rotated), origins, grant | FINALIZING → merged publish → ordinary replay PASSED | 1 (mixed) + 1 (ordinary) | 1 `RESOLVED` | 1 `USED` | joined to mixed session; no lowering; decoded video; full scan |

Mid-prefix revocation is the exact B2A-03 boundary. It is deliberately **not** raced here, because a start-relative revoke races the password dispatch and would produce a non-deterministic observer.

```java
  @Test
  void incrementalSecretPrefixPreservesEveryVaultFaultOracle() throws Exception {
    p3Case(() -> {
      p3Mode = P3Mode.LOGIN;
      String environment = "fixture-other", csi = primaryCsi;
      p3Grant(csi, environment);
      UUID test = p3CreateSource(csi, environment, true);
      VaultScope scope = VaultScope.of(csi, environment, test);
      String first = p3ExpectedPassword;
      p3Seed(scope, first);
      String original = p3Start(test, environment);
      awaitFinalizing(original);
      P3Publication base = p3Publish(original);
      var canaries = new ArrayList<String>(List.of(first));
      String badOrigin = "B2A-BADORIGIN-" + UUID.randomUUID(), flip = "B2A-TYPEFLIP-" + UUID.randomUUID();
      String head = "B2A-OVERSIZE-" + UUID.randomUUID();              // 49 chars, unique scan head
      String oversize = head + "x".repeat(4097 - head.length());      // exactly 4097 chars > resolver bound 4096
      assertThat(oversize.length()).isEqualTo(4097);
      canaries.addAll(List.of(badOrigin, flip, head));

      // A28-6 bad origin: real Vault entry bound to an approved but different origin.
      b2aFault(test, scope, base, environment, badOrigin, () -> VAULT.bindOrigins(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS", SECRET_ORIGIN),
          "FAILED", "ORIGIN_NOT_ALLOWED", 1, "outcome='RESOLVED'", "REFUSED", true);
      // A28-7 oversized value (>4096 chars): resolver refuses after the bounded read and erases.
      b2aFault(test, scope, base, environment, oversize, () -> {}, "FAILED", "SECRET_TOO_LONG", 1, "outcome='UNAVAILABLE'", "REFUSED", true);
      String current = "B2A-CURRENT-" + UUID.randomUUID(); canaries.add(current);
      // A28-8/9 zero and two password controls: password-only adapter refuses before any read.
      for (B2aPasswordPage page : List.of(B2aPasswordPage.NONE, B2aPasswordPage.TWO)) {
        b2aPasswordPage = page;
        try { b2aFault(test, scope, base, environment, current, () -> {}, null, null, 0, null, "NOT_USED", false); }
        finally { b2aPasswordPage = B2aPasswordPage.SINGLE; }
      }
      // A28-10 focus type-flip: native refusal after INVOKING; truthful UNKNOWN_OUTCOME usage, never NOT_USED/REFUSED.
      b2aPasswordPage = B2aPasswordPage.TYPE_FLIP;
      try { b2aFault(test, scope, base, environment, flip, () -> {}, "UNKNOWN_OUTCOME", null, 1, "outcome='RESOLVED'", "UNKNOWN_OUTCOME", true); }
      finally { b2aPasswordPage = B2aPasswordPage.SINGLE; }
      // A28-11 revoked grant: exact non-default tuple; start preflight refuses, nothing is written.
      String before = b1ScopedSnapshot(test);
      int reads = COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS"), lists = COUNTED_VAULT.lists.size();
      JsonNode launch = p3LaunchCounter();
      for (String actor : List.of("user-1", "fixture@example.invalid"))
        assertThat(P3_PERMITTED.remove(new P3Entitlement(actor, csi, environment, "PASS"))).isTrue();
      try {
        JsonNode refused = p3Call(p3Cookie, "/api/v1/studio/guided-sessions", p3StartCommand(test, environment)
            .put("baseRevisionId", base.revision().toString()).put("firstLearnStepId", THREE), 403);
        assertThat(refused.path("code").asText()).isEqualTo("SECRET_USE_NOT_AUTHORIZED");
        assertThat(b1ScopedSnapshot(test)).isEqualTo(before);
        assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS")).isEqualTo(reads);
        assertThat(COUNTED_VAULT.lists).hasSize(lists);
        assertThat(p3LaunchCounter()).isEqualTo(launch);
      } finally { p3Grant(csi, environment); }

      // VALID control (A28-1..5, A28-12) on the same base with current authority restored.
      p3ExpectedPassword = current; p3Seed(scope, current);
      P3_RECEIPTS.clear(); P3_NATIVE_SESSIONS.clear();
      int models = MODEL_WIRE.size(), valueReads = COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS");
      int startLists = COUNTED_VAULT.lists.size(), mayUse = P3_MAY_USE.size();
      String mixed = p3Call(p3Cookie, "/api/v1/studio/guided-sessions", p3StartCommand(test, environment)
          .put("baseRevisionId", base.revision().toString()).put("firstLearnStepId", THREE), 202).path("session").path("sessionId").asText();
      awaitFinalizing(mixed);
      String principal = sessions.transaction(() -> sessions.lock(mixed).document().path("scope").path("principalId").asText());
      assertThat(COUNTED_VAULT.lists.subList(startLists, COUNTED_VAULT.lists.size())).containsExactly(scope);          // A28-2
      assertThat(P3_MAY_USE.subList(mayUse, P3_MAY_USE.size())).contains(new P3Entitlement(principal, csi, environment, "PASS"));
      assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS") - valueReads).isEqualTo(1);   // A28-4
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts m JOIN studio_guided_relearn_switches s USING(session_id)"
          + " WHERE m.session_id=? AND m.created_at<s.created_at", Integer.class, mixed)).isZero();                            // A28-1
      JsonNode secret = C.parse(jdbc.queryForObject("SELECT proposal::text FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=1",
          String.class, mixed, TWO));
      assertThat(secret.path("target").path("kind").asText()).isEqualTo("passwordControl");
      assertThat(secret.path("operation").path("value").path("kind").asText()).isEqualTo("secretRef");
      assertThat(P3_NATIVE_SESSIONS).hasSize(1);
      assertThat(P3_RECEIPTS).hasSize(1); assertThat(P3_RECEIPTS.getFirst().accepted()).isTrue();
      assertThat(P3_RECEIPTS.getFirst().password().equals(current)).isTrue();
      String admission = jdbc.queryForObject("SELECT admission_id FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=1", String.class, mixed, TWO);
      String readVersion = COUNTED_VAULT.reads.getLast().version;
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit WHERE secret_id='PASS' AND session_id=? AND admission_id=?"
          + " AND row_kind='RELEASE' AND outcome='RESOLVED' AND vault_version=? AND coordinate_step_id=? AND coordinate_ordinal=1"
          + " AND source_reference_id=?", Long.class, mixed, admission, readVersion, TWO, b2PassReferenceId(mixed))).isEqualTo(1);  // A28-3/4
      assertThat(b2AuditCount(mixed, "row_kind='USAGE' AND usage_outcome='USED' AND admission_id='" + admission + "'")).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit WHERE session_id=?", Long.class, original))
          .as("base session audit is not reused by the mixed run").isEqualTo(
              jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? AND created_at<=(SELECT created_at FROM ui_test_revisions WHERE id=?)",
                  Long.class, original, base.revision())); // VERIFY-3: audit timestamp column name
      p3AssertAuditScope(mixed, null, scope);
      var sinks = new java.util.LinkedHashMap<String, byte[]>();
      assertGuidedLearnRunRecorded(mixed, sinks);
      sinks.put("public-session", p3Call(p3Cookie, "/api/v1/studio/guided-sessions/" + mixed, null, 200).toString().getBytes(StandardCharsets.UTF_8));
      sinks.put("public-result", p3Call(p3Cookie, "/api/v1/studio/guided-sessions/" + mixed + "/result", null, 200).toString().getBytes(StandardCharsets.UTF_8));
      P3Publication merged = p3Publish(mixed);
      b2aAssertNoSpanningLowering(mixed, merged);                                                                             // A28-12
      UUID execution = p3Execute(test);
      p3AssertBinding(execution, scope, merged);
      assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
      JsonNode report = p3AwaitExecution(execution, "PASSED");
      assertThat(p3DecodeVideo(execution, report)).isPositive();
      assertThat(MODEL_WIRE.size() - models).as("suffix THREE only").isPositive();
      p3Scan(canaries);                                                                                                       // A28-5
      for (String value : canaries) assertJoinedSinkAbsent(sinks, value);
      p3WriteEvidence("b2a-fault-matrix", C.object().put("faults", 6).put("validPrefixValueReads", 1).put("revokedStartWrites", 0));
    });
  }

  @FunctionalInterface private interface B2aSetup { void run() throws Exception; }

  /** One real mixed session on the confirmed base under one fault; code/count oracles only, never values. */
  private void b2aFault(UUID test, VaultScope scope, P3Publication base, String environment, String value, B2aSetup setup,
      String state, String code, int readsDelta, String releasePredicate, String usage, boolean linked) throws Exception {
    p3ExpectedPassword = value; p3Seed(scope, value); setup.run();
    P3_RECEIPTS.clear(); P3_NATIVE_SESSIONS.clear();
    int reads = COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS"), models = MODEL_WIRE.size();
    String id = p3Call(p3Cookie, "/api/v1/studio/guided-sessions", p3StartCommand(test, environment)
        .put("baseRevisionId", base.revision().toString()).put("firstLearnStepId", THREE), 202).path("session").path("sessionId").asText();
    long end = System.nanoTime() + Duration.ofSeconds(60).toNanos(); String actual;
    do { actual = sessions.transaction(() -> sessions.lock(id).document().path("state").asText());
      if (List.of("FAILED", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED", "SUCCEEDED", "FINALIZING").contains(actual)) break; Thread.sleep(25);
    } while (System.nanoTime() < end);
    if (state != null) assertThat(actual).isEqualTo(state);
    else assertThat(actual).isIn("FAILED", "UNKNOWN_OUTCOME"); // VERIFY-2: pin the exact ZERO/TWO terminal on first run
    p3AwaitTeardown(id);
    if (code != null) assertThat(sessions.transaction(() -> sessions.lock(id).progress().path("errorCode").asText())).isEqualTo(code);
    assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS") - reads).isEqualTo(readsDelta);
    assertThat(MODEL_WIRE).as("no prefix or relearn model call under a fault").hasSize(models);
    assertThat(P3_RECEIPTS).as("no sign-in POST under any fault").isEmpty();
    assertThat(b2AuditCount(id, "row_kind='RELEASE'")).isEqualTo(releasePredicate == null ? 0 : 1);
    if (releasePredicate != null) assertThat(b2AuditCount(id, "row_kind='RELEASE' AND " + releasePredicate)).isEqualTo(1);
    assertThat(b2AuditCount(id, "row_kind='USAGE'")).isEqualTo(1);
    assertThat(b2AuditCount(id, "row_kind='USAGE' AND usage_outcome='" + usage + "' AND admission_id IS " + (linked ? "NOT NULL" : "NULL"))).isEqualTo(1);
    if (!usage.equals("REFUSED")) assertThat(b2AuditCount(id, "row_kind='USAGE' AND usage_outcome='REFUSED'")).isZero();
    var fill = jdbc.queryForList("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=1", String.class, id, TWO);
    if (readsDelta == 0) {
      assertThat(fill).isEmpty();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=? AND step_id=? AND ordinal=1 AND status='PREPARED'",
          Integer.class, id, TWO)).isZero();
    } else {
      assertThat(fill).hasSize(1);
      assertThat(C.parse(fill.getFirst()).path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?", Integer.class, id, TWO))
          .as("no replacement admission after a fault").isEqualTo(2);
    }
    assertThat(COUNTED_VAULT.reads.stream().filter(read -> read.value != null).allMatch(read -> allErased(read.value))).isTrue();
    VAULT.bindOrigins(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS", ORIGIN); // restore origin for the next fault
  }

  private void b2aAssertNoSpanningLowering(String mixed, P3Publication merged) {
    String text = jdbc.queryForObject("SELECT steps->>1 FROM ui_tests WHERE id=(SELECT test_id::uuid FROM studio_guided_sessions WHERE session_id=?)",
        String.class, mixed);
    int start = text.indexOf("<secret PASS>"), end = start + "<secret PASS>".length();
    assertThat(start).isNotNegative();
    for (String row : jdbc.queryForList("SELECT document::text FROM studio_guided_materialization_inputs WHERE session_id=?", String.class, mixed)) {
      JsonNode input = C.parse(row), provenance = input.path("provenance");
      if (input.path("kind").asText().equals("secretRef")) continue;
      assertThat(input.has("secretId")).isFalse();
      if (provenance.path("referenceKind").asText().equals("sourceSpan") && provenance.path("stepId").asText().equals(TWO))
        assertThat(provenance.path("endUtf16").asInt() <= start || provenance.path("startUtf16").asInt() >= end).isTrue();
    }
    JsonNode artifact = C.parse(merged.artifact());
    for (JsonNode recipe : artifact.path("inputRecipes"))
      if (recipe.path("stepId").asText().equals(TWO) && recipe.path("provenance").path("kind").asText().equals("sourceSpan"))
        assertThat(recipe.path("provenance").path("end").asInt() <= start || recipe.path("provenance").path("start").asInt() >= end).isTrue();
    assertThat(artifact.toString()).doesNotContain("authoredLiteral\",\"sourceInputId\":\"" ); // VERIFY-4: replace with a typed walk of password targets
  }
```

The last `doesNotContain` line is a placeholder. Dex must replace it with a typed walk of `learnedPlan` actions. Every `passwordControl` target must carry `value.kind=="secretRef"`. **Do not ship the placeholder.**

### 4.2 B2A-02 `incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck` (default lane)

Parent: P3 LOGIN on the default tuple (no revocation needed). Base with the original THREE text. Then edit THREE to append `Check page title is Reports.` (`b2aTitleSuffix=true`). That makes a suffix `sourceSpan`, which gives a v2 append. The mode file is `{"mode":"append-input","stepId":TWO,"ordinal":1}` and arms the existing `/obs015-ack` hold on the v2 update.

```java
  @Test
  void incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck() throws Exception {
    p3Case(() -> {
      p3Mode = P3Mode.LOGIN; b2aTitleSuffix = true;
      p3Grant(primaryCsi, "fixture");
      UUID test = p3CreateSource(primaryCsi, "fixture", true);
      VaultScope scope = VaultScope.of(primaryCsi, "fixture", test);
      String first = p3ExpectedPassword; p3Seed(scope, first);
      String original = p3Start(test, "fixture"); awaitFinalizing(original);
      P3Publication base = p3Publish(original);
      JsonNode edited = b2Edit(test, 2, "Click Sign in, click the Reports link and check protected Reports heading. Check page title is Reports.");
      assertThat(edited.path("firstChangedStepId").asText()).isEqualTo(THREE);
      String used = "B2A-V1-" + UUID.randomUUID(), rotated = "B2A-V2-" + UUID.randomUUID();
      p3ExpectedPassword = used; p3Seed(scope, used);
      P3_RECEIPTS.clear(); P3_NATIVE_SESSIONS.clear();
      Files.writeString(TEMP.resolve("obs015-native-mode.json"), C.object().put("mode", "append-input").put("stepId", TWO).put("ordinal", 1).toString());
      Files.writeString(TEMP.resolve("obs015-native-events.jsonl"), "");
      String mixed = null;
      try {
        ObjectNode start = p3StartCommand(test, "fixture").put("sourceRevision", edited.path("sourceRevision").asText())
            .put("configurationRevision", edited.path("configurationRevision").asText()).put("baseRevisionId", base.revision().toString());
        mixed = p3Call(p3Cookie, "/api/v1/studio/guided-sessions", start, 202).path("session").path("sessionId").asText();
        final String id = mixed;
        long deadline = System.nanoTime() + Duration.ofSeconds(45).toNanos();
        while (!INCREMENTAL_ACK_ENTERED.contains(id) && System.nanoTime() < deadline) Thread.sleep(10);
        assertThat(INCREMENTAL_ACK_ENTERED).as("actual runner accepted v2 on the original browser before ACK").contains(id);
        // A45-1 at the held v2 ACK
        var versions = jdbc.queryForList("SELECT context_revision,authored_inputs_hash FROM studio_guided_materialization_versions"
            + " WHERE session_id=? ORDER BY context_revision", id);
        assertThat(versions).hasSize(2);
        assertThat(jdbc.queryForObject("SELECT status FROM studio_guided_materialization_deliveries WHERE session_id=?", String.class, id)).isEqualTo("PENDING");
        var row = jdbc.queryForMap("SELECT admission_id,document::text AS document FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=1", id, TWO);
        String admission = (String) row.get("admission_id"), actionBytes = (String) row.get("document");
        JsonNode action = C.parse(actionBytes);
        assertThat(action.path("state").asText()).isEqualTo("SUCCEEDED");
        assertThat(action.path("contextRevision").asInt()).isEqualTo(1);
        assertThat(action.path("authoredInputsHash").asText()).isEqualTo(versions.get(0).get("authored_inputs_hash"));
        JsonNode proof = C.parse(jdbc.queryForObject("SELECT proof::text FROM studio_guided_preparations WHERE session_id=? AND admission_id=?", String.class, id, admission));
        assertThat(proof.path("contextRevision").asInt()).isEqualTo(1);
        assertThat(proof.path("authoredInputsHash").asText()).isEqualTo(versions.get(0).get("authored_inputs_hash"));
        String readVersion = COUNTED_VAULT.reads.getLast().version;
        String auditAtV2 = b2AuditSnapshot(id);
        assertThat(b2AuditCount(id, "row_kind='RELEASE' AND outcome='RESOLVED' AND vault_version='" + readVersion + "'")).isEqualTo(1);
        assertThat(b2AuditCount(id, "row_kind='USAGE' AND usage_outcome='USED'")).isEqualTo(1);
        // Real Vault rotation after the historical use: the release must keep its read version.
        p3ExpectedPassword = rotated; p3Seed(scope, rotated);
        int reads = COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS");
        INCREMENTAL_ACK_RELEASE.get(id).countDown();
        long acked = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        while (!"ACKNOWLEDGED".equals(jdbc.queryForObject("SELECT status FROM studio_guided_materialization_deliveries WHERE session_id=?", String.class, id))
            && System.nanoTime() < acked) Thread.sleep(20);
        JsonNode ack = C.parse(jdbc.queryForObject("SELECT ack::text FROM studio_guided_materialization_deliveries WHERE session_id=?", String.class, id));
        assertThat(ack.path("contextRevision").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND admission_id=?", String.class, id, admission))
            .as("v1 action bytes survive v2 ACK").isEqualTo(actionBytes);
        assertThat(b2AuditSnapshot(id)).as("A45-2 at v2 ACK").isEqualTo(auditAtV2);
        // A45-3: real lost-response reconciliation and live recheck add nothing.
        var service = ownedApplicationContext.getBean(com.citi.put.checks.studio.guided.session.GuidedSessionService.class);
        service.lostAcknowledgment(id, admission);
        assertThat(ownedApplicationContext.getBean(com.citi.put.checks.studio.secrets.SecretRevocationSweep.class).guidedRevoked(id)).isFalse();
        assertThat(b2AuditSnapshot(id)).isEqualTo(auditAtV2);
        awaitFinalizing(id);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=? AND (document->>'contextRevision')::integer=2",
            Integer.class, id, THREE)).as("suffix ran on v2").isPositive();
        P3Publication merged = b2Publish(id, edited); // terminal SUCCEEDED runs guidedTerminal
        assertThat(b2AuditSnapshot(id)).as("A45-2/3 after terminal settlement").isEqualTo(auditAtV2);
        assertThat(b2AuditCount(id, "row_kind='USAGE' AND usage_outcome IN ('NOT_USED','REFUSED','UNKNOWN_OUTCOME')")).isZero();
        assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS")).as("no suffix/finalize read").isEqualTo(reads);
        assertThat(C.parse(merged.artifact()).path("inputRecipes").size()).isGreaterThanOrEqualTo(2);
        UUID execution = p3Execute(test);
        p3AssertBinding(execution, scope, merged);
        assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
        JsonNode report = p3AwaitExecution(execution, "PASSED");
        assertThat(P3_RECEIPTS.getLast().password().equals(rotated)).as("ordinary replay resolves the current version").isTrue();
        assertThat(p3DecodeVideo(execution, report)).isPositive();
        p3Scan(List.of(first, used, rotated));
        p3WriteEvidence("b2a-version-one", C.object().put("versions", 2).put("auditRowsStable", 1).put("falseUsageRows", 0));
      } finally {
        if (mixed != null) { var latch = INCREMENTAL_ACK_RELEASE.get(mixed); if (latch != null) latch.countDown(); INCREMENTAL_ACK_RELEASE.remove(mixed); INCREMENTAL_ACK_ENTERED.remove(mixed); }
        Files.writeString(TEMP.resolve("obs015-native-mode.json"), "{}");
      }
    });
  }
```

The version-1 dual reading: ledger 45's "version" is the materialization context version (v1 action, v2 head). The test **also** pins the Vault version (release `vault_version` = the read's version after a real rotation). Both readings are covered, and neither replaces the other.

### 4.3 B2A-03 `incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent` (default lane)

This implements the access-mapping `nextCandidate` exactly. It is a real P3 secret prefix on the non-default tuple, with the separately named `SECRET_HOLD` cut on the same-version context `update` that precedes the password coordinate TWO/1. There are two siblings on one confirmed base. **This is checkCurrent proof only, not fresh-producer sync proof.**

```java
  @Test
  void incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent() throws Exception {
    p3Case(() -> {
      p3Mode = P3Mode.LOGIN;
      String environment = "fixture-other", csi = primaryCsi;
      p3Grant(csi, environment);
      UUID test = p3CreateSource(csi, environment, true);
      VaultScope scope = VaultScope.of(csi, environment, test);
      p3Seed(scope, p3ExpectedPassword);
      String original = p3Start(test, environment); awaitFinalizing(original);
      P3Publication base = p3Publish(original);
      String value = "B2A-SC-" + UUID.randomUUID();
      p3ExpectedPassword = value; p3Seed(scope, value);
      b2aSecretCutSibling(test, scope, base, environment, true, TWO, 1);   // negative: revoke at the held ACK
      b2aSecretCutSibling(test, scope, base, environment, false, TWO, 1);  // positive: same boundary, grant present
      p3Scan(List.of(value));
    });
  }

  private void b2aSecretCutSibling(UUID test, VaultScope scope, P3Publication base, String environment, boolean revoke,
      String stepId, int ordinal) throws Exception {
    assertThat(PREFIX_SYNC_CUTS).isEmpty();
    var cut = new PrefixSyncCut("SECRET_HOLD");
    PREFIX_SYNC_CUTS.put(cut.key, cut);
    Path controlFile = TEMP.resolve("obs015-secret-context-control.json");
    var removed = new ArrayList<P3Entitlement>();
    String id = null;
    try {
      writeOwnedControl(controlFile, C.object().put("caseId", cut.key).put("mode", "SECRET_HOLD").put("stepId", stepId).put("ordinal", ordinal));
      P3_RECEIPTS.clear();
      int reads = COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS");
      id = p3Call(p3Cookie, "/api/v1/studio/guided-sessions", p3StartCommand(test, environment)
          .put("baseRevisionId", base.revision().toString()).put("firstLearnStepId", THREE), 202).path("session").path("sessionId").asText();
      final String session = id;
      assertThat(cut.entered.await(30, java.util.concurrent.TimeUnit.SECONDS)).as("actual secret-context update cut").isTrue();
      assertThat(cut.failure).isNull(); assertThat(cut.sessionId).isEqualTo(session); assertThat(cut.phase).isEqualTo("AFTER");
      // Stored identity at the cut: the original issued request precedes the held response.
      var issued = jdbc.queryForList("SELECT request_digest,document::text FROM studio_guided_prefix_requests"
          + " WHERE session_id=? AND step_id=? AND ordinal=? AND status='ISSUED'", session, stepId, ordinal);
      assertThat(issued).hasSize(1);
      JsonNode request = C.parse((String) issued.getFirst().get("document"));
      assertThat(GuidedContracts.hash(request)).isEqualTo(issued.getFirst().get("request_digest"));
      JsonNode document = sessions.transaction(() -> sessions.lock(session).document().deepCopy());
      assertThat(document.path("state").asText()).isEqualTo("REPLAYING_PREFIX");
      String principal = document.path("scope").path("principalId").asText();
      assertThat(document.path("scope").path("csiId").asText()).isEqualTo(scope.csiId());
      assertThat(document.path("scope").path("environmentId").asText()).isEqualTo(scope.environment());
      assertThat(b2PassReferenceId(session)).isNotBlank(); // frozen manifest secretRef PASS
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal<? AND document->>'state'='SUCCEEDED'",
          Integer.class, session, stepId, ordinal)).isEqualTo(ordinal); // USER fill done
      String earlier = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY step_id,ordinal)::text FROM studio_guided_actions a WHERE session_id=?", String.class, session);
      int preparations = jdbc.queryForObject("SELECT count(*) FROM studio_guided_preparations WHERE session_id=?", Integer.class, session);
      String audit = b2AuditSnapshot(session);
      var authorization = ownedApplicationContext.getBean(com.citi.put.checks.studio.secrets.StudioSecretUseAuthorization.class);
      assertThat(authorization.mayUse(principal, scope.csiId(), scope.environment(), "PASS")).isTrue();
      assertThat(jdbc.queryForObject("SELECT revoked_at FROM studio_guided_sessions WHERE session_id=?", Object.class, session)).isNull();
      int diagnostics = FINALIZE_DIAGNOSTICS.get();
      if (revoke) {
        for (String actor : List.of("user-1", "fixture@example.invalid")) {
          var tuple = new P3Entitlement(actor, scope.csiId(), scope.environment(), "PASS");
          assertThat(P3_PERMITTED.remove(tuple)).as("exact previously present grant").isTrue();
          removed.add(tuple);
        }
        assertThat(authorization.mayUse(principal, scope.csiId(), scope.environment(), "PASS")).isFalse();
        // Source, policy, owner, lease, evidence, program and request are untouched; release immediately to
        // keep the renewal observer (SecretRevocationSweep at claim) from preceding this boundary.
        cut.release.countDown();
        b2AwaitCheckCurrentGate(diagnostics);
        long end = System.nanoTime() + Duration.ofSeconds(45).toNanos(); String state;
        do { state = sessions.transaction(() -> sessions.lock(session).document().path("state").asText());
          if (!state.equals("REPLAYING_PREFIX")) break; Thread.sleep(25); } while (System.nanoTime() < end);
        assertThat(state).isIn("CANCELLED", "FAILED");
        assertThat(sessions.transaction(() -> sessions.lock(session).progress().path("errorCode").asText())).isEqualTo("SECRET_USE_REVOKED");
        p3AwaitTeardown(session);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=?", Integer.class, session, stepId, ordinal)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_preparations WHERE session_id=?", Integer.class, session)).isEqualTo(preparations);
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY step_id,ordinal)::text FROM studio_guided_actions a WHERE session_id=? AND NOT (step_id=? AND ordinal>=?)",
            String.class, session, stepId, ordinal)).as("earlier lawful facts retained").isEqualTo(earlier);
        assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS")).isEqualTo(reads);
        assertThat(b2AuditCount(session, "row_kind='RELEASE'")).isZero();
        assertThat(b2AuditCount(session, "row_kind='USAGE' AND usage_outcome='NOT_USED' AND admission_id IS NULL")).isEqualTo(1);
        assertThat(P3_RECEIPTS).isEmpty();
        assertThat(prefixSyncEventsFor(cut, session).stream().filter(row -> row.path("phase").asText().startsWith("TARGET_")).count()).isZero();
      } else {
        cut.release.countDown();
        awaitFinalizing(session);
        var events = prefixSyncEventsFor(cut, session);
        assertThat(events.stream().filter(row -> row.path("phase").asText().equals("TARGET_PREPARE_ENTER")).count()).isEqualTo(1);
        assertThat(events.stream().filter(row -> row.path("phase").asText().equals("TARGET_DISPATCH_ENTER")).count()).isEqualTo(1);
        assertThat(events.stream().allMatch(row -> row.path("sameBrowser").asBoolean())).isTrue();
        JsonNode fill = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=?", String.class, session, stepId, ordinal));
        assertThat(fill.path("state").asText()).isEqualTo("SUCCEEDED"); assertThat(fill.path("dispatchCount").asInt()).isEqualTo(1);
        assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS") - reads).isEqualTo(1);
        assertThat(b2AuditCount(session, "row_kind='RELEASE' AND outcome='RESOLVED'")).isEqualTo(1);
        assertThat(b2AuditCount(session, "row_kind='USAGE' AND usage_outcome='USED'")).isEqualTo(1);
        assertThat(P3_RECEIPTS).hasSize(1); assertThat(P3_RECEIPTS.getFirst().accepted()).isTrue();
        p3AssertAuditScope(session, null, scope);
        int after = FINALIZE_DIAGNOSTICS.get();
        for (int n = diagnostics + 1; n <= after; n++) {
          Path file = TEMP.resolve("finalize-exception-" + n + ".json");
          if (Files.isRegularFile(file)) assertThat(C.parse(Files.readString(file)).path("exceptionCode").asText()).isNotEqualTo("SECRET_USE_REVOKED");
        }
        p3Call(p3Cookie, "/api/v1/studio/guided-sessions/" + session + "/cancel", C.object().put("schemaVersion", 3).put("reason", "userRequested"), 202);
        p3AwaitTeardown(session);
      }
    } finally {
      for (P3Entitlement tuple : removed) P3_PERMITTED.add(tuple); // restore only the exact removed grant
      cut.release.countDown(); cut.cleanupRelease.countDown();
      try { writeOwnedControl(controlFile, C.object()); } finally { PREFIX_SYNC_CUTS.remove(cut.key); }
      assertThat(cut.failure).as("secret-context instrumentation completed").isNull();
    }
  }

  private List<JsonNode> prefixSyncEventsFor(PrefixSyncCut cut, String session) throws Exception {
    Path file = TEMP.resolve("obs015-prefix-sync-" + cut.key + ".jsonl");
    assertThat(Files.getPosixFilePermissions(file)).isEqualTo(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
    var events = Files.readAllLines(file, StandardCharsets.UTF_8).stream().filter(line -> !line.isBlank()).map(C::parse).toList();
    for (JsonNode row : events) {
      assertThat(row.path("mode").asText()).isEqualTo(cut.mode);
      assertThat(row.path("sessionHash").asText()).isEqualTo(GuidedContracts.hash(JSON.getNodeFactory().textNode(session)));
    }
    return events;
  }
```

Disposition: if the renewal observer (fact 3) refuses before the post-ACK transaction, `b2AwaitCheckCurrentGate` still requires the exact `advancePrefix:405 → translationTransaction → checkCurrent` refusal, because `checkCurrent` runs first in every `translationTransaction`. The renewal's own `revoked_at`/CANCELLED is recorded as a separate fact and gets no credit for this boundary. If no line-405 frame appears, the method fails. Any other refusal is not accepted.

### 4.4 B2A-04 `incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation` (default lane)

This is the combined parent the decision left OPEN. It uses the combined P3 program (`b2Combined`):
- ONE: navigate, then `read Order reference` (a business producer inside the `Operations` grant region).
- TWO: `fill Reference ← binding`, `fill User`, `fill password ← <secret PASS>`.
- THREE: unchanged.

The cut is the **existing, unmodified** fresh-producer selector (`pfxRead`/`pfxSelect`, mode `HOLD`, `stepId=TWO`). That is the first producer-bearing update before the binding consumer TWO/0. The negative revokes the exact `(primaryCsi,"fixture-other",PASS)` grant while held. The positive releases with the grant present and must consume the **fresh** read value (boolean equality with the latest `B2_ORDER_VALUES` entry) before the password fill.

```java
  @Test
  void incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation() throws Exception {
    p3Case(() -> {
      p3Mode = P3Mode.LOGIN; b2Combined = true;
      String environment = "fixture-other", csi = primaryCsi;
      p3Grant(csi, environment);
      UUID test = b2CreateCombinedSource(csi, environment, "p3-user", null);
      VaultScope scope = VaultScope.of(csi, environment, test);
      p3Seed(scope, p3ExpectedPassword);
      String original = p3Start(test, environment); awaitFinalizing(original);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_producers WHERE session_id=?", Integer.class, original)).isEqualTo(1);
      P3Publication base = p3Publish(original);
      assertThat(C.parse(base.artifact()).path("learnedPlan").path("bindings")).hasSize(1);
      for (boolean revoke : List.of(true, false)) b2aProducerCutSibling(test, scope, base, environment, revoke);
      p3Scan(List.of(p3ExpectedPassword));
    });
  }

  private UUID b2CreateCombinedSource(String csi, String environment, String user,
      com.citi.put.checks.studio.dto.StepAuthoringContext twoContext) throws Exception {
    List<String> texts = List.of("Open " + ORIGIN + "/p3/login and read the Order reference.",
        "Enter that order reference in Reference, <var USER> in User and <secret PASS> as password.",
        "Click Sign in, click the Reports link and check protected Reports heading.");
    var authoring = new AuthoringV2Request(2, null, List.of(new AuthoringStep(UUID.fromString(ONE), texts.get(0), null),
        new AuthoringStep(UUID.fromString(TWO), texts.get(1), twoContext), new AuthoringStep(UUID.fromString(THREE), texts.get(2), null)));
    String variables = JSON.writeValueAsString(List.of(Map.of("name", "USER", "kind", "plain", "value", user), Map.of("name", "PASS", "kind", "secretRef")));
    UUID test = UUID.randomUUID();
    jdbc.update("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,authoring,authoring_revision_inputs,created_by,created_at,updated_at)"
        + " VALUES (?,'B2 combined join',?,?,'chromium',?::jsonb,?::jsonb,?::jsonb,?::jsonb,'fixture@example.invalid',now(),now())",
        test, csi, environment, JSON.writeValueAsString(texts), variables, JSON.writeValueAsString(authoring),
        JSON.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of("USER", user)))); // VERIFY-5: plainValues map key
    AUDIT_CANARIES.addAll(texts);
    return test;
  }

  private void b2aProducerCutSibling(UUID test, VaultScope scope, P3Publication base, String environment, boolean revoke) throws Exception {
    assertThat(PREFIX_SYNC_CUTS).isEmpty();
    var cut = new PrefixSyncCut("HOLD");
    PREFIX_SYNC_CUTS.put(cut.key, cut);
    var removed = new ArrayList<P3Entitlement>();
    String id = null;
    try {
      writePrefixSyncControl(C.object().put("caseId", cut.key).put("mode", "HOLD").put("stepId", TWO)); // unchanged selector
      P3_RECEIPTS.clear(); B2_REFERENCE_RECEIPTS.clear();
      int reads = COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS"), orders = B2_ORDER_VALUES.size();
      id = p3Call(p3Cookie, "/api/v1/studio/guided-sessions", p3StartCommand(test, environment)
          .put("baseRevisionId", base.revision().toString()).put("firstLearnStepId", THREE), 202).path("session").path("sessionId").asText();
      final String session = id;
      assertThat(cut.entered.await(30, java.util.concurrent.TimeUnit.SECONDS)).as("actual fresh-producer update cut").isTrue();
      assertThat(cut.failure).isNull(); assertThat(cut.sessionId).isEqualTo(session); assertThat(cut.phase).isEqualTo("AFTER");
      assertThat(B2_ORDER_VALUES.size()).as("one fresh mixed-session read page").isEqualTo(orders + 1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_producers p JOIN studio_guided_actions a ON a.session_id=p.session_id"
          + " AND a.admission_id=p.admission_id WHERE p.session_id=? AND a.document->>'state'='SUCCEEDED' AND a.proposal->'operation'->>'kind'='read'",
          Integer.class, session)).as("fresh producer committed before the held ACK").isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?", Integer.class, session, TWO)).isZero();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=? AND step_id=? AND ordinal=0 AND status='ISSUED'",
          Integer.class, session, TWO)).isEqualTo(1);
      String producers = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(p) ORDER BY binding_id)::text FROM studio_guided_producers p WHERE session_id=?", String.class, session);
      int preparations = jdbc.queryForObject("SELECT count(*) FROM studio_guided_preparations WHERE session_id=?", Integer.class, session);
      String principal = sessions.transaction(() -> sessions.lock(session).document().path("scope").path("principalId").asText());
      var authorization = ownedApplicationContext.getBean(com.citi.put.checks.studio.secrets.StudioSecretUseAuthorization.class);
      assertThat(authorization.mayUse(principal, scope.csiId(), scope.environment(), "PASS")).isTrue();
      int diagnostics = FINALIZE_DIAGNOSTICS.get();
      if (revoke) {
        for (String actor : List.of("user-1", "fixture@example.invalid")) {
          var tuple = new P3Entitlement(actor, scope.csiId(), scope.environment(), "PASS");
          assertThat(P3_PERMITTED.remove(tuple)).isTrue(); removed.add(tuple);
        }
        assertThat(authorization.mayUse(principal, scope.csiId(), scope.environment(), "PASS")).isFalse();
        cut.release.countDown();
        b2AwaitCheckCurrentGate(diagnostics);
        long end = System.nanoTime() + Duration.ofSeconds(45).toNanos(); String state;
        do { state = sessions.transaction(() -> sessions.lock(session).document().path("state").asText());
          if (!state.equals("REPLAYING_PREFIX")) break; Thread.sleep(25); } while (System.nanoTime() < end);
        assertThat(sessions.transaction(() -> sessions.lock(session).progress().path("errorCode").asText())).isEqualTo("SECRET_USE_REVOKED");
        p3AwaitTeardown(session);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?", Integer.class, session, TWO)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_preparations WHERE session_id=?", Integer.class, session)).isEqualTo(preparations);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_consumer_edges WHERE session_id=?", Integer.class, session)).isZero();
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(p) ORDER BY binding_id)::text FROM studio_guided_producers p WHERE session_id=?",
            String.class, session)).isEqualTo(producers);
        assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS")).isEqualTo(reads);
        assertThat(b2AuditCount(session, "row_kind='RELEASE'")).isZero();
        assertThat(P3_RECEIPTS).isEmpty(); assertThat(B2_REFERENCE_RECEIPTS).isEmpty();
      } else {
        cut.release.countDown();
        awaitFinalizing(session);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_consumer_edges WHERE session_id=?", Integer.class, session)).isEqualTo(1);
        assertThat(B2_REFERENCE_RECEIPTS).hasSize(1);
        assertThat(B2_REFERENCE_RECEIPTS.getFirst().equals(B2_ORDER_VALUES.getLast())).as("fresh producer value consumed").isTrue();
        assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS") - reads).isEqualTo(1);
        assertThat(b2AuditCount(session, "row_kind='USAGE' AND usage_outcome='USED'")).isEqualTo(1);
        assertThat(P3_RECEIPTS).hasSize(1); assertThat(P3_RECEIPTS.getFirst().accepted()).isTrue();
        p3Call(p3Cookie, "/api/v1/studio/guided-sessions/" + session + "/cancel", C.object().put("schemaVersion", 3).put("reason", "userRequested"), 202);
        p3AwaitTeardown(session);
      }
    } finally {
      for (P3Entitlement tuple : removed) P3_PERMITTED.add(tuple);
      cut.release.countDown(); cut.cleanupRelease.countDown();
      try { writePrefixSyncControl(C.object()); } finally { PREFIX_SYNC_CUTS.remove(cut.key); }
      assertThat(cut.failure).isNull();
    }
  }
```

## 5. B2B-01 `incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority` (low lane)

Parent: a fresh copy of the lawful ten-step base, finalize and `append-input` edit, as in `prefixSyncParent`/`incrementalJoined`. It runs in its **own** method. The 35-label `append-input` variant and its pending-accounting transfer stay untouched. A second parent in the same method is the owner-loss sibling (A77-4).

```java
  @Test
  void incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority() throws Exception {
    b2bAppendParent(false);
    b2bAppendParent(true);
  }

  private void b2bAppendParent(boolean ownerLoss) throws Exception {
    primaryCsi = "CSI-B2B-" + (++p3CsiOrdinal); forgetCachedCoreIdentity(); // per-parent budget isolation
    jdbc.update("INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
        + " VALUES (?,'Orders','Ops','HIGH','fixture@example.invalid','Production')", primaryCsi);
    startWorkers(); seedGovernedPolicies(primaryCsi); incrementalTenScenario = true;
    String id = null;
    var hold = new B2bPlanHold();
    try {
      var texts = new ArrayList<String>();
      texts.add("Open " + URL + " and read the Order reference.");
      texts.add("Enter that order reference in Destination (an authored alternative is literal-control).");
      texts.add("Check Destination has that order reference."); texts.add("Check Destination is visible.");
      texts.add("Click Submit and check Confirmation appears.");
      for (int i = 5; i < 10; i++) texts.add("Check Confirmation is visible at checkpoint " + (i + 1) + ".");
      AUDIT_CANARIES.addAll(texts);
      AUDIT_CANARIES.addAll(List.of("Operations", "Order reference", "Destination", "Submit", "Confirmation", "literal-control", "unused-input"));
      var steps = new ArrayList<AuthoringStep>();
      for (int i = 0; i < 10; i++) steps.add(new AuthoringStep(UUID.fromString(INCREMENTAL_STEPS.get(i)), texts.get(i), null));
      var authoring = new AuthoringV2Request(2, null, steps);
      UUID test = UUID.randomUUID();
      jdbc.update("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,authoring,authoring_revision_inputs,created_by,created_at,updated_at)"
          + " VALUES (?,'B2b append',?,'fixture','chromium',?::jsonb,'[]'::jsonb,?::jsonb,?::jsonb,'fixture@example.invalid',now(),now())",
          test, primaryCsi, JSON.writeValueAsString(texts), JSON.writeValueAsString(authoring),
          JSON.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())));
      String original = startLearning(test); awaitFinalizing(original);
      JsonNode base = publicCall("/api/v1/studio/guided-sessions/" + original + "/finalize", C.object().put("schemaVersion", 3)
          .put("expectedSourceRevision", "1").put("expectedConfigurationRevision", "1"), 200, UUID.randomUUID().toString());
      p3AwaitTeardown(original);
      String appended = "Check Destination is visible. Check page title is Operations. The note unused-input is context only.";
      AUDIT_CANARIES.add(appended);
      JsonNode edited = prefixSyncEdit(test, appended); // edits index 3 (non-"Check Confirmation" text)
      assertThat(edited.path("firstChangedStepId").asText()).isEqualTo(INCREMENTAL_STEPS.get(3));
      incrementalDomVariant = "append-input";
      Files.writeString(TEMP.resolve("obs015-native-mode.json"), C.object().put("mode", "append-input")
          .put("stepId", INCREMENTAL_STEPS.get(1)).put("ordinal", 0).toString());
      Files.writeString(TEMP.resolve("obs015-native-events.jsonl"), "");
      ObjectNode start = C.object().put("schemaVersion", 3).put("testId", test.toString())
          .put("sourceRevision", edited.path("sourceRevision").asText()).put("configurationRevision", edited.path("configurationRevision").asText())
          .put("environmentId", "fixture").put("applicationId", "orders").put("baseRevisionId", base.path("revisionId").asText());
      start.set("versions", versions());
      String sessionKey = UUID.randomUUID().toString();
      // The hold is keyed by session id, known only after 202; the suffix SOURCE_PLAN is far behind the 10-step prefix.
      id = publicCall("/api/v1/studio/guided-sessions", start, 202, sessionKey).path("session").path("sessionId").asText();
      B2B_PLAN_HOLDS.put(id, hold);
      final String session = id;
      var service = ownedApplicationContext.getBean(com.citi.put.checks.studio.guided.session.GuidedSessionService.class);
      var controller = com.citi.put.checks.studio.guided.session.GuidedInternalIdentityFixture.controller();
      var materialization = new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(jdbc, C);
      var preparationStore = new com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore(jdbc, C);
      if (!ownerLoss) {
        // ---- Phase A: a real unexpired unconsumed preparation blocks the append (A46-1) ----
        assertThat(hold.entered.await(60, java.util.concurrent.TimeUnit.SECONDS)).as("suffix SOURCE_PLAN in flight").isTrue();
        assertThat(jdbc.queryForObject("SELECT reason FROM studio_guided_relearn_switches WHERE session_id=?", String.class, session)).isEqualTo("BOUNDARY");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materialization_versions WHERE session_id=?", Integer.class, session)).isEqualTo(1);
        long fence = sessions.transaction(() -> sessions.lock(session).document().path("owner").path("fence").asLong());
        JsonNode progress = sessions.transaction(() -> sessions.lock(session).progress().deepCopy());
        JsonNode document = sessions.transaction(() -> sessions.lock(session).document().deepCopy());
        ObjectNode context = service.runnerContext(controller, session, fence);
        JsonNode target = null;
        for (JsonNode node : progress.path("observation").path("nodes")) if (node.path("name").asText().equals("Destination")) target = node;
        assertThat(target).isNotNull();
        ObjectNode proposal = C.object().put("schemaVersion", 3).put("sessionId", session).put("scopeHash", document.path("scopeHash").asText())
            .put("generation", progress.path("generation").asInt()).put("evidenceHash", progress.path("evidenceHash").asText())
            .put("contextRevision", context.path("contextRevision").asInt()).put("authoredInputsHash", context.path("authoredInputsHash").asText());
        proposal.putObject("coordinate").put("stepId", INCREMENTAL_STEPS.get(3)).put("ordinal", 0);
        proposal.set("executionEvidence", progress.path("executionEvidence"));
        proposal.putObject("target").put("nodeId", target.path("nodeId").asText()).put("documentId", progress.path("documentId").asText())
            .put("generation", progress.path("generation").asInt()).putObject("locator").put("kind", "role")
            .put("role", target.path("role").asText()).put("name", "Destination").put("exact", true);
        proposal.putObject("operation").put("kind", "assert").put("predicate", "visible").putNull("expected");
        C.validate("v3/action", proposal);
        // Exactly prepareAndAdmit's request construction, without its admit: the real concurrent-callback window.
        ObjectNode prepare = materialization.identity(context);
        prepare.set("proposal", proposal); prepare.put("requestDigest", GuidedContracts.hash(proposal));
        prepare.set("expiresAt", context.path("leaseExpiresAt"));
        JsonNode proof = ownedApplicationContext.getBean(com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient.class).send("prepare", prepare);
        service.storePreparation(controller, session, fence, proposal, proof);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_preparations WHERE session_id=? AND preparation_id=?"
            + " AND admission_id IS NULL AND expires_at>clock_timestamp()", Integer.class, session, proof.path("preparationId").asText())).isEqualTo(1);
        String completedV1 = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(p) ORDER BY preparation_id)::text FROM studio_guided_preparations p"
            + " WHERE session_id=? AND admission_id IS NOT NULL", String.class, session);
        String publicationPreparations = jdbc.queryForObject("SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY preparation_id),'[]'::jsonb)::text"
            + " FROM studio_guided_publication_preparations p WHERE session_id=?", String.class, session);
        hold.release.countDown();
        assertThat(hold.failure).isNull();
        long accepted = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        while (!plans.state(session).path("continuation").asText().equals("MATERIALIZE") && System.nanoTime() < accepted) Thread.sleep(20);
        assertThat(plans.state(session).path("continuation").asText()).isEqualTo("MATERIALIZE");
        Thread.sleep(2500); // >= two real coordinator polls (poll-ms 1000); time is observed, never shortened
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materialization_versions WHERE session_id=?", Integer.class, session)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materialization_deliveries WHERE session_id=?", Integer.class, session)).isZero();
        long planRevision = plans.state(session).path("planRevision").asLong();
        JsonNode references = plans.state(session).path("plan").path("sourceReferences");
        String immutable = incrementalImmutableSnapshot(session);
        assertThatThrownBy(() -> service.materialize(controller, session, fence, "suffix-materialize-" + planRevision, references))
            .as("exact production append is refused while the real preparation is live").isInstanceOf(RuntimeException.class);
        assertThat(incrementalImmutableSnapshot(session)).isEqualTo(immutable);
        // ---- natural expiry (A46-2): no clock, timestamp or lease change ----
        Instant expires = Instant.parse(proof.path("expiresAt").asText());
        long renew = System.nanoTime();
        while (!Instant.now().isAfter(expires.plusMillis(20))) {
          if (System.nanoTime() >= renew) { refreshFixtureCredentials(); renew = System.nanoTime() + Duration.ofSeconds(10).toNanos(); }
          Thread.sleep(100);
        }
        long held = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        while (!INCREMENTAL_ACK_ENTERED.contains(session) && System.nanoTime() < held) Thread.sleep(20);
        assertThat(INCREMENTAL_ACK_ENTERED).as("append retried after natural expiry; else a liveness finding, not a test relaxation").contains(session);
        // ---- Phase B: duplicate/mutation/fresh-key/dependency at the held v2 ACK (A18-1..3, A77-1, A77-3) ----
        long fence2 = sessions.transaction(() -> sessions.lock(session).document().path("owner").path("fence").asLong());
        String pending = incrementalImmutableSnapshot(session);
        String deliveries = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(d) ORDER BY delivery_id)::text FROM studio_guided_materialization_deliveries d WHERE session_id=?", String.class, session);
        String allocations = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY binding_id)::text FROM studio_guided_allocations a WHERE session_id=?", String.class, session);
        String producers = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(p) ORDER BY binding_id)::text FROM studio_guided_producers p WHERE session_id=?", String.class, session);
        int revision = jdbc.queryForObject("SELECT materialization_revision FROM studio_guided_materializations WHERE session_id=?", Integer.class, session);
        String productionKey = "suffix-materialize-" + planRevision;
        JsonNode stored = C.parse(jdbc.queryForObject("SELECT response::text FROM studio_guided_commands WHERE namespace=? AND route='materialization' AND idempotency_key=?",
            String.class, session, productionKey)); // VERIFY-6: command route literal for materialize
        assertThat(service.materialize(controller, session, fence2, productionKey, references)).isEqualTo(stored);           // A18-1
        var mutated = (com.fasterxml.jackson.databind.node.ArrayNode) references.deepCopy(); mutated.remove(mutated.size() - 1);
        assertThatThrownBy(() -> service.materialize(controller, session, fence2, productionKey, mutated))
            .isInstanceOf(GuidedSessionException.class).hasMessage("IDEMPOTENCY_CONFLICT");                                 // A18-2
        service.materialize(controller, session, fence2, "b2b-fresh-" + UUID.randomUUID(), references);                      // A18-3
        JsonNode need = plans.state(session).path("plan").path("needs").get(0).deepCopy();
        ((ObjectNode) need).putArray("consumers"); // first-suffix narrower effective need
        ObjectNode union = service.cumulativeAllocationRequest(controller, session, fence2, need);                           // A77-1
        JsonNode allocation = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_allocations WHERE session_id=?", String.class, session));
        assertThat(union.path("consumers")).isEqualTo(allocation.path("consumers"));
        assertThat(allocation.path("consumers").size()).as("prefix consumers established before append").isEqualTo(2);
        ObjectNode same = C.object().put("needId", allocation.path("needId").asText()).put("producerStepId", allocation.path("producerStepId").asText());
        same.set("consumers", allocation.path("consumers"));
        try { service.allocateBinding(controller, session, fence2, "b2b-alloc-" + UUID.randomUUID(), same); }
        catch (GuidedSessionException refused) { assertThat(refused.getMessage()).isIn("REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT"); } // A77-3: either way, no write
        assertThat(incrementalImmutableSnapshot(session)).isEqualTo(pending);
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(d) ORDER BY delivery_id)::text FROM studio_guided_materialization_deliveries d WHERE session_id=?", String.class, session)).isEqualTo(deliveries);
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY binding_id)::text FROM studio_guided_allocations a WHERE session_id=?", String.class, session)).isEqualTo(allocations);
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(p) ORDER BY binding_id)::text FROM studio_guided_producers p WHERE session_id=?", String.class, session)).isEqualTo(producers);
        assertThat(jdbc.queryForObject("SELECT materialization_revision FROM studio_guided_materializations WHERE session_id=?", Integer.class, session)).isEqualTo(revision);
        // ---- lost ACK response → one stable retry with the same delivery id (A18-4) ----
        String deliveryId = jdbc.queryForObject("SELECT delivery_id::text FROM studio_guided_materialization_deliveries WHERE session_id=?", String.class, session);
        INCREMENTAL_ACK_LOSE.add(session);
        INCREMENTAL_ACK_RELEASE.get(session).countDown();
        long acked = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        while (!"ACKNOWLEDGED".equals(jdbc.queryForObject("SELECT status FROM studio_guided_materialization_deliveries WHERE session_id=?", String.class, session))
            && System.nanoTime() < acked) Thread.sleep(25);
        var delivery = jdbc.queryForMap("SELECT delivery_id::text AS id,status,context_hash,ack::text AS ack FROM studio_guided_materialization_deliveries WHERE session_id=?", session);
        assertThat(delivery.get("status")).isEqualTo("ACKNOWLEDGED");
        assertThat(delivery.get("id")).isEqualTo(deliveryId);
        assertThat(C.parse((String) delivery.get("ack")).path("contextHash").asText()).isEqualTo(delivery.get("context_hash"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materialization_versions WHERE session_id=?", Integer.class, session)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT materialization_revision FROM studio_guided_materializations WHERE session_id=?", Integer.class, session)).isEqualTo(revision);
        // ---- Phase C: expired old preparation cannot cross the new ACK (A46-3); completed v1 preps verifiable (A46-4) ----
        String after = incrementalPendingSnapshot(session);
        long fence3 = sessions.transaction(() -> sessions.lock(session).document().path("owner").path("fence").asLong());
        assertThatThrownBy(() -> service.admit(controller, session, fence3, "b2b-old-" + UUID.randomUUID(), proposal))
            .isInstanceOf(GuidedSessionException.class)
            .satisfies(failure -> assertThat(failure.getMessage()).isIn("REVISION_CONFLICT", "STALE_GENERATION"));
        assertThat(incrementalPendingSnapshot(session)).isEqualTo(after);
        sessions.transaction(() -> {
          JsonNode current = sessions.lock(session).document();
          ObjectNode currentContext = materialization.context(current);
          assertThatThrownBy(() -> preparationStore.authorize(current, proposal, currentContext, Instant.now()))
              .isInstanceOf(GuidedSessionException.class).hasMessage("STALE_GENERATION");
          assertThatThrownBy(() -> materialization.verify(current, proof)).isInstanceOf(GuidedSessionException.class).hasMessage("STALE_FENCE");
          return null;
        });
        assertThat(jdbc.queryForObject("SELECT admission_id FROM studio_guided_preparations WHERE session_id=? AND preparation_id=?",
            String.class, session, proof.path("preparationId").asText())).isNull();
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(p) ORDER BY preparation_id)::text FROM studio_guided_preparations p"
            + " WHERE session_id=? AND admission_id IS NOT NULL AND (proof->>'contextRevision')::integer=1", String.class, session)).isEqualTo(completedV1);
        String v1Hash = jdbc.queryForObject("SELECT authored_inputs_hash FROM studio_guided_materialization_versions WHERE session_id=? AND context_revision=1", String.class, session);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_preparations p JOIN studio_guided_actions a USING(session_id,admission_id)"
            + " WHERE p.session_id=? AND (p.proof->>'contextRevision')::integer=1 AND p.proof->>'authoredInputsHash'=?"
            + " AND (a.document->>'contextRevision')::integer=1 AND a.document->>'state'='SUCCEEDED'", Integer.class, session, v1Hash))
            .isEqualTo(jdbc.queryForObject("SELECT count(*) FROM studio_guided_preparations WHERE session_id=? AND admission_id IS NOT NULL"
                + " AND (proof->>'contextRevision')::integer=1", Integer.class, session));
        assertThat(jdbc.queryForObject("SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY preparation_id),'[]'::jsonb)::text FROM studio_guided_publication_preparations p"
            + " WHERE session_id=? AND (proof->>'contextRevision')::integer=1", String.class, session)).isEqualTo(publicationPreparations);
        // ---- downstream truth: merged publication and ordinary replay still succeed ----
        awaitFinalizing(session);
        JsonNode merged = publicCall("/api/v1/studio/guided-sessions/" + session + "/finalize", C.object().put("schemaVersion", 3)
            .put("expectedSourceRevision", edited.path("sourceRevision").asText()).put("expectedConfigurationRevision", edited.path("configurationRevision").asText()),
            200, UUID.randomUUID().toString());
        assertThat(C.parse(jdbc.queryForObject("SELECT artifact::text FROM ui_test_revisions WHERE id=?::uuid", String.class, merged.path("revisionId").asText()))
            .path("inputRecipes")).hasSize(2);
        UUID execution = UUID.fromString(publicCall("/api/v1/studio/tests/" + test + "/execute", C.object(), 202, UUID.randomUUID().toString()).path("executionId").asText());
        assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
        long end = System.nanoTime() + Duration.ofSeconds(45).toNanos(); JsonNode replay;
        do { replay = publicCall("/api/v1/studio/executions/" + execution, null, 200, null); if (replay.path("streamComplete").asBoolean()) break; Thread.sleep(30); }
        while (System.nanoTime() < end);
        assertThat(replay.path("status").asText()).isEqualTo("PASSED");
      } else {
        // ---- A77-4 sibling: owner/browser loss while the v2 ACK is pending bumps nothing ----
        hold.release.countDown(); // no plan hold in this sibling
        long held = System.nanoTime() + Duration.ofSeconds(90).toNanos();
        while (!INCREMENTAL_ACK_ENTERED.contains(session) && System.nanoTime() < held) Thread.sleep(20);
        assertThat(INCREMENTAL_ACK_ENTERED).contains(session);
        long fence = sessions.transaction(() -> sessions.lock(session).document().path("owner").path("fence").asLong());
        String pending = incrementalImmutableSnapshot(session);
        String allocations = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY binding_id)::text FROM studio_guided_allocations a WHERE session_id=?", String.class, session);
        String producers = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(p) ORDER BY binding_id)::text FROM studio_guided_producers p WHERE session_id=?", String.class, session);
        int revision = jdbc.queryForObject("SELECT materialization_revision FROM studio_guided_materializations WHERE session_id=?", Integer.class, session);
        String work = incrementalPendingSnapshot(session);
        ObjectNode context = service.runnerContext(controller, session, fence);
        ownedApplicationContext.getBean(com.citi.put.checks.studio.guided.bridge.GuidedDispatchService.class).stop(context, "LEASE_LOST");
        INCREMENTAL_ACK_RELEASE.get(session).countDown();
        long end = System.nanoTime() + Duration.ofSeconds(30).toNanos(); String state;
        do { state = sessions.transaction(() -> sessions.lock(session).document().path("state").asText());
          if (List.of("FAILED", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED").contains(state)) break; Thread.sleep(25); } while (System.nanoTime() < end);
        assertThat(state).isIn("FAILED", "UNKNOWN_OUTCOME");
        p3AwaitTeardown(session);
        assertThat(incrementalImmutableSnapshot(session)).isEqualTo(pending);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materialization_deliveries WHERE session_id=?", Integer.class, session)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY binding_id)::text FROM studio_guided_allocations a WHERE session_id=?", String.class, session)).isEqualTo(allocations);
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(p) ORDER BY binding_id)::text FROM studio_guided_producers p WHERE session_id=?", String.class, session)).isEqualTo(producers);
        assertThat(jdbc.queryForObject("SELECT materialization_revision FROM studio_guided_materializations WHERE session_id=?", Integer.class, session)).isEqualTo(revision);
        assertThat(incrementalPendingSnapshot(session)).as("no action/preparation/model/switch after loss").isEqualTo(work);
      }
    } finally {
      hold.release.countDown();
      if (id != null) { B2B_PLAN_HOLDS.remove(id); INCREMENTAL_ACK_LOSE.remove(id);
        var latch = INCREMENTAL_ACK_RELEASE.get(id); if (latch != null) latch.countDown(); INCREMENTAL_ACK_RELEASE.remove(id); INCREMENTAL_ACK_ENTERED.remove(id); }
      incrementalTenScenario = false; incrementalDomVariant = null;
      Files.writeString(TEMP.resolve("obs015-native-mode.json"), "{}");
      primaryCsi = "CSI-123"; forgetCachedCoreIdentity();
    }
  }
```

Notes for Dex:
1. In the owner-loss sibling, `incrementalPendingSnapshot` includes `counters`. If the authenticated stop legitimately changes a counter, narrow the comparison to the actions, preparations, model-attempts and switch tables only. Do **not** drop the version, delivery, allocation, producer or revision checks.
2. `prefixSyncEdit` selects step index 3 for any text not starting with `Check Confirmation`, so it fits here unchanged.
3. `B2B_PLAN_HOLDS.put` happens after the 202. The suffix SOURCE_PLAN cannot precede the 202, because it follows ten prefix coordinates. If it ever did, `hold.entered` times out and the method fails. Nothing is credited.

## 6. B2B-02 `incrementalPlainAndContextCanariesRemainPrivateAcrossMergedPublication` (default lane)

Parent: the combined P3 program (§3), with:
- `USER` = PLAIN canary
- PASS = SECRET canary
- fresh ORDER reads
- step TWO context = `[ContextText(CTX_TEXT), LiteralInput(CTX_LITERAL)]`
- base learn on `(primaryCsi,"fixture")`, then edit THREE with the title sentence, which gives a real v2 append
- mixed run (no ACK hold), merged publish, ordinary replay held at sign-in so argv/env can be scanned on the live compiled child.

```java
  @Test
  void incrementalPlainAndContextCanariesRemainPrivateAcrossMergedPublication() throws Exception {
    p3Case(() -> {
      p3Mode = P3Mode.LOGIN; b2Combined = true; b2aTitleSuffix = true;
      String plain = "B2B-PLAIN-" + UUID.randomUUID(), ctxText = "B2B-CTXTEXT-" + UUID.randomUUID(), ctxLiteral = "B2B-CTXLIT-" + UUID.randomUUID();
      String secret = "B2B-SECRET-" + UUID.randomUUID();
      AUDIT_CANARIES.addAll(List.of(plain, ctxText, ctxLiteral)); // whole-class audit stream must never carry them
      var context = new com.citi.put.checks.studio.dto.StepAuthoringContext(List.of(
          new com.citi.put.checks.studio.dto.ContextText(ctxText), new com.citi.put.checks.studio.dto.LiteralInput(ctxLiteral)), List.of());
      p3Grant(primaryCsi, "fixture");
      UUID test = b2CreateCombinedSource(primaryCsi, "fixture", plain, context);
      VaultScope scope = VaultScope.of(primaryCsi, "fixture", test);
      p3ExpectedPassword = secret; p3Seed(scope, secret);
      String original = p3Start(test, "fixture"); awaitFinalizing(original);
      P3Publication base = p3Publish(original);
      JsonNode edited = b2Edit(test, 2, "Click Sign in, click the Reports link and check protected Reports heading. Check page title is Reports.");
      int orders = B2_ORDER_VALUES.size(), contexts = B2_MODEL_CONTEXTS.size(), wire = MODEL_WIRE.size();
      Files.writeString(TEMP.resolve("obs015-native-mode.json"), "{}");
      String mixed = p3Call(p3Cookie, "/api/v1/studio/guided-sessions", p3StartCommand(test, "fixture")
          .put("sourceRevision", edited.path("sourceRevision").asText()).put("configurationRevision", edited.path("configurationRevision").asText())
          .put("baseRevisionId", base.revision().toString()), 202).path("session").path("sessionId").asText();
      awaitFinalizing(mixed);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materialization_versions WHERE session_id=?", Integer.class, mixed)).isEqualTo(2);
      P3Publication merged = b2Publish(mixed, edited);
      // ---- A68-1, A68-3, A68-4, AP08-2: pure basis declarations and materialization evidence ----
      JsonNode raw = sessions.transaction(() -> ownedApplicationContext.getBean(GuidedPublicationEvidenceRepository.class).read(mixed).document());
      JsonNode current = raw.path("snapshotEvidence").path("current");
      boolean userHash = false, passId = false;
      for (JsonNode declaration : current.path("authoredDeclarations")) {
        assertThat(declaration.has("value")).isFalse();
        if (declaration.toString().contains("\"USER\"")) userHash = declaration.path("valueHash").asText().matches("^[a-f0-9]{64}$");
        if (declaration.toString().contains("\"PASS\"")) passId = declaration.path("secretId").asText().equals("PASS"); // VERIFY-7: declaration field names
      }
      assertThat(userHash).as("plain valueHash present").isTrue(); assertThat(passId).as("secret ID present").isTrue();
      byte[] authoringBytes = current.path("authoring").toString().getBytes(StandardCharsets.UTF_8);
      assertThat(containsBytes(authoringBytes, ctxText.getBytes(StandardCharsets.UTF_8))).as("context reaches internal validation").isTrue();
      assertThat(containsBytes(authoringBytes, ctxLiteral.getBytes(StandardCharsets.UTF_8))).isTrue();
      ObjectNode outsideAuthoring = raw.deepCopy();
      ((ObjectNode) outsideAuthoring.path("snapshotEvidence").path("current")).remove("authoring");
      var rawSinks = new java.util.LinkedHashMap<String, byte[]>();
      rawSinks.put("raw-evidence-outside-authoring", outsideAuthoring.toString().getBytes(StandardCharsets.UTF_8));
      rawSinks.put("raw-evidence-whole", raw.toString().getBytes(StandardCharsets.UTF_8));
      for (String value : List.of(ctxText, ctxLiteral)) assertJoinedSinkAbsent(Map.of("raw-evidence-outside-authoring", rawSinks.get("raw-evidence-outside-authoring")), value);
      for (String value : List.of(plain, secret)) assertJoinedSinkAbsent(rawSinks, value);
      for (String value : B2_ORDER_VALUES.subList(orders, B2_ORDER_VALUES.size())) assertJoinedSinkAbsent(rawSinks, value);
      for (JsonNode entry : raw.path("materializationEvidence").path("entries")) assertThat(entry.path("metadata").has("value")).isFalse();
      // ---- A68-3 gateway: CTX_TEXT only inside authoringContext; nothing else ----
      boolean ctxSeen = false;
      for (JsonNode model : B2_MODEL_CONTEXTS.subList(contexts, B2_MODEL_CONTEXTS.size())) {
        for (String forbidden : List.of("authoringSnapshot", "authoredDeclarations", "snapshotEvidence", "configurationValues"))
          assertThat(model.findValue(forbidden)).isNull();
        ctxSeen |= model.path("authoringContext").toString().contains(ctxText);
        ObjectNode remainder = model.deepCopy(); remainder.remove("authoringContext");
        assertJoinedSinkAbsent(Map.of("gateway-context", remainder.toString().getBytes(StandardCharsets.UTF_8)), ctxText);
        for (String value : List.of(ctxLiteral, plain, secret)) assertJoinedSinkAbsent(Map.of("gateway-context", model.toString().getBytes(StandardCharsets.UTF_8)), value);
      }
      assertThat(ctxSeen).as("positive control: approved text projection really carried the context").isTrue();
      byte[] rawWire = String.join("\n", MODEL_WIRE.subList(wire, MODEL_WIRE.size())).getBytes(StandardCharsets.UTF_8);
      for (String value : List.of(ctxLiteral, plain, secret)) assertJoinedSinkAbsent(Map.of("gateway-raw", rawWire), value);
      // ---- ordinary replay held at sign-in: argv/env of the live compiled child (AP08-1) ----
      b2bSignInEntered = new java.util.concurrent.CountDownLatch(1); b2bSignInHold = new java.util.concurrent.CountDownLatch(1);
      UUID execution = p3Execute(test);
      p3AssertBinding(execution, scope, merged);
      assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
      var probeValues = new ArrayList<String>(List.of(plain, ctxText, ctxLiteral, secret));
      try {
        assertThat(b2bSignInEntered.await(45, java.util.concurrent.TimeUnit.SECONDS)).as("live ordinary child at sign-in").isTrue();
        probeValues.add(B2_ORDER_VALUES.getLast());
        b2bScanLiveProcesses(probeValues);
      } finally { b2bSignInHold.countDown(); }
      JsonNode report = p3AwaitExecution(execution, "PASSED");
      assertThat(p3DecodeVideo(execution, report)).isPositive();
      assertThat(B2_REFERENCE_RECEIPTS.getLast().equals(B2_ORDER_VALUES.getLast())).as("ordinary replay recaptured the fresh read").isTrue();
      // ---- A68-2/AP08-1/AP08-3: forbidden sinks; lawful private stores excluded by explicit list ----
      var sinks = new java.util.LinkedHashMap<String, byte[]>();
      collectJoinedSinks(sinks);
      for (String lawfulPrivate : List.of("postgres-studio_guided_source_manifests", "postgres-studio_guided_materializations",
          "postgres-studio_guided_translation_state", "postgres-ui_test_revisions", "postgres-ui_test_executions", "postgres-studio_guided_commands"))
        sinks.remove(lawfulPrivate); // VERIFY-8: confirm each column set holds only private source/config/input; never widen
      sinks.put("artifact", jdbc.queryForObject("SELECT artifact::text FROM ui_test_revisions WHERE id=?", String.class, merged.revision()).getBytes(StandardCharsets.UTF_8));
      sinks.put("public-session", p3Call(p3Cookie, "/api/v1/studio/guided-sessions/" + mixed, null, 200).toString().getBytes(StandardCharsets.UTF_8));
      sinks.put("public-result", p3Call(p3Cookie, "/api/v1/studio/guided-sessions/" + mixed + "/result", null, 200).toString().getBytes(StandardCharsets.UTF_8));
      sinks.put("public-execution", p3Call(p3Cookie, "/api/v1/studio/executions/" + execution, null, 200).toString().getBytes(StandardCharsets.UTF_8));
      sinks.put("final-report", P3_FINAL_REPORTS.get(execution).toString().getBytes(StandardCharsets.UTF_8));
      sinks.put("recording-row", String.valueOf(guidedRecordingRow(mixed)).getBytes(StandardCharsets.UTF_8));
      sinks.remove("gateway"); // gateway is checked above with the explicit authoringContext exception (A68-3)
      for (String value : List.of(plain, ctxLiteral, ctxText, secret)) assertJoinedSinkAbsent(sinks, value);
      for (String value : B2_ORDER_VALUES.subList(orders, B2_ORDER_VALUES.size())) assertJoinedSinkAbsent(sinks, value);
      for (String table : List.of("studio_guided_actions", "studio_secret_use_audit", "studio_guided_translation_plans", "studio_guided_model_attempts"))
        assertJoinedSinkAbsent(Map.of(table, String.join("\n", jdbc.queryForList("SELECT row_to_json(t)::text FROM " + table + " t WHERE session_id=?",
            String.class, mixed)).getBytes(StandardCharsets.UTF_8)), plain);
      p3Scan(List.of(secret)); // original OBS-007 sink set, unchanged (A68-5)
      p3WriteEvidence("b2b-canaries", C.object().put("canaryKinds", 5).put("contextInGatewayOnlyViaAuthoringContext", true)
          .put("liveChildArgvEnvScanned", true));
    });
  }

  /** argv + `ps eww` of the live ordinary compiled child and the guided worker; bounded, wiped, value-free failure text. */
  private void b2bScanLiveProcesses(List<String> values) throws Exception {
    var targets = new ArrayList<ProcessHandle>();
    targets.add(guidedWorker.toHandle());
    ordinaryWorker.toHandle().descendants().filter(handle -> handle.info().command().map(c -> c.endsWith("node")).orElse(false)).forEach(targets::add);
    assertThat(targets.size()).as("guided worker + at least one live ordinary node child").isGreaterThanOrEqualTo(2);
    for (ProcessHandle handle : targets) {
      C5CanaryStream scan = new C5CanaryStream(values);
      byte[] arguments = null, environment = null; Process probe = null;
      try {
        Instant started = handle.info().startInstant().orElseThrow();
        arguments = String.join("\0", handle.info().arguments().orElse(new String[0])).getBytes(StandardCharsets.UTF_8);
        probe = new ProcessBuilder("/bin/ps", "eww", "-p", Long.toString(handle.pid()), "-o", "command=").redirectErrorStream(true).start();
        registerOwnedTool(probe, "private-process-scan");
        assertThat(probe.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        environment = probe.getInputStream().readNBytes(65537);
        assertThat(environment.length).isBetween(1, 65536);
        assertThat(handle.info().startInstant().orElseThrow()).as("same process scanned").isEqualTo(started);
        scan.write(arguments, 0, arguments.length); scan.write(environment, 0, environment.length);
        scan.closeInput(); scan.assertClean(true);
      } finally {
        if (arguments != null) java.util.Arrays.fill(arguments, (byte) 0);
        if (environment != null) java.util.Arrays.fill(environment, (byte) 0);
        scan.wipe(); if (probe != null) p6CloseCommand(probe);
      }
    }
  }
```

`C5CanaryStream` caps values at 4096 chars and at most 16 values, which fits here.

### 6.1 Why B2B-02 is on P3 rather than the ten-step parent

Ledger 68 needs **secret plus referenced plain** canaries in one merged publication. P08 needs fresh-read, secret and input canaries together. Only the combined P3 program carries all three, plus a real suffix append. The ten-step parent has no secret and no declared variables. The default lane is used because the P3 family (including `actualIncrementalSecretPrefix…`) is default-lane. The access-mapping review explicitly declined to re-lane secret subjects onto 2048 untested.

### 6.2 Sink classification (B2B-02)

- **Forbidden for PLAIN, CTX_LITERAL, SECRET and ORDER:** gateway (raw plus decoded contexts); PG `studio_guided_actions`, `studio_secret_use_audit`, `studio_guided_translation_plans`, `studio_guided_model_attempts`, `studio_observed_secret_read_entries`, `studio_guided_publications`; `ui_test_revisions.artifact`; raw publication evidence; guided.log and ordinary.log; journal, scratch and objects (video); prefix-sync files; public session, result and execution; `P3_FINAL_REPORTS`; recording row; audit stream (via `AUDIT_CANARIES`); live process argv/env.
- **CTX_TEXT:** the same forbidden set, plus gateway outside `authoringContext`.
- **Lawful private stores, excluded only by name:** `studio_guided_source_manifests` (authoringSnapshot and configurationValues), `studio_guided_materializations` (authored_inputs), `studio_guided_translation_state` (manifest copy), `ui_test_revisions` non-artifact columns (revision authoring and declarations), `ui_test_executions` (accepted configuration snapshot), `studio_guided_commands` (materialization responses).
- VERIFY-8 may only **shrink** the excluded list. If a column there is found to be a public or log projection, it moves to forbidden.

## 7. Registration (exact lines; one writer, Dex-JOIN; apply only in a source window, never during a live run)

### 7.1 `backend/build.gradle.kts`

Append to `joinedDefaultMethods` (before `"auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass"`):

```kotlin
    "incrementalSecretPrefixPreservesEveryVaultFaultOracle",
    "incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck",
    "incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent",
    "incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation",
    "incrementalPlainAndContextCanariesRemainPrivateAcrossMergedPublication",
```

Low-lane singleton. `joinedIncrementalMethods` is index-addressed ([0],[1],[2]) and **must not** be extended. If B1a has already introduced a separate low singleton set, append there. Otherwise add:

```kotlin
val joinedLowAdditionMethods = setOf(
    "incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority"
)
```

Then replace the three uses of `(joinedIncrementalMethods + joinedPrefixSyncMethods)` (the `guidedIncrementalTest` include filter, the `tasks.test` exclusion loop) with `(joinedIncrementalMethods + joinedPrefixSyncMethods + joinedLowAdditionMethods)`. Extend the expected set in `requireFreshGuidedPartitions`:

```kotlin
                setOf(joinedIncrementalMethods[0], joinedIncrementalMethods[2]) + joinedPrefixSyncMethods + joinedLowAdditionMethods +
                    joinedIncrementalLabels.map { "${joinedIncrementalMethods[1]}:$it" }
```

### 7.2 ReplayIT closed sets

Add all six names to `SINGLETON_METHODS`. Add **only** `incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority` to `INCREMENTAL_METHODS`. `beginFixtureInvocation` asserts both memberships.

### 7.3 Selectors for the run (after source freeze)

```
J=com.citi.put.checks.studio.guided.publication
… run-backend-tasked.py <fresh-label> --test-tasks test,guidedIncrementalTest --require-exec-tasks test,guidedIncrementalTest -- --continue \
  test --tests $J.GuidedPublicationReplayIT.incrementalSecretPrefixPreservesEveryVaultFaultOracle \
       --tests $J.GuidedPublicationReplayIT.incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck \
       --tests $J.GuidedPublicationReplayIT.incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent \
       --tests $J.GuidedPublicationReplayIT.incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation \
       --tests $J.GuidedPublicationReplayIT.incrementalPlainAndContextCanariesRemainPrivateAcrossMergedPublication \
       --tests $J.GuidedPublicationReplayIT.actualIncrementalSecretPrefixRecapturesRotatedValueWithScopedAuditAndOrdinaryReplay \
  guidedIncrementalTest --tests $J.GuidedPublicationReplayIT.incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority \
       --tests $J.GuidedPublicationReplayIT.prefixProducerContextPostAckRevalidationRejectsChangedAuthorityOrEvidence \
       --tests $J.GuidedPublicationReplayIT.incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser
```

The last three are regression selectors. The 35-label method runs whole (the label filter is invalid). The final `check --rerun-tasks` remains mandatory.

## 8. Production seams

**None.** No production source, schema, configuration, property, clock or authorization rule is changed or proposed. Every addition is in `GuidedPublicationReplayIT.java`:
- Java fixture fields and knobs.
- The P3 page/model fixture and `/obs015-ack` option.
- The provider-thread plan hold.
- The test-owned JS wrapper string (`scRead`/`scSelect`). This is a separately named cut. `pfxRead`/`pfxSelect` and their closed mode list stay byte-identical.

Plus the `build.gradle.kts` lane registration. Runner `src`/`dist` is untouched.

## 9. Clauses NOT lawfully provable in-repo (kept OPEN, not weakened)

1. **"test Vault" / "actual Core" authority tiers.** "Vault" here is the in-JVM `FakeStudioVaultProvider` behind `CountedLoginVault`. "Core" is the in-JVM HttpServer. Fault semantics (outage, origin binding, versions, revocation) are exercised through the **production** `StudioVaultProvider` and `StudioSecretUseAuthorization` interfaces. They are not a HashiCorp Vault or Citi Core/COIN. Whether ledger 28's "test Vault" tier is satisfied by this fixture is Quinn's ruling (resume plan §6). A real-Vault reading is external and is escalated, not silently passed.
2. **Ledger 77 "no allocation bump during rebootstrap/browser restart", positive restart identity.** Production has no lawful mid-suffix continuation after an owner/browser restart. This is inferred: `GuidedTranslationService.bootstrap` requires `repository.actions(id).isEmpty()` before re-bootstrap, otherwise `UNKNOWN_OUTCOME`, and a new-owner claim revokes ADMITTED actions. In-repo proof is limited to A77-4 (loss during pending ACK bumps and appends nothing) and A18-4 (lost ACK response gives one stable same-delivery retry). "Restart identity with continuation" stays OPEN pending a product or architecture decision on whether such a continuation should exist. **No restart-continuation behavior may be invented to close it.**
3. **Ledger 46 "expired old prep cannot … consume after new ACK".** An expired preparation can never own an admission. V21 refuses any append while an action is ADMITTED, DISPATCHING or UNKNOWN_OUTCOME, and `consume` re-requires the action's `contextRevision` to equal the current context. So no lawful state exists in which an old **admission** survives into v2 to be consumed. The test proves the admit side (A46-3) and the structural impossibility by the append refusal under a live preparation (A46-1). A runtime consume-crossing witness would require an illegal seed, which is forbidden ("no illegal prefix-append seed").
4. **Native-only fault halves.** The joined path cannot reach the alias-origin bad-origin (the backend exact-origin check fires first) or the oversize **frame** (the backend refuses `>4096` before any frame). Their native-tier proofs stay the native03 local receipts at their own tier. They are not re-requested and not upgraded.

Also unexecuted (not disproven): the 2048 fitness of B2B-01 under the original caps, which is not grounds to raise caps; and the CSI budget and time of B2A-01 (8 sessions, 1 learn and 1 suffix model spend). The original item 85 stays OPEN and unamended. Full 015-then-008, the original 86/24/55, 35 labels, 80+5, private/Core/Vault/native and final gates all remain required.

## 10. Implementation verification gates (must be resolved before freeze; none may weaken an oracle)

- VERIFY-1: the combined page's `Order reference` read passes the `business-read` grant region in `fixture-other` (inferred from the `POLICY` JSON).
- VERIFY-2: pin the exact ZERO/TWO terminal state and error code on the first run. Effect oracles are code-independent and already exact.
- VERIFY-3: the audit timestamp column used to separate the base session rows. Alternatively assert that no audit row of the mixed run names the base `session_id`, which is already implied by A28-3.
- VERIFY-4: replace the placeholder `doesNotContain` with a typed `learnedPlan` walk.
- VERIFY-5: the `AuthoringRevisionIdentity.create(authoring, plainValues)` key convention for `USER`.
- VERIFY-6: the `studio_guided_commands.route` literal for `materialize` (`internal(...,"materialization",...)` suggests `materialization`).
- VERIFY-7: `authoredDeclarations` field names (`valueHash`, `secretId`, name key).
- VERIFY-8: the lawful-private PG exclusion list (may only shrink).
- Also: confirm `CONTEXT_LOST` from an appended `update` is **not** `definiteContextRefusal` (`RUNTIME_INCOMPATIBLE`+`CONTEXT_REFUSED`). If it is, A18-4 as designed would terminate the session. Record that as a finding and keep A18-4 OPEN; do not substitute a non-lost path.

Source bindings, payload hashes and the method/ledger matrix are in `manifest.json`.
