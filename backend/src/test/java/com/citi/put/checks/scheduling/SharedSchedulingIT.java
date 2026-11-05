package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.dispatch.DispatchOutcome;
import com.citi.put.checks.studio.dispatch.RecordingRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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

/**
 * Actual common coordinator, registered check executors and a UI test's shared schedule admitted
 * through the durable Studio pipeline, on a private PG.
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
      "studio.execution.dispatcher.enabled=false",
      "management.server.port=0"
    })
@ActiveProfiles({"test", "worker"})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class SharedSchedulingIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  static final TestPostgresDatabase DATABASE = new TestPostgresDatabase();

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

    /** Accepts every declared reference, so only the schedule can refuse a secret-bearing slot. */
    @Bean
    @Primary
    public StudioReferenceResolver acceptingResolver() {
      return new StudioReferenceResolver() {
        @Override
        public void preflight(
            String csiId,
            String environment,
            UUID testId,
            String principal,
            ReferenceDeclarations declarations) {
          // Secret use is decided at manual start and by the Vault adapter, not by the schedule.
        }

        @Override
        public Resolved resolve(
            String csiId,
            String environment,
            UUID testId,
            String principal,
            ReferenceDeclarations declarations) {
          return new Resolved(Map.of(), Map.of(), Map.of());
        }
      };
    }
  }

  private static final String OWNER = "shared-scheduling@citi.com";
  private static final AtomicInteger IDS = new AtomicInteger(82000);
  private static final String SCHEDULER = "system:checks-scheduler";
  @Autowired JdbcTemplate jdbc;
  @Autowired SchedulingCoordinator coordinator;
  @Autowired CronDispatcher ordinary;
  @Autowired StudioDispatcher dispatcher;
  @Autowired RecordingRunnerDispatchClient runner;
  @Autowired ScheduledAnnotationBeanPostProcessor scheduled;
  private String csi;
  private StudioExecutionFixtures fixtures;
  private UUID studioTest;

  @BeforeEach
  void seed() {
    coordinator.stop();
    TICKER.set(0);
    CLOCK.value = Instant.now().plusSeconds(120);
    SERVER.resetAll();
    releaseLeadership();
    jdbc.update("DELETE FROM schedules WHERE ui_test_id IS NOT NULL");
    csi = Integer.toString(IDS.incrementAndGet());
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(csi, OWNER);
    studioTest = fixtures.seedRunnableTest("Shared Studio", csi, OWNER, STEPS).testId();
    SERVER.stubFor(get(urlEqualTo("/health")).willReturn(okJson("{\"status\":\"UP\"}")));
    SERVER.stubFor(
        post(urlEqualTo("/api/v1/execute"))
            .willReturn(
                okJson(
                    "{\"status\":\"SUCCESS\",\"comment\":\"controlled"
                        + " query\",\"detail\":{\"actualCount\":1}}")));
    coordinator.start();
  }

  private static final List<String> STEPS = List.of("Go to the fixture page");

  @AfterEach
  void stop() {
    coordinator.stop();
  }

  @AfterAll
  static void closeServer() {
    SERVER.stop();
    DATABASE.stop();
  }

  /** A due, enabled shared schedule of a UI test; yearly, so one slot is the only slot. */
  private UUID scheduleUiTest(UUID testId) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO schedules(id, ui_test_id, check_type, frequency,
        cron_expression, timezone, enabled, next_execution_at)
        VALUES (?, ?, 'UI_TEST', 'custom', '0 0 0 1 1 *', 'UTC', true, ?)
        """,
        id,
        testId,
        Timestamp.from(Instant.now().minusSeconds(5)));
    return id;
  }

  private void dueNow(UUID schedule) {
    jdbc.update(
        "UPDATE schedules SET next_execution_at=? WHERE id=?",
        Timestamp.from(Instant.now().minusSeconds(5)),
        schedule);
  }

  /**
   * ShedLock caches known row existence, and its minimum hold would block a second pass of the same
   * test; expiring the row in place releases the leadership without deleting it.
   */
  private void releaseLeadership() {
    jdbc.update(
        "UPDATE shedlock SET lock_until=now()-interval '1 second' WHERE name='cronDispatcher'");
  }

  private void tick() {
    releaseLeadership();
    TICKER.addAndGet(TimeUnit.MINUTES.toNanos(5));
    coordinator.tick();
  }

  private int executions(UUID testId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?", Integer.class, testId);
  }

  private Instant nextExecution(UUID schedule) {
    return jdbc.queryForObject(
            "SELECT next_execution_at FROM schedules WHERE id=?", Timestamp.class, schedule)
        .toInstant();
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
  void sameCoordinatorRunsHttpTcpSplunkAndTheUiTestThroughTheirExistingPipelines()
      throws Exception {
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
    UUID schedule = scheduleUiTest(studioTest);
    tick();
    eventually(() -> results(http) == 1 && results(tcp) == 1 && results(splunk) == 1);
    eventually(() -> executions(studioTest) == 1);
    for (UUID id : List.of(http, tcp, splunk)) {
      assertThat(
              jdbc.queryForObject(
                  "SELECT status FROM execution_results WHERE check_id=?", String.class, id))
          .isEqualTo("SUCCESS");
    }
    assertThat(results(disabled)).isZero();
    SERVER.verify(1, postRequestedFor(urlEqualTo("/api/v1/execute")));

    var run =
        jdbc.queryForMap(
            "SELECT id, trigger_source, principal, schedule_id, scheduled_at, status"
                + " FROM ui_test_executions WHERE ui_test_id=?",
            studioTest);
    assertThat(run)
        .containsEntry("trigger_source", "SCHEDULED")
        .containsEntry("principal", SCHEDULER)
        .containsEntry("schedule_id", schedule)
        .containsEntry("status", "PENDING");
    assertThat(run.get("scheduled_at")).isNotNull();
    UUID executionId = (UUID) run.get("id");
    assertThat(nextExecution(schedule)).isAfter(Instant.now().plusSeconds(3600));

    runner.willAnswer(DispatchOutcome.ambiguous("fixture lost admission reply"));
    assertThat(dispatcher.dispatch(executionId)).isTrue();
    assertThat(dispatcher.dispatch(executionId)).isFalse();
    assertThat(runner.sent().stream().filter(job -> job.executionId().equals(executionId)).count())
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                String.class,
                executionId))
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
  void aTestThatDeclaresSecretsRunsOnSchedule() throws Exception {
    UUID withSecrets = fixtures.seedTest("Scheduled secret login", csi, OWNER, STEPS);
    fixtures.confirmRevision(
        withSecrets,
        csi,
        STEPS,
        StudioExecutionFixtures.references(List.of(), List.of("LOGIN_PW")));
    UUID schedule = scheduleUiTest(withSecrets);
    tick();
    eventually(() -> executions(withSecrets) == 1);
    assertThat(
            jdbc.queryForObject(
                "SELECT principal FROM ui_test_executions WHERE ui_test_id=?",
                String.class,
                withSecrets))
        .isEqualTo(SCHEDULER);
    assertThat(nextExecution(schedule)).isAfter(Instant.now().plusSeconds(3600));
  }

  @Test
  void aSlotOnATestThatIsNotReadyIsSpentWithoutARun() throws Exception {
    UUID unlearned = fixtures.seedTest("Never learned", csi, OWNER, STEPS);
    UUID schedule = scheduleUiTest(unlearned);
    tick();
    eventually(() -> nextExecution(schedule).isAfter(Instant.now().plusSeconds(3600)));
    assertThat(executions(unlearned)).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?",
                Integer.class,
                unlearned))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM failed_dispatches WHERE reference_id=?",
                Integer.class,
                unlearned))
        .isZero();
  }

  @Test
  void aSlotWhileTheSameTestIsStillRunningIsSpentAndTheNextSlotIsNotBlocked() throws Exception {
    UUID schedule = scheduleUiTest(studioTest);
    tick();
    eventually(() -> executions(studioTest) == 1);
    eventually(() -> nextExecution(schedule).isAfter(Instant.now().plusSeconds(3600)));

    dueNow(schedule);
    tick();
    eventually(() -> nextExecution(schedule).isAfter(Instant.now().plusSeconds(3600)));
    assertThat(executions(studioTest)).isEqualTo(1);

    jdbc.update("UPDATE studio_dispatch_ledger SET state='DONE' WHERE test_id=?", studioTest);
    dueNow(schedule);
    tick();
    eventually(() -> executions(studioTest) == 2);
  }

  @Test
  void aSlotRefusedForAFullStudioQuotaIsPutBackNotSpent() throws Exception {
    UUID other = fixtures.seedTest("Fills the quota", csi, OWNER, STEPS);
    for (int i = 0; i < 20; i++) {
      fixtures.unboundExecution(other, csi, "someone@citi.com", "Production", "PENDING");
    }
    UUID schedule = scheduleUiTest(studioTest);
    tick();
    eventually(
        () ->
            nextExecution(schedule).isAfter(Instant.now())
                && nextExecution(schedule).isBefore(Instant.now().plusSeconds(60)));
    assertThat(executions(studioTest)).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM failed_dispatches WHERE reference_id=?",
                Integer.class,
                studioTest))
        .isZero();
  }

  private static void eventually(BooleanSupplier ready) throws Exception {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
    while (!ready.getAsBoolean() && System.nanoTime() < deadline) {
      Thread.sleep(20);
    }
    assertThat(ready.getAsBoolean()).isTrue();
  }
}
