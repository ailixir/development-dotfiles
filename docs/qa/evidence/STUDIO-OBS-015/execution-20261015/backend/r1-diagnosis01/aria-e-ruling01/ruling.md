# Ruling E — C5 TRACE x in-lock ValidationBasis validation (STUDIO-OBS-015)

Author: Aria (@architect). 2026-10-16 UTC. Read-only on source; no Gradle run; no test executed by me.
Subject: `r1-diagnosis01/review.md` §6.1 item **E** (Dex options a/b/c).
Releases no QA credit and changes no lifecycle. Both production changes below need Quinn source review.

## 0. Decision in one paragraph

Adopt **E-1 + E-2** and reject a/c as stated. **E-1** is a production security control, not a test
carve-out. `com.networknt` (json-schema-validator) writes every validated instance *and its whole root
document* at DEBUG, and SecretMasker does not cover that content. So production pins it at WARN in
`application.yml`, next to the existing `com.google.genai`/`com.google.api`/`io.grpc` third-party caps
that C-5 already inherits. C-5 is unchanged except that it now **asserts** the cap holds while ROOT+APP
are at TRACE. **E-2** restores the publisher's own stated invariant ("Validation, hashing and lowering
cannot retain the preliminary session/source locks", `GuidedPlanPublisher.java:369`). Each in-lock
re-derivation of the basis keeps its derivation and equality binding inside the lock, but skips the
*repeated, pure* schema check whenever the derived document equals one this process already validated.
E-1 alone unblocks Order 9: tap9 ran with `com.networknt` at INFO, and the library has no INFO
statements, so INFO and WARN are equivalent. E-2 is still required before the 015 QA gate.

## 1. Findings (V = verified by me, I = inferred)

| # | Finding | Basis |
|---|---|---|
| F1 | The emitter is `com.networknt:json-schema-validator:1.4.0` (`build.gradle.kts:63`). Its `BaseJsonValidator.debug(Logger, JsonNode node, JsonNode rootNode, JsonNodePath)` calls `logger.debug("validate( {}, {}, {})", node, rootNode, path)`. About 45 keyword validators call it unguarded on entry to `validate`. Loggers are `com.networknt.schema.<Validator>`. Our code (`GuidedContracts`) does not log. | V: `javap -c` on the cached jar (BaseJsonValidator, TypeValidator, and an inventory of all classes) |
| F2 | At DEBUG/TRACE every keyword evaluation renders the instance node **and the whole root instance**. For a document of N bytes and K keyword evaluations, the output is about K x N bytes. That explains the 80.6 s (55/74 samples in SecretMasker regexes, 13 in the C5 scanner). | V for the call shape. I for the magnitude (consistent with the OBS-007 C5 figure of 468 MB) |
| F3 | The 015 call `validate("v3/replay-validation#/definitions/ValidationBasis", …)` is not in `GuidedContracts`' epoch map. It therefore uses the **baseline whole-native** schema (`compileSchema` → `new CompiledSchema(original, Map.of())` → `valid:176 shape.validate`), so `rootNode` is the whole basis on every keyword. The OBS-007 per-item decomposition (`compileBasis`) applies only to the `v3/replay-validation` root (used by `ObservedValidationClient`). | V: `GuidedContracts.java:98-107,195-249` |
| F4 | **Content-sink classification.** At WARN/ERROR the library logs only schema-load messages, keyword names and pattern/path/exception text. The one value-bearing message is `DateTimeFormat` "Invalid {}: {}", and it is at DEBUG. At DEBUG the library logs whole documents. Examples are the basis (which copies `raw.snapshotEvidence`, i.e. `current.authoring` with authored step text, and B2b A68-3 places CTX_TEXT/CTX_LITERAL there), `configuration`, observations/page text, the replay request artifact, and every HTTP/wire body that `GuidedContracts` validates. | V: bytecode message inventory; `GuidedPlanBuilder.java:88-99`; B2b design A68-3 |
| F5 | SecretMasker (`MaskingMessageJsonProvider` → `event.getFormattedMessage()`) masks only five JSON keys (`password`, `secret`, `token`, `api[_-]key`, `authorization`) plus e-mail addresses. It does **not** cover authored text, configuration values or page text. Secret *values* are designed out of validated documents: SecretValue/char[] path, and basis inputs require `!has("value")` (`GuidedPlanBuilder.java:153`). So this is a **private-content leak at DEBUG, not a secret leak**. OBS-007 C5 runs scanned networknt TRACE output and recorded zero secret hits (historical). | V: SecretMasker.java, MaskingMessageJsonProvider.java. I: the "not a secret leak" claim rests on the design plus historical runs; tap8 scan hits were not reported |
| F6 | **Production reachability.** `logback-spring.xml` sets root INFO and `com.citi.put.checks` INFO. No `application*.yml` sets `com.networknt` (dev sets only `com.citi.put.checks: DEBUG`). Actuator exposes only `health,info` (API) and `health,prometheus` (worker), with no `loggers` endpoint. The sink is therefore unreachable in shipped profiles. It becomes reachable with any `LOGGING_LEVEL_ROOT=DEBUG|TRACE` environment override during triage. | V: config files. I: the env-override path (standard Spring Boot behaviour, not run) |
| F7 | **What C-5 proves.** OBS-007 AC-9 oracle C-5 runs "with root and `com.citi.put.checks` at TRACE and every appender captured", expecting zero canary hits in logs, problem+json, SSE, prometheus and the idempotency cache. `armTrace` (ReplayIT:18002) sets only root and app. Third-party loggers pinned in `application.yml` (genai/api/grpc at WARN) keep their production level during C-5 today. | V: OBS-007 story AC-9; ReplayIT:18002-18008; application.yml:405-411 |
| F8 | **Lock correctness.** The derivation in `basis()` reads locked state (session document, pinned base, `lockCurrent` source, evidence) and **must** stay in the lock with its equality/hash binding. The schema check at `GuidedPlanBuilder.java:477` is a pure function of the already-derived `result`: canonical() plus networknt with no defaults/walkers, and it reads no locked state. Validating inside the lock is **not required for correctness** when the derived document equals one already validated. | V: code read of `GuidedPlanBuilder.basis` and `GuidedContracts.validatedCanonical` |
| F9 | **In-lock count.** 015 added ValidationBasis validation at `basis():477` and `plan():986`. HEAD had neither (verified with `git show HEAD:`). In the common path a finalize now runs this whole-native validation under the session row lock about four times: `prepare` `basis` (Publisher:444); the commit transaction's `basis` (Publisher:206); in the repository commit, `verifyCandidate`→`lower`→`plan` (Repository:227); and the repository `basis` (Repository:236). The lease is 30 s (`GuidedSessionService:920`), and claims take the same row lock (`SecretRevocationSweep.recheck … FOR UPDATE`). | V: code. I: the INFO cost for a basis near `MAX_BASIS_BYTES` (6 MiB) is unmeasured |
| F10 | Current ReplayIT sha256 is `f7f87136…`. It differs from the `84c3d496…` recorded in review §6.4, so another writer has changed the file since. Apply the C-5 edit to the current file. | V: shasum |

## 2. Options

| Option | Ruling | Reason |
|---|---|---|
| (a) Exclude the `com.networknt` sink from C-5 only (test-side) | **Rejected** | C-5 would diverge from production while production can still dump documents at DEBUG. A carve-out weakens the oracle; a cap closes the sink. |
| (a') **Production cap `com.networknt: WARN`; C-5 inherits it and asserts it** | **Adopted (E-1)** | It strengthens production (F4-F6). C-5 keeps root+app TRACE exactly as AC-9 words it, and follows the existing genai/api/grpc precedent (F7). It adds a cap assertion, so a regression of the cap fails C-5 loudly. Coverage of production-reachable sinks is unchanged, because the only sink "lost" is one production no longer has. |
| (b) Validate outside the row lock | **Adopted, narrowed (E-2)** | Derivation and binding stay locked (F8); only the redundant pure re-validation leaves the lock. In-lock whole-native validations drop from about 4 to 1 per finalize. The one left is the repository's independent `verifyCandidate` re-lowering, kept as defense in depth and CPU-only under E-1. |
| (b') Decouple lease renewal from the session row lock | **Rejected** | Changes the fence/ownership concurrency model; out of proportion. |
| (c) Speed up SecretMasker | **Rejected as the fix** | Volume is the cause (F2). Even zero-cost masking leaves about 19/74 samples (I: about 20 s) in the lock, close to the 30 s lease, and it leaves the content sink open. No SecretMasker change. |
| Lengthen the lease or tolerance | **Rejected** | Policy change (agreed with review §6.1). |

## 3. Exact change spec (Dex, one source window; no `build.gradle.kts` change)

### E-1a `backend/src/main/resources/application.yml`
After line 411 (`    io.grpc: WARN`), inside `logging.level`, insert:
```yaml
    # STUDIO-OBS-015 ruling E: json-schema-validator logs every validated instance and its whole
    # root document at DEBUG (BaseJsonValidator.debug). SecretMasker does not cover document
    # values, so DEBUG here is a content sink. It has no INFO output; WARN keeps its schema/pattern
    # errors (no instance values) and closes the sink under any root level.
    com.networknt: WARN
```

### E-1b `GuidedPublicationReplayIT` (C-5; assertion-only, no new evidence keys, because the shapes are closed)
- In `C5Capture.armTrace()` (currently 18002-18008), after `appLogger.setLevel(...TRACE)`, add:
  ```java
  assertThat(loggerContext.getLogger("com.networknt").getEffectiveLevel())
      .as("production com.networknt document-dump cap holds under ROOT TRACE")
      .isEqualTo(ch.qos.logback.classic.Level.WARN);
  ```
- In the final collection block, after the `traceArmed && rootTraceObserved && appTraceObserved`
  assertion (currently about 18344-18346), add the same assertion. This proves the cap held through
  collection.
- C-5 must **not** set, save or restore `com.networknt`. No other ReplayIT change.

### E-1c New test `backend/src/test/java/com/citi/put/checks/config/logging/SchemaValidatorLogCapTest.java`
Plain JUnit 5 with no Spring. Save and restore every touched logger level and appender in `finally`.
1. `networkntDebugWritesWholeValidatedDocuments`: this is the hazard oracle.
   - Attach a started `ListAppender` to logger `com.networknt` and set it to DEBUG.
   - Set `canary = "NNT-CANARY-" + UUID`.
   - Assert `new GuidedContracts().validate("v3/replay-validation#/definitions/ValidationBasis", {"probe": canary})` throws `GuidedSessionException("INVALID_CONTRACT")`.
   - Assert at least one event's `getFormattedMessage()` contains the canary.
   - Assert `SecretMasker.mask(thatMessage)` still contains it.
2. `productionCapSilencesItUnderRootTrace`:
   - Set root to TRACE and `com.networknt` to WARN, then make the same call.
   - Assert zero events on the appender.
3. `applicationYamlPinsTheCapAndNoProfileLowersIt`:
   - Use `YamlPropertySourceLoader` on `application.yml` and assert `logging.level.com.networknt` = `WARN`.
   - For each `application-{api,dev,local,prod,staging,test,worker}.yml`, assert no property key equals or starts with `logging.level.com.networknt`.

### E-2 Production: keep derivation locked, skip only the repeated pure check
`backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPlanBuilder.java`
1. Rename the current body of `public ObjectNode basis(Base, CurrentSource, Evidence, JsonNode session,
   JsonNode learningProvenance)` (58-479) to `private ObjectNode derive(...same params...)`. `derive`
   ends at `PublicationContracts.bounded(result, MAX_BASIS_BYTES); return result;`, so line 477 is
   **not** in `derive`.
2. Add `private static final String VALIDATION_BASIS = "v3/replay-validation#/definitions/ValidationBasis";`.
3. Add `public ObjectNode basis(...same params...)`:
   `{ ObjectNode r = derive(...); contracts.validate(VALIDATION_BASIS, r); return r; }`.
   Behaviour is byte-for-byte as today. All existing test callers (MigrationTest:613, AuthorityIT:207, the two fixtures) stay as they are.
4. Add `public ObjectNode basisMatching(...same params..., JsonNode validated)`:
   `{ ObjectNode r = derive(...); if (validated == null || !r.equals(validated)) { contracts.validate(VALIDATION_BASIS, r); } return r; }`.
   Javadoc: *"`validated` must be a document this process already passed through `basis()` or `plan()`; never wire input. Validity is a pure function of the document, so an equal document has the same verdict. Unequal or absent ⇒ validated here, with today's exact error."*
5. `plan()` (986-987) is unchanged.

`GuidedPlanPublisher.java`
6. `prepare` (444-450): `builder.basis(...)` → `builder.basisMatching(..., lowering != null && lowering.owner() == this ? lowering.input().basis() : null)`.
   The witness is the `ownLoweringInput` copy of the `basis()` result validated pre-lock at :360.
7. Commit transaction (205-211): `builder.basis(...)` → `builder.basisMatching(..., prepared.snapshot().basis())`.
   The `basisHash` check at 212-216 is unchanged.
8. `prepareLoweringInput` (:360) is unchanged and still validates, outside the lock.

`GuidedPublicationRepository.java`
9. `commit` (236-237): `builder.basis(...)` → `builder.basisMatching(..., basis)`, where `basis` is `commit.snapshot().basis()`.
   `verifyCandidate(commit.snapshot(), …)` at :227 has already run `lower → plan → validate(VALIDATION_BASIS)` on that exact document in this transaction.
   The `currentBasis.equals(basis) && hash` requirement (238-239) is unchanged.
   **Constraint:** if `verifyCandidate` is ever moved after line 236, this witness must become `null`.

Verdict preservation: for every input, `basisMatching` returns the same value and throws the same
exception as `basis()`. Jackson `ObjectNode.equals` is deep and numeric-type-sensitive, so any
divergence revalidates; it is never optimistic.

### E-2 test: `GuidedPublicationAuthorityIT`
Add `lockedRederivationRevalidatesOnlyWhenTheDerivedBasisDiffers`, reusing the class's existing
completed-session fixture plumbing (as at :203-208), inside one transaction.
- Set `checked = Mockito.spy(new GuidedContracts())` (existing pattern: `ObservedArtifactLowererTest:155`) and `b = new GuidedPlanBuilder(checked)`.
- `v = b.basis(...)` → the VALIDATION_BASIS count is 1.
- `b.basisMatching(..., v)` returns a value equal to `v` → the count stays 1.
- `b.basisMatching(..., null)` → the count is 2.
- `b.basisMatching(..., v.deepCopy().put("schemaVersion", 2))` → the count is 3.

Count with `verify(checked, times(n)).validate(eq(VALIDATION_BASIS), any())`.

## 4. Verification that proves it (collector, `--no-daemon`, fresh labels)
1. Unit and source tier: `SchemaValidatorLogCapTest` (3/3), the new AuthorityIT method, and unchanged
   `GuidedPublicationAuthorityIT`, `GuidedPublicationMigrationTest`, `SnapshotBasisValidationTest`,
   `ObservedArtifactLowererTest` and `TypedReferenceAdapterTest` all pass. `compileTestJava` is green.
   Spotless is clean on the touched files only.
2. Joined: ReplayIT `actualLearningPublishes…`, `actualSecretLoginPublishes…` (Order 9) and
   `auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass`. Expected results:
   - Order 9 **PASS** with finalize 200 and no `LEASE_LOST`.
   - Teardown CONFIRMED.
   - C-5 reports `rootTraceObserved`/`appTraceObserved` true, both new cap assertions pass, and there are zero canary hits.
3. Diagnostic, no credit: the same Order 9 with `STUDIO_C5_CLAIM_DIAGNOSTIC=true`. Every claim during
   finalize should be < 1 s (was 25.97 s), and `c5-lifecycle-diagnostic` should show no `LEASE_LOST`.
4. Invariants: identities 85 and labels 35 are unchanged; no assertion or budget is lowered; no
   `build.gradle.kts` change; 22246 is not used.
   The full R1 rerun remains gated on item G.

## 5. Residuals (not blocking 015)
- R-1 (I): one whole-native ValidationBasis validation, plus `GuidedBasisValidator`, stays in the
  commit lock through `verifyCandidate`. Its INFO cost for a basis near 6 MiB is unmeasured. Track a
  timing probe before GA; consider routing `#/definitions/ValidationBasis` through the reviewed
  `compileBasis` decomposition then.
- R-2 (I): B2b B2B-02 forbids CTX_TEXT/CTX_LITERAL in logs but does not scan the backend JSON_CONSOLE
  at TRACE. E-1 closes the networknt path to that sink by policy. No B2b change is ordered here.

## 6. Story bookkeeping
Add to the 015 File List: `application.yml`, `GuidedPlanBuilder.java`, `GuidedPlanPublisher.java`,
`GuidedPublicationRepository.java`, `GuidedPublicationReplayIT.java` (C-5 assertions), the new
`SchemaValidatorLogCapTest.java`, and `GuidedPublicationAuthorityIT.java`. Quinn reviews E-1 and E-2
before the joined run. If E-2 review lags, E-1 may run alone to unblock R1; E-2 then stays a 015
gate blocker.
