package com.citi.put.checks.studio.sse;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.SecondApplicationContext;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-33 — <b>a callback committed on replica A becomes visible to an SSE subscriber on
 * replica B</b>, and the mechanism is the one the SSE assessment prescribes and no other.
 *
 * <p>This is the criterion the whole SSE design exists for. Production runs three API replicas
 * scaling to six, so a runner callback and a browser subscription reach different pods routinely,
 * not exceptionally. An in-memory emitter registry that a callback publishes into is therefore
 * wrong <em>by construction</em>: on the pod holding the subscription, the callback never happened.
 *
 * <p>Two genuine application contexts run against one database. The callback is applied on context
 * A; the stream is opened over real HTTP against context B's own port. Nothing connects the two
 * except committed rows.
 *
 * <p>The falsification is required and was run: with the broadcaster reading a per-pod in-memory
 * map that the callback publishes into — the design this criterion rules out — every same-pod test
 * stays green and this one goes red. See the Dev Agent Record.
 */
@SpringBootTest(
    properties = {
      "studio.execution.sse.read-interval-ms=200",
      "studio.execution.sse.heartbeat=1s",
      "studio.execution.sse.lifetime=30s"
    })
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class SseCrossReplicaIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60473";
  private static final String OWNER = "cross-replica-owner@citi.com";
  private static final String READER = "cross-replica-reader@citi.com";
  private static final String RUNNER = "studio-runner-0";

  @Autowired private StudioService studioService;
  @Autowired private AdmissionCasService admissionService;

  @Autowired
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observedReplay;

  @Autowired private ProgressReportService progressService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private DataSource dataSource;
  @Autowired private WatchedExecutionRegistry registryOnA;

  private UUID executionId;
  private UUID attemptId;
  private UUID admissionId;

  @BeforeEach
  void setUp() {
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(READER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    Authentication owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    UUID testId =
        fixtures
            .seedRunnableTest("Cross-replica draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    executionId =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    // STUDIO-OBS-014 P1: dispatched under the attempt the observed Run authority issued and
    // admitted through the observed admission, as the runner does (legacy claim() deleted).
    attemptId = ObservedPublicationFixture.bindingAttempt(observedReplay, executionId);
    UUID attempt = attemptId;
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              executionId, "xr-dispatcher", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(executionId, "xr-dispatcher", attempt);
        });
    admissionId = UUID.randomUUID();
    ObservedPublicationFixture.admitObserved(
        observedReplay, admissionService, executionId, RUNNER, admissionId);
  }

  @Test
  void aCallbackCommittedOnReplicaAReachesASubscriberOnReplicaB() throws Exception {
    try (SecondApplicationContext replicaB = new SecondApplicationContext(dataSource);
        SseTestClient subscriber = new SseTestClient()) {

      String url =
          "http://localhost:"
              + replicaB.port()
              + "/api/v1/studio/executions/"
              + executionId
              + "/events";
      subscriber.open(url, readerHeaders());
      assertThat(subscriber.awaitSnapshots(1, Duration.ofSeconds(15)))
          .as("replica B answered the subscription from committed state")
          .isTrue();
      long openingRevision = revisionOf(subscriber.snapshots().get(0).data());

      // The callback lands on replica A. Nothing on replica B is told about it by anything other
      // than the database.
      progressService.apply(executionId, started(1));

      assertThat(subscriber.awaitSnapshots(2, Duration.ofSeconds(15)))
          .as(
              "replica B's subscriber must see a callback committed on replica A within a bounded "
                  + "interval — with no broker, no sticky session and no cross-pod messaging")
          .isTrue();

      ExecutionSnapshotDto delivered =
          objectMapper.readValue(
              subscriber.snapshots().get(subscriber.snapshots().size() - 1).data(),
              ExecutionSnapshotDto.class);
      assertThat(delivered.revision()).isGreaterThan(openingRevision);
      assertThat(delivered.status()).isEqualTo("RUNNING");
      assertThat(delivered.executionId()).isEqualTo(executionId);
    }
  }

  @Test
  void theTwoContextsAreGenuinelyDistinctAndShareOnlyTheDatabase() throws Exception {
    try (SecondApplicationContext replicaB = new SecondApplicationContext(dataSource)) {
      // If these were the same context, or the same registry, the cross-replica test above would
      // pass for a reason that has nothing to do with the mechanism it claims to prove. And if
      // they were two *databases*, it would fail for one. Both are checked here rather than
      // assumed, because both have silent failure modes.
      assertThat(replicaB.bean(WatchedExecutionRegistry.class))
          .as("replica B keeps its own watched set")
          .isNotSameAs(registryOnA);
      try (var connectionA = dataSource.getConnection();
          var connectionB = replicaB.bean(DataSource.class).getConnection()) {
        assertThat(connectionB.getMetaData().getURL())
            .as("and the two replicas share exactly one database")
            .isEqualTo(connectionA.getMetaData().getURL());
      }
    }
  }

  private long revisionOf(String json) throws Exception {
    return objectMapper.readValue(json, ExecutionSnapshotDto.class).revision();
  }

  private static Map<String, String> readerHeaders() {
    return Map.of(
        "X-User-Id",
        "uid-" + READER,
        "X-User-Email",
        READER,
        "X-User-Roles",
        "",
        "X-User-Csi-Ownership",
        CSI_ID + ":viewer");
  }

  private RunnerReport started(long sequence) {
    return new RunnerReport(
        executionId,
        attemptId,
        admissionId,
        RUNNER,
        RunnerReport.STARTED,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        List.of(),
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of(),
        null,
        null,
        null,
        Map.of());
  }
}
