package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.compile.ConfigurationChangeClassifier;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.1 AC-18 — execute idempotency is durable, not per-replica.
 *
 * <p>Production runs three API replicas scaling to six, so a client retry routinely reaches a
 * different pod than the original request. The in-memory idempotency filter cannot see that, which
 * is why the dispatch ledger carries a unique {@code (principal, idempotency_key)} row committed
 * with the execution (Architecture §5.1).
 *
 * <p>This test runs in a single Spring context. It does not start a second JVM, so it cannot prove
 * anything that depends on one. What it does prove is the pair of properties the durability claim
 * actually rests on: {@link StudioService} holds no per-instance idempotency state — a second
 * service object built from the same beans, in its own transaction, resolves the retry from the
 * committed ledger row — and the database itself refuses a second row for the same {@code
 * (principal, idempotency_key)} by constraint name. Hibernate's second-level cache is off and the
 * retry runs in a fresh transaction, so that resolution genuinely reaches the database. A true
 * two-context test belongs with the acceptance transaction in 10.7.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioIdempotencyIT {

  private static final String OWNER = "idempotency-owner@citi.com";
  private static final String OTHER_PRINCIPAL = "idempotency-other@citi.com";
  private static final String CSI_ID = "60422";

  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioRepository studioRepository;
  @Autowired private UITestExecutionRepository executionRepository;
  @Autowired private StudioAcceptanceService acceptanceService;
  @Autowired private CsiRepository csiRepository;
  @Autowired private ConfigurationChangeClassifier changeClassifier;
  @Autowired private CsiOwnershipEvaluator csiOwnershipEvaluator;
  @Autowired private ExecutionSnapshotMapper snapshotMapper;
  @Autowired private com.citi.put.checks.studio.compile.CompilePipeline compilePipeline;
  @Autowired private TransactionTemplate transactions;

  private UUID testId;
  private UUID otherTestId;

  @BeforeEach
  void setUp() {
    seedUser(OWNER);
    seedUser(OTHER_PRINCIPAL);
    seedCsi();
    testId = seedTest("Idempotent draft");
    otherTestId = seedTest("Other draft");
  }

  @Test
  void theSameKeyAndDigestResolvesToTheSameExecutionOnAnIndependentServiceInstance() {
    String key = "exec-key-" + UUID.randomUUID();
    ExecutionSnapshotDto first = studioService.executeTest(testId, identity(OWNER), key);

    // A second service object built from the same beans: no shared in-memory state with the one
    // that accepted the original request, which is what a second API replica amounts to here.
    ExecutionSnapshotDto retry =
        transactions.execute(
            status -> independentInstance().executeTest(testId, identity(OWNER), key));

    assertThat(retry).isNotNull();
    assertThat(retry.executionId()).isEqualTo(first.executionId());
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM studio_dispatch_ledger"
                    + " WHERE principal = ? AND idempotency_key = ?",
                Integer.class,
                OWNER,
                key))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                testId))
        .isEqualTo(1);
  }

  @Test
  void theDatabaseItselfRefusesASecondRowForTheSameKey() {
    String key = "exec-key-" + UUID.randomUUID();
    ExecutionSnapshotDto accepted = studioService.executeTest(testId, identity(OWNER), key);

    // This is the guarantee that survives replicas and restarts: no in-memory filter is involved.
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at,"
                        + " test_id, csi_id, principal, idempotency_key, request_digest, state)"
                        + " VALUES (?, NOW(), ?, ?, ?, ?, 'a-different-digest', 'QUEUED')",
                    UUID.randomUUID(),
                    testId,
                    CSI_ID,
                    OWNER,
                    key))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("uq_studio_dispatch_ledger_idempotency");

    assertThat(accepted.status()).isEqualTo("PENDING");
  }

  @Test
  void theSameKeyWithADifferentRequestIsAConflict() {
    String key = "exec-key-" + UUID.randomUUID();
    studioService.executeTest(testId, identity(OWNER), key);

    assertThatThrownBy(() -> studioService.executeTest(otherTestId, identity(OWNER), key))
        .isInstanceOf(StudioConflictException.class)
        .hasMessageContaining(key);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                otherTestId))
        .isZero();
  }

  @Test
  void theKeyIsScopedToThePrincipalSoTwoUsersNeverShareAnExecution() {
    String key = "shared-key-" + UUID.randomUUID();

    ExecutionSnapshotDto mine = studioService.executeTest(testId, identity(OWNER), key);
    ExecutionSnapshotDto theirs = studioService.executeTest(testId, identity(OTHER_PRINCIPAL), key);

    assertThat(theirs.executionId()).isNotEqualTo(mine.executionId());
  }

  @Test
  void anExecutionWithoutAKeyIsAlwaysANewRun() {
    ExecutionSnapshotDto first = studioService.executeTest(testId, identity(OWNER), null);
    ExecutionSnapshotDto second = studioService.executeTest(testId, identity(OWNER), null);

    assertThat(second.executionId()).isNotEqualTo(first.executionId());
    // Postgres treats NULLs as distinct, so unkeyed executions never collide on the unique index.
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM studio_dispatch_ledger"
                    + " WHERE principal = ? AND idempotency_key IS NULL",
                Integer.class,
                OWNER))
        .isGreaterThanOrEqualTo(2);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Builds a StudioService that shares the repositories but nothing else with the autowired one.
   *
   * <p>Production runs three API replicas scaling to six, so a retry routinely lands on a pod that
   * never saw the original request. An instance with no carried-over state is the smallest faithful
   * stand-in for that pod: if idempotency resolves here, it resolved from committed rows.
   */
  private StudioService independentInstance() {
    return new StudioService(
        studioRepository,
        executionRepository,
        csiRepository,
        changeClassifier,
        csiOwnershipEvaluator,
        snapshotMapper,
        acceptanceService,
        compilePipeline);
  }

  private static Authentication identity(String email) {
    return new BffAuthenticationToken(
        new UserIdentity("uid-" + email, email, email, "Ops", List.of("checks-admin"), List.of()));
  }

  /**
   * A compiled and confirmed draft. Acceptance runs the readiness gate from story 10.7 onwards, so
   * a draft with no confirmed revision is refused {@code 409 COMPILE_REQUIRED} rather than executed
   * — which is the product behaviour, not a test inconvenience.
   */
  private UUID seedTest(String name) {
    return new StudioExecutionFixtures(jdbc)
        .seedRunnableTest(name, CSI_ID, OWNER, List.of("Go to the home page"))
        .testId();
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Idempotency User', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Idempotency CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
