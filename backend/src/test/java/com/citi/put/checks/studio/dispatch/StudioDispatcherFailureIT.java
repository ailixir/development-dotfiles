package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.SecretAuditLifecycle;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Actual pre-send caller transaction and guarded PostgreSQL; separate from full browser dispatch.
 */
public class StudioDispatcherFailureIT {

  /** Local metadata observer; original settlement remains the only transaction authority. */
  public static final class RecordingDispatcher extends StudioDispatcher {
    public interface Observer {
      void record(
          com.fasterxml.jackson.databind.JsonNode binding,
          RuntimeException failure,
          String mappedCode,
          Instant dispatchTime);

      void failed();
    }

    private final Observer observer;
    private final Object[] graph;

    @SuppressWarnings("checkstyle:ParameterNumber")
    public RecordingDispatcher(
        StudioDispatchLedgerStatements statements,
        com.citi.put.checks.studio.UITestRevisionRepository revisions,
        DispatchAuthorization authorization,
        RunnerDispatchClient runner,
        com.citi.put.checks.studio.StudioExecutionProperties properties,
        ObjectMapper mapper,
        JdbcTemplate jdbc,
        org.springframework.transaction.support.TransactionTemplate transactions,
        Observer observer) {
      super(statements, revisions, authorization, runner, properties, mapper, jdbc, transactions);
      this.observer = observer;
      this.graph =
          new Object[] {statements, revisions, runner, properties, mapper, jdbc, transactions};
    }

    public boolean sameGraph(Object... expected) {
      if (expected.length != graph.length) {
        return false;
      }
      for (int i = 0; i < graph.length; i++) {
        if (expected[i] != graph[i]) {
          return false;
        }
      }
      return true;
    }

    @Override
    void settleObservedFailure(
        com.fasterxml.jackson.databind.JsonNode binding,
        RuntimeException failure,
        String mappedCode,
        Instant dispatchTime) {
      try {
        observer.record(binding, failure, mappedCode, dispatchTime);
      } catch (Throwable recordingFailure) {
        if (recordingFailure instanceof InterruptedException) {
          Thread.currentThread().interrupt();
        }
        try {
          observer.failed();
        } catch (Throwable ignored) {
          /* Original forward is unconditional. */
        }
      }
      super.settleObservedFailure(binding, failure, mappedCode, dispatchTime);
    }
  }

  private static final class Provider implements StudioVaultProvider {
    final FakeStudioVaultProvider fake = new FakeStudioVaultProvider(Map.of());
    final List<char[]> delivered = new ArrayList<>();

    public String name() {
      return "counted-atomic-failure";
    }

    public Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String id) {
      var entry = fake.read(kind, scope, id);
      entry.ifPresent(value -> delivered.add(value.value()));
      return entry;
    }

    public String create(VaultScope scope, String id, char[] value, List<String> origins) {
      return fake.create(scope, id, value, origins);
    }

    public List<String> listSecretNames(VaultScope scope) {
      return fake.listSecretNames(scope);
    }
  }

  private record Owner(
      GuidedSecretLoginMigrationTest.RetryFixture fixture,
      JdbcTemplate jdbc,
      StudioDispatchLedgerStatements ledger,
      StudioDispatcher dispatcher,
      Provider provider,
      VaultStudioReferenceResolver resolver,
      AtomicInteger sends,
      String canary)
      implements AutoCloseable {
    @Override
    public void close() {
      fixture.close();
    }
  }

  private Owner owner() throws Exception {
    var f = GuidedSecretLoginMigrationTest.publishedRetry();
    var jdbc = f.jdbc();
    var recorder = new SecretUseAuditRecorder(jdbc);
    var lifecycle = new SecretAuditLifecycle(jdbc, recorder);
    var ledger = new StudioDispatchLedgerStatements(jdbc);
    ledger.installSecretAudit(lifecycle);
    var provider = new Provider();
    String canary = "ATOMIC-FAILURE-" + UUID.randomUUID();
    provider.fake.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of("CSI", "Development", f.testId()),
        "PASS",
        canary + "L".repeat(4097));
    var resolver =
        new VaultStudioReferenceResolver(provider, (principal, csi, environment, id) -> true);
    var sends = new AtomicInteger();
    // This phase uses the real JDBC declaration lookup, resolver facts and owner transaction.
    // Unused dispatch acceptance ports are deliberately absent from this focused constructor.
    var runner =
        new RunnerDispatchClient() {
          @Override
          public DispatchOutcome send(RunJob job) {
            sends.incrementAndGet();
            throw new AssertionError("Pre-send failure reached runner");
          }

          @Override
          public CancelOutcome cancel(UUID id) {
            throw new AssertionError("Pre-send failure reached runner cancellation");
          }
        };
    var dispatcher =
        new StudioDispatcher(
            ledger,
            null,
            (execution, test, csi, principal) -> "test-dispatch-policy",
            runner,
            null,
            new ObjectMapper(),
            jdbc,
            f.transaction(),
            "worker",
            Clock.systemUTC());
    dispatcher.installSecretAudit(lifecycle);
    f.transaction()
        .executeWithoutResult(
            status ->
                assertThat(
                        ledger.claim(
                            f.id(), "worker", Instant.now().plusSeconds(60), Instant.now()))
                    .isEqualTo(1));
    return new Owner(f, jdbc, ledger, dispatcher, provider, resolver, sends, canary);
  }

  private RuntimeException actualFailure(Owner owner, boolean outage) {
    if (outage) {
      owner.provider().fake.makeUnavailable();
    }
    Throwable failure =
        catchThrowable(
            () ->
                owner
                    .resolver()
                    .resolve(
                        "CSI",
                        "Development",
                        owner.fixture().testId(),
                        "owner@example.test",
                        new ReferenceDeclarations(List.of(), List.of("PASS")),
                        id ->
                            owner
                                .fixture()
                                .transaction()
                                .executeWithoutResult(
                                    status ->
                                        new SecretUseAuditRecorder(owner.jdbc())
                                            .recordObservedReadEntry(
                                                owner.fixture().original(), "worker", id))));
    assertThat(failure).isInstanceOf(RuntimeException.class);
    assertThat(StudioReferenceResolver.decisionFacts(failure)).containsKey("PASS");
    owner.provider().delivered.forEach(chars -> assertThat(chars).containsOnly('\0'));
    return (RuntimeException) failure;
  }

  private void settle(Owner owner, RuntimeException failure, boolean outage) {
    owner
        .dispatcher()
        .settleObservedFailure(
            owner.fixture().original(),
            failure,
            outage ? null : ExecutionErrorCode.SECRET_TOO_LONG,
            Instant.now());
  }

  private int auditRows(Owner owner) {
    return owner
        .jdbc()
        .queryForObject(
            "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=?",
            Integer.class,
            owner.fixture().id());
  }

  private void privateAndUnsent(Owner owner, int reads) {
    assertThat(owner.sends().get()).isZero();
    assertThat(owner.provider().fake.readCount()).isEqualTo(reads);
    assertThat(
            owner
                .jdbc()
                .queryForObject(
                    ("SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND row_to_json(stu"
                        + "dio_secret_use_audit)::text LIKE ?"),
                    Integer.class,
                    owner.fixture().id(),
                    "%" + owner.canary() + "%"))
        .isZero();
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void genuineFailureDecisionAndItsTerminalOrRequeueTransitionCommitTogether(boolean outage)
      throws Exception {
    try (var owner = owner()) {
      settle(owner, actualFailure(owner, outage), outage);
      assertThat(auditRows(owner)).isEqualTo(2);
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo(outage ? "QUEUED" : "DONE");
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT outcome FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='RELEASE'",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo(outage ? "VAULT_UNAVAILABLE" : "UNAVAILABLE");
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("REFUSED");
      if (outage) {
        assertThat(
                owner
                    .jdbc()
                    .queryForObject(
                        "SELECT zero_send_decision_attempt_id FROM studio_dispatch_ledger WHERE execution_id=?",
                        UUID.class,
                        owner.fixture().id()))
            .isEqualTo(UUID.fromString(owner.fixture().original().path("attemptId").asText()));
      } else {
        assertThat(
                owner
                    .jdbc()
                    .queryForObject(
                        "SELECT error_code FROM ui_test_executions WHERE id=?",
                        String.class,
                        owner.fixture().id()))
            .isEqualTo("SECRET_TOO_LONG");
      }
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_secret_read_entries WHERE execution_id=?",
                      Integer.class,
                      owner.fixture().id()))
          .isEqualTo(1);
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT disposition FROM studio_observed_no_send_decisions WHERE execution_id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo(outage ? "REQUEUED" : "CLOSED");
      privateAndUnsent(owner, 1);
    }
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void injectedFailureAfterActualAuditAppendRollsBackDecisionAndOwnerTransition(boolean outage)
      throws Exception {
    try (var owner = owner()) {
      String target = outage ? "QUEUED" : "DONE";
      owner
          .jdbc()
          .execute(
              "CREATE FUNCTION atomic_failure_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='"
                  + target
                  + ("' THEN IF (SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=NEW.execut"
                      + "ion_id)<>2 THEN RAISE EXCEPTION 'missing genuine append before transition'; END IF; R"
                      + "AISE EXCEPTION 'controlled after-append failure'; END IF; RETURN NEW; END $$"));
      owner
          .jdbc()
          .execute(
              ("CREATE TRIGGER atomic_failure_probe BEFORE UPDATE ON studio_dispatch_ledger FOR EACH "
                  + "ROW EXECUTE FUNCTION atomic_failure_probe()"));
      RuntimeException failure = actualFailure(owner, outage);
      assertThatThrownBy(() -> settle(owner, failure, outage))
          .hasMessageContaining("controlled after-append failure");
      assertThat(auditRows(owner)).isZero();
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_no_send_decisions WHERE execution_id=?",
                      Integer.class,
                      owner.fixture().id()))
          .isZero();
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_secret_read_entries WHERE execution_id=?",
                      Integer.class,
                      owner.fixture().id()))
          .isEqualTo(1);
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("CLAIMED");
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT status FROM ui_test_executions WHERE id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("PENDING");
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      ("SELECT attempt_id IS NULL AND zero_send_decision_attempt_id IS NULL FROM studio_dispa"
                          + "tch_ledger WHERE execution_id=?"),
                      Boolean.class,
                      owner.fixture().id()))
          .isTrue();
      owner.jdbc().execute("DROP TRIGGER atomic_failure_probe ON studio_dispatch_ledger");
      settle(owner, actualFailure(owner, outage), outage);
      assertThat(auditRows(owner)).isEqualTo(2);
      privateAndUnsent(owner, 2);
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"cancel", "reaper"})
  void realCompetingTerminalWinnerPreventsBlockedFailureCallerFromAppendingFacts(String winner)
      throws Exception {
    try (var owner = owner();
        var pool = Executors.newFixedThreadPool(2)) {
      RuntimeException failure = actualFailure(owner, false);
      var locked = new CountDownLatch(1);
      var release = new CountDownLatch(1);
      var callerEntered = new CountDownLatch(1);
      var winning =
          pool.submit(
              () ->
                  owner
                      .fixture()
                      .transaction()
                      .executeWithoutResult(
                          status -> {
                            owner
                                .jdbc()
                                .queryForList(
                                    "SELECT execution_id FROM studio_dispatch_ledger WHERE execution_id=? FOR UPDATE",
                                    owner.fixture().id());
                            locked.countDown();
                            try {
                              if (!release.await(5, TimeUnit.SECONDS)) {
                                throw new IllegalStateException("winner barrier deadline");
                              }
                            } catch (InterruptedException interrupted) {
                              Thread.currentThread().interrupt();
                              throw new IllegalStateException(interrupted);
                            }
                            if (winner.equals("cancel")) {
                              assertThat(
                                      owner
                                          .ledger()
                                          .requestCancel(
                                              owner.fixture().id(),
                                              "owner@example.test",
                                              Instant.now()))
                                  .contains("DONE");
                            } else {
                              assertThat(
                                      owner
                                          .ledger()
                                          .closeByReaper(
                                              owner.fixture().id(),
                                              ExecutionErrorCode.DISPATCH_UNKNOWN,
                                              Instant.now()))
                                  .isEqualTo(1);
                            }
                          }));
      assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
      var losing =
          pool.submit(
              () -> {
                callerEntered.countDown();
                settle(owner, failure, false);
              });
      try {
        assertThat(callerEntered.await(5, TimeUnit.SECONDS)).isTrue();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        boolean blocked = false;
        while (System.nanoTime() < deadline && !blocked) {
          blocked =
              owner
                      .jdbc()
                      .queryForObject(
                          ("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%o"
                              + "bserved_revision_binding%' AND query LIKE '%FOR UPDATE OF l,e%'"),
                          Integer.class)
                  > 0;
          if (!blocked) {
            Thread.sleep(10);
          }
        }
        assertThat(blocked)
            .as("real failure caller waits on winner's PostgreSQL row lock")
            .isTrue();
      } finally {
        release.countDown();
      }
      winning.get(10, TimeUnit.SECONDS);
      losing.get(10, TimeUnit.SECONDS);
      assertThat(auditRows(owner)).isEqualTo(1);
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='RELEASE'",
                      Integer.class,
                      owner.fixture().id()))
          .isZero();
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("DONE");
      privateAndUnsent(owner, 1);
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"expired", "different-owner", "different-attempt"})
  void staleClaimIdentityCannotCommitRealFailureFacts(String change) throws Exception {
    try (var owner = owner()) {
      RuntimeException failure = actualFailure(owner, false);
      if (change.equals("expired")) {
        owner
            .jdbc()
            .update(
                "UPDATE studio_dispatch_ledger SET lease_expires_at=now()-interval '1 second' WHERE execution_id=?",
                owner.fixture().id());
      } else {
        if (change.equals("different-owner")) {
          owner
              .jdbc()
              .update(
                  "UPDATE studio_dispatch_ledger SET lease_owner='different-worker' WHERE execution_id=?",
                  owner.fixture().id());
        } else {
          var wrong =
              owner.fixture().original().deepCopy().put("attemptId", UUID.randomUUID().toString());
          owner
              .dispatcher()
              .settleObservedFailure(
                  wrong, failure, ExecutionErrorCode.SECRET_TOO_LONG, Instant.now());
          assertThat(auditRows(owner)).isZero();
          privateAndUnsent(owner, 1);
          return;
        }
      }
      settle(owner, failure, false);
      assertThat(auditRows(owner)).isZero();
      privateAndUnsent(owner, 1);
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"cancel", "reaper"})
  void lostControllerDecisionAfterActualReadRetainsPossibleReadAndNeverFabricatesUnused(
      String winner) throws Exception {
    try (var owner = owner()) {
      owner
          .provider()
          .fake
          .rotate(
              StudioVaultProvider.ReferenceKind.SECRET,
              VaultScope.of("CSI", "Development", owner.fixture().testId()),
              "PASS",
              owner.canary());
      try (var resolved =
          owner
              .resolver()
              .resolve(
                  "CSI",
                  "Development",
                  owner.fixture().testId(),
                  "owner@example.test",
                  new ReferenceDeclarations(List.of(), List.of("PASS")),
                  id ->
                      owner
                          .fixture()
                          .transaction()
                          .executeWithoutResult(
                              status ->
                                  new SecretUseAuditRecorder(owner.jdbc())
                                      .recordObservedReadEntry(
                                          owner.fixture().original(), "worker", id)))) {
        assertThat(resolved.secretVersions()).containsKey("PASS");
      }
      owner.provider().delivered.forEach(chars -> assertThat(chars).containsOnly('\0'));
      // Simulated controller loss discards transient resolution metadata before a dispatch
      // decision.
      // These actual terminal Java paths have no evidence authorizing a fabricated
      // RELEASE/NOT_USED.
      if (winner.equals("cancel")) {
        assertThat(
                owner
                    .ledger()
                    .requestCancel(owner.fixture().id(), "owner@example.test", Instant.now()))
            .contains("DONE");
      } else {
        var properties =
            new com.citi.put.checks.studio.StudioExecutionProperties(
                true, null, null, null, null, null, null, null, null, null, null, null);
        var reaper =
            new com.citi.put.checks.studio.recovery.PendingReaper(owner.ledger(), null, properties);
        Instant deadline =
            owner
                .jdbc()
                .queryForObject(
                    "SELECT pending_deadline_at FROM studio_dispatch_ledger WHERE execution_id=?",
                    java.sql.Timestamp.class,
                    owner.fixture().id())
                .toInstant();
        org.springframework.test.util.ReflectionTestUtils.setField(
            reaper, "clock", Clock.fixed(deadline.plusSeconds(1), java.time.ZoneOffset.UTC));
        assertThat(reaper.reapOnce()).isGreaterThanOrEqualTo(1);
        assertThat(reaper.reapOnce()).isZero();
      }
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_secret_read_entries WHERE execution_id=?",
                      Integer.class,
                      owner.fixture().id()))
          .isEqualTo(1);
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_no_send_decisions WHERE execution_id=?",
                      Integer.class,
                      owner.fixture().id()))
          .isZero();
      assertThat(auditRows(owner)).isEqualTo(1);
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      ("SELECT outcome IS NULL AND release_id IS NULL AND release_seq IS NULL AND vault_versi"
                          + "on IS NULL AND admission_id IS NULL AND coordinate_step_id IS NULL AND coordinate_ord"
                          + "inal IS NULL AND source_reference_id IS NULL FROM studio_secret_use_audit WHERE execu"
                          + "tion_id=?"),
                      Boolean.class,
                      owner.fixture().id()))
          .isTrue();
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements WHERE execution_id=?",
                      Integer.class,
                      owner.fixture().id()))
          .isEqualTo(1);
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("DONE");
      privateAndUnsent(owner, 1);
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"revoked", "cancel-flag", "cancel-winner", "different-owner"})
  void actualResolvedMetadataSurvivesDispatchCheckRefusalWhileOwnerLosersAppendNothing(
      String change) throws Exception {
    try (var owner = owner()) {
      var contracts = new com.citi.put.checks.studio.guided.session.GuidedContracts();
      var policy =
          contracts
              .object()
              .put("version", 1)
              .put("policyId", "policy")
              .put("policyVersion", "1")
              .put("applicationId", "app")
              .put("environment", "Development")
              .put("entryPolicyId", "entry")
              .putNull("applicationPolicy");
      policy.putArray("allowedOrigins").add("https://orders.example.test");
      policy.putArray("rules");
      var binding = owner.fixture().original().deepCopy();
      UUID id = UUID.randomUUID();
      binding
          .put("executionId", id.toString())
          .put(
              "currentPolicyHash",
              com.citi.put.checks.studio.guided.session.GuidedContracts.hash(policy));
      ((com.fasterxml.jackson.databind.node.ObjectNode) binding.path("replayGrant"))
          .put("executionId", id.toString())
          .put("grantId", UUID.randomUUID().toString())
          .put("currentPolicyHash", binding.path("currentPolicyHash").asText());
      var catalog = contracts.object();
      catalog.set("profile", binding.path("requiredProfile"));
      catalog.set("build", binding.path("requiredBuild"));
      var properties =
          new com.citi.put.checks.studio.guided.publication.ObservedReplayProperties(
              true,
              30000,
              1048576,
              4194304,
              2097152,
              new ObjectMapper().createArrayNode().add(catalog).toString(),
              new ObjectMapper().createArrayNode().add(policy).toString(),
              1280,
              720);
      var authorization =
          new com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization(
              owner.jdbc(),
              contracts,
              null,
              new com.citi.put.checks.studio.guided.publication.ObservedReplayPins(
                  contracts, properties),
              owner.resolver(),
              properties,
              new com.citi.put.checks.studio.StudioExecutionProperties(
                  true, null, null, null, null, null, null, null, null, null, null, null),
              Clock.systemUTC());
      org.springframework.test.util.ReflectionTestUtils.setField(
          owner.dispatcher(), "observed", authorization);
      Instant accepted = Instant.parse(binding.path("startedAt").asText());
      owner
          .jdbc()
          .update(
              ("INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,revision_id,csi_id,pri"
                  + "ncipal,environment,observed_revision_binding) VALUES (?,?,'PENDING',?,?,'CSI','owner@"
                  + "example.test','Development',?::jsonb)"),
              id,
              owner.fixture().testId(),
              java.sql.Timestamp.from(accepted),
              UUID.fromString(binding.path("revisionId").asText()),
              binding.toString());
      owner
          .jdbc()
          .update(
              ("INSERT INTO studio_dispatch_ledger(execution_id,execution_accepted_at,test_id,csi_id,"
                  + "principal,pending_deadline_at) VALUES (?,?,?,'CSI','owner@example.test',now()+interva"
                  + "l '5 minutes')"),
              id,
              java.sql.Timestamp.from(accepted),
              owner.fixture().testId());
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              t ->
                  assertThat(
                          owner
                              .ledger()
                              .claim(id, "worker", Instant.now().plusSeconds(60), Instant.now()))
                      .isEqualTo(1));
      owner
          .provider()
          .fake
          .rotate(
              StudioVaultProvider.ReferenceKind.SECRET,
              VaultScope.of("CSI", "Development", owner.fixture().testId()),
              "PASS",
              owner.canary());
      RuntimeException failure = null;
      String version;
      try (var resolved =
          new com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization.ResolvedJob(
              contracts.object(),
              owner
                  .resolver()
                  .resolve(
                      "CSI",
                      "Development",
                      owner.fixture().testId(),
                      "owner@example.test",
                      new ReferenceDeclarations(List.of(), List.of("PASS")),
                      secret ->
                          owner
                              .fixture()
                              .transaction()
                              .executeWithoutResult(
                                  t ->
                                      new SecretUseAuditRecorder(owner.jdbc())
                                          .recordObservedReadEntry(binding, "worker", secret))))) {
        version = resolved.resolved().secretVersions().get("PASS");
        // The actual authority checker validates the closed binding, catalog, policy and current
        // flags.
        authorization.check(binding);
        switch (change) {
          case "revoked" ->
              owner
                  .jdbc()
                  .update(
                      "UPDATE studio_dispatch_ledger SET revoked_at=now() WHERE execution_id=?",
                      id);
          case "cancel-flag" ->
              owner
                  .jdbc()
                  .update(
                      ("UPDATE studio_dispatch_ledger SET cancel_requested_at=now(),cancel_requested_by='owne"
                          + "r@example.test' WHERE execution_id=?"),
                      id);
          case "cancel-winner" ->
              owner
                  .fixture()
                  .transaction()
                  .executeWithoutResult(
                      t ->
                          assertThat(
                                  owner
                                      .ledger()
                                      .requestCancel(id, "owner@example.test", Instant.now()))
                              .contains("DONE"));
          case "different-owner" ->
              owner
                  .jdbc()
                  .update(
                      "UPDATE studio_dispatch_ledger SET lease_owner='other-worker' WHERE execution_id=?",
                      id);
          default -> throw new AssertionError("Unknown controlled owner case");
        }
        if (change.equals("different-owner")) {
          assertThat(
                  owner
                      .dispatcher()
                      .beginResolvedObservedDispatch(binding, List.of("PASS"), resolved))
              .isZero();
        } else {
          Throwable refused =
              catchThrowable(
                  () ->
                      owner
                          .dispatcher()
                          .beginResolvedObservedDispatch(binding, List.of("PASS"), resolved));
          assertThat(refused)
              .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
              .hasMessage("CANCELLED");
          failure = (RuntimeException) refused;
          assertThat(StudioReferenceResolver.decisionFacts(failure).get("PASS"))
              .isEqualTo(
                  new StudioReferenceResolver.Decision(
                      StudioReferenceResolver.DecisionOutcome.RESOLVED, version));
          assertThat(StudioReferenceResolver.positivelyNotEntered(failure)).isEmpty();
        }
      }
      owner.provider().delivered.forEach(chars -> assertThat(chars).containsOnly('\0'));
      if (failure != null) {
        owner
            .dispatcher()
            .settleObservedFailure(binding, failure, ExecutionErrorCode.CANCELLED, Instant.now());
      }
      boolean winner = change.equals("revoked") || change.equals("cancel-flag");
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=?",
                      Integer.class,
                      id))
          .isEqualTo(winner ? 2 : change.equals("cancel-winner") ? 1 : 0);
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_no_send_decisions WHERE execution_id=?",
                      Integer.class,
                      id))
          .isEqualTo(winner ? 1 : 0);
      if (change.equals("cancel-winner")) {
        assertThat(
                owner
                    .jdbc()
                    .queryForObject(
                        "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=?",
                        String.class,
                        id))
            .isEqualTo("UNKNOWN_OUTCOME");
        assertThat(
                owner
                    .jdbc()
                    .queryForObject(
                        "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='RELEASE'",
                        Integer.class,
                        id))
            .isZero();
      }
      if (winner) {
        assertThat(
                owner
                    .jdbc()
                    .queryForObject(
                        "SELECT outcome FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='RELEASE'",
                        String.class,
                        id))
            .isEqualTo("RESOLVED");
        assertThat(
                owner
                    .jdbc()
                    .queryForObject(
                        "SELECT vault_version FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='RELEASE'",
                        String.class,
                        id))
            .isEqualTo(version);
        assertThat(
                owner
                    .jdbc()
                    .queryForObject(
                        "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'",
                        String.class,
                        id))
            .isEqualTo("REFUSED");
        assertThat(
                owner
                    .jdbc()
                    .queryForObject(
                        "SELECT error_code FROM ui_test_executions WHERE id=?", String.class, id))
            .isEqualTo(change.equals("revoked") ? "AUTHORIZATION_REVOKED" : "CANCELLED");
      }
      assertThat(owner.provider().fake.readCount()).isEqualTo(1);
      assertThat(owner.sends().get()).isZero();
      assertThat(
              owner
                  .jdbc()
                  .queryForObject(
                      ("SELECT attempt_id IS NULL AND admission_id IS NULL FROM studio_dispatch_ledger WHERE "
                          + "execution_id=?"),
                      Boolean.class,
                      id))
          .isTrue();
    }
  }
}
