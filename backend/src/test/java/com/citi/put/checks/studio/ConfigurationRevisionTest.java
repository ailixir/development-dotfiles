package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.CanonicalStudioCodec;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.Viewport;
import com.citi.put.checks.studio.readiness.StudioReadiness;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.4 AC-18 — which edits advance a revision (Architecture §4.2, AC-7/AC-8; ADR-SC-005).
 *
 * <p>Name and description are metadata: a rename must not force the author to learn the test again.
 * Anything that changes what actually runs advances a revision, which is what makes a learned
 * revision stale.
 */
@SpringBootTest
@ActiveProfiles("local")
class ConfigurationRevisionTest {

  private static final String OWNER = "config-owner@citi.com";
  private static final String CSI_ID = "60405";

  @Autowired StudioService studioService;
  @Autowired JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    seedUser();
    seedCsi();
    testId = seedTest();
    com.citi.put.checks.studio.support.CanonicalAuthoringFixture.seed(jdbc, testId);
  }

  @Test
  void nameAndDescriptionChangesPreserveTheConfirmation() {
    UITestDto updated =
        com.citi.put.checks.studio.support.CanonicalAuthoringFixture.update(
            studioService,
            jdbc,
            testId,
            request(r -> r, "Renamed draft", "A new description", 1L, 1L));

    assertThat(updated.sourceRevision()).isEqualTo(1L);
    assertThat(updated.configurationRevision()).isEqualTo(1L);
    assertThat(updated.name()).isEqualTo("Renamed draft");
  }

  @Test
  void aStepTextChangeAdvancesTheSourceRevisionOnly() {
    UITestDto updated =
        com.citi.put.checks.studio.support.CanonicalAuthoringFixture.update(
            studioService,
            jdbc,
            testId,
            request(r -> withSteps(r, "[\"Go to the login page\"]"), "Draft", "d", 1L, 1L));

    assertThat(updated.sourceRevision()).isEqualTo(2L);
    assertThat(updated.configurationRevision()).isEqualTo(1L);
    assertRequiresReconfirmation(updated);
  }

  @Test
  void everyExecutionAffectingFieldAdvancesTheConfigurationRevision() {
    assertConfigurationChange(r -> withEnvironment(r, "Staging"));
    assertConfigurationChange(r -> withViewport(r, 1280, 720));
    assertConfigurationChange(r -> withTimeout(r, 45));
    assertConfigurationChange(r -> withWaitStrategy(r, "load"));
    assertConfigurationChange(r -> withVariables(r, "[{\"name\":\"USER\",\"kind\":\"plain\"}]"));
  }

  /**
   * Browser is no longer among the cases above. Since story 10.1 the only engine the product
   * executes is {@code chromium}: the column carries a CHECK constraint and the controller boundary
   * rejects anything else, so there is no legal browser change left to advance a revision. What
   * used to be a configuration change is now a rejected request.
   */
  @Test
  void anUnsupportedEngineIsRejectedBeforeItCanReachTheDraft() {
    UITestRequest firefox = request(r -> withBrowser(r, "firefox"), "Draft", "d", 1L, 1L);

    assertThatThrownBy(() -> CanonicalStudioCodec.validateForWrite(firefox))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("chromium");
    assertThat(revisions()).isEqualTo("1/1");
  }

  /** Applies one execution-affecting change to a fresh draft and checks the fallout. */
  private void assertConfigurationChange(UnaryOperator<UITestRequest> mutation) {
    testId = seedTest();
    com.citi.put.checks.studio.support.CanonicalAuthoringFixture.seed(jdbc, testId);

    UITestDto updated =
        com.citi.put.checks.studio.support.CanonicalAuthoringFixture.update(
            studioService, jdbc, testId, request(mutation, "Draft", "d", 1L, 1L));

    assertThat(updated.configurationRevision()).isEqualTo(2L);
    assertThat(updated.sourceRevision()).isEqualTo(1L);
    assertRequiresReconfirmation(updated);
  }

  private void assertRequiresReconfirmation(UITestDto updated) {
    // An advanced revision is never runnable until a guided run learns it again.
    assertThat(updated.readiness()).isEqualTo(StudioReadiness.UNLEARNED);
    assertThat(revisions())
        .isEqualTo(updated.sourceRevision() + "/" + updated.configurationRevision());
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private UITestRequest request(
      UnaryOperator<UITestRequest> mutation,
      String name,
      String description,
      long sourceRevision,
      long configurationRevision) {
    UITestRequest base =
        new UITestRequest(
            name,
            description,
            CSI_ID,
            "Production",
            java.util.List.of("Go to the home page"),
            java.util.List.of(),
            TestConfiguration.defaults(),
            sourceRevision,
            configurationRevision);
    return mutation.apply(base);
  }

  private static UITestRequest withSteps(UITestRequest r, String stepsJson) {
    return new UITestRequest(
        r.name(),
        r.description(),
        r.csiId(),
        r.environment(),
        CanonicalStudioCodec.parseSteps(stepsJson),
        r.variables(),
        r.configuration(),
        r.sourceRevision(),
        r.configurationRevision());
  }

  private static UITestRequest withVariables(UITestRequest r, String variablesJson) {
    return new UITestRequest(
        r.name(),
        r.description(),
        r.csiId(),
        r.environment(),
        r.steps(),
        CanonicalStudioCodec.parseVariables(variablesJson),
        r.configuration(),
        r.sourceRevision(),
        r.configurationRevision());
  }

  private static UITestRequest withConfiguration(UITestRequest r, TestConfiguration configuration) {
    return new UITestRequest(
        r.name(),
        r.description(),
        r.csiId(),
        r.environment(),
        r.steps(),
        r.variables(),
        configuration,
        r.sourceRevision(),
        r.configurationRevision());
  }

  private static UITestRequest withBrowser(UITestRequest r, String browser) {
    TestConfiguration c = r.configuration();
    return withConfiguration(
        r, new TestConfiguration(browser, c.viewport(), c.timeoutSeconds(), c.waitStrategy()));
  }

  private static UITestRequest withViewport(UITestRequest r, int width, int height) {
    TestConfiguration c = r.configuration();
    return withConfiguration(
        r,
        new TestConfiguration(
            c.browser(), new Viewport(width, height), c.timeoutSeconds(), c.waitStrategy()));
  }

  private static UITestRequest withTimeout(UITestRequest r, int timeoutSeconds) {
    TestConfiguration c = r.configuration();
    return withConfiguration(
        r, new TestConfiguration(c.browser(), c.viewport(), timeoutSeconds, c.waitStrategy()));
  }

  private static UITestRequest withWaitStrategy(UITestRequest r, String waitStrategy) {
    TestConfiguration c = r.configuration();
    return withConfiguration(
        r, new TestConfiguration(c.browser(), c.viewport(), c.timeoutSeconds(), waitStrategy));
  }

  private static UITestRequest withEnvironment(UITestRequest r, String environment) {
    return new UITestRequest(
        r.name(),
        r.description(),
        r.csiId(),
        environment,
        r.steps(),
        r.variables(),
        r.configuration(),
        r.sourceRevision(),
        r.configurationRevision());
  }

  private String revisions() {
    return jdbc.queryForObject(
        "SELECT source_revision || '/' || configuration_revision FROM ui_tests WHERE id = ?",
        String.class,
        testId);
  }

  private UUID seedTest() {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at)"
            + " VALUES (?, 'Draft', ?, 'Production', 'chromium',"
            + " CAST('[\"Go to the home page\"]' AS jsonb), CAST('[]' AS jsonb), 30,"
            + " 'networkidle', ?, ?, ?)",
        id,
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Config Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Config CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
