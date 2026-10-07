package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.StudioSecretFixtures;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
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
  void dispatchSendsTheExactRevisionArtifactAndHashSnapshottedAtAcceptance() throws Exception {
    UUID acceptedRevision =
        jdbc.queryForObject(
            "SELECT revision_id FROM ui_test_executions WHERE id = ?", UUID.class, executionId);
    String persistedHash =
        jdbc.queryForObject(
            "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?",
            String.class,
            acceptedRevision);
    String persistedArtifact =
        jdbc.queryForObject(
            "SELECT artifact::text FROM ui_test_revisions WHERE id = ?",
            String.class,
            acceptedRevision);

    dispatcher.dispatch(executionId);

    RunJob job =
        runner.sent().stream()
            .filter(candidate -> executionId.equals(candidate.executionId()))
            .findFirst()
            .orElseThrow();
    assertThat(job.revisionId()).isEqualTo(acceptedRevision);
    assertThat(job.artifactHash()).isEqualTo(persistedHash);
    assertThat(job.artifact()).isEqualTo(objectMapper.readTree(persistedArtifact));
  }

  @Test
  void plainDraftVariablesAreSnapshottedAtAcceptanceWithoutUsingVault() {
    List<String> steps = List.of("Go to the home page");
    UUID variableTest = fixtures.seedTest("Plain variable draft", CSI_ID, OWNER, steps);
    jdbc.update(
        "UPDATE ui_tests SET variables = CAST(? AS jsonb) WHERE id = ?",
        "[{\"name\":\"QUERY\",\"kind\":\"plain\",\"value\":\"studio\",\"secretId\":null}]",
        variableTest);
    fixtures.confirmRevision(
        variableTest,
        CSI_ID,
        steps,
        StudioExecutionFixtures.references(List.of("QUERY"), List.of()));

    UUID variableExecution = studioService.executeTest(variableTest, owner, null).executionId();
    // A later draft edit cannot alter the already accepted run's input.
    jdbc.update(
        "UPDATE ui_tests SET variables = CAST(? AS jsonb) WHERE id = ?",
        "[{\"name\":\"QUERY\",\"kind\":\"plain\",\"value\":\"changed\",\"secretId\":null}]",
        variableTest);

    dispatcher.dispatch(variableExecution);

    RunJob job =
        runner.sent().stream()
            .filter(candidate -> variableExecution.equals(candidate.executionId()))
            .findFirst()
            .orElseThrow();
    assertThat(job.resolvedVars()).containsExactlyEntriesOf(Map.of("QUERY", "studio"));
    assertThat(job.resolvedSecrets()).isEmpty();
  }

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

  // ── Studio v1 WP8: the pass selects and claims in one SKIP LOCKED statement ─

  @Test
  void aPassClaimSkipsARowAnotherTransactionHoldsInsteadOfWaitingForIt() throws Exception {
    UUID younger = executeAnother("Skip-locked draft");
    List<UUID> others = queuedExcept(List.of(executionId, younger));
    CountDownLatch locked = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);

    // Another transaction holds the older row's lock, as a concurrent claimer mid-statement would.
    CompletableFuture<Void> holder =
        CompletableFuture.runAsync(
            () ->
                transactions.executeWithoutResult(
                    status -> {
                      jdbc.queryForList(
                          "SELECT execution_id FROM studio_dispatch_ledger"
                              + " WHERE execution_id = ? FOR UPDATE",
                          executionId);
                      locked.countDown();
                      awaitQuietly(release);
                    }));
    try {
      assertThat(locked.await(30, TimeUnit.SECONDS)).isTrue();
      Instant now = Instant.now();
      List<UUID> claimed =
          CompletableFuture.supplyAsync(
                  () ->
                      transactions.execute(
                          status ->
                              statements.claimQueued(
                                  "dispatcher-skip", now.plusSeconds(60), now, 1, others)))
              .get(10, TimeUnit.SECONDS);

      assertThat(claimed)
          .as("the locked oldest row is passed over, not waited on, and the next one is taken")
          .containsExactly(younger);
    } finally {
      release.countDown();
      holder.get(30, TimeUnit.SECONDS);
    }
    assertThat(ledger().get("state")).isEqualTo("QUEUED");
    assertThat(ledger().get("lease_owner")).isNull();
  }

  @Test
  void aPassClaimIsBoundedByItsLimitAndTakesTheOldestClaimableRowsFirst() {
    UUID second = executeAnother("Bounded draft 2");
    UUID third = executeAnother("Bounded draft 3");
    List<UUID> others = queuedExcept(List.of(executionId, second, third));
    Instant now = Instant.now();

    List<UUID> claimed =
        transactions.execute(
            status ->
                statements.claimQueued("dispatcher-bound", now.plusSeconds(60), now, 2, others));

    assertThat(claimed)
        .as("the returned count is the bound, oldest acceptance first")
        .containsExactly(executionId, second);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM studio_dispatch_ledger WHERE lease_owner = ?",
                Integer.class,
                "dispatcher-bound"))
        .as("and the statement moved exactly the rows it returned")
        .isEqualTo(2);
    assertThat(ledger().get("state")).isEqualTo("CLAIMED");
    assertThat(statements.find(third).orElseThrow().get("state")).isEqualTo("QUEUED");
  }

  @Test
  void aPassNeverClaimsALiveLeaseOrARowItWasToldToExclude() {
    List<UUID> others = queuedExcept(List.of(executionId));
    Instant now = Instant.now();
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET lease_expires_at = ? WHERE execution_id = ?",
        Timestamp.from(now.plusSeconds(600)),
        executionId);

    assertThat(statements.claimQueued("dispatcher-a", now.plusSeconds(60), now, 5, others))
        .as("a live lease is not claimable, exactly as for the single-row claim")
        .isEmpty();

    jdbc.update(
        "UPDATE studio_dispatch_ledger SET lease_expires_at = ? WHERE execution_id = ?",
        Timestamp.from(now.minusSeconds(1)),
        executionId);
    List<UUID> withSelf = new java.util.ArrayList<>(others);
    withSelf.add(executionId);
    assertThat(statements.claimQueued("dispatcher-a", now.plusSeconds(60), now, 5, withSelf))
        .as("an excluded row is not claimed")
        .isEmpty();
    assertThat(statements.claimQueued("dispatcher-a", now.plusSeconds(60), now, 5, others))
        .containsExactly(executionId);
    assertThat(ledger().get("lease_owner")).isEqualTo("dispatcher-a");
  }

  @Test
  void aRowA429ReturnedToTheQueueIsNotReclaimedWithinTheSamePass() {
    runner.willAnswer(DispatchOutcome.refusedRetryable(Duration.ofSeconds(1)));

    dispatcher.dispatchOnce();

    assertThat(sendsFor(executionId))
        .as("one send per pass, as when the pass worked from a batch read once at its start")
        .isEqualTo(1);
    assertThat(ledger().get("state")).isEqualTo("QUEUED");
    assertThat(ledger().get("attempt_id")).isNull();
  }

  @Test
  void twoDispatchersDrainingOneBacklogClaimAndDispatchEachRowExactlyOnce() throws Exception {
    List<UUID> backlog = new java.util.ArrayList<>(List.of(executionId));
    for (int i = 0; i < 7; i++) {
      backlog.add(executeAnother("Backlog draft " + i));
    }
    CountingStatements counting = new CountingStatements(jdbc);
    SlowRecordingClient client = new SlowRecordingClient();
    StudioDispatcher first = secondInstance(counting, client, "dispatcher-wp8-a");
    StudioDispatcher second = secondInstance(counting, client, "dispatcher-wp8-b");
    CountDownLatch start = new CountDownLatch(1);

    CompletableFuture<Void> a = CompletableFuture.runAsync(() -> drain(first, start, backlog));
    CompletableFuture<Void> b = CompletableFuture.runAsync(() -> drain(second, start, backlog));
    start.countDown();
    CompletableFuture.allOf(a, b).get(120, TimeUnit.SECONDS);

    assertThat(counting.claimMisses())
        .as("no claim statement lost a race: the pass never selects a row it then fails to claim")
        .isZero();
    for (UUID execution : backlog) {
      assertThat(client.sendsFor(execution))
          .as("execution %s left the process exactly once", execution)
          .isEqualTo(1);
      assertThat(counting.claimsOf(execution))
          .as("and was claimed exactly once across both dispatchers", execution)
          .isEqualTo(1);
      Map<String, Object> row = statements.find(execution).orElseThrow();
      assertThat(row.get("state")).isEqualTo("DISPATCHING");
      assertThat(row.get("lease_owner")).isIn("dispatcher-wp8-a", "dispatcher-wp8-b");
    }
    assertThat(counting.claimedBy("dispatcher-wp8-a"))
        .as("both dispatchers really drained the backlog concurrently")
        .isPositive();
    assertThat(counting.claimedBy("dispatcher-wp8-b")).isPositive();
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
        VaultScope.of(CSI_ID, ENVIRONMENT, withReference),
        "vanishing-reference",
        "a-value-that-is-about-to-vanish");
    UUID execution = studioService.executeTest(withReference, owner, null).executionId();

    // Preflight passed at acceptance; the reference disappears from the vault before the send.
    vault.delete(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, withReference),
        "vanishing-reference");

    dispatcher.dispatch(execution);

    assertThat(runner.sendCount()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, execution))
        .isEqualTo(ExecutionErrorCode.REFERENCE_UNAVAILABLE);
  }

  @Test
  void aVaultOutageRequeuesTheClaimWithoutIssuingAnAttemptOrMislabelingTheReference() {
    UUID withReference =
        fixtures.seedTest("Vault outage draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        withReference,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of("LOGIN_PW")));
    entitlements.grant(OWNER, CSI_ID, ENVIRONMENT, "LOGIN_PW");
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, withReference),
        "LOGIN_PW",
        "value-never-logged");
    UUID execution = studioService.executeTest(withReference, owner, null).executionId();
    vault.makeUnavailable();

    dispatcher.dispatch(execution);

    Map<String, Object> row = statements.find(execution).orElseThrow();
    assertThat(runner.sendCount()).isZero();
    assertThat(row.get("state")).isEqualTo("QUEUED");
    assertThat(row.get("attempt_id")).isNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, execution))
        .isNull();
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
        VaultScope.of(CSI_ID, ENVIRONMENT, withReference),
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

  // ── Two budgets: the total browser runtime is the server's, the step timeout is the test's ──

  /**
   * A test with {@code timeoutSeconds: 30} is sent a total browser runtime of 120 s, and its
   * per-step value travels untouched beside it.
   *
   * <p>Architecture §5.2: "Default step timeout is 30 seconds and total browser runtime 120
   * seconds". Until this test existed the dispatcher derived {@code deadlines.totalRuntimeMs} from
   * the revision's own {@code configuration.timeoutSeconds}, so the per-step value <em>was</em> the
   * whole-run budget: every run was killed at thirty seconds, the stop was orderly, the recording
   * was marked {@code partial: false}, and the user saw a clean video that ended mid-test. This
   * pins the decoupling in both directions: the total comes from {@code
   * studio.execution.total-runtime} and the step timeout stays the revision's.
   */
  @Test
  void theTotalRuntimeBudgetIsTheServersAndNotTheRevisionsStepTimeout() {
    dispatcher.dispatch(executionId);

    RunJob job =
        runner.sent().stream()
            .filter(candidate -> executionId.equals(candidate.executionId()))
            .findFirst()
            .orElseThrow();
    // The fixture revision declares the contract's default per-step timeout, and it is what the
    // runner reads as the step timeout — unchanged by the dispatcher.
    assertThat(job.configuration().path("timeoutSeconds").asLong())
        .as("the per-step timeout stays on the job's configuration")
        .isEqualTo(30L);
    // The whole-run budget is the server's, four times the per-step value, so the two cannot be
    // one number wearing two names.
    assertThat(job.deadlines().totalRuntimeMs())
        .as("deadlines.totalRuntimeMs is studio.execution.total-runtime, not timeoutSeconds")
        .isEqualTo(120_000L)
        .isEqualTo(executionProperties.totalRuntimeOrDefault().toMillis())
        .isNotEqualTo(job.configuration().path("timeoutSeconds").asLong() * 1000L);
    assertThat(job.deadlines().admittedStartMs())
        .isEqualTo(executionProperties.startDeadlineOrDefault().toMillis());
    // And the budget the reaper closes a run at still contains it, with margin to spare.
    assertThat(executionProperties.totalRuntimeOrDefault())
        .isLessThan(executionProperties.runDeadlineOrDefault());
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

  @Autowired private com.citi.put.checks.studio.UITestRevisionRepository revisionRepository;
  @Autowired private DispatchAuthorization dispatchAuthorization;
  @Autowired private StudioReferenceResolver referenceResolver;
  @Autowired private com.citi.put.checks.studio.StudioExecutionProperties executionProperties;
  @Autowired private com.fasterxml.jackson.databind.ObjectMapper objectMapper;

  /** A second, independent dispatcher: its own lease owner, sharing only the database. */
  private StudioDispatcher secondInstance(
      StudioDispatchLedgerStatements ledgerStatements,
      RunnerDispatchClient client,
      String instanceId) {
    return new StudioDispatcher(
        ledgerStatements,
        revisionRepository,
        dispatchAuthorization,
        referenceResolver,
        client,
        executionProperties,
        objectMapper,
        jdbc,
        transactions,
        instanceId,
        java.time.Clock.systemUTC());
  }

  /** Runs passes until none of {@code backlog} is still queued. */
  private void drain(StudioDispatcher dispatcher, CountDownLatch start, List<UUID> backlog) {
    awaitQuietly(start);
    for (int pass = 0; pass < 50; pass++) {
      dispatcher.dispatchOnce();
      Integer queued =
          jdbc.queryForObject(
              "SELECT COUNT(*) FROM studio_dispatch_ledger"
                  + " WHERE state = 'QUEUED' AND execution_id = ANY (CAST(? AS uuid[]))",
              Integer.class,
              "{" + String.join(",", backlog.stream().map(UUID::toString).toList()) + "}");
      if (queued != null && queued == 0) {
        return;
      }
    }
    throw new IllegalStateException("the backlog was not drained in 50 passes");
  }

  private UUID executeAnother(String name) {
    UUID another =
        fixtures.seedRunnableTest(name, CSI_ID, OWNER, List.of("Go to the home page")).testId();
    return studioService.executeTest(another, owner, null).executionId();
  }

  /**
   * Queued rows other test classes left behind. The claim is deployment-global by design, so a test
   * that asserts which row a claim takes excludes these rather than depending on class order.
   */
  private List<UUID> queuedExcept(List<UUID> mine) {
    return jdbc
        .queryForList(
            "SELECT execution_id FROM studio_dispatch_ledger WHERE state = 'QUEUED'", UUID.class)
        .stream()
        .filter(id -> !mine.contains(id))
        .toList();
  }

  private static void awaitQuietly(CountDownLatch latch) {
    try {
      if (!latch.await(30, TimeUnit.SECONDS)) {
        throw new IllegalStateException("latch was never released");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  /** Counts what each claim statement returned, per owner and per execution. */
  static final class CountingStatements extends StudioDispatchLedgerStatements {

    private final Map<UUID, java.util.concurrent.atomic.AtomicInteger> perExecution =
        new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, java.util.concurrent.atomic.AtomicInteger> perOwner =
        new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.concurrent.atomic.AtomicInteger misses =
        new java.util.concurrent.atomic.AtomicInteger();

    CountingStatements(JdbcTemplate jdbc) {
      super(jdbc);
    }

    @Override
    public List<UUID> claimQueued(
        String owner,
        Instant leaseExpiresAt,
        Instant now,
        int limit,
        java.util.Collection<UUID> excluded) {
      List<UUID> claimed = super.claimQueued(owner, leaseExpiresAt, now, limit, excluded);
      claimed.forEach(
          id ->
              perExecution
                  .computeIfAbsent(id, k -> new java.util.concurrent.atomic.AtomicInteger())
                  .incrementAndGet());
      perOwner
          .computeIfAbsent(owner, k -> new java.util.concurrent.atomic.AtomicInteger())
          .addAndGet(claimed.size());
      return claimed;
    }

    /** A single-row claim that updated nothing is the round trip WP8 exists to remove. */
    @Override
    public int claim(UUID executionId, String owner, Instant leaseExpiresAt, Instant now) {
      int claimed = super.claim(executionId, owner, leaseExpiresAt, now);
      if (claimed == 0) {
        misses.incrementAndGet();
      }
      return claimed;
    }

    int claimsOf(UUID executionId) {
      java.util.concurrent.atomic.AtomicInteger count = perExecution.get(executionId);
      return count == null ? 0 : count.get();
    }

    int claimedBy(String owner) {
      java.util.concurrent.atomic.AtomicInteger count = perOwner.get(owner);
      return count == null ? 0 : count.get();
    }

    int claimMisses() {
      return misses.get();
    }
  }

  /** Accepts every job, slowly enough that two dispatchers' passes genuinely overlap. */
  static final class SlowRecordingClient implements RunnerDispatchClient {

    private final List<RunJob> sent = new java.util.concurrent.CopyOnWriteArrayList<>();

    @Override
    public DispatchOutcome send(RunJob job) {
      sent.add(job);
      sleep(100);
      return DispatchOutcome.accepted();
    }

    long sendsFor(UUID executionId) {
      return sent.stream().filter(job -> executionId.equals(job.executionId())).count();
    }

    @Override
    public CancelOutcome cancel(UUID executionId) {
      return CancelOutcome.ACKNOWLEDGED;
    }
  }

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
