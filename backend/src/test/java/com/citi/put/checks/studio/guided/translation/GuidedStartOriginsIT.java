package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * STUDIO-FLEX-001 at the real start seam, under the {@code local} allowed domains ({@code
 * localhost, example.com, practicetestautomation.com}): a test that names no URL cannot start, and
 * its first URL in step order must be on the deployment's allowed domains.
 */
@SpringBootTest(
    classes = ChecksApplication.class,
    properties = {
      // Allow-all is ON by default for now; this test is about the list.
      "studio.navigation.allow-all-domains=false",
      "studio.guided-authoring.translation.enabled=true",
      "studio.guided-authoring.runner-origin=https://localhost:1",
      "studio.guided-authoring.translation.controller-origin=https://localhost:1",
      "studio.guided-authoring.controller-token-file=/tmp/gov4-unused-wiring-token",
      "studio.gateway.provider=vertex",
      "studio.gateway.endpoint=http://127.0.0.1:1",
      "studio.gateway.project=synthetic-project",
      "studio.gateway.location=global",
      "studio.gateway.model=synthetic-model",
      "studio.gateway.credentials.mode=none"
    })
@ActiveProfiles("local")
class GuidedStartOriginsIT {
  private static final String OWNER = "origins-owner@citi.com";
  private static final String CSI = "60481";

  @Autowired GuidedSessionAccess access;
  @Autowired JdbcTemplate jdbc;
  @Autowired PlatformTransactionManager transactions;

  /** The start seam runs inside the session transaction, as the service does. */
  private GuidedSessionAccess.Snapshot resolve(UUID test) {
    return new TransactionTemplate(transactions)
        .execute(status -> access.resolve(owner(), start(test)));
  }

  private UUID seed(String... steps) {
    var fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI, OWNER);
    return fixtures.seedTest("Origins " + UUID.randomUUID(), CSI, OWNER, List.of(steps));
  }

  private ObjectNode start(UUID test) {
    var row =
        jdbc.queryForMap(
            "SELECT source_revision, configuration_revision, environment FROM ui_tests WHERE id=?",
            test);
    return new GuidedContracts()
        .object()
        .put("schemaVersion", 3)
        .put("testId", test.toString())
        .put("sourceRevision", String.valueOf(row.get("source_revision")))
        .put("configurationRevision", String.valueOf(row.get("configuration_revision")))
        .put("environmentId", String.valueOf(row.get("environment")));
  }

  private Authentication owner() {
    return StudioExecutionFixtures.identity(OWNER, CSI, "owner");
  }

  @Test
  void aTestThatNamesNoUrlIsRefusedWithAClosedCodeAndNothingIsResolved() {
    UUID test = seed("Click Sign in", "Check the title is Home");
    assertThatThrownBy(() -> resolve(test))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> assertThat(e.getMessage()).isEqualTo("NO_APPLICATION_URL"));
  }

  private static void assertRefused(Runnable action, String code, int status) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> {
              assertThat(e.getMessage()).isEqualTo(code);
              assertThat(e.status()).isEqualTo(status);
            });
  }

  @Test
  void aStartUrlOffTheAllowedDomainsIsRefusedForbiddenWithoutNamingTheHost() {
    UUID test = seed("Open https://evil.example.org/login and sign in.", "Click Sign in");
    assertRefused(() -> resolve(test), "ORIGIN_NOT_ALLOWED", 403);
  }

  @Test
  void aLookalikeOfAnAllowedDomainIsRefused() {
    assertRefused(
        () -> resolve(seed("Open https://evilexample.com/ and sign in.")),
        "ORIGIN_NOT_ALLOWED",
        403);
    assertRefused(
        () -> resolve(seed("Open https://example.com.evil.org/ and sign in.")),
        "ORIGIN_NOT_ALLOWED",
        403);
  }

  @Test
  void aStartUrlOnAnAllowedDomainOrItsSubdomainStartsAndTheScopeCarriesNoOriginList() {
    for (String step :
        List.of(
            "Open https://practicetestautomation.com/practice-test-login/ and sign in.",
            "Open https://www.practicetestautomation.com/ and sign in.",
            "Open http://example.com:8080/start and sign in.",
            "Open https://shop.eu.example.com/start and sign in.")) {
      var scope = resolve(seed(step)).scope();
      assertThat(scope.has("approvedOrigins")).as(step).isFalse();
      assertThat(scope.has("allowedOrigins")).as(step).isFalse();
    }
  }

  @Test
  void onlyTheFirstUrlInStepOrderIsCheckedAtStart() {
    // Later URLs are checked when a step uses them as a destination, not here.
    var scope =
        resolve(
                seed(
                    "Click Sign in",
                    "Open https://example.com/ and sign in.",
                    "Go to https://elsewhere.example.org/ afterwards"))
            .scope();
    assertThat(scope.path("csiId").asText()).isEqualTo(CSI);
    assertRefused(
        () ->
            resolve(
                seed(
                    "Open https://elsewhere.example.org/ first",
                    "Go to https://example.com/ afterwards")),
        "ORIGIN_NOT_ALLOWED",
        403);
  }

  @Test
  void aUrlVariableTheFirstStepReferencesIsTheStartUrl() {
    UUID test = seed("Go to the <var base>", "Open https://example.com/ and sign in.");
    jdbc.update(
        "UPDATE ui_tests SET variables=CAST(? AS jsonb) WHERE id=?",
        "[{\"name\":\"base\",\"kind\":\"plain\",\"value\":\"https://off.example.org/x\"}]",
        test);
    assertRefused(() -> resolve(test), "ORIGIN_NOT_ALLOWED", 403);
  }
}
