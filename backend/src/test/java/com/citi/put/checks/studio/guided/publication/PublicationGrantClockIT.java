package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * R9-OBS-3: production composition, DB reads, exact claim timestamp and budget clock ownership.
 * Synthetic relational evidence supplies learning; no runner/model/native acceptance is claimed.
 * The replacement application Clock models JVM skew; literal systemUTC regressions are killed by
 * the exact DB-read and timestamp oracles, independently of that application's injectable clock.
 */
@SpringBootTest(properties = "studio.execution.callback.service-token=publication-clock-test")
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import({ObservedPublicationFixture.FreshAuthority.class, PublicationGrantClockIT.SkewedJvm.class})
class PublicationGrantClockIT {
  private static final String CSI = "60487";
  private static final String OWNER = "publication-clock-owner@citi.com";
  private static final String QUERY = "SELECT clock_timestamp()";
  private static final GuidedContracts C = new GuidedContracts();

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  static final class OffsetClock extends Clock {
    private Duration offset = Duration.ZERO;

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
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class SkewedJvm {
    @Bean
    @Primary
    OffsetClock skewedApplicationClock() {
      return new OffsetClock();
    }
  }

  @SpyBean private JdbcTemplate jdbc;
  @SpyBean private GuidedPublicationRepository publications;
  @Autowired private GuidedPlanPublisher publisher;
  @Autowired private GuidedSessionRepository sessions;
  @Autowired private GuidedPublicationBaseRepository bases;
  @Autowired private ApplicationContext context;
  @Autowired private TransactionTemplate tx;
  @Autowired private OffsetClock jvm;
  private final List<Instant> reads = new ArrayList<>();
  private Thread recording;

  @BeforeEach
  void setup() {
    jvm.offset = Duration.ZERO;
    var fixture = new StudioExecutionFixtures(jdbc);
    fixture.seedUser(OWNER);
    fixture.seedCsi(CSI, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI);
    reads.clear();
    recording = Thread.currentThread();
    doAnswer(
            call -> {
              Timestamp result = (Timestamp) call.callRealMethod();
              if (Thread.currentThread() == recording) {
                reads.add(result.toInstant());
              }
              return result;
            })
        .when(jdbc)
        .queryForObject(QUERY, Timestamp.class);
  }

  private Object authority() {
    return context.getBean("publicationGrantAuthority");
  }

  private PublicationContracts.Snapshot snapshot(Instant deadline) {
    var identity = C.object().put("validationDeadline", PublicationContracts.time(deadline));
    identity
        .putObject("base")
        .put("sessionId", "clock-session")
        .put("originalPrincipalId", OWNER)
        .put("csiId", CSI);
    return new PublicationContracts.Snapshot(identity, C.object());
  }

  private PublicationContracts.Grant authorize(
      PublicationContracts.Snapshot snapshot, Instant expires) {
    var user = StudioExecutionFixtures.identity(OWNER, CSI, "owner");
    var session = C.object().put("expiresAt", PublicationContracts.time(expires));
    session.putObject("owner").put("leaseExpiresAt", PublicationContracts.time(expires));
    return ReflectionTestUtils.invokeMethod(
        authority(),
        "authorizePublication",
        user,
        ObservedPublicationFixture.request(user),
        snapshot,
        session);
  }

  @Test
  void publicationMintAndJudgeReadDatabaseClockWithJvmAheadAndBehind() {
    for (long seconds : new long[] {788, 2, -2, -788}) {
      jvm.offset = Duration.ofSeconds(seconds);
      Instant now = jdbc.queryForObject(QUERY, Timestamp.class).toInstant();
      reads.clear();
      var grant = authorize(snapshot(now.plusSeconds(60)), now.plusSeconds(60));
      assertThat(reads).as("mint and judge, JVM offset %s", seconds).hasSize(2);
      assertThat(grant.expiresAt())
          .isEqualTo(
              PublicationContracts.millisecond(
                  reads
                      .getFirst()
                      .plusMillis(
                          context
                              .getBean(GuidedPublicationProperties.class)
                              .authorizationTtlMs())));
      assertThat(grant.expiresAt()).isAfter(reads.getLast());
    }
    jvm.offset = Duration.ZERO;
  }

  @Test
  void databaseExpiredPublicationGrantRefusesDespiteJvmBehind() {
    jvm.offset = Duration.ofSeconds(-788);
    Instant now = jdbc.queryForObject(QUERY, Timestamp.class).toInstant();
    reads.clear();
    assertThatThrownBy(() -> authorize(snapshot(now.minusMillis(1)), now.plusSeconds(60)))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> {
              assertThat(failure.getMessage()).isEqualTo("EXPIRED");
              assertThat(failure.status()).isEqualTo(409);
            });
    assertThat(reads).as("expired grant still mints and judges on DB").hasSize(2);
    jvm.offset = Duration.ZERO;
  }

  private String finalizingSession() {
    UUID testId = ObservedPublicationFixture.guidedDraft(jdbc, CSI, "Production", OWNER);
    String id = new ObservedPublicationFixture(jdbc).learnWithoutPublishing(testId);
    tx.executeWithoutResult(
        status -> {
          var current = sessions.lock(id);
          current.document().put("state", "OBSERVING");
          current
              .document()
              .putObject("owner")
              .put("workerId", "fixture-worker")
              .put("fence", 1)
              .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
          sessions.save(current);
        });
    var base = bases.find(id).orElseThrow();
    GuidedPublicationEvidenceFixture.completeExistingSession(jdbc, tx, id, base);
    tx.executeWithoutResult(
        status -> {
          var current = sessions.lock(id);
          current.progress().put("stepIndex", current.document().path("sourceSteps").size());
          current.document().put("state", "FINALIZING");
          sessions.save(current);
          jdbc.update(
              "UPDATE studio_guided_translation_state SET continuation='FINALIZING' WHERE session_id=?",
              id);
        });
    return id;
  }

  private static final class ValidationReached extends RuntimeException {}

  @Test
  void publisherClaimsWithExactDatabaseReadingAndGivesValidationADatabaseBudget() throws Exception {
    for (long seconds : new long[] {788, -788}) {
      jvm.offset = Duration.ofSeconds(seconds);
      String id = finalizingSession();
      var claimTimes = new ArrayList<Instant>();
      doAnswer(
              call -> {
                Instant passed = call.getArgument(4);
                assertThat(reads).as("DB read before publisher claim").isNotEmpty();
                assertThat(passed)
                    .as("exact instant from DatabaseClock, never host clock")
                    .isEqualTo(reads.getLast());
                claimTimes.add(passed);
                return call.callRealMethod();
              })
          .when(publications)
          .claim(anyString(), any(), any(), anyString(), any());
      // Runtime field type keeps this red test source valid before and after client folding.
      var field = GuidedPlanPublisher.class.getDeclaredField("validator");
      field.setAccessible(true);
      Object original = field.get(publisher);
      Object stoppedValidator =
          org.mockito.Mockito.mock(
              field.getType(),
              call -> {
                if (!call.getMethod().getName().equals("validate")) {
                  return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
                }
                PublicationBudget budget = call.getArgument(1);
                assertThat(budget.clock()).isInstanceOf(DatabaseClock.class);
                int before = reads.size();
                Duration available = budget.remaining();
                assertThat(reads).hasSize(before + 1);
                assertThat(available)
                    .isEqualTo(Duration.between(reads.getLast(), budget.deadline()));
                throw new ValidationReached();
              });
      field.set(publisher, stoppedValidator);
      var user = StudioExecutionFixtures.identity(OWNER, CSI, "owner");
      var base = bases.find(id).orElseThrow().document();
      ObjectNode request =
          C.object()
              .put("schemaVersion", 3)
              .put("expectedSourceRevision", base.path("sourceRevision").asText())
              .put("expectedConfigurationRevision", base.path("configurationRevision").asText());
      reads.clear();
      try {
        assertThatThrownBy(
                () ->
                    publisher.finalizeForUser(
                        user,
                        ObservedPublicationFixture.request(user),
                        id,
                        "clock-" + UUID.randomUUID(),
                        request))
            .isInstanceOf(ValidationReached.class);
        assertThat(claimTimes).hasSize(1);
      } finally {
        field.set(publisher, original);
        org.mockito.Mockito.reset(publications);
        jvm.offset = Duration.ZERO;
      }
    }
  }
}
