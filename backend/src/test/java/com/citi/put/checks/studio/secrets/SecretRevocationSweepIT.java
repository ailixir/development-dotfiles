package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/**
 * Real current-attempt/audit/flag SQL and counted resolver; bounded browser polling is a separate
 * join.
 */
class SecretRevocationSweepIT {
  private record Owner(
      GuidedSecretLoginMigrationTest.RetryFixture fixture,
      SecretAuditLifecycle lifecycle,
      StudioDispatchLedgerStatements ledger,
      SecretRevocationSweep sweep,
      AtomicBoolean permitted,
      AtomicInteger checks,
      FakeStudioVaultProvider vault,
      VaultStudioReferenceResolver resolver)
      implements AutoCloseable {
    @Override
    public void close() {
      fixture.close();
    }
  }

  private Owner owner() throws Exception {
    var f = GuidedSecretLoginMigrationTest.publishedRetry();
    var recorder = new SecretUseAuditRecorder(f.jdbc());
    var lifecycle = new SecretAuditLifecycle(f.jdbc(), recorder);
    var ledger = new StudioDispatchLedgerStatements(f.jdbc());
    ledger.installSecretAudit(lifecycle);
    var permitted = new AtomicBoolean(true);
    var checks = new AtomicInteger();
    StudioSecretUseAuthorization authority =
        (principal, csi, environment, id) -> {
          assertThat(principal).isEqualTo("owner@example.test");
          assertThat(csi).isEqualTo("CSI");
          assertThat(environment).isEqualTo("Development");
          assertThat(id).isEqualTo("PASS");
          checks.incrementAndGet();
          return permitted.get();
        };
    var vault = new FakeStudioVaultProvider(Map.of());
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of("CSI", "Development", f.testId()),
        "PASS",
        "SWEEP-PRIVATE-" + UUID.randomUUID());
    var resolver = new VaultStudioReferenceResolver(vault, authority);
    try (var resolved =
        resolver.resolve(
            "CSI",
            "Development",
            f.testId(),
            "owner@example.test",
            new ReferenceDeclarations(List.of(), List.of("PASS")))) {
      f.transaction()
          .executeWithoutResult(
              status -> {
                assertThat(
                        ledger.claim(
                            f.id(), "worker", Instant.now().plusSeconds(60), Instant.now()))
                    .isEqualTo(1);
                assertThat(
                        ledger.beginObservedDispatch(
                            f.id(),
                            "worker",
                            UUID.fromString(f.original().path("attemptId").asText())))
                    .isEqualTo(1);
                lifecycle.replayRelease(
                    f.original(),
                    List.of("PASS"),
                    resolved.secretVersions(),
                    SecretUseAuditRecorder.ResolutionOutcome.RESOLVED);
              });
    }
    checks.set(0);
    var environment = new StandardEnvironment();
    environment.setActiveProfiles("worker");
    var sweep =
        new SecretRevocationSweep(
            f.jdbc(),
            authority,
            recorder,
            new DataSourceTransactionManager(f.jdbc().getDataSource()),
            environment);
    return new Owner(f, lifecycle, ledger, sweep, permitted, checks, vault, resolver);
  }

  private int live(Owner owner) {
    return owner
        .fixture()
        .jdbc()
        .queryForObject(
            ("SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND decision_stage="
                + "'LIVE_RECHECK'"),
            Integer.class,
            owner.fixture().id());
  }

  @Test
  void actualCurrentReleaseDenyWritesOneFlagAndOneRecheckWithoutVaultReadsOrExtraUsage()
      throws Exception {
    try (var owner = owner()) {
      owner.permitted().set(false);
      assertThat(owner.sweep().executionRevoked(owner.fixture().id())).isTrue();
      var first =
          owner
              .fixture()
              .jdbc()
              .queryForObject(
                  "SELECT revoked_at FROM studio_dispatch_ledger WHERE execution_id=?",
                  java.sql.Timestamp.class,
                  owner.fixture().id());
      assertThat(owner.sweep().executionRevoked(owner.fixture().id())).isTrue();
      owner.sweep().sweep();
      assertThat(
              owner
                  .fixture()
                  .jdbc()
                  .queryForObject(
                      "SELECT revoked_at FROM studio_dispatch_ledger WHERE execution_id=?",
                      java.sql.Timestamp.class,
                      owner.fixture().id()))
          .isEqualTo(first);
      assertThat(live(owner)).isEqualTo(1);
      assertThat(owner.vault().readCount()).isEqualTo(1);
      assertThat(owner.checks().get()).isEqualTo(3);
      assertThat(
              owner
                  .fixture()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'",
                      Integer.class,
                      owner.fixture().id()))
          .isZero();
    }
  }

  @Test
  void settledRefusalCannotBecomeMidRunRevocationWhileQueuedOrClaimedForNextPass()
      throws Exception {
    try (var owner = owner()) {
      UUID attempt = UUID.fromString(owner.fixture().original().path("attemptId").asText());
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              status -> {
                owner.lifecycle().replayNoSend(owner.fixture().id(), attempt);
                assertThat(owner.ledger().returnAfterDefiniteRefusal(owner.fixture().id(), attempt))
                    .isEqualTo(1);
              });
      owner.permitted().set(false);
      owner.sweep().sweep();
      assertThat(owner.sweep().executionRevoked(owner.fixture().id())).isFalse();
      assertThat(
              owner
                  .ledger()
                  .claim(
                      owner.fixture().id(),
                      "next-worker",
                      Instant.now().plusSeconds(60),
                      Instant.now()))
          .isEqualTo(1);
      assertThat(owner.sweep().executionRevoked(owner.fixture().id())).isFalse();
      assertThat(live(owner)).isZero();
      assertThat(owner.checks().get()).isZero();
      assertThat(
              owner
                  .fixture()
                  .jdbc()
                  .queryForObject(
                      "SELECT revoked_at IS NULL FROM studio_dispatch_ledger WHERE execution_id=?",
                      Boolean.class,
                      owner.fixture().id()))
          .isTrue();
      assertThatThrownBy(
              () ->
                  owner
                      .resolver()
                      .resolve(
                          "CSI",
                          "Development",
                          owner.fixture().testId(),
                          "owner@example.test",
                          new ReferenceDeclarations(List.of(), List.of("PASS"))))
          .isInstanceOf(StudioReferenceResolver.SecretUseRevokedException.class);
      assertThat(owner.vault().readCount()).isEqualTo(1);
    }
  }

  @Test
  void terminalOwnerReceivesNoFreshAuthorizationCauseOrLiveAudit() throws Exception {
    try (var owner = owner()) {
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              status ->
                  assertThat(
                          owner
                              .ledger()
                              .closeByReaper(
                                  owner.fixture().id(),
                                  ExecutionErrorCode.DISPATCH_UNKNOWN,
                                  Instant.now()))
                      .isEqualTo(1));
      owner.permitted().set(false);
      owner.sweep().sweep();
      assertThat(owner.sweep().executionRevoked(owner.fixture().id())).isFalse();
      assertThat(owner.checks().get()).isZero();
      assertThat(live(owner)).isZero();
      assertThat(owner.vault().readCount()).isEqualTo(1);
      assertThat(
              owner
                  .fixture()
                  .jdbc()
                  .queryForObject(
                      "SELECT error_code FROM ui_test_executions WHERE id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("DISPATCH_UNKNOWN");
      assertThat(
              owner
                  .fixture()
                  .jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("UNKNOWN_OUTCOME");
    }
  }
}
