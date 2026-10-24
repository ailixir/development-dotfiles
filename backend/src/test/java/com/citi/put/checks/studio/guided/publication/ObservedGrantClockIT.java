package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-012A ruling R9: replay grants are minted and judged on the database clock ({@code
 * clock_timestamp()}), the clock the observed-execution trigger, the dispatch CAS and the admission
 * CAS already use. The JVM clock takes no part in a grant decision, so a JVM that is ahead of or
 * behind the database neither refuses a live grant at the trigger nor accepts an expired one in
 * Java. The trigger itself is unchanged: zero tolerance, 30 s cap.
 *
 * <p>Real Testcontainers Postgres and the real {@code studio_observed_execution_guard}. The
 * application {@link Clock} bean is replaced by an offset clock only to model JVM skew; it is not
 * the clock under test.
 */
@SpringBootTest(properties = "studio.execution.callback.service-token=grant-clock-service-token")
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import({ObservedPublicationFixture.FreshAuthority.class, ObservedGrantClockIT.SkewedJvm.class})
class ObservedGrantClockIT {
  private static final String CSI_ID = "60487";
  private static final String OWNER = "grant-clock-owner@citi.com";
  private static final String CLOCK_QUERY = "SELECT clock_timestamp()";
  private static final GuidedContracts C = new GuidedContracts();

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  /** The application clock, offset from the host to model a JVM that disagrees with the DB. */
  static final class OffsetClock extends Clock {
    private volatile Duration offset = Duration.ZERO;

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
      return Clock.systemUTC().instant().plus(offset);
    }

    void skew(Duration value) {
      offset = value;
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class SkewedJvm {
    @Bean
    @Primary
    OffsetClock skewedApplicationClock() {
      return new OffsetClock();
    }
  }

  /** One ordered observation on the test thread. */
  private record Event(String kind, Instant value) {}

  @SpyBean private JdbcTemplate jdbc;
  @SpyBean private PublicationGrantAuthority accounts;
  @SpyBean private ObservedReplayAuthorizer authorizer;
  @Autowired private StudioService studio;
  @Autowired private StudioAcceptanceService acceptance;
  @Autowired private ObservedReplayProperties replay;
  @Autowired private OffsetClock jvm;
  @Autowired private TransactionTemplate transactions;

  private final List<Event> events = Collections.synchronizedList(new ArrayList<>());
  private volatile Thread recording;
  private StudioExecutionFixtures fixtures;

  @BeforeEach
  void setUp() {
    jvm.skew(Duration.ZERO);
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    events.clear();
    recording = Thread.currentThread();
    doAnswer(
            call -> {
              Timestamp value = (Timestamp) call.callRealMethod();
              record("clock", value.toInstant());
              return value;
            })
        .when(jdbc)
        .queryForObject(CLOCK_QUERY, Timestamp.class);
    doAnswer(
            call -> {
              Object fresh = call.callRealMethod();
              record("fresh", null);
              return fresh;
            })
        .when(accounts)
        .fresh(any(), any(), anyString(), anyString(), anyBoolean());
    doAnswer(
            call -> {
              Object prepared = call.callRealMethod();
              record("authorized", null);
              return prepared;
            })
        .when(authorizer)
        .authorize(any(), any(), any());
  }

  @AfterEach
  void restoreJvm() {
    recording = null;
    jvm.skew(Duration.ZERO);
  }

  private void record(String kind, Instant value) {
    if (Thread.currentThread() == recording) {
      events.add(new Event(kind, value));
    }
  }

  private static Authentication owner() {
    return StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
  }

  private UUID runnableTest(String name) {
    return fixtures.seedRunnableTest(name, CSI_ID, OWNER, List.of("Go to the home page")).testId();
  }

  private UUID execute(UUID testId) {
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    return studio
        .executeTest(testId, owner(), null, ObservedPublicationFixture.request(owner()))
        .executionId();
  }

  private Instant databaseNow() {
    return jdbc.queryForObject(CLOCK_QUERY, Timestamp.class).toInstant();
  }

  private JsonNode storedGrant(UUID executionId) {
    return C.parse(
            jdbc.queryForObject(
                "SELECT observed_revision_binding::text FROM ui_test_executions WHERE id=?",
                String.class,
                executionId))
        .path("replayGrant");
  }

  private int rows(UUID testId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?", Integer.class, testId);
  }

  private static int indexOf(List<Event> events, String kind) {
    for (int i = 0; i < events.size(); i++) {
      if (events.get(i).kind().equals(kind)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * (1) Wiring pin. The production authorizer reads {@code clock_timestamp()} after the account
   * freshness call, and the grant's issuedAt is that reading at millisecond precision. A JVM-clock
   * wiring issues no such read inside authorize(), so this fails on it deterministically. It also
   * pins the cost: two reads in authorize() (mint and ceiling) and one in the acceptance bind.
   */
  @Test
  void theGrantIsMintedFromAClockTimestampReadAfterAccountFreshness() {
    UUID testId = runnableTest("Grant clock wiring");
    UUID executionId = execute(testId);
    recording = null;

    List<Event> seen = List.copyOf(events);
    int fresh = indexOf(seen, "fresh");
    int authorized = indexOf(seen, "authorized");
    assertThat(fresh).as("account freshness ran inside authorize(): %s", seen).isGreaterThan(-1);
    assertThat(authorized).as("authorize() returned: %s", seen).isGreaterThan(fresh);
    List<Event> minted = seen.subList(fresh + 1, authorized);
    assertThat(minted)
        .as("clock_timestamp() reads between account freshness and the grant: %s", seen)
        .extracting(Event::kind)
        .containsExactly("clock", "clock");
    Instant issued = Instant.parse(storedGrant(executionId).path("issuedAt").asText());
    assertThat(issued).isEqualTo(PublicationContracts.millisecond(minted.getFirst().value()));
    assertThat(seen.subList(authorized + 1, seen.size()))
        .as("clock_timestamp() reads in the acceptance bind: %s", seen)
        .extracting(Event::kind)
        .containsExactly("clock");
  }

  /**
   * (2) JVM-skew independence of acceptance. The application clock is moved ahead and behind the
   * database by the measured post-sleep lag (788 s) and by 2 s. The grant still comes from the
   * database clock, so acceptance writes exactly one execution and the trigger accepts it.
   */
  @Test
  void acceptanceSucceedsWhateverTheApplicationClockSays() {
    for (long seconds : new long[] {788, 2, -2, -788}) {
      UUID testId = runnableTest("Grant clock skew " + seconds);
      jvm.skew(Duration.ofSeconds(seconds));
      Instant before = databaseNow();
      UUID executionId = execute(testId);
      Instant after = databaseNow();
      jvm.skew(Duration.ZERO);

      assertThat(rows(testId)).as("JVM skew %d s", seconds).isEqualTo(1);
      JsonNode grant = storedGrant(executionId);
      Instant issued = Instant.parse(grant.path("issuedAt").asText());
      Instant expires = Instant.parse(grant.path("expiresAt").asText());
      assertThat(issued)
          .as("JVM skew %d s: issuedAt within the database-clock bracket", seconds)
          .isBetween(PublicationContracts.millisecond(before), after);
      assertThat(Duration.between(issued, expires).toMillis())
          .as("JVM skew %d s", seconds)
          .isEqualTo(replay.authorizationTtlMs());
    }
  }

  /**
   * (3) A grant the database clock has expired is refused in Java as 409 AUTHORIZATION_EXPIRED even
   * while the JVM is 788 s behind, so it never reaches the trigger as a raw persistence failure.
   * The expired grant is a test arrangement of a real authorize() output.
   */
  @Test
  void aGrantExpiredByTheDatabaseClockIsRefusedBeforeTheWrite() {
    UUID testId = runnableTest("Grant clock expiry");
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    var prepared =
        authorizer.authorize(testId, owner(), ObservedPublicationFixture.request(owner()));
    ObjectNode binding = (ObjectNode) prepared.binding();
    Instant expires = PublicationContracts.millisecond(databaseNow()).minusMillis(1);
    ((ObjectNode) binding.path("replayGrant"))
        .put("issuedAt", PublicationContracts.time(expires.minusMillis(30000)))
        .put("expiresAt", PublicationContracts.time(expires));
    var expired = new ObservedReplayAuthorization.Prepared(binding);
    String principal = binding.path("principalId").asText();

    jvm.skew(Duration.ofSeconds(-788));
    assertThatThrownBy(() -> acceptance.acceptObserved(testId, principal, null, expired))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refused -> {
              assertThat(refused.getMessage()).isEqualTo("AUTHORIZATION_EXPIRED");
              assertThat(refused.status()).isEqualTo(409);
            });
    jvm.skew(Duration.ZERO);
    assertThat(rows(testId)).isZero();
  }

  /** (4) The unchanged trigger: zero tolerance on the DB clock and the 30 s cap. */
  @Test
  void theTriggerJudgesGrantsOnTheDatabaseClockWithoutTolerance() {
    var runnable =
        fixtures.seedRunnableTest(
            "Grant clock trigger", CSI_ID, OWNER, List.of("Go to the home page"));
    Instant now = PublicationContracts.millisecond(databaseNow());

    assertThat(insertRefusal(runnable, now, now.plusSeconds(1), now.plusSeconds(26)))
        .as("issuedAt 1 s after the database clock")
        .contains("observed execution grant expired");
    assertThat(insertRefusal(runnable, now, now.minusSeconds(25), now))
        .as("expiresAt equal to an earlier database-clock reading")
        .contains("observed execution grant expired");
    assertThat(insertRefusal(runnable, now, now, now.plusMillis(30001)))
        .as("a 30001 ms grant")
        .contains("observed execution grant invalid");
  }

  private String insertRefusal(
      StudioExecutionFixtures.RunnableTest runnable,
      Instant startedAt,
      Instant issuedAt,
      Instant expiresAt) {
    UUID executionId = UUID.randomUUID();
    ObjectNode binding =
        GuidedPublicationMigrationTest.observedBinding(
            jdbc, runnable.revisionId(), executionId, startedAt, OWNER);
    ((ObjectNode) binding.path("replayGrant"))
        .put("issuedAt", PublicationContracts.time(issuedAt))
        .put("expiresAt", PublicationContracts.time(expiresAt));
    Throwable refused =
        catchThrowable(
            () ->
                jdbc.update(
                    "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at,"
                        + " csi_id, principal, environment, revision_id,"
                        + " observed_revision_binding) VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?,"
                        + " CAST(? AS jsonb))",
                    executionId,
                    runnable.testId(),
                    Timestamp.from(startedAt),
                    binding.path("csiId").asText(),
                    OWNER,
                    binding.path("environment").asText(),
                    runnable.revisionId(),
                    binding.toString()));
    assertThat(refused).isInstanceOf(DataAccessException.class);
    return refused.getMessage();
  }

  /**
   * DatabaseClock contract: each instant() is a fresh clock_timestamp() inside the caller's
   * bracket, outside a transaction (opening none) and inside one (joining it, and not frozen like
   * now()); the zone is UTC.
   */
  @Test
  void theDatabaseClockReadsClockTimestampInAndOutOfATransaction() {
    Clock clock = new DatabaseClock(jdbc);
    assertThat(clock.getZone()).isEqualTo(ZoneOffset.UTC);

    Instant before = databaseNow();
    Instant read = clock.instant();
    Instant after = databaseNow();
    assertThat(read).isBetween(before, after);
    assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();

    transactions.executeWithoutResult(
        status -> {
          Instant started = jdbc.queryForObject("SELECT now()", Timestamp.class).toInstant();
          Instant inside = databaseNow();
          Instant first = clock.instant();
          Instant last = databaseNow();
          assertThat(first).isBetween(inside, last);
          try {
            Thread.sleep(50);
          } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
          }
          Instant second = clock.instant();
          assertThat(Duration.between(first, second)).isGreaterThanOrEqualTo(Duration.ofMillis(50));
          assertThat(jdbc.queryForObject("SELECT now()", Timestamp.class).toInstant())
              .as("now() is frozen at transaction start; the clock is not")
              .isEqualTo(started);
          assertThat(second).isAfter(started.plusMillis(49));
        });
  }
}
