package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.translation.GuidedTranslationMigrationTest.C;
import static com.citi.put.checks.studio.guided.translation.GuidedTranslationMigrationTest.plan;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class GuidedTranslationConcurrencyTest {
  private static final String OBLIGATION = "00000000-0000-4000-8000-000000000101";
  private static final String REPLACEMENT = "00000000-0000-4000-8000-000000000102";

  @Test
  void independentConnectionsSerializeAttemptAndSingleSendWinner() throws Exception {
    try (var db = new GuidedTranslationMigrationTest.Database();
        var threads = Executors.newFixedThreadPool(2)) {
      var doc = db.seed("s");
      db.init(doc);
      CountDownLatch start = new CountDownLatch(1);
      AtomicInteger sends = new AtomicInteger();
      var tasks =
          List.<java.util.concurrent.Callable<Void>>of(
              () -> {
                start.await();
                db.tx.executeWithoutResult(
                    s -> {
                      db.sessions.lock("s");
                      var a =
                          db.store.reserveAttempt(
                              doc,
                              "r",
                              1,
                              "SOURCE_PLAN",
                              "b".repeat(64),
                              0,
                              50,
                              10,
                              "t",
                              Instant.now().plusSeconds(90));
                      if (db.store.claimSend("s", a.attemptId(), "t", Instant.now())) {
                        sends.incrementAndGet();
                      }
                    });
                return null;
              },
              () -> {
                start.await();
                db.tx.executeWithoutResult(
                    s -> {
                      db.sessions.lock("s");
                      var a =
                          db.store.reserveAttempt(
                              doc,
                              "r",
                              1,
                              "SOURCE_PLAN",
                              "b".repeat(64),
                              0,
                              50,
                              10,
                              "t",
                              Instant.now().plusSeconds(90));
                      if (db.store.claimSend("s", a.attemptId(), "t", Instant.now())) {
                        sends.incrementAndGet();
                      }
                    });
                return null;
              });
      var first = threads.submit(tasks.get(0));
      var second = threads.submit(tasks.get(1));
      start.countDown();
      first.get(20, TimeUnit.SECONDS);
      second.get(20, TimeUnit.SECONDS);
      assertThat(sends.get()).isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_model_attempts", Integer.class))
          .isEqualTo(1);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("s");
                        db.store.reserveAttempt(
                            doc,
                            "different",
                            1,
                            "SOURCE_PLAN",
                            "b".repeat(64),
                            0,
                            50,
                            10,
                            "t",
                            Instant.now().plusSeconds(90));
                      }))
          .hasMessageContaining("IDEMPOTENCY_CONFLICT");
    }
  }

  @Test
  void oldAttemptCannotSendOrApplyAfterLeaseGenerationOrPlanChange() {
    try (var db = new GuidedTranslationMigrationTest.Database()) {
      var doc = db.seed("s");
      db.init(doc);
      var a =
          db.tx.execute(
              s -> {
                db.sessions.lock("s");
                return db.store.reserveAttempt(
                    doc,
                    "r",
                    1,
                    "SOURCE_PLAN",
                    "b".repeat(64),
                    0,
                    50,
                    10,
                    "t",
                    Instant.now().plusSeconds(5));
              });
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("s");
            assertThat(
                    db.store.currentAttempt(
                        doc, a.attemptId(), "t", 0, Instant.now().plusSeconds(10)))
                .isFalse();
            db.store.finishAttempt("s", a.attemptId(), "UNKNOWN_CALL", null, null, null);
            assertThat(db.store.claimSend("s", a.attemptId(), "t", Instant.now())).isFalse();
            var next =
                db.store.reserveAttempt(
                    doc,
                    "r",
                    2,
                    "SOURCE_PLAN",
                    "b".repeat(64),
                    0,
                    50,
                    10,
                    "next",
                    Instant.now().plusSeconds(90));
            db.store.acceptPlan("s", 0, plan(OBLIGATION));
            assertThat(db.store.currentAttempt(doc, next.attemptId(), "next", 0, Instant.now()))
                .isFalse();
          });
    }
  }

  @Test
  void obligationReservationRecoversIdentityAndCannotChangeProposalOrDropMeaning() {
    try (var db = new GuidedTranslationMigrationTest.Database()) {
      var doc = db.seed("s");
      db.init(doc);
      var proposal = C.object().put("sessionId", "s");
      proposal.putObject("coordinate").put("stepId", "step").put("ordinal", 0);
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("s");
            db.store.acceptPlan("s", 0, plan(OBLIGATION));
            var first = db.store.reserveObligation(doc, OBLIGATION, proposal);
            assertThat(db.store.reserveObligation(doc, OBLIGATION, proposal)).isEqualTo(first);
          });
      var changed = proposal.deepCopy().put("different", true);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("s");
                        db.store.reserveObligation(doc, OBLIGATION, changed);
                      }))
          .hasMessageContaining("IDEMPOTENCY_CONFLICT");
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("s");
                        db.store.acceptPlan("s", 1, plan(REPLACEMENT));
                      }))
          .hasMessageContaining("IDEMPOTENCY_CONFLICT");
      assertThatThrownBy(() -> db.jdbc.update("DELETE FROM studio_guided_obligation_admissions"))
          .hasMessageContaining("immutable");
    }
  }

  @Test
  void sessionThenSourceLockProducesCoherentSnapshotsWhileAnotherSessionAndEditorRun()
      throws Exception {
    try (var db = new GuidedTranslationMigrationTest.Database();
        var threads = Executors.newFixedThreadPool(3)) {
      var a = db.seed("a");
      var b = db.seed("b");
      db.init(a);
      db.init(b);
      db.jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES"
              + " ('source-owner','owner','source@example.test')");
      db.jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
              + " VALUES ('SOURCE','source','unit','LOW','source@example.test','Development')");
      var testId = java.util.UUID.randomUUID();
      db.jdbc.update(
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by) VALUES"
              + " (?,'source','SOURCE','Development','chromium','[]','source@example.test')",
          testId);
      CountDownLatch sourceHeld = new CountDownLatch(1), release = new CountDownLatch(1);
      var first =
          threads.submit(
              () ->
                  db.tx.execute(
                      s -> {
                        db.sessions.lock("a");
                        var before =
                            db.jdbc.queryForMap(
                                "SELECT source_revision,configuration_revision FROM ui_tests WHERE"
                                    + " id=? FOR UPDATE",
                                testId);
                        sourceHeld.countDown();
                        try {
                          if (!release.await(10, TimeUnit.SECONDS)) {
                            throw new IllegalStateException("test latch timeout");
                          }
                        } catch (InterruptedException e) {
                          Thread.currentThread().interrupt();
                          throw new IllegalStateException(e);
                        }
                        return before;
                      }));
      assertThat(sourceHeld.await(10, TimeUnit.SECONDS)).isTrue();
      var editor =
          threads.submit(
              () ->
                  db.tx.execute(
                      s ->
                          db.jdbc.update(
                              "UPDATE ui_tests SET source_revision=2,configuration_revision=2 WHERE"
                                  + " id=?",
                              testId)));
      var second =
          threads.submit(
              () ->
                  db.tx.execute(
                      s -> {
                        db.sessions.lock("b");
                        return db.jdbc.queryForMap(
                            "SELECT source_revision,configuration_revision FROM ui_tests WHERE id=?"
                                + " FOR UPDATE",
                            testId);
                      }));
      release.countDown();
      var firstView = first.get(20, TimeUnit.SECONDS);
      var secondView = second.get(20, TimeUnit.SECONDS);
      editor.get(20, TimeUnit.SECONDS);
      assertThat(firstView.get("source_revision"))
          .isEqualTo(firstView.get("configuration_revision"));
      assertThat(secondView.get("source_revision"))
          .isEqualTo(secondView.get("configuration_revision"));
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT source_revision FROM ui_tests WHERE id=?", Long.class, testId))
          .isEqualTo(2);
    }
  }
}
