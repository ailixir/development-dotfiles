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
 * STUDIO-FLEX-001: the shipped placeholder (an empty allow-list) denies everything, so every start
 * with a URL is refused 403 ORIGIN_NOT_ALLOWED; only a test without any URL still answers 422.
 */
@SpringBootTest(
    classes = ChecksApplication.class,
    properties = {
      "studio.navigation.allowed-domains=",
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
class GuidedStartEmptyAllowedDomainsIT {
  private static final String OWNER = "empty-domains-owner@citi.com";
  private static final String CSI = "60482";

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
  void anEmptyListRefusesEveryStartThatNamesAUrl() {
    for (String step :
        List.of(
            "Open https://example.com/ and sign in.",
            "Open http://localhost:8080/ and sign in.",
            "Open https://practicetestautomation.com/ and sign in.")) {
      assertThatThrownBy(() -> resolve(seed(step)))
          .as(step)
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              e -> {
                assertThat(e.getMessage()).isEqualTo("ORIGIN_NOT_ALLOWED");
                assertThat(e.status()).isEqualTo(403);
              });
    }
  }

  @Test
  void aTestWithoutAnyUrlStillAnswersTheMissingUrlCode() {
    assertThatThrownBy(() -> resolve(seed("Click Sign in", "Check the title is Home")))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> {
              assertThat(e.getMessage()).isEqualTo("NO_APPLICATION_URL");
              assertThat(e.status()).isEqualTo(422);
            });
  }
}
