package com.citi.put.checks.studio.guided.secret;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.scheduling.partitioning.PartitionBootstrap;
import com.citi.put.checks.scheduling.partitioning.PartitionHealthIndicator;
import com.citi.put.checks.scheduling.partitioning.PartitionManager;
import com.citi.put.checks.scheduling.partitioning.PartitionScheduler;
import com.citi.put.checks.scheduling.partitioning.RetentionPruner;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.Path;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.Scope;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.UsageOutcome;
import com.citi.put.checks.studio.support.GuidedLedgerSeed;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Real PostgreSQL and actual Java recorder/partition managers; no Vault or browser proof claimed.
 */
class SecretUseAuditIT {
  private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:15-alpine");
  private static final String PRINCIPAL = "owner@example.test";
  private static final String HASH = "a".repeat(64);
  private static final GuidedContracts CONTRACTS = new GuidedContracts();
  private String database;
  private JdbcTemplate jdbc;
  private DriverManagerDataSource source;
  private TransactionTemplate transaction;
  private UUID testId;
  private SecretUseAuditRecorder audit;
  private GuidedLedgerSeed ledger;

  @BeforeAll
  static void start() {
    PG.start();
  }

  @AfterAll
  static void stop() {
    PG.stop();
  }

  @BeforeEach
  void database() {
    database = "audit_service_" + UUID.randomUUID().toString().replace("-", "");
    new JdbcTemplate(admin()).execute("CREATE DATABASE " + database);
    source =
        new DriverManagerDataSource(
            PG.getJdbcUrl().replace(PG.getDatabaseName(), database),
            PG.getUsername(),
            PG.getPassword());
    Flyway.configure().dataSource(source).load().migrate();
    jdbc = new JdbcTemplate(source);
    // The seed writes a minimal preparation proof; the closed-key shape of a proof is not this
    // test's subject (GuidedStepKindMigrationIT covers it), so only that one check is dropped here.
    jdbc.execute(
        "ALTER TABLE studio_guided_preparations DROP CONSTRAINT ck_wi6_preparation_metadata");
    transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    audit = new SecretUseAuditRecorder(jdbc, Clock.systemUTC());
    testId = UUID.randomUUID();
    jdbc.update("INSERT INTO users(sso_id,name,email) VALUES ('owner','owner',?)", PRINCIPAL);
    jdbc.update(
        ("INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,en"
            + "vironment) VALUES ('CSI','test','unit','LOW',?,'Development')"),
        PRINCIPAL);
    jdbc.update(
        ("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by"
            + ") VALUES (?,'test','CSI','Development','chromium','[]',?)"),
        testId,
        PRINCIPAL);
    jdbc.update(
        ("INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope"
            + "_hash,state,expires_at,document) VALUES "
            + "('session',?,?,?,'ACTING',now()+interval '10 "
            + "minutes',jsonb_build_object('owner',jsonb_build_object('fence',1),'scope"
            + "',jsonb_build_object('principalId',?,'csiId','CSI','environmentId','Deve"
            + "lopment'),'sourceSteps',jsonb_build_array(jsonb_build_object('stepId','p"
            + "assword-step'),jsonb_build_object('stepId','login-step'))))"),
        testId.toString(),
        PRINCIPAL,
        HASH,
        PRINCIPAL);
    materialization();
    // V21: the unconsumed admission is written against the live materialization it was prepared
    // for; every guard stays enabled.
    ledger.action(
        "admission",
        "password-step",
        0,
        ledgerDocument("admission", 0, "ADMITTED", 0),
        CONTRACTS.object());
    String manifest =
        "{\"testId\":\""
            + testId
            + ("\",\"sourceRevision\":\"1\",\"configurationRevision\":\"1\","
                + "\"policy\":\"INPUT-POLICY-01-A\",\"sourceSteps\":[{\"stepId"
                + "\":\"password-step\",\"text\":\"Enter"
                + " <secret PASS> as"
                + " password\"},{\"stepId\":\"login-step\",\"text\":\"Sign in with"
                + " <secret PASS>, <secret TOKEN> and <secret EXTRA>\"}],"
                + "\"configurationReferences\":[{\"referenceId\":\"ref-PASS"
                + "\",\"referenceName\":\"PASS\",\"kind\":\"secretRef\",\"stepId\":\"password-step\"}"
                + ",{\"referenceId\":\"ref-PASS-login\",\"referenceName\":\"PASS\",\"kind\":\"secretRef\""
                + ",\"stepId\":\"login-step\"},{\"referenceId\":\"ref-TOKEN-login\",\"referenceName\":\"TOKEN\""
                + ",\"kind\":\"secretRef\",\"stepId\":\"login-step\"},{\"referenceId\":\"ref-EXTRA-login\""
                + ",\"referenceName\":\"EXTRA\",\"kind\":\"secretRef\",\"stepId\":\"login-step\"}]}");
    jdbc.update(
        ("INSERT INTO studio_guided_source_manifests(session_id,scope_hash,manifes"
            + "t,manifest_hash) VALUES ('session',?,?::jsonb,studio_publication_hash(?:"
            + ":jsonb))"),
        HASH,
        manifest,
        manifest);
  }

  @AfterEach
  void cleanup() {
    new JdbcTemplate(admin()).execute("DROP DATABASE " + database + " WITH (FORCE)");
  }

  private static DriverManagerDataSource admin() {
    return new DriverManagerDataSource(PG.getJdbcUrl(), PG.getUsername(), PG.getPassword());
  }

  private Scope guided(String attempt, long releaseSequence, String admission) {
    if (admission == null) {
      return new Scope(
          Path.GUIDED,
          null,
          "session",
          null,
          PRINCIPAL,
          "CSI",
          "Development",
          testId,
          "PASS",
          attempt,
          null,
          "password-step",
          null,
          "ref-PASS");
    }
    return new Scope(
        Path.GUIDED,
        null,
        "session",
        admission,
        PRINCIPAL,
        "CSI",
        "Development",
        testId,
        "PASS",
        attempt,
        releaseSequence,
        "password-step",
        0);
  }

  private Scope consumedScope(String attempt, String admission) {
    return new Scope(
        Path.GUIDED,
        null,
        "session",
        admission,
        PRINCIPAL,
        "CSI",
        "Development",
        testId,
        "PASS",
        attempt,
        null,
        "password-step",
        0,
        "ref-PASS");
  }

  private int count() {
    return jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class);
  }

  @Test
  void auditAndDispatchStateCommitOrRollbackTogetherAndRequireTransaction() {
    consumedSecret("PENDING", false);
    var scope = guided("session:1", 1, "admission");
    assertThatThrownBy(() -> audit.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED))
        .hasMessageContaining("dispatch transaction");
    assertThatThrownBy(
            () ->
                transaction.execute(
                    status -> {
                      jdbc.update(
                          "UPDATE studio_guided_sessions SET state='FAILED' WHERE"
                              + " session_id='session'");
                      audit.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED);
                      throw new IllegalStateException("controlled rollback");
                    }))
        .hasMessageContaining("controlled rollback");
    assertThat(count()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT state FROM studio_guided_sessions WHERE session_id='session'",
                String.class))
        .isEqualTo("ACTING");
    transaction.executeWithoutResult(
        status -> {
          jdbc.update(
              "UPDATE studio_guided_sessions SET state='FAILED' WHERE session_id='session'");
          audit.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED);
        });
    assertThat(count()).isEqualTo(1);
  }

  @Test
  void releaseAndUsageAreIdempotentImmutableScopedMetadata() {
    consumedSecret("PENDING", false);
    var scope = guided("session:1", 1, "admission");
    var release =
        transaction.execute(
            status -> audit.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED));
    SecretUseAuditRecorder.Release repeated =
        transaction.execute(
            status -> audit.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED));
    assertThat(repeated).isEqualTo(release);
    transaction.executeWithoutResult(
        status -> {
          audit.recordUsage(release, UsageOutcome.USED);
          audit.recordUsage(release, UsageOutcome.USED);
        });
    assertThat(count()).isEqualTo(2);
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status -> audit.recordUsage(release, UsageOutcome.NOT_USED)))
        .hasMessageContaining("Conflicting secret audit event");
    assertThatThrownBy(
            () ->
                transaction.execute(
                    status ->
                        audit.recordRelease(
                            scope, "different-version", ResolutionOutcome.RESOLVED)))
        .hasMessageContaining("Conflicting secret audit event");
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_secret_use_audit SET usage_outcome='REFUSED' WHERE"
                        + " row_kind='USAGE'"))
        .hasMessageContaining("append-only");
    assertThatThrownBy(() -> jdbc.update("DELETE FROM studio_secret_use_audit"))
        .hasMessageContaining("append-only");
  }

  @Test
  void unreachedDeclarationHasOnlyOneTerminalNotUsedWithoutRelease() {
    var scope = guided("session:1", 1, null);
    assertThatThrownBy(
            () -> transaction.executeWithoutResult(status -> audit.recordUnreachedGuided(scope)))
        .hasMessageContaining("Invalid secret audit metadata");
    transaction.executeWithoutResult(
        status -> {
          jdbc.update(
              "UPDATE studio_guided_sessions SET state='FAILED' WHERE session_id='session'");
          audit.recordUnreachedGuided(scope);
          audit.recordUnreachedGuided(scope);
        });
    assertThat(count()).isEqualTo(1);
    var row =
        jdbc.queryForMap(
            ("SELECT row_kind,usage_outcome,outcome,release_id,admission_id,vault_vers"
                + "ion FROM studio_secret_use_audit"));
    assertThat(row)
        .containsEntry("row_kind", "USAGE")
        .containsEntry("usage_outcome", "NOT_USED")
        .containsEntry("outcome", null)
        .containsEntry("release_id", null)
        .containsEntry("admission_id", null)
        .containsEntry("vault_version", null);
  }

  @Test
  void concurrentDuplicateWritersProduceOneRelease() throws Exception {
    consumedSecret("PENDING", false);
    var ready = new CountDownLatch(2);
    var go = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var tasks =
          List.of(0, 1).stream()
              .map(
                  n ->
                      pool.submit(
                          () -> {
                            ready.countDown();
                            assertThat(go.await(5, TimeUnit.SECONDS)).isTrue();
                            return transaction.execute(
                                status ->
                                    audit.recordRelease(
                                        guided("session:1", 1, "admission"),
                                        "version1",
                                        ResolutionOutcome.RESOLVED));
                          }))
              .toList();
      assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
      go.countDown();
      assertThat(tasks.get(0).get(10, TimeUnit.SECONDS))
          .isEqualTo(tasks.get(1).get(10, TimeUnit.SECONDS));
      assertThat(count()).isEqualTo(1);
    }
  }

  @Test
  void actualJavaBootstrapHealthSchedulerAndPrunerManageAuditLifecycle() {
    consumedSecret("PENDING", false);
    YearMonth future = YearMonth.now(ZoneOffset.UTC).plusMonths(2);
    String suffix = future.format(DateTimeFormatter.ofPattern("yyyy_MM"));
    jdbc.execute(
        "ALTER TABLE studio_secret_use_audit DETACH PARTITION studio_secret_use_audit_" + suffix);
    jdbc.execute("DROP TABLE studio_secret_use_audit_" + suffix);
    var bootstrap = new PartitionBootstrap(jdbc);
    var metrics = new SimpleMeterRegistry();
    new PartitionScheduler(jdbc, metrics, bootstrap).createFuturePartitions();
    assertThat(
            jdbc.queryForObject(
                "SELECT to_regclass(?) IS NOT NULL",
                Boolean.class,
                "studio_secret_use_audit_" + suffix))
        .isTrue();
    assertThat(new PartitionHealthIndicator(jdbc).health().getStatus().getCode()).isEqualTo("UP");
    var manager = new PartitionManager(jdbc, "studio_secret_use_audit");
    assertThat(manager.countFuturePartitions()).isEqualTo(2);
    YearMonth old = YearMonth.now(ZoneOffset.UTC).minusMonths(13);
    String partition =
        "studio_secret_use_audit_" + old.format(DateTimeFormatter.ofPattern("yyyy_MM"));
    jdbc.execute(
        "CREATE TABLE "
            + partition
            + " PARTITION OF studio_secret_use_audit FOR VALUES FROM ('"
            + old.atDay(1)
            + "') TO ('"
            + old.plusMonths(1).atDay(1)
            + "')");
    Instant at = old.atDay(2).atStartOfDay().toInstant(ZoneOffset.UTC);
    var historical = new SecretUseAuditRecorder(jdbc, Clock.fixed(at, ZoneOffset.UTC));
    var release =
        transaction.execute(
            status ->
                historical.recordRelease(
                    guided("session:1", 1, "admission"), "version1", ResolutionOutcome.RESOLVED));
    transaction.executeWithoutResult(status -> audit.recordUsage(release, UsageOutcome.USED));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM " + partition, Integer.class))
        .isEqualTo(2);
    new RetentionPruner(jdbc, metrics, 12).pruneExpiredPartitions();
    assertThat(jdbc.queryForObject("SELECT to_regclass(?) IS NULL", Boolean.class, partition))
        .isTrue();
    assertThat(count()).isZero();
    assertThat(manager.checkHealth(3).up()).isTrue();
    assertThat(
            metrics
                .get("checks.partitions.pruned_total")
                .tag("table", "studio_secret_use_audit")
                .counter()
                .count())
        .isEqualTo(1);
  }

  @Test
  void leastWriterCanRecordUsageButCannotRewriteOrPrunePartitions() {
    consumedSecret("PENDING", false);
    var release =
        transaction.execute(
            status ->
                audit.recordRelease(
                    guided("session:1", 1, "admission"), "version1", ResolutionOutcome.RESOLVED));
    String role = "audit_writer_" + UUID.randomUUID().toString().replace("-", "");
    jdbc.execute("CREATE ROLE " + role + " NOLOGIN");
    jdbc.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON studio_secret_use_audit TO " + role);
    jdbc.execute(
        ("GRANT SELECT ON studio_guided_sessions,studio_guided_actions,studio_guid"
                + "ed_materializations,studio_guided_materialization_snapshots,studio_guided_"
                + "source_manifests,studio_dispatch_ledger,ui_test_executions,ui_tests TO ")
            + role);
    jdbc.execute("GRANT UPDATE ON studio_guided_sessions,studio_dispatch_ledger TO " + role);
    YearMonth old = YearMonth.now(ZoneOffset.UTC).minusMonths(13);
    String partition =
        "studio_secret_use_audit_" + old.format(DateTimeFormatter.ofPattern("yyyy_MM"));
    jdbc.execute(
        "CREATE TABLE "
            + partition
            + " PARTITION OF studio_secret_use_audit FOR VALUES FROM ('"
            + old.atDay(1)
            + "') TO ('"
            + old.plusMonths(1).atDay(1)
            + "')");
    try {
      transaction.executeWithoutResult(
          status -> {
            jdbc.execute("SET LOCAL ROLE " + role);
            audit.recordUsage(release, UsageOutcome.USED);
          });
      assertThat(count()).isEqualTo(2);
      assertThatThrownBy(
              () ->
                  transaction.executeWithoutResult(
                      status -> {
                        jdbc.execute("SET LOCAL ROLE " + role);
                        jdbc.update("DELETE FROM studio_secret_use_audit");
                      }))
          .hasMessageContaining("append-only");
      assertThatThrownBy(
              () ->
                  transaction.executeWithoutResult(
                      status -> {
                        jdbc.execute("SET LOCAL ROLE " + role);
                        jdbc.execute(
                            "ALTER TABLE studio_secret_use_audit DETACH PARTITION " + partition);
                      }))
          .rootCause()
          .hasMessageContaining("must be owner");
      assertThat(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class, partition))
          .isTrue();
      assertThat(new PartitionManager(jdbc, "studio_secret_use_audit").pruneExpired(12))
          .isEqualTo(1);
    } finally {
      jdbc.execute("DROP OWNED BY " + role);
      jdbc.execute("DROP ROLE " + role);
    }
  }

  private void consumedSecret(String outcome) {
    consumedSecret(outcome, true);
  }

  /**
   * The session's assignment and its one materialization (V21 keeps it as a versioned head, so it
   * is written once, live, before any ledger row). It carries the declared secret input.
   */
  private void materialization() {
    String intent =
        ("{\"sessionId\":\"session\",\"assignmentId\":\"assignment\",\"workerId\":\"worker\",\""
                + "scopeHash\":\"")
            + HASH
            + "\",\"expectedFence\":0}";
    jdbc.update(
        ("INSERT INTO studio_guided_assignments(session_id,assignment_id,scope_has"
            + "h,worker_id,expected_fence,intent) VALUES "
            + "('session','assignment',?,'worker',0,?::jsonb)"),
        HASH,
        intent);
    String inputs =
        "{\"sessionId\":\"session\",\"scopeHash\":\""
            + HASH
            + ("\",\"inputs\":[{\"inputId\":\"input-PASS\",\"sourceStepId\":\"password-step\",\"kind"
                + "\":\"secretRef\",\"secretId\":\"PASS\"},{\"inputId\":\"input-PASS-login\","
                + "\"sourceStepId\":\"login-step\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"},"
                + "{\"inputId\":\"input-TOKEN-login\",\"sourceStepId\":\"login-step\",\"kind\":\"secretRef\","
                + "\"secretId\":\"TOKEN\"},{\"inputId\":\"input-EXTRA-login\",\"sourceStepId\":\"login-step\","
                + "\"kind\":\"secretRef\",\"secretId\":\"EXTRA\"}]}");
    var safeInputs = (ObjectNode) CONTRACTS.parse(inputs);
    for (var rawInput : safeInputs.path("inputs")) {
      var input = (ObjectNode) rawInput;
      input
          .putObject("provenance")
          .put("referenceKind", "configuration")
          .put("configurationRevision", "1")
          .put("referenceId", referenceId(input))
          .put("referenceName", input.path("secretId").asText())
          .put("kind", "secretRef")
          .put("stepId", input.path("sourceStepId").asText());
    }
    ObjectNode closed = GuidedLedgerSeed.closedInputs(safeInputs, "1", "1");
    String inputsHash = GuidedContracts.hash(closed);
    jdbc.update(
        ("INSERT INTO studio_guided_materializations(session_id,scope_hash,context"
            + "_id,context_revision,materialization_revision,worker_id,owner_fence,sour"
            + "ce_revision,configuration_revision,authored_inputs_hash,authored_inputs,"
            + "live) VALUES ('session',?,'context',1,1,'worker',1,'1','1',?,?::jsonb,tr"
            + "ue)"),
        HASH,
        inputsHash,
        closed.toString());
    ledger = new GuidedLedgerSeed(jdbc, "session", "context", 1, inputsHash);
  }

  private static String referenceId(com.fasterxml.jackson.databind.JsonNode input) {
    return "ref-"
        + input.path("secretId").asText()
        + (input.path("sourceStepId").asText().equals("login-step") ? "-login" : "");
  }

  private static ObjectNode ledgerDocument(
      String admission, int ordinal, String state, int dispatchCount) {
    return ledgerDocument("password-step", admission, ordinal, state, dispatchCount);
  }

  private static ObjectNode ledgerDocument(
      String step, String admission, int ordinal, String state, int dispatchCount) {
    ObjectNode document =
        CONTRACTS
            .object()
            .put("sessionId", "session")
            .put("state", state)
            .put("dispatchCount", dispatchCount);
    document.putObject("coordinate").put("stepId", step).put("ordinal", ordinal);
    document.putObject("admission").put("admissionId", admission);
    return document;
  }

  /** A step proposal (ADR-SC-008): opaque frozen code plus what it uses. */
  private static ObjectNode stepProposal(String... secretIds) {
    ObjectNode proposal = CONTRACTS.object();
    String code = "await page.getByLabel('Password').fill(secrets['PASS']);";
    ObjectNode operation = proposal.putObject("operation").put("kind", "step").put("code", code);
    operation.putArray("captures");
    var uses = operation.putArray("uses");
    for (String secret : secretIds) {
      uses.addObject().put("kind", "secret").put("id", secret);
    }
    operation.put("sourceHash", GuidedContracts.hash(operation.path("code")));
    return proposal;
  }

  private static ObjectNode secretFill() {
    return stepProposal("PASS");
  }

  private void consumedSecret(String outcome, boolean terminal) {
    // Replace the not-yet-consumed fixture admission with its immutable authentic source reference.
    ledger.retire("admission");
    ledger.action(
        "admission",
        "password-step",
        0,
        ledgerDocument("admission", 0, "DISPATCHING", 1)
            .put("ownerFence", 1)
            .put("outcomeCode", outcome),
        secretFill());
    if (terminal) {
      jdbc.update("UPDATE studio_guided_sessions SET state='FAILED' WHERE session_id='session'");
    }
  }

  @Test
  void consumedWithoutDecisionIsHonestUnlinkedUncertaintyNeverUnreached() {
    consumedSecret("PENDING");
    Scope scope = consumedScope("session:1", "admission");
    transaction.executeWithoutResult(
        status -> {
          audit.recordConsumedNoDecision(scope, UsageOutcome.UNKNOWN_OUTCOME);
          audit.recordConsumedNoDecision(scope, UsageOutcome.UNKNOWN_OUTCOME);
        });
    assertThat(count()).isEqualTo(1);
    var row =
        jdbc.queryForMap(
            ("SELECT row_kind,usage_outcome,admission_id,outcome,release_id,vault_vers"
                + "ion FROM studio_secret_use_audit"));
    assertThat(row)
        .containsEntry("usage_outcome", "UNKNOWN_OUTCOME")
        .containsEntry("admission_id", "admission")
        .containsEntry("outcome", null)
        .containsEntry("release_id", null)
        .containsEntry("vault_version", null);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_secret_use_audit WHERE row_kind='RELEASE'",
                Integer.class))
        .isZero();
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status -> audit.recordUnreachedGuided(guided("session:1", 1, null))))
        .isInstanceOf(RuntimeException.class);
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status -> audit.recordConsumedNoDecision(scope, UsageOutcome.NOT_USED)))
        .hasMessageContaining("Invalid secret audit metadata");
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status -> audit.recordConsumedNoDecision(scope, UsageOutcome.ACK_LOST)))
        .hasMessageContaining("Conflicting secret audit event");
  }

  @Test
  void consumedScopeRequiresActualAdmissionDeclarationFenceAndAckLossEvidence() {
    consumedSecret("PENDING");
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status ->
                        audit.recordConsumedNoDecision(
                            consumedScope("session:1", "admission"), UsageOutcome.ACK_LOST)))
        .hasMessageContaining("evidence");
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status ->
                        audit.recordConsumedNoDecision(
                            consumedScope("session:2", "admission"), UsageOutcome.UNKNOWN_OUTCOME)))
        .hasMessageContaining("evidence");
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status ->
                        audit.recordConsumedNoDecision(
                            consumedScope("session:1", "missing-admission"),
                            UsageOutcome.UNKNOWN_OUTCOME)))
        .isInstanceOf(RuntimeException.class);
    Scope undeclared =
        new Scope(
            Path.GUIDED,
            null,
            "session",
            "admission",
            PRINCIPAL,
            "CSI",
            "Development",
            testId,
            "UNDECLARED",
            "session:1",
            null,
            "password-step",
            0,
            "ref-UNDECLARED");
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status ->
                        audit.recordConsumedNoDecision(undeclared, UsageOutcome.UNKNOWN_OUTCOME)))
        .hasMessageContaining("declaration");
    jdbc.update(
        ("UPDATE studio_guided_actions SET "
            + "document=jsonb_set(jsonb_set(document,'{state}','\"UNKNOWN_OUTCOME\"'),'{o"
            + "utcomeCode}','\"ACK_LOST\"') WHERE admission_id='admission'"));
    transaction.executeWithoutResult(
        status ->
            audit.recordConsumedNoDecision(
                consumedScope("session:1", "admission"), UsageOutcome.ACK_LOST));
    assertThat(count()).isEqualTo(1);
  }

  @Test
  void committedResolutionCannotBeRelabelledNoDecisionAndLateUnknownPreservesPositive() {
    consumedSecret("PENDING");
    Scope scope = consumedScope("session:1", "admission");
    SecretUseAuditRecorder.Release release =
        transaction.execute(
            status ->
                audit.recordRelease(
                    guided("session:1", 1, "admission"), "version1", ResolutionOutcome.RESOLVED));
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status -> audit.recordConsumedNoDecision(scope, UsageOutcome.UNKNOWN_OUTCOME)))
        .hasMessageContaining("no-decision");
    transaction.executeWithoutResult(
        status -> {
          audit.recordUsage(release, UsageOutcome.USED);
          audit.recordUsage(release, UsageOutcome.UNKNOWN_OUTCOME);
        });
    assertThat(
            jdbc.queryForObject(
                "SELECT usage_outcome FROM studio_secret_use_audit WHERE row_kind='USAGE'",
                String.class))
        .isEqualTo("USED");
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    status -> audit.recordUsage(release, UsageOutcome.NOT_USED)))
        .hasMessageContaining("Conflicting secret audit event");
  }

  @Test
  void mixedKnownAndUnknownReplayUsageKeepsSparseWireSeparateAndRejectsAckWithoutEvidence()
      throws Exception {
    var ids = List.of("USED_ID", "NOT_USED_ID", "REFUSED_ID", "UNKNOWN_ID");
    var statuses =
        List.of(
            UsageOutcome.USED,
            UsageOutcome.NOT_USED,
            UsageOutcome.REFUSED,
            UsageOutcome.UNKNOWN_OUTCOME);
    try (var fixture =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.publishedRetry(
            ids)) {
      var actual = fixture.jdbc();
      var tx = fixture.transaction();
      var recorder = new SecretUseAuditRecorder(actual);
      var statements =
          new com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements(actual);
      assertThat(
              statements.claim(
                  fixture.id(), "worker", Instant.now().plusSeconds(60), Instant.now()))
          .isEqualTo(1);
      var releases = new java.util.ArrayList<SecretUseAuditRecorder.Release>();
      for (String id : ids) {
        var scope =
            new Scope(
                Path.OBSERVED_REPLAY,
                fixture.id(),
                null,
                null,
                PRINCIPAL,
                "CSI",
                "Development",
                fixture.testId(),
                id,
                fixture.original().path("attemptId").asText(),
                1,
                null,
                null);
        releases.add(
            tx.execute(
                status -> recorder.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED)));
      }
      tx.executeWithoutResult(
          status -> {
            for (int n = 0; n < ids.size(); n++) {
              recorder.recordUsage(releases.get(n), statuses.get(n));
            }
            recorder.recordUsage(releases.get(0), UsageOutcome.UNKNOWN_OUTCOME);
          });
      assertThat(
              actual.queryForList(
                  "SELECT usage_outcome FROM studio_secret_use_audit WHERE row_kind='USAGE' ORDER"
                      + " BY secret_id",
                  String.class))
          .containsExactlyInAnyOrder("USED", "NOT_USED", "REFUSED", "UNKNOWN_OUTCOME");
      assertThatThrownBy(
              () ->
                  tx.executeWithoutResult(
                      status -> recorder.recordUsage(releases.get(3), UsageOutcome.ACK_LOST)))
          .hasMessageContaining("Invalid secret audit metadata");
      assertThatThrownBy(
              () ->
                  tx.executeWithoutResult(
                      status -> recorder.recordUsage(releases.get(3), UsageOutcome.NOT_USED)))
          .hasMessageContaining("Conflicting secret audit event");
    }
  }

  @Test
  void concurrentConsumedUnknownWritersAreIdempotentAndCannotInventTwoSummaries() throws Exception {
    consumedSecret("PENDING");
    var ready = new CountDownLatch(2);
    var go = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var tasks =
          List.of(0, 1).stream()
              .map(
                  n ->
                      pool.submit(
                          () -> {
                            ready.countDown();
                            assertThat(go.await(5, TimeUnit.SECONDS)).isTrue();
                            transaction.executeWithoutResult(
                                status ->
                                    audit.recordConsumedNoDecision(
                                        consumedScope("session:1", "admission"),
                                        UsageOutcome.UNKNOWN_OUTCOME));
                            return true;
                          }))
              .toList();
      assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
      go.countDown();
      for (var task : tasks) {
        assertThat(task.get(10, TimeUnit.SECONDS)).isTrue();
      }
      assertThat(count()).isEqualTo(1);
    }
  }

  @Test
  void ordinaryGuidedReleaseRequiresConsumedDeclarationMaterializationAndFence() {
    var valid = guided("session:1", 1, "admission");
    assertThatThrownBy(
            () ->
                transaction.execute(
                    status -> audit.recordRelease(valid, "version1", ResolutionOutcome.RESOLVED)))
        .hasMessageContaining("lineage");
    consumedSecret("PENDING");
    for (var bad :
        List.of(
            guided("invented", 1, "admission"),
            guided("session:2", 1, "admission"),
            new Scope(
                Path.GUIDED,
                null,
                "session",
                "admission",
                PRINCIPAL,
                "CSI",
                "Development",
                testId,
                "UNDECLARED",
                "session:1",
                1,
                "password-step",
                0))) {
      assertThatThrownBy(
              () ->
                  transaction.execute(
                      status -> audit.recordRelease(bad, "version1", ResolutionOutcome.RESOLVED)))
          .hasMessageContaining("lineage");
    }
    var missingAdmission =
        new Scope(
            Path.GUIDED,
            null,
            "session",
            null,
            PRINCIPAL,
            "CSI",
            "Development",
            testId,
            "PASS",
            "session:1",
            1L,
            "password-step",
            0,
            null);
    assertThatThrownBy(
            () ->
                transaction.execute(
                    t ->
                        audit.recordRelease(
                            missingAdmission, "version1", ResolutionOutcome.RESOLVED)))
        .hasMessageContaining("Invalid secret audit metadata");
    UUID raw = UUID.randomUUID();
    assertThatThrownBy(
            () ->
                jdbc.update(
                    ("INSERT INTO studio_secret_use_audit(id,release_id,occurred_at,release_oc"
                        + "curred_at,path,row_kind,decision_stage,attempt_id,release_seq,session_id"
                        + ",principal_id,csi_id,environment,test_id,secret_id,vault_version,coordin"
                        + "ate_step_id,coordinate_ordinal,outcome) VALUES "
                        + "(?,?,now(),now(),'GUIDED','RELEASE','DISPATCH','session:1',1,'session',?"
                        + ",'CSI','Development',?,'PASS','version1','password-step',0,'RESOLVED')"),
                    raw,
                    raw,
                    PRINCIPAL,
                    testId))
        .hasMessageContaining("guided release lineage invalid");
    transaction.executeWithoutResult(
        status -> audit.recordRelease(valid, "version1", ResolutionOutcome.RESOLVED));
    assertThat(count()).isEqualTo(1);
  }

  @Test
  void terminalNoDecisionCannotAcquireContradictoryLateRelease() {
    consumedSecret("PENDING");
    var valid = consumedScope("session:1", "admission");
    transaction.executeWithoutResult(
        status -> audit.recordConsumedNoDecision(valid, UsageOutcome.UNKNOWN_OUTCOME));
    assertThatThrownBy(
            () ->
                transaction.execute(
                    status ->
                        audit.recordRelease(
                            guided("session:1", 1, "admission"),
                            "version1",
                            ResolutionOutcome.RESOLVED)))
        .hasMessageContaining("lineage");
    assertThat(count()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_secret_use_audit WHERE row_kind='RELEASE'",
                Integer.class))
        .isZero();
  }

  @Test
  void rawAndRecorderWritersShareOwnerThenEventOrderWithoutDeadlock() throws Exception {
    consumedSecret("PENDING");
    var scope = guided("session:1", 1, "admission");
    Instant at = Instant.now();
    var fixed = new SecretUseAuditRecorder(jdbc, Clock.fixed(at, ZoneOffset.UTC));
    SecretUseAuditRecorder.Release identity =
        transaction.execute(
            status -> {
              var row = fixed.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED);
              status.setRollbackOnly();
              return row;
            });
    var locked = new CountDownLatch(1);
    var recorderStarted = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var raw =
          pool.submit(
              () -> {
                try (var connection = source.getConnection()) {
                  connection.setAutoCommit(false);
                  try (var statement = connection.createStatement()) {
                    statement.execute("SET LOCAL lock_timeout='5s'");
                    statement.execute("SET LOCAL statement_timeout='8s'");
                    statement.execute(
                        "SELECT session_id FROM studio_guided_sessions WHERE session_id='session'"
                            + " FOR UPDATE");
                    statement.execute(
                        "SELECT"
                            + " pg_advisory_xact_lock(hashtextextended('studio-secret-audit-owner:GUIDED:session',0))");
                    statement.execute(
                        "SELECT pg_advisory_xact_lock(hashtextextended('studio-secret-audit-id:"
                            + identity.id()
                            + "',0))");
                  }
                  locked.countDown();
                  assertThat(recorderStarted.await(5, TimeUnit.SECONDS)).isTrue();
                  try (var insert =
                      connection.prepareStatement(
                          ("INSERT INTO"
                              + " studio_secret_use_audit(id,release_id,occurred_at,release_oc"
                              + "curred_at,path,row_kind,decision_stage,attempt_id,release_seq,session_id"
                              + ",admission_id,principal_id,csi_id,environment,test_id,secret"
                              + "_id,vault_version,coordinate_step_id,coordinate_ordinal,outc"
                              + "ome)"
                              + " VALUES "
                              + "(?,?,?,?,'GUIDED','RELEASE','DISPATCH','session:1',1,'session','admissio"
                              + "n',?,'CSI','Development',?,'PASS','version1','password-step',0,'RESOLVED"
                              + "')"))) {
                    insert.setObject(1, identity.id());
                    insert.setObject(2, identity.id());
                    insert.setTimestamp(3, java.sql.Timestamp.from(at));
                    insert.setTimestamp(4, java.sql.Timestamp.from(at));
                    insert.setString(5, PRINCIPAL);
                    insert.setObject(6, testId);
                    insert.executeUpdate();
                  }
                  connection.commit();
                  return true;
                }
              });
      var managed =
          pool.submit(
              () -> {
                assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
                recorderStarted.countDown();
                return transaction.execute(
                    status -> {
                      jdbc.execute("SET LOCAL lock_timeout='5s'");
                      jdbc.execute("SET LOCAL statement_timeout='8s'");
                      return fixed.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED);
                    });
              });
      assertThat(raw.get(10, TimeUnit.SECONDS)).isTrue();
      assertThat(managed.get(10, TimeUnit.SECONDS)).isEqualTo(identity);
      assertThat(count()).isEqualTo(1);
    }
  }

  @Test
  void authenticUnreachedReferenceHasNoInventedOrdinalSequenceOrPlan() {
    ledger.retire("admission");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_translation_plans", Integer.class))
        .isZero();
    jdbc.update("UPDATE studio_guided_sessions SET state='FAILED' WHERE session_id='session'");
    var real = guided("session:1", 1, null);
    for (var invalid :
        List.of(
            new Scope(
                Path.GUIDED,
                null,
                "session",
                null,
                PRINCIPAL,
                "CSI",
                "Development",
                testId,
                "PASS",
                "session:1",
                null,
                "password-step",
                null,
                "wrong-ref"),
            new Scope(
                Path.GUIDED,
                null,
                "session",
                null,
                PRINCIPAL,
                "CSI",
                "Development",
                testId,
                "PASS",
                "session:2",
                null,
                "password-step",
                null,
                "ref-PASS"),
            new Scope(
                Path.GUIDED,
                null,
                "session",
                null,
                PRINCIPAL,
                "CSI",
                "Development",
                testId,
                "PASS",
                "session:1",
                null,
                "password-step",
                3,
                "ref-PASS"),
            new Scope(
                Path.GUIDED,
                null,
                "session",
                null,
                PRINCIPAL,
                "CSI",
                "Development",
                testId,
                "PASS",
                "session:1",
                1L,
                "password-step",
                null,
                "ref-PASS"))) {
      assertThatThrownBy(
              () -> transaction.executeWithoutResult(t -> audit.recordUnreachedGuided(invalid)))
          .isInstanceOf(RuntimeException.class);
    }
    transaction.executeWithoutResult(t -> audit.recordUnreachedGuided(real));
    var row =
        jdbc.queryForMap(
            ("SELECT source_reference_id,coordinate_ordinal,admission_id,release_seq,o"
                + "utcome,release_id,vault_version FROM studio_secret_use_audit"));
    assertThat(row)
        .containsEntry("source_reference_id", "ref-PASS")
        .containsEntry("coordinate_ordinal", null)
        .containsEntry("admission_id", null)
        .containsEntry("release_seq", null)
        .containsEntry("outcome", null)
        .containsEntry("release_id", null)
        .containsEntry("vault_version", null);
    var future =
        new SecretUseAuditRecorder(
            jdbc, Clock.fixed(Instant.now().plusSeconds(40 * 86400L), ZoneOffset.UTC));
    transaction.executeWithoutResult(t -> future.recordUnreachedGuided(real));
    assertThat(count()).isEqualTo(1);
  }

  private static void claimed(
      com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.RetryFixture
          fixture) {
    var statements =
        new com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements(fixture.jdbc());
    assertThat(
            statements.claim(fixture.id(), "worker", Instant.now().plusSeconds(60), Instant.now()))
        .isEqualTo(1);
  }

  private static com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements auditLedger(
      com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.RetryFixture
          fixture) {
    var statements =
        new com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements(fixture.jdbc());
    statements.installSecretAudit(
        new com.citi.put.checks.studio.secrets.SecretAuditLifecycle(
            fixture.jdbc(), new SecretUseAuditRecorder(fixture.jdbc())));
    return statements;
  }

  private static void commitRefusal(Throwable error, String message) {
    while (error.getCause() != null) {
      error = error.getCause();
    }
    assertThat(error.getMessage()).contains(message);
  }

  @Test
  void positiveReplayAbsenceCommitsOnlyWithWinningNoSendTransition() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.publishedRetry(
            List.of("FIRST", "LATER"))) {
      claimed(f);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      f.transaction()
          .executeWithoutResult(
              t -> recorder.recordObservedReadEntry(f.original(), "worker", "FIRST"));
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t ->
                              recorder.recordObservedNoSend(
                                  f.original(),
                                  "worker",
                                  java.util.Set.of("LATER"),
                                  SecretUseAuditRecorder.NoSendDisposition.CLOSED)))
          .satisfies(e -> commitRefusal(e, "winning atomic owner transition"));
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_no_send_decisions", Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isZero();
      Integer closed =
          f.transaction()
              .execute(
                  t -> {
                    recorder.recordObservedNoSend(
                        f.original(),
                        "worker",
                        java.util.Set.of("LATER"),
                        SecretUseAuditRecorder.NoSendDisposition.CLOSED);
                    return statements.closeWithError(
                        f.id(), "REFERENCE_UNAVAILABLE", Instant.now());
                  });
      assertThat(closed).isEqualTo(1);
      var row =
          f.jdbc()
              .queryForMap(
                  ("SELECT secret_id,usage_outcome,release_seq,outcome,release_id,vault_vers"
                      + "ion,source_reference_id,coordinate_ordinal FROM studio_secret_use_audit "
                      + "WHERE secret_id='LATER'"));
      assertThat(row)
          .containsEntry("secret_id", "LATER")
          .containsEntry("usage_outcome", "NOT_USED")
          .containsEntry("release_seq", null)
          .containsEntry("outcome", null)
          .containsEntry("release_id", null)
          .containsEntry("vault_version", null)
          .containsEntry("source_reference_id", null)
          .containsEntry("coordinate_ordinal", null);
      // Preserve the original positive no-send row; the new terminal winner separately settles the
      // entered ID.
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit WHERE secret_id='FIRST'",
                      String.class))
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_secret_read_entries", Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void readEntryAndScopeAreDurableIdempotentAndCannotCertifyMissingDecisionAsUnused()
      throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      claimed(f);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      for (int call = 0; call < 2; call++) {
        f.transaction()
            .executeWithoutResult(
                t -> recorder.recordObservedReadEntry(f.original(), "worker", "PASS"));
      }
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_secret_read_entries", Integer.class))
          .isEqualTo(1);
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t ->
                              recorder.recordObservedReadEntry(
                                  f.original(), "stale-worker", "PASS")))
          .hasMessageContaining("Invalid secret audit metadata");
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t ->
                              recorder.recordObservedReadEntry(
                                  f.original(), "worker", "UNDECLARED")))
          .hasMessageContaining("undeclared");
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t ->
                              recorder.recordObservedNoSend(
                                  f.original(),
                                  "worker",
                                  java.util.Set.of("PASS"),
                                  SecretUseAuditRecorder.NoSendDisposition.CLOSED)))
          .hasMessageContaining("positive absence contradicted");
      // Prior gate143 zero-summary gap is explicitly superseded by the newly approved terminal
      // proof.
      var statements = auditLedger(f);
      Instant terminalAt = Instant.now();
      Integer closed =
          f.transaction()
              .execute(
                  t -> {
                    assertThat(
                            recorder.recordObservedTerminalSettlement(
                                f.id(), "DISPATCH_UNKNOWN", terminalAt))
                        .isTrue();
                    return statements.closeByReaper(f.id(), "DISPATCH_UNKNOWN", terminalAt);
                  });
      assertThat(closed).isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit", String.class))
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_no_send_decisions", Integer.class))
          .isZero();
      // Database state proof only; B/T4 must join the actual physical read/controller crash
      // counters.
    }
  }

  @Test
  void noSendReceiptAuditAndClosureRollbackTogetherWithoutGrantingRetry() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      claimed(f);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t -> {
                            recorder.recordObservedNoSend(
                                f.original(),
                                "worker",
                                java.util.Set.of("PASS"),
                                SecretUseAuditRecorder.NoSendDisposition.CLOSED);
                            assertThat(
                                    statements.closeWithError(
                                        f.id(), "REFERENCE_UNAVAILABLE", Instant.now()))
                                .isEqualTo(1);
                            throw new IllegalStateException("controlled after-close rollback");
                          }))
          .hasMessageContaining("controlled after-close rollback");
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_no_send_decisions", Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      f.id()))
          .isEqualTo("CLAIMED");
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t -> {
                            recorder.recordObservedNoSend(
                                f.original(),
                                "worker",
                                java.util.Set.of("PASS"),
                                SecretUseAuditRecorder.NoSendDisposition.REQUEUED);
                            assertThat(statements.releaseClaim(f.id())).isEqualTo(1);
                          }))
          .satisfies(e -> commitRefusal(e, "winning atomic owner transition"));
      assertThat(
              f.jdbc()
                  .queryForObject(
                      ("SELECT definite_refusal_attempt_id IS NULL AND"
                          + " zero_send_decision_attempt_id IS NULL FROM studio_dispatch_ledger"
                          + " WHERE execution_id=?"),
                      Boolean.class,
                      f.id()))
          .isTrue();
    }
  }

  @Test
  void emptyCompletedNoSendReceiptStillRequiresActualOwnedClosure() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      claimed(f);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t ->
                              recorder.recordObservedNoSend(
                                  f.original(),
                                  "worker",
                                  java.util.Set.of(),
                                  SecretUseAuditRecorder.NoSendDisposition.CLOSED)))
          .satisfies(e -> commitRefusal(e, "winning atomic owner transition"));
      Integer applied =
          f.transaction()
              .execute(
                  t -> {
                    recorder.recordObservedNoSend(
                        f.original(),
                        "worker",
                        java.util.Set.of(),
                        SecretUseAuditRecorder.NoSendDisposition.CLOSED);
                    return statements.closeWithError(f.id(), "DISPATCH_FAILED", Instant.now());
                  });
      assertThat(applied).isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_no_send_decisions", Integer.class))
          .isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit", String.class))
          .isEqualTo("NOT_USED");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void futureEvidencePartitionsKeepDeferredAndDirectTruncateGuards() {
    var metrics = new SimpleMeterRegistry();
    new PartitionBootstrap(jdbc).bootstrap();
    for (String family :
        List.of(
            "studio_secret_use_audit",
            "studio_observed_secret_read_entries",
            "studio_observed_no_send_decisions",
            "studio_observed_terminal_secret_settlements")) {
      var manager = new PartitionManager(jdbc, family);
      assertThat(manager.ensurePartitions(3)).hasSize(4);
      assertThat(manager.checkHealth(90).up()).isTrue();
      assertThat(
              jdbc.queryForObject(
                  ("SELECT count(*) FROM pg_inherits inheritance JOIN pg_class child ON "
                      + "child.oid=inheritance.inhrelid WHERE inheritance.inhparent=?::regclass "
                      + "AND pg_get_expr(child.relpartbound,child.oid)='DEFAULT'"),
                  Integer.class,
                  family))
          .isZero();
      String leaf =
          family
              + "_"
              + YearMonth.now(ZoneOffset.UTC)
                  .plusMonths(3)
                  .format(DateTimeFormatter.ofPattern("yyyy_MM"));
      assertThatThrownBy(() -> jdbc.execute("TRUNCATE " + leaf))
          .hasMessageContaining("append-only");
      if (family.equals("studio_observed_no_send_decisions")) {
        assertThat(
                jdbc.queryForObject(
                    ("SELECT count(*) FROM pg_trigger WHERE tgrelid=?::regclass AND"
                        + " tgname='tr_observed_no_send_commit' AND tgdeferrable AND"
                        + " tginitdeferred"),
                    Integer.class,
                    leaf))
            .isEqualTo(1);
      }
      if (family.equals("studio_observed_terminal_secret_settlements")) {
        assertThat(
                jdbc.queryForObject(
                    ("SELECT count(*) FROM pg_trigger WHERE tgrelid=?::regclass AND"
                        + " tgname='tr_observed_terminal_commit' AND tgdeferrable AND"
                        + " tginitdeferred"),
                    Integer.class,
                    leaf))
            .isEqualTo(1);
      }
    }
  }

  @Test
  void sameDeclarationCanHaveSeparateRealConsumedCoordinatesWithoutFalseUnused() {
    consumedSecret("PENDING", false);
    var first = guided("session:1", 1, "admission");
    SecretUseAuditRecorder.Release released =
        transaction.execute(
            t -> audit.recordRelease(first, "version1", ResolutionOutcome.RESOLVED));
    transaction.executeWithoutResult(t -> audit.recordUsage(released, UsageOutcome.USED));
    ledger.action(
        "admission-two",
        "password-step",
        1,
        ledgerDocument("admission-two", 1, "DISPATCHING", 1).put("ownerFence", 1),
        secretFill());
    jdbc.update("UPDATE studio_guided_sessions SET state='FAILED' WHERE session_id='session'");
    var second =
        new Scope(
            Path.GUIDED,
            null,
            "session",
            "admission-two",
            PRINCIPAL,
            "CSI",
            "Development",
            testId,
            "PASS",
            "session:1",
            null,
            "password-step",
            1,
            "ref-PASS");
    transaction.executeWithoutResult(
        t -> audit.recordConsumedNoDecision(second, UsageOutcome.UNKNOWN_OUTCOME));
    assertThat(
            jdbc.queryForList(
                ("SELECT usage_outcome FROM studio_secret_use_audit WHERE row_kind='USAGE' "
                    + "ORDER BY coordinate_ordinal"),
                String.class))
        .containsExactly("USED", "UNKNOWN_OUTCOME");
    assertThatThrownBy(
            () ->
                transaction.executeWithoutResult(
                    t -> audit.recordUnreachedGuided(guided("session:1", 1, null))))
        .isInstanceOf(RuntimeException.class);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_secret_use_audit WHERE usage_outcome='NOT_USED'",
                Integer.class))
        .isZero();
  }

  @Test
  void terminalWinnerClassifiesExactUnsettledNoReadAndPossibleReadDeclarations() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.publishedRetry(
            List.of("FIRST", "LATER"))) {
      claimed(f);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      f.transaction()
          .executeWithoutResult(
              t -> recorder.recordObservedReadEntry(f.original(), "worker", "FIRST"));
      Instant ended = Instant.now();
      Integer closed =
          f.transaction()
              .execute(
                  t -> {
                    assertThat(
                            recorder.recordObservedTerminalSettlement(
                                f.id(), "DISPATCH_UNKNOWN", ended))
                        .isTrue();
                    return statements.closeByReaper(f.id(), "DISPATCH_UNKNOWN", ended);
                  });
      assertThat(closed).isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForList(
                      "SELECT secret_id||':'||usage_outcome FROM studio_secret_use_audit ORDER BY"
                          + " secret_id",
                      String.class))
          .containsExactly("FIRST:UNKNOWN_OUTCOME", "LATER:NOT_USED");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      ("SELECT count(*) FROM studio_secret_use_audit WHERE release_id IS NOT NULL"
                          + " OR outcome IS NOT NULL OR release_seq IS NOT NULL OR vault_version"
                          + " IS NOT NULL OR admission_id IS NOT NULL OR source_reference_id IS"
                          + " NOT NULL OR coordinate_step_id IS NOT NULL OR coordinate_ordinal IS"
                          + " NOT NULL"),
                      Integer.class))
          .isZero();
      var proof =
          f.jdbc()
              .queryForMap(
                  ("SELECT before_state,terminal_error_code,terminal_ended_at,disposition "
                      + "FROM studio_observed_terminal_secret_settlements"));
      assertThat(proof)
          .containsEntry("before_state", "CLAIMED")
          .containsEntry("terminal_error_code", "DISPATCH_UNKNOWN")
          .containsEntry("disposition", "CLOSED");
      Boolean duplicate =
          f.transaction()
              .execute(
                  t ->
                      recorder.recordObservedTerminalSettlement(f.id(), "DISPATCH_UNKNOWN", ended));
      assertThat(duplicate).isFalse();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void terminalReceiptRequiresExactActualWinnerCodeTimeAndPhysicalTransaction() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      Instant ended = Instant.now();
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t ->
                              recorder.recordObservedTerminalSettlement(
                                  f.id(), "DISPATCH_FAILED", ended)))
          .satisfies(e -> commitRefusal(e, "exact top-transaction winner and locator"));
      for (boolean wrongCode : List.of(true, false)) {
        assertThatThrownBy(
                () ->
                    f.transaction()
                        .executeWithoutResult(
                            t -> {
                              assertThat(
                                      recorder.recordObservedTerminalSettlement(
                                          f.id(), "DISPATCH_FAILED", ended))
                                  .isTrue();
                              assertThat(
                                      statements.closeWithError(
                                          f.id(),
                                          wrongCode ? "REFERENCE_UNAVAILABLE" : "DISPATCH_FAILED",
                                          wrongCode ? ended : ended.plusSeconds(1)))
                                  .isEqualTo(1);
                            }))
            .satisfies(
                error -> {
                  Throwable cause = error;
                  while (cause.getCause() != null) {
                    cause = cause.getCause();
                  }
                  assertThat(cause).isInstanceOf(org.postgresql.util.PSQLException.class);
                  var postgres = (org.postgresql.util.PSQLException) cause;
                  assertThat(postgres.getSQLState()).isEqualTo("P0001");
                  assertThat(postgres.getServerErrorMessage()).isNotNull();
                  assertThat(postgres.getServerErrorMessage().getMessage())
                      .isEqualTo(
                          "terminal secret settlement authoritative history locator immutable");
                  assertThat(postgres.getServerErrorMessage().getWhere())
                      .contains("studio_observed_terminal_history_update_guard()");
                });
      }
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      f.id()))
          .isEqualTo("QUEUED");
    }
  }

  @Test
  void terminalSettlementPreservesActualLinkedPositiveAndHasNoRetryAuthority() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.publishedRetry(
            List.of("USED_ID", "UNTOUCHED"))) {
      claimed(f);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      var scope =
          new Scope(
              Path.OBSERVED_REPLAY,
              f.id(),
              null,
              null,
              PRINCIPAL,
              "CSI",
              "Development",
              f.testId(),
              "USED_ID",
              f.original().path("attemptId").asText(),
              1,
              null,
              null);
      SecretUseAuditRecorder.Release release =
          f.transaction()
              .execute(t -> recorder.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED));
      f.transaction().executeWithoutResult(t -> recorder.recordUsage(release, UsageOutcome.USED));
      Instant at = Instant.now();
      Integer closed =
          f.transaction()
              .execute(
                  t -> {
                    assertThat(
                            recorder.recordObservedTerminalSettlement(
                                f.id(), "DISPATCH_FAILED", at))
                        .isTrue();
                    return statements.closeWithError(f.id(), "DISPATCH_FAILED", at);
                  });
      assertThat(closed).isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForList(
                      ("SELECT secret_id||':'||usage_outcome FROM studio_secret_use_audit WHERE "
                          + "row_kind='USAGE' ORDER BY secret_id"),
                      String.class))
          .containsExactly("UNTOUCHED:NOT_USED", "USED_ID:USED");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      ("SELECT definite_refusal_attempt_id IS NULL AND"
                          + " zero_send_decision_attempt_id IS NULL FROM studio_dispatch_ledger"
                          + " WHERE execution_id=?"),
                      Boolean.class,
                      f.id()))
          .isTrue();
      assertThat(statements.claim(f.id(), "worker", at.plusSeconds(60), at)).isZero();
    }
  }

  @Test
  void terminalCutRejectsLaterReadReleaseDispatchAndReceiptOnlyRequest() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      claimed(f);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      Instant at = Instant.now();
      for (String operation : List.of("read", "release", "dispatch")) {
        assertThatThrownBy(
                () ->
                    f.transaction()
                        .executeWithoutResult(
                            t -> {
                              assertThat(
                                      recorder.recordObservedTerminalSettlement(
                                          f.id(), "DISPATCH_FAILED", at))
                                  .isTrue();
                              if (operation.equals("read")) {
                                recorder.recordObservedReadEntry(f.original(), "worker", "PASS");
                              } else if (operation.equals("release")) {
                                recorder.recordRelease(
                                    new Scope(
                                        Path.OBSERVED_REPLAY,
                                        f.id(),
                                        null,
                                        null,
                                        PRINCIPAL,
                                        "CSI",
                                        "Development",
                                        f.testId(),
                                        "PASS",
                                        f.original().path("attemptId").asText(),
                                        1,
                                        null,
                                        null),
                                    "version1",
                                    ResolutionOutcome.RESOLVED);
                              } else {
                                statements.beginObservedDispatch(
                                    f.id(),
                                    "worker",
                                    UUID.fromString(f.original().path("attemptId").asText()));
                              }
                            }))
            .isInstanceOf(RuntimeException.class);
      }
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isZero();
    }
  }

  @Test
  void terminalReceiptOwnerHistoryAndSummariesRollbackTogether() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      Instant at = Instant.now();
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t -> {
                            assertThat(
                                    recorder.recordObservedTerminalSettlement(
                                        f.id(), "DISPATCH_FAILED", at))
                                .isTrue();
                            assertThat(statements.closeWithError(f.id(), "DISPATCH_FAILED", at))
                                .isEqualTo(1);
                            throw new IllegalStateException("controlled terminal winner rollback");
                          }))
          .hasMessageContaining("controlled terminal winner rollback");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT status FROM ui_test_executions WHERE id=?", String.class, f.id()))
          .isEqualTo("PENDING");
    }
  }

  @Test
  void terminalSavepointReceiptOrWinnerWritesAreExplicitlyProhibited() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      Instant at = Instant.now();
      for (boolean receiptInside : List.of(true, false)) {
        assertThatThrownBy(
                () ->
                    f.transaction()
                        .executeWithoutResult(
                            t -> {
                              if (receiptInside) {
                                f.jdbc().execute("SAVEPOINT prohibited_receipt");
                              }
                              assertThat(
                                      recorder.recordObservedTerminalSettlement(
                                          f.id(), "DISPATCH_FAILED", at))
                                  .isTrue();
                              if (receiptInside) {
                                f.jdbc().execute("RELEASE SAVEPOINT prohibited_receipt");
                              } else {
                                f.jdbc().execute("SAVEPOINT prohibited_winner");
                              }
                              assertThat(statements.closeWithError(f.id(), "DISPATCH_FAILED", at))
                                  .isEqualTo(1);
                              if (!receiptInside) {
                                f.jdbc().execute("RELEASE SAVEPOINT prohibited_winner");
                              }
                            }))
            .satisfies(e -> commitRefusal(e, "exact top-transaction winner and locator"));
      }
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      f.id()))
          .isEqualTo("QUEUED");
    }
  }

  @Test
  void waitedTerminalCutUsesFreshCommittedReadEntryInsteadOfStaleNoReadView() throws Exception {
    try (var f =
            com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
                .publishedRetry();
        var pool = Executors.newFixedThreadPool(2)) {
      claimed(f);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      var locked = new CountDownLatch(1);
      var started = new CountDownLatch(1);
      var releaseWriter = new CountDownLatch(1);
      var writer =
          pool.submit(
              () -> {
                f.transaction()
                    .executeWithoutResult(
                        t -> {
                          f.jdbc()
                              .queryForList(
                                  "SELECT execution_id FROM studio_dispatch_ledger WHERE"
                                      + " execution_id=? FOR UPDATE",
                                  f.id());
                          locked.countDown();
                          try {
                            assertThat(releaseWriter.await(8, TimeUnit.SECONDS)).isTrue();
                          } catch (InterruptedException e) {
                            throw new IllegalStateException(e);
                          }
                          recorder.recordObservedReadEntry(f.original(), "worker", "PASS");
                        });
                return true;
              });
      var terminal =
          pool.submit(
              () -> {
                assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
                started.countDown();
                Instant at = Instant.now();
                return f.transaction()
                    .execute(
                        t -> {
                          assertThat(
                                  recorder.recordObservedTerminalSettlement(
                                      f.id(), "DISPATCH_UNKNOWN", at))
                              .isTrue();
                          return statements.closeByReaper(f.id(), "DISPATCH_UNKNOWN", at);
                        });
              });
      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);

      class ItsPollSecretterminalrowlock {
        Throwable failure;
        boolean terminal;
        boolean slept;
        boolean initialAwaitTick = true;
        boolean waited;

        boolean step() {
          if (terminal) {
            return true;
          }
          try {
            if (slept && Thread.interrupted()) {
              throw new InterruptedException();
            }

            if (!(System.nanoTime() < until)) {
              terminal = true;
              return true;
            }
            if (f.jdbc()
                    .queryForObject(
                        ("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
                            + "AND pid<>pg_backend_pid() AND wait_event_type='Lock'"),
                        Integer.class)
                > 0) {
              waited = true;
              terminal = true;
              return true;
            }
            if (Thread.interrupted()) {
              throw new InterruptedException();
            }
            slept = true;
            return false;

          } catch (Throwable caught) {
            failure = caught;
            terminal = true;
            return true;
          }
        }
      }
      var itsPoll = new ItsPollSecretterminalrowlock();
      if (!itsPoll.step()) {
        try {
          org.awaitility.Awaitility.await()
              .alias("IT-S Secret-terminal-row-lock")
              .pollInSameThread()
              .dontCatchUncaughtExceptions()
              .pollDelay(java.time.Duration.ZERO)
              .pollInterval(java.time.Duration.ofMillis(20))
              .atMost(java.time.Duration.ofNanos(Math.max(1L, until - System.nanoTime())))
              .until(
                  () -> {
                    if (itsPoll.initialAwaitTick) {
                      itsPoll.initialAwaitTick = false;
                      return false;
                    }
                    return itsPoll.step();
                  });
        } catch (org.awaitility.core.ConditionTimeoutException itsTimeout) {
          // Preserve the original last guard/observation and its assertion/error mapping.
          if (!itsPoll.terminal) {
            itsPoll.step();
          }
        }
      }
      if (itsPoll.failure instanceof Exception exception) {
        throw exception;
      }
      if (itsPoll.failure instanceof Error error) {
        throw error;
      }
      assertThat(itsPoll.waited).isTrue();

      releaseWriter.countDown();
      assertThat(writer.get(10, TimeUnit.SECONDS)).isTrue();
      assertThat(terminal.get(10, TimeUnit.SECONDS)).isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit", String.class))
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      ("SELECT no_read_ids='[]'::jsonb AND possible_read_ids='[\"PASS\"]'::jsonb "
                          + "FROM studio_observed_terminal_secret_settlements"),
                      Boolean.class))
          .isTrue();
    }
  }

  @Test
  void ordinaryRuntimeWriterCanSettleButCannotAlterOrTruncateTerminalEvidence() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      String role = "terminal_writer_" + UUID.randomUUID().toString().replace("-", "");
      f.jdbc().execute("CREATE ROLE " + role + " NOLOGIN");
      f.jdbc().execute("GRANT USAGE ON SCHEMA public TO " + role);
      f.jdbc()
          .execute(
              ("GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON "
                      + "studio_observed_terminal_secret_settlements,studio_secret_use_audit TO ")
                  + role);
      f.jdbc()
          .execute(
              ("GRANT SELECT ON studio_dispatch_ledger,ui_test_executions,ui_test_revisi"
                      + "ons,studio_guided_publications,studio_observed_secret_read_entries,studi"
                      + "o_observed_no_send_decisions TO ")
                  + role);
      f.jdbc().execute("GRANT UPDATE ON studio_dispatch_ledger,ui_test_executions TO " + role);
      var recorder = new SecretUseAuditRecorder(f.jdbc());
      var statements = auditLedger(f);
      Instant at = Instant.now();
      f.transaction()
          .executeWithoutResult(
              t -> {
                f.jdbc().execute("SET LOCAL ROLE " + role);
                assertThat(recorder.recordObservedTerminalSettlement(f.id(), "DISPATCH_FAILED", at))
                    .isTrue();
                assertThat(statements.closeWithError(f.id(), "DISPATCH_FAILED", at)).isEqualTo(1);
              });
      String leaf =
          f.jdbc()
              .queryForObject(
                  "SELECT tableoid::regclass::text FROM"
                      + " studio_observed_terminal_secret_settlements",
                  String.class);
      f.jdbc().execute("GRANT SELECT,UPDATE,DELETE,TRUNCATE ON " + leaf + " TO " + role);
      for (String command :
          List.of(
              "UPDATE studio_observed_terminal_secret_settlements SET disposition='CLOSED'",
              "DELETE FROM studio_observed_terminal_secret_settlements",
              "TRUNCATE studio_observed_terminal_secret_settlements",
              "TRUNCATE " + leaf)) {
        assertThatThrownBy(
                () ->
                    f.transaction()
                        .executeWithoutResult(
                            t -> {
                              f.jdbc().execute("SET LOCAL ROLE " + role);
                              f.jdbc().execute(command);
                            }))
            .hasMessageContaining("append-only");
      }
      // Actual existing row plus narrow synthetic privileges exercise cloned leaf row triggers.
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM " + leaf + " WHERE execution_id=?",
                      Integer.class,
                      f.id()))
          .isEqualTo(1);
      var preserved =
          f.jdbc().queryForMap("SELECT * FROM " + leaf + " WHERE execution_id=?", f.id());
      for (String directMutation :
          List.of(
              "UPDATE " + leaf + " SET disposition='CLOSED' WHERE execution_id=?",
              "DELETE FROM " + leaf + " WHERE execution_id=?")) {
        assertThatThrownBy(
                () ->
                    f.transaction()
                        .executeWithoutResult(
                            t -> {
                              f.jdbc().execute("SET LOCAL ROLE " + role);
                              f.jdbc().update(directMutation, f.id());
                            }))
            .satisfies(
                error -> {
                  Throwable cause = error;
                  while (cause.getCause() != null) {
                    cause = cause.getCause();
                  }
                  assertThat(cause).isInstanceOf(org.postgresql.util.PSQLException.class);
                  assertThat(((org.postgresql.util.PSQLException) cause).getSQLState())
                      .isEqualTo("P0001");
                  assertThat(cause.getMessage()).contains("append-only");
                });
        assertThat(f.jdbc().queryForMap("SELECT * FROM " + leaf + " WHERE execution_id=?", f.id()))
            .isEqualTo(preserved);
      }
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t -> {
                            f.jdbc().execute("SET LOCAL ROLE " + role);
                            f.jdbc()
                                .execute(
                                    "ALTER TABLE studio_observed_terminal_secret_settlements DETACH"
                                        + " PARTITION "
                                        + leaf);
                          }))
          .satisfies(
              error -> {
                Throwable cause = error;
                while (cause.getCause() != null) {
                  cause = cause.getCause();
                }
                assertThat(cause).isInstanceOf(org.postgresql.util.PSQLException.class);
                var postgres = (org.postgresql.util.PSQLException) cause;
                assertThat(postgres.getSQLState()).isEqualTo("42501");
                assertThat(postgres.getServerErrorMessage()).isNotNull();
                assertThat(postgres.getServerErrorMessage().getMessage())
                    .isEqualTo(
                        "must be owner of table studio_observed_terminal_secret_settlements");
              });
      f.jdbc().execute("DROP OWNED BY " + role);
      f.jdbc().execute("DROP ROLE " + role);
    }
  }

  @Test
  void terminalReceiptAndUnlinkedSummaryExpireInTheSameRetentionMonth() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      YearMonth old = YearMonth.now(ZoneOffset.UTC).minusMonths(13);
      for (String family :
          List.of("studio_observed_terminal_secret_settlements", "studio_secret_use_audit")) {
        String leaf = family + "_" + old.format(DateTimeFormatter.ofPattern("yyyy_MM"));
        f.jdbc()
            .execute(
                "CREATE TABLE "
                    + leaf
                    + " PARTITION OF "
                    + family
                    + " FOR VALUES FROM ('"
                    + old.atDay(1)
                    + "') TO ('"
                    + old.plusMonths(1).atDay(1)
                    + "')");
        f.jdbc()
            .queryForObject(
                "SELECT studio_secret_install_partition_guards(?,?)", Object.class, family, leaf);
      }
      Instant historical = old.atDay(2).atStartOfDay().toInstant(ZoneOffset.UTC),
          ended = Instant.now();
      var recorder = new SecretUseAuditRecorder(f.jdbc(), Clock.fixed(historical, ZoneOffset.UTC));
      var statements = auditLedger(f);
      f.transaction()
          .executeWithoutResult(
              t -> {
                assertThat(
                        recorder.recordObservedTerminalSettlement(f.id(), "DISPATCH_FAILED", ended))
                    .isTrue();
                assertThat(statements.closeWithError(f.id(), "DISPATCH_FAILED", ended))
                    .isEqualTo(1);
              });
      assertThat(
              f.jdbc()
                  .queryForObject(
                      ("SELECT date_trunc('month',occurred_at)=?::timestamp FROM "
                          + "studio_observed_terminal_secret_settlements"),
                      Boolean.class,
                      old.atDay(1).toString()))
          .isTrue();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT date_trunc('month',release_occurred_at)=?::timestamp FROM"
                          + " studio_secret_use_audit",
                      Boolean.class,
                      old.atDay(1).toString()))
          .isTrue();
      new RetentionPruner(f.jdbc(), new SimpleMeterRegistry(), 12).pruneExpiredPartitions();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isZero();
    }
  }

  @Test
  void earlyConstraintFlushCannotPermitLaterTerminalCauseTimeOrSnapshotMismatch() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      var statements = auditLedger(f);
      for (String flush :
          List.of(
              "SET CONSTRAINTS ALL IMMEDIATE",
              "SET CONSTRAINTS tr_observed_terminal_commit IMMEDIATE")) {
        for (String mutation :
            List.of(
                "error_code='DISPATCH_UNKNOWN'",
                "ended_at=ended_at+interval '1 second'",
                "snapshot_revision=snapshot_revision+1")) {
          assertThatThrownBy(
                  () ->
                      f.transaction()
                          .executeWithoutResult(
                              t -> {
                                assertThat(
                                        statements.closeWithError(
                                            f.id(), "DISPATCH_FAILED", Instant.now()))
                                    .isEqualTo(1);
                                f.jdbc().execute(flush);
                                f.jdbc()
                                    .update(
                                        "UPDATE ui_test_executions SET " + mutation + " WHERE id=?",
                                        f.id());
                              }))
              .satisfies(
                  error ->
                      commitRefusal(
                          error,
                          mutation.startsWith("snapshot")
                              ? "exact top-transaction winner and locator"
                              : "authoritative history locator immutable"));
          assertThat(
                  f.jdbc()
                      .queryForObject(
                          "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                          Integer.class))
              .isZero();
          assertThat(
                  f.jdbc()
                      .queryForObject(
                          "SELECT count(*) FROM studio_secret_use_audit", Integer.class))
              .isZero();
          assertThat(
                  f.jdbc()
                      .queryForObject(
                          "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                          String.class,
                          f.id()))
              .isEqualTo("QUEUED");
        }
      }
    }
  }

  @Test
  void committedTerminalCutAllowsLaterGenuineEvidenceMetadataWithoutChangingItsWinner()
      throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      var statements = auditLedger(f);
      assertThat(statements.closeWithError(f.id(), "DISPATCH_FAILED", Instant.now())).isEqualTo(1);
      var before =
          f.jdbc()
              .queryForMap(
                  "SELECT status,error_code,ended_at,snapshot_revision FROM ui_test_executions"
                      + " WHERE id=?",
                  f.id());
      f.transaction()
          .executeWithoutResult(
              t -> {
                assertThat(
                        f.jdbc()
                            .update(
                                ("UPDATE ui_test_executions SET"
                                    + " video_status='FAILED',video_error='controlled redacted"
                                    + " evidence diagnostic',snapshot_revision=snapshot_revision+1"
                                    + " WHERE id=?"),
                                f.id()))
                    .isEqualTo(1);
              });
      var after =
          f.jdbc()
              .queryForMap(
                  ("SELECT status,error_code,ended_at,snapshot_revision,video_status,video_e"
                      + "rror FROM ui_test_executions WHERE id=?"),
                  f.id());
      assertThat(after)
          .containsEntry("status", before.get("status"))
          .containsEntry("error_code", before.get("error_code"))
          .containsEntry("ended_at", before.get("ended_at"))
          .containsEntry("video_status", "FAILED");
      assertThat(((Number) after.get("snapshot_revision")).longValue())
          .isEqualTo(((Number) before.get("snapshot_revision")).longValue() + 1);
      assertThatThrownBy(
              () ->
                  f.jdbc()
                      .update(
                          "UPDATE ui_test_executions SET error_code='DISPATCH_UNKNOWN' WHERE id=?",
                          f.id()))
          .hasMessageContaining("authoritative history locator immutable");
      assertThatThrownBy(
              () ->
                  f.jdbc()
                      .update(
                          "UPDATE ui_test_executions SET snapshot_revision=snapshot_revision-1"
                              + " WHERE id=?",
                          f.id()))
          .hasMessageContaining("committed metadata snapshot cannot regress");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void earlyFlushCannotHideLaterSubtransactionWinnerVersion() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      var statements = auditLedger(f);
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t -> {
                            assertThat(
                                    statements.closeWithError(
                                        f.id(), "DISPATCH_FAILED", Instant.now()))
                                .isEqualTo(1);
                            f.jdbc().execute("SET CONSTRAINTS ALL IMMEDIATE");
                            f.jdbc().execute("SAVEPOINT later_authoritative_write");
                            f.jdbc()
                                .update(
                                    "UPDATE ui_test_executions SET video_status='FAILED' WHERE"
                                        + " id=?",
                                    f.id());
                            f.jdbc().execute("RELEASE SAVEPOINT later_authoritative_write");
                          }))
          .satisfies(error -> commitRefusal(error, "exact top-transaction winner and locator"));
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      f.id()))
          .isEqualTo("QUEUED");
    }
  }

  private static boolean invokeProductionPartition(PartitionManager manager, YearMonth month) {
    try {
      var method = PartitionManager.class.getDeclaredMethod("ensurePartition", YearMonth.class);
      method.setAccessible(true);
      return (Boolean) method.invoke(manager, month);
    } catch (java.lang.reflect.InvocationTargetException error) {
      if (error.getCause() instanceof RuntimeException cause) {
        throw cause;
      }
      throw new IllegalStateException(error.getCause());
    } catch (ReflectiveOperationException error) {
      throw new IllegalStateException(error);
    }
  }

  private static void assertTerminalLeafGuards(JdbcTemplate jdbc, String leaf) {
    assertThat(
            jdbc.queryForObject(
                ("SELECT count(*) FROM pg_trigger WHERE tgrelid=?::regclass AND "
                    + "tgname='tr_observed_terminal_commit' AND tgdeferrable AND tginitdeferred"),
                Integer.class,
                leaf))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                ("SELECT count(*) FROM pg_trigger WHERE tgrelid=?::regclass AND "
                    + "tgname='tr_secret_evidence_leaf_truncate'"),
                Integer.class,
                leaf))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT pg_get_expr(relpartbound,oid)='DEFAULT' FROM pg_class WHERE"
                    + " oid=?::regclass",
                Boolean.class,
                leaf))
        .isFalse();
  }

  @Test
  void actualProductionPartitionPublishesAllGuardsAtomicallyWithOrWithoutOuterTransaction()
      throws Exception {
    for (boolean outer : List.of(false, true)) {
      try (var f =
              com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
                  .publishedRetry();
          var pool = Executors.newSingleThreadExecutor()) {
        String parent = "studio_observed_terminal_secret_settlements",
            role = "atomic_leaf_writer_" + UUID.randomUUID().toString().replace("-", "");
        YearMonth month = YearMonth.now(ZoneOffset.UTC).plusMonths(4);
        String leaf = parent + "_" + month.format(DateTimeFormatter.ofPattern("yyyy_MM"));
        f.jdbc().execute("CREATE ROLE " + role + " NOLOGIN");
        f.jdbc().execute("GRANT USAGE ON SCHEMA public TO " + role);
        f.jdbc().execute("GRANT SELECT,INSERT ON " + parent + " TO " + role);
        f.jdbc()
            .execute(
                ("GRANT SELECT ON studio_dispatch_ledger,ui_test_executions,ui_test_revisi"
                        + "ons,studio_secret_use_audit,studio_observed_secret_read_entries TO ")
                    + role);
        f.jdbc().execute("GRANT UPDATE ON studio_dispatch_ledger,ui_test_executions TO " + role);
        var row =
            com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
                .terminalRow(f, month.atDay(2).atStartOfDay().toInstant(ZoneOffset.UTC));
        var executed = new CountDownLatch(1);
        var publish = new CountDownLatch(1);
        var managerJdbc =
            new JdbcTemplate(f.jdbc().getDataSource()) {
              @Override
              public void execute(String sql) {
                super.execute(sql);
                assertThat(
                        org.springframework.transaction.support.TransactionSynchronizationManager
                            .isActualTransactionActive())
                    .isEqualTo(outer);
                executed.countDown();
                try {
                  assertThat(publish.await(10, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException error) {
                  Thread.currentThread().interrupt();
                  throw new IllegalStateException(error);
                }
              }
            };
        var manager = new PartitionManager(managerJdbc, parent);
        var creator =
            pool.submit(
                () ->
                    outer
                        ? f.transaction().execute(t -> invokeProductionPartition(manager, month))
                        : invokeProductionPartition(manager, month));
        try {
          assertThat(executed.await(10, TimeUnit.SECONDS)).isTrue();
          if (outer) {
            assertThat(
                    f.jdbc().queryForObject("SELECT to_regclass(?) IS NULL", Boolean.class, leaf))
                .isTrue();
          } else {
            assertTerminalLeafGuards(f.jdbc(), leaf);
          }
        } finally {
          publish.countDown();
        }
        assertThat(creator.get(15, TimeUnit.SECONDS)).isTrue();
        assertTerminalLeafGuards(f.jdbc(), leaf);
        assertThatThrownBy(
                () ->
                    f.transaction()
                        .executeWithoutResult(
                            t -> {
                              f.jdbc().execute("SET LOCAL ROLE " + role);
                              com.citi.put.checks.studio.guided.publication
                                  .GuidedSecretLoginMigrationTest.insertTerminal(f, row);
                            }))
            .satisfies(error -> commitRefusal(error, "exact top-transaction winner and locator"));
        assertThat(f.jdbc().queryForObject("SELECT count(*) FROM " + parent, Integer.class))
            .isZero();
        assertThat(
                f.jdbc()
                    .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
            .isZero();
        assertThatThrownBy(() -> f.jdbc().execute("TRUNCATE " + leaf))
            .hasMessageContaining("append-only");
        f.jdbc().execute("DROP OWNED BY " + role);
        f.jdbc().execute("DROP ROLE " + role);
      }
    }
  }

  @Test
  void productionPartitionFailureRollsBackNewAttachmentAndAllApplicableGuards() throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      String parent = "studio_observed_terminal_secret_settlements";
      YearMonth month = YearMonth.now(ZoneOffset.UTC).plusMonths(4);
      String leaf = parent + "_" + month.format(DateTimeFormatter.ofPattern("yyyy_MM"));
      var failingJdbc =
          new JdbcTemplate(f.jdbc().getDataSource()) {
            @Override
            public void execute(String sql) {
              // Real PostgreSQL exception after authentic guard installation, before the same DO
              // commits.
              String failing =
                  sql.replaceAll(
                      "(PERFORM studio_secret_install_partition_guards\\([^;]*\\);)",
                      "$1\nRAISE EXCEPTION 'controlled partition publication failure';");
              assertThat(failing).isNotEqualTo(sql);
              super.execute(failing);
            }
          };
      assertThatThrownBy(
              () -> invokeProductionPartition(new PartitionManager(failingJdbc, parent), month))
          .hasMessageContaining("controlled partition publication failure");
      assertThat(f.jdbc().queryForObject("SELECT to_regclass(?) IS NULL", Boolean.class, leaf))
          .isTrue();
      assertThat(invokeProductionPartition(new PartitionManager(f.jdbc(), parent), month)).isTrue();
      assertTerminalLeafGuards(f.jdbc(), leaf);
      YearMonth legacyMonth = month.plusMonths(1);
      String legacyLeaf = parent + "_" + legacyMonth.format(DateTimeFormatter.ofPattern("yyyy_MM"));
      f.jdbc()
          .execute(
              "CREATE TABLE "
                  + legacyLeaf
                  + " PARTITION OF "
                  + parent
                  + " FOR VALUES FROM ('"
                  + legacyMonth.atDay(1)
                  + "') TO ('"
                  + legacyMonth.plusMonths(1).atDay(1)
                  + "')");
      assertThatThrownBy(
              () ->
                  invokeProductionPartition(new PartitionManager(failingJdbc, parent), legacyMonth))
          .hasMessageContaining("controlled partition publication failure");
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class, legacyLeaf))
          .isTrue();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      ("SELECT count(*) FROM pg_trigger WHERE tgrelid=?::regclass AND "
                          + "tgname='tr_observed_terminal_commit'"),
                      Integer.class,
                      legacyLeaf))
          .isZero();
      assertThat(new PartitionManager(f.jdbc(), parent).checkHealth(30).up()).isFalse();
      assertThat(invokeProductionPartition(new PartitionManager(f.jdbc(), parent), legacyMonth))
          .isFalse();
      assertTerminalLeafGuards(f.jdbc(), legacyLeaf);
      assertThat(new PartitionManager(f.jdbc(), parent).checkHealth(30).up()).isTrue();
    }
  }

  @Test
  void productionExistingLeafRepairIsAtomicIdempotentAndDoesNotNeedDefaultOrMutation()
      throws Exception {
    try (var f =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest
            .publishedRetry()) {
      String parent = "studio_observed_terminal_secret_settlements";
      YearMonth month = YearMonth.now(ZoneOffset.UTC).plusMonths(4);
      String leaf = parent + "_" + month.format(DateTimeFormatter.ofPattern("yyyy_MM"));
      // Authentic old-version/failed-publication state, no trigger disabled or shared database
      // changed.
      f.jdbc()
          .execute(
              "CREATE TABLE "
                  + leaf
                  + " PARTITION OF "
                  + parent
                  + " FOR VALUES FROM ('"
                  + month.atDay(1)
                  + "') TO ('"
                  + month.plusMonths(1).atDay(1)
                  + "')");
      assertThat(
              f.jdbc()
                  .queryForObject(
                      ("SELECT count(*) FROM pg_trigger WHERE tgrelid=?::regclass AND "
                          + "tgname='tr_observed_terminal_commit'"),
                      Integer.class,
                      leaf))
          .isZero();
      var manager = new PartitionManager(f.jdbc(), parent);
      assertThat(manager.checkHealth(30).up()).isFalse();
      assertThat(invokeProductionPartition(manager, month)).isFalse();
      assertTerminalLeafGuards(f.jdbc(), leaf);
      assertThat(manager.checkHealth(30).up()).isTrue();
      assertThat(invokeProductionPartition(manager, month)).isFalse();
      assertTerminalLeafGuards(f.jdbc(), leaf);
      assertThatThrownBy(() -> f.jdbc().execute("TRUNCATE " + leaf))
          .hasMessageContaining("append-only");
    }
  }

  /**
   * ADR-SC-008: one step dispatch can carry up to 8 secrets. The login step is consumed with the
   * secrets its {@code uses} names, and each one has its own release and usage rows.
   */
  private void consumedLogin(String... secretIds) {
    ledger.action(
        "login",
        "login-step",
        0,
        ledgerDocument("login-step", "login", 0, "DISPATCHING", 1)
            .put("ownerFence", 1)
            .put("outcomeCode", "PENDING"),
        stepProposal(secretIds));
  }

  private Scope loginScope(String secret, long releaseSequence) {
    return new Scope(
        Path.GUIDED,
        null,
        "session",
        "login",
        PRINCIPAL,
        "CSI",
        "Development",
        testId,
        secret,
        "session:1",
        releaseSequence,
        "login-step",
        0);
  }

  @Test
  void twoSecretsInOneAdmissionGiveTwoAuditRows() {
    consumedLogin("PASS", "TOKEN");
    var pass =
        transaction.execute(
            status ->
                audit.recordRelease(loginScope("PASS", 1), "version1", ResolutionOutcome.RESOLVED));
    var token =
        transaction.execute(
            status ->
                audit.recordRelease(
                    loginScope("TOKEN", 2), "version1", ResolutionOutcome.RESOLVED));
    transaction.executeWithoutResult(
        status -> {
          audit.recordUsage(pass, UsageOutcome.USED);
          audit.recordUsage(token, UsageOutcome.USED);
        });
    assertThat(
            jdbc.queryForList(
                ("SELECT secret_id FROM studio_secret_use_audit WHERE admission_id='login' AND"
                    + " row_kind='RELEASE' ORDER BY secret_id"),
                String.class))
        .containsExactly("PASS", "TOKEN");
    assertThat(count()).isEqualTo(4);
  }

  @Test
  void aSecretAbsentFromTheStepsUsesIsRejected() {
    consumedLogin("PASS");
    assertThatThrownBy(
            () ->
                transaction.execute(
                    status ->
                        audit.recordRelease(
                            loginScope("TOKEN", 1), "version1", ResolutionOutcome.RESOLVED)))
        .hasMessageContaining("lineage");
    assertThat(count()).isZero();
    transaction.executeWithoutResult(
        status ->
            audit.recordRelease(loginScope("PASS", 1), "version1", ResolutionOutcome.RESOLVED));
    assertThat(count()).isEqualTo(1);
  }

  @Test
  void secretUseValuesMapOneToOneOntoUsageOutcomes() {
    consumedLogin("PASS", "TOKEN", "EXTRA");
    var outcomes =
        java.util.Map.of(
            "PASS",
            UsageOutcome.USED,
            "TOKEN",
            UsageOutcome.NOT_USED,
            "EXTRA",
            UsageOutcome.REFUSED);
    long sequence = 1;
    for (var entry : new java.util.TreeMap<>(outcomes).entrySet()) {
      Scope scope = loginScope(entry.getKey(), sequence++);
      var release =
          transaction.execute(
              status -> audit.recordRelease(scope, "version1", ResolutionOutcome.RESOLVED));
      transaction.executeWithoutResult(status -> audit.recordUsage(release, entry.getValue()));
    }
    var rows =
        jdbc.queryForList(
            ("SELECT secret_id,usage_outcome FROM studio_secret_use_audit WHERE"
                + " row_kind='USAGE' ORDER BY secret_id"));
    assertThat(rows)
        .extracting(row -> row.get("secret_id") + ":" + row.get("usage_outcome"))
        .containsExactly("EXTRA:REFUSED", "PASS:USED", "TOKEN:NOT_USED");
  }
}
