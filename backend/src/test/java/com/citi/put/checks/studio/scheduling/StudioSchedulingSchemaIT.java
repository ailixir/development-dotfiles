package com.citi.put.checks.studio.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-SCHED-001: real PostgreSQL upgrade, commit integrity, ownership and retained audit.
 *
 * <p>This private database never uses the shared Spring/TC profile: retained identity anchors
 * intentionally reject DELETE and must not contaminate another test class's cleanup fixtures.
 */
@Testcontainers(disabledWithoutDocker = true)
class StudioSchedulingSchemaIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("studio_scheduling_schema")
          .withUsername("test")
          .withPassword("test");
  private static final String CSI = "sched-schema";
  private static final String OTHER_CSI = "sched-other";
  private static final String HUMAN = "sched-schema@citi.com";
  private static final String PRINCIPAL = "schema-background";
  private static final Instant DUE = Instant.parse("2026-10-06T12:00:00Z");
  private static final Instant ACCEPTED = DUE.plusSeconds(1);
  private static final UUID LEGACY_TEST = UUID.randomUUID();
  private static final UUID[] LEGACY_EXECUTIONS = {
    UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()
  };
  private Connection connection;

  @BeforeAll
  static void upgradePopulatedBaseline() throws SQLException {
    POSTGRES.start();
    migrate("25");
    try (Connection baseline = connect()) {
      execute(
          baseline,
          "INSERT INTO users(id,sso_id,name,email,is_active) VALUES(?,?,'Schema owner',?,true)",
          UUID.randomUUID(),
          "schedule-schema",
          HUMAN);
      for (String csi : new String[] {CSI, OTHER_CSI}) {
        execute(
            baseline,
            "INSERT INTO"
                + " csi_systems(id,name,business_unit,criticality,owner_email,environment,status)"
                + " VALUES(?,'Schema CSI','Ops','HIGH',?,'Production','OPERATIONAL')",
            csi,
            HUMAN);
      }
      insertTest(baseline, LEGACY_TEST, CSI);
      execute(
          baseline,
          "UPDATE ui_tests SET schedule=?::jsonb WHERE id=?",
          "{\"cron\":\"ignored\"}",
          LEGACY_TEST);
      String[] codes = {"DISPATCH_UNKNOWN", "START_TIMEOUT", "STALE"};
      for (int index = 0; index < codes.length; index++) {
        execute(
            baseline,
            "INSERT INTO"
                + " ui_test_executions(id,ui_test_id,status,started_at,ended_at,csi_id,error_code) "
                + "VALUES(?,?,'ERROR',?,?,?,?)",
            LEGACY_EXECUTIONS[index],
            LEGACY_TEST,
            ACCEPTED,
            ACCEPTED.plusSeconds(1),
            CSI,
            codes[index]);
        execute(
            baseline,
            "INSERT INTO"
                + " studio_dispatch_ledger(execution_id,execution_accepted_at,test_id,csi_id,state)"
                + " VALUES(?,?,?,?,'DONE')",
            LEGACY_EXECUTIONS[index],
            ACCEPTED,
            LEGACY_TEST,
            CSI);
      }
    }
    migrate("26");
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @BeforeEach
  void begin() throws SQLException {
    connection = connect();
    connection.setAutoCommit(false);
  }

  @AfterEach
  void rollbackAndClose() throws SQLException {
    if (connection != null) {
      connection.rollback();
      connection.close();
    }
  }

  @Test
  void populatedUpgradePreservesLegacyMetadataAndBackfillsOnlyKnownUncertainty()
      throws SQLException {
    assertThat(scalar("SELECT schedule->>'cron' FROM ui_tests WHERE id=?", LEGACY_TEST))
        .isEqualTo("ignored");
    assertThat(scalar("SELECT count(*) FROM studio_schedules WHERE test_id=?", LEGACY_TEST))
        .isEqualTo("0");
    for (UUID id : LEGACY_EXECUTIONS) {
      assertThat(
              scalar(
                  "SELECT terminal_error_code FROM studio_dispatch_ledger WHERE execution_id=?",
                  id))
          .isIn("DISPATCH_UNKNOWN", "START_TIMEOUT", "STALE");
      assertThat(scalar("SELECT trigger_source FROM ui_test_executions WHERE id=?", id)).isNull();
    }
    assertThat(scalar("SELECT success::text FROM flyway_schema_history WHERE version='26'"))
        .isEqualTo("true");
  }

  @Test
  void scheduleAndActivationCannotBorrowAnotherTestsOwnershipOrEnvironment() throws SQLException {
    Fixture f = fixture();
    UUID otherTest = UUID.randomUUID();
    insertTest(connection, otherTest, CSI);
    sqlFails(
        "fk_studio_schedules_test_owner",
        "INSERT INTO studio_schedules(test_id,csi_id,cron_expression,time_zone, "
            + "execution_principal,created_by,updated_by) VALUES(?,?,'0 * * * * *','UTC',?,?,?)",
        otherTest,
        OTHER_CSI,
        PRINCIPAL,
        HUMAN,
        HUMAN);
    sqlFails(
        "confirmed revision and environment",
        "INSERT INTO studio_schedule_activations(schedule_id,test_id,csi_id,schedule_version, "
            + "revision_id,environment,execution_principal,activated_by) "
            + "VALUES(?,?,?,3,?,'UAT',?,?)",
        f.scheduleId(),
        f.testId(),
        CSI,
        f.revisionId(),
        PRINCIPAL,
        HUMAN);
  }

  @Test
  void cleanResumeAuditIsImmutableAndOnePerVersion() throws SQLException {
    Fixture f = fixture();
    sqlFails(
        "immutable retained scheduling audit",
        "UPDATE studio_schedule_activations SET activated_by='replacement' WHERE id=?",
        f.activationId());
    sqlFails(
        "uq_studio_schedule_activations_version",
        activationSql(),
        UUID.randomUUID(),
        f.scheduleId(),
        f.testId(),
        CSI,
        2L,
        f.revisionId(),
        PRINCIPAL,
        "different-author");
    assertThat(
            scalar(
                "SELECT activated_by FROM studio_schedule_activations WHERE id=?",
                f.activationId()))
        .isEqualTo(HUMAN);
  }

  @Test
  void repeatedLocalSlotCannotBeAcceptedAgainAcrossVersionAndOffset() throws SQLException {
    Fixture f = fixture();
    Instant firstOffset = Instant.parse("2026-11-01T05:30:00Z");
    LocalDateTime local = LocalDateTime.parse("2026-11-01T01:30:00");
    occurrence(
        f, UUID.randomUUID(), "SKIPPED", "OVERLAP", firstOffset, local, "America/New_York", -14400);
    UUID nextActivation = UUID.randomUUID();
    execute(
        connection,
        activationSql(),
        nextActivation,
        f.scheduleId(),
        f.testId(),
        CSI,
        3L,
        f.revisionId(),
        PRINCIPAL,
        HUMAN);
    Fixture next = new Fixture(f.testId(), f.revisionId(), f.scheduleId(), nextActivation, 3L);
    Savepoint point = connection.setSavepoint();
    assertThatThrownBy(
            () ->
                occurrence(
                    next,
                    UUID.randomUUID(),
                    "SKIPPED",
                    "OVERLAP",
                    Instant.parse("2026-11-01T06:30:00Z"),
                    local,
                    "America/New_York",
                    -18000))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("local_slot");
    connection.rollback(point);
  }

  @Test
  void acceptedDecisionWithoutActualWorkFailsAtCommit() throws SQLException {
    Fixture f = fixture();
    occurrence(f, UUID.randomUUID(), "ACCEPTED", "ACCEPTED");
    commitFails("exactly one matching ledger/history snapshot");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "test",
        "csi",
        "principal",
        "environment",
        "revision",
        "activation",
        "activation_actor",
        "missing_history"
      })
  void acceptedLinkMustMatchActualImmutableExecutionProvenance(String mismatch)
      throws SQLException {
    Fixture f = fixture();
    UUID occurrence = UUID.randomUUID();
    UUID execution = UUID.randomUUID();
    occurrence(f, occurrence, "ACCEPTED", "ACCEPTED");
    UUID revision = f.revisionId();
    UUID activation = f.activationId();
    if ("revision".equals(mismatch)) {
      revision = fixture().revisionId();
    }
    if ("activation".equals(mismatch)) {
      activation = UUID.randomUUID();
      execute(
          connection,
          activationSql(),
          activation,
          f.scheduleId(),
          f.testId(),
          CSI,
          3L,
          f.revisionId(),
          PRINCIPAL,
          HUMAN);
    }
    if (!"missing_history".equals(mismatch)) {
      history(
          f,
          occurrence,
          execution,
          revision,
          activation,
          "principal".equals(mismatch) ? "other-principal" : PRINCIPAL,
          "environment".equals(mismatch) ? "UAT" : "Production",
          "csi".equals(mismatch) ? OTHER_CSI : CSI,
          "test".equals(mismatch) ? fixture().testId() : f.testId(),
          "activation_actor".equals(mismatch) ? "wrong-human" : null);
    }
    ledger(f, occurrence, execution);
    commitFails("exactly one matching ledger/history snapshot");
  }

  @Test
  void refusalCannotAcquireFakeExecutionEvidence() throws SQLException {
    Fixture f = fixture();
    UUID occurrence = UUID.randomUUID();
    occurrence(f, occurrence, "REFUSED", "COMPILE_REQUIRED");
    history(
        f,
        occurrence,
        UUID.randomUUID(),
        f.revisionId(),
        f.activationId(),
        PRINCIPAL,
        "Production");
    commitFails("unaccepted occurrence cannot own an execution");
  }

  @Test
  void nullableLegacySourceCannotSmuggleScheduledMetadata() throws SQLException {
    Fixture f = fixture();
    UUID occurrence = UUID.randomUUID();
    occurrence(f, occurrence, "REFUSED", "COMPILE_REQUIRED");
    sqlFails(
        "ck_ui_test_executions_trigger_source",
        "INSERT INTO"
            + " ui_test_executions(id,ui_test_id,status,started_at,csi_id,principal,environment,"
            + " revision_id,trigger_source,schedule_id,schedule_version,occurrence_id,scheduled_at,"
            + " activation_id,activated_by,activated_at) SELECT"
            + " ?,?,'PENDING',?,?,?,'Production',?,NULL,?,?,?,?,?,a.activated_by,a.activated_at"
            + " FROM studio_schedule_activations a WHERE a.id=?",
        UUID.randomUUID(),
        f.testId(),
        ACCEPTED,
        CSI,
        PRINCIPAL,
        f.revisionId(),
        f.scheduleId(),
        f.version(),
        occurrence,
        DUE,
        f.activationId(),
        f.activationId());
  }

  @Test
  void scheduledIdentityIsDisjointFromCallerSuppliedManualKeys() throws SQLException {
    Fixture f = fixture();
    UUID occurrence = UUID.randomUUID();
    UUID execution = UUID.randomUUID();
    occurrence(f, occurrence, "ACCEPTED", "ACCEPTED");
    history(f, occurrence, execution, f.revisionId(), f.activationId(), PRINCIPAL, "Production");
    sqlFails(
        "scheduled_identity",
        "INSERT INTO studio_dispatch_ledger(execution_id,execution_accepted_at,test_id,csi_id, "
            + "principal,scheduled_occurrence_id,idempotency_key,request_digest) "
            + "VALUES(?,?,?,?,?,?,?,?)",
        execution,
        ACCEPTED,
        f.testId(),
        CSI,
        PRINCIPAL,
        occurrence,
        occurrence.toString(),
        "digest");
    ledger(f, occurrence, execution);
    execute(
        connection,
        "INSERT INTO studio_dispatch_ledger(execution_id,execution_accepted_at,test_id,csi_id, "
            + "principal,idempotency_key,request_digest) VALUES(?,?,?,?,?,?,?)",
        UUID.randomUUID(),
        ACCEPTED,
        f.testId(),
        CSI,
        PRINCIPAL,
        occurrence.toString(),
        "digest");
    connection.commit();
    assertThat(scalar("SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?", f.testId()))
        .isEqualTo("2");
  }

  @Test
  void pauseMustSettleDeferredWorkInTheSameTransaction() throws SQLException {
    Fixture f = fixture();
    UUID occurrence = UUID.randomUUID();
    deferred(f, occurrence);
    connection.commit();
    execute(
        connection,
        "UPDATE studio_schedules SET state='PAUSED',requested_enabled=false,version=version+1 "
            + "WHERE id=?",
        f.scheduleId());
    commitFails("deferred occurrence cannot be orphaned");
    execute(
        connection,
        "UPDATE studio_schedule_occurrences SET decision='SKIPPED',code='SCHEDULE_PAUSED', "
            + "retry_at=NULL,retry_attempts=0 WHERE id=?",
        occurrence);
    execute(
        connection,
        "UPDATE studio_schedules SET state='PAUSED',requested_enabled=false,version=version+1 "
            + "WHERE id=?",
        f.scheduleId());
    connection.commit();
    assertThat(
            scalar(
                "SELECT (grace_expires_at IS NOT NULL)::text FROM studio_schedule_occurrences WHERE"
                    + " id=?",
                occurrence))
        .isEqualTo("true");
    sqlFails(
        "terminal decision is immutable",
        "UPDATE studio_schedule_occurrences SET decision='DEFERRED',code='PENDING_QUOTA_EXCEEDED', "
            + "retry_at=? WHERE id=?",
        DUE.plusSeconds(5),
        occurrence);
  }

  @Test
  void enabledPointerCannotContradictActivationButPausedEditsKeepHistoricalAttribution()
      throws SQLException {
    Fixture f = fixture();
    connection.commit();
    execute(
        connection,
        "UPDATE studio_schedules SET execution_principal='other' WHERE id=?",
        f.scheduleId());
    commitFails("enabled schedule must match its immutable activation");
    execute(
        connection,
        "UPDATE studio_schedules SET execution_principal='other',state='PAUSED', "
            + "requested_enabled=false,version=3 WHERE id=?",
        f.scheduleId());
    connection.commit();
    assertThat(
            scalar(
                "SELECT execution_principal FROM studio_schedule_activations WHERE id=?",
                f.activationId()))
        .isEqualTo(PRINCIPAL);
    assertThat(
            scalar(
                "SELECT activated_by FROM studio_schedule_activations WHERE id=?",
                f.activationId()))
        .isEqualTo(HUMAN);
  }

  @Test
  void historyPruningKeepsLedgerAuditAndAllowsUncertaintyAcknowledgment() throws SQLException {
    Fixture f = fixture();
    UUID occurrence = UUID.randomUUID();
    UUID execution = UUID.randomUUID();
    occurrence(f, occurrence, "ACCEPTED", "ACCEPTED");
    history(f, occurrence, execution, f.revisionId(), f.activationId(), PRINCIPAL, "Production");
    ledger(f, occurrence, execution);
    connection.commit();
    sqlFails(
        "trigger attribution is immutable",
        "UPDATE ui_test_executions SET trigger_source='MANUAL',schedule_id=NULL, "
            + "schedule_version=NULL,occurrence_id=NULL,scheduled_at=NULL,activation_id=NULL, "
            + "activated_by=NULL,activated_at=NULL WHERE id=?",
        execution);
    execute(
        connection,
        "DELETE FROM ui_test_executions WHERE id=? AND started_at=?",
        execution,
        ACCEPTED);
    execute(
        connection,
        "UPDATE studio_dispatch_ledger SET"
            + " state='DONE',terminal_error_code='STALE',terminal_error_at=? WHERE execution_id=?",
        ACCEPTED.plusSeconds(20),
        execution);
    execute(
        connection,
        "INSERT INTO studio_schedule_uncertainty_ack(schedule_id,execution_id,activation_id, "
            + "acknowledged_by) VALUES(?,?,?,?)",
        f.scheduleId(),
        execution,
        f.activationId(),
        HUMAN);
    connection.commit();
    assertThat(
            scalar(
                "SELECT terminal_error_code FROM studio_dispatch_ledger WHERE execution_id=?",
                execution))
        .isEqualTo("STALE");
    assertThat(
            scalar(
                "SELECT count(*) FROM studio_schedule_uncertainty_ack WHERE execution_id=?",
                execution))
        .isEqualTo("1");
    sqlFails(
        "immutable retained provenance",
        "DELETE FROM studio_dispatch_ledger WHERE execution_id=?",
        execution);
    sqlFails(
        "immutable retained scheduling audit",
        "DELETE FROM studio_schedule_activations WHERE id=?",
        f.activationId());
  }

  @Test
  void occurrenceAndStableAnchorCannotBeErasedOrReidentified() throws SQLException {
    Fixture f = fixture();
    UUID occurrence = UUID.randomUUID();
    occurrence(f, occurrence, "SKIPPED", "OVERLAP");
    sqlFails(
        "nominal identity and provenance are immutable",
        "UPDATE studio_schedule_occurrences SET scheduled_at=? WHERE id=?",
        DUE.plusSeconds(1),
        occurrence);
    sqlFails(
        "identity is retained", "DELETE FROM studio_schedule_occurrences WHERE id=?", occurrence);
    sqlFails("anchor must be retained", "DELETE FROM studio_schedules WHERE id=?", f.scheduleId());
  }

  private Fixture fixture() throws SQLException {
    UUID test = UUID.randomUUID();
    UUID revision = UUID.randomUUID();
    UUID schedule = UUID.randomUUID();
    UUID activation = UUID.randomUUID();
    insertTest(connection, test, CSI);
    execute(
        connection,
        "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,configuration_revision, "
            + "source,source_hash,artifact,artifact_hash,artifact_schema_version,configuration, "
            + "\"references\",provenance,created_by,confirmed_by,confirmed_at) "
            + "VALUES(?,?,?,1,1,'[\"Open\"]'::jsonb,'source','{}'::jsonb,?,1, "
            + "'{\"environment\":\"Production\"}'::jsonb,'{}'::jsonb,'{}'::jsonb,?,?,NOW())",
        revision,
        test,
        CSI,
        revision.toString(),
        HUMAN,
        HUMAN);
    execute(
        connection,
        "INSERT INTO studio_schedules(id,test_id,csi_id,cron_expression,time_zone, "
            + "execution_principal,created_by,updated_by) VALUES(?,?,?,'0 * * * * *','UTC',?,?,?)",
        schedule,
        test,
        CSI,
        PRINCIPAL,
        HUMAN,
        HUMAN);
    execute(
        connection,
        activationSql(),
        activation,
        schedule,
        test,
        CSI,
        2L,
        revision,
        PRINCIPAL,
        HUMAN);
    execute(
        connection,
        "UPDATE studio_schedules SET version=2,state='ENABLED',requested_enabled=true, "
            + "activated_revision_id=?,activation_id=?,next_due_at=?,poll_after_at=? WHERE id=?",
        revision,
        activation,
        DUE,
        DUE,
        schedule);
    return new Fixture(test, revision, schedule, activation, 2L);
  }

  private static String activationSql() {
    return """
           INSERT INTO studio_schedule_activations(id,schedule_id,test_id,csi_id,schedule_version,
             revision_id,environment,execution_principal,activated_by)
           VALUES(?,?,?,?,?,?,'Production',?,?)
           """;
  }

  private void occurrence(Fixture f, UUID id, String decision, String code) throws SQLException {
    occurrence(
        f,
        id,
        decision,
        code,
        DUE,
        LocalDateTime.ofInstant(DUE, java.time.ZoneOffset.UTC),
        "UTC",
        0);
  }

  private void occurrence(
      Fixture f,
      UUID id,
      String decision,
      String code,
      Instant due,
      LocalDateTime local,
      String zone,
      int offset)
      throws SQLException {
    execute(
        connection,
        "INSERT INTO studio_schedule_occurrences(id,schedule_id,schedule_version,test_id,csi_id, "
            + "environment,execution_principal,activation_id,activated_revision_id,scheduled_at, "
            + "local_scheduled_at,time_zone,offset_seconds,decision,code) "
            + "VALUES(?,?,?,?,?,'Production',?,?,?,?,?,?,?,?,?)",
        id,
        f.scheduleId(),
        f.version(),
        f.testId(),
        CSI,
        PRINCIPAL,
        f.activationId(),
        f.revisionId(),
        due,
        local,
        zone,
        offset,
        decision,
        code);
  }

  private void deferred(Fixture f, UUID id) throws SQLException {
    execute(
        connection,
        "UPDATE studio_schedules SET poll_after_at=? WHERE id=?",
        DUE.plusSeconds(5),
        f.scheduleId());
    execute(
        connection,
        "INSERT INTO studio_schedule_occurrences(id,schedule_id,schedule_version,test_id,csi_id,"
            + " environment,execution_principal,activation_id,activated_revision_id,scheduled_at,"
            + " local_scheduled_at,time_zone,offset_seconds,decision,code,retry_at,grace_expires_at)"
            + " VALUES(?,?,?,?,?,'Production',?,?,?,?,?,'UTC',0,'DEFERRED','PENDING_QUOTA_EXCEEDED',?,?)",
        id,
        f.scheduleId(),
        f.version(),
        f.testId(),
        CSI,
        PRINCIPAL,
        f.activationId(),
        f.revisionId(),
        DUE,
        LocalDateTime.ofInstant(DUE, java.time.ZoneOffset.UTC),
        DUE.plusSeconds(5),
        DUE.plusSeconds(300));
  }

  private void history(
      Fixture f,
      UUID occurrence,
      UUID execution,
      UUID revision,
      UUID activation,
      String principal,
      String environment)
      throws SQLException {
    history(
        f,
        occurrence,
        execution,
        revision,
        activation,
        principal,
        environment,
        CSI,
        f.testId(),
        null);
  }

  private void history(
      Fixture f,
      UUID occurrence,
      UUID execution,
      UUID revision,
      UUID activation,
      String principal,
      String environment,
      String csi,
      UUID historicalTest,
      String actorOverride)
      throws SQLException {
    execute(
        connection,
        "INSERT INTO"
            + " ui_test_executions(id,ui_test_id,status,started_at,csi_id,principal,environment,"
            + " revision_id,trigger_source,schedule_id,schedule_version,occurrence_id,scheduled_at,"
            + " activation_id,activated_by,activated_at) SELECT"
            + " ?,?,'PENDING',?,?,?,?,?,'SCHEDULED',?,?,?,?,?,COALESCE(?,a.activated_by),a.activated_at"
            + " FROM studio_schedule_activations a WHERE a.id=?",
        execution,
        historicalTest,
        ACCEPTED,
        csi,
        principal,
        environment,
        revision,
        f.scheduleId(),
        f.version(),
        occurrence,
        DUE,
        activation,
        actorOverride,
        activation);
  }

  private void ledger(Fixture f, UUID occurrence, UUID execution) throws SQLException {
    execute(
        connection,
        "INSERT INTO studio_dispatch_ledger(execution_id,execution_accepted_at,test_id,csi_id, "
            + "principal,scheduled_occurrence_id) VALUES(?,?,?,?,?,?)",
        execution,
        ACCEPTED,
        f.testId(),
        CSI,
        PRINCIPAL,
        occurrence);
  }

  private void sqlFails(String message, String sql, Object... args) throws SQLException {
    Savepoint point = connection.setSavepoint();
    assertThatThrownBy(() -> execute(connection, sql, args))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining(message);
    connection.rollback(point);
  }

  private void commitFails(String message) throws SQLException {
    assertThatThrownBy(connection::commit)
        .isInstanceOf(SQLException.class)
        .hasMessageContaining(message);
    connection.rollback();
  }

  private String scalar(String sql, Object... args) throws SQLException {
    try (PreparedStatement statement = connection.prepareStatement(sql)) {
      bind(statement, args);
      try (ResultSet rows = statement.executeQuery()) {
        assertThat(rows.next()).isTrue();
        return rows.getString(1);
      }
    }
  }

  private static void insertTest(Connection target, UUID id, String csi) throws SQLException {
    execute(
        target,
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by) "
            + "VALUES(?,'Schema test',?,'Production','chromium','[\"Open\"]'::jsonb,'[]'::jsonb,?)",
        id,
        csi,
        HUMAN);
  }

  private static void execute(Connection target, String sql, Object... args) throws SQLException {
    try (PreparedStatement statement = target.prepareStatement(sql)) {
      bind(statement, args);
      statement.executeUpdate();
    }
  }

  private static void bind(PreparedStatement statement, Object... args) throws SQLException {
    for (int index = 0; index < args.length; index++) {
      Object value = args[index];
      if (value instanceof Instant instant) {
        statement.setTimestamp(index + 1, Timestamp.from(instant));
      } else if (value instanceof LocalDateTime local) {
        statement.setTimestamp(index + 1, Timestamp.valueOf(local));
      } else {
        statement.setObject(index + 1, value);
      }
    }
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static void migrate(String target) {
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration")
        .target(target)
        .load()
        .migrate();
  }

  private record Fixture(
      UUID testId, UUID revisionId, UUID scheduleId, UUID activationId, long version) {}
}
