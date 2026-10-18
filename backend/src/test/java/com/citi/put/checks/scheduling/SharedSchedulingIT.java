package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.dispatch.DispatchOutcome;
import com.citi.put.checks.studio.dispatch.RecordingRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.scheduling.StudioScheduleDtos;
import com.citi.put.checks.studio.scheduling.StudioScheduleService;
import com.citi.put.checks.studio.scheduling.StudioScheduledTarget;
import com.citi.put.checks.studio.scheduling.StudioSchedulingProperties;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.support.ScheduledMethodRunnable;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Actual common coordinator, registered check executors and durable Studio admission on private PG.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "checks.scheduling.dispatcher-enabled=true",
      "checks.scheduling.retry-enabled=false",
      "checks.scheduling.poll-interval-ms=PT0.25S",
      "checks.scheduling.initial-delay-ms=#{5 * 60 * 1000}",
      "checks.sources.SPLUNK=true",
      "checks.sources.GRAFANA=false",
      "studio.scheduling.enabled=true",
      "studio.scheduling.local-grants-enabled=true",
      "studio.scheduling.poll-interval-ms=#{'PT5S'}",
      "studio.execution.dispatcher.enabled=false",
      "management.server.port=0"
    })
@ActiveProfiles({"test", "worker"})
@Testcontainers(disabledWithoutDocker = true)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class SharedSchedulingIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  @Container
  static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");

  static final WireMockServer SERVER =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @DynamicPropertySource
  static void configure(DynamicPropertyRegistry registry) {
    if (!DATABASE.isRunning()) {
      DATABASE.start();
    }
    if (!SERVER.isRunning()) {
      SERVER.start();
    }
    registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
    registry.add("spring.datasource.username", DATABASE::getUsername);
    registry.add("spring.datasource.password", DATABASE::getPassword);
    registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
    registry.add("checks.dc.base-url", SERVER::baseUrl);
  }

  static final class MutableClock extends Clock {
    volatile Instant value = Instant.now();

    @Override
    public Instant instant() {
      return value;
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }
  }

  static final MutableClock CLOCK = new MutableClock();
  static final AtomicLong TICKER = new AtomicLong();

  @TestConfiguration
  public static class FixtureConfiguration {
    @Bean
    @Primary
    public MutableClock sharedTestClock() {
      return CLOCK;
    }

    @Bean
    @Primary
    public SchedulingTicker sharedTestTicker() {
      return TICKER::get;
    }

    @Bean
    @Primary
    public RecordingRunnerDispatchClient sharedRunner() {
      return new RecordingRunnerDispatchClient();
    }
  }

  private static final String OWNER = "shared-scheduling@citi.com";
  private static final String PRINCIPAL = "shared-studio-local";
  private static final AtomicInteger IDS = new AtomicInteger(82000);
  @Autowired JdbcTemplate jdbc;
  @Autowired SchedulingCoordinator coordinator;
  @Autowired CronDispatcher ordinary;
  @Autowired StudioScheduledTarget studioTarget;
  @Autowired StudioScheduleService studio;
  @Autowired StudioSchedulingProperties properties;
  @Autowired StudioDispatcher dispatcher;
  @Autowired RecordingRunnerDispatchClient runner;
  @Autowired LockProvider locks;
  @Autowired ScheduledAnnotationBeanPostProcessor scheduled;
  private String csi;
  private UUID studioTest;
  private UUID revision;

  @BeforeEach
  void seed() {
    coordinator.stop();
    TICKER.set(0);
    CLOCK.value = Instant.now().plusSeconds(120);
    properties.setEnabled(true);
    properties.setLocalGrantsEnabled(true);
    SERVER.resetAll();
    // ShedLock caches known row existence; deleting a row underneath that cache prevents reacquire.
    jdbc.update(
        "UPDATE shedlock SET lock_until=now()-interval '1 second' WHERE name='cronDispatcher'");
    csi = Integer.toString(IDS.incrementAndGet());
    var fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(csi, OWNER);
    List<String> steps = List.of("Go to the fixture page");
    studioTest = fixtures.seedTest("Shared Studio", csi, OWNER, steps);
    revision =
        fixtures.confirmRevision(studioTest, csi, steps, StudioExecutionFixtures.NO_REFERENCES);
    properties.getLocalGrants().put(csi + "|Production", PRINCIPAL);
    SERVER.stubFor(get(urlEqualTo("/health")).willReturn(okJson("{\"status\":\"UP\"}")));
    SERVER.stubFor(
        post(urlEqualTo("/api/v1/execute"))
            .willReturn(
                okJson(
                    "{\"status\":\"SUCCESS\",\"comment\":\"controlled"
                        + " query\",\"detail\":{\"actualCount\":1}}")));
    coordinator.start();
  }

  @AfterEach
  void stop() {
    coordinator.stop();
  }

  @AfterAll
  static void closeServer() {
    SERVER.stop();
  }

  private StudioScheduleDtos.Schedule enable() {
    var owner = StudioExecutionFixtures.identity(OWNER, csi, "owner");
    var s =
        studio.create(
            studioTest, new StudioScheduleDtos.Create("* * * * *", "UTC", PRINCIPAL), owner);
    return studio.enabled(
        studioTest, new StudioScheduleDtos.Enabled(s.version(), true, revision, List.of()), owner);
  }

  private UUID check(String type, String configuration) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO checks(id, name, type, csi_id, csi_name, status,
        configuration, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'Shared CSI', 'PENDING', ?::jsonb, ?, now(),
        now())
        """,
        id,
        "Shared " + type,
        type,
        csi,
        configuration,
        OWNER);
    jdbc.update(
        """
        INSERT INTO schedules(id, check_id, check_type, frequency,
        cron_expression, timezone, enabled, next_execution_at)
        VALUES (?, ?, ?, 'custom', '0 */5 * * * *', 'UTC', true, ?)
        """,
        UUID.randomUUID(),
        id,
        type,
        Timestamp.from(Instant.now().minusSeconds(600)));
    return id;
  }

  private UUID http() {
    return check(
        "HTTP",
        "{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\""
            + SERVER.baseUrl()
            + "/health\",\"expectedStatusCode\":200,\"timeoutMs\":5000}");
  }

  private int results(UUID id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM execution_results WHERE check_id=?", Integer.class, id);
  }

  @Test
  void actualSpringBootstrapHonorsIsoAndSpelWithoutCircularReferencesAndHasOneDueTimer() {
    assertThat(ordinary.pollInterval()).isEqualTo(Duration.ofMillis(250));
    assertThat(ordinary.initialDelay()).isEqualTo(Duration.ofMinutes(5));
    assertThat(studioTarget.pollInterval()).isEqualTo(Duration.ofSeconds(5));
    assertThat(coordinator.heartbeatMillis()).isEqualTo(250);
    var due =
        scheduled.getScheduledTasks().stream()
            .map(t -> t.getTask())
            .filter(
                t ->
                    t.getRunnable() instanceof ScheduledMethodRunnable r
                        && r.getMethod().getDeclaringClass().equals(SchedulingCoordinator.class))
            .toList();
    assertThat(due).hasSize(1);
    assertThat(((FixedDelayTask) due.get(0)).getIntervalDuration())
        .isEqualTo(Duration.ofMillis(250));
  }

  @Test
  void sameCoordinatorRunsHttpTcpSplunkAndStudioThroughTheirExistingPipelines() throws Exception {
    UUID http = http();
    UUID tcp =
        check(
            "TCP",
            "{\"type\":\"TCP\",\"host\":\"localhost\",\"port\":"
                + SERVER.port()
                + ",\"timeoutMs\":5000}");
    UUID splunk =
        check(
            "SPLUNK",
            "{\"type\":\"SPLUNK\",\"query\":\"index=fixture | stats"
                + " count\",\"expectedCount\":0,\"countOperator\":\">\"}");
    UUID disabled = check("GRAFANA", "{\"type\":\"GRAFANA\"}");
    var s = enable();
    CLOCK.value = s.nextDueAt();
    TICKER.set(TimeUnit.MINUTES.toNanos(5));
    coordinator.tick();
    eventually(() -> results(http) == 1 && results(tcp) == 1 && results(splunk) == 1);
    eventually(
        () ->
            studio
                    .occurrences(
                        studioTest, 0, 20, StudioExecutionFixtures.identity(OWNER, csi, "owner"))
                    .totalElements()
                == 1);
    for (UUID id : List.of(http, tcp, splunk)) {
      assertThat(
              jdbc.queryForObject(
                  "SELECT status FROM execution_results WHERE check_id=?", String.class, id))
          .isEqualTo("SUCCESS");
    }
    assertThat(results(disabled)).isZero();
    SERVER.verify(1, postRequestedFor(urlEqualTo("/api/v1/execute")));
    var occurrence =
        studio
            .occurrences(studioTest, 0, 20, StudioExecutionFixtures.identity(OWNER, csi, "owner"))
            .data()
            .get(0);
    assertThat(occurrence.decision()).isEqualTo("ACCEPTED");
    runner.willAnswer(DispatchOutcome.ambiguous("fixture lost admission reply"));
    assertThat(dispatcher.dispatch(occurrence.executionId())).isTrue();
    assertThat(dispatcher.dispatch(occurrence.executionId())).isFalse();
    assertThat(
            runner.sent().stream()
                .filter(job -> job.executionId().equals(occurrence.executionId()))
                .count())
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                String.class,
                occurrence.executionId()))
        .isEqualTo("DISPATCHING");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM failed_dispatches WHERE reference_id=?",
                Integer.class,
                studioTest))
        .isZero();
    assertThat(
            jdbc.queryForObject("SELECT count(*) FROM checks WHERE type='UI_TEST'", Integer.class))
        .isZero();
  }

  @Test
  void ordinaryLeadershipLockCannotSuppressStudioAndStudioFlagCannotSuppressChecks()
      throws Exception {
    UUID http = http();
    var s = enable();
    var lock =
        locks
            .lock(
                new LockConfiguration(
                    Instant.now(), "cronDispatcher", Duration.ofMinutes(2), Duration.ZERO))
            .orElseThrow();
    try {
      CLOCK.value = s.nextDueAt();
      TICKER.set(TimeUnit.MINUTES.toNanos(5));
      coordinator.tick();
      eventually(
          () ->
              studio
                      .occurrences(
                          studioTest, 0, 20, StudioExecutionFixtures.identity(OWNER, csi, "owner"))
                      .totalElements()
                  == 1);
      assertThat(results(http)).isZero();
    } finally {
      lock.unlock();
    }
    properties.setEnabled(false);
    TICKER.addAndGet(TimeUnit.SECONDS.toNanos(10));
    coordinator.tick();
    eventually(() -> results(http) >= 1);
  }

  @Test
  void studioOnlyReplicaRunsWhenCatalogFlagIsOffAndDeduplicatesAgainstAnotherCoordinator()
      throws Exception {
    var s = enable();
    CLOCK.value = s.nextDueAt();
    try (var replica =
        new SpringApplicationBuilder(ChecksApplication.class, FixtureConfiguration.class)
            .web(WebApplicationType.SERVLET)
            .run(
                withObservedReplay(
                    "--spring.profiles.active=test,worker",
                    "--server.port=0",
                    "--management.server.port=0",
                    "--spring.datasource.url=" + DATABASE.getJdbcUrl(),
                    "--spring.datasource.username=" + DATABASE.getUsername(),
                    "--spring.datasource.password=" + DATABASE.getPassword(),
                    "--spring.datasource.driver-class-name=org.postgresql.Driver",
                    "--spring.flyway.enabled=false",
                    "--checks.scheduling.dispatcher-enabled=false",
                    "--checks.scheduling.retry-enabled=false",
                    "--checks.dc.base-url=" + SERVER.baseUrl(),
                    "--studio.scheduling.enabled=true",
                    "--studio.scheduling.local-grants-enabled=true",
                    "--studio.scheduling.poll-interval-ms=PT5S",
                    "--studio.execution.dispatcher.enabled=false",
                    "--studio.scheduling.local-grants[" + csi + "|Production]=" + PRINCIPAL))) {
      assertThat(replica.getBeansOfType(CronDispatcher.class)).isEmpty();
      var second = replica.getBean(SchedulingCoordinator.class);
      assertThat(second.isRunning()).isTrue();
      TICKER.addAndGet(TimeUnit.MINUTES.toNanos(5));
      coordinator.tick();
      second.tick();
      eventually(
          () ->
              studio
                      .occurrences(
                          studioTest, 0, 20, StudioExecutionFixtures.identity(OWNER, csi, "owner"))
                      .totalElements()
                  == 1);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?",
                  Integer.class,
                  studioTest))
          .isEqualTo(1);
    }
  }

  /**
   * STUDIO-OBS-012A R1: the replica gets the same trusted observed-replay configuration as this
   * class's own context ({@link ObservedPublicationFixture#register}). Without it the replica's
   * readiness cannot verify the learned revision, so which coordinator wins the occurrence would
   * decide its refusal code.
   */
  private static String[] withObservedReplay(String... args) {
    List<String> all = new java.util.ArrayList<>(List.of(args));
    all.addAll(ObservedPublicationFixture.commandLineProperties());
    return all.toArray(String[]::new);
  }

  private static void eventually(BooleanSupplier ready) throws Exception {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
    while (!ready.getAsBoolean() && System.nanoTime() < deadline) {
      Thread.sleep(20);
    }
    assertThat(ready.getAsBoolean()).isTrue();
  }
}
