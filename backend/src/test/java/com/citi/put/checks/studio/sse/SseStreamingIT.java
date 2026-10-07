package com.citi.put.checks.studio.sse;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-32, AC-34 – AC-37a — streaming over <b>real HTTP against the running application,
 * through the full security and filter chain</b>, with a client that reads the socket
 * incrementally.
 *
 * <p>The deadlines are compressed so the bounded-lifetime and heartbeat properties are observable
 * in a test rather than merely configured: 1 s heartbeat, 6 s lifetime, 200 ms batched read, 1 s
 * authorization refresh. The §8.5 production values are 15 s, 60 s, 500–1000 ms and 30 s.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "studio.execution.sse.heartbeat=1s",
      "studio.execution.sse.lifetime=6s",
      "studio.execution.sse.read-interval-ms=200",
      "studio.execution.sse.authorization-refresh=1s",
      // Generous here on purpose: the bounds themselves are asserted by SseBoundsIT, and leaving
      // them at their defaults would make these tests fail for a reason unrelated to what they
      // test — a previous test's stream not yet released.
      "studio.execution.sse.max-streams-per-user=50",
      "studio.execution.sse.max-streams-per-pod=50"
    })
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@ExtendWith(OutputCaptureExtension.class)
class SseStreamingIT {

  private static final String CSI_ID = "60471";
  private static final String OWNER = "sse-owner@citi.com";
  private static final String READER = "sse-reader@citi.com";
  private static final String STRANGER = "sse-stranger@citi.com";
  private static final String RUNNER = "studio-runner-0";

  @LocalServerPort private int port;

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioService studioService;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private ProgressReportService progressService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private WatchedExecutionRegistry registry;
  @Autowired private BoundedSenders senders;
  @Autowired private TransactionTemplate transactions;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private UUID testId;
  private UUID executionId;
  private UUID attemptId;
  private UUID admissionId;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(READER);
    fixtures.seedUser(STRANGER);
    fixtures.seedCsi(CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    testId =
        fixtures
            .seedRunnableTest("SSE draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    executionId = studioService.executeTest(testId, owner, null).executionId();
    attemptId = UUID.randomUUID();
    UUID attempt = attemptId;
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              executionId, "sse-dispatcher", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(executionId, "sse-dispatcher", attempt);
        });
    admissionId = UUID.randomUUID();
    admissionService.claim(
        executionId, new AdmissionRequest(executionId, attemptId, RUNNER, admissionId, Map.of()));
  }

  @org.junit.jupiter.api.AfterEach
  void drainStreams() throws Exception {
    // A stream's server side is released on timeout, error or completion, which can lag a client
    // socket close. Draining between tests keeps one test's teardown out of the next one's bounds.
    long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
    while (System.nanoTime() < deadline && registry.openStreamCount() > 0) {
      Thread.sleep(100);
    }
  }

  // ── AC-32: the frame, the headers and Last-Event-ID ──────────────────────

  @Test
  void theStreamCarriesExactlyTheSnapshotDtoWithTheRevisionAsTheEventId() throws Exception {
    try (SseTestClient client = new SseTestClient()) {
      HttpResponse<?> response = client.open(eventsUrl(), readerHeaders());

      assertThat(response.statusCode()).isEqualTo(200);
      assertThat(response.headers().firstValue("Content-Type").orElse(""))
          .contains("text/event-stream");
      assertThat(response.headers().firstValue("Cache-Control").orElse(""))
          .as("an intermediary that caches this breaks it")
          .contains("no-store");
      assertThat(response.headers().firstValue("X-Accel-Buffering").orElse(""))
          .as("and one that buffers it breaks it too")
          .isEqualTo("no");

      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();
      SseTestClient.Frame first = client.snapshots().get(0);

      assertThat(first.event()).isEqualTo("execution.snapshot");
      ExecutionSnapshotDto streamed =
          objectMapper.readValue(first.data(), ExecutionSnapshotDto.class);
      assertThat(first.id()).isEqualTo(Long.toString(streamed.revision()));
      assertThat(streamed.executionId()).isEqualTo(executionId);
      // Labelled like GET /executions/{id} (Story 10.46, TEST-001).
      assertThat(streamed.testName()).isEqualTo("SSE draft");
    }
  }

  @Test
  void theStreamedSnapshotIsByteIdenticalToTheGetSnapshotForTheSameExecution() throws Exception {
    try (SseTestClient client = new SseTestClient()) {
      client.open(eventsUrl(), readerHeaders());
      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();
      String streamed = client.snapshots().get(0).data();

      ResponseEntity<String> get =
          restTemplate.exchange(
              "/api/v1/studio/executions/" + executionId,
              HttpMethod.GET,
              new HttpEntity<>(springHeaders(READER, CSI_ID + ":viewer")),
              String.class);

      // The same type, so the MFE renders one shape regardless of transport (§5.5).
      assertThat(objectMapper.readTree(streamed)).isEqualTo(objectMapper.readTree(get.getBody()));
    }
  }

  @Test
  void everyLastEventIdValueProducesTheSameCurrentSnapshotAndNeverAReplay() throws Exception {
    ExecutionSnapshotDto current = studioService.findExecutionById(executionId, owner);
    long revision = current.revision();

    for (String lastEventId :
        List.of(
            Long.toString(revision + 100),
            Long.toString(Math.max(0, revision - 100)),
            Long.toString(revision),
            "not-a-number")) {
      try (SseTestClient client = new SseTestClient()) {
        Map<String, String> headers = new java.util.HashMap<>(readerHeaders());
        headers.put("Last-Event-ID", lastEventId);
        client.open(eventsUrl(), headers);

        assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10)))
            .as("Last-Event-ID '%s'", lastEventId)
            .isTrue();
        ExecutionSnapshotDto streamed =
            objectMapper.readValue(client.snapshots().get(0).data(), ExecutionSnapshotDto.class);
        assertThat(streamed.revision()).as("Last-Event-ID '%s'", lastEventId).isEqualTo(revision);
        assertThat(client.snapshots()).as("never a replay").hasSize(1);
      }
    }

    // And absent, which is the ordinary first connection.
    try (SseTestClient client = new SseTestClient()) {
      client.open(eventsUrl(), readerHeaders());
      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();
      assertThat(
              objectMapper
                  .readValue(client.snapshots().get(0).data(), ExecutionSnapshotDto.class)
                  .revision())
          .isEqualTo(revision);
    }
  }

  // ── AC-34: real delivery, heartbeat, lifetime, close on completion ───────

  @Test
  void twoTimedSnapshotsArriveAsSeparateEventsBeforeTheResponseCloses() throws Exception {
    try (SseTestClient client = new SseTestClient()) {
      client.open(eventsUrl(), readerHeaders());
      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();

      progressService.apply(executionId, started(1));
      assertThat(client.awaitSnapshots(2, Duration.ofSeconds(10))).isTrue();

      List<SseTestClient.Frame> snapshots = client.snapshots();
      assertThat(snapshots).hasSizeGreaterThanOrEqualTo(2);
      assertThat(snapshots.get(1).receivedAtMs())
          .as("separate events, separated in time, and not one buffered blob at the end")
          .isGreaterThan(snapshots.get(0).receivedAtMs());
      assertThat(client.isClosed()).as("and the response had not closed").isFalse();

      ExecutionSnapshotDto second =
          objectMapper.readValue(snapshots.get(1).data(), ExecutionSnapshotDto.class);
      assertThat(second.status()).isEqualTo("RUNNING");
      assertThat(second.revision())
          .isGreaterThan(
              objectMapper
                  .readValue(snapshots.get(0).data(), ExecutionSnapshotDto.class)
                  .revision());
    }
  }

  @Test
  void anIdleIntervalLongerThanTheHeartbeatSurvivesBecauseCommentFramesArrive() throws Exception {
    try (SseTestClient client = new SseTestClient()) {
      client.open(eventsUrl(), readerHeaders());
      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();

      // Nothing changes for well over the 1 s heartbeat configured here.
      Thread.sleep(3000);

      assertThat(client.heartbeats())
          .as("comment frames keep an idle stream alive without producing a snapshot event")
          .isNotEmpty();
      assertThat(client.snapshots()).as("and an idle stream broadcasts nothing").hasSize(1);
      assertThat(client.isClosed()).isFalse();
    }
  }

  @Test
  void theStreamEndsAtItsBoundedLifetimeAndAReconnectRestoresCurrentState() throws Exception {
    try (SseTestClient client = new SseTestClient()) {
      client.open(eventsUrl(), readerHeaders());
      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();

      assertThat(client.awaitClosed(Duration.ofSeconds(20)))
          .as("the 6 s bounded lifetime is what keeps a pod's socket budget finite")
          .isTrue();
    }

    progressService.apply(executionId, started(1));

    try (SseTestClient reconnect = new SseTestClient()) {
      reconnect.open(eventsUrl(), readerHeaders());
      assertThat(reconnect.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();
      ExecutionSnapshotDto restored =
          objectMapper.readValue(reconnect.snapshots().get(0).data(), ExecutionSnapshotDto.class);
      assertThat(restored.status())
          .as("current state, not a replay of what was missed")
          .isEqualTo("RUNNING");
    }
  }

  @Test
  void streamCompleteClosesTheStreamButATerminalStatusWithEvidenceProcessingDoesNot()
      throws Exception {
    progressService.apply(executionId, started(1));

    try (SseTestClient client = new SseTestClient()) {
      client.open(eventsUrl(), readerHeaders());
      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();

      // Terminal outcome, evidence still processing: streamComplete is false and it stays open.
      progressService.apply(executionId, terminal(9, RunOutcome.FAILED, RunnerEvidence.PENDING));
      assertThat(client.awaitSnapshots(2, Duration.ofSeconds(10))).isTrue();
      ExecutionSnapshotDto outcomeKnown =
          objectMapper.readValue(
              client.snapshots().get(client.snapshots().size() - 1).data(),
              ExecutionSnapshotDto.class);
      assertThat(outcomeKnown.status()).isEqualTo("FAILED");
      assertThat(outcomeKnown.streamComplete()).isFalse();
      assertThat(client.isClosed())
          .as("an execution reaching a terminal status while video availability may still change")
          .isFalse();

      // Evidence settles: streamComplete flips and the stream closes explicitly.
      progressService.apply(executionId, terminal(10, RunOutcome.FAILED, RunnerEvidence.FAILED));
      assertThat(client.awaitClosed(Duration.ofSeconds(10))).isTrue();
      ExecutionSnapshotDto settled =
          objectMapper.readValue(
              client.snapshots().get(client.snapshots().size() - 1).data(),
              ExecutionSnapshotDto.class);
      assertThat(settled.streamComplete()).isTrue();
    }
  }

  @Test
  void closingACompletedStreamDoesNotReauthorizeTheInternalAsyncDispatch(CapturedOutput output)
      throws Exception {
    progressService.apply(executionId, started(1));

    int streamsBefore = registry.openStreamCount();
    try (SseTestClient client = new SseTestClient()) {
      client.open(eventsUrl(), readerHeaders());
      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();

      progressService.apply(executionId, terminal(9, RunOutcome.PASSED, RunnerEvidence.STORED));
      assertThat(client.awaitClosed(Duration.ofSeconds(10))).isTrue();
    }

    awaitReleased(streamsBefore);
    Thread.sleep(250);

    assertThat(output.getOut())
        .doesNotContain(
            "Unable to handle the Spring Security Exception because the response is already committed")
        .doesNotContain("Cannot render error page for request");
  }

  // ── AC-35: cleanup on every release path, and returned capacity ──────────

  @Test
  void eachReleasePathDropsTheSubscriptionTheWatchedIdAndReturnsSenderCapacity() throws Exception {
    int streamsBefore = registry.openStreamCount();
    int watchedBefore = registry.watchedExecutionCount();
    int capacityBefore = senders.freeCapacity();

    // 1. Client disconnect.
    SseTestClient disconnecting = new SseTestClient();
    disconnecting.open(eventsUrl(), readerHeaders());
    assertThat(disconnecting.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();
    assertThat(registry.openStreamCount()).isEqualTo(streamsBefore + 1);
    assertThat(registry.watchedExecutionCount()).isEqualTo(watchedBefore + 1);
    disconnecting.close();
    awaitReleased(streamsBefore);

    // 2. Timeout / bounded lifetime.
    try (SseTestClient expiring = new SseTestClient()) {
      expiring.open(eventsUrl(), readerHeaders());
      assertThat(expiring.awaitClosed(Duration.ofSeconds(20))).isTrue();
    }
    awaitReleased(streamsBefore);

    // 3. Completion on streamComplete.
    progressService.apply(executionId, started(1));
    try (SseTestClient completing = new SseTestClient()) {
      completing.open(eventsUrl(), readerHeaders());
      assertThat(completing.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();
      progressService.apply(executionId, terminal(9, RunOutcome.PASSED, RunnerEvidence.STORED));
      assertThat(completing.awaitClosed(Duration.ofSeconds(10))).isTrue();
    }
    awaitReleased(streamsBefore);

    assertThat(registry.openStreamCount())
        .as("counted, not inferred from the absence of an exception")
        .isEqualTo(streamsBefore);
    assertThat(registry.watchedExecutionCount()).isEqualTo(watchedBefore);
    assertThat(senders.freeCapacity()).as("sender capacity returned").isEqualTo(capacityBefore);
  }

  @Test
  void noTransactionAndNoConnectionIsHeldForAStreamsLifetime() throws Exception {
    Integer active =
        jdbc.queryForObject(
            "SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction'",
            Integer.class);
    int before = active == null ? 0 : active;

    List<SseTestClient> clients = new java.util.ArrayList<>();
    try {
      for (int index = 0; index < 5; index++) {
        SseTestClient client = new SseTestClient();
        client.open(eventsUrl(), readerHeaders());
        clients.add(client);
      }
      for (SseTestClient client : clients) {
        assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();
      }
      Thread.sleep(1500);

      Integer duringValue =
          jdbc.queryForObject(
              "SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction'",
              Integer.class);
      int during = duringValue == null ? 0 : duringValue;

      assertThat(during)
          .as("five open idle streams must not be five open transactions")
          .isLessThanOrEqualTo(before + 1);
    } finally {
      clients.forEach(SseTestClient::close);
    }
  }

  // ── AC-36: captured identity and the bounded authorization refresh ───────

  @Test
  void revokedAccessMidStreamStopsDeliveryWithinTheRefreshIntervalAndClosesWithASignal()
      throws Exception {
    try (SseTestClient client = new SseTestClient()) {
      client.open(eventsUrl(), readerHeaders());
      assertThat(client.awaitSnapshots(1, Duration.ofSeconds(10))).isTrue();

      // The execution's CSI is changed out from under the captured identity, which is the one
      // revocation this story can model without the real CSI provider (ED-02).
      jdbc.update("UPDATE ui_test_executions SET csi_id = ? WHERE id = ?", "60472", executionId);

      assertThat(client.awaitClosed(Duration.ofSeconds(10)))
          .as("delivery stops within the bounded refresh interval")
          .isTrue();
      assertThat(client.snapshots())
          .as("and it closes with an auth-shaped signal rather than silently")
          .anySatisfy(frame -> assertThat(frame.event()).isEqualTo("execution.forbidden"));
    }
  }

  // ── AC-37a: the events route answers exactly as the GET snapshot route ───

  @Test
  void anUnauthorizedOrForbiddenEventsRequestAnswersAsTheGetSnapshotRouteWould() throws Exception {
    try (SseTestClient client = new SseTestClient()) {
      HttpResponse<?> stream = client.open(eventsUrl(), strangerHeaders());
      ResponseEntity<String> get =
          restTemplate.exchange(
              "/api/v1/studio/executions/" + executionId,
              HttpMethod.GET,
              new HttpEntity<>(springHeaders(STRANGER, "")),
              String.class);

      assertThat(stream.statusCode())
          .as("a client can only refuse to fall back around a 403 if the two agree")
          .isEqualTo(get.getStatusCode().value())
          .isEqualTo(403);
    }

    // And for an execution the caller may not read at all, the same thing.
    try (SseTestClient client = new SseTestClient()) {
      HttpResponse<?> stream =
          client.open(
              "http://localhost:"
                  + port
                  + "/api/v1/studio/executions/"
                  + UUID.randomUUID()
                  + "/events",
              readerHeaders());
      assertThat(stream.statusCode()).isEqualTo(403);
    }
  }

  @Test
  void noCredentialAppearsInTheUrlOrInAnyQueryParameter() {
    assertThat(eventsUrl()).doesNotContain("token").doesNotContain("session").doesNotContain("?");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private void awaitReleased(int expected) throws InterruptedException {
    long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
    while (System.nanoTime() < deadline && registry.openStreamCount() != expected) {
      Thread.sleep(100);
    }
    assertThat(registry.openStreamCount()).isEqualTo(expected);
  }

  private String eventsUrl() {
    return "http://localhost:" + port + "/api/v1/studio/executions/" + executionId + "/events";
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

  private static Map<String, String> strangerHeaders() {
    return Map.of(
        "X-User-Id",
        "uid-" + STRANGER,
        "X-User-Email",
        STRANGER,
        "X-User-Roles",
        "",
        "X-User-Csi-Ownership",
        "");
  }

  private static HttpHeaders springHeaders(String email, String ownership) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-User-Id", "uid-" + email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", "");
    headers.set("X-User-Csi-Ownership", ownership);
    return headers;
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
        null);
  }

  private RunnerReport terminal(long sequence, String result, String evidenceState) {
    return new RunnerReport(
        executionId,
        attemptId,
        admissionId,
        RUNNER,
        RunnerReport.FINAL,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        List.of(),
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of(),
        new RunOutcome(result, null, null),
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", evidenceState, false),
        null);
  }
}
