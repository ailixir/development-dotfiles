package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Real guarded PostgreSQL and counted provider boundary; no process-crash/browser claim. */
class ObservedReadEntryProtocolIT {
  private static final ReferenceDeclarations DECLARED =
      new ReferenceDeclarations(List.of(), List.of("PASS"));

  private record Context(
      GuidedSecretLoginMigrationTest.RetryFixture fixture,
      ObservedReplayAuthorization authorization,
      SecretUseAuditRecorder recorder,
      VaultStudioReferenceResolver resolver,
      AtomicInteger physicalReads)
      implements AutoCloseable {
    @Override
    public void close() {
      fixture.close();
    }

    int markers() {
      return fixture
          .jdbc()
          .queryForObject(
              "SELECT count(*) FROM studio_observed_secret_read_entries WHERE execution_id=?",
              Integer.class,
              fixture.id());
    }

    StudioReferenceResolver.ValueReadEntry committedMarker() {
      return secret ->
          fixture
              .transaction()
              .executeWithoutResult(
                  t -> recorder.recordObservedReadEntry(fixture.original(), "worker", secret));
    }

    StudioReferenceResolver.Resolved resolve(StudioReferenceResolver.ValueReadEntry callback) {
      return resolver.resolve(
          "CSI",
          "Development",
          fixture.testId(),
          "owner@example.test",
          DECLARED,
          authorization.trackedReadEntry(fixture.original(), callback));
    }
  }

  private Context context() throws Exception {
    var fixture = GuidedSecretLoginMigrationTest.publishedRetry();
    var ledger = new StudioDispatchLedgerStatements(fixture.jdbc());
    assertThat(ledger.claim(fixture.id(), "worker", Instant.now().plusSeconds(60), Instant.now()))
        .isEqualTo(1);
    var fake = new FakeStudioVaultProvider(Map.of());
    var scope = VaultScope.of("CSI", "Development", fixture.testId());
    fake.rotate(
        StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS", "READ-ENTRY-" + UUID.randomUUID());
    var physicalReads = new AtomicInteger();
    StudioVaultProvider provider =
        new StudioVaultProvider() {
          public String name() {
            return "counted-committed-entry";
          }

          public Optional<VaultEntry> read(ReferenceKind kind, VaultScope actual, String secret) {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(
                    fixture
                        .jdbc()
                        .queryForObject(
                            ("SELECT count(*) FROM studio_observed_secret_read_entries "
                                + "WHERE execution_id=? AND secret_id=?"),
                            Integer.class,
                            fixture.id(),
                            secret))
                .isEqualTo(1);
            physicalReads.incrementAndGet();
            return fake.read(kind, actual, secret);
          }

          public String create(
              VaultScope actual, String secret, char[] value, List<String> origins) {
            return fake.create(actual, secret, value, origins);
          }

          public List<String> listSecretNames(VaultScope actual) {
            return fake.listSecretNames(actual);
          }
        };
    return new Context(
        fixture,
        new ObservedReplayAuthorization(
            fixture.jdbc(), new GuidedContracts(), null, null, null, null, null, Clock.systemUTC()),
        new SecretUseAuditRecorder(fixture.jdbc()),
        new VaultStudioReferenceResolver(provider),
        physicalReads);
  }

  @Test
  void actualProviderObservesCommittedScopedEntryBeforeItsOnlyValueRead() throws Exception {
    try (var context = context();
        var resolved = context.resolve(context.committedMarker())) {
      assertThat(resolved.secretVersions()).containsKey("PASS");
      assertThat(context.markers()).isEqualTo(1);
      assertThat(context.physicalReads().get()).isEqualTo(1);
    }
  }

  @Test
  void markerRollbackPreventsPhysicalProviderEntry() throws Exception {
    try (var context = context()) {
      assertThatThrownBy(
              () ->
                  context.resolve(
                      secret ->
                          context
                              .fixture()
                              .transaction()
                              .executeWithoutResult(
                                  t -> {
                                    context
                                        .recorder()
                                        .recordObservedReadEntry(
                                            context.fixture().original(), "worker", secret);
                                    throw new IllegalStateException("controlled entry rollback");
                                  })))
          .hasMessage("controlled entry rollback");
      assertThat(context.markers()).isZero();
      assertThat(context.physicalReads().get()).isZero();
    }
  }

  @Test
  void noopObserverCannotSupplyAnUncommittedOrMissingEntry() throws Exception {
    try (var context = context()) {
      assertThatThrownBy(
              () ->
                  context.resolve(
                      secret -> {
                        // Deliberately no effect at this observer boundary.
                      }))
          .hasMessage("RUNTIME_INCOMPATIBLE");
      assertThat(context.markers()).isZero();
      assertThat(context.physicalReads().get()).isZero();
    }
  }

  @Test
  void externalCallerTransactionCannotReadThroughItsUncommittedMarker() throws Exception {
    try (var context = context()) {
      assertThatThrownBy(
              () ->
                  context
                      .fixture()
                      .transaction()
                      .executeWithoutResult(
                          t -> {
                            context
                                .recorder()
                                .recordObservedReadEntry(
                                    context.fixture().original(), "worker", "PASS");
                            assertThat(context.markers()).isEqualTo(1);
                            assertThatThrownBy(
                                    () ->
                                        context.resolve(
                                            secret -> {
                                              // Deliberately no effect at this observer boundary.
                                            }))
                                .hasMessage("RUNTIME_INCOMPATIBLE");
                            assertThat(context.physicalReads().get()).isZero();
                            throw new IllegalStateException("controlled external rollback");
                          }))
          .hasMessage("controlled external rollback");
      assertThat(context.markers()).isZero();
      assertThat(context.physicalReads().get()).isZero();
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"attemptId", "revisionId", "csiId", "environment"})
  void anotherScopedBindingCannotBorrowAnExistingCommittedEntry(String field) throws Exception {
    try (var context = context()) {
      context.committedMarker().beforeRead("PASS");
      var wrong =
          context
              .fixture()
              .original()
              .deepCopy()
              .put(field, field.endsWith("Id") ? UUID.randomUUID().toString() : "other-scope");
      assertThatThrownBy(
              () ->
                  context
                      .resolver()
                      .resolve(
                          "CSI",
                          "Development",
                          context.fixture().testId(),
                          "owner@example.test",
                          DECLARED,
                          context
                              .authorization()
                              .trackedReadEntry(
                                  wrong,
                                  secret -> {
                                    // Deliberately no effect at this observer boundary.
                                  })))
          .hasMessage("RUNTIME_INCOMPATIBLE");
      assertThat(context.markers()).isEqualTo(1);
      assertThat(context.physicalReads().get()).isZero();
    }
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void abandonedOwnerMarkerCannotAuthorizeNewOwnerReadWithoutGenuineRetry(boolean oldReadOccurred)
      throws Exception {
    try (var context = context()) {
      if (oldReadOccurred) {
        try (var resolved = context.resolve(context.committedMarker())) {
          assertThat(resolved.secretVersions()).containsKey("PASS");
        }
      } else {
        context.committedMarker().beforeRead("PASS");
      }
      int before = context.physicalReads().get();
      assertThat(before).isEqualTo(oldReadOccurred ? 1 : 0);
      var ledger = new StudioDispatchLedgerStatements(context.fixture().jdbc());
      ledger.installSecretAudit(
          new com.citi.put.checks.studio.secrets.SecretAuditLifecycle(
              context.fixture().jdbc(), context.recorder()));
      var properties =
          new com.citi.put.checks.studio.StudioExecutionProperties(
              true, null, null, null, null, null, null, null, null, null, null, null);
      var reaper = new com.citi.put.checks.studio.recovery.PendingReaper(ledger, null, properties);
      Instant expired =
          context
              .fixture()
              .jdbc()
              .queryForObject(
                  "SELECT lease_expires_at FROM studio_dispatch_ledger WHERE execution_id=?",
                  java.sql.Timestamp.class,
                  context.fixture().id())
              .toInstant()
              .plusSeconds(1);
      org.springframework.test.util.ReflectionTestUtils.setField(
          reaper, "clock", Clock.fixed(expired, java.time.ZoneOffset.UTC));
      assertThat(reaper.reapOnce()).isEqualTo(1);
      assertThat(
              ledger.claim(
                  context.fixture().id(),
                  "next-worker",
                  Instant.now().plusSeconds(60),
                  Instant.now()))
          .isEqualTo(1);
      assertThatThrownBy(
              () ->
                  context.resolve(
                      secret ->
                          context
                              .fixture()
                              .transaction()
                              .executeWithoutResult(
                                  t ->
                                      context
                                          .recorder()
                                          .recordObservedReadEntry(
                                              context.fixture().original(),
                                              "next-worker",
                                              secret))))
          .hasMessage("RUNTIME_INCOMPATIBLE");
      assertThat(context.physicalReads().get()).isEqualTo(before);
      assertThat(context.markers()).isEqualTo(1);
      assertThat(
              context
                  .fixture()
                  .jdbc()
                  .queryForObject(
                      "SELECT lease_owner FROM studio_observed_secret_read_entries WHERE execution_id=?",
                      String.class,
                      context.fixture().id()))
          .isEqualTo("worker");
      assertThat(ledger.closeWithError(context.fixture().id(), "DISPATCH_FAILED", Instant.now()))
          .isEqualTo(1);
      assertThat(
              context
                  .fixture()
                  .jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=?",
                      String.class,
                      context.fixture().id()))
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(
              context
                  .fixture()
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='RELEASE'",
                      Integer.class,
                      context.fixture().id()))
          .isZero();
      assertThat(context.physicalReads().get()).isEqualTo(before);
    }
  }

  @Test
  void unsupportedCustomResolverFailsClosedBeforeLegacyValueMethodOrMarker() throws Exception {
    var legacyCalls = new AtomicInteger();
    var markerCalls = new AtomicInteger();
    StudioReferenceResolver unsupported =
        new StudioReferenceResolver() {
          public void preflight(
              String csi,
              String environment,
              UUID test,
              String principal,
              ReferenceDeclarations declared) {}

          public Resolved resolve(
              String csi,
              String environment,
              UUID test,
              String principal,
              ReferenceDeclarations declared) {
            legacyCalls.incrementAndGet();
            throw new AssertionError("Unsupported tracked dispatch invoked legacy resolver");
          }
        };
    assertThatThrownBy(
            () ->
                unsupported.resolve(
                    "CSI",
                    "Development",
                    UUID.randomUUID(),
                    "owner@example.test",
                    DECLARED,
                    secret -> markerCalls.incrementAndGet()))
        .hasMessage("Reference resolver does not provide tracked value-read entry");
    assertThat(legacyCalls.get()).isZero();
    assertThat(markerCalls.get()).isZero();
  }
}
