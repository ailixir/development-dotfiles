package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest;
import com.citi.put.checks.studio.recovery.PendingReaper;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.SecretAuditLifecycle;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Real direct caller entrypoints and PostgreSQL, with independent provider/send counts. No
 * process-kill/Core/browser claim.
 */
class ObservedTerminalSettlementIT {
  private record Context(
      GuidedSecretLoginMigrationTest.RetryFixture f,
      StudioDispatchLedgerStatements ledger,
      SecretUseAuditRecorder recorder,
      FakeStudioVaultProvider vault,
      AtomicInteger sends)
      implements AutoCloseable {
    @Override
    public void close() {
      f.close();
    }

    void claim() {
      assertThat(ledger.claim(f.id(), "worker", Instant.now().plusSeconds(60), Instant.now()))
          .isEqualTo(1);
    }

    void marker() {
      f.transaction()
          .executeWithoutResult(
              t -> recorder.recordObservedReadEntry(f.original(), "worker", "PASS"));
    }

    void read() {
      var resolver = new VaultStudioReferenceResolver(vault);
      try (var resolved =
          resolver.resolve(
              "CSI",
              "Development",
              f.testId(),
              "owner@example.test",
              new ReferenceDeclarations(List.of(), List.of("PASS")),
              secret ->
                  f.transaction()
                      .executeWithoutResult(
                          t -> recorder.recordObservedReadEntry(f.original(), "worker", secret)))) {
        assertThat(resolved.secretVersions()).containsKey("PASS");
      }
    }

    StudioDispatcher dispatcher(boolean enabled, Clock clock) {
      RunnerDispatchClient runner =
          new RunnerDispatchClient() {
            public DispatchOutcome send(RunJob job) {
              sends.incrementAndGet();
              throw new AssertionError("Pre-send terminal reached transport");
            }

            public CancelOutcome cancel(UUID execution) {
              sends.incrementAndGet();
              throw new AssertionError("Undispatched terminal reached cancel transport");
            }
          };
      var properties =
          new StudioExecutionProperties(
              enabled, null, null, null, null, null, null, null, null, null, null, null);
      var dispatcher =
          new StudioDispatcher(
              ledger,
              null,
              (execution, test, csi, principal) -> "test-dispatch-policy",
              runner,
              properties,
              new ObjectMapper(),
              f.jdbc(),
              f.transaction(),
              "worker",
              clock);
      dispatcher.installSecretAudit(new SecretAuditLifecycle(f.jdbc(), recorder));
      return dispatcher;
    }

    Clock pastPending() {
      return Clock.fixed(
          f.jdbc()
              .queryForObject(
                  "SELECT pending_deadline_at FROM studio_dispatch_ledger WHERE execution_id=?",
                  java.sql.Timestamp.class,
                  f.id())
              .toInstant()
              .plusSeconds(1),
          ZoneOffset.UTC);
    }

    void reap() {
      var reaper =
          new PendingReaper(
              ledger,
              null,
              new StudioExecutionProperties(
                  true, null, null, null, null, null, null, null, null, null, null, null));
      ReflectionTestUtils.setField(reaper, "clock", pastPending());
      assertThat(reaper.reapOnce()).isGreaterThanOrEqualTo(1);
    }
  }

  private Context context() throws Exception {
    var f = GuidedSecretLoginMigrationTest.publishedRetry(List.of("PASS", "NEXT"));
    var recorder = new SecretUseAuditRecorder(f.jdbc());
    var ledger = new StudioDispatchLedgerStatements(f.jdbc());
    ledger.installSecretAudit(new SecretAuditLifecycle(f.jdbc(), recorder));
    var vault = new FakeStudioVaultProvider(Map.of());
    for (String name : List.of("PASS", "NEXT")) {
      vault.rotate(
          StudioVaultProvider.ReferenceKind.SECRET,
          VaultScope.of("CSI", "Development", f.testId()),
          name,
          "TERMINAL-" + UUID.randomUUID());
    }
    return new Context(f, ledger, recorder, vault, new AtomicInteger());
  }

  private void settled(Context c, boolean possible, int physical) {
    assertThat(
            c.f()
                .jdbc()
                .queryForObject(
                    "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                    String.class,
                    c.f().id()))
        .isEqualTo("DONE");
    assertThat(
            c.f()
                .jdbc()
                .queryForObject(
                    "SELECT count(*) FROM studio_observed_terminal_secret_settlements WHERE execution_id=?",
                    Integer.class,
                    c.f().id()))
        .isEqualTo(1);
    assertThat(
            c.f()
                .jdbc()
                .queryForObject(
                    "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=?",
                    Integer.class,
                    c.f().id()))
        .isEqualTo(2);
    assertThat(
            c.f()
                .jdbc()
                .queryForObject(
                    "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=? AND secret_id='PASS'",
                    String.class,
                    c.f().id()))
        .isEqualTo(possible ? "UNKNOWN_OUTCOME" : "NOT_USED");
    assertThat(
            c.f()
                .jdbc()
                .queryForObject(
                    "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=? AND secret_id='NEXT'",
                    String.class,
                    c.f().id()))
        .isEqualTo("NOT_USED");
    assertThat(
            c.f()
                .jdbc()
                .queryForObject(
                    ("SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND (outcome IS NOT"
                        + " NULL OR release_id IS NOT NULL OR release_seq IS NOT NULL OR admission_id IS NOT NUL"
                        + "L OR vault_version IS NOT NULL OR coordinate_step_id IS NOT NULL OR coordinate_ordina"
                        + "l IS NOT NULL OR source_reference_id IS NOT NULL)"),
                    Integer.class,
                    c.f().id()))
        .isZero();
    assertThat(
            c.f()
                .jdbc()
                .queryForObject(
                    "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND attempt_id=?",
                    Integer.class,
                    c.f().id(),
                    c.f().original().path("attemptId").asText()))
        .isEqualTo(2);
    assertThat(c.vault().readCount()).isEqualTo(physical);
    assertThat(c.sends().get()).isZero();
    assertThat(c.ledger().requestCancel(c.f().id(), "owner@example.test", Instant.now())).isEmpty();
    assertThat(c.ledger().closeWithError(c.f().id(), "DISPATCH_FAILED", Instant.now())).isZero();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "queued",
        "live-claimed",
        "expired-claimed",
        "marker-before-call",
        "read-before-decision"
      })
  void directImmediateCancelSettlesFreshActualCutWithoutBorrowingAnExpiredLease(String position)
      throws Exception {
    try (var c = context()) {
      if (!position.equals("queued")) {
        c.claim();
      }
      if (position.equals("marker-before-call")) {
        c.marker();
      }
      if (position.equals("read-before-decision")) {
        c.read();
      }
      if (position.equals("expired-claimed")) {
        c.f()
            .jdbc()
            .update(
                "UPDATE studio_dispatch_ledger SET lease_expires_at=now()-interval '1 second' WHERE execution_id=?",
                c.f().id());
      }
      assertThat(c.ledger().requestCancel(c.f().id(), "owner@example.test", Instant.now()))
          .contains("DONE");
      settled(
          c,
          position.equals("marker-before-call") || position.equals("read-before-decision"),
          position.equals("read-before-decision") ? 1 : 0);
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT error_code FROM ui_test_executions WHERE id=?",
                      String.class,
                      c.f().id()))
          .isEqualTo("CANCELLED");
    }
  }

  @Test
  void missingObservedRuntimeCannotFallThroughToUntrackedLegacyValueResolver() throws Exception {
    try (var c = context()) {
      assertThat(c.dispatcher(true, Clock.systemUTC()).dispatchOnce()).isZero();
      settled(c, false, 0);
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT error_code FROM ui_test_executions WHERE id=?",
                      String.class,
                      c.f().id()))
          .isEqualTo("DISPATCH_FAILED");
    }
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void actualDispatcherPastDeadlineClosesWithoutResolutionOrTransport(boolean possible)
      throws Exception {
    try (var c = context()) {
      if (possible) {
        c.claim();
        c.marker();
        assertThat(c.ledger().releaseClaim(c.f().id())).isEqualTo(1);
      }
      assertThat(c.dispatcher(true, c.pastPending()).dispatchOnce()).isZero();
      settled(c, possible, 0);
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"queued", "marker-before-call", "read-before-decision"})
  void actualKillSwitchEntryClosesOnlyUndispatchedWorkWithoutAnotherRead(String position)
      throws Exception {
    try (var c = context()) {
      if (!position.equals("queued")) {
        c.claim();
      }
      if (position.equals("marker-before-call")) {
        c.marker();
      }
      if (position.equals("read-before-decision")) {
        c.read();
      }
      var dispatcher = c.dispatcher(false, Clock.systemUTC());
      assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
      assertThat(dispatcher.closeUndispatchedWork()).isZero();
      settled(c, !position.equals("queued"), position.equals("read-before-decision") ? 1 : 0);
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"cancel", "close", "reaper", "kill-switch"})
  void externalCallerRollbackUndoesActualReceiptSummariesHistoryAndLedger(String entrypoint)
      throws Exception {
    try (var c = context()) {
      c.claim();
      assertThatThrownBy(
              () ->
                  c.f()
                      .transaction()
                      .executeWithoutResult(
                          t -> {
                            switch (entrypoint) {
                              case "cancel" ->
                                  assertThat(
                                          c.ledger()
                                              .requestCancel(
                                                  c.f().id(), "owner@example.test", Instant.now()))
                                      .contains("DONE");
                              case "close" ->
                                  assertThat(
                                          c.ledger()
                                              .closeWithError(
                                                  c.f().id(), "DISPATCH_FAILED", Instant.now()))
                                      .isEqualTo(1);
                              case "reaper" -> c.reap();
                              case "kill-switch" ->
                                  assertThat(
                                          c.dispatcher(false, Clock.systemUTC())
                                              .closeUndispatchedWork())
                                      .isEqualTo(1);
                              default -> throw new AssertionError("Unknown terminal caller");
                            }
                            assertThat(
                                    c.f()
                                        .jdbc()
                                        .queryForObject(
                                            "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=?",
                                            Integer.class,
                                            c.f().id()))
                                .isEqualTo(2);
                            throw new IllegalStateException(
                                "controlled external terminal rollback");
                          }))
          .hasMessage("controlled external terminal rollback");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      c.f().id()))
          .isEqualTo("CLAIMED");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT status FROM ui_test_executions WHERE id=?", String.class, c.f().id()))
          .isEqualTo("PENDING");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements WHERE execution_id=?",
                      Integer.class,
                      c.f().id()))
          .isZero();
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=?",
                      Integer.class,
                      c.f().id()))
          .isZero();
      assertThat(c.vault().readCount()).isZero();
      assertThat(c.sends().get()).isZero();
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"receipt", "audit"})
  void actualAppendFailureCannotCommitAnyPartOfImmediateTerminalCut(String sink) throws Exception {
    try (var c = context()) {
      String table =
          sink.equals("receipt")
              ? "studio_observed_terminal_secret_settlements"
              : "studio_secret_use_audit";
      c.f()
          .jdbc()
          .execute(
              ("CREATE FUNCTION terminal_fault_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN R"
                  + "AISE EXCEPTION 'controlled terminal append failure'; END $$"));
      c.f()
          .jdbc()
          .execute(
              "CREATE TRIGGER terminal_fault_probe BEFORE INSERT ON "
                  + table
                  + " FOR EACH ROW EXECUTE FUNCTION terminal_fault_probe()");
      assertThatThrownBy(
              () -> c.ledger().requestCancel(c.f().id(), "owner@example.test", Instant.now()))
          .hasMessageContaining("controlled terminal append failure");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      c.f().id()))
          .isEqualTo("QUEUED");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT status FROM ui_test_executions WHERE id=?", String.class, c.f().id()))
          .isEqualTo("PENDING");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements WHERE execution_id=?",
                      Integer.class,
                      c.f().id()))
          .isZero();
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=?",
                      Integer.class,
                      c.f().id()))
          .isZero();
      assertThat(c.vault().readCount()).isZero();
      assertThat(c.sends().get()).isZero();
    }
  }

  @Test
  void actualNestedSavepointCannotEstablishACommittableTerminalWinnerVersion() throws Exception {
    try (var c = context()) {
      c.claim();
      var manager =
          new org.springframework.jdbc.datasource.DataSourceTransactionManager(
              c.f().jdbc().getDataSource());
      manager.setNestedTransactionAllowed(true);
      var nested = new org.springframework.transaction.support.TransactionTemplate(manager);
      nested.setPropagationBehavior(
          org.springframework.transaction.TransactionDefinition.PROPAGATION_NESTED);
      Throwable failure =
          catchThrowable(
              () ->
                  c.f()
                      .transaction()
                      .executeWithoutResult(
                          t ->
                              nested.executeWithoutResult(
                                  n -> {
                                    assertThat(n.hasSavepoint()).isTrue();
                                    assertThat(
                                            c.ledger()
                                                .requestCancel(
                                                    c.f().id(),
                                                    "owner@example.test",
                                                    Instant.now()))
                                        .contains("DONE");
                                  })));
      assertThat(failure).isInstanceOf(RuntimeException.class);
      Throwable cursor = failure;
      while (cursor.getCause() != null) {
        cursor = cursor.getCause();
      }
      assertThat(cursor).isInstanceOf(org.postgresql.util.PSQLException.class);
      var postgres = (org.postgresql.util.PSQLException) cursor;
      assertThat(postgres.getServerErrorMessage()).isNotNull();
      assertThat(postgres.getServerErrorMessage().getMessage())
          .isEqualTo(
              "terminal secret settlement requires exact top-transaction winner and locator");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      c.f().id()))
          .isEqualTo("CLAIMED");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements WHERE execution_id=?",
                      Integer.class,
                      c.f().id()))
          .isZero();
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=?",
                      Integer.class,
                      c.f().id()))
          .isZero();
    }
  }

  @Test
  void realDispatchingCancelIsRequestOnlyAndKillSwitchCannotCloseIt() throws Exception {
    try (var c = context()) {
      c.claim();
      var resolver = new VaultStudioReferenceResolver(c.vault());
      try (var resolved =
          resolver.resolve(
              "CSI",
              "Development",
              c.f().testId(),
              "owner@example.test",
              new ReferenceDeclarations(List.of(), List.of("PASS", "NEXT")),
              secret ->
                  c.f()
                      .transaction()
                      .executeWithoutResult(
                          t ->
                              c.recorder()
                                  .recordObservedReadEntry(c.f().original(), "worker", secret)))) {
        c.f()
            .transaction()
            .executeWithoutResult(
                t -> {
                  assertThat(
                          c.ledger()
                              .beginObservedDispatch(
                                  c.f().id(),
                                  "worker",
                                  UUID.fromString(c.f().original().path("attemptId").asText())))
                      .isEqualTo(1);
                  new SecretAuditLifecycle(c.f().jdbc(), c.recorder())
                      .replayRelease(
                          c.f().original(),
                          List.of("PASS", "NEXT"),
                          resolved.secretVersions(),
                          SecretUseAuditRecorder.ResolutionOutcome.RESOLVED);
                });
      }
      assertThat(c.ledger().requestCancel(c.f().id(), "owner@example.test", Instant.now()))
          .contains("DISPATCHING");
      assertThat(c.ledger().requestCancel(c.f().id(), "owner@example.test", Instant.now()))
          .isEmpty();
      assertThat(
              c.ledger().closeUndispatchedWithError(c.f().id(), "DISPATCH_DISABLED", Instant.now()))
          .isZero();
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT status FROM ui_test_executions WHERE id=?", String.class, c.f().id()))
          .isEqualTo("PENDING");
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements WHERE execution_id=?",
                      Integer.class,
                      c.f().id()))
          .isZero();
      assertThat(
              c.f()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'",
                      Integer.class,
                      c.f().id()))
          .isZero();
      assertThat(c.vault().readCount()).isEqualTo(2);
      assertThat(c.sends().get()).isZero();
    }
  }

  @Test
  void waitedForCommittedEntryWriterGetsFreshPossibleReadClassificationAtRealCancelCut()
      throws Exception {
    try (var c = context();
        var threads = Executors.newFixedThreadPool(2)) {
      c.claim();
      var entered = new CountDownLatch(1);
      var finish = new CountDownLatch(1);
      var writer =
          threads.submit(
              () ->
                  c.f()
                      .transaction()
                      .executeWithoutResult(
                          t -> {
                            c.recorder()
                                .recordObservedReadEntry(c.f().original(), "worker", "PASS");
                            entered.countDown();
                            try {
                              if (!finish.await(10, TimeUnit.SECONDS)) {
                                throw new IllegalStateException("marker barrier deadline");
                              }
                            } catch (InterruptedException e) {
                              Thread.currentThread().interrupt();
                              throw new IllegalStateException(e);
                            }
                          }));
      assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
      var closer =
          threads.submit(
              () -> c.ledger().requestCancel(c.f().id(), "owner@example.test", Instant.now()));
      try {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        boolean waiting = false;
        while (System.nanoTime() < deadline && !waiting) {
          waiting =
              c.f()
                      .jdbc()
                      .queryForObject(
                          ("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%e"
                              + ".observed_revision_binding%' AND query LIKE '%FOR UPDATE OF l,e%'"),
                          Integer.class)
                  > 0;
          if (!waiting) {
            Thread.sleep(10);
          }
        }
        assertThat(waiting).as("actual cancel waits for marker writer owner row").isTrue();
      } finally {
        finish.countDown();
      }
      writer.get(10, TimeUnit.SECONDS);
      assertThat(closer.get(10, TimeUnit.SECONDS)).contains("DONE");
      settled(c, true, 0);
    }
  }
}
