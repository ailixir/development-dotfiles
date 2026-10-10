package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

class GuidedTranslationMigrationTest {
  static final GuidedContracts C = new GuidedContracts();

  /** Each fixture uses a real independent database, including a V31 upgrade with existing rows. */
  static final class Database implements AutoCloseable {
    final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine");
    final DataSource source;
    final JdbcTemplate jdbc;
    final TransactionTemplate tx;
    final GuidedTranslationStore store;
    final GuidedSessionRepository sessions;
    final GuidedClarificationContextStore questions;

    Database() {
      postgres.start();
      source =
          new DriverManagerDataSource(
              postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
      jdbc = new JdbcTemplate(source);
      tx = new TransactionTemplate(new DataSourceTransactionManager(source));
      Flyway.configure()
          .dataSource(source)
          .locations("classpath:db/migration")
          .target("31")
          .load()
          .migrate();
      sessions = new GuidedSessionRepository(jdbc, tx, C);
      store = new GuidedTranslationStore(jdbc, C);
      questions = new GuidedClarificationContextStore(jdbc, C);
      seed("existing");
      Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
    }

    ObjectNode seed(String id) {
      ObjectNode doc =
          C.object()
              .put("sessionId", id)
              .put("testId", UUID.randomUUID().toString())
              .put("scopeHash", "a".repeat(64))
              .put("state", "PROPOSING")
              .put("expiresAt", Instant.now().plusSeconds(600).toString());
      doc.putObject("scope")
          .put("principalId", "user")
          .put("sourceRevision", "1")
          .put("configurationRevision", "1");
      doc.putObject("owner")
          .put("workerId", "worker")
          .put("fence", 1)
          .put("leaseExpiresAt", Instant.now().plusSeconds(300).toString());
      tx.executeWithoutResult(s -> sessions.insert(doc));
      return doc;
    }

    void init(ObjectNode doc) {
      tx.executeWithoutResult(
          s -> {
            sessions.lock(doc.path("sessionId").asText());
            ObjectNode manifest =
                C.object()
                    .put("testId", doc.path("testId").asText())
                    .put("sourceRevision", "1")
                    .put("configurationRevision", "1")
                    .put("policy", "INPUT-POLICY-01-A");
            manifest
                .putArray("sourceSteps")
                .addObject()
                .put("stepId", "step")
                .put("text", "Submit");
            store.initialize(doc, manifest);
          });
    }

    @Override
    public void close() {
      postgres.stop();
    }
  }

  static ObjectNode plan(String obligation) {
    ObjectNode plan = C.object();
    plan.putArray("obligations")
        .addObject()
        .put("obligationId", obligation)
        .put("stepId", "step")
        .put("occurrence", 0)
        .put("operationKind", "click")
        .put("targetIntent", "Submit");
    plan.putArray("needs");
    return plan;
  }

  @Test
  void upgradePreservesRowsAndImmutableScopedConstraints() {
    try (Database db = new Database()) {
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_sessions WHERE session_id='existing'",
                  Integer.class))
          .isEqualTo(1);
      ObjectNode doc = db.seed("s");
      db.init(doc);
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("s");
            db.store.acceptPlan("s", 0, plan("o"));
          });
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_source_manifests SET manifest='{}'::jsonb WHERE"
                          + " session_id='s'"))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_translation_plans SET plan='{}'::jsonb WHERE"
                          + " session_id='s'"))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO"
                          + " studio_guided_translation_plans(session_id,plan_revision,parent_revision,plan,plan_hash)"
                          + " VALUES ('s',2,1,'{}',?)",
                      "a".repeat(64)))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO"
                          + " studio_guided_source_manifests(session_id,scope_hash,manifest,manifest_hash)"
                          + " VALUES ('missing',?,'{}',?)",
                      "a".repeat(64),
                      "b".repeat(64)))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("s");
                        db.store.acceptPlan("s", 1, C.parse("{\"obligations\":[]}"));
                      }))
          .isInstanceOf(Exception.class);
    }
  }

  @Test
  void attemptsAreSingleSendTerminalAndLateUsageDoesNotRevive() {
    try (Database db = new Database()) {
      ObjectNode doc = db.seed("s");
      db.init(doc);
      var attempt =
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
                    "translator",
                    Instant.now().plusSeconds(90));
              });
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("s");
            assertThat(db.store.claimSend("s", attempt.attemptId(), "translator", Instant.now()))
                .isTrue();
            assertThat(db.store.claimSend("s", attempt.attemptId(), "translator", Instant.now()))
                .isFalse();
            assertThat(
                    db.store
                        .reserveAttempt(
                            doc,
                            "r",
                            1,
                            "SOURCE_PLAN",
                            "b".repeat(64),
                            0,
                            50,
                            10,
                            "other",
                            Instant.now().plusSeconds(90))
                        .send())
                .isFalse();
          });
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO"
                          + " studio_guided_model_attempts(session_id,attempt_id,request_id,attempt"
                          + "_number,kind,identity,request_digest,translator_id,lease_until,reserva"
                          + "tion_key,settlement_key,status)"
                          + " SELECT"
                          + " session_id,'duplicate',request_id||'-duplicate',attempt_number,kind,i"
                          + "dentity||jsonb_build_object('attemptId','duplicate','requestId',reques"
                          + "t_id||'-duplicate'),request_digest,translator_id,lease_until,reservati"
                          + "on_key||'-duplicate',settlement_key||'-duplicate','RESERVED'"
                          + " FROM studio_guided_model_attempts"))
          .hasMessageContaining("uq_guided_translation_live_attempt");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO"
                          + " studio_guided_model_attempts(session_id,attempt_id,request_id,attempt"
                          + "_number,kind,identity,request_digest,translator_id,lease_until,reserva"
                          + "tion_key,settlement_key,status)"
                          + " SELECT"
                          + " session_id,'invalid',request_id||'-invalid',attempt_number,kind,'{}':"
                          + ":jsonb,request_digest,translator_id,lease_until,reservation_key||'-inv"
                          + "alid',settlement_key||'-invalid','REJECTED'"
                          + " FROM studio_guided_model_attempts"))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
      db.jdbc.update(
          "UPDATE studio_guided_sessions SET"
              + " state='CANCELLED',document=jsonb_set(document,'{state}','\"CANCELLED\"') WHERE"
              + " session_id='s'");
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("s");
            db.store.recordLateUsage("s", attempt.attemptId(), 75, 8);
            db.store.recordLateUsage("s", attempt.attemptId(), 75, 8);
          });
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("s");
                        db.store.recordLateUsage("s", attempt.attemptId(), 76, 8);
                      }))
          .hasMessageContaining("IDEMPOTENCY_CONFLICT");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT state FROM studio_guided_sessions WHERE session_id='s'", String.class))
          .isEqualTo("CANCELLED");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_model_usage_audit", Integer.class))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT reported_input_tokens FROM studio_guided_model_usage_report",
                  Integer.class))
          .isEqualTo(75);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT reported_output_tokens FROM studio_guided_model_usage_report",
                  Integer.class))
          .isEqualTo(10);
      assertThatThrownBy(
              () -> db.jdbc.update("UPDATE studio_guided_model_usage_audit SET input_tokens=0"))
          .hasMessageContaining("immutable");
    }
  }

  @Test
  void rollbackJoinsAttemptAndReservationAndQuestionAnswerMeaning() {
    try (Database db = new Database()) {
      ObjectNode doc = db.seed("s");
      db.init(doc);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("s");
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
                        db.sessions.command(
                            "s", "model-reserve", "key", "c".repeat(64), C.object());
                        throw new IllegalStateException("crash");
                      }))
          .hasMessageContaining("crash");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_model_attempts", Integer.class))
          .isZero();
      assertThat(
              db.jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands", Integer.class))
          .isZero();
      ObjectNode question =
          C.object()
              .put("sessionId", "s")
              .put("scopeHash", "a".repeat(64))
              .put("clarificationId", "q");
      question.putArray("choices").addObject().put("choiceId", "c");
      var meanings = C.parse("[{\"choiceId\":\"c\",\"meaning\":{\"needId\":\"need\"}}]");
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("s");
            db.questions.create(doc, question, meanings);
          });
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("s");
                        db.questions.accept(doc, "q", "c");
                        throw new IllegalStateException("crash");
                      }))
          .hasMessageContaining("crash");
      assertThatThrownBy(() -> db.tx.execute(s -> db.questions.selected("s", "q")))
          .hasMessageContaining("MISSING_SOURCE");
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("s");
            db.questions.accept(doc, "q", "c");
          });
      assertThat(db.tx.execute(s -> db.questions.selected("s", "q")).path("needId").asText())
          .isEqualTo("need");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_clarification_contexts SET accepted_choice='other'"
                          + " WHERE session_id='s'"))
          .hasMessageContaining("single assignment");
    }
  }

  @Test
  void obligationLinksCommitWithLedgerAndRejectCrossSessionOrWrongMeaning() {
    try (Database db = new Database()) {
      var doc = db.seed("s");
      db.init(doc);
      var proposal = C.object().put("sessionId", "s");
      proposal.putObject("coordinate").put("stepId", "step").put("ordinal", 0);
      var association =
          db.tx.execute(
              s -> {
                db.sessions.lock("s");
                db.store.acceptPlan("s", 0, plan("o"));
                return db.store.reserveObligation(doc, "o", proposal);
              });
      var action =
          C.object()
              .put("sessionId", "s")
              .put("requestDigest", GuidedContracts.hash(proposal))
              .put("dispatchCount", 0)
              .put("state", "ADMITTED");
      action.putObject("admission").put("admissionId", "admission");
      action.set("coordinate", proposal.path("coordinate"));
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("s");
                        db.jdbc.update(
                            "INSERT INTO"
                                + " studio_guided_actions(admission_id,session_id,step_id,ordinal,document,proposal)"
                                + " VALUES ('admission','s','step',0,?::jsonb,?::jsonb)",
                            action.toString(),
                            proposal.toString());
                        db.store.attachAdmission(
                            "s", association.path("admissionKey").asText(), action);
                        throw new IllegalStateException("crash");
                      }))
          .hasMessageContaining("crash");
      assertThat(
              db.jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions", Integer.class))
          .isZero();
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("s");
            assertThat(db.store.obligation("s", "o").path("admissionId").isNull()).isTrue();
            db.jdbc.update(
                "INSERT INTO"
                    + " studio_guided_actions(admission_id,session_id,step_id,ordinal,document,proposal)"
                    + " VALUES ('admission','s','step',0,?::jsonb,?::jsonb)",
                action.toString(),
                proposal.toString());
            db.store.attachAdmission("s", association.path("admissionKey").asText(), action);
            db.store.attachAdmission("s", association.path("admissionKey").asText(), action);
          });
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_obligation_admissions SET admission_id=NULL WHERE"
                          + " session_id='s'"))
          .hasMessageContaining("single assignment");
      assertThat(db.tx.execute(s -> db.store.obligation("s", "o")).path("admissionId").asText())
          .isEqualTo("admission");
    }
  }

  @Test
  void freshDatabaseInstallsAllMigrationsWithNoSyntheticTranslationRows() {
    try (Database db = new Database()) {
      db.jdbc.execute("CREATE DATABASE translation_fresh");
      String url = db.postgres.getJdbcUrl();
      int query = url.indexOf('?');
      String suffix = query < 0 ? "" : url.substring(query);
      String base = query < 0 ? url : url.substring(0, query);
      var fresh =
          new DriverManagerDataSource(
              base.substring(0, base.lastIndexOf('/') + 1) + "translation_fresh" + suffix,
              db.postgres.getUsername(),
              db.postgres.getPassword());
      Flyway.configure().dataSource(fresh).locations("classpath:db/migration").load().migrate();
      assertThat(
              new JdbcTemplate(fresh)
                  .queryForObject(
                      "SELECT count(*) FROM studio_guided_translation_state", Integer.class))
          .isZero();
    }
  }
}
