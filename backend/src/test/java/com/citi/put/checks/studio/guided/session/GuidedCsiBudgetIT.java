package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.SecondApplicationContext;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-014 AC-8 (rulings AR-2 c and d): per-CSI concurrent-session and daily model-token
 * budgets, persisted in PostgreSQL and enforced across two application contexts (two replicas)
 * against one database. Every day boundary and {@code Retry-After} is computed by the database; the
 * JVM clock is never faked.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class GuidedCsiBudgetIT {

  private static final String ENV = "Development";
  private static final String[] REPLICA_PROPERTIES = {
    "--studio.guided-authoring.csi-budget.max-concurrent-sessions=1",
    "--studio.guided-authoring.translation.applications=" + ObservedPublicationFixture.APPLICATION,
    "--studio.guided-authoring.translation.environments=" + ENV
  };

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    registry.add("studio.guided-authoring.csi-budget.max-concurrent-sessions", () -> "1");
    // The default is unlimited (user decision 2026-10-23); these tests exercise the finite cap.
    registry.add("studio.guided-authoring.csi-budget.daily-model-input-tokens", () -> "5242880");
    registry.add("studio.guided-authoring.csi-budget.daily-model-output-tokens", () -> "640000");
    registry.add(
        "studio.guided-authoring.translation.applications",
        () -> ObservedPublicationFixture.APPLICATION);
    registry.add("studio.guided-authoring.translation.environments", () -> ENV);
  }

  @Autowired private GuidedSessionService sessions;
  @Autowired private GuidedSessionRepository repository;
  @Autowired private GuidedCsiBudget budget;
  @Autowired private GuidedCsiBudgetProperties limits;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private DataSource dataSource;

  private String csi;
  private String owner;

  @BeforeEach
  void setUp() {
    csi = "B" + UUID.randomUUID().toString().substring(0, 12);
    owner = "budget-" + csi + "@citi.com";
    var fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(owner);
    fixtures.seedCsi(csi, owner);
    ObservedPublicationFixture.seedApprovedPolicies(jdbc, csi);
  }

  @Test
  void twoReplicasStartingTogetherOnOneCsiYieldExactlyOneSessionAndARetryableRefusal()
      throws Exception {
    UUID first = draft(csi);
    UUID second = draft(csi);
    try (SecondApplicationContext replicaB =
        SecondApplicationContext.observed(dataSource, REPLICA_PROPERTIES)) {
      GuidedSessionService onB = replicaB.bean(GuidedSessionService.class);
      CountDownLatch go = new CountDownLatch(1);
      var pool = Executors.newFixedThreadPool(2);
      try {
        List<Future<Object>> results = new ArrayList<>();
        results.add(pool.submit(started(go, sessions, first)));
        results.add(pool.submit(started(go, onB, second)));
        go.countDown();
        int accepted = 0;
        GuidedSessionException refused = null;
        for (var result : results) {
          Object value = result.get(60, TimeUnit.SECONDS);
          if (value instanceof GuidedSessionException refusal) {
            refused = refusal;
          } else {
            accepted++;
          }
        }
        assertThat(accepted).as("exactly one session starts").isEqualTo(1);
        assertThat(refused).isNotNull();
        assertThat(refused.getMessage()).isEqualTo("BUDGET_EXCEEDED");
        assertThat(refused.status()).isEqualTo(429);
        assertThat(refused.messageCode()).isEqualTo("CSI_CONCURRENT_SESSIONS_EXHAUSTED");
        assertThat(refused.retryable()).isTrue();
        assertThat(refused.retryAfterSeconds()).isBetween(1, 600);
      } finally {
        pool.shutdownNow();
      }
    }
    assertThat(liveSessions(csi)).isEqualTo(1);

    String other = "B" + UUID.randomUUID().toString().substring(0, 12);
    new StudioExecutionFixtures(jdbc).seedCsi(other, owner);
    ObservedPublicationFixture.seedApprovedPolicies(jdbc, other);
    assertThat(start(sessions, draft(other)).path("sessionId").asText())
        .as("a different CSI is unaffected")
        .isNotBlank();
  }

  @Test
  void anExhaustedDayRefusesTheStartRetryableUntilUtcMidnightAndYesterdayDoesNotCount() {
    jdbc.update(
        "INSERT INTO studio_guided_csi_token_days(csi_id,budget_day,input_tokens,output_tokens)"
            + " VALUES (?,(clock_timestamp() AT TIME ZONE 'UTC')::date - 1,?,?)",
        csi,
        limits.dailyModelInputTokens(),
        limits.dailyModelOutputTokens());
    assertThat(start(sessions, draft(csi)).path("sessionId").asText())
        .as("yesterday's spend does not count today")
        .isNotBlank();

    String exhausted = "B" + UUID.randomUUID().toString().substring(0, 12);
    new StudioExecutionFixtures(jdbc).seedCsi(exhausted, owner);
    ObservedPublicationFixture.seedApprovedPolicies(jdbc, exhausted);
    jdbc.update(
        "INSERT INTO studio_guided_csi_token_days(csi_id,budget_day,input_tokens,output_tokens)"
            + " VALUES (?,(clock_timestamp() AT TIME ZONE 'UTC')::date,?,0)",
        exhausted,
        limits.dailyModelInputTokens());
    UUID test = draft(exhausted);
    int sessionsBefore = allSessions();
    assertThatThrownBy(() -> start(sessions, test))
        .isInstanceOf(GuidedSessionException.class)
        .satisfies(
            failure -> {
              var refusal = (GuidedSessionException) failure;
              assertThat(refusal.messageCode()).isEqualTo("CSI_DAILY_TOKENS_EXHAUSTED");
              assertThat(refusal.retryable()).isTrue();
              assertThat(refusal.retryAfterSeconds()).isBetween(1, 86_400);
              Integer expected =
                  jdbc.queryForObject(
                      "SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((date_trunc('day',"
                          + " clock_timestamp() AT TIME ZONE 'UTC') + interval '1 day') -"
                          + " (clock_timestamp() AT TIME ZONE 'UTC')))))::int",
                      Integer.class);
              assertThat(refusal.retryAfterSeconds()).isBetween(expected - 5, expected + 5);
            });
    assertThat(allSessions()).as("a refusal writes no session").isEqualTo(sessionsBefore);
  }

  /**
   * AC-8 oracle 3 (QA TEST-002): the CSI's day is exhausted after a session started, so the next
   * model reservation (the production hook GuidedTranslationService calls inside its reservation
   * transaction) is refused: the session ends FAILED with errorCode BUDGET_EXCEEDED and neither the
   * CSI day nor the session counters are charged.
   */
  @Test
  void aDayExhaustedMidSessionRefusesTheNextReservationAndEndsTheSessionBudgetExceeded() {
    String id = start(sessions, draft(csi)).path("sessionId").asText();
    jdbc.update(
        "INSERT INTO studio_guided_csi_token_days(csi_id,budget_day,input_tokens,output_tokens)"
            + " VALUES (?,(clock_timestamp() AT TIME ZONE 'UTC')::date,?,0)",
        csi,
        limits.dailyModelInputTokens());
    List<Long> before = day(csi);
    long sessionInputBefore =
        repository.transaction(
            () ->
                repository.lock(id).document().path("counters").path("modelInputTokens").asLong());
    Boolean admitted =
        repository.transaction(
            () -> sessions.modelReservationFitsLocked(repository.lock(id), 1000, 4000));
    assertThat(admitted).as("the reservation is refused").isFalse();
    var after = repository.transaction(() -> repository.lock(id));
    assertThat(after.document().path("state").asText()).isEqualTo("FAILED");
    assertThat(after.progress().path("errorCode").asText()).isEqualTo("BUDGET_EXCEEDED");
    assertThat(after.document().path("counters").path("modelInputTokens").asLong())
        .as("the session is not charged")
        .isEqualTo(sessionInputBefore);
    assertThat(day(csi)).as("the CSI day is not charged").isEqualTo(before);
  }

  @Test
  void theDailyChargeIsAConditionalVerdictAtTheCeilingAndLateExcessIsNeverRefused() {
    long input = limits.dailyModelInputTokens();
    long output = limits.dailyModelOutputTokens();
    var tx =
        new org.springframework.transaction.support.TransactionTemplate(
            new org.springframework.jdbc.datasource.DataSourceTransactionManager(dataSource));

    assertThat(charge(tx, () -> budget.charge(csi, input - 1, 10))).isTrue();
    assertThat(charge(tx, () -> budget.charge(csi, 2, 10)))
        .as("the next reservation would pass the limit: refused, nothing charged")
        .isFalse();
    assertThat(day(csi)).isEqualTo(List.of(input - 1, 10L));
    assertThat(charge(tx, () -> budget.charge(csi, 1, 10))).as("exactly at the limit").isTrue();
    tx.executeWithoutResult(s -> budget.chargeExcess(csi, 50, 5));
    assertThat(day(csi)).isEqualTo(List.of(input + 50, 25L));
    assertThat(output).isGreaterThan(25);
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_guided_csi_token_days SET input_tokens=0 WHERE csi_id=?", csi))
        .as("counters are monotone")
        .hasMessageContaining("monotone");
  }

  @Test
  void theStartupInvariantRefusesADayThatCannotHoldOneSession() {
    var session = new GuidedSessionProperties(true, Map.of());
    assertThatThrownBy(
            () ->
                new GuidedCsiBudgetProperties(3, session.maxModelInputTokensTotal() - 1, 640_000)
                    .requireFits(session))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(
            () -> new GuidedCsiBudgetProperties(0, 5_242_880, 640_000).requireFits(session))
        .isInstanceOf(IllegalStateException.class);
    new GuidedCsiBudgetProperties(3, 5_242_880, 640_000).requireFits(session);
  }

  @Test
  void unlimitedDailyTokensNeverRefuseAndANegativeValueIsRefusedAtStartup() {
    var unlimited = new GuidedCsiBudgetProperties(3, 0, 0);
    var session = new GuidedSessionProperties(true, Map.of());
    unlimited.requireFits(session);
    assertThatThrownBy(() -> new GuidedCsiBudgetProperties(3, -1, 0).requireFits(session))
        .isInstanceOf(IllegalStateException.class);

    String spent = "C" + UUID.randomUUID().toString().substring(0, 12);
    new StudioExecutionFixtures(jdbc).seedCsi(spent, owner);
    jdbc.update(
        "INSERT INTO studio_guided_csi_token_days(csi_id,budget_day,input_tokens,output_tokens)"
            + " VALUES (?,(clock_timestamp() AT TIME ZONE 'UTC')::date,?,?)",
        spent,
        limits.dailyModelInputTokens() * 10,
        limits.dailyModelOutputTokens() * 10);
    var open = new GuidedCsiBudget(jdbc, unlimited);
    var tx =
        new org.springframework.transaction.support.TransactionTemplate(
            new org.springframework.jdbc.datasource.DataSourceTransactionManager(dataSource));
    tx.executeWithoutResult(s -> open.admitStart(spent));
    assertThat(charge(tx, () -> open.charge(spent, 1_000_000, 1_000_000)))
        .as("no gate, no cap: far past the finite default")
        .isTrue();
    var capped = new GuidedCsiBudget(jdbc, new GuidedCsiBudgetProperties(3, 5_242_880, 640_000));
    assertThatThrownBy(() -> tx.executeWithoutResult(s -> capped.admitStart(spent)))
        .as("the same day is refused under a finite cap")
        .isInstanceOf(GuidedSessionException.class);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static boolean charge(
      org.springframework.transaction.support.TransactionTemplate tx,
      java.util.function.BooleanSupplier verdict) {
    Boolean result = tx.execute(s -> verdict.getAsBoolean());
    return Boolean.TRUE.equals(result);
  }

  private Callable<Object> started(CountDownLatch go, GuidedSessionService service, UUID test) {
    return () -> {
      go.await(30, TimeUnit.SECONDS);
      try {
        return start(service, test);
      } catch (GuidedSessionException refusal) {
        return refusal;
      }
    };
  }

  private ObjectNode start(GuidedSessionService service, UUID test) {
    String csiId =
        jdbc.queryForObject("SELECT csi_id FROM ui_tests WHERE id=?", String.class, test);
    return (ObjectNode)
        service.start(
            StudioExecutionFixtures.identity(owner, csiId, "owner"),
            UUID.randomUUID().toString(),
            ObservedPublicationFixture.guidedStart(test, ENV));
  }

  private UUID draft(String csiId) {
    return ObservedPublicationFixture.guidedDraft(jdbc, csiId, ENV, owner);
  }

  private int liveSessions(String csiId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_sessions WHERE document->'scope'->>'csiId'=? AND state"
            + " NOT IN "
            + GuidedCsiBudget.TERMINAL,
        Integer.class,
        csiId);
  }

  private int allSessions() {
    return jdbc.queryForObject("SELECT count(*) FROM studio_guided_sessions", Integer.class);
  }

  private List<Long> day(String csiId) {
    return jdbc.queryForObject(
        "SELECT input_tokens, output_tokens FROM studio_guided_csi_token_days WHERE csi_id=? AND"
            + " budget_day=(clock_timestamp() AT TIME ZONE 'UTC')::date",
        (rs, n) -> List.of(rs.getLong(1), rs.getLong(2)),
        csiId);
  }
}
