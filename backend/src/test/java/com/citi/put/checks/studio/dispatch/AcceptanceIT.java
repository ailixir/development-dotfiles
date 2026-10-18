package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.SecondApplicationContext;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorizer;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-7 – AC-11 — the acceptance transaction.
 *
 * <p>Two of the tests here interleave two application contexts against one database and hold the
 * first transaction open across the second's insert. Sequential calls that merely happen to arrive
 * one after another prove nothing about either guard, which is why they are not used.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class AcceptanceIT {

  /**
   * The acceptance step bound for this class. An observed revision holds at most 100 steps (its
   * artifact contract), below the deployed bound of 200, so the bound is lowered here to stay
   * reachable by a publishable revision: {@link #aRevisionOverTheStepBoundIsRefused} publishes
   * {@code STEP_BOUND + 1} steps and every other test stays within it.
   */
  private static final int STEP_BOUND = 3;

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    registry.add("studio.execution.quotas.max-steps-per-test", () -> STEP_BOUND);
  }

  private static final String CSI_ID = "60453";
  private static final String OTHER_CSI_ID = "60454";
  private static final String OWNER = "acceptance-owner@citi.com";

  @Autowired private StudioService studioService;
  @Autowired private StudioAcceptanceService acceptanceService;
  @Autowired private ObservedReplayAuthorizer runAuthority;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private DataSource dataSource;

  private StudioExecutionFixtures fixtures;
  private UUID testId;
  private Authentication owner;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    fixtures.seedCsi(OTHER_CSI_ID, OWNER);
    testId =
        fixtures
            .seedRunnableTest("Acceptance draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID, OTHER_CSI_ID);
  }

  // ── AC-7: one transaction, durable idempotency on the unique index ───────

  @Test
  void acceptanceWritesTheHistoryRowItsLedgerRowAndTheIdempotencyMappingInOneTransaction() {
    String key = UUID.randomUUID().toString();

    ExecutionSnapshotDto accepted =
        studioService.executeTest(testId, owner, key, ObservedPublicationFixture.request(owner));

    assertThat(accepted.status()).isEqualTo("PENDING");
    assertThat(accepted.csiId()).isEqualTo(CSI_ID);
    assertThat(
            jdbc.queryForObject(
                "SELECT execution_scope FROM ui_test_executions WHERE id = ?",
                String.class,
                accepted.executionId()))
        .isEqualTo("FULL");
    assertThat(accepted.revisionId()).as("the confirmed revision is snapshotted").isNotNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM studio_dispatch_ledger WHERE execution_id = ?"
                    + " AND principal = ? AND idempotency_key = ? AND request_digest IS NOT NULL",
                Integer.class,
                accepted.executionId(),
                OWNER,
                key))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT pending_deadline_at IS NOT NULL FROM studio_dispatch_ledger"
                    + " WHERE execution_id = ?",
                Boolean.class,
                accepted.executionId()))
        .as(
            "the pending SLA is set at acceptance and is a different column from the start/run "
                + "deadlines the admission CAS assigns (AC-19)")
        .isTrue();
  }

  @Test
  void oneEntryPerOriginalStepIsPersistedAtAcceptance() {
    UUID multiStep =
        fixtures
            .seedRunnableTest("Three steps", CSI_ID, OWNER, List.of("One", "Two", "Three"))
            .testId();

    ExecutionSnapshotDto accepted =
        studioService.executeTest(
            multiStep, owner, null, ObservedPublicationFixture.request(owner));

    assertThat(accepted.stepResults()).hasSize(3);
    assertThat(accepted.stepResults())
        .allSatisfy(step -> assertThat(step.status()).isEqualTo("PENDING"));
    assertThat(accepted.stepResults().get(2).originalText()).isEqualTo("Three");
  }

  @Test
  void twoConcurrentExecutesFromTwoContextsYieldExactlyOneExecution() throws Exception {
    String key = UUID.randomUUID().toString();
    CountDownLatch firstInserted = new CountDownLatch(1);
    CountDownLatch secondFinished = new CountDownLatch(1);
    AtomicReference<UUID> winner = new AtomicReference<>();
    AtomicReference<UUID> loserResult = new AtomicReference<>();
    AtomicReference<Throwable> loserFailure = new AtomicReference<>();

    try (SecondApplicationContext replicaB = SecondApplicationContext.observed(dataSource)) {
      StudioService serviceOnB = replicaB.bean(StudioService.class);

      CompletableFuture<Void> second =
          CompletableFuture.runAsync(
              () -> {
                try {
                  firstInserted.await(30, TimeUnit.SECONDS);
                  loserResult.set(
                      serviceOnB
                          .executeTest(
                              testId, owner, key, ObservedPublicationFixture.request(owner))
                          .executionId());
                } catch (Throwable t) {
                  loserFailure.set(t);
                } finally {
                  secondFinished.countDown();
                }
              });

      // Replica A holds its acceptance transaction open past replica B's insert. B's INSERT
      // blocks on uq_studio_dispatch_ledger_idempotency until A commits, and then fails. A's
      // explicit Run authority is issued before its acceptance transaction, as on a real pod.
      var grant = runAuthority.authorize(testId, owner, ObservedPublicationFixture.request(owner));
      transactions.executeWithoutResult(
          status -> {
            winner.set(acceptanceService.acceptObserved(testId, OWNER, key, grant));
            firstInserted.countDown();
            sleep(1500);
          });

      assertThat(secondFinished.await(60, TimeUnit.SECONDS)).isTrue();
      second.join();
    }

    assertThat(loserFailure.get()).as("the loser resolved rather than failing").isNull();
    assertThat(loserResult.get())
        .as("the loser observed the unique violation and returned the winner's execution")
        .isEqualTo(winner.get());
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                testId))
        .as("exactly one execution, not two")
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM studio_dispatch_ledger WHERE principal = ?"
                    + " AND idempotency_key = ?",
                Integer.class,
                OWNER,
                key))
        .isEqualTo(1);
  }

  @Test
  void theSameKeyWithADifferentDigestIsAConflictAndCreatesNothing() {
    String key = UUID.randomUUID().toString();
    UUID otherTest =
        fixtures
            .seedRunnableTest("Other acceptance draft", CSI_ID, OWNER, List.of("Go home"))
            .testId();

    studioService.executeTest(testId, owner, key, ObservedPublicationFixture.request(owner));

    assertThatThrownBy(
            () ->
                studioService.executeTest(
                    otherTest, owner, key, ObservedPublicationFixture.request(owner)))
        .isInstanceOf(StudioConflictException.class)
        .hasMessageContaining(key);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                otherTest))
        .isZero();
  }

  @Test
  void theDigestCoversOnlyRequestDeterminedInputsAndNoServerState() {
    String first = StudioAcceptanceService.requestDigest(testId, OWNER);

    // Server state moves; the digest does not, or every retry would become a 409.
    jdbc.update("UPDATE ui_tests SET name = 'renamed' WHERE id = ?", testId);

    assertThat(StudioAcceptanceService.requestDigest(testId, OWNER)).isEqualTo(first);
    assertThat(StudioAcceptanceService.requestDigest(testId, "someone.else@citi.com"))
        .isNotEqualTo(first);
    assertThat(StudioAcceptanceService.requestDigest(UUID.randomUUID(), OWNER)).isNotEqualTo(first);
  }

  // ── AC-8a: readiness, and what it must not key on ────────────────────────

  @Test
  void anUnconfirmedDraftIsCompileRequired() {
    UUID unconfirmed =
        fixtures.seedTest("Never compiled", CSI_ID, OWNER, List.of("Go to the home page"));

    assertThatThrownBy(
            () ->
                studioService.executeTest(
                    unconfirmed, owner, null, ObservedPublicationFixture.request(owner)))
        .isInstanceOf(StudioConflictException.class)
        .hasFieldOrPropertyWithValue("code", "LEARN_REQUIRED");
  }

  @Test
  void anEditedDraftWhoseConfirmationNoLongerMatchesIsLearnRequired() {
    // A counter-only bump is no longer an edit (OBS-015: semantic identity, not counters); change
    // the learned text itself.
    jdbc.update(
        "UPDATE ui_tests SET source_revision = source_revision + 1,"
            + " steps = CAST('[\"Go somewhere else\"]' AS jsonb) WHERE id = ?",
        testId);

    assertThatThrownBy(
            () ->
                studioService.executeTest(
                    testId, owner, null, ObservedPublicationFixture.request(owner)))
        .isInstanceOf(StudioConflictException.class)
        .hasFieldOrPropertyWithValue("code", "LEARN_REQUIRED");
  }

  @Test
  void aCounterOnlyBumpWithIdenticalSemanticContentStaysReady() {
    // OBS-015: readiness keys on semantic identity, not on revision counters. Both counters move
    // and no content does, so the learned revision still replays and the execute is accepted.
    jdbc.update(
        "UPDATE ui_tests SET source_revision = source_revision + 1,"
            + " configuration_revision = configuration_revision + 1 WHERE id = ?",
        testId);

    ExecutionSnapshotDto accepted =
        studioService.executeTest(testId, owner, null, ObservedPublicationFixture.request(owner));

    assertThat(accepted.status()).isEqualTo("PENDING");
    assertThat(accepted.revisionId()).as("the learned revision is the one replayed").isNotNull();
  }

  // ── AC-9: quotas are one critical section with the insert ────────────────

  @Test
  void twoConcurrentAcceptsAtTheLimitCannotBothObserveRoom() throws Exception {
    fillCsiToOneBelowItsQuota(CSI_ID);

    CountDownLatch firstInside = new CountDownLatch(1);
    CountDownLatch secondFinished = new CountDownLatch(1);
    AtomicReference<Throwable> secondFailure = new AtomicReference<>();
    AtomicReference<UUID> secondAccepted = new AtomicReference<>();

    try (SecondApplicationContext replicaB = SecondApplicationContext.observed(dataSource)) {
      StudioService serviceOnB = replicaB.bean(StudioService.class);

      CompletableFuture<Void> second =
          CompletableFuture.runAsync(
              () -> {
                try {
                  firstInside.await(30, TimeUnit.SECONDS);
                  secondAccepted.set(
                      serviceOnB
                          .executeTest(
                              testId, owner, null, ObservedPublicationFixture.request(owner))
                          .executionId());
                } catch (Throwable t) {
                  secondFailure.set(t);
                } finally {
                  secondFinished.countDown();
                }
              });

      // Replica A takes the last slot and holds its transaction — and therefore the
      // transaction-scoped advisory locks — open. B blocks on the lock, not on the count.
      var grant = runAuthority.authorize(testId, owner, ObservedPublicationFixture.request(owner));
      transactions.executeWithoutResult(
          status -> {
            acceptanceService.acceptObserved(testId, OWNER, null, grant);
            firstInside.countDown();
            sleep(1500);
          });

      assertThat(secondFinished.await(60, TimeUnit.SECONDS)).isTrue();
      second.join();
    }

    assertThat(secondAccepted.get()).as("the second accept must not have succeeded").isNull();
    assertThat(secondFailure.get())
        .as("a read-then-insert would let both through; this is what the lock is for")
        .isInstanceOf(StudioQuotaExceededException.class);
  }

  @Test
  void aFullCsiDoesNotBlockADifferentCsiAndTheGlobalBoundIsNotConsumedTwice() {
    fillCsiToItsQuota(CSI_ID);
    UUID otherCsiTest =
        fixtures
            .seedRunnableTest("Other CSI draft", OTHER_CSI_ID, OWNER, List.of("Go home"))
            .testId();

    assertThatThrownBy(
            () ->
                studioService.executeTest(
                    testId, owner, null, ObservedPublicationFixture.request(owner)))
        .isInstanceOf(StudioQuotaExceededException.class);

    ExecutionSnapshotDto accepted =
        studioService.executeTest(
            otherCsiTest,
            StudioExecutionFixtures.identity(OWNER, OTHER_CSI_ID, "owner"),
            null,
            ObservedPublicationFixture.request(
                StudioExecutionFixtures.identity(OWNER, OTHER_CSI_ID, "owner")));
    assertThat(accepted.status()).isEqualTo("PENDING");
  }

  // ── AC-9: input limits ───────────────────────────────────────────────────

  @Test
  void aRevisionOverTheStepBoundIsRefused() {
    List<String> tooMany = new java.util.ArrayList<>();
    for (int index = 0; index < STEP_BOUND + 1; index++) {
      tooMany.add("Step " + index);
    }
    UUID huge = fixtures.seedRunnableTest("Too many steps", CSI_ID, OWNER, tooMany).testId();

    assertThatThrownBy(
            () ->
                studioService.executeTest(
                    huge, owner, null, ObservedPublicationFixture.request(owner)))
        .isInstanceOf(StudioValidationException.class)
        .hasFieldOrPropertyWithValue("code", "STEP_LIMIT_EXCEEDED");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private void fillCsiToOneBelowItsQuota(String csiId) {
    seedPendingLedgerRows(csiId, 19);
  }

  private void fillCsiToItsQuota(String csiId) {
    seedPendingLedgerRows(csiId, 20);
  }

  private void seedPendingLedgerRows(String csiId, int count) {
    UUID filler =
        fixtures.seedTest("Quota filler " + csiId, csiId, OWNER, List.of("Go to the home page"));
    for (int index = 0; index < count; index++) {
      jdbc.update(
          "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id,"
              + " csi_id, state) VALUES (?, NOW(), ?, ?, 'QUEUED')",
          UUID.randomUUID(),
          filler,
          csiId);
    }
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
