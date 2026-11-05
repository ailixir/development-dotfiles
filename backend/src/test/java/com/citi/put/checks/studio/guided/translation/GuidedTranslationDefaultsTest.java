package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.dispatch.StudioDispatchDisabledException;
import com.citi.put.checks.studio.guided.publication.GuidedPlanPublisher;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationProperties;
import com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization;
import com.citi.put.checks.studio.guided.publication.ObservedReplayProperties;
import com.citi.put.checks.studio.guided.publication.ObservedRevisionVerifier;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionProperties;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.support.TestPostgresDatabase;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.bind.BindException;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

/** Starts the actual application/PostgreSQL with no guided configuration overrides. */
@SpringBootTest(
    classes = ChecksApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@org.springframework.test.annotation.DirtiesContext(
    classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class GuidedTranslationDefaultsTest {
  static final TestPostgresDatabase PG = new TestPostgresDatabase();

  static {
    PG.start();
  }

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", PG::getJdbcUrl);
    registry.add("spring.datasource.username", PG::getUsername);
    registry.add("spring.datasource.password", PG::getPassword);
    registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
  }

  @AfterAll
  static void stop() {
    PG.stop();
  }

  @Autowired ApplicationContext application;
  @Autowired JdbcTemplate jdbc;

  @Test
  void defaultApplicationActuallyCreatesBothTranslationGatesAndPublicationReplayBeans() {
    assertThat(application.getBean(GuidedTranslationProperties.class).enabled()).isTrue();
    assertThat(application.getBean(GuidedPublicationProperties.class).enabled()).isTrue();
    assertThat(application.getBean(ObservedReplayProperties.class).enabled()).isTrue();
    assertThat(application.getBean(GuidedSessionProperties.class).enabled()).isTrue();
    assertThat(application.getBean(GuidedTranslationService.class)).isNotNull();
    assertThat(application.getBean(GuidedTranslationCoordinator.class)).isNotNull();
    assertThat(application.getBean(GuidedPlanPublisher.class)).isNotNull();
    assertThat(application.getBean(ObservedReplayAuthorization.class)).isNotNull();
    assertThat(application.getBean(ObservedRevisionVerifier.class)).isNotNull();
  }

  /** SC008-FIX-20: the per-send cap defaults to 20 s (was 50 s) and the yml entry is bound. */
  @Test
  void sendTimeoutDefaultsToTwentySecondsUnderTheSixtySecondCallBudget() throws Exception {
    var properties = application.getBean(GuidedTranslationProperties.class);
    assertThat(properties.sendTimeoutSeconds()).isEqualTo(20);
    assertThat(properties.callSeconds()).isEqualTo(60);
    assertThat(properties.isCallBudgetCoveringSendCap()).isTrue();
    // 3 attempts x (60 s call + 2 s settle + 15 s runner prepare) + 4 transient requests x (60 s
    // call + 2 s settle) + 7 x 2 s backoff = 493 s, plus a 30 s margin (SC008-FIX-31).
    assertThat(properties.continuationTimeout()).isEqualTo(java.time.Duration.ofSeconds(523));
    assertThat(bindSendTimeout(null).sendTimeoutSeconds()).isEqualTo(20);
    assertThat(
            Files.readString(Path.of("src/main/resources/application.yml"))
                .contains("send-timeout-seconds: ${STUDIO_GUIDED_SEND_TIMEOUT_SECONDS:20}"))
        .isTrue();
    assertThat(bindSendTimeout("1").sendTimeoutSeconds()).isEqualTo(1);
    assertThat(bindSendTimeout("600").sendTimeoutSeconds()).isEqualTo(600);
    assertThatThrownBy(() -> bindSendTimeout("0")).isInstanceOf(BindException.class);
    assertThatThrownBy(() -> bindSendTimeout("601")).isInstanceOf(BindException.class);
  }

  /** Binds with one unrelated key so the record's own {@code @DefaultValue}s apply. */
  private static GuidedTranslationProperties bindSendTimeout(String seconds) {
    Map<String, String> source = new java.util.HashMap<>();
    source.put("studio.guided-authoring.translation.worker-id", "worker-1");
    if (seconds != null) {
      source.put("studio.guided-authoring.translation.send-timeout-seconds", seconds);
    }
    return new Binder(new MapConfigurationPropertySource(source))
        .bind("studio.guided-authoring.translation", GuidedTranslationProperties.class)
        .get();
  }

  @Nested
  @TestPropertySource(properties = "studio.execution.enabled=false")
  class KillSwitch {
    @Autowired ApplicationContext offApplication;
    @Autowired JdbcTemplate offJdbc;

    @Test
    void realApplicationKillSwitchRefusesOrdinaryAndGuidedRunsWithoutAStoredSession()
        throws Exception {
      assertThatThrownBy(
              () ->
                  offApplication
                      .getBean(StudioAcceptanceService.class)
                      .accept(UUID.randomUUID(), "user-1", "kill-test"))
          .isInstanceOf(StudioDispatchDisabledException.class);
      var contracts = offApplication.getBean(GuidedContracts.class);
      var fixture =
          contracts.parse(
              Files.readString(
                  Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")));
      var request =
          contracts
              .object()
              .put("schemaVersion", 3)
              .put("testId", UUID.randomUUID().toString())
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("environmentId", "fixture");
      request.set("versions", fixture.path("documents").path("versions"));
      int before =
          offJdbc.queryForObject("SELECT count(*) FROM studio_guided_sessions", Integer.class);
      assertThatThrownBy(
              () ->
                  offApplication
                      .getBean(GuidedSessionService.class)
                      .start(
                          StudioExecutionFixtures.identity("user-1", "CSI-123", "owner"),
                          "kill-guided",
                          request))
          .hasMessage("RUNTIME_INCOMPATIBLE");
      assertThat(
              offJdbc.queryForObject("SELECT count(*) FROM studio_guided_sessions", Integer.class))
          .isEqualTo(before);
    }
  }
}
