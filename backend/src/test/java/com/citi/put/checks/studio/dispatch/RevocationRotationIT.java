package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.StudioSecretFixtures;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.17 AC-7a, AC-8, AC-10 and AC-12's persistence half.
 *
 * <p>Three conditions that can only happen <em>between</em> the acceptance transaction and the
 * dispatcher's claim, which is the window §5.1.3 exists for: an entitlement withdrawn, a reference
 * deleted from the vault, and a value rotated. Each is arranged where it actually lives — the
 * entitlement policy and the vault — rather than by editing the platform {@code secrets} table,
 * which the stub resolver used to read and which this story no longer touches at all.
 *
 * <p>In every refusal case the assertion that matters is the <b>request count on the recording
 * dispatch client</b>, not a log line: the codes both mean <em>the send never happened</em>, and
 * counting what left the process is the only form of that claim which fails when it is false.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class RevocationRotationIT {

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

    @Bean
    @Primary
    StudioSecretFixtures.MutableSecretUseAuthorization mutableSecretUseAuthorization() {
      return new StudioSecretFixtures.MutableSecretUseAuthorization();
    }
  }

  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private FakeStudioVaultProvider vault;
  @Autowired private StudioSecretFixtures.MutableSecretUseAuthorization entitlements;
  @Autowired private JdbcTemplate jdbc;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private UUID testId;

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

    testId = fixtures.seedTest("Rotation draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        testId,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of(SECRET_ID)));
    entitlements.grant(OWNER, CSI_ID, ENVIRONMENT, SECRET_ID);
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET, CSI_ID, ENVIRONMENT, SECRET_ID, OLD_VALUE);
  }

  private UUID accept() {
    return studioService.executeTest(testId, owner, null).executionId();
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
  void anEntitlementWithdrawnBetweenAcceptanceAndDispatchIsTerminalAndNothingIsSent() {
    UUID execution = accept();

    entitlements.revoke(OWNER, CSI_ID, ENVIRONMENT, SECRET_ID);
    dispatcher.dispatch(execution);

    // A fact about the principal (ADR-002 §15.2).
    assertThat(errorCode(execution)).isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
    assertThat(runner.sendCount())
        .as("POST /v1/runs was issued for a revoked entitlement")
        .isZero();
  }

  @Test
  void aReferenceDeletedFromTheVaultBetweenAcceptanceAndDispatchIsTerminalAndNothingIsSent() {
    UUID execution = accept();

    vault.delete(StudioVaultProvider.ReferenceKind.SECRET, CSI_ID, ENVIRONMENT, SECRET_ID);
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
  void theSameExecutionWithTheEntitlementAndTheReferenceIntactIsDispatched() {
    UUID execution = accept();

    dispatcher.dispatch(execution);

    assertThat(runner.sendCount()).isEqualTo(1);
    assertThat(runner.sent().get(0).resolvedSecrets()).containsEntry(SECRET_ID, OLD_VALUE);
    assertThat(errorCode(execution)).isNull();
  }

  // ── AC-10 ────────────────────────────────────────────────────────────────────────────────────

  @Test
  void anUnreadableReferenceDeclarationAtDispatchIsTerminalRatherThanARunWithNoReferences() {
    UUID execution = accept();

    // The fail-open this criterion removes: the reader used to return an empty list for this, and
    // the dispatcher used to send a job with no references and no secrets — for a login test, a
    // browser opening a real application with an empty password field.
    //
    // The revision itself is write-once and the database enforces it, so the condition is arranged
    // the way it would actually arise: the execution is pointed at a revision whose stored
    // declaration is of a shape the typed reader does not recognise — a legacy flat array, which
    // is exactly what the previous reader accepted and flattened.
    // A separate draft, because `ui_test_revisions` is unique on (test, source, configuration)
    // revision and write-once besides. What the dispatcher reads is the revision the *execution*
    // points at, which is the thing being made unreadable here.
    UUID legacyDraft =
        fixtures.seedTest(
            "Legacy declaration draft", CSI_ID, OWNER, List.of("Go to the home page"));
    UUID legacyRevision =
        fixtures.confirmRevision(
            legacyDraft, CSI_ID, List.of("Go to the home page"), "[\"a-flat-legacy-array\"]");
    jdbc.update(
        "UPDATE ui_test_executions SET revision_id = ? WHERE id = ?", legacyRevision, execution);

    dispatcher.dispatch(execution);

    assertThat(errorCode(execution)).isEqualTo(ExecutionErrorCode.REFERENCE_UNAVAILABLE);
    assertThat(runner.sendCount())
        .as("POST /v1/runs was issued for an unreadable reference declaration")
        .isZero();
  }

  @Test
  void anAbsentConfirmedRevisionAtDispatchIsTerminalToo() {
    UUID execution = accept();
    jdbc.update("UPDATE ui_test_executions SET revision_id = NULL WHERE id = ?", execution);

    dispatcher.dispatch(execution);

    assertThat(errorCode(execution)).isEqualTo(ExecutionErrorCode.REFERENCE_UNAVAILABLE);
    assertThat(runner.sendCount()).isZero();
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
        StudioVaultProvider.ReferenceKind.SECRET, CSI_ID, ENVIRONMENT, SECRET_ID, NEW_VALUE);
    dispatcher.dispatch(execution);

    assertThat(runner.sendCount()).isEqualTo(1);
    RunJob job = runner.sent().get(0);
    // The browser receives the new value…
    assertThat(job.resolvedSecrets()).containsEntry(SECRET_ID, NEW_VALUE);
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

    // …and the nonsecret version identifier is recorded, on `configuration_snapshot`'s jsonb, with
    // no migration — exactly the way 10.7 records `dispatchPolicyIdentity`.
    assertThat(snapshot(execution)).contains("secretVaultVersions").contains(SECRET_ID);
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
        StudioVaultProvider.ReferenceKind.SECRET, CSI_ID, ENVIRONMENT, SECRET_ID, OLD_VALUE);
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

  private String versionsOf(UUID executionId) {
    return jdbc.queryForObject(
        "SELECT COALESCE(configuration_snapshot -> 'secretVaultVersions' ->> ?, '')"
            + " FROM ui_test_executions WHERE id = ?",
        String.class,
        SECRET_ID,
        executionId);
  }

  private Map<String, Object> revisionBinding() {
    return jdbc.queryForMap(
        "SELECT t.confirmed_revision_id, t.compile_status, t.source_revision,"
            + " t.configuration_revision, r.artifact_hash"
            + " FROM ui_tests t JOIN ui_test_revisions r ON r.id = t.confirmed_revision_id"
            + " WHERE t.id = ?",
        testId);
  }
}
