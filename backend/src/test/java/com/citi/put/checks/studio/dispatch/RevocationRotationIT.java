package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Story 10.17 AC-7a, AC-8, AC-10 and AC-12's persistence half.
 *
 * <p>Two conditions that can only happen <em>between</em> the acceptance transaction and the
 * dispatcher's claim, which is the window §5.1.3 exists for: a reference deleted from the vault,
 * and a value rotated. Each is arranged where it actually lives, in the vault, rather than by
 * editing the platform {@code secrets} table, which the stub resolver used to read and which this
 * story no longer touches at all.
 *
 * <p>In every refusal case the assertion that matters is the <b>request count on the recording
 * dispatch client</b>, not a log line: the codes both mean <em>the send never happened</em>, and
 * counting what left the process is the only form of that claim which fails when it is false.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
class RevocationRotationIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60461";
  private static final String OWNER = "rotation-owner@citi.com";
  private static final String ENVIRONMENT = "Production";
  private static final String SECRET_ID = "LOGIN_PW";
  private static final String OLD_VALUE = "Rotation-Old-Value-4d1a7f";
  private static final String NEW_VALUE = "Rotation-New-Value-9b2c53";

  @TestConfiguration
  static class Fakes {

    @Bean
    @Primary
    RecordingRunnerDispatchClient recordingRunnerDispatchClient() {
      return new RecordingRunnerDispatchClient();
    }

    @Bean
    @Primary
    FakeStudioVaultProvider fakeStudioVaultProvider() {
      return new FakeStudioVaultProvider(Map.of());
    }
  }

  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private FakeStudioVaultProvider vault;
  @Autowired private JdbcTemplate jdbc;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private UUID testId;

  @BeforeEach
  void setUp() {
    runner.reset();
    vault.clear();
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");

    testId = fixtures.seedTest("Rotation draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        testId,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of(SECRET_ID)));
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, testId),
        SECRET_ID,
        OLD_VALUE);
  }

  private UUID accept() {
    return studioService
        .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
        .executionId();
  }

  private String errorCode(UUID executionId) {
    return jdbc.queryForObject(
        "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, executionId);
  }

  private String snapshot(UUID executionId) {
    return jdbc.queryForObject(
        "SELECT COALESCE(configuration_snapshot::text, '') FROM ui_test_executions WHERE id = ?",
        String.class,
        executionId);
  }

  // ── AC-7a ────────────────────────────────────────────────────────────────────────────────────

  @Test
  void aReferenceDeletedFromTheVaultBetweenAcceptanceAndDispatchIsTerminalAndNothingIsSent() {
    UUID execution = accept();

    vault.delete(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, testId),
        SECRET_ID);
    dispatcher.dispatch(execution);

    // A fact about the draft and its environment (ADR-002 §15.3).
    assertThat(errorCode(execution)).isEqualTo(ExecutionErrorCode.REFERENCE_UNAVAILABLE);
    assertThat(runner.sendCount()).as("POST /v1/runs was issued for a vanished reference").isZero();
  }

  /**
   * The permit companion. Without it, both refusals above would be satisfied by a dispatcher that
   * refused everything.
   */
  @Test
  void theSameExecutionWithTheReferenceIntactIsDispatched() {
    UUID execution = accept();
    var received = new java.util.concurrent.atomic.AtomicBoolean();
    runner.onSend(job -> received.set(job.resolvedSecrets().get(SECRET_ID).matches(OLD_VALUE)));
    dispatcher.dispatch(execution);
    assertThat(received).isTrue();
    assertThat(runner.sendCount()).isEqualTo(1);
    assertThat(runner.sent().get(0).resolvedSecrets()).containsKey(SECRET_ID);
    assertThat(runner.sent().get(0).resolvedSecrets().get(SECRET_ID).matches(OLD_VALUE))
        .as("owned secret was erased after send")
        .isFalse();
    assertThat(errorCode(execution)).isNull();
  }

  // ── AC-8 ─────────────────────────────────────────────────────────────────────────────────────

  /**
   * Rotation takes effect at dispatch, exposes nothing, persists nothing and provokes no recompile.
   *
   * <p>One run, and every clause of AC-8 asserted on it.
   */
  @Test
  void aRotationBetweenAcceptanceAndDispatchUsesTheNewValueAndReconfirmsNothing() {
    UUID execution = accept();
    Map<String, Object> before = revisionBinding();

    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, testId),
        SECRET_ID,
        NEW_VALUE);
    var received = new java.util.concurrent.atomic.AtomicBoolean();
    runner.onSend(job -> received.set(job.resolvedSecrets().get(SECRET_ID).matches(NEW_VALUE)));
    dispatcher.dispatch(execution);
    assertThat(received).isTrue();

    assertThat(runner.sendCount()).isEqualTo(1);
    RunJob job = runner.sent().get(0);
    // The browser receives the new value…
    assertThat(job.resolvedSecrets()).containsKey(SECRET_ID);
    assertThat(job.resolvedSecrets().get(SECRET_ID).matches(NEW_VALUE))
        .as("owned secret erased after send")
        .isFalse();
    // …and the old value appears nowhere on the wire or in any column.
    assertThat(job.toString()).doesNotContain(OLD_VALUE);
    assertThat(snapshot(execution)).doesNotContain(OLD_VALUE).doesNotContain(NEW_VALUE);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM studio_dispatch_ledger WHERE execution_id = ?"
                    + " AND CAST(studio_dispatch_ledger AS text) LIKE ?",
                Integer.class,
                execution,
                "%" + NEW_VALUE + "%"))
        .isZero();

    // Nothing was reconfirmed: the revision binding and the compile status are untouched.
    assertThat(revisionBinding()).isEqualTo(before);

    // …and the nonsecret version identifier is recorded. STUDIO-OBS-012A: an observed dispatch
    // records it on the immutable secret-use release fact, not on the artifact-1 dispatcher's
    // `configuration_snapshot` key.
    assertThat(versionsOf(execution)).isNotBlank();
  }

  /**
   * The version identifier is not an oracle.
   *
   * <p>Rotating a value <em>to itself</em> still changes the identifier, so two identifiers can
   * never be used to answer "are these the same value". That is what §4.2's word <em>nonsecret</em>
   * has to mean for an identifier that travels beside a secret.
   */
  @Test
  void rotatingAValueToItselfStillChangesTheVersionIdentifier() {
    UUID first = accept();
    dispatcher.dispatch(first);
    String beforeVersions = versionsOf(first);

    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, testId),
        SECRET_ID,
        OLD_VALUE);
    runner.reset();
    UUID second = accept();
    dispatcher.dispatch(second);
    String afterVersions = versionsOf(second);

    assertThat(beforeVersions).isNotBlank();
    assertThat(afterVersions).isNotBlank();
    assertThat(afterVersions)
        .as("an identifier that only changed when the bytes changed would be a comparison oracle")
        .isNotEqualTo(beforeVersions);
    // And neither identifier is the value, a prefix of it, or derived from it in any readable way.
    assertThat(beforeVersions + afterVersions)
        .doesNotContain(OLD_VALUE)
        .doesNotContain(OLD_VALUE.substring(0, 6))
        .doesNotContain(Integer.toHexString(OLD_VALUE.hashCode()));
  }

  /**
   * The vault version identifier the dispatch released the secret under: the observed replay's
   * immutable {@code RELEASE} fact at the {@code DISPATCH} stage (V34 secret-use audit).
   */
  private String versionsOf(UUID executionId) {
    return jdbc.queryForObject(
        "SELECT COALESCE(max(vault_version), '') FROM studio_secret_use_audit"
            + " WHERE execution_id = ? AND secret_id = ? AND row_kind = 'RELEASE'"
            + " AND decision_stage = 'DISPATCH'",
        String.class,
        executionId,
        SECRET_ID);
  }

  private Map<String, Object> revisionBinding() {
    return jdbc.queryForMap(
        "SELECT t.confirmed_revision_id, t.source_revision,"
            + " t.configuration_revision, r.artifact_hash"
            + " FROM ui_tests t JOIN ui_test_revisions r ON r.id = t.confirmed_revision_id"
            + " WHERE t.id = ?",
        testId);
  }

  // ── QA LOW-4: the deadlines a dispatch sends ─────────────────────────────────────────────────

  /**
   * The permit companion: the same path with a usable budget sends, and sends §8.5's values.
   *
   * <p>Its refusal half (a revision whose stored configuration had no usable step timeout) was
   * artifact-1 only and was dropped by STUDIO-OBS-012A: an observed revision's configuration is
   * schema-validated at publication. Without this test the deadline values would be asserted
   * nowhere.
   */
  @Test
  void aRevisionWithAUsableBudgetSendsTheDeadlinesFaithfullyAndClampsNothing() {
    UUID execution = accept();
    var received = new java.util.concurrent.atomic.AtomicBoolean();
    runner.onSend(job -> received.set(job.resolvedSecrets().get(SECRET_ID).matches(OLD_VALUE)));
    dispatcher.dispatch(execution);
    assertThat(received).isTrue();
    assertThat(runner.sendCount()).isEqualTo(1);
    RunJob.JobDeadlines deadlines = runner.sent().get(0).deadlines();
    // §8.5's admitted-start starting value, and the server's total browser runtime (300 s)
    // — NOT the revision's per-step timeoutSeconds (30 s), which stays on the configuration. The
    // clamp is the runner's (10.13 AC-6) and nothing is clamped here.
    assertThat(deadlines.admittedStartMs()).isEqualTo(30_000L);
    assertThat(deadlines.totalRuntimeMs()).isEqualTo(300_000L);
  }
}
