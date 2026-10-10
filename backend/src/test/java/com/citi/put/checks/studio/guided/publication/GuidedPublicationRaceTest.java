package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioRepositoryCustomImpl;
import com.citi.put.checks.studio.compile.CandidateRevision;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.PublishResult;
import com.citi.put.checks.studio.compile.VersionedIntentDeriver;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real PostgreSQL writer/lock/fault tests. Original successful learning and validator evidence here
 * is explicitly synthetic relational input; this is not the separately owned browser/Node proof.
 */
class GuidedPublicationRaceTest {
  static final GuidedContracts C = new GuidedContracts();

  /** Actual Spring Data repository, production custom fragment and production compile writer. */
  static final class Compiler implements AutoCloseable {
    final LocalContainerEntityManagerFactoryBean factory =
        new LocalContainerEntityManagerFactoryBean();
    final TransactionTemplate tx;
    final CompileStateService service;

    Compiler(GuidedPublicationMigrationTest.Database db) {
      factory.setDataSource(db.jdbc.getDataSource());
      factory.setManagedTypes(PersistenceManagedTypes.of(UITest.class.getName()));
      factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
      factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "none"));
      factory.afterPropertiesSet();
      var emf = factory.getObject();
      var manager = new JpaTransactionManager(emf);
      manager.setDataSource(db.jdbc.getDataSource());
      tx = new TransactionTemplate(manager);
      var em = SharedEntityManagerCreator.createSharedEntityManager(emf);
      var custom = new StudioRepositoryCustomImpl();
      ReflectionTestUtils.setField(custom, "entityManager", em);
      StudioRepository drafts =
          new JpaRepositoryFactory(em)
              .getRepository(StudioRepository.class, RepositoryFragments.just(custom));
      service = new CompileStateService(db.jdbc, drafts);
      ReflectionTestUtils.setField(service, "entityManager", em);
    }

    @Override
    public void close() {
      factory.destroy();
    }
  }

  static ObjectNode secondSession(GuidedPublicationMigrationTest.Database db, String id) {
    var document = db.session.deepCopy().put("sessionId", id);
    ((ObjectNode) document.path("runAuthorization"))
        .put("authorizationId", UUID.randomUUID().toString());
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.insert(document);
          db.jdbc.update(
              "INSERT INTO"
                  + " studio_guided_source_manifests(session_id,scope_hash,manifest,manifest_hash)"
                  + " SELECT ?,scope_hash,manifest,manifest_hash FROM"
                  + " studio_guided_source_manifests WHERE session_id='session'",
              id);
          db.jdbc.update("INSERT INTO studio_guided_translation_state(session_id) VALUES (?)", id);
        });
    return document;
  }

  static PublicationContracts.Base capture(
      GuidedPublicationMigrationTest.Database db, JsonNode session) {
    var requirements =
        C.object()
            .put("csiId", "CSI")
            .put("environment", "Development")
            .put("applicationId", "app")
            .put("accountRef", "account")
            .put("policyId", "policy")
            .put("policyVersion", "1")
            .put("entryPolicyId", "entry");
    requirements.putArray("allowedOrigins").add("https://orders.example.test");
    requirements.putArray("capabilities").add("navigate");
    requirements.putObject("initialContext").put("kind", "initialBlank");
    return db.tx.execute(
        t -> {
          db.sessions.lock(session.path("sessionId").asText());
          return db.bases.capture(session, requirements, Instant.now());
        });
  }

  /** Supplies a canonical controlled validation result, then uses real reserve/claim/finish. */
  static PublicationContracts.Commit prepared(
      GuidedPublicationMigrationTest.Database db,
      JsonNode session,
      PublicationContracts.Base base) {
    String id = session.path("sessionId").asText();
    var plan = C.object();
    plan.putArray("obligations");
    String translationHash = GuidedContracts.hash(plan);
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock(id);
          var owner =
              C.object()
                  .put("workerId", "worker")
                  .put("fence", 1)
                  .put("leaseExpiresAt", PublicationContracts.time(Instant.now().plusSeconds(120)));
          db.jdbc.update(
              "UPDATE studio_guided_sessions SET state='FINALIZING',"
                  + " document=jsonb_set(jsonb_set(document, '{state}','\"FINALIZING\"'),"
                  + " '{owner}',?::jsonb) WHERE session_id=?",
              owner.toString(),
              id);
          db.jdbc.update(
              "INSERT INTO"
                  + " studio_guided_translation_plans(session_id,plan_revision,parent_revision,plan,plan_hash)"
                  + " VALUES (?,1,0,?::jsonb,?)",
              id,
              plan.toString(),
              translationHash);
          db.jdbc.update(
              "UPDATE studio_guided_translation_state SET plan_revision=1 WHERE session_id=?", id);
        });
    var basis =
        C.object()
            .put("testId", db.testId.toString())
            .put("csiId", "CSI")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    basis
        .putArray("sourceSteps")
        .addObject()
        .put("source", "Open https://orders.example.test/start");
    var learned = C.object().put("schemaVersion", 2).put("planId", "synthetic-relational-" + id);
    var policy = C.object().put("schemaVersion", 3);
    policy.set("scope", base.document().path("replayRequirements"));
    var profile =
        C.parse(
            "{\"catalog\":\"observed-replay-1\", \"playwright\":\"1.63.0\","
                + " \"browserEngine\":\"chromium\", \"contract\":2, \"learnedPlan\":2,"
                + " \"observation\":2, \"guidedPolicy\":2, \"referencePolicy\":3, \"lowering\":1,"
                + " \"artifact\":2, \"language\":\"observed-2\", \"executor\":\"observed-2\","
                + " \"publicationEvidence\":1, \"validationBasis\":1, \"validator\":\"observed-1\","
                + " \"protocol\":2, \"replayAuthorization\":1, \"accountAbi\":1}");
    var build =
        C.object()
            .put("profileHash", GuidedContracts.hash(profile))
            .put("schemaBundleHash", "b".repeat(64))
            .put("referenceBundleHash", "c".repeat(64))
            .put("executableImageDigest", "d".repeat(64))
            .put("chromiumBuild", "relational-only");
    var artifact = C.object().put("version", 2);
    artifact.set("learnedPlan", learned);
    artifact.set("replayPolicy", policy);
    artifact.set("profile", profile);
    var hashes = C.object();
    for (String key :
        List.of("sourceHash", "configurationHash", "authoringHash", "runAuthorizationHash")) {
      hashes.set(key, base.document().path(key));
    }
    hashes
        .put("artifactHash", GuidedContracts.hash(artifact))
        .put("learnedPlanHash", GuidedContracts.hash(learned))
        .put("referencePolicyHash", GuidedContracts.hash(policy))
        .put("profileHash", GuidedContracts.hash(profile));
    for (String key :
        List.of("operationEquivalenceHash", "admissionProvenanceHash", "publicationEvidenceHash")) {
      hashes.put(key, "e".repeat(64));
    }
    var revisionIdentity = C.object().put("version", 1);
    for (String key : List.of("testId", "csiId", "sourceRevision", "configurationRevision")) {
      revisionIdentity.set(key, basis.path(key));
    }
    hashes.fields().forEachRemaining(e -> revisionIdentity.set(e.getKey(), e.getValue()));
    hashes.put("revisionDigest", GuidedContracts.hash(revisionIdentity));
    var identity = C.object();
    identity.set("base", base.document());
    identity
        .put("ownerWorkerId", "worker")
        .put("ownerFence", 1)
        .put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)))
        .put("translationHash", translationHash)
        .put("basisHash", GuidedContracts.hash(basis))
        .put("validationBuildHash", GuidedContracts.hash(build));
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "profileHash")) {
      identity.set(key, hashes.path(key));
    }
    var snapshot = new PublicationContracts.Snapshot(identity, basis);
    var attempt =
        db.tx.execute(
            t -> {
              db.sessions.lock(id);
              return db.publications.reserve(
                  new PublicationContracts.Claim(id, "final", "d".repeat(64), snapshot),
                  Instant.now());
            });
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock(id);
          db.publications.claim(
              id, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
        });
    var verdict =
        C.object()
            .put("schemaVersion", 2)
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString())
            .put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash())
            .put("basisHash", identity.path("basisHash").asText());
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash")) {
      verdict.set(key, hashes.path(key));
    }
    verdict.set("profile", profile);
    verdict.set("build", build);
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock(id);
          db.publications.finish(
              id,
              attempt.attemptId(),
              attempt.claimId(),
              snapshot.hash(),
              PublicationContracts.AttemptStatus.VALIDATED,
              verdict,
              null,
              Instant.now());
        });
    return new PublicationContracts.Commit(
        id,
        UUID.randomUUID(),
        attempt.attemptId(),
        attempt.claimId(),
        "final",
        "d".repeat(64),
        snapshot,
        new PublicationContracts.Candidate(learned, artifact, policy, hashes),
        new PublicationContracts.Grant(
            id, "owner@example.test", "CSI", snapshot.hash(), attempt.validationDeadline()));
  }

  static PublicationContracts.Receipt commit(
      GuidedPublicationMigrationTest.Database db, PublicationContracts.Commit command) {
    return db.tx.execute(
        t -> {
          db.sessions.lock(command.sessionId());
          return db.publications.commit(command, Instant.now());
        });
  }

  static void absent(GuidedPublicationMigrationTest.Database db, String id) {
    assertThat(db.publications.receipt(id)).isEmpty();
    assertThat(
            db.jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_revisions WHERE guided_session_id=?",
                Integer.class,
                id))
        .isZero();
  }

  static CandidateRevision ordinary(GuidedPublicationMigrationTest.Database db) {
    var row =
        db.jdbc.queryForMap(
            "SELECT steps::text,authoring::text,authoring_revision_inputs::text FROM ui_tests WHERE"
                + " id=?",
            db.testId);
    String source = (String) row.get("steps");
    var artifact = C.object().put("version", 1);
    artifact
        .putArray("steps")
        .addObject()
        .put("stepIndex", 0)
        .put("originalText", C.parse(source).get(0).asText())
        .put("code", "await page.goto('https://orders.example.test/start');");
    String referencePolicy =
        new VersionedIntentDeriver()
            .derive(
                "2",
                source,
                (String) row.get("authoring"),
                (String) row.get("authoring_revision_inputs"))
            .referencePolicy();
    return new CandidateRevision(
        1,
        source,
        GuidedContracts.hash(C.parse(source)),
        artifact.toString(),
        GuidedContracts.hash(artifact),
        1,
        "{}",
        "{\"variables\":[],\"secrets\":[]}",
        "{\"intentDerivationVersion\":\"2\"}",
        "owner@example.test",
        referencePolicy,
        "2");
  }

  @Test
  void twoSessionsContendOnActualTestLockOnlyOnePublishes() throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database();
        var threads = Executors.newFixedThreadPool(2)) {
      var second = secondSession(db, "second");
      var firstBase = capture(db, db.session);
      var secondBase = capture(db, second);
      var first = prepared(db, db.session, firstBase);
      var other = prepared(db, second, secondBase);
      var ready = new CountDownLatch(2);
      var start = new CountDownLatch(1);
      var left = threads.submit(() -> race(db, first, ready, start));
      var right = threads.submit(() -> race(db, other, ready, start));
      assertThat(ready.await(3, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      var outcomes = List.of(left.get(8, TimeUnit.SECONDS), right.get(8, TimeUnit.SECONDS));
      assertThat(outcomes).containsExactlyInAnyOrder("PUBLISHED", "PUBLICATION_CONFLICT");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publications", Integer.class))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM ui_test_revisions WHERE publication_kind='GUIDED_RUN'",
                  Integer.class))
          .isEqualTo(1);
      for (var command : List.of(first, other)) {
        String before =
            db.jdbc.queryForObject(
                "SELECT state FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                command.sessionId());
        db.tx.executeWithoutResult(
            t -> {
              db.sessions.lock(command.sessionId());
              db.publications.conflict(
                  command.sessionId(), command.snapshot().hash(), Instant.now());
            });
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT state FROM studio_guided_sessions WHERE session_id=?",
                    String.class,
                    command.sessionId()))
            .isEqualTo(before);
      }
    }
  }

  static String race(
      GuidedPublicationMigrationTest.Database db,
      PublicationContracts.Commit command,
      CountDownLatch ready,
      CountDownLatch start) {
    try {
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock(command.sessionId());
            ready.countDown();
            await(start);
            db.publications.commit(command, Instant.now());
          });
      return "PUBLISHED";
    } catch (GuidedSessionException conflict) {
      assertThat(conflict.getMessage()).isEqualTo("PUBLICATION_CONFLICT");
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock(command.sessionId());
            db.publications.conflict(command.sessionId(), command.snapshot().hash(), Instant.now());
          });
      return conflict.getMessage();
    }
  }

  static void await(CountDownLatch latch) {
    try {
      if (!latch.await(5, TimeUnit.SECONDS)) {
        throw new IllegalStateException("bounded test latch expired");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  @Test
  void olderRealCompilerIsDiscardedAfterGuidedCommitClearsItsPointer() {
    try (var db = new GuidedPublicationMigrationTest.Database();
        var compiler = new Compiler(db)) {
      var request = compiler.tx.execute(t -> compiler.service.beginCompile(db.testId));
      var candidate = ordinary(db);
      var command = prepared(db, db.session, capture(db, db.session));
      var result = commit(db, command);
      assertThat(
              compiler.tx.<PublishResult>execute(
                  t -> compiler.service.publishCandidate(db.testId, request, candidate)))
          .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
      assertThat(
              compiler.tx.<PublishResult>execute(
                  t ->
                      compiler.service.publishError(
                          db.testId, request, "{\"code\":\"GATEWAY_FAILURE\"}")))
          .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
      assertThat(
              db.jdbc
                  .queryForObject(
                      "SELECT confirmed_revision_id FROM ui_tests WHERE id=?",
                      UUID.class,
                      db.testId)
                  .toString())
          .isEqualTo(result.document().path("revisionId").asText());
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT compile_request_id IS NULL FROM ui_tests WHERE id=?",
                  Boolean.class,
                  db.testId))
          .isTrue();
    }
  }

  @Test
  void olderCompilerWinningFirstInvalidatesGuidedBaseWithoutSourceEdit() {
    try (var db = new GuidedPublicationMigrationTest.Database();
        var compiler = new Compiler(db)) {
      var request = compiler.tx.execute(t -> compiler.service.beginCompile(db.testId));
      var command = prepared(db, db.session, capture(db, db.session));
      var candidate = ordinary(db);
      assertThat(
              compiler.tx.<PublishResult>execute(
                  t -> compiler.service.publishCandidate(db.testId, request, candidate)))
          .isEqualTo(PublishResult.PUBLISHED);
      UUID ordinaryHead =
          db.jdbc.queryForObject(
              "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?",
              UUID.class,
              db.testId);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT compile_request_id IS NULL AND publication_kind IS NULL FROM"
                      + " ui_test_revisions WHERE id=?",
                  Boolean.class,
                  ordinaryHead))
          .isTrue();
      assertThatThrownBy(() -> commit(db, command))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessageContaining("PUBLICATION_CONFLICT");
      absent(db, "session");
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock("session");
            db.publications.conflict("session", command.snapshot().hash(), Instant.now());
          });
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT state FROM studio_guided_sessions WHERE session_id='session'",
                  String.class))
          .isEqualTo("PUBLICATION_CONFLICT");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?",
                  UUID.class,
                  db.testId))
          .isEqualTo(ordinaryHead);
    }
  }

  @Test
  void actualCompileAndSweeperProducePointerAbaButEpochStillFences() {
    try (var db = new GuidedPublicationMigrationTest.Database();
        var compiler = new Compiler(db)) {
      var base = capture(db, db.session);
      var command = prepared(db, db.session, base);
      var request = compiler.tx.execute(t -> compiler.service.beginCompile(db.testId));
      db.jdbc.update(
          "UPDATE ui_tests SET compile_started_at=clock_timestamp()-interval '1 hour' WHERE id=?",
          db.testId);
      assertThat(
              compiler.tx.<Integer>execute(
                  t -> compiler.service.sweepAbandoned(Duration.ofSeconds(1), 10)))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT compile_request_id IS NULL AND current_candidate_revision_id IS NULL AND"
                      + " confirmed_revision_id IS NULL FROM ui_tests WHERE id=?",
                  Boolean.class,
                  db.testId))
          .isTrue();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT publication_epoch FROM ui_tests WHERE id=?", Long.class, db.testId))
          .isEqualTo(2);
      assertThatThrownBy(() -> commit(db, command)).hasMessageContaining("PUBLICATION_CONFLICT");
      assertThat(
              compiler.tx.<PublishResult>execute(
                  t -> compiler.service.publishCandidate(db.testId, request, ordinary(db))))
          .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
      absent(db, "session");
    }
  }

  @Test
  void actualManualConfirmationAfterBaseIsANewerHead() {
    try (var db = new GuidedPublicationMigrationTest.Database();
        var compiler = new Compiler(db)) {
      var request = compiler.tx.execute(t -> compiler.service.beginCompile(db.testId));
      var candidate = ordinary(db);
      assertThat(
              compiler.tx.<PublishResult>execute(
                  t -> compiler.service.publishCandidate(db.testId, request, candidate)))
          .isEqualTo(PublishResult.PUBLISHED);
      UUID revision =
          db.jdbc.queryForObject(
              "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?",
              UUID.class,
              db.testId);
      var command = prepared(db, db.session, capture(db, db.session));
      assertThat(
              compiler.tx.<UUID>execute(
                  t ->
                      compiler.service.confirm(
                          db.testId,
                          revision,
                          candidate.artifactHash(),
                          1,
                          1,
                          "owner@example.test")))
          .isEqualTo(revision);
      assertThatThrownBy(() -> commit(db, command)).hasMessageContaining("PUBLICATION_CONFLICT");
      absent(db, "session");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT confirmation_source FROM ui_test_revisions WHERE id=?",
                  String.class,
                  revision))
          .isEqualTo("MANUAL");
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"source", "configuration"})
  void independentSourceWriterFencesAnAlreadyValidatedCandidate(String edit) throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database();
        var executor = Executors.newSingleThreadExecutor()) {
      var command = prepared(db, db.session, capture(db, db.session));
      executor
          .submit(
              () ->
                  db.tx.executeWithoutResult(
                      t -> {
                        db.jdbc.queryForObject(
                            "SELECT id FROM ui_tests WHERE id=? FOR UPDATE", UUID.class, db.testId);
                        if (edit.equals("source")) {
                          db.jdbc.update(
                              "UPDATE ui_tests SET source_revision=source_revision+1 WHERE id=?",
                              db.testId);
                        } else {
                          db.jdbc.update(
                              "UPDATE ui_tests SET"
                                  + " configuration_revision=configuration_revision+1,timeout_seconds=31"
                                  + " WHERE id=?",
                              db.testId);
                        }
                      }))
          .get(5, TimeUnit.SECONDS);
      assertThatThrownBy(() -> commit(db, command)).hasMessageContaining("PUBLICATION_CONFLICT");
      absent(db, "session");
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"cancel", "fence", "lease"})
  void terminalOrChangedAuthorityCannotAdoptOrBeOverwrittenByLateConflict(String change) {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      var command = prepared(db, db.session, capture(db, db.session));
      if (change.equals("cancel")) {
        db.jdbc.update(
            "UPDATE studio_guided_sessions SET"
                + " state='CANCELLED',document=jsonb_set(document,'{state}','\"CANCELLED\"') WHERE"
                + " session_id='session'");
      } else if (change.equals("fence")) {
        db.jdbc.update(
            "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,fence}','2')"
                + " WHERE session_id='session'");
      } else {
        db.jdbc.update(
            "UPDATE studio_guided_sessions SET"
                + " document=jsonb_set(document,'{owner,leaseExpiresAt}','\"2000-01-01T00:00:00.000Z\"')"
                + " WHERE session_id='session'");
      }
      assertThatThrownBy(() -> commit(db, command)).isInstanceOf(GuidedSessionException.class);
      absent(db, "session");
      if (change.equals("cancel")) {
        db.tx.executeWithoutResult(
            t -> {
              db.sessions.lock("session");
              db.publications.conflict("session", command.snapshot().hash(), Instant.now());
            });
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT state FROM studio_guided_sessions WHERE session_id='session'",
                    String.class))
            .isEqualTo("CANCELLED");
      }
    }
  }

  @Test
  void grantExpiringWhileWaitingForTheRealSourceLockRollsBackAllWrites() throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database();
        var threads = Executors.newFixedThreadPool(2)) {
      var original = prepared(db, db.session, capture(db, db.session));
      var command =
          new PublicationContracts.Commit(
              original.sessionId(),
              original.revisionId(),
              original.attemptId(),
              original.claimId(),
              original.finalizeKey(),
              original.finalizeDigest(),
              original.snapshot(),
              original.candidate(),
              new PublicationContracts.Grant(
                  "session",
                  "owner@example.test",
                  "CSI",
                  original.snapshot().hash(),
                  PublicationContracts.millisecond(Instant.now().plusMillis(1000))));
      var locked = new CountDownLatch(1);
      var release = new CountDownLatch(1);
      var attempting = new CountDownLatch(1);
      var blocker =
          threads.submit(
              () ->
                  db.tx.executeWithoutResult(
                      t -> {
                        db.jdbc.queryForObject(
                            "SELECT id FROM ui_tests WHERE id=? FOR UPDATE", UUID.class, db.testId);
                        locked.countDown();
                        await(release);
                      }));
      assertThat(locked.await(2, TimeUnit.SECONDS)).isTrue();
      var backendPid = new java.util.concurrent.atomic.AtomicInteger();
      var publisher =
          threads.submit(
              () ->
                  assertThatThrownBy(
                          () ->
                              db.tx.execute(
                                  t -> {
                                    db.sessions.lock(command.sessionId());
                                    backendPid.set(
                                        db.jdbc.queryForObject(
                                            "SELECT pg_backend_pid()", Integer.class));
                                    attempting.countDown();
                                    return db.publications.commit(command, Instant.now());
                                  }))
                      .isInstanceOf(GuidedSessionException.class));
      assertThat(attempting.await(2, TimeUnit.SECONDS)).isTrue();
      boolean waiting = false;
      long until = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(500);
      while (System.nanoTime() < until && !waiting) {
        waiting =
            Boolean.TRUE.equals(
                db.jdbc.queryForObject(
                    "SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=?",
                    Boolean.class,
                    backendPid.get()));
        if (!waiting) {
          Thread.sleep(10);
        }
      }
      assertThat(waiting).as("actual publisher waits on PostgreSQL source row lock").isTrue();
      Thread.sleep(1100);
      release.countDown();
      blocker.get(3, TimeUnit.SECONDS);
      publisher.get(3, TimeUnit.SECONDS);
      absent(db, "session");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT confirmed_revision_id IS NULL FROM ui_tests WHERE id=?",
                  Boolean.class,
                  db.testId))
          .isTrue();
    }
  }

  @Test
  void sameOwnerRenewalKeepsOriginalClaimAndStillPublishesOnce() {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      var command = prepared(db, db.session, capture(db, db.session));
      db.jdbc.update(
          "UPDATE studio_guided_sessions SET"
              + " document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb(?::text)) WHERE"
              + " session_id='session'",
          PublicationContracts.time(Instant.now().plusSeconds(300)));
      var reused =
          db.tx.execute(
              t -> {
                db.sessions.lock("session");
                return db.publications.reserve(
                    new PublicationContracts.Claim(
                        "session",
                        command.finalizeKey(),
                        command.finalizeDigest(),
                        command.snapshot()),
                    Instant.now());
              });
      assertThat(reused.attemptId()).isEqualTo(command.attemptId());
      assertThat(reused.validationDeadline()).isEqualTo(command.grant().expiresAt());
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_attempts", Integer.class))
          .isEqualTo(1);
      assertThat(commit(db, command).document().path("revisionId").asText())
          .isEqualTo(command.revisionId().toString());
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {"revision_and_confirmation", "receipt", "head", "session", "deferred_commit"})
  void realWriterRollsBackEveryBoundaryAndCanRetryTheSameClaim(String point) {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      var command = prepared(db, db.session, capture(db, db.session));
      db.jdbc.execute(
          "CREATE FUNCTION publication_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN"
              + " RAISE EXCEPTION 'injected publication boundary'; END $$");
      String target;
      String trigger;
      switch (point) {
        case "revision_and_confirmation" -> {
          target = "ui_test_revisions";
          trigger =
              "CREATE TRIGGER publication_test_fault AFTER INSERT ON ui_test_revisions FOR EACH ROW"
                  + " WHEN (NEW.publication_kind='GUIDED_RUN') EXECUTE FUNCTION"
                  + " publication_test_fault()";
        }
        case "receipt" -> {
          target = "studio_guided_publications";
          trigger =
              "CREATE TRIGGER publication_test_fault AFTER INSERT ON studio_guided_publications FOR"
                  + " EACH ROW EXECUTE FUNCTION publication_test_fault()";
        }
        case "head" -> {
          target = "ui_tests";
          trigger =
              "CREATE TRIGGER publication_test_fault AFTER UPDATE ON ui_tests FOR EACH ROW WHEN"
                  + " (NEW.confirmed_revision_id IS DISTINCT FROM OLD.confirmed_revision_id)"
                  + " EXECUTE FUNCTION publication_test_fault()";
        }
        case "session" -> {
          target = "studio_guided_sessions";
          trigger =
              "CREATE TRIGGER publication_test_fault AFTER UPDATE ON studio_guided_sessions FOR"
                  + " EACH ROW WHEN (NEW.state='SUCCEEDED') EXECUTE FUNCTION"
                  + " publication_test_fault()";
        }
        default -> {
          target = "studio_guided_publications";
          trigger =
              "CREATE CONSTRAINT TRIGGER publication_test_fault AFTER INSERT ON"
                  + " studio_guided_publications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE"
                  + " FUNCTION publication_test_fault()";
        }
      }
      db.jdbc.execute(trigger);
      assertThatThrownBy(() -> commit(db, command))
          .hasStackTraceContaining("injected publication boundary");
      absent(db, "session");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT confirmed_revision_id IS NULL AND current_candidate_revision_id IS NULL"
                      + " AND publication_epoch=0 FROM ui_tests WHERE id=?",
                  Boolean.class,
                  db.testId))
          .isTrue();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT state FROM studio_guided_sessions WHERE session_id='session'",
                  String.class))
          .isEqualTo("FINALIZING");
      db.jdbc.execute("DROP TRIGGER publication_test_fault ON " + target);
      var result = commit(db, command);
      assertThat(result.document().path("revisionId").asText())
          .isEqualTo(command.revisionId().toString());
      assertThat(commit(db, command).document()).isEqualTo(result.document());
      assertThat(db.jdbc.queryForObject("SELECT count(*) FROM ui_test_executions", Integer.class))
          .isZero();
    }
  }
}
