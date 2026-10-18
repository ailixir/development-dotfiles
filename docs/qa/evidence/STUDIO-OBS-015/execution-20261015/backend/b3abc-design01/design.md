# B3a / B3b / B3c test designs (STUDIO-OBS-015)

Author: Aria (@architect), read-only design. Written 2026-10-15 local / 2026-10-16T02:43Z.
Scope: implementation-ready test designs only. No source, build, Gradle, pnpm, test, DB, process or git action was run. No QA credit, release or lifecycle change is granted. A backend validation run was live while this was written, so every source path was read-only. The only writes are this file and `manifest.json` in the same folder.

Inputs I read, with sha256 values in `manifest.json`: resume plan §2–4, `current-gap-plan01/{review.md,next-batches.json,requirement-map.json}`, ledger entries 31/42/43/52/60/61/63/72/73/75/76 (jq), IPC P03/N01, the 15 `privateAuthority15` routes, `b3a-private-authority-source01/{private-routes.json,remaining.json,selectors.json,qa-review/*}`, `b1a-callback-seam01/review.md` (format exemplar), and the current sources `GuidedPublicationAuthorityIT.java` (e6228117…), `GuidedPublicationReplayIT.java` (f279684c…) and `backend/build.gradle.kts` (1cc4cee0…). I also read these production routes: `GuidedPlanPublisher`, `GuidedPublicationRepository`, `GuidedPublicationEvidenceRepository`, `GuidedPublicationBaseRepository`, `GuidedPlanBuilder.basis`, `GuidedSnapshotDeriver`, `GuidedBasisValidator`, `GuidedMaterializationEvidence`, `ObservedArtifactLowerer`, `ObservedReferencePolicyDeriver`, `GuidedIncrementalStore`, `GuidedTranslationStore.acceptPlan/reserveAttempt`, `GuidedTranslationService.replan/learnSuffix/call/stopRejected`, `GuidedPlanHistoryAudit`, `GuidedSessionVideoController` and `GuidedRecordingTimings`.

**Verified by reading** means I quoted or followed the source. **Predicted** means a stage or code I derived from reading but have not executed. Every predicted stage below is pinned by an assertion. If the run shows a different stage, that label is OPEN. Do not re-point it.

---

## 0. Decisions and their reasons

| # | Decision | Why |
|---|---|---|
| D1 | **No production seam.** All seven methods use existing public or package-private production APIs. These are `GuidedPublicationRepository(JdbcTemplate, GuidedContracts, Supplier<GuidedPublicationEvidenceRepository>)` (package-private, and the test package is the same), the bean reader with its installed `ObservedRevisionVerifier`, the bean `ObservedValidationClient` (the actual runner validator), `GuidedTranslationStore.acceptPlan`, `GuidedPlanHistoryAudit.transition`, and the authenticated HTTP routes. | Verified. The writer re-reads complete stored evidence under the same locks (`GuidedPublicationRepository.commit` lines 233–239). That is the exact authority each private route names. |
| D2 | **The attack model is the offered basis against the actual stored writer.** Each attack runs inside one rolled-back transaction: `reserve → claim → validate → finish → commit`. The offered basis is mutated and its hashes are resealed. The test records the stage that refuses. It does not substitute returned rows, except in two 52 labels where the attacked object is the stored private history itself (§3.1.4). | A coherent substitution of every returned row is equivalent to owning the database. That is not a lawful attacker. Stored immutability is already covered by `assertIncrementalImmutableSourceAndPlanHistory` (SQL UPDATE refusals). The lawful question is whether an offered or claimed fact can borrow stored authority. Only the writer's stored re-read can answer it. |
| D3 | **Stage oracle.** For every attack the test also runs the backend public lowerer (`ObservedArtifactLowerer.lower`) on the offered basis and records the result. **requireStored** labels need all of the following: the lowerer ACCEPTS, the actual runner validator returns `ok:true`, and the writer refuses `PUBLICATION_CONFLICT` with exactly one stored reader call. **requireBackendPure** labels need the lowerer to refuse and the writer to make zero reader calls. **refuse** labels record whichever genuine guard fires, but they must never be adopted. `UNKNOWN_OUTCOME` or `EXPIRED` from the validator is not credited. | Strict where the source reading is certain (the private preimage cannot be recomputed from the public basis), and honest where it is not. A recomputed-hash attack must not pass, whichever guard stops it. |
| D4 | **ReplayIT verdicts come from the actual runner validator.** I use the bean `ObservedValidationClient.validate` with the publisher's exact outgoing shape (`GuidedPlanPublisher` lines 120–131). AuthorityIT keeps the existing controlled verdict, the same one its `prepareStored` already uses at the relational tier. | This keeps the joined parents at actual application tier. Two inputs stay controlled and are disclosed: the publication **grant** (test-built from the stored base's principal and CSI, and checked by the writer against that stored base) and, in AuthorityIT only, the verdict. Nothing is committed. Every staged transaction is `setRollbackOnly()`. |
| D5 | **Parents reuse `incrementalJoined(variant)` through three null-guarded hooks**, following the `b1TrustedCeiling` precedent at ReplayIT:3359/4056. When `b3Hooks == null`, the 35 variants, 80 original identities and 5 PFXSYNC methods behave exactly as before. Only their source bytes change. | This is the cheapest lawful real parent: base learn, public finalize, actual edit, mixed start, native prefix, model suffix, finalize, ordinary replay. Copying the 400-line flow would duplicate shared assertions. |
| D6 | B3a adds **two @Test singletons**, so AuthorityIT goes from 24 to 26 invocations. B3b adds 3 and B3c adds 2 ReplayIT singletons in the **guidedIncrementalTest / incremental2048** lane. | The plan's counts. Every new ReplayIT method uses `incrementalTenScenario`, so it belongs to the low lane. |
| D7 | Each B3 ReplayIT method runs under its own CSI, using the PFXSYNC pattern at ReplayIT:3574–3577 through the existing `p3CsiOrdinal`. | The daily token budget must never grow. |

`[AUTO-DECISION]` The task said 52's "multi-version" can only be lawful in a joined parent. → I use `append-input`, which actually has two materialization versions and a version-2 ACK (`assertIncrementalAppendAckHistory`). (Reason: `Database.rebindSharedBasis` rejects more than one version, and B3a may not change shared fixtures.)
`[AUTO-DECISION]` Where should ledger 75 (graph edges) live? → In B3b-3, on the `admitted-drift2` parent. (Reason: that is the only parent with both consumer edges and an actual excluded native0 attempt.)

---

## 1. Shared ReplayIT harness (test-only, ReplayIT.java)

### 1.1 Hook points in `incrementalJoined` (three insertions; no other byte of the method changes)

| Insert after | Exact line to add |
|---|---|
| ReplayIT:3925 (the end of the `confirm-edit4` text block, before `AUDIT_CANARIES.addAll(texts);`) | `if (b3Hooks != null) b3Hooks.texts(variant, texts);` |
| ReplayIT:4140 (`assertIncrementalImmutableSourceAndPlanHistory(mixed, …);`) | `B3Parent b3Parent = b3Hooks == null ? null : new B3Parent(mixed, test, base, edited, currentSteps, boundary, variant);` and then `if (b3Parent != null) b3Hooks.beforeFinalize(b3Parent);` |
| ReplayIT:4248 (the closing `}` of `if (expectedSubmit == 1) {…}`, before `} finally {`) | `if (b3Parent != null) b3Hooks.afterFirstOrdinaryReplay(b3Parent, merged, execution);` |

`b3Hooks` is reset by each B3 method in its own `finally`. The existing `finally` is untouched.

### 1.2 Fixture-model and capture edits (test-owned code inside ReplayIT)

* `incrementalTenModel` (ReplayIT:20425), at the top of the `SOURCE_PLAN` branch: `var hold = b3FirstSuffixHold; if (hold != null && context.has("learningWindow")) hold.hold(context.path("sessionId").asText());`
* `incrementalTenModel`, the `b3ReadInsideDriftStep` branches (B3c-1 only; §4.1.2).
* `observedReportCapture` filter (ReplayIT:1963), as the first branch inside the lambda: the B3 evidence-callback capture (§4.2.2).

### 1.3 Common declarations

```java
  // ---------------- STUDIO-OBS-015 B3b/B3c design01: inactive unless one B3 method selects it -------------
  private interface B3Hooks {
    default void texts(String variant, List<String> texts) {}
    default void beforeFinalize(B3Parent parent) throws Exception {}
    default void afterFirstOrdinaryReplay(B3Parent parent, JsonNode merged, UUID execution) throws Exception {}
  }
  private record B3Parent(String id, UUID test, JsonNode base, JsonNode edited, ArrayNode steps, int boundary, String variant) {}
  private record B3Outcome(String label, String stage, String code, int readsDelta, String backendLowering) {}
  private static volatile B3Hooks b3Hooks;
  private static volatile boolean b3ReadInsideDriftStep;
  private static volatile B3FirstSuffixHold b3FirstSuffixHold;
  private static volatile B3EvidenceCapture b3EvidenceCapture;
  /** Value-free per-label stage records: session hash, label, stage, code, reader delta only. */
  private static final List<ObjectNode> B3_OUTCOMES = new CopyOnWriteArrayList<>();

  private void b3IsolatedCsi() {
    // PFXSYNC precedent (3574-3577): never enlarge the shared real daily cap.
    primaryCsi = "CSI-B3-" + (++p3CsiOrdinal);
    forgetCachedCoreIdentity();
    jdbc.update("INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
        + " VALUES (?,'Orders','Ops','HIGH','fixture@example.invalid','Production')", primaryCsi);
  }

  private void b3RestoreCsi() { primaryCsi = "CSI-123"; forgetCachedCoreIdentity(); }

  /** Every row a publication could write for this test/session, excluding the live lease. */
  private String b3PublicationWrites(UUID test, String id) {
    ObjectNode out = C.object();
    out.set("test", C.parse(jdbc.queryForObject("SELECT to_jsonb(t)::text FROM ui_tests t WHERE id=?", String.class, test)));
    out.set("revisions", C.parse(jdbc.queryForObject("SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb)::text"
        + " FROM ui_test_revisions r WHERE test_id=?", String.class, test)));
    for (String table : List.of("studio_guided_publications", "studio_guided_publication_attempts"))
      out.set(table, C.parse(jdbc.queryForObject("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM "
          + table + " t WHERE session_id=?", String.class, id)));
    out.set("session", C.parse(jdbc.queryForObject("SELECT jsonb_build_object('state',state,'documentState',document->'state',"
        + "'revision',progress->'publicationRevisionId','digest',progress->'publicationRevisionDigest')::text"
        + " FROM studio_guided_sessions WHERE session_id=?", String.class, id)));
    out.set("immutable", C.parse(incrementalImmutableSnapshot(id)));
    out.set("acceptances", C.parse(jdbc.queryForObject("SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb)::text"
        + " FROM studio_guided_suffix_acceptances t WHERE session_id=?", String.class, id)));
    return GuidedContracts.hash(out);
  }

  private static String b3Replace(ObjectNode basis, String from, String to) {
    // Exact-token identity substitution across the offered basis (IDs are UUID/opaque; never a value).
    assertThat(from).isNotEqualTo(to);
    return basis.toString().replace("\"" + from + "\"", "\"" + to + "\"");
  }
```

### 1.4 `B3WriterProbe`: the staged writer with the actual runner validator

```java
  /** Rolled-back reserve/claim/actual-runner-validate/finish/commit at the actual stored writer. */
  private final class B3WriterProbe {
    final String id; final UUID test;
    final org.springframework.transaction.support.TransactionTemplate tx;
    final GuidedPublicationEvidenceRepository reader;
    final GuidedPublicationRepository writer;
    final ObservedValidationClient validator;
    final AtomicInteger reads = new AtomicInteger();
    final PublicationContracts.Base base;
    final ObjectNode genuine, identityTemplate, profile, build;
    final PublicationContracts.Candidate genuineCandidate;

    B3WriterProbe(String id, UUID test) {
      this(id, test, ownedApplicationContext.getBean(GuidedPublicationEvidenceRepository.class));
    }

    B3WriterProbe(String id, UUID test, GuidedPublicationEvidenceRepository reader) {
      this.id = id; this.test = test; this.reader = reader;
      tx = new org.springframework.transaction.support.TransactionTemplate(
          ownedApplicationContext.getBean(org.springframework.transaction.PlatformTransactionManager.class));
      validator = ownedApplicationContext.getBean(ObservedValidationClient.class);
      // Package-private production constructor; the counting supplier is the stored-reader stage witness.
      writer = new GuidedPublicationRepository(jdbc, C, () -> { reads.incrementAndGet(); return this.reader; });
      var bases = ownedApplicationContext.getBean(GuidedPublicationBaseRepository.class);
      var actual = ownedApplicationContext.getBean(GuidedPublicationEvidenceRepository.class);
      ObjectNode selected = ownedApplicationContext.getBean(ObservedReplayPins.class).selected();
      profile = (ObjectNode) selected.path("profile").deepCopy();
      build = (ObjectNode) selected.path("build").deepCopy();
      // Exactly GuidedPlanPublisher.prepare's basis/identity construction, read-only and rolled back.
      Object[] captured = tx.execute(status -> {
        status.setRollbackOnly();
        var current = sessions.lock(id);
        assertThat(current.document().path("state").asText()).isEqualTo("FINALIZING");
        var pinned = bases.find(id).orElseThrow();
        var source = bases.lockCurrent(test);
        bases.requireCurrent(pinned, source);
        var raw = actual.read(id);
        var builder = new GuidedPlanBuilder(C);
        ObjectNode basis = builder.basis(pinned, source, raw, current.document(),
            builder.learningProvenance(raw.document().path("sourceManifest")));
        ObjectNode identity = C.object();
        identity.set("base", pinned.document());
        identity.set("ownerWorkerId", current.document().path("owner").path("workerId"));
        identity.set("ownerFence", current.document().path("owner").path("fence"));
        identity.set("translationHash", basis.path("translationHash"));
        return new Object[] {pinned, basis, identity};
      });
      base = (PublicationContracts.Base) captured[0];
      genuine = (ObjectNode) captured[1];
      identityTemplate = (ObjectNode) captured[2];
      genuineCandidate = new ObservedArtifactLowerer(C).lower(genuine.deepCopy(), profile.deepCopy());
    }

    B3Outcome staged(String label, ObjectNode offered, PublicationContracts.Candidate candidate, String lowering) {
      String key = "b3-" + label + "-" + UUID.randomUUID();
      String digest = GuidedContracts.hash(C.object().put("b3", key));
      int before = reads.get();
      String[] stage = {"UNREACHED", null};
      try {
        tx.executeWithoutResult(status -> {
          status.setRollbackOnly();
          JsonNode current = sessions.lock(id).document();
          Instant deadline = Instant.now().plusSeconds(12);
          for (Instant ceiling : List.of(Instant.parse(current.path("expiresAt").asText()),
              Instant.parse(current.path("owner").path("leaseExpiresAt").asText())))
            if (deadline.isAfter(ceiling)) deadline = ceiling;
          ObjectNode identity = identityTemplate.deepCopy();
          identity.put("basisHash", GuidedContracts.hash(offered)).put("validationBuildHash", GuidedContracts.hash(build))
              .put("validationDeadline", PublicationContracts.time(PublicationContracts.millisecond(deadline)));
          for (String field : List.of("learnedPlanHash", "artifactHash", "referencePolicyHash",
              "operationEquivalenceHash", "publicationEvidenceHash", "profileHash"))
            identity.set(field, candidate.hashes().path(field));
          var snapshot = new PublicationContracts.Snapshot(identity, offered);
          var attempt = writer.reserve(new PublicationContracts.Claim(id, key, digest, snapshot), Instant.now());
          attempt = writer.claim(id, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
          ObjectNode outgoing = C.object().put("schemaVersion", 3).put("attemptId", attempt.attemptId().toString())
              .put("claimId", attempt.claimId().toString()).put("snapshotHash", snapshot.hash())
              .put("basisHash", identity.path("basisHash").asText());
          outgoing.set("requiredProfile", candidate.artifact().path("profile"));
          outgoing.set("requiredBuild", build);
          outgoing.set("artifact", candidate.artifact());
          outgoing.set("validationBasis", snapshot.basis());
          JsonNode verdict;
          try {
            verdict = validator.validate(outgoing, new PublicationBudget(attempt.validationDeadline(), java.time.Clock.systemUTC()));
          } catch (GuidedSessionException failure) {
            stage[0] = "VALIDATOR_FAILURE"; stage[1] = failure.getMessage(); return;
          }
          if (!verdict.path("ok").asBoolean()) {
            stage[0] = "VALIDATOR_REJECTED"; stage[1] = verdict.path("errorCode").asText(); return;
          }
          writer.finish(id, attempt.attemptId(), attempt.claimId(), snapshot.hash(),
              PublicationContracts.AttemptStatus.VALIDATED, verdict, null, Instant.now());
          // Controlled input (disclosed): the grant, built from the stored base and re-checked by the writer.
          var grant = new PublicationContracts.Grant(id, base.document().path("originalPrincipalId").asText(),
              base.document().path("csiId").asText(), snapshot.hash(), attempt.validationDeadline());
          var receipt = writer.commit(new PublicationContracts.Commit(id, UUID.randomUUID(), attempt.attemptId(),
              attempt.claimId(), key, digest, snapshot, candidate, grant), Instant.now());
          assertThat(jdbc.queryForObject("SELECT confirmed_revision_id::text FROM ui_tests WHERE id=?", String.class, test))
              .isEqualTo(receipt.document().path("revisionId").asText());
          stage[0] = "COMMITTED_ROLLED_BACK";
        });
      } catch (GuidedSessionException refused) {
        stage[0] = "WRITER_REFUSED"; stage[1] = refused.getMessage();
      }
      var outcome = new B3Outcome(label, stage[0], stage[1], reads.get() - before, lowering);
      B3_OUTCOMES.add(C.object().put("sessionHash", GuidedContracts.hash(JSON.getNodeFactory().textNode(id)))
          .put("label", label).put("stage", outcome.stage()).put("code", outcome.code())
          .put("readsDelta", outcome.readsDelta()).put("backendLowering", lowering));
      return outcome;
    }

    private void noWrite(String writes, int model, int legacy, int effects, int navigations) {
      assertThat(b3PublicationWrites(test, id)).as("rolled-back stage leaves every publication row unchanged").isEqualTo(writes);
      assertThat(MODEL_WIRE).hasSize(model); assertThat(LEGACY_MODEL_CALLS.get()).isEqualTo(legacy);
      assertThat(RECEIPTS).hasSize(effects); assertThat(NAVIGATIONS.get()).isEqualTo(navigations);
    }

    B3Outcome positive(String label) {
      String writes = b3PublicationWrites(test, id);
      int model = MODEL_WIRE.size(), legacy = LEGACY_MODEL_CALLS.get(), effects = RECEIPTS.size(), navigations = NAVIGATIONS.get();
      var outcome = staged(label, genuine.deepCopy(), genuineCandidate, "ACCEPTED");
      assertThat(outcome.stage()).as("the genuine stored basis is adoptable at the same boundary").isEqualTo("COMMITTED_ROLLED_BACK");
      assertThat(outcome.readsDelta()).isEqualTo(1);
      noWrite(writes, model, legacy, effects, navigations);
      return outcome;
    }

    B3Outcome refuse(String label, java.util.function.Consumer<ObjectNode> mutation) {
      ObjectNode offered = genuine.deepCopy();
      mutation.accept(offered);
      return refuseOffered(label, offered);
    }

    B3Outcome refuseOffered(String label, ObjectNode offered) {
      assertThat(offered.equals(genuine)).as("%s changes the offered basis", label).isFalse();
      PublicationContracts.Candidate candidate = genuineCandidate;
      String lowering = "ACCEPTED";
      try { candidate = new ObservedArtifactLowerer(C).lower(offered.deepCopy(), profile.deepCopy()); }
      catch (GuidedSessionException refused) { lowering = "REFUSED:" + refused.getMessage(); }
      String writes = b3PublicationWrites(test, id);
      int model = MODEL_WIRE.size(), legacy = LEGACY_MODEL_CALLS.get(), effects = RECEIPTS.size(), navigations = NAVIGATIONS.get();
      var outcome = staged(label, offered, candidate, lowering);
      assertThat(outcome.stage()).as("%s is never adopted", label).isNotIn("COMMITTED_ROLLED_BACK", "UNREACHED");
      if (outcome.stage().equals("VALIDATOR_FAILURE"))
        assertThat(outcome.code()).as("%s: uncertainty is not a refusal", label).isNotIn("UNKNOWN_OUTCOME", "EXPIRED");
      if (outcome.readsDelta() == 1) assertThat(outcome.code()).isEqualTo("PUBLICATION_CONFLICT");
      if (!lowering.equals("ACCEPTED"))
        assertThat(outcome.readsDelta()).as("%s: a backend-refused basis never reaches the stored reader", label).isZero();
      noWrite(writes, model, legacy, effects, navigations);
      return outcome;
    }

    void requireStored(String label, java.util.function.Consumer<ObjectNode> mutation) {
      var outcome = refuse(label, mutation);
      assertThat(outcome.backendLowering()).as("%s is invisible to the public lowerer", label).isEqualTo("ACCEPTED");
      assertThat(outcome.stage()).as("%s passes the actual runner validator and meets stored authority", label)
          .isEqualTo("WRITER_REFUSED");
      assertThat(outcome.code()).isEqualTo("PUBLICATION_CONFLICT");
      assertThat(outcome.readsDelta()).isEqualTo(1);
    }

    void requireBackendPure(String label, java.util.function.Consumer<ObjectNode> mutation) {
      var outcome = refuse(label, mutation);
      assertThat(outcome.backendLowering()).as("%s is refused by the backend lowerer itself", label).startsWith("REFUSED:");
      assertThat(outcome.readsDelta()).isZero();
    }

    /** Genuine offered basis; the attacked object is the stored-reader return (52 only). */
    B3Outcome genuineAgainstReader(String label) {
      String writes = b3PublicationWrites(test, id);
      int model = MODEL_WIRE.size(), legacy = LEGACY_MODEL_CALLS.get(), effects = RECEIPTS.size(), navigations = NAVIGATIONS.get();
      var outcome = staged(label, genuine.deepCopy(), genuineCandidate, "ACCEPTED");
      noWrite(writes, model, legacy, effects, navigations);
      return outcome;
    }
  }
```

Notes I verified by reading. `reserve` checks only `hash(basis)==identity.basisHash` plus stored `authority()` (lines 56–64). `commit` order (lines 205–239): attempt and status, `authority`, `verifyVerdict`, grant against the stored base, `verifyCandidate` (which recomputes lowering of the offered basis), then the **stored reader**, then `currentBasis.equals(basis)`. That ordering means `readsDelta` separates pure refusals (0) from stored refusals (1). `Snapshot.hash()` is `hash(identity)` (PublicationContracts:102). Resealing `basisHash` therefore changes the claim hash, and every staged attempt is new.

---

## 2. B3a: `GuidedPublicationAuthorityIT` only (24 → 26)

Owner: Dex-AUTH, the exclusive writer of AuthorityIT. No ReplayIT or build change. Lane: default `test` (AuthorityIT is not a JOIN class, so it needs no registration). Selector: `./gradlew test --tests com.citi.put.checks.studio.guided.publication.GuidedPublicationAuthorityIT` (the whole class: 5 existing methods, 24 invocations, plus 2 new = 26).

Parent: the existing shared relational `GuidedPublicationMigrationTest.Database(owner.jdbc, owner.tx, namespace, canonicalBasis)` at actual head PostgreSQL, with the actual classifier, source and base. Upstream outcomes are controlled, exactly as in source01. No fixture, helper, schema or migration changes.

What B3a adds over source01 (verified gaps in `b3a-private-authority-source01/private-routes.json`):
* The **exact original offered-basis pointers** that source01 left OPEN: `/basis/materializationEvidence/entries/0/inputHash`, `/basis/sourceManifestHash` and `/basis/snapshotEvidence/current/authoring/steps/2/context/entries/1/value`.
* **Foreign-session / cross-CSI / cross-test / foreign-admission borrowing** (31).

### 2.1 New helpers (AuthorityIT)

```java
  // ---- STUDIO-OBS-015 B3a design01: offered public basis versus actual stored private authority ----

  private record B3aGenuine(PublicationContracts.Snapshot snapshot, PublicationContracts.Candidate candidate,
      JsonNode profile, JsonNode build) {}

  private static PublicationContracts.Snapshot b3aReseal(JsonNode template, ObjectNode basis,
      PublicationContracts.Candidate candidate, JsonNode build) {
    ObjectNode identity = template.deepCopy();
    identity.put("validationDeadline", PublicationContracts.time(PublicationContracts.millisecond(Instant.now().plusSeconds(12))))
        .put("basisHash", GuidedContracts.hash(basis)).put("validationBuildHash", GuidedContracts.hash(build));
    for (String field : List.of("artifactHash", "learnedPlanHash", "referencePolicyHash", "operationEquivalenceHash",
        "publicationEvidenceHash", "profileHash"))
      identity.set(field, candidate.hashes().path(field));
    return new PublicationContracts.Snapshot(identity, basis);
  }

  private static B3aGenuine b3aGenuine(GuidedPublicationMigrationTest.Database db, PublicationContracts.Base base) {
    var captured = db.snapshot(base);
    var profile = GuidedPublicationMigrationTest.currentProfile();
    var build = GuidedPublicationMigrationTest.observedBuild(profile);
    ObjectNode basis = (ObjectNode) captured.basis().deepCopy();
    var candidate = new ObservedArtifactLowerer(C).lower(basis.deepCopy(), profile);
    return new B3aGenuine(b3aReseal(captured.identity(), basis, candidate, build), candidate, profile, build);
  }

  /** One rolled-back reserve/claim/finish/commit through the actual current writer; returns the outcome code. */
  private static String b3aStaged(GuidedPublicationMigrationTest.Database db, GuidedPublicationRepository writer,
      PublicationContracts.Base base, String label, PublicationContracts.Snapshot snapshot,
      PublicationContracts.Candidate candidate, JsonNode profile, JsonNode build) {
    String id = db.fixtureSession(), key = "b3a-" + label, digest = GuidedContracts.hash(C.object().put("b3a", label));
    try {
      db.tx.executeWithoutResult(t -> {
        t.setRollbackOnly();
        var attempt = writer.reserve(new PublicationContracts.Claim(id, key, digest, snapshot), Instant.now());
        writer.claim(id, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
        // Controlled relational-tier validator result, exactly the existing prepareStored shape.
        ObjectNode verdict = C.object().put("schemaVersion", 3).put("ok", true).putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString()).put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash()).put("basisHash", snapshot.identity().path("basisHash").asText());
        for (String field : List.of("artifactHash", "learnedPlanHash", "referencePolicyHash", "operationEquivalenceHash",
            "admissionProvenanceHash", "publicationEvidenceHash"))
          verdict.set(field, candidate.hashes().path(field));
        verdict.set("profile", profile); verdict.set("build", build);
        writer.finish(id, attempt.attemptId(), attempt.claimId(), snapshot.hash(),
            PublicationContracts.AttemptStatus.VALIDATED, verdict, null, Instant.now());
        var receipt = writer.commit(new PublicationContracts.Commit(id, UUID.randomUUID(), attempt.attemptId(),
            attempt.claimId(), key, digest, snapshot, candidate, new PublicationContracts.Grant(id,
                base.document().path("originalPrincipalId").asText(), base.document().path("csiId").asText(),
                snapshot.hash(), attempt.validationDeadline())), Instant.now());
        assertThat(receipt).isNotNull();
        assertThat(db.jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions WHERE guided_session_id=?",
            Integer.class, id)).isEqualTo(1);
      });
      return "COMMITTED";
    } catch (GuidedSessionException refused) {
      return refused.getMessage();
    }
  }

  private static String b3aDifferentHash(String hash) {
    String replacement = GuidedContracts.hash(C.object().put("b3a-substitute", hash));
    assertThat(replacement).isNotEqualTo(hash).matches("[a-f0-9]{64}");
    return replacement;
  }

  /** Stage oracle: a backend-refused basis must stop before the stored reader; otherwise the reader refuses. */
  private static String b3aRefused(GuidedPublicationMigrationTest.Database db, GuidedPublicationRepository writer,
      PublicationContracts.Base base, String label, ObjectNode offered, B3aGenuine genuine, AtomicInteger reads,
      String original) {
    assertThat(offered.equals(genuine.snapshot().basis())).as("%s changes the offered basis", label).isFalse();
    PublicationContracts.Candidate candidate = genuine.candidate();
    String pure = null;
    try { candidate = new ObservedArtifactLowerer(C).lower(offered.deepCopy(), genuine.profile()); }
    catch (GuidedSessionException refused) { pure = refused.getMessage(); }
    var snapshot = b3aReseal(genuine.snapshot().identity(), offered, candidate, genuine.build());
    int before = reads.get();
    String outcome = b3aStaged(db, writer, base, label, snapshot, candidate, genuine.profile(), genuine.build());
    assertThat(outcome).as("%s is never adopted", label).isNotEqualTo("COMMITTED");
    if (pure != null) {
      assertThat(outcome).as("%s writer recomputation meets the same pure refusal", label).isEqualTo(pure);
      assertThat(reads.get()).isEqualTo(before);
    } else {
      assertThat(outcome).as("%s stored re-read refusal", label).isEqualTo("PUBLICATION_CONFLICT");
      assertThat(reads.get() - before).isEqualTo(1);
    }
    assertThat(privateAuthoritySnapshot(db)).as("%s preserves every row and trigger", label).isEqualTo(original);
    return pure == null ? "STORED" : "PURE:" + pure;
  }
```

### 2.2 Method B3A-1: `offeredBasisOriginalPointersRequireStoredPrivatePreimageAtCurrentCommit`

```java
  /** Exact original offered pointers that only the stored private preimage can refute (31/52/60; routes 1,3,6). */
  @Test
  void offeredBasisOriginalPointersRequireStoredPrivatePreimageAtCurrentCommit() throws Exception {
    try (var owner = new GuidedPublicationMigrationTest.Database();
        var db = new GuidedPublicationMigrationTest.Database(owner.jdbc, owner.tx, "b3a-offered", fixtures().path("basis").deepCopy())) {
      var base = db.capture(); db.finalizing();
      assertStoredPrivateProjection(db, base);
      String original = privateAuthoritySnapshot(db);
      var reads = new AtomicInteger();
      var writer = new GuidedPublicationRepository(db.jdbc, C, () -> { reads.incrementAndGet(); return db.evidence; });
      var genuine = b3aGenuine(db, base);
      assertThat(b3aStaged(db, writer, base, "positive-0", genuine.snapshot(), genuine.candidate(), genuine.profile(), genuine.build()))
          .as("the genuine stored basis is adoptable at this exact boundary").isEqualTo("COMMITTED");
      assertThat(reads).hasValue(1);
      assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);
      var attacks = new java.util.LinkedHashMap<String, java.util.function.Consumer<ObjectNode>>();
      attacks.put("wrong-private-input-hash", basis -> {
        ObjectNode entry = (ObjectNode) basis.path("materializationEvidence").path("entries").get(0);
        entry.put("inputHash", b3aDifferentHash(entry.path("inputHash").asText()));
      });
      attacks.put("immutable-source-manifest-hash-is-exact", basis ->
          basis.put("sourceManifestHash", b3aDifferentHash(basis.path("sourceManifestHash").asText())));
      attacks.put("immutable-original-source-cannot-be-replaced", basis -> {
        ObjectNode entry = (ObjectNode) basis.path("snapshotEvidence").path("current").path("authoring").path("steps").get(2)
            .path("context").path("entries").get(1);
        assertThat(entry.path("value").isTextual()).as("the exact original context-value pointer exists").isTrue();
        entry.put("value", "A different complete source");
      });
      int positives = 0;
      for (var attack : attacks.entrySet()) {
        ObjectNode offered = (ObjectNode) genuine.snapshot().basis().deepCopy();
        attack.getValue().accept(offered);
        String stage = b3aRefused(db, writer, base, attack.getKey(), offered, genuine, reads, original);
        assertThat(stage).as("%s: the public basis cannot recompute the private preimage", attack.getKey()).isEqualTo("STORED");
        var fresh = b3aGenuine(db, base);
        assertThat(b3aStaged(db, writer, base, "positive-" + (++positives), fresh.snapshot(), fresh.candidate(),
            fresh.profile(), fresh.build())).as("parity after %s", attack.getKey()).isEqualTo("COMMITTED");
        assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);
      }
    }
  }
```

**Why STORED is pinned (verified by reading):**
* `GuidedBasisValidator.validate` (15–57) checks entry ordinals, IDs, metadata-without-value and the header chain. It cannot recompute `inputHash`, because the value has been removed.
* `ObservedReferencePolicyDeriver` only *copies* `sourceManifestHash` into `publicationEvidenceHash`, so it is resealed consistently.
* `GuidedSnapshotDeriver.apply` (20–31) compares step id and text against `sourceSteps`, not context-entry values. The ordinary parent has `incrementalEvidence: null`, so no base snapshot comparison happens.

Only `GuidedPublicationEvidenceRepository.read` (actual private rows) together with `currentBasis.equals(basis)` (writer:238) can tell. If the run shows `PURE:*` for any of the three, that label is OPEN and must be reviewed. It does not fail open.

### 2.3 Method B3A-2: `offeredBasisFromAnotherStoredSessionCannotBorrowItsAuthority`

```java
  /** 31: foreign session/test/CSI basis and foreign admission IDs cannot borrow this session's stored authority. */
  @Test
  void offeredBasisFromAnotherStoredSessionCannotBorrowItsAuthority() throws Exception {
    ObjectNode foreignCanonical = (ObjectNode) fixtures().path("basis").deepCopy();
    foreignCanonical.put("csiId", "CSI-B3A-FOREIGN"); // test-owned before-image; the fixture freezes actual source/base
    try (var owner = new GuidedPublicationMigrationTest.Database();
        var foreign = new GuidedPublicationMigrationTest.Database(owner.jdbc, owner.tx, "b3a-foreign-a", foreignCanonical);
        var db = new GuidedPublicationMigrationTest.Database(owner.jdbc, owner.tx, "b3a-foreign-b", fixtures().path("basis").deepCopy())) {
      var foreignBase = foreign.capture(); foreign.finalizing();
      var base = db.capture(); db.finalizing();
      assertThat(foreignBase.document().path("csiId")).isNotEqualTo(base.document().path("csiId"));
      assertThat(foreignBase.document().path("testId")).isNotEqualTo(base.document().path("testId"));
      assertThat(foreignBase.document().path("sessionId")).isNotEqualTo(base.document().path("sessionId"));
      String original = privateAuthoritySnapshot(db);
      var reads = new AtomicInteger();
      var writer = new GuidedPublicationRepository(db.jdbc, C, () -> { reads.incrementAndGet(); return db.evidence; });
      var genuine = b3aGenuine(db, base);
      var foreignGenuine = b3aGenuine(foreign, foreignBase);
      assertThat(b3aStaged(db, writer, base, "positive-b", genuine.snapshot(), genuine.candidate(), genuine.profile(), genuine.build()))
          .isEqualTo("COMMITTED");
      assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);

      // (1) Another session's complete actual stored basis, offered under this session's stored claim.
      ObjectNode foreignBasis = (ObjectNode) foreignGenuine.snapshot().basis().deepCopy();
      var foreignCandidate = new ObservedArtifactLowerer(C).lower(foreignBasis.deepCopy(), genuine.profile());
      var borrowed = b3aReseal(genuine.snapshot().identity(), foreignBasis, foreignCandidate, genuine.build());
      int before = reads.get();
      assertThat(b3aStaged(db, writer, base, "foreign-session-basis", borrowed, foreignCandidate, genuine.profile(), genuine.build()))
          .as("foreign run authorization cannot join this stored base").isEqualTo("EVIDENCE_MISMATCH");
      assertThat(reads.get()).as("refused at the writer's candidate-to-stored-base join").isEqualTo(before);
      assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);

      // (2) The same foreign basis resealed with this session's run authorization.
      ObjectNode resealed = foreignBasis.deepCopy();
      resealed.set("runAuthorization", genuine.snapshot().basis().path("runAuthorization").deepCopy());
      b3aRefused(db, writer, base, "foreign-session-resealed-authorization", resealed, genuine, reads, original);

      // (3) This session's basis naming the other session's actual successful admission identity.
      String ownAdmission = genuine.snapshot().basis().path("actions").get(0).path("ledger").path("admission").path("admissionId").asText();
      assertThat(ownAdmission).startsWith("b3a-foreign-b-");
      String foreignAdmission = "b3a-foreign-a-" + ownAdmission.substring("b3a-foreign-b-".length());
      assertThat(owner.jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id='b3a-foreign-a'"
          + " AND admission_id=? AND document->>'state'='SUCCEEDED'", Integer.class, foreignAdmission)).isEqualTo(1);
      ObjectNode substituted = (ObjectNode) C.parse(genuine.snapshot().basis().toString()
          .replace("\"" + ownAdmission + "\"", "\"" + foreignAdmission + "\""));
      b3aRefused(db, writer, base, "foreign-admission-substitution", substituted, genuine, reads, original);

      var fresh = b3aGenuine(db, base);
      assertThat(b3aStaged(db, writer, base, "positive-b-after", fresh.snapshot(), fresh.candidate(), fresh.profile(), fresh.build()))
          .isEqualTo("COMMITTED");
      assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);
    }
  }
```

**Predicted pins.**
* (1) `EVIDENCE_MISMATCH` with zero reads: `verifyCandidate` (writer 458–462) compares the candidate's `runAuthorizationHash` with the stored base, and the fixture creates a random `authorizationId` per session (MigrationTest 263–269). Source, authoring and configuration hashes are equal because the canonical source text and step IDs are identical, so `runAuthorizationHash` is the first mismatch.
* (2) and (3) use the stage oracle. They can be pure or stored, but must never be adopted.

**Risk R-A2.** The shared constructor has never been given a different canonical `csiId`. Reading MigrationTest 203–257, `csi` is used consistently for `csi_systems`, `ui_tests`, scope and `replayRequirements`. If the constructor or `capture()` refuses anyway, keep the method and change only `foreignCanonical` back to the canonical CSI. The cross-CSI clause then stays **OPEN at the relational tier**, and cross-test borrowing is still proven. Do not edit the fixture.

---

## 3. B3b: three ReplayIT singletons (low lane)

### 3.1 B3B-1 `incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution`

Ledger: 43, 61, 60, 52, 31, 42 (HTTP part). Routes: 1, 2, 3, 6, 7. Parents: the `append-input` (generation 1) joined parent, then a second actual incremental session (generation 2) on the same test.

```java
  /** B3B-1 (43/61/60/52/31/42): stored base/source/history authority at actual joined parents. */
  @Test
  void incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution() throws Exception {
    b3IsolatedCsi();
    var parent = new java.util.concurrent.atomic.AtomicReference<B3Parent>();
    var merged = new java.util.concurrent.atomic.AtomicReference<JsonNode>();
    try {
      b3AliasDeclarationsRefuseAtActualStartWithoutWrites();                       // 42 HTTP leg
      b3Hooks = new B3Hooks() {
        @Override public void beforeFinalize(B3Parent p) throws Exception {
          parent.set(p);
          b3AssertPinnedBaseProofJoinsActualRows(p);                              // 61 positive joins
          var probe = new B3WriterProbe(p.id(), p.test());
          probe.positive("gen1-positive");
          JsonNode entries = probe.genuine.path("materializationEvidence").path("entries");
          int lastV2 = -1;
          for (int at = 0; at < entries.size(); at++) if (entries.get(at).path("introducedContextRevision").asInt() == 2) lastV2 = at;
          assertThat(lastV2).as("actual appended version-2 input").isNotNegative();
          final int v2 = lastV2;
          probe.requireStored("wrong-private-input-hash-v2", b -> {                // 52 / route 6, multi-version
            ObjectNode e = (ObjectNode) b.path("materializationEvidence").path("entries").get(v2);
            e.put("inputHash", GuidedContracts.hash(C.object().put("b3", e.path("inputHash").asText())));
          });
          int prep = b3IssuedAboveBirth(probe.genuine);                            // precondition, else OPEN
          probe.requireStored("preparation-substitutes-birth-for-actual", b -> {   // 52 / route 7
            ObjectNode fact = (ObjectNode) b.path("preparations").get(prep);
            int revision = b3PreparationContextRevision(b, fact);
            fact.put("materializationRevision", b.path("materializationEvidence").path("versions").get(revision - 1)
                .path("birthMaterializationRevision").asInt());
          });
          probe.requireBackendPure("historical-cutoff-moves-v2-input-into-v1", b ->  // 52 full-version cutoff
              ((ObjectNode) b.path("materializationEvidence").path("entries").get(v2)).put("introducedContextRevision", 1));
          probe.requireStored("immutable-source-manifest-hash-is-exact", b ->      // 60 / route 3
              b.put("sourceManifestHash", GuidedContracts.hash(C.object().put("b3", b.path("sourceManifestHash").asText()))));
          probe.refuse("immutable-original-source-cannot-be-replaced", b -> {      // 60 / route 1 (joined analogue)
            ObjectNode step = (ObjectNode) b.path("snapshotEvidence").path("current").path("authoring").path("steps").get(3);
            ObjectNode context = step.has("context") ? (ObjectNode) step.path("context") : step.putObject("context");
            context.putArray("entries").addObject().put("kind", "text").put("value", "A different complete source");
          });
          b3AssertMultiVersionReturnedHistoryRefuses(p);                          // 52 stored private history
          probe.positive("gen1-positive-after");
        }
        @Override public void afterFirstOrdinaryReplay(B3Parent p, JsonNode receipt, UUID execution) throws Exception {
          merged.set(receipt);
          b3AssertFinalizeIsIdempotentAndModelBrowserFree(p, receipt);            // 31 idempotent, model/browser free
        }
      };
      incrementalJoined("append-input");
      b3Hooks = null;
      assertThat(parent.get()).isNotNull(); assertThat(merged.get()).isNotNull();
      b3OlderEqualHashBaseAndChangedSourceCas(parent.get(), merged.get());        // 43/61/60 generation 2
    } finally {
      b3Hooks = null;
      incrementalTenScenario = false; incrementalDomVariant = null;
      Files.writeString(TEMP.resolve("obs015-native-mode.json"), "{}");
      b3RestoreCsi();
    }
  }
```

**`[AUTO-DECISION]` Route 1 pointer.** The joined `append-input` authoring has no `steps/2/context/entries/1` text node; its steps carry no authored context. The exact original pointer is therefore asserted **only** in B3A-1 (STORED pin), on the relational parent where the node exists (verified: source01 used it). Here the label adds a different text context entry to the edited step. That is the same subject: the immutable original source cannot be replaced at an actual joined parent. It uses the stage oracle (`refuse`), not a STORED pin, because I did not verify that `IncrementalAuthoringIdentity.snapshot` accepts a `text` context entry. The stage it reaches is recorded. Dex must not reshape the entry to make it reach a particular stage.

#### 3.1.1 Helpers for preparation issued above birth

```java
  private static int b3PreparationContextRevision(JsonNode basis, JsonNode preparation) {
    for (JsonNode action : basis.path("actions"))
      if (action.path("ledger").path("preparationId").equals(preparation.path("preparationId")))
        return action.path("ledger").path("contextRevision").asInt();
    throw new AssertionError("preparation without its actual successful action");
  }

  /** Index of an actual preparation issued strictly above its version birth; none means OPEN, not a fabricated row. */
  private static int b3IssuedAboveBirth(JsonNode basis) {
    JsonNode preparations = basis.path("preparations");
    int chosen = -1;
    for (int at = 0; at < preparations.size(); at++) {
      int revision = b3PreparationContextRevision(basis, preparations.get(at));
      int birth = basis.path("materializationEvidence").path("versions").get(revision - 1).path("birthMaterializationRevision").asInt();
      if (preparations.get(at).path("materializationRevision").asInt() > birth && (chosen < 0 || revision == 2)) chosen = at;
    }
    assertThat(chosen).as("an actual preparation issued above its version birth exists (else route 7 stays OPEN)").isNotNegative();
    return chosen;
  }
```

Why the birth substitution reaches STORED (verified): `GuidedBasisValidator.validateAction` (101) and `GuidedPlanBuilder` (267–270) both accept any revision `>= birth` and `<= current`. Only the stored `studio_guided_publication_preparations.materialization_revision` row (evidence reader 534–552) can refute "birth instead of actual".

#### 3.1.2 Pinned-base positive joins (61)

```java
  private void b3AssertPinnedBaseProofJoinsActualRows(B3Parent parent) {
    String baseId = parent.base().path("revisionId").asText();
    JsonNode raw = sessions.transaction(() -> ownedApplicationContext.getBean(GuidedPublicationEvidenceRepository.class)
        .read(parent.id()).document());
    JsonNode pin = raw.path("snapshotEvidence").path("pinnedBase"), proof = raw.path("snapshotEvidence").path("baseProof");
    var row = jdbc.queryForMap("SELECT revision_digest,artifact::text AS artifact,authoring::text AS authoring,"
        + "step_snapshot_hashes::text AS snapshots,step_reuse_provenance::text AS reuse FROM ui_test_revisions WHERE id=?::uuid", baseId);
    assertThat(jdbc.queryForObject("SELECT initial_step_index FROM studio_guided_relearn_plans WHERE session_id=?", Integer.class, parent.id()))
        .as("nonempty original prefix requires a full base proof").isPositive();
    assertThat(pin.path("revisionId").asText()).isEqualTo(baseId);
    assertThat(pin.path("revisionDigest").asText()).isEqualTo(row.get("revision_digest"));
    assertThat(jdbc.queryForObject("SELECT base_revision_id::text FROM studio_guided_relearn_plans WHERE session_id=?",
        String.class, parent.id())).isEqualTo(baseId);
    assertThat(C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_publication_bases WHERE session_id=?",
        String.class, parent.id())).path("confirmedRevisionId").asText()).isEqualTo(baseId);
    assertThat(proof.path("revision").path("id").asText()).isEqualTo(baseId);
    assertThat(GuidedContracts.hash(proof.path("revision").path("identity"))).isEqualTo(row.get("revision_digest"));
    assertThat(proof.path("artifact")).isEqualTo(C.parse((String) row.get("artifact")));
    assertThat(proof.path("revision").path("stepSnapshotHashes")).isEqualTo(C.parse((String) row.get("snapshots")));
    assertThat(proof.path("revision").path("reusedFrom")).isEqualTo(C.parse((String) row.get("reuse")));
    assertThat(proof.path("configuration")).isEqualTo(ownedApplicationContext.getBean(ObservedRevisionVerifier.class)
        .verify(UUID.fromString(baseId)).path("configuration"));
    JsonNode receipt = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_publications WHERE revision_id=?::uuid",
        String.class, baseId));
    assertThat(receipt.path("revisionDigest").asText()).as("stored publication identity agrees").isEqualTo(row.get("revision_digest"));
    assertThat(receipt.path("artifactHash").asText()).isEqualTo(GuidedContracts.hash(proof.path("artifact")));
    JsonNode live = C.parse(jdbc.queryForObject("SELECT authoring::text FROM ui_tests WHERE id=?", String.class, parent.test()));
    assertThat(proof.path("authoringIdentity").path("authoring")).as("base proof uses the base's own row")
        .isEqualTo(C.parse((String) row.get("authoring"))).isNotEqualTo(live);
  }
```

#### 3.1.3 Finalize idempotency (31)

```java
  private void b3AssertFinalizeIsIdempotentAndModelBrowserFree(B3Parent parent, JsonNode merged) throws Exception {
    ObjectNode body = C.object().put("schemaVersion", 3)
        .put("expectedSourceRevision", parent.edited().path("sourceRevision").asText())
        .put("expectedConfigurationRevision", parent.edited().path("configurationRevision").asText());
    String writes = b3PublicationWrites(parent.test(), parent.id());
    int model = MODEL_WIRE.size(), legacy = LEGACY_MODEL_CALLS.get(), effects = RECEIPTS.size(), navigation = NAVIGATIONS.get();
    // GuidedPlanPublisher.finalizeForUser 83-90: an existing receipt is returned for the same body digest.
    assertThat(publicCall("/api/v1/studio/guided-sessions/" + parent.id() + "/finalize", body, 200, UUID.randomUUID().toString()))
        .isEqualTo(merged);
    JsonNode conflict = publicCall("/api/v1/studio/guided-sessions/" + parent.id() + "/finalize",
        body.deepCopy().put("expectedSourceRevision", "999"), 409, UUID.randomUUID().toString());
    assertThat(conflict.path("code").asText()).isEqualTo("IDEMPOTENCY_CONFLICT");
    assertThat(b3PublicationWrites(parent.test(), parent.id())).isEqualTo(writes);
    assertThat(MODEL_WIRE).hasSize(model); assertThat(LEGACY_MODEL_CALLS.get()).isEqualTo(legacy);
    assertThat(RECEIPTS).hasSize(effects); assertThat(NAVIGATIONS.get()).isEqualTo(navigation);
  }
```

#### 3.1.4 Stored multi-version private history (52; returned-read, disclosed)

```java
  /** Production SQL strings are copied verbatim from GuidedMaterializationEvidence 27-28 and 47. */
  private static final class B3PrivateReadBoundary extends JdbcTemplate {
    static final String INPUTS = "SELECT input_ordinal,input_id,introduced_revision,document::text FROM"
        + " studio_guided_materialization_inputs WHERE session_id=? ORDER BY input_ordinal";
    static final String VERSIONS = "SELECT * FROM studio_guided_materialization_versions WHERE session_id=? ORDER BY context_revision";
    final String sessionId;
    volatile String mutation;
    final AtomicInteger substitutions = new AtomicInteger();

    B3PrivateReadBoundary(JdbcTemplate actual, String sessionId) {
      super(java.util.Objects.requireNonNull(actual.getDataSource()));
      this.sessionId = sessionId;
    }

    @Override
    public List<Map<String, Object>> queryForList(String sql, Object... args) {
      List<Map<String, Object>> actual = super.queryForList(sql, args);
      String selected = mutation;
      if (selected == null || (!sql.equals(INPUTS) && !sql.equals(VERSIONS)) || args.length != 1 || !sessionId.equals(args[0]))
        return actual;
      var offered = new ArrayList<Map<String, Object>>();
      actual.forEach(row -> offered.add(new java.util.HashMap<>(row)));
      boolean changed = false;
      if (sql.equals(INPUTS) && (selected.equals("v1-private-value") || selected.equals("v2-private-value"))) {
        int introduced = selected.startsWith("v1") ? 1 : 2;
        for (var row : offered) {
          ObjectNode input = PublicationContracts.copy(C.parse((String) row.get("document")));
          if (((Number) row.get("introduced_revision")).intValue() == introduced && input.path("value").isTextual()) {
            input.put("value", "B3-DIFFERENT-PRIVATE-VALUE");
            row.put("document", input.toString());
            changed = true;
            break;
          }
        }
      } else if (sql.equals(VERSIONS) && selected.equals("v1-cutoff-includes-v2-input")) {
        offered.getFirst().put("input_count", ((Number) offered.getFirst().get("input_count")).intValue() + 1);
        changed = true;
      }
      if (!changed) return actual;
      assertThat(offered.equals(actual)).isFalse();
      substitutions.incrementAndGet();
      return offered;
    }
  }

  private void b3AssertMultiVersionReturnedHistoryRefuses(B3Parent parent) {
    var boundary = new B3PrivateReadBoundary(jdbc, parent.id());
    var reader = new GuidedPublicationEvidenceRepository(boundary, C);
    var verifier = ownedApplicationContext.getBean(ObservedRevisionVerifier.class);
    reader.installRevisionVerifier(verifier::verify); // same composition as GuidedPublicationConfiguration 38
    var probe = new B3WriterProbe(parent.id(), parent.test(), reader);
    probe.positive("multi-version-unarmed");
    for (String label : List.of("v1-private-value", "v2-private-value", "v1-cutoff-includes-v2-input")) {
      boundary.mutation = label;
      int before = boundary.substitutions.get();
      var outcome = probe.genuineAgainstReader(label);
      boundary.mutation = null;
      assertThat(boundary.substitutions.get() - before).as("%s substituted an actual returned private row", label).isPositive();
      assertThat(outcome.stage()).isEqualTo("WRITER_REFUSED");
      assertThat(outcome.code()).as("%s full-version reconstruction refusal", label).isEqualTo("EVIDENCE_MISMATCH");
      assertThat(outcome.readsDelta()).isEqualTo(1);
    }
    probe.positive("multi-version-restored");
  }
```

Pins verified by reading `GuidedMaterializationEvidence.read`:
* `v1-private-value`: the version-1 `hash(full)` no longer matches (lines 66–68).
* `v2-private-value`: the version-2 hash no longer matches, and neither does the current hash (66–68, 89–92).
* `v1-cutoff-includes-v2-input`: an entry with `introducedContextRevision` 2 is placed inside revision 1 (line 62), or the count stops being monotonic (54).

All three throw `EVIDENCE_MISMATCH` inside the stored reader. This is a **returned-read substitution with the stored rows untouched**, the same disclosure source01 used, now on an actual two-version history.

#### 3.1.5 Generation 2: older same-test equal-hash base and the actual source/config CAS (43, 61, 60)

```java
  private ObjectNode b3ActualBaseProof(String revisionId) {
    // Same construction as GuidedPublicationEvidenceRepository.snapshotEvidence 783-796, from actual immutable rows.
    var row = jdbc.queryForMap("SELECT revision_digest,authoring::text AS authoring,\"references\"::text AS refs,"
        + "step_snapshot_hashes::text AS snapshots,step_reuse_provenance::text AS reuse FROM ui_test_revisions WHERE id=?::uuid", revisionId);
    ObjectNode verified = ownedApplicationContext.getBean(ObservedRevisionVerifier.class).verify(UUID.fromString(revisionId));
    ObjectNode proof = C.object();
    ObjectNode identity = proof.putObject("authoringIdentity").put("authoringIdentityVersion", 1);
    identity.set("authoring", C.parse((String) row.get("authoring")));
    identity.set("authoredDeclarations", C.parse((String) row.get("refs")).path("authoredDeclarations"));
    proof.set("configuration", verified.path("configuration"));
    proof.set("artifact", verified.path("artifact"));
    ObjectNode revision = proof.putObject("revision").put("schemaVersion", 3).put("id", revisionId)
        .put("revisionDigest", (String) row.get("revision_digest"));
    revision.set("identity", verified.path("identity"));
    revision.set("stepSnapshotHashes", C.parse((String) row.get("snapshots")));
    revision.set("reusedFrom", C.parse((String) row.get("reuse")));
    return proof;
  }

  private void b3OlderEqualHashBaseAndChangedSourceCas(B3Parent gen1, JsonNode merged) throws Exception {
    UUID test = gen1.test();
    String r1 = gen1.base().path("revisionId").asText(), r2 = merged.path("revisionId").asText();
    String r1Digest = jdbc.queryForObject("SELECT revision_digest FROM ui_test_revisions WHERE id=?::uuid", String.class, r1);
    JsonNode a1 = C.parse(jdbc.queryForObject("SELECT artifact::text FROM ui_test_revisions WHERE id=?::uuid", String.class, r1));
    JsonNode a2 = C.parse(jdbc.queryForObject("SELECT artifact::text FROM ui_test_revisions WHERE id=?::uuid", String.class, r2));
    for (int index = 0; index < 3; index++) {                       // precondition: same test, equal claimed hashes
      String step = INCREMENTAL_STEPS.get(index);
      assertThat(a2.path("learnedPlan").path("stepSnapshotHashes").path(step))
          .isEqualTo(a1.path("learnedPlan").path("stepSnapshotHashes").path(step));
    }
    assertThat(jdbc.queryForObject("SELECT confirmed_revision_id::text FROM ui_tests WHERE id=?", String.class, test)).isEqualTo(r2);
    startWorkers(); seedGovernedPolicies(primaryCsi); incrementalTenScenario = true;
    JsonNode edited = prefixSyncEdit(test, "Check Destination is visible for the second generation.");
    assertThat(edited.path("firstChangedStepId").asText()).isEqualTo(INCREMENTAL_STEPS.get(3));
    ObjectNode start = C.object().put("schemaVersion", 3).put("testId", test.toString())
        .put("sourceRevision", edited.path("sourceRevision").asText())
        .put("configurationRevision", edited.path("configurationRevision").asText())
        .put("environmentId", "fixture").put("applicationId", "orders");
    start.set("versions", versions());
    // 43/61 HTTP: an actual older revision of the same test, with equal prefix hashes, cannot be named.
    String before = incrementalAuthoritySnapshot(test);
    int model = MODEL_WIRE.size(), legacy = LEGACY_MODEL_CALLS.get(), effects = RECEIPTS.size(), navigation = NAVIGATIONS.get();
    JsonNode older = publicCall("/api/v1/studio/guided-sessions", start.deepCopy().put("baseRevisionId", r1), 409, UUID.randomUUID().toString());
    assertThat(older.path("code").asText()).isEqualTo("REVISION_CONFLICT");
    assertThat(older.path("messageCode").asText()).isEqualTo("BASE_REVISION_MISMATCH");
    assertThat(incrementalAuthoritySnapshot(test)).isEqualTo(before);
    assertThat(MODEL_WIRE).hasSize(model); assertThat(LEGACY_MODEL_CALLS.get()).isEqualTo(legacy);
    assertThat(RECEIPTS).hasSize(effects); assertThat(NAVIGATIONS.get()).isEqualTo(navigation);
    incrementalDomVariant = "edit4";
    Files.writeString(TEMP.resolve("obs015-native-mode.json"), "{}");
    Files.writeString(TEMP.resolve("obs015-native-events.jsonl"), "");
    String id = publicCall("/api/v1/studio/guided-sessions", start.deepCopy().put("baseRevisionId", r2), 202,
        UUID.randomUUID().toString()).path("session").path("sessionId").asText();
    awaitFinalizing(id);
    var probe = new B3WriterProbe(id, test);
    probe.positive("gen2-positive");
    ObjectNode olderProof = b3ActualBaseProof(r1);
    var outcome = probe.refuse("older-same-test-equal-hash-base", b -> {
      ObjectNode evidence = (ObjectNode) b.path("snapshotEvidence");
      evidence.putObject("pinnedBase").put("revisionId", r1).put("revisionDigest", r1Digest);
      evidence.set("baseProof", olderProof.deepCopy());
      ObjectNode incremental = (ObjectNode) b.path("incrementalEvidence");
      ObjectNode program = (ObjectNode) incremental.path("program");
      program.put("baseRevisionId", r1).put("baseRevisionDigest", r1Digest);
      String programHash = GuidedContracts.hash(program);
      ((ObjectNode) incremental.path("plan")).put("baseRevisionId", r1).put("prefixProgramHash", programHash);
      ((ObjectNode) incremental.path("switch")).put("baseRevisionId", r1);
      for (JsonNode request : incremental.path("prefixRequests")) ((ObjectNode) request).put("prefixProgramHash", programHash);
    });
    assertThat(outcome.stage()).as("an older equal-hash same-test base is never adopted").isNotEqualTo("COMMITTED_ROLLED_BACK");
    probe.positive("gen2-positive-after");
    // 60 non-destructive CAS: the original expected revisions are exact.
    for (String field : List.of("expectedSourceRevision", "expectedConfigurationRevision")) {
      ObjectNode stale = C.object().put("schemaVersion", 3).put("expectedSourceRevision", edited.path("sourceRevision").asText())
          .put("expectedConfigurationRevision", edited.path("configurationRevision").asText()).put(field, "999");
      assertThat(publicCall("/api/v1/studio/guided-sessions/" + id + "/finalize", stale, 409, UUID.randomUUID().toString())
          .path("code").asText()).isEqualTo("REVISION_CONFLICT");
      assertThat(sessions.transaction(() -> sessions.lock(id).document().path("state").asText())).isEqualTo("FINALIZING");
    }
    // 60 destructive CAS: an actual source change after the original freeze fails publication.
    prefixSyncEdit(test, "Check Destination is visible after a post-learning source change.");
    int modelAt = MODEL_WIRE.size(), effectsAt = RECEIPTS.size(), navigationAt = NAVIGATIONS.get();
    JsonNode conflict = publicCall("/api/v1/studio/guided-sessions/" + id + "/finalize", C.object().put("schemaVersion", 3)
        .put("expectedSourceRevision", edited.path("sourceRevision").asText())
        .put("expectedConfigurationRevision", edited.path("configurationRevision").asText()), 409, UUID.randomUUID().toString());
    assertThat(conflict.path("code").asText()).isEqualTo("PUBLICATION_CONFLICT");
    assertThat(sessions.transaction(() -> sessions.lock(id).document().path("state").asText())).isEqualTo("PUBLICATION_CONFLICT");
    assertThat(jdbc.queryForObject("SELECT confirmed_revision_id::text FROM ui_tests WHERE id=?", String.class, test)).isEqualTo(r2);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, test)).isEqualTo(2);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_publications WHERE session_id=?", Integer.class, id)).isZero();
    assertThat(MODEL_WIRE).hasSize(modelAt); assertThat(RECEIPTS).hasSize(effectsAt); assertThat(NAVIGATIONS.get()).isEqualTo(navigationAt);
    p3AwaitTeardown(id);
  }
```

**Expected for `older-same-test-equal-hash-base` (predicted):** R1 and R2 share step IDs, text, guards and snapshot hashes for prefix steps 0–2 (generation 1 reused them). So `GuidedSnapshotDeriver.verifyBase(R1 proof)` and `expectedProgram(R1, …)` should both pass on a coherent rebase. If the backend lowerer accepts and the runner validator returns `ok`, the only refusal left is the writer's stored re-read: `PUBLICATION_CONFLICT`, reads 1. That is ledger 43/61's exact claim ("even equal claimed hashes"). If the prefix-request chain (`validatePrefix`) refutes it purely first, the label is still refused and is recorded as `PURE`. I do not pin the stage here, because the prefix-request linkage was not fully read.

**`[AUTO-DECISION]`** A destructive *configuration* change is not executed separately. Only one destructive CAS fits per session, and the config comparison is the same `requireCurrent` loop (`GuidedPublicationBaseRepository` 182–191). This is disclosed as narrower: the config part of "changed source/config" is proven only by the non-destructive `expectedConfigurationRevision` CAS.

#### 3.1.6 42 HTTP leg: alias and declaration refusals at the actual start route

```java
  /** 42: exact declared alias resolves; suffix-only/duplicate/collision/missing/null refuse at actual start with zero writes. */
  private void b3AliasDeclarationsRefuseAtActualStartWithoutWrites() throws Exception {
    startWorkers(); seedGovernedPolicies(primaryCsi);
    String secretStep = UUID.nameUUIDFromBytes("obs015-b3-alias-secret".getBytes(StandardCharsets.UTF_8)).toString();
    String plainStep = UUID.nameUUIDFromBytes("obs015-b3-alias-plain".getBytes(StandardCharsets.UTF_8)).toString();
    ObjectNode authoring = C.object().put("authoringSchemaVersion", 2);
    var steps = authoring.putArray("steps");
    ((ObjectNode) steps.addObject().put("id", secretStep).put("text", "Open " + URL + " and fill the password.")
        .putObject("context")).putArray("entries").addObject().put("kind", "secretRef").put("referenceId", "vault://studio/password");
    steps.addObject().put("id", plainStep).put("text", "Type <var ACCOUNT> in Destination.");
    steps.forEach(step -> AUDIT_CANARIES.add(step.path("text").asText()));
    var cases = new java.util.LinkedHashMap<String, String>();
    cases.put("suffix-only", "[{\"name\":\"password\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"},{\"name\":\"ACCOUNT\",\"kind\":\"plain\",\"value\":\"acct\"}]");
    cases.put("duplicate-conflict", "[{\"name\":\"vault://studio/password\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"},"
        + "{\"name\":\"vault://studio/password\",\"kind\":\"secretRef\",\"secretId\":\"OTHER\"},{\"name\":\"ACCOUNT\",\"kind\":\"plain\",\"value\":\"acct\"}]");
    cases.put("plain-secret-collision", "[{\"name\":\"PASS\",\"kind\":\"plain\",\"value\":\"x\"},"
        + "{\"name\":\"vault://studio/password\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"},{\"name\":\"ACCOUNT\",\"kind\":\"plain\",\"value\":\"acct\"}]");
    cases.put("plain-missing-value", "[{\"name\":\"vault://studio/password\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"},{\"name\":\"ACCOUNT\",\"kind\":\"plain\"}]");
    cases.put("plain-null-value", "[{\"name\":\"vault://studio/password\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"},{\"name\":\"ACCOUNT\",\"kind\":\"plain\",\"value\":null}]");
    cases.put("exact-alias", "[{\"name\":\"vault://studio/password\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"},{\"name\":\"ACCOUNT\",\"kind\":\"plain\",\"value\":\"acct\"}]");
    var expected = Map.of("suffix-only", "MISSING_SOURCE/AUTHORING_REFERENCE_MISSING/409",
        "duplicate-conflict", "INVALID_CONTRACT/AUTHORING_REFERENCE_AMBIGUOUS/422",
        "plain-secret-collision", "INVALID_CONTRACT/AUTHORING_REFERENCE_AMBIGUOUS/422",
        "plain-missing-value", "MISSING_SOURCE/AUTHORING_REFERENCE_MISSING/409",
        "plain-null-value", "MISSING_SOURCE/AUTHORING_REFERENCE_MISSING/409");
    var mapper = new ObjectMapper().findAndRegisterModules();
    var dto = mapper.treeToValue(authoring, AuthoringV2Request.class);
    for (var entry : cases.entrySet()) {
      UUID test = UUID.randomUUID();
      jdbc.update("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,authoring,authoring_revision_inputs,created_by,created_at,updated_at)"
          + " VALUES (?,'Alias declarations',?,'fixture','chromium',?::jsonb,?::jsonb,?::jsonb,?::jsonb,'fixture@example.invalid',now(),now())",
          test, primaryCsi, JSON.writeValueAsString(List.of("Open " + URL + " and fill the password.", "Type <var ACCOUNT> in Destination.")),
          entry.getValue(), authoring.toString(),
          JSON.writeValueAsString(AuthoringRevisionIdentity.create(dto, Map.of("ACCOUNT", "acct"))));
      ObjectNode start = C.object().put("schemaVersion", 3).put("testId", test.toString()).put("sourceRevision", "1")
          .put("configurationRevision", "1").put("environmentId", "fixture").put("applicationId", "orders");
      start.set("versions", versions());
      String before = incrementalAuthoritySnapshot(test);
      int model = MODEL_WIRE.size(), effects = RECEIPTS.size(), navigation = NAVIGATIONS.get();
      if (entry.getKey().equals("exact-alias")) {
        String id = publicCall("/api/v1/studio/guided-sessions", start, 202, UUID.randomUUID().toString()).path("session").path("sessionId").asText();
        publicCall("/api/v1/studio/guided-sessions/" + id + "/cancel", C.object().put("schemaVersion", 3).put("reason", "userRequested"),
            202, UUID.randomUUID().toString());
        JsonNode manifest = C.parse(jdbc.queryForObject("SELECT manifest::text FROM studio_guided_source_manifests WHERE session_id=?", String.class, id));
        JsonNode declared = null;
        for (JsonNode declaration : manifest.path("authoredDeclarations"))
          if (declaration.path("kind").asText().equals("secretRef")) declared = declaration;
        assertThat(declared).isNotNull();
        assertThat(declared.path("referenceId").asText()).isEqualTo("vault://studio/password");
        assertThat(declared.path("secretId").asText()).isEqualTo("PASS");
        p3AwaitTeardown(id);
        continue;
      }
      String[] want = expected.get(entry.getKey()).split("/");
      JsonNode refused = publicCall("/api/v1/studio/guided-sessions", start, Integer.parseInt(want[2]), UUID.randomUUID().toString());
      assertThat(refused.path("code").asText()).as(entry.getKey()).isEqualTo(want[0]);
      assertThat(refused.path("messageCode").asText()).as(entry.getKey()).isEqualTo(want[1]);
      assertThat(incrementalAuthoritySnapshot(test)).as("%s writes nothing, so no null value is ever hashed or frozen", entry.getKey()).isEqualTo(before);
      assertThat(MODEL_WIRE).hasSize(model); assertThat(RECEIPTS).hasSize(effects); assertThat(NAVIGATIONS.get()).isEqualTo(navigation);
    }
  }
```

**Risk R-42.** The codes are read from `IncrementalAuthoringIdentity` (196–197, 309–315) and its unit test, and start reaches `resolve` via `IncrementalChangeService.inspect` (line 59) or `GuidedSourceClassifier` (line 70). If `CanonicalStudioCodec.parseVariables` refuses `duplicate-conflict` or `plain-null-value` earlier with a different code, record that earlier guard and keep that one label OPEN. Do not re-point it. Dex should first confirm in the source window that this stored `variables` array shape matches `CanonicalStudioCodec`.

### 3.2 B3B-2 `incrementalNonemptyOriginalPrefixRetainsBaseProofAfterDriftAtOne`

Ledger: 63, 61 (recomputed), 72. IPC: N01 (partly). Parent: `drift-first`. That parent has `initial_step_index` 3 and a DRIFT switch at effective index 0, `next_ordinal` 1. Only the navigation at step 0, ordinal 0 is retained. `reusedFrom` is empty. `baseProof` is an object, which the existing `incrementalJoined` code already asserts at 4193–4200. There is also one raw, unperformed imported read allocation (`allocations == 2`).

```java
  /** B3B-2 (63/61/72): drift at j1 keeps the full immutable base proof; null/changed program/pin and orphans refuse. */
  @Test
  void incrementalNonemptyOriginalPrefixRetainsBaseProofAfterDriftAtOne() throws Exception {
    b3IsolatedCsi();
    var seen = new java.util.concurrent.atomic.AtomicReference<B3Parent>();
    var raw = new java.util.concurrent.atomic.AtomicReference<String>();
    try {
      b3Hooks = new B3Hooks() {
        @Override public void beforeFinalize(B3Parent p) throws Exception {
          seen.set(p);
          String nav = b3DriftAtOneFacts(p, raw);
          var probe = new B3WriterProbe(p.id(), p.test());
          probe.positive("drift-one-positive");
          probe.requireBackendPure("base-proof-null", b -> ((ObjectNode) b.path("snapshotEvidence")).putNull("baseProof"));
          probe.requireBackendPure("changed-program", b -> {
            ObjectNode incremental = (ObjectNode) b.path("incrementalEvidence"), program = (ObjectNode) incremental.path("program");
            ((ObjectNode) program.path("actions").get(0)).put("operationHash", "0".repeat(64));
            ((ObjectNode) incremental.path("plan")).put("prefixProgramHash", GuidedContracts.hash(program));
          });
          probe.requireBackendPure("changed-pin", b -> {
            String forged = GuidedContracts.hash(C.object().put("b3-forged-pin", p.base().path("revisionId").asText()));
            ((ObjectNode) b.path("snapshotEvidence").path("pinnedBase")).put("revisionDigest", forged);
            ObjectNode incremental = (ObjectNode) b.path("incrementalEvidence"), program = (ObjectNode) incremental.path("program");
            program.put("baseRevisionDigest", forged);
            ((ObjectNode) incremental.path("plan")).put("prefixProgramHash", GuidedContracts.hash(program));
          });
          probe.refuse("base-proof-recomputed-source", b -> b3RecomputedBaseSource(b));          // 61 "after recomputation"
          probe.refuse("base-proof-recomputed-reuse-map", b -> {                                    // 61 map
            ObjectNode proof = (ObjectNode) b.path("snapshotEvidence").path("baseProof");
            ((ObjectNode) proof.path("revision").path("reusedFrom")).putObject(INCREMENTAL_STEPS.get(0))
                .put("revisionId", p.base().path("revisionId").asText()).put("stepId", INCREMENTAL_STEPS.get(0));
          });
          String bound = probe.genuine.path("producers").get(0).path("bindingId").asText();
          probe.refuse("hidden-successful-read", b -> {                                             // 72
            ObjectNode hidden = ((ObjectNode) b.path("producers").get(0)).deepCopy();
            hidden.put("bindingId", raw.get()).put("producerAdmissionId", nav);
            ((ArrayNode) b.path("producers")).add(hidden);
          });
          probe.refuse("model-only-orphan", b -> {                                                  // 72 / N01
            ObjectNode need = ((ObjectNode) b.path("translationPlan").path("needs").get(0)).deepCopy();
            need.put("needId", "b3-orphan").put("bindingId", "b3-orphan-binding").putArray("consumers");
            ((ArrayNode) b.path("translationPlan").path("needs")).add(need);
            ObjectNode allocation = ((ObjectNode) b.path("allocations").get(0)).deepCopy();
            allocation.put("bindingId", "b3-orphan-binding").put("needId", "b3-orphan").putArray("consumers");
            ((ArrayNode) b.path("allocations")).add(allocation);
          });
          probe.refuseOffered("raw-id-recycle", (ObjectNode) C.parse(b3Replace(probe.genuine, bound, raw.get())));  // 72
          probe.positive("drift-one-positive-after");
        }
        @Override public void afterFirstOrdinaryReplay(B3Parent p, JsonNode merged, UUID execution) throws Exception {
          JsonNode artifact = C.parse(jdbc.queryForObject("SELECT artifact::text FROM ui_test_revisions WHERE id=?::uuid",
              String.class, merged.path("revisionId").asText()));
          assertThat(artifact.path("learnedPlan").path("reusedFrom")).as("drift at j1 reuses zero steps").isEmpty();
          assertThat(artifact.toString()).as("raw unperformed import never becomes an executable binding").doesNotContain(raw.get());
          assertThat(artifact.path("learnedPlan").path("bindings")).hasSize(1);
        }
      };
      incrementalJoined("drift-first");
      assertThat(seen.get()).isNotNull();
    } finally { b3Hooks = null; b3RestoreCsi(); }
  }

  /** 63/72 positive facts; returns the retained navigation admission. */
  private String b3DriftAtOneFacts(B3Parent p, java.util.concurrent.atomic.AtomicReference<String> raw) {
    String id = p.id();
    assertThat(jdbc.queryForObject("SELECT initial_step_index FROM studio_guided_relearn_plans WHERE session_id=?", Integer.class, id)).isEqualTo(3);
    var sw = jdbc.queryForMap("SELECT reason,effective_step_index,next_ordinal,completed_admissions::text AS done"
        + " FROM studio_guided_relearn_switches WHERE session_id=?", id);
    assertThat(sw.get("reason")).isEqualTo("DRIFT");
    assertThat(((Number) sw.get("effective_step_index")).intValue()).isZero();
    assertThat(((Number) sw.get("next_ordinal")).intValue()).isEqualTo(1);
    String nav = jdbc.queryForObject("SELECT admission_id FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0"
        + " AND attempt_ordinal=0 AND document->>'state'='SUCCEEDED' AND (document->>'dispatchCount')::int=1", String.class,
        id, INCREMENTAL_STEPS.get(0));
    assertThat(C.parse((String) sw.get("done"))).isEqualTo(C.object().arrayNode().add(nav));
    // No repeat of a possibly native effect: one navigation row, one relearned read row, no spent attempt.
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0",
        Integer.class, id, INCREMENTAL_STEPS.get(0))).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=1",
        Integer.class, id, INCREMENTAL_STEPS.get(0))).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=? AND admission_id IS NOT NULL",
        Integer.class, id)).isZero();
    var allocations = jdbc.queryForList("SELECT binding_id FROM studio_guided_allocations WHERE session_id=? ORDER BY binding_id", String.class, id);
    var producers = jdbc.queryForList("SELECT binding_id FROM studio_guided_producers WHERE session_id=?", String.class, id);
    assertThat(allocations).hasSize(2); assertThat(producers).hasSize(1);
    String unperformed = allocations.stream().filter(binding -> !producers.contains(binding)).findFirst().orElseThrow();
    assertThat(unperformed).as("quota/raw ID is never recycled").isNotEqualTo(producers.getFirst());
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_consumer_edges WHERE session_id=? AND binding_id=?",
        Integer.class, id, unperformed)).isZero();
    raw.set(unperformed);
    return nav;
  }

  private void b3RecomputedBaseSource(ObjectNode basis) {
    ObjectNode proof = (ObjectNode) basis.path("snapshotEvidence").path("baseProof");
    ObjectNode step = (ObjectNode) proof.path("authoringIdentity").path("authoring").path("steps").get(1);
    step.put("text", step.path("text").asText() + " (substituted base source)");
    ArrayNode lines = C.object().putArray("items"), ordered = C.object().putArray("items");
    for (JsonNode source : proof.path("authoringIdentity").path("authoring").path("steps")) {
      lines.add(source.path("text").asText());
      ordered.addObject().put("stepId", source.path("id").asText()).put("ordinal", ordered.size() - 1).put("source", source.path("text").asText());
    }
    ObjectNode identity = (ObjectNode) proof.path("revision").path("identity");
    identity.put("sourceHash", GuidedContracts.hash(lines)).put("authoringHash", GuidedContracts.hash(ordered));
    String digest = GuidedContracts.hash(identity);
    ((ObjectNode) proof.path("revision")).put("revisionDigest", digest);
    ((ObjectNode) basis.path("snapshotEvidence").path("pinnedBase")).put("revisionDigest", digest);
    ObjectNode incremental = (ObjectNode) basis.path("incrementalEvidence"), program = (ObjectNode) incremental.path("program");
    program.put("baseRevisionDigest", digest);
    ((ObjectNode) incremental.path("plan")).put("prefixProgramHash", GuidedContracts.hash(program));
  }
```

Pins verified by reading `GuidedSnapshotDeriver`:
* `base-proof-null`: originalIndex > 0 requires `baseProof.isObject()` (81–82).
* `changed-program`: `expectedProgram(...) .equals(program)` (95–96).
* `changed-pin`: `hash(identity)==pin.revisionDigest` (148).

All three happen inside the writer's own `verifyCandidate` recomputation (writer 430–434), so reads are 0. The recomputed 61 labels use `refuse` (stage recorded); for example `artifact.sourceHash != identity.sourceHash` at 159–161. The 72 labels also use `refuse`. The most likely guard for each is the pure `allocations.size()==needs==producers` check (`GuidedPlanBuilder` 835–839), but I did not pin it.

### 3.3 B3B-3 `incrementalFirstSuffixAcceptanceIsOnceAndLaterPairsCannotDisappear`

Ledger: 73, 75, 72 (edge side). Parent: `admitted-drift2`, which has an actual excluded native0 attempt, a native1 replacement, consumer edges and a first suffix after DRIFT.

#### 3.3.1 Provider hold and contenders (real in-flight first suffix)

```java
  private static final class B3FirstSuffixHold {
    final java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(1);
    final java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
    final java.util.concurrent.atomic.AtomicBoolean armed = new java.util.concurrent.atomic.AtomicBoolean(true);
    volatile String sessionId; volatile boolean releasedInTime;

    /** Called on the in-JVM provider thread for the actual first SOURCE_PLAN with a learning window. */
    void hold(String session) {
      if (!armed.compareAndSet(true, false)) return;
      sessionId = session;
      entered.countDown();
      try { releasedInTime = release.await(10, java.util.concurrent.TimeUnit.SECONDS); }
      catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
    }
  }

  private ObjectNode b3ContendFirstSuffix(B3FirstSuffixHold hold) throws Exception {
    ObjectNode out = C.object();
    try {
      assertThat(hold.entered.await(120, java.util.concurrent.TimeUnit.SECONDS)).as("actual first-suffix model call reached").isTrue();
      String id = hold.sessionId;
      JsonNode session = sessions.transaction(() -> sessions.lock(id).document().deepCopy());
      long fence = session.path("owner").path("fence").asLong();
      long revision = sessions.transaction(() -> plans.state(id).path("planRevision").asLong());
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_suffix_acceptances WHERE session_id=?", Integer.class, id)).isZero();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND status IN ('RESERVED','CALLING')",
          Integer.class, id)).as("exactly the real coordinator's first-suffix attempt is in flight").isEqualTo(1);
      int attempts = jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=?", Integer.class, id);
      int wire = MODEL_WIRE.size();
      ObjectNode command = C.object().put("schemaVersion", 3).put("sessionId", id)
          .put("expectedSourceRevision", session.path("scope").path("sourceRevision").asText())
          .put("expectedConfigurationRevision", session.path("scope").path("configurationRevision").asText())
          .put("expectedPlanRevision", revision);
      var gate = new java.util.concurrent.CountDownLatch(1);
      try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
        var futures = new ArrayList<java.util.concurrent.Future<HttpResponse<String>>>();
        for (int contender = 0; contender < 2; contender++) futures.add(pool.submit(() -> {
          gate.await();
          var request = HttpRequest.newBuilder(URI.create("https://localhost:" + port + "/internal/v2/studio/guided-sessions/" + id
                  + "/dependency-admissions")).timeout(Duration.ofSeconds(8))
              .header("Authorization", "Bearer " + token("backend-controller", "controller-1", "studio-guided-controller"))
              .header("X-Owner-Fence", Long.toString(fence)).header("Idempotency-Key", UUID.randomUUID().toString())
              .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(command.toString())).build();
          return HttpClient.newBuilder().sslContext(TLS).build().send(request, HttpResponse.BodyHandlers.ofString());
        }));
        gate.countDown();
        var codes = out.putArray("contenders");
        for (var future : futures) {
          var response = future.get(9, java.util.concurrent.TimeUnit.SECONDS);
          codes.addObject().put("status", response.statusCode()).put("code", C.parse(response.body()).path("code").asText());
        }
      }
      out.put("acceptancesDuringHold", jdbc.queryForObject("SELECT count(*) FROM studio_guided_suffix_acceptances WHERE session_id=?", Integer.class, id));
      out.put("attemptsDelta", jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=?", Integer.class, id) - attempts);
      out.put("wireDelta", MODEL_WIRE.size() - wire);
      out.put("sessionId", id);
    } finally {
      hold.release.countDown();
    }
    return out;
  }
```

The contender path, verified by reading: `replan → learnSuffix` (`checkCommand`, `!pending && bootstrapReady`) → `call` → `reserveAttempt`. Inside `reserveAttempt`, the in-flight count is non-zero, so it returns `IDEMPOTENCY_CONFLICT 409` (`GuidedTranslationStore` 924–932). `stopRejected` does **not** make `IDEMPOTENCY_CONFLICT` terminal (`GuidedTranslationService` 1683–1693), so the parent survives. The contenders are fired and finish **while** the actual provider response is held. That avoids the unsafe after-release window, in which a stale contender could legitimately reserve a new attempt.

#### 3.3.2 The method

```java
  /** B3B-3 (73/75/72): concurrent first suffix stays one immutable acceptance; later pair/obligation loss and edge forgeries refuse. */
  @Test
  void incrementalFirstSuffixAcceptanceIsOnceAndLaterPairsCannotDisappear() throws Exception {
    b3IsolatedCsi();
    var hold = new B3FirstSuffixHold();
    var seen = new java.util.concurrent.atomic.AtomicReference<B3Parent>();
    b3FirstSuffixHold = hold;
    try (var watcher = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
      var race = watcher.submit(() -> b3ContendFirstSuffix(hold));
      b3Hooks = new B3Hooks() {
        @Override public void beforeFinalize(B3Parent p) throws Exception {
          seen.set(p);
          ObjectNode contended = race.get(5, java.util.concurrent.TimeUnit.SECONDS);
          assertThat(contended.path("sessionId").asText()).isEqualTo(p.id());
          assertThat(hold.releasedInTime).as("the held actual call was released inside its bound").isTrue();
          for (JsonNode contender : contended.path("contenders")) {
            assertThat(contender.path("status").asInt()).isEqualTo(409);
            assertThat(contender.path("code").asText()).as("in-flight first suffix refuses a second reservation").isEqualTo("IDEMPOTENCY_CONFLICT");
          }
          assertThat(contended.path("acceptancesDuringHold").asInt()).isZero();
          assertThat(contended.path("attemptsDelta").asInt()).isZero();
          assertThat(contended.path("wireDelta").asInt()).isZero();
          b3AssertOneImmutableFirstAcceptance(p);       // 73 concurrent/duplicate + exact authorized removals
          b3AssertLaterLossRefuses(p);                  // 73 later pair deletion / obligation mutation
          b3EdgeMatrix(p);                              // 75 / 72 edge side
        }
      };
      incrementalJoined("admitted-drift2");
      assertThat(seen.get()).isNotNull();
    } finally { b3Hooks = null; b3FirstSuffixHold = null; hold.release.countDown(); b3RestoreCsi(); }
  }

  private void b3AssertOneImmutableFirstAcceptance(B3Parent p) throws Exception {
    String id = p.id();
    var acceptance = jdbc.queryForMap("SELECT previous_plan_revision,plan_revision,retained_admissions::text AS retained"
        + " FROM studio_guided_suffix_acceptances WHERE session_id=?", id);
    long prior = ((Number) acceptance.get("previous_plan_revision")).longValue(), first = ((Number) acceptance.get("plan_revision")).longValue();
    assertThat(C.parse((String) acceptance.get("retained"))).isEqualTo(C.parse(jdbc.queryForObject(
        "SELECT completed_admissions::text FROM studio_guided_relearn_switches WHERE session_id=?", String.class, id)));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts m JOIN studio_guided_relearn_switches s USING(session_id)"
        + " WHERE m.session_id=? AND m.identity->>'kind'='SOURCE_PLAN' AND m.created_at>=s.created_at", Integer.class, id))
        .as("one actual first-suffix model attempt").isEqualTo(1);
    JsonNode prefix = C.parse(jdbc.queryForObject("SELECT plan::text FROM studio_guided_translation_plans WHERE session_id=? AND plan_revision=?",
        String.class, id, prior));
    JsonNode accepted = C.parse(jdbc.queryForObject("SELECT plan::text FROM studio_guided_translation_plans WHERE session_id=? AND plan_revision=?",
        String.class, id, first));
    var sw = jdbc.queryForMap("SELECT effective_step_index,next_ordinal FROM studio_guided_relearn_switches WHERE session_id=?", id);
    int boundary = ((Number) sw.get("effective_step_index")).intValue(), nextOrdinal = ((Number) sw.get("next_ordinal")).intValue();
    var retained = new java.util.HashSet<String>();
    C.parse((String) acceptance.get("retained")).forEach(value -> retained.add(value.asText()));
    for (JsonNode old : prefix.path("obligations")) {      // independent recomputation, not GuidedPlanHistoryAudit
      var rows = jdbc.queryForList("SELECT a.admission_id,a.document->>'state' AS state FROM studio_guided_obligation_admissions o"
          + " JOIN studio_guided_actions a USING(session_id,admission_id) WHERE o.session_id=? AND o.obligation_id=?",
          id, old.path("obligationId").asText());
      boolean successful = rows.stream().anyMatch(row -> "SUCCEEDED".equals(row.get("state")));
      boolean kept = false;
      for (JsonNode next : accepted.path("obligations")) kept |= next.equals(old);
      if (successful) {
        assertThat(kept).as("successful meaning retained").isTrue();
        assertThat(rows.stream().anyMatch(row -> retained.contains(String.valueOf(row.get("admission_id"))))).isTrue();
      } else if (!kept) {
        int index = INCREMENTAL_STEPS.indexOf(old.path("stepId").asText());
        assertThat(index > boundary || index == boundary && old.path("occurrence").asInt() >= nextOrdinal)
            .as("only an exactly authorized first removal at/after the transition").isTrue();
      }
    }
    String plans0 = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(t) ORDER BY plan_revision)::text FROM studio_guided_translation_plans t WHERE session_id=?", String.class, id);
    var tx = new org.springframework.transaction.support.TransactionTemplate(
        ownedApplicationContext.getBean(org.springframework.transaction.PlatformTransactionManager.class));
    try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
      var duplicates = new ArrayList<java.util.concurrent.Future<String>>();
      for (int at = 0; at < 2; at++) duplicates.add(pool.submit(() -> {
        try { tx.executeWithoutResult(status -> { status.setRollbackOnly(); plans.acceptPlan(id, prior, accepted); }); return "ACCEPTED"; }
        catch (GuidedSessionException refused) { return refused.getMessage(); }
      }));
      for (var duplicate : duplicates) assertThat(duplicate.get(10, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo("REVISION_CONFLICT");
    }
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_suffix_acceptances WHERE session_id=?", Integer.class, id)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(t) ORDER BY plan_revision)::text FROM studio_guided_translation_plans t WHERE session_id=?",
        String.class, id)).isEqualTo(plans0);
  }

  private void b3AssertLaterLossRefuses(B3Parent p) throws Exception {
    String id = p.id();
    var tx = new org.springframework.transaction.support.TransactionTemplate(
        ownedApplicationContext.getBean(org.springframework.transaction.PlatformTransactionManager.class));
    long prior = jdbc.queryForObject("SELECT previous_plan_revision FROM studio_guided_suffix_acceptances WHERE session_id=?", Long.class, id);
    JsonNode prefix = C.parse(jdbc.queryForObject("SELECT plan::text FROM studio_guided_translation_plans WHERE session_id=? AND plan_revision=?",
        String.class, id, prior));
    String immutable = incrementalImmutableSnapshot(id);
    var head = sessions.transaction(() -> plans.state(id).deepCopy());
    long headRevision = head.path("planRevision").asLong();
    JsonNode current = head.path("plan");
    JsonNode session = sessions.transaction(() -> sessions.lock(id).document().deepCopy());
    // later consumer-pair deletion where the pair also existed in the original prefix
    ObjectNode pairLoss = current.deepCopy();
    boolean removed = false;
    for (JsonNode need : pairLoss.path("needs")) {
      var consumers = (ArrayNode) need.path("consumers");
      for (int at = consumers.size() - 1; at >= 0; at--) {
        JsonNode pair = consumers.get(at);
        boolean inPrefix = false;
        for (JsonNode old : prefix.path("needs")) for (JsonNode oldPair : old.path("consumers")) inPrefix |= oldPair.equals(pair);
        if (!removed && inPrefix && pair.path("argumentSlot").asText().equals("assert.expected")) { consumers.remove(at); removed = true; }
      }
    }
    assertThat(removed).as("a consumer pair that also existed in the original prefix").isTrue();
    ObjectNode obligationMutation = current.deepCopy();
    ObjectNode mutated = null;
    for (JsonNode obligation : obligationMutation.path("obligations"))
      if (obligation.path("needId").isNull() && obligation.path("targetIntent").asText().equals("Confirmation")) mutated = (ObjectNode) obligation;
    assertThat(mutated).isNotNull();
    mutated.put("targetIntent", "Destination");
    var audit = new com.citi.put.checks.studio.guided.translation.GuidedPlanHistoryAudit(jdbc, C);
    for (var later : List.of(pairLoss, obligationMutation)) {
      assertThatThrownBy(() -> sessions.transaction(() -> { audit.transition(session, current, later, false); return null; }))
          .isInstanceOf(GuidedSessionException.class);
      assertThatThrownBy(() -> tx.executeWithoutResult(status -> { status.setRollbackOnly(); plans.acceptPlan(id, headRevision, later); }))
          .isInstanceOf(GuidedSessionException.class);
      assertThat(sessions.transaction(() -> plans.state(id).path("planRevision").asLong())).isEqualTo(headRevision);
      assertThat(incrementalImmutableSnapshot(id)).isEqualTo(immutable);
    }
  }

  private void b3EdgeMatrix(B3Parent p) throws Exception {
    String id = p.id();
    JsonNode receipt = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_no_invocation_receipts WHERE session_id=?", String.class, id));
    String native0 = receipt.path("admissionId").asText();
    String nav = jdbc.queryForObject("SELECT admission_id FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0",
        String.class, id, INCREMENTAL_STEPS.get(0));
    var probe = new B3WriterProbe(id, p.test());
    probe.positive("edges-positive");
    assertThat(probe.genuine.path("consumerEdges")).isNotEmpty();
    assertThat(probe.genuine.path("incrementalEvidence").path("excludedAttempts")).hasSize(1);
    var labels = new java.util.LinkedHashMap<String, java.util.function.Consumer<ObjectNode>>();
    labels.put("edge-unknown-admission", b -> edge0(b).put("consumerAdmissionId", UUID.randomUUID().toString()));
    labels.put("edge-native0-excluded-admission", b -> edge0(b).put("consumerAdmissionId", native0));
    labels.put("edge-wrong-slot", b -> edge0(b).put("argumentSlot",
        edge0(b).path("argumentSlot").asText().equals("fill.value") ? "assert.expected" : "fill.value"));
    labels.put("edge-wrong-binding", b -> edge0(b).put("bindingId", "b3-unallocated-binding"));
    labels.put("edge-wrong-producer", b -> edge0(b).put("producerAdmissionId", nav));
    labels.put("edge-wrong-origin", b -> edge0(b).put("destinationOrigin", "https://other.example.test"));
    labels.put("producer-wrong-worker", b -> ((ObjectNode) b.path("producers").get(0).path("availability")).put("workerId", "foreign-worker"));
    labels.put("second-excluded-action", b -> ((ArrayNode) b.path("incrementalEvidence").path("excludedAttempts"))
        .add(b.path("incrementalEvidence").path("excludedAttempts").get(0).deepCopy()));
    labels.put("excluded-native-started", b -> {
      ObjectNode incremental = (ObjectNode) b.path("incrementalEvidence");
      ObjectNode drift = (ObjectNode) incremental.path("driftReceipt");
      drift.put("nativeInvocationStarted", true);
      ObjectNode preimage = drift.deepCopy(); preimage.remove("receiptHash");
      drift.put("receiptHash", GuidedContracts.hash(preimage));
      ((ObjectNode) incremental.path("switch")).put("driftReceiptHash", drift.path("receiptHash").asText());
    });
    labels.put("excluded-policy-failure", b -> ((ObjectNode) b.path("incrementalEvidence").path("excludedAttempts").get(0)
        .path("action").path("ledger")).put("outcomeCode", "POLICY_DENIED"));
    labels.put("excluded-wrong-preparation", b -> {
      ObjectNode fact = (ObjectNode) b.path("incrementalEvidence").path("excludedAttempts").get(0);
      String other = b.path("preparations").get(b.path("preparations").size() - 1).path("preparationId").asText();
      ((ObjectNode) fact.path("preparation")).put("preparationId", other);
      ((ObjectNode) fact.path("action")).put("preparationId", other);
    });
    for (var label : labels.entrySet()) probe.refuse(label.getKey(), label.getValue());
    probe.positive("edges-positive-after");
  }

  private static ObjectNode edge0(ObjectNode basis) { return (ObjectNode) basis.path("consumerEdges").get(0); }
```

**75 note.** Every label is refused through the stage oracle, and the attack hashes are recomputed: `basisHash` is resealed, the candidate is re-lowered and the drift `receiptHash` is recomputed. That is the ledger's "recomputed attack hashes do not bypass joins". There are no wrong-version or wrong-receipt-signature labels: authenticated receipt forgery is already covered at actual HTTP by the existing `drift-auth` variant (ReplayIT 4576–4587). "Edge attached to PRE_ADMISSION" is represented by `edge-native0-excluded-admission`, which uses the excluded pre-invocation admission. A pre-admission drift creates no admission ID that an edge could name.

---

## 4. B3c: two ReplayIT singletons (low lane)

### 4.1 B3C-1 `incrementalPartialDriftStepReadPublishesAndReplaysTwice`

Ledger: 76. IPC: P03 (backend read-at-j companion) and N01 (negatives at actual tier). The parent is `drift2`, with a test-owned source shape: step 1 = **read (ordinal 0) then fill (ordinal 1)**, and step 0 = navigation only. The drift2 DOM swaps textarea for input, so only the fill at (step1, 1) drifts. The read at (step1, 0), which is the earlier successful producer **inside drift step j=1**, is retained.

#### 4.1.1 Method

```java
  /** B3C-1 (76; P03, N01): partial drift-step read at j publishes with exact producer identity and replays twice. */
  @Test
  void incrementalPartialDriftStepReadPublishesAndReplaysTwice() throws Exception {
    b3IsolatedCsi();
    var seen = new java.util.concurrent.atomic.AtomicReference<B3Parent>();
    var producer = new java.util.concurrent.atomic.AtomicReference<String>();
    b3ReadInsideDriftStep = true;
    try {
      b3Hooks = new B3Hooks() {
        @Override public void texts(String variant, List<String> texts) {
          texts.set(0, "Open " + URL + " and wait for Operations.");
          texts.set(1, "Read the Order reference, then enter that order reference in Destination.");
        }
        @Override public void beforeFinalize(B3Parent p) throws Exception {
          seen.set(p);
          producer.set(b3PartialDriftStepFacts(p));
          b3ZeroConsumerAndOrphanNegatives(p, producer.get());           // N01 at actual stored tier
        }
        @Override public void afterFirstOrdinaryReplay(B3Parent p, JsonNode merged, UUID execution) throws Exception {
          b3PublishedPartialDriftStepAndSecondReplay(p, merged, execution, producer.get());
        }
      };
      incrementalJoined("drift2");
      assertThat(seen.get()).isNotNull();
    } finally { b3Hooks = null; b3ReadInsideDriftStep = false; b3RestoreCsi(); }
  }
```

`incrementalJoined("drift2")` already asserts most of the shape. It checks DRIFT at effective index 1, `reusedFrom` of size 1 (step 0 only), one mixed navigation, the fresh value in the receipt, single dispatch, no pre-switch model attempt, recording across both halves, and an ordinary replay that recaptures the read (`INCREMENTAL_ORDINARY_READS` +1). Verified at 4101–4221.

#### 4.1.2 `incrementalTenModel` branch (test fixture)

Inside the `SOURCE_PLAN` branch, with `boolean partialRead = b3ReadInsideDriftStep;`:

* The need producer: `needs.addObject().put("needId", "order").put("producerStepId", INCREMENTAL_STEPS.get(partialRead ? 1 : 0));`
* In the step-0 branch: `if (!bindingConsumers.isEmpty() && !partialRead) obligations.add(obligation(stepId, 1, "read", "Order reference", null, "order"));`
* In the step-1 non-literal branch, ahead of the existing code:
```java
            if (partialRead) {
              boolean readDone = false;
              for (JsonNode completed : context.path("learningWindow").path("completedCoordinates"))
                readDone |= completed.path("stepId").asText().equals(stepId) && completed.path("ordinal").asInt() == 0;
              if (!readDone) obligations.add(obligation(stepId, 0, "read", "Order reference", null, "order"));
              obligations.add(obligation(stepId, 1, "fill", "Destination", null, "order"));
            } else { /* existing fill/twice/click lines unchanged */ }
```
`NEXT_ACTION` is generic for read and fill (20529–20548), so it needs no change.

#### 4.1.3 Assertions

```java
  /** Exact producer identity, no fabricated consumer, no reusedFrom[j]; returns the retained read admission. */
  private String b3PartialDriftStepFacts(B3Parent p) throws Exception {
    String id = p.id(), step0 = INCREMENTAL_STEPS.get(0), step1 = INCREMENTAL_STEPS.get(1);
    var sw = jdbc.queryForMap("SELECT reason,effective_step_id,effective_step_index,next_ordinal,completed_admissions::text AS done"
        + " FROM studio_guided_relearn_switches WHERE session_id=?", id);
    assertThat(sw.get("reason")).isEqualTo("DRIFT");
    assertThat(sw.get("effective_step_id")).isEqualTo(step1);
    assertThat(((Number) sw.get("effective_step_index")).intValue()).isEqualTo(1);
    assertThat(((Number) sw.get("next_ordinal")).intValue()).as("partial drift step: ordinal 0 completed inside j").isEqualTo(1);
    String nav = b3SoleSucceeded(id, step0, 0, "navigate"), read = b3SoleSucceeded(id, step1, 0, "read");
    assertThat(C.parse((String) sw.get("done"))).isEqualTo(C.object().arrayNode().add(nav).add(read));
    String fill = b3SoleSucceeded(id, step1, 1, "fill");
    JsonNode receipt = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_no_invocation_receipts WHERE session_id=?", String.class, id));
    assertThat(receipt.path("admissionId").isNull()).as("pre-admission drift: no spent native attempt").isTrue();
    assertThat(receipt.path("coordinate")).isEqualTo(C.object().put("stepId", step1).put("ordinal", 1));
    var producers = jdbc.queryForList("SELECT document::text FROM studio_guided_producers WHERE session_id=?", String.class, id);
    assertThat(producers).hasSize(1);
    JsonNode actual = C.parse(producers.getFirst());
    assertThat(actual.path("producerAdmissionId").asText()).as("retained actual producer identity").isEqualTo(read);
    assertThat(actual.path("coordinate")).isEqualTo(C.object().put("stepId", step1).put("ordinal", 0));
    JsonNode fillProposal = C.parse(jdbc.queryForObject("SELECT proposal::text FROM studio_guided_actions WHERE session_id=? AND admission_id=?",
        String.class, id, fill));
    assertThat(fillProposal.path("operation").path("value").path("bindingId")).isEqualTo(actual.path("bindingId"));
    var pairs = new java.util.HashSet<String>();
    for (String document : jdbc.queryForList("SELECT document::text FROM studio_guided_consumer_edges WHERE session_id=?", String.class, id)) {
      JsonNode edge = C.parse(document);
      assertThat(edge.path("producerAdmissionId").asText()).isEqualTo(read);
      JsonNode consumer = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND admission_id=?",
          String.class, id, edge.path("consumerAdmissionId").asText()));
      assertThat(consumer.path("state").asText()).as("no fabricated consumer").isEqualTo("SUCCEEDED");
      pairs.add(edge.path("coordinate").path("stepId").asText() + "|" + edge.path("argumentSlot").asText());
    }
    assertThat(pairs).isEqualTo(Set.of(step1 + "|fill.value", INCREMENTAL_STEPS.get(2) + "|assert.expected"));
    var reads = incrementalNativeEvents(id, read), fills = incrementalNativeEvents(id, fill);
    assertThat(reads.stream().filter(event -> event.path("phase").asText().equals("NATIVE_COMPLETED")).count()).isEqualTo(1);
    assertThat(fills.stream().filter(event -> event.path("phase").asText().equals("DISPATCH_ENTER")).count()).isEqualTo(1);
    return read;
  }

  private String b3SoleSucceeded(String id, String step, int ordinal, String kind) {
    var rows = jdbc.queryForList("SELECT admission_id,attempt_ordinal,document::text AS d,proposal::text AS p FROM studio_guided_actions"
        + " WHERE session_id=? AND step_id=? AND ordinal=?", id, step, ordinal);
    assertThat(rows).as("one action at %s/%s (no repeated native effect)", step, ordinal).hasSize(1);
    JsonNode ledger = C.parse((String) rows.getFirst().get("d"));
    assertThat(ledger.path("state").asText()).isEqualTo("SUCCEEDED");
    assertThat(ledger.path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(C.parse((String) rows.getFirst().get("p")).path("operation").path("kind").asText()).isEqualTo(kind);
    return String.valueOf(rows.getFirst().get("admission_id"));
  }

  /** N01 at the actual stored writer: unretained/suffix-created/changed producer and hidden use cannot publish. */
  private void b3ZeroConsumerAndOrphanNegatives(B3Parent p, String read) throws Exception {
    var probe = new B3WriterProbe(p.id(), p.test());
    probe.positive("n01-positive");
    String fill = b3SoleSucceeded(p.id(), INCREMENTAL_STEPS.get(1), 1, "fill");
    String later = b3SoleSucceeded(p.id(), INCREMENTAL_STEPS.get(3), 0, "assert");
    probe.refuse("unretained-producer", b -> {
      ObjectNode incremental = (ObjectNode) b.path("incrementalEvidence");
      for (String path : List.of("switch", "firstSuffixAcceptance")) {
        var ids = (ArrayNode) incremental.path(path).path("retainedPrefixAdmissionIds");
        for (int at = ids.size() - 1; at >= 0; at--) if (ids.get(at).asText().equals(read)) ids.remove(at);
      }
      ((ObjectNode) incremental.path("switch")).put("retainedPrefixAdmissionsHash",
          GuidedContracts.hash(incremental.path("switch").path("retainedPrefixAdmissionIds")));
    });
    probe.refuse("suffix-created-producer", b -> ((ObjectNode) b.path("producers").get(0)).put("producerAdmissionId", fill));
    probe.refuse("changed-recipe", b -> ((ObjectNode) b.path("producers").get(0).path("recipe")).put("policyRuleId", "b3-other-rule"));
    probe.refuse("changed-origin", b -> ((ObjectNode) b.path("producers").get(0)).put("origin", "https://other.example.test"));
    probe.refuse("changed-coordinate", b -> ((ObjectNode) b.path("producers").get(0).path("coordinate")).put("ordinal", 1));
    probe.refuse("missing-producer", b -> ((ArrayNode) b.path("producers")).removeAll());
    probe.refuse("unknown-base", b -> ((ObjectNode) b.path("incrementalEvidence").path("plan")).put("baseRevisionId", UUID.randomUUID().toString()));
    probe.refuse("hidden-successful-use", b -> {
      ObjectNode hidden = edge0(b).deepCopy();
      hidden.put("consumerAdmissionId", later).put("argumentSlot", "assert.expected");
      hidden.set("coordinate", C.object().put("stepId", INCREMENTAL_STEPS.get(3)).put("ordinal", 0));
      ((ArrayNode) b.path("consumerEdges")).add(hidden);
    });
    probe.refuse("model-empty-consumers", b -> ((ArrayNode) b.path("translationPlan").path("needs").get(0).path("consumers")).removeAll());
    probe.positive("n01-positive-after");
  }

  private void b3PublishedPartialDriftStepAndSecondReplay(B3Parent p, JsonNode merged, UUID first, String read) throws Exception {
    String step0 = INCREMENTAL_STEPS.get(0), step1 = INCREMENTAL_STEPS.get(1);
    JsonNode artifact = C.parse(jdbc.queryForObject("SELECT artifact::text FROM ui_test_revisions WHERE id=?::uuid", String.class,
        merged.path("revisionId").asText()));
    JsonNode reused = artifact.path("learnedPlan").path("reusedFrom");
    assertThat(reused.has(step0)).isTrue();
    assertThat(reused.has(step1)).as("drift-step reusedFrom remains absent").isFalse();
    JsonNode binding = artifact.path("learnedPlan").path("bindings").get(0);
    assertThat(artifact.path("learnedPlan").path("bindings")).hasSize(1);
    assertThat(binding.path("producer").path("stepId").asText()).isEqualTo(step1);
    assertThat(binding.path("provenance").path("producerAdmissionId").asText()).isEqualTo(read);
    assertThat(artifact.path("learnedPlan").path("incremental").path("retainedPrefixAdmissionIds")).contains(JSON.getNodeFactory().textNode(read));
    assertThat(observedBinding(first).path("revisionId").asText()).isEqualTo(merged.path("revisionId").asText());
    String firstValue = VALUES.getLast();
    int model = MODEL_WIRE.size(), reads = INCREMENTAL_ORDINARY_READS.get(), legacy = LEGACY_MODEL_CALLS.get();
    UUID second = UUID.fromString(publicCall("/api/v1/studio/tests/" + p.test() + "/execute", C.object(), 202,
        UUID.randomUUID().toString()).path("executionId").asText());
    assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
    JsonNode replay;
    long deadline = System.nanoTime() + Duration.ofSeconds(45).toNanos();
    do { replay = publicCall("/api/v1/studio/executions/" + second, null, 200, null);
      if (replay.path("streamComplete").asBoolean()) break; Thread.sleep(30);
    } while (System.nanoTime() < deadline);
    assertThat(replay.path("status").asText()).isEqualTo("PASSED");
    assertThat(replay.path("video").path("status").asText()).isEqualTo("AVAILABLE");
    assertThat(INCREMENTAL_ORDINARY_READS.get() - reads).as("second run recaptures the original read").isEqualTo(1);
    assertThat(VALUES.getLast()).as("fresh bytes, no cached value").isNotEqualTo(firstValue);
    assertThat(RECEIPTS.getLast()).isEqualTo(VALUES.getLast());
    assertThat(MODEL_WIRE).hasSize(model); assertThat(LEGACY_MODEL_CALLS.get()).isEqualTo(legacy);
    assertThat(observedBinding(second).path("revisionId").asText()).isEqualTo(merged.path("revisionId").asText());
  }
```

**Risk R-P03 (product, not a test choice).** No existing backend joined case has had the need's producer at a **retained ordinal inside the drift step**. Reading `GuidedPlanHistoryAudit.transition` (65–88) and `GuidedSnapshotDeriver` (103–123), I found nothing that forbids it, and the original ARCH015 obligation explicitly requires it (P03 `existingObligation`). If the actual backend refuses this parent (`admitPlan`, `sourceCoordinates`, the audit or the deriver), record the exact refusal as a **candidate production defect against P03/76**. Do not change the fixture to avoid it.

### 4.2 B3C-2 `incrementalMeasuredAdmissionRowsPreserveIdentityAndActualMediaSeek`

IPC P03 and N01 do not apply here. This is the independent native0/native1 identity and per-admission media-seek proof required by B3c in `next-batches`. It does **not** complete ledger 85 (the positive tie). Parent: `admitted-drift2`, where the existing helper `assertIncrementalSpentAdmissionHasOneFreshNativeReplacement` already asserts A0 (FAILED/TARGET_CHANGED, DISPATCH_ENTER only) and A1 (NATIVE_COMPLETED).

#### 4.2.1 Method

```java
  /** B3C-2: native0/native1 identities; measured rows equal across callback/stored/manifest/result; actual per-admission seek. */
  @Test
  void incrementalMeasuredAdmissionRowsPreserveIdentityAndActualMediaSeek() throws Exception {
    b3IsolatedCsi();
    var capture = new B3EvidenceCapture();
    var seen = new java.util.concurrent.atomic.AtomicReference<B3Parent>();
    b3EvidenceCapture = capture;
    try {
      b3Hooks = new B3Hooks() {
        @Override public void beforeFinalize(B3Parent p) throws Exception {
          seen.set(p);
          var probe = new B3WriterProbe(p.id(), p.test());
          probe.positive("ledger-positive");
          probe.refuse("unrelated-failed-ledger-omitted", b ->            // route 8: complete stored action inventory
              ((ArrayNode) b.path("incrementalEvidence").path("excludedAttempts")).removeAll());
          probe.positive("ledger-positive-after");
        }
        @Override public void afterFirstOrdinaryReplay(B3Parent p, JsonNode merged, UUID execution) throws Exception {
          b3AssertMeasuredRowsAndActualMediaSeek(p.id(), capture);
        }
      };
      incrementalJoined("admitted-drift2");
      assertThat(seen.get()).isNotNull();
      assertThat(capture.failure).isNull();
    } finally { b3Hooks = null; b3EvidenceCapture = null; b3RestoreCsi(); }
  }
```

#### 4.2.2 Callback capture (filter branch) and media probe

The first statement inside the `observedReportCapture` filter lambda:
```java
            B3EvidenceCapture b3 = b3EvidenceCapture;
            if (b3 != null && b3.selected(http)) {
              var wrapped = new org.springframework.web.util.ContentCachingRequestWrapper(http, 1048576);
              try { chain.doFilter(wrapped, response); }
              finally { b3.record(http.getRequestURI(), wrapped.getContentAsByteArray(),
                  ((jakarta.servlet.http.HttpServletResponse) response).getStatus()); }
              return;
            }
```

```java
  /** Accepted owning-worker evidence callbacks: retains only kind=action timing items (IDs/integers). */
  private static final class B3EvidenceCapture {
    static final String PREFIX = "/internal/v2/studio/guided-sessions/";
    static final String ROUTE = com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceService.ROUTE_PATH;
    final java.util.concurrent.ConcurrentMap<String, List<JsonNode>> actions = new java.util.concurrent.ConcurrentHashMap<>();
    volatile Throwable failure;

    boolean selected(jakarta.servlet.http.HttpServletRequest http) {
      String uri = http.getRequestURI();
      return http.getMethod().equals("POST") && uri.startsWith(PREFIX) && uri.endsWith(ROUTE);
    }

    void record(String uri, byte[] body, int status) {
      try {
        if (status < 200 || status >= 300 || body.length == 0) return;
        String id = uri.substring(PREFIX.length(), uri.length() - ROUTE.length());
        JsonNode parsed = C.parseWire(body);
        if (!parsed.path("timings").isArray()) throw new AssertionError("accepted evidence callback without timings array");
        ArrayNode items = C.object().putArray("items");
        for (JsonNode item : parsed.path("timings")) if (item.path("kind").asText().equals("action")) items.add(item.deepCopy());
        actions.computeIfAbsent(id, ignored -> new CopyOnWriteArrayList<>()).add(items);
      } catch (RuntimeException | AssertionError invalid) { failure = invalid; }
    }
  }

  private static Path b3Tool(String name) throws IOException {
    for (String directory : System.getenv("PATH").split(java.io.File.pathSeparator)) {
      Path candidate = Path.of(directory).resolve(name).toAbsolutePath().normalize();
      if (Files.isRegularFile(candidate) && Files.isExecutable(candidate)) return candidate.toRealPath();
    }
    throw new AssertionError("installed " + name + " required for the B3 media probe");
  }

  /** Test-owned probe over the actual served WebM; records which admission each real seek used. */
  private static final class B3MediaProbe {
    final Path video, ffmpeg, ffprobe;
    final List<String> seeked = new ArrayList<>();
    B3MediaProbe(Path video) throws IOException { this.video = video; ffmpeg = b3Tool("ffmpeg"); ffprobe = b3Tool("ffprobe"); }

    /** Last actual video packet time; Playwright WebM may omit container duration. */
    long lastPacketMs() throws Exception {
      Process process = registerOwnedTool(new ProcessBuilder(ffprobe.toString(), "-v", "error", "-select_streams", "v:0",
          "-show_entries", "packet=pts_time", "-of", "csv=p=0", video.toString()).redirectErrorStream(true).start(), "b3-media-packets");
      byte[] out = process.getInputStream().readNBytes(4 * 1024 * 1024);
      awaitJoinedProcess(process, 30, "B3 media packet probe");
      double last = -1;
      for (String line : new String(out, StandardCharsets.UTF_8).split("\n"))
        if (!line.isBlank() && !line.trim().equals("N/A")) last = Math.max(last, Double.parseDouble(line.trim()));
      assertThat(last).as("actual decodable video packets").isPositive();
      return Math.round(last * 1000);
    }

    byte[] frameAt(String admissionId, long offsetMs) throws Exception {
      if (admissionId != null) seeked.add(admissionId);
      Process process = registerOwnedTool(new ProcessBuilder(ffmpeg.toString(), "-nostdin", "-v", "error",
          "-ss", java.math.BigDecimal.valueOf(offsetMs, 3).toPlainString(), "-i", video.toString(), "-frames:v", "1",
          "-vf", "scale=64:36", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1").start(), "b3-media-seek");
      byte[] frame = process.getInputStream().readNBytes(64 * 36 + 1);
      process.getErrorStream().readNBytes(65536);
      awaitJoinedProcess(process, 30, "B3 media seek probe");
      return frame;
    }
  }
```

#### 4.2.3 Assertions

```java
  private void b3AssertMeasuredRowsAndActualMediaSeek(String id, B3EvidenceCapture capture) throws Exception {
    JsonNode result = awaitGuidedVideoSettled(id);
    assertThat(result.path("evidence").path("video").path("status").asText()).isEqualTo("AVAILABLE");
    var row = guidedRecordingRow(id);
    ArrayNode served = C.object().putArray("items"), stored = C.object().putArray("items");
    for (JsonNode item : result.path("actionTimings")) if (item.path("kind").asText().equals("action")) served.add(item);
    for (JsonNode item : C.parse(String.valueOf(row.get("timings")))) if (item.path("kind").asText().equals("action")) stored.add(item);
    Path objects = TEMP.resolve("objects");
    JsonNode manifest = C.parse(Files.readString(objects.resolve(String.valueOf(row.get("manifest_key"))).normalize()));
    var callbacks = capture.actions.get(id);
    assertThat(callbacks).as("accepted owning-worker evidence callback captured").isNotEmpty();
    for (JsonNode callback : callbacks)
      assertThat(GuidedContracts.canonical(callback)).as("callback rows unchanged").isEqualTo(GuidedContracts.canonical(served));
    assertThat(GuidedContracts.canonical(stored)).isEqualTo(GuidedContracts.canonical(served));
    assertThat(GuidedContracts.canonical(manifest.path("timings"))).isEqualTo(GuidedContracts.canonical(served));
    // native0 / native1 identities
    JsonNode receipt = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_no_invocation_receipts WHERE session_id=?", String.class, id));
    String native0 = receipt.path("admissionId").asText();
    var same = sessions.transaction(() -> sessions.actions(id)).stream()
        .filter(action -> action.path("coordinate").equals(receipt.path("coordinate"))).toList();
    String native1 = same.stream().filter(action -> action.path("attemptOrdinal").asInt() == 1).findFirst().orElseThrow()
        .path("admission").path("admissionId").asText();
    JsonNode spent = same.stream().filter(action -> action.path("attemptOrdinal").asInt() == 0).findFirst().orElseThrow();
    assertThat(native1).isNotEqualTo(native0);
    assertThat(spent.path("preparationId")).isNotEqualTo(same.stream().filter(a -> a.path("attemptOrdinal").asInt() == 1)
        .findFirst().orElseThrow().path("preparationId"));
    for (ArrayNode sink : List.of(served, stored, (ArrayNode) manifest.path("timings")))
      for (JsonNode item : sink) assertThat(item.path("admissionId").asText()).as("absent native0 stamp is never invented").isNotEqualTo(native0);
    JsonNode replacement = null;
    for (JsonNode item : served) if (item.path("admissionId").asText().equals(native1)) replacement = item;
    assertThat(replacement).as("genuine replacement timing").isNotNull();
    assertThat(replacement.path("endMs").asLong()).isGreaterThanOrEqualTo(replacement.path("startMs").asLong());
    // one browser/context/origin/video
    var all = sessions.transaction(() -> sessions.actions(id));
    assertThat(all.stream().map(action -> action.path("executionEvidence").path("contextId").asText()).distinct().toList()).hasSize(1);
    assertThat(all.stream().filter(action -> action.path("executionEvidence").path("kind").asText().equals("observedDocument"))
        .map(action -> action.path("executionEvidence").path("origin").asText()).distinct().toList()).containsExactly(ORIGIN);
    // actual per-present-admission media seek on the bytes the production route serves
    HttpResponse<byte[]> whole = guidedVideoRead(id, null, true);
    assertThat(whole.statusCode()).isEqualTo(200);
    assertThat(whole.body()).isEqualTo(Files.readAllBytes(objects.resolve(String.valueOf(row.get("video_key"))).normalize()));
    Path media = TEMP.resolve("b3-media-" + id + ".webm");
    try (var channel = Files.newByteChannel(media, Set.of(java.nio.file.StandardOpenOption.CREATE_NEW, java.nio.file.StandardOpenOption.WRITE),
        java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")))) {
      channel.write(java.nio.ByteBuffer.wrap(whole.body()));
    }
    try {
      var probe = new B3MediaProbe(media);
      long lastMs = probe.lastPacketMs();
      var order = new ArrayList<String>();
      for (JsonNode item : served) {
        long start = item.path("startMs").asLong();
        assertThat(start).as("stamped offset lies on the actual recording timeline").isBetween(0L, lastMs);
        byte[] frame = probe.frameAt(item.path("admissionId").asText(), start);
        assertThat(frame.length).as("one decoded frame at the stamped offset").isEqualTo(64 * 36);
        order.add(item.path("admissionId").asText());
      }
      assertThat(probe.seeked).as("seeks are keyed by the exact served admission identities").containsExactlyElementsOf(order);
      assertThat(probe.seeked).doesNotContain(native0).contains(native1);
      assertThat(probe.frameAt(null, lastMs + 5000).length).as("probe control: no frame beyond the recording").isZero();
    } finally { Files.deleteIfExists(media); }
  }
```

**Limits (stated plainly).** The probe proves four things: every present admission's stamped `startMs` is a real seekable offset in the bytes the production route actually serves; each seek is keyed by the exact admission identity, which is the same in callback, V20, manifest and result; the native0 admission has no stamp in any sink, so no seek happens; and the probe can tell an in-range offset from an out-of-range one. It does **not** prove that a decoded frame visually shows *that* action. I found no lawful, non-flaky content oracle. Seeking is a UI concern (story 008), and no backend seek API exists. Verified: `GuidedSessionVideoController` serves only whole or Range bytes.

---

## 5. Registration

### 5.1 `GuidedPublicationReplayIT` closed-profile sets (the same writer as the methods)

Append to both `SINGLETON_METHODS` (ReplayIT:137) and `INCREMENTAL_METHODS` (ReplayIT:187):
```java
      "incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution",
      "incrementalNonemptyOriginalPrefixRetainsBaseProofAfterDriftAtOne",
      "incrementalFirstSuffixAcceptanceIsOnceAndLaterPairsCannotDisappear",
      "incrementalPartialDriftStepReadPublishesAndReplaysTwice",
      "incrementalMeasuredAdmissionRowsPreserveIdentityAndActualMediaSeek",
```

### 5.2 `backend/build.gradle.kts` (Dex-JOIN, the same window as ReplayIT)

After `joinedPrefixSyncMethods` (line 139):
```kotlin
val joinedB3Methods = setOf(
    "incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution",
    "incrementalNonemptyOriginalPrefixRetainsBaseProofAfterDriftAtOne",
    "incrementalFirstSuffixAcceptanceIsOnceAndLaterPairsCannotDisappear",
    "incrementalPartialDriftStepReadPublishesAndReplaysTwice",
    "incrementalMeasuredAdmissionRowsPreserveIdentityAndActualMediaSeek"
)
```
Three edits:
* line 259: `filter { setIncludePatterns(*(joinedIncrementalMethods + joinedPrefixSyncMethods + joinedB3Methods).map { "$joinedFixtureClass.$it" }.toTypedArray()) }`
* line 265: `(joinedIncrementalMethods + joinedPrefixSyncMethods + joinedB3Methods).forEach { method -> filter.excludeTestsMatching("$joinedFixtureClass.$method") }`
* line 325: `setOf(joinedIncrementalMethods[0], joinedIncrementalMethods[2]) + joinedPrefixSyncMethods + joinedB3Methods +`

If the B1/B2 designs add their own sets, the single build writer should merge all added low singletons into one `joinedAddedLowMethods` set, used at those same three sites. Inventory after this batch: the low lane goes from 42 to 47. With B1a–B2b it would be 42 + 20 = 62 low, and 43 + 62 = 105 JOIN identities, as the plan projects.

### 5.3 Selectors (for a later source-frozen run; not executed here)

* B3a: `test --tests com.citi.put.checks.studio.guided.publication.GuidedPublicationAuthorityIT` (all 26).
* B3b/B3c: `guidedIncrementalTest --tests $J.GuidedPublicationReplayIT.<method>` for each of the 5. These share one invocation with the R5 collector form in the resume plan §2.

---

## 6. The 15 private routes and where each one is asserted

Status key: **NEW** means a method in this design. **EXISTING** means an assertion already in source; "R1" means it runs in the planned frozen JOIN run. A route is *mapped* when an executed (or to-be-executed) assertion targets it. *Closure* is for Quinn to judge.

| # | Original route | Mapped assertion(s) | Status | Residual gap |
|---|---|---|---|---|
| 1 | immutable-original-source-cannot-be-replaced | B3A-1 `immutable-original-source-cannot-be-replaced` (exact pointer `/basis/snapshotEvidence/current/authoring/steps/2/context/entries/1/value`, STORED); B3B-1 joined label of the same name; B3B-1 gen-2 destructive source CAS (409 PUBLICATION_CONFLICT); source01 `manifest-authored-context` | NEW + EXISTING (unrun) | Exact pointer at the joined tier is not lawful (the node is absent there). |
| 2 | private-plain-hash-must-match-before-freeze | source01 `storedSourceManifest…[manifest-private-plain]` (actual PG returned read); B3B-1 non-destructive `expectedConfigurationRevision` CAS | EXISTING (unrun) + NEW | No HTTP corruption of a frozen plain value at start (not lawful: stored values are immutable, and the start route freezes from the current draft). |
| 3 | immutable-source-manifest-hash-is-exact | B3A-1 `/basis/sourceManifestHash` (STORED); B3B-1 joined; source01 `manifest-checksum` | NEW + EXISTING | — |
| 4 | raw-edge-cannot-name-pending-action | AuthorityIT `rawEdgeCannotNamePendingActionAgainstActualStoredAuthority` | EXISTING (captured; regate) | Broader authenticated phase matrix stays with B1. |
| 5 | receipt-transport-authority-cannot-be-inferred-from-hash | ReplayIT `incremental joined drift-auth`: 9 forged receipt fields with **recomputed receiptHash** over authentic transport refused (4576–4587); B3B-3 `excluded-native-started` (recomputed receipt hash) | EXISTING (R1) + NEW | — |
| 6 | wrong-private-input-hash | B3A-1 exact `/basis/materializationEvidence/entries/0/inputHash` (STORED); B3B-1 `wrong-private-input-hash-v2` (multi-version, STORED); B3B-1 `v1/v2-private-value` stored history; source01 `private-value` | NEW + EXISTING | — |
| 7 | preparation-substitutes-birth-for-actual | B3B-1 `preparation-substitutes-birth-for-actual` (appendedHistorical, STORED) | NEW | OPEN only if no actual preparation is issued above birth (precondition asserted; never fabricated). |
| 8 | unrelated-failed-ledger-cannot-be-omitted | B3C-2 `unrelated-failed-ledger-omitted` (actual excluded native0 removed from the offered basis); writer `authority()` stored inventory | NEW | No second FAILED/UNKNOWN action can be produced lawfully, so "other failed" beyond the single excluded attempt stays unproven. |
| 9 | hash-is-not-transport-authentication | ReplayIT `drift-auth`: `invalid` bearer → 401; resealed hash with a correct transport still refused | EXISTING (R1) | **GAP:** the missing-`Authorization`-header variant (distinct from an invalid token) is not asserted. Owner: B1 callback matrix. |
| 10 | forged-jwt-algorithm | `GuidedSecurityTest.algorithmSubstitutionDuplicateKeysAndTrailingJsonFail` (unit); `drift-auth` invalid token | EXISTING | **GAP:** an alg-substituted, re-signed token over the actual owning-worker route with the exact original body. Owner: B1. |
| 11 | missing-mtls | `drift-auth` no-client-certificate SSLContext → 401 (4571–4575) | EXISTING (R1) | — |
| 12 | wrong-worker-subject | `drift-auth` `other-worker` token → 403 (4568) | EXISTING (R1) | — |
| 13 | stale-callback-owner | `confirm-owner-loss` (graceful LEASE_LOST), `drift-auth` fence+1 → 403 | EXISTING (narrower) | **GAP:** natural owner-lease expiry or transfer, then a late authenticated callback with the exact original body. Owner: B1c (needs a root-approved observation seam). |
| 14 | wrong-assignment | none exact | — | **GAP:** a signed callback with a mismatched `assignmentSessionId` against the persisted assignment. Owner: B1. |
| 15 | wrong-owner-fence | `drift-auth` X-Owner-Fence fence+1 → 403 (4569) | EXISTING (R1) | — |

**14 of 15 routes** map to at least one existing or new assertion. **Route 14 (`wrong-assignment`) has no assertion anywhere yet.** **Four transport-authentication remainders (9, 10, 13, 14) stay with B1** and are not designed here. They need the captured authentic `drift-auth` callback body, which only exists in that variant's capture path, plus (for 13) the B1c observation seam.

---

## 7. Ledger subjects by method (plannedName / tier verbatim; assertion text in manifest.json)

| Method | Lane | Ledger | plannedName (tier) | What this method proves | Not proven here |
|---|---|---|---|---|---|
| B3A-1 | test (AuthorityIT) | 31, 52, 60 | `IncrementalPublicationIT.mergedProofCannotReuseOldAdmissionsOrForeignSnapshots` (Java + Postgres + pure runner validator); `IncrementalValidationBasisTest.reconstructsPrivateInputsBeforePublicEvidence` (Java+runner canonical+Postgres); `IncrementalPublicationIT.snapshotFactsMatchImmutableOriginalSourceManifest` (HTTP+Postgres) | "wrong snapshot value … refused"; "mutate private value, entry hash …"; "attempted context … tamper … fails" at actual stored writer | runner validator (controlled verdict at this tier); HTTP |
| B3A-2 | test | 31 | as above | "base admission substitution, cross-CSI/test reuse … refused" at relational tier | new-session prefix+suffix (B3B-1); forged no-invocation receipt (drift-auth) |
| B3B-1 | guidedIncrementalTest | 43, 61, 60, 52, 31, 42 | `…sameTestOlderBaseAndNoncontiguousReuseAreRefused` (Postgres+pure validator); `…baseProofUsesPinnedRevisionOwnImmutableRows` (Postgres+pure Java+TS); `…snapshotFactsMatchImmutableOriginalSourceManifest` (HTTP+Postgres); `…reconstructsPrivateInputsBeforePublicEvidence`; `…mergedProofCannotReuseOldAdmissions…`; `IncrementalIdentityTest.opaqueAliasRequiresExactDeclaredName` (unit+HTTP refusal) | wrong same-test revision with equal hash (HTTP start + offered basis); pinned-base own rows; original source/config CAS; full multi-version reconstruction; finalization idempotent and model/browser free; alias/duplicate/conflict/missing at HTTP start | 43 "prefix gaps, suffix reuse, post-drift j reuse": only via the B3B-2 pure labels and existing conformance; destructive config CAS |
| B3B-2 | guidedIncrementalTest | 63, 61, 72 | `…nonemptyOriginalPrefixCannotDropBaseProofAfterDriftAtOne` (HTTP+Postgres+pure validator); `…baseProofUsesPinnedRevisionOwnImmutableRows`; `…onlyUnperformedImportedProducerCanRemainRawWithoutNeed` (PG+pureJavaTS) | null / changed program / changed pin refused; no repeated native effect; raw import stays raw; hidden read, orphan and recycled ID refused | — |
| B3B-3 | guidedIncrementalTest | 73, 75, 72 | `…backendAuditsFirstSuffixThenStrictPlanChain` (PG); `IncrementalGraphProjectionTest.rejectsEveryUnaccountedOrUnprovenEdge` (Java+TS) | exactly one immutable acceptance under actual concurrency; authorized first removals; later pair and obligation loss refused; edge matrix with recomputed hashes refused | genuinely simultaneous *acceptance* writes (see §8) |
| B3C-1 | guidedIncrementalTest | 76; P03, N01 | `IncrementalGraphProjectionTest.zeroConsumerRequiresRetainedActualProducer` (Java+TS+ordinaryreplay) | read-at-j partial drift: exact producer identity, no `reusedFrom[j]`, published, 2 fresh ordinary runs; N01 negatives at actual stored writer | zero-consumer positive at this parent (existing `deleted-consumers` / `admitted-literal2` cover it) |
| B3C-2 | guidedIncrementalTest | (B3c native/seek; route 8) | — | native0/native1 identities; measured rows equal in 4 sinks; actual seek per present admission; no stamp means no seek | **85 positive tie**; visual frame identity |

---

## 8. Clauses that cannot be proven lawfully in-repo

1. **Ledger 85, the positive timing tie.** This is the user's decision (row 85 A/B/C). B3C-2 is the independent identity and seek proof only.
2. **Truly simultaneous first-suffix acceptance writes (73).** Production's in-flight attempt guard (`reserveAttempt` 924–932) refuses any second reservation before an acceptance exists. Two acceptances can only race if one of three things happens: a production seam, a test-built plan pushed through `acceptPlan` while the real call is in flight (fabricated authority), or stale contenders after release (non-deterministic, and they may lawfully create a later plan revision). B3B-3 proves the lawful version: the actual in-flight race plus concurrent duplicate re-acceptance of the actual first plan.
3. **"Real Core / test Vault" tiers.** Core is an in-JVM `HttpServer` and Vault is a fake provider (resume plan §6). The QA ruling on that is still pending.
4. **Visual identity of a decoded frame (seek).** There is no lawful, non-flaky content oracle (§4.2.3).
5. **Exact original pointer 1 at the joined tier.** The joined authoring has no `steps/2/context/entries/1` node. That pointer is proven only at the relational tier (B3A-1).
6. **A second lawful FAILED/UNKNOWN ledger (route 8, "other failed").** No in-repo path creates one without fabricating history.

## 9. Risks to confirm in the source window (none blocks the design)

| ID | Risk | What to do |
|---|---|---|
| R-A2 | The shared constructor might not accept a different canonical `csiId` | Fall back to the same CSI. Cross-CSI then stays OPEN at relational tier. No fixture edit. |
| R-42 | `parseVariables` might refuse duplicate/null shapes earlier, or the `variables` JSON shape might differ | Confirm the `CanonicalStudioCodec` shape first. Record any earlier guard. Keep that one label OPEN. |
| R-P03 | The backend might refuse the read-inside-drift-step parent | That is a candidate product defect for P03/76, not a fixture change. |
| R-VAL | Does the class cohort, audit or privacy accounting count runner validator calls per committed attempt? | Check `scanFinalOwnedSinks` / cohort counters before coding. Staged validator calls are real, but their attempts are rolled back. |
| R-HOLD | The provider hold (≤10 s) must stay below the gateway `callSeconds` | Read `GuidedTranslationProperties.callSeconds`. Shorten the bound if needed. Never extend a production timeout. |
| R-STAGE | Any `requireStored`/`requireBackendPure` pin might fire at a different stage | That label is OPEN for Aria/Quinn review. Do not re-point it. |
| R-RUNTIME | B3B-1 runs 3 learning sessions plus 6 alias starts | Expect roughly 2–3× a single variant. Keep it in the R5 window alone if CPU contention appears (see `backend-b4-runner-cpu-exclusions.json`). |

## 10. Ownership, files and sequencing

* **B3a** (W2 source window, Dex-AUTH, exclusive): `GuidedPublicationAuthorityIT.java` only. Two methods and the §2.1 helpers. Existing members stay byte-preserved.
* **B3b + B3c** (W5 second window, Dex-JOIN, the single writer of both files): `GuidedPublicationReplayIT.java` (§1 harness, §3, §4, §5.1) and `backend/build.gradle.kts` (§5.2). No production, `support/` fixture, schema, migration, runner, `dist` or golden change.
* **Production seam: none.**
* Quinn should source-review against this design before R5. No source may be edited while any collector run is live (resume plan invariant 1).
