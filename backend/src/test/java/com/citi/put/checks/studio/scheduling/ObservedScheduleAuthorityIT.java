package com.citi.put.checks.studio.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.DispatchAuthorization;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-009 AC-6 (A17, gate G-3): an observed schedule runs under background authority, and a
 * scheduled secret-referencing run is refused outside the {@code local}/{@code test} fixture policy
 * even when some background source grants it.
 *
 * <p>The profile is {@code test}, so {@link ConfiguredBackgroundAuthorization} grants the fixture
 * principal. {@link SwitchableBackground} wraps it and answers {@link
 * StudioBackgroundAuthorization#localOnly()} {@code false} on demand: a stand-in for a future
 * production background-authorization source that grants the principal but is not the local/test
 * fixture. That is exactly the case G-3 must hold in, and the only one a production source could
 * ever produce.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "studio.scheduling.enabled=true", "studio.scheduling.local-grants-enabled=true",
      "checks.scheduling.dispatcher-enabled=false", "checks.scheduling.retry-enabled=false"
    })
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class ObservedScheduleAuthorityIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  @Container
  static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    // Zonky's listener initializes Spring before Testcontainers' beforeAll callback on this repo.
    if (!DATABASE.isRunning()) {
      DATABASE.start();
    }
    registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
    registry.add("spring.datasource.username", DATABASE::getUsername);
    registry.add("spring.datasource.password", DATABASE::getPassword);
    registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
  }

  static class MutableClock extends Clock {
    private volatile Instant now = Instant.parse("2026-10-06T00:00:00Z");

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }

    void set(Instant value) {
      now = value;
    }
  }

  /** The fixture policy, with the profile answer under test control. */
  static class SwitchableBackground implements StudioBackgroundAuthorization {
    private final ConfiguredBackgroundAuthorization fixture;
    private volatile boolean localProfile = true;

    SwitchableBackground(ConfiguredBackgroundAuthorization fixture) {
      this.fixture = fixture;
    }

    void localProfile(boolean value) {
      this.localProfile = value;
    }

    @Override
    public List<String> principals(String csiId, String environment) {
      return fixture.principals(csiId, environment);
    }

    @Override
    public boolean localOnly() {
      return localProfile && fixture.localOnly();
    }

    @Override
    public void require(String principal, String csiId, String environment) {
      fixture.require(principal, csiId, environment);
    }
  }

  @TestConfiguration
  static class Configuration {
    @Bean
    @Primary
    MutableClock schedulingTestClock() {
      return new MutableClock();
    }

    @Bean
    @Primary
    SwitchableBackground switchableBackground(ConfiguredBackgroundAuthorization fixture) {
      return new SwitchableBackground(fixture);
    }
  }

  private static final AtomicInteger SEQUENCE = new AtomicInteger(80000);
  private static final String OWNER = "authority-owner@citi.com";
  private static final String PRINCIPAL = "studio-local";
  private static final String SECRET_REVISION_REFERENCES =
      "{\"variables\":[],\"secrets\":[\"LOGIN_PW\"]}";

  @Autowired JdbcTemplate jdbc;
  @Autowired StudioScheduleService service;
  @Autowired StudioScheduleProcessor processor;
  @Autowired StudioSchedulingProperties properties;
  @Autowired StudioService studio;
  @Autowired DispatchAuthorization dispatchAuthorization;
  @Autowired MutableClock clock;
  @Autowired SwitchableBackground background;
  @Autowired ObjectMapper mapper;

  /** Secret preflight needs a Vault; the secret-use decision under test is G-3, not the Vault. */
  @MockBean StudioReferenceResolver references;

  private UUID testId;
  private UUID revisionId;
  private String csi;
  private Authentication owner;

  @BeforeEach
  void fixture() {
    properties.setEnabled(true);
    properties.setLocalGrantsEnabled(true);
    properties.setBatchSize(20);
    properties.setPerCsiBatchSize(2);
    properties.setPassBudgetMillis(5000);
    background.localProfile(true);
    clock.set(Instant.parse("2026-10-06T00:00:00Z"));
    csi = Integer.toString(SEQUENCE.incrementAndGet());
    new StudioExecutionFixtures(jdbc).seedUser(OWNER);
    new StudioExecutionFixtures(jdbc).seedCsi(csi, OWNER);
    owner = StudioExecutionFixtures.identity(OWNER, csi, "owner");
    properties.getLocalGrants().put(csi + "|Production", PRINCIPAL);
    learn(null);
  }

  /** A fresh learned draft with the given declarations; it becomes the current fixture. */
  private void learn(String declarations) {
    var fixtures = new StudioExecutionFixtures(jdbc);
    List<String> steps = List.of("Go to the home page");
    testId = fixtures.seedTest("Authority fixture", csi, OWNER, steps);
    revisionId = fixtures.confirmRevision(testId, csi, steps, declarations);
  }

  private StudioScheduleDtos.Schedule enable() {
    var created =
        service.create(testId, new StudioScheduleDtos.Create("* * * * *", "UTC", PRINCIPAL), owner);
    var enabled =
        service.enabled(
            testId,
            new StudioScheduleDtos.Enabled(created.version(), true, revisionId, List.of()),
            owner);
    clock.set(enabled.nextDueAt());
    return enabled;
  }

  private StudioScheduleDtos.Occurrence occurrence() {
    return service.occurrences(testId, 0, 20, owner).data().get(0);
  }

  private int ledgerRows() {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?", Integer.class, testId);
  }

  @Test
  void anObservedScheduleIsAcceptedUnderBackgroundAuthorityForTheSchedulePrincipal()
      throws Exception {
    var schedule = enable();
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");

    var accepted = occurrence();
    assertThat(accepted.decision()).isEqualTo("ACCEPTED");
    assertThat(accepted.code()).isEqualTo("ACCEPTED");
    assertThat(accepted.executionId()).isNotNull();
    var run = studio.findExecutionById(accepted.executionId(), owner);
    assertThat(run.triggerSource()).isEqualTo("SCHEDULED");
    assertThat(run.activationId()).isEqualTo(schedule.activationId());

    JsonNode binding =
        mapper.readTree(
            jdbc.queryForObject(
                "SELECT observed_revision_binding::text FROM ui_test_executions WHERE id=?",
                String.class,
                accepted.executionId()));
    assertThat(binding.path("principalId").asText())
        .as("the schedule principal")
        .isEqualTo(PRINCIPAL);
    assertThat(binding.path("replayGrant").path("principalId").asText()).isEqualTo(PRINCIPAL);
    assertThat(binding.path("revisionId").asText()).isEqualTo(revisionId.toString());
    assertThat(binding.path("testId").asText()).isEqualTo(testId.toString());
    assertThat(binding.path("replayGrant").path("executionId").asText())
        .isEqualTo(accepted.executionId().toString());
    assertThat(
            jdbc.queryForObject(
                "SELECT principal||'/'||scheduled_occurrence_id FROM studio_dispatch_ledger"
                    + " WHERE execution_id=?",
                String.class,
                accepted.executionId()))
        .isEqualTo(PRINCIPAL + "/" + accepted.id());
  }

  @Test
  void theRefusalNoLongerExistsAndAWithdrawnGrantStillFailsClosed() {
    enable();
    properties.getLocalGrants().remove(csi + "|Production");
    assertThat(processor.process(testId)).isEqualTo("BACKGROUND_AUTHORIZATION_DENIED");
    assertThat(occurrence().decision()).isEqualTo("REFUSED");
    assertThat(occurrence().executionId()).isNull();
    assertThat(ledgerRows()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_schedule_occurrences WHERE code ="
                    + " 'OBSERVED_SCHEDULE_AUTH_REQUIRED'",
                Integer.class))
        .as("no observed revision is refused for lacking background authority")
        .isZero();
  }

  @Test
  void activationSemanticsArePreservedWhenTheConfirmedRevisionMovesOn() {
    enable();
    // A newer learned head replaces the activated revision; the activation must not follow it.
    UUID newer = new ObservedPublicationFixture(jdbc).publish(testId, List.of(), List.of());
    assertThat(newer).isNotEqualTo(revisionId);
    assertThat(processor.process(testId)).isEqualTo("ACTIVATION_REVISION_MISMATCH");
    assertThat(occurrence().executionId()).isNull();
    assertThat(ledgerRows()).isZero();
    assertThat(service.read(testId, owner).activatedRevisionId()).isEqualTo(revisionId);
  }

  @Test
  void g3RefusesAScheduledSecretReferencingRunOutsideLocalAndTestEvenWhenTheGrantStands() {
    learn(SECRET_REVISION_REFERENCES);
    enable();
    // A production background source grants the principal, but no production secret-use source
    // exists: the profile answer alone must stop the run.
    background.localProfile(false);
    assertThat(processor.process(testId)).isEqualTo("BACKGROUND_AUTHORIZATION_DENIED");
    var refused = occurrence();
    assertThat(refused.decision()).isEqualTo("REFUSED");
    assertThat(refused.executionId()).isNull();
    assertThat(ledgerRows()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT blocked_code FROM studio_schedules WHERE test_id=?", String.class, testId))
        .isEqualTo("BACKGROUND_AUTHORIZATION_DENIED");
  }

  @Test
  void g3AcceptsTheSameSecretReferencingRunUnderTheLocalFixturePolicy() {
    learn(SECRET_REVISION_REFERENCES);
    enable();
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
    assertThat(occurrence().executionId()).isNotNull();
  }

  @Test
  void g3DoesNotRefuseASecretFreeObservedScheduleOnAProductionBackgroundSource() {
    enable();
    background.localProfile(false);
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
    assertThat(occurrence().executionId()).isNotNull();
  }

  @Test
  void g3HoldsAgainAtDispatchRecheckForARunThatWasAcceptedUnderTheFixturePolicy() {
    learn(SECRET_REVISION_REFERENCES);
    enable();
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
    UUID execution = occurrence().executionId();
    assertThat(dispatchAuthorization.recheck(execution, testId, csi, PRINCIPAL))
        .as("control: the fixture policy still stands")
        .endsWith("/background:" + PRINCIPAL);
    background.localProfile(false);
    assertThatThrownBy(() -> dispatchAuthorization.recheck(execution, testId, csi, PRINCIPAL))
        .isInstanceOf(DispatchAuthorization.AuthorizationRevokedException.class)
        .hasMessageContaining("G-3");
  }

  @Test
  void declarationsAreReadFromTheImmutableRevisionAndAnUnknownRevisionFailsClosed() {
    UUID free = revisionId;
    learn(SECRET_REVISION_REFERENCES);
    UUID secret = revisionId;
    assertThat(StudioScheduledDispatchAuthorization.declaresSecrets(jdbc, free)).isFalse();
    assertThat(StudioScheduledDispatchAuthorization.declaresSecrets(jdbc, secret)).isTrue();
    assertThat(StudioScheduledDispatchAuthorization.declaresSecrets(jdbc, UUID.randomUUID()))
        .as("a missing revision is not secret-free")
        .isTrue();
  }
}
