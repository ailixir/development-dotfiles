package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Real PostgreSQL writer/lock/fault tests. Original successful learning and validator evidence here
 * is explicitly synthetic relational input; this is not the separately owned browser/Node proof.
 */
class GuidedPublicationRaceTest {
  static final GuidedContracts C = new GuidedContracts();

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
          // V19: the evidence fixture reads the session's immutable governed policy.
          db.jdbc.update(
              "INSERT INTO"
                  + " studio_guided_session_policies(session_id,policy_id,policy_version,"
                  + "observation_policy_hash) SELECT ?,policy_id,policy_version,"
                  + "observation_policy_hash FROM studio_guided_session_policies"
                  + " WHERE session_id='session'",
              id);
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
    db.tx.executeWithoutResult(
        t -> {
          var current = db.sessions.lock(id);
          current.document().put("state", "OBSERVING");
          current
              .document()
              .putObject("owner")
              .put("workerId", "worker")
              .put("fence", 1)
              .put("leaseExpiresAt", PublicationContracts.time(Instant.now().plusSeconds(120)));
          db.sessions.save(current);
        });
    // Complete relational input is synthetic browser evidence, while every immutable row,
    // history join, candidate hash and actual publication writer remains production code.
    var basis =
        com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture.completeExistingSession(
            db.jdbc, db.tx, id, base);
    db.tx.executeWithoutResult(
        t -> {
          var current = db.sessions.lock(id);
          current.document().put("state", "FINALIZING");
          db.sessions.save(current);
        });
    String translationHash = basis.path("translationHash").asText();
    var profile = GuidedPublicationMigrationTest.currentProfile();
    var build = GuidedPublicationMigrationTest.observedBuild(profile);
    var candidate = new ObservedArtifactLowerer(C).lower(basis, profile);
    var learned = candidate.learnedPlan();
    var policy = candidate.policy();
    var artifact = candidate.artifact();
    var hashes = candidate.hashes();
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
            .put("schemaVersion", 3)
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
        candidate,
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
        boolean moved =
            db.tx.execute(
                t -> {
                  db.sessions.lock(command.sessionId());
                  return db.publications.conflict(
                      command.sessionId(), command.snapshot().hash(), Instant.now());
                });
        assertThat(moved).as("a late conflict moves nothing, so it requests no teardown").isFalse();
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
            String before = sessionState(db, command.sessionId());
            boolean moved =
                db.publications.conflict(
                    command.sessionId(), command.snapshot().hash(), Instant.now());
            String after = sessionState(db, command.sessionId());
            assertThat(moved)
                .as("true exactly when this call moved FINALIZING to PUBLICATION_CONFLICT")
                .isEqualTo(before.equals("FINALIZING") && after.equals("PUBLICATION_CONFLICT"));
            if (moved) {
              assertThat(
                      db.jdbc.queryForObject(
                          "SELECT progress->>'errorCode' FROM studio_guided_sessions"
                              + " WHERE session_id=?",
                          String.class,
                          command.sessionId()))
                  .as("the post-claim conflict path records the stable error code")
                  .isEqualTo("PUBLICATION_CONFLICT");
            }
          });
      return conflict.getMessage();
    }
  }

  private static String sessionState(GuidedPublicationMigrationTest.Database db, String id) {
    return db.jdbc.queryForObject(
        "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id);
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
        boolean moved =
            db.tx.execute(
                t -> {
                  db.sessions.lock("session");
                  return db.publications.conflict(
                      "session", command.snapshot().hash(), Instant.now());
                });
        assertThat(moved)
            .as("a cancelled session is not moved, so no teardown is requested")
            .isFalse();
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
                  "SELECT confirmed_revision_id IS NULL AND publication_epoch=0 FROM ui_tests"
                      + " WHERE id=?",
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
