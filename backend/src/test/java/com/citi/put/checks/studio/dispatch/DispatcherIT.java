package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.StudioSecretFixtures;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-12 – AC-16 — the dispatcher.
 *
 * <p>The ordering claims are observed rather than read: the attempt-before-send commit is seen from
 * a second connection while the runner client is still blocked inside its send, and the ambiguous
 * branch is asserted by counting what left the process.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class DispatcherIT {

  private static final String CSI_ID = "60457";
  private static final String OWNER = "dispatcher-owner@citi.com";

  private static final String ENVIRONMENT = "Production";

  @TestConfiguration
  static class FakeRunner {

    @Bean
    @Primary
    RecordingRunnerDispatchClient recordingRunnerDispatchClient() {
      return new RecordingRunnerDispatchClient();
    }

    /**
     * A vault and an entitlement set this test can change (story 10.17).
     *
     * <p>Story 10.7's two reference tests arranged their conditions by inserting into and deleting
     * from the platform {@code secrets} table, because the stub resolver read it. The stub is gone
     * — it never read its {@code csiId} parameter and returned a canary for every name — so the
     * conditions are now arranged where they actually live.
     */
    @Bean
    @Primary
    FakeStudioVaultProvider fakeStudioVaultProvider() {
      return new FakeStudioVaultProvider(java.util.Map.of());
    }

    @Bean
    @Primary
    StudioSecretFixtures.MutableSecretUseAuthorization mutableSecretUseAuthorization() {
      return new StudioSecretFixtures.MutableSecretUseAuthorization();
    }
  }

  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private org.springframework.context.ApplicationContext applicationContext;
  @Autowired private FakeStudioVaultProvider vault;
  @Autowired private StudioSecretFixtures.MutableSecretUseAuthorization entitlements;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private UUID testId;
  private UUID executionId;

  @BeforeEach
  void setUp() {
    runner.reset();
    vault.clear();
    entitlements.clear();
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    testId =
        fixtures
            .seedRunnableTest("Dispatcher draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    executionId = studioService.executeTest(testId, owner, null).executionId();
  }

  // ── AC-12: the claim ─────────────────────────────────────────────────────

  @Test
  void theClaimIsOneConditionalStatementAndASecondClaimOfAClaimedRowUpdatesNothing() {
    Instant now = Instant.now();

    assertThat(statements.claim(executionId, "dispatcher-a", now.plusSeconds(60), now))
        .isEqualTo(1);
    assertThat(statements.claim(executionId, "dispatcher-b", now.plusSeconds(60), now)).isZero();
    assertThat(ledger().get("lease_owner")).isEqualTo("dispatcher-a");
  }

  @Test
  void twoDispatchersRacingOneQueuedRowYieldExactlyOneClaim() throws Exception {
    CountDownLatch firstInside = new CountDownLatch(1);
    CountDownLatch secondFinished = new CountDownLatch(1);
    java.util.concurrent.atomic.AtomicInteger claims =
        new java.util.concurrent.atomic.AtomicInteger();

    CompletableFuture<Void> second =
        CompletableFuture.runAsync(
            () -> {
              try {
                if (!firstInside.await(30, TimeUnit.SECONDS)) {
                  throw new IllegalStateException("the first claim never started");
                }
                Instant now = Instant.now();
                // Blocks on the row lock the held-open transaction holds, then re-evaluates the
                // predicate against the committed row and finds state = 'CLAIMED'.
                claims.addAndGet(
                    transactions.execute(
                        status ->
                            statements.claim(
                                executionId, "dispatcher-b", now.plusSeconds(60), now)));
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("interrupted", e);
              } finally {
                secondFinished.countDown();
              }
            });

    transactions.executeWithoutResult(
        status -> {
          Instant now = Instant.now();
          claims.addAndGet(statements.claim(executionId, "dispatcher-a", now.plusSeconds(60), now));
          firstInside.countDown();
          sleep(1500);
        });

    assertThat(secondFinished.await(60, TimeUnit.SECONDS)).isTrue();
    second.join();

    assertThat(claims.get()).as("exactly one dispatcher claims").isEqualTo(1);
  }

  @Test
  void anExpiredLeaseOnAQueuedRowIsReclaimableAndALiveOneIsNot() {
    Instant now = Instant.now();
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET lease_expires_at = ? WHERE execution_id = ?",
        Timestamp.from(now.plusSeconds(600)),
        executionId);

    assertThat(statements.claim(executionId, "dispatcher-a", now.plusSeconds(60), now)).isZero();

    jdbc.update(
        "UPDATE studio_dispatch_ledger SET lease_expires_at = ? WHERE execution_id = ?",
        Timestamp.from(now.minusSeconds(1)),
        executionId);
    assertThat(statements.claim(executionId, "dispatcher-a", now.plusSeconds(60), now))
        .isEqualTo(1);
  }

  @Test
  void theDispatchSchedulerExistsOnlyOnTheWorkerProfile() {
    assertThat(applicationContext.getBeanNamesForType(StudioDispatchScheduler.class))
        .as(
            "no dispatch schedule under the test profile: worker, or local without api, only (§5.4)")
        .isEmpty();
  }

  @Test
  void anApiProfileContextNeverClaimsAQueuedRow() throws Exception {
    // This context is not the worker: there is no schedule, so nothing claims. The row is left
    // alone for as long as a worker pass would have taken several times over.
    Thread.sleep(3000);

    assertThat(ledger().get("state")).isEqualTo("QUEUED");
    assertThat(ledger().get("lease_owner")).isNull();
    assertThat(runner.sendCount()).isZero();
  }

  // ── AC-14: the attempt is committed before the send ──────────────────────

  @Test
  void dispatchingAndAFreshAttemptAreCommittedBeforeTheSend() throws Exception {
    CountDownLatch sendStarted = new CountDownLatch(1);
    CountDownLatch release = runner.blockInsideSend(sendStarted);

    CompletableFuture<Boolean> dispatching =
        CompletableFuture.supplyAsync(() -> dispatcher.dispatch(executionId));

    assertThat(sendStarted.await(30, TimeUnit.SECONDS)).isTrue();

    // A second connection, while the runner client is still blocked from returning.
    Map<String, Object> observed =
        jdbc.queryForMap(
            "SELECT state, attempt_id FROM studio_dispatch_ledger WHERE execution_id = ?",
            executionId);
    assertThat(observed.get("state")).isEqualTo("DISPATCHING");
    assertThat(observed.get("attempt_id")).isNotNull();

    release.countDown();
    assertThat(dispatching.get(30, TimeUnit.SECONDS)).isTrue();
    assertThat(runner.sendCount()).isEqualTo(1);
  }

  @Test
  void anAttemptIsNeverReusedAcrossAttempts() {
    runner.willAnswer(DispatchOutcome.refusedRetryable(Duration.ofSeconds(1)));

    dispatcher.dispatch(executionId);
    UUID first = runner.sent().get(0).attemptId();
    // The 429 returned the row to QUEUED with the attempt cleared.
    assertThat(ledger().get("state")).isEqualTo("QUEUED");
    assertThat(ledger().get("attempt_id")).isNull();

    dispatcher.dispatch(executionId);
    UUID second = runner.sent().get(1).attemptId();

    assertThat(second).isNotEqualTo(first);
  }

  // ── AC-15: three outcomes and no fourth ──────────────────────────────────

  @Test
  void aDefinite429ReturnsTheRowToTheQueueWithinThePendingDeadline() {
    runner.willAnswer(DispatchOutcome.refusedRetryable(Duration.ofSeconds(1)));

    dispatcher.dispatch(executionId);

    assertThat(ledger().get("state")).isEqualTo("QUEUED");
    assertThat(status()).isEqualTo("PENDING");
  }

  @Test
  void a429PastThePendingDeadlineIsTerminalDispatchFailed() {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET pending_deadline_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(1)),
        executionId);

    dispatcher.dispatch(executionId);

    assertThat(ledger().get("state")).isEqualTo("DONE");
    assertThat(status()).isEqualTo("ERROR");
    assertThat(errorCode()).isEqualTo(ExecutionErrorCode.DISPATCH_FAILED);
    assertThat(runner.sendCount()).as("the row never left for the runner at all").isZero();
  }

  @Test
  void anAmbiguousOutcomeIsNeverPermissionToResendAndLeavesTheRowDispatching() {
    for (String ambiguous : List.of("timeout", "connection loss", "runner 503", "redirect 302")) {
      setUp();
      runner.willAnswer(DispatchOutcome.ambiguous(ambiguous));

      dispatcher.dispatch(executionId);

      assertThat(runner.sendCount())
          .as("exactly one request left the process for '%s'", ambiguous)
          .isEqualTo(1);
      assertThat(ledger().get("state"))
          .as("the row stays DISPATCHING; recovery owns it, not a second send")
          .isEqualTo("DISPATCHING");
      assertThat(status()).isEqualTo("PENDING");
    }
  }

  @Test
  void asecondDispatchPassDoesNotPickUpADispatchingRow() {
    runner.willAnswer(DispatchOutcome.ambiguous("timeout"));
    dispatcher.dispatch(executionId);
    assertThat(sendsFor(executionId)).isEqualTo(1);
    Object attemptBefore = ledger().get("attempt_id");
    assertThat(attemptBefore).isNotNull();

    dispatcher.dispatchOnce();

    // dispatchOnce() is deployment-global by design and every Studio IT shares one database, so
    // its return value counts rows this test does not own — StudioOverloadIT deliberately leaves
    // queued rows behind under another CSI. Asserting zero there made the outcome depend on class
    // ordering. What this test owns is its own row, and the property is exactly that the pass does
    // not pick *it* up: no second send for this execution, and the attempt it is already carrying
    // is neither replaced nor reissued.
    assertThat(sendsFor(executionId))
        .as("the DISPATCHING row is not sent a second time by a later pass")
        .isEqualTo(1);
    assertThat(ledger().get("state")).isEqualTo("DISPATCHING");
    assertThat(ledger().get("attempt_id"))
        .as("and no fresh attempt is issued against it")
        .isEqualTo(attemptBefore);
  }

  // ── AC-13a: the recheck, and the two ratified codes ──────────────────────

  @Test
  void aRevokedAuthorizationAtDispatchIsTerminalWithAnExplicitCodeAndNoSend() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);

    dispatcher.dispatch(executionId);

    assertThat(runner.sendCount())
        .as("never a retry, never a silent skip, and never a send")
        .isZero();
    assertThat(ledger().get("state")).isEqualTo("DONE");
    assertThat(status()).isEqualTo("ERROR");
    assertThat(errorCode()).isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
  }

  @Test
  void aVanishedReferenceAtDispatchIsTerminalWithItsOwnCode() {
    UUID withReference =
        fixtures.seedTest("Referencing draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        withReference,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of("vanishing-reference")));
    entitlements.grant(OWNER, CSI_ID, ENVIRONMENT, "vanishing-reference");
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        CSI_ID,
        ENVIRONMENT,
        "vanishing-reference",
        "a-value-that-is-about-to-vanish");
    UUID execution = studioService.executeTest(withReference, owner, null).executionId();

    // Preflight passed at acceptance; the reference disappears from the vault before the send.
    vault.delete(
        StudioVaultProvider.ReferenceKind.SECRET, CSI_ID, ENVIRONMENT, "vanishing-reference");

    dispatcher.dispatch(execution);

    assertThat(runner.sendCount()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, execution))
        .isEqualTo(ExecutionErrorCode.REFERENCE_UNAVAILABLE);
  }

  @Test
  void theTwoDispatcherAssignedCodesAreDisjointFromTheReaperOwnedOnes() {
    assertThat(ExecutionErrorCode.values())
        .contains(
            ExecutionErrorCode.AUTHORIZATION_REVOKED, ExecutionErrorCode.REFERENCE_UNAVAILABLE);
    assertThat(ExecutionErrorCode.reaperAssigned())
        .doesNotContain(
            ExecutionErrorCode.AUTHORIZATION_REVOKED, ExecutionErrorCode.REFERENCE_UNAVAILABLE);
  }

  @Test
  void theDispatchedPolicyIdentityIsRecordedOnTheExecution() {
    dispatcher.dispatch(executionId);

    assertThat(
            jdbc.queryForObject(
                "SELECT configuration_snapshot::text FROM ui_test_executions WHERE id = ?",
                String.class,
                executionId))
        .as("the honest minimum while ADR-002 O-6 is open: decidable today, costs 10.18 nothing")
        .contains("dispatchPolicyIdentity");
  }

  @Test
  void noResolvedReferenceValueIsEverPersistedOrLogged() {
    UUID withReference =
        fixtures.seedTest("Canary draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        withReference,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of("canary-reference")));
    entitlements.grant(OWNER, CSI_ID, ENVIRONMENT, "canary-reference");
    String canaryValue = "studio-canary-value-do-not-persist";
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        CSI_ID,
        ENVIRONMENT,
        "canary-reference",
        canaryValue);
    UUID execution = studioService.executeTest(withReference, owner, null).executionId();

    dispatcher.dispatch(execution);

    String canary = canaryValue;
    // The value *travelled*, proven first, so the absences below are not true for the wrong reason
    // (story 10.17 Anti-vacuous test requirements, row 1). Story 10.7's version of this test could
    // not make this assertion, because no value had ever reached the job.
    assertThat(runner.sent())
        .isNotEmpty()
        .allSatisfy(job -> assertThat(job.references().secrets()).contains("canary-reference"))
        .allSatisfy(
            job -> assertThat(job.resolvedSecrets()).containsEntry("canary-reference", canary));
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE id = ?"
                    + " AND (COALESCE(configuration_snapshot::text,'') LIKE ?"
                    + "   OR COALESCE(step_results::text,'') LIKE ?"
                    + "   OR COALESCE(logs::text,'') LIKE ?)",
                Integer.class,
                execution,
                "%" + canary + "%",
                "%" + canary + "%",
                "%" + canary + "%"))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM studio_dispatch_ledger WHERE execution_id = ?"
                    + " AND COALESCE(manifest_key,'') LIKE ?",
                Integer.class,
                execution,
                "%" + canary + "%"))
        .isZero();
  }

  // ── AC-11: the kill switch closes queued work explicitly ─────────────────

  @Test
  void theKillSwitchClosesQueuedWorkIdempotentlyAndDoesNotResurrectIt() {
    // Driven directly: the switch itself is deployment configuration, and what this asserts is
    // the closure's behaviour, which must be idempotent and must bump no second revision.
    long revisionBefore = revision();

    int closed = dispatcher.closeUndispatchedWork();
    long revisionAfter = revision();
    int closedAgain = dispatcher.closeUndispatchedWork();

    assertThat(closed).isGreaterThanOrEqualTo(0);
    assertThat(closedAgain).as("a second pass changes nothing").isZero();
    assertThat(revision()).as("and bumps no revision").isEqualTo(revisionAfter);
    assertThat(revisionAfter).isGreaterThanOrEqualTo(revisionBefore);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** How many sends left the process for one execution — never the deployment-global count. */
  private long sendsFor(UUID execution) {
    return runner.sent().stream().filter(job -> execution.equals(job.executionId())).count();
  }

  private Map<String, Object> ledger() {
    return statements.find(executionId).orElseThrow();
  }

  private String status() {
    return jdbc.queryForObject(
        "SELECT status FROM ui_test_executions WHERE id = ?", String.class, executionId);
  }

  private String errorCode() {
    return jdbc.queryForObject(
        "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, executionId);
  }

  private long revision() {
    Long value =
        jdbc.queryForObject(
            "SELECT snapshot_revision FROM ui_test_executions WHERE id = ?",
            Long.class,
            executionId);
    return value == null ? 0L : value;
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted while holding a transaction open", e);
    }
  }
}
