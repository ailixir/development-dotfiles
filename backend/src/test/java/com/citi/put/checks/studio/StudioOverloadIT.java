package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.sse.BoundedSenders;
import com.citi.put.checks.studio.sse.SseTestClient;
import com.citi.put.checks.studio.sse.WatchedExecutionRegistry;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-38 — <b>Studio overload does not exhaust ordinary check and REST capacity</b>
 * (§5.4, "Test overload while ordinary REST/check traffic continues").
 *
 * <p>The measurement is taken <b>in the same run</b>, not inferred from the fact that the pools are
 * configured separately. Ordinary REST latency and error rate are measured once with the service
 * quiet and again with every Studio bound under pressure simultaneously:
 *
 * <ul>
 *   <li>the maximum concurrent SSE streams this pod allows, four of which are <b>deliberately
 *       stalled slow consumers</b> that open the socket and never read it;
 *   <li>the pending quota full, with further accepts arriving;
 *   <li>the dispatcher saturated with queued work;
 *   <li>runner callbacks arriving throughout.
 * </ul>
 *
 * <p>The bounds are compressed so the pressure is reachable in a test. The point is not the
 * absolute numbers — it is that <em>every</em> Studio pool has a named bound, that exceeding it
 * produces a <b>bounded rejection</b> rather than unbounded growth, and that ordinary traffic is
 * still served while all of them are at the wall.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "studio.execution.sse.max-streams-per-pod=8",
      "studio.execution.sse.max-streams-per-user=8",
      "studio.execution.sse.max-watched-executions=8",
      "studio.execution.sse.heartbeat=1s",
      "studio.execution.sse.lifetime=30s",
      "studio.execution.sse.read-interval-ms=200",
      "studio.execution.sse.sender-threads=2",
      "studio.execution.quotas.per-csi=6",
      "studio.execution.quotas.global=8",
      "studio.execution.dispatcher.batch-size=4"
    })
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioOverloadIT {

  private static final String CSI_ID = "60481";
  private static final String OWNER = "overload-owner@citi.com";
  private static final String RUNNER = "studio-runner-0";

  /** The budget ordinary traffic must stay inside while Studio is at its bounds. */
  private static final double LATENCY_BUDGET_MULTIPLIER = 4.0;

  private static final long LATENCY_FLOOR_MS = 250;

  @LocalServerPort private int port;

  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioService studioService;
  @Autowired private StudioExecutionProperties properties;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private WatchedExecutionRegistry registry;
  @Autowired private BoundedSenders senders;
  @Autowired private TransactionTemplate transactions;

  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private UUID testId;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    testId =
        fixtures
            .seedRunnableTest("Overload draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
  }

  @Test
  void ordinaryRestTrafficContinuesWhileEveryStudioBoundIsUnderPressure() throws Exception {
    Measurement quiet = measureOrdinaryTraffic(40);
    assertThat(quiet.errors()).as("the baseline itself must be clean").isZero();

    List<SseTestClient> readers = new ArrayList<>();
    List<HttpResponse<InputStream>> stalled = new ArrayList<>();
    ExecutorService pressure = Executors.newFixedThreadPool(4);
    AtomicBoolean keepGoing = new AtomicBoolean(true);
    AtomicInteger boundedRejections = new AtomicInteger();

    try {
      // 1. Fill the pending quota, and keep pushing past it.
      List<UUID> accepted = fillPendingQuota(boundedRejections);
      assertThat(accepted).isNotEmpty();
      assertThat(boundedRejections.get())
          .as("past the quota, accepts are refused rather than queued forever")
          .isPositive();

      // 2. Open the pod's full stream budget, four of them deliberately stalled.
      for (int index = 0; index < 4 && index < accepted.size(); index++) {
        SseTestClient reader = new SseTestClient();
        reader.open(eventsUrl(accepted.get(index)), identityHeaders());
        readers.add(reader);
      }
      for (int index = 0; index < 4 && index < accepted.size(); index++) {
        // A stalled slow consumer: the socket is open and nothing ever reads it.
        stalled.add(openAndNeverRead(eventsUrl(accepted.get(index))));
      }
      assertThat(registry.openStreamCount()).isPositive();

      // 3. Saturate the dispatcher and keep callbacks arriving, for the whole measurement.
      CompletableFuture<Void> dispatching =
          CompletableFuture.runAsync(
              () -> {
                while (keepGoing.get()) {
                  try {
                    dispatcher.dispatchOnce();
                  } catch (RuntimeException e) {
                    // Saturation is the point; a failed pass is not the thing under test.
                  }
                }
              },
              pressure);
      CompletableFuture<Void> callbacks =
          CompletableFuture.runAsync(
              () -> {
                while (keepGoing.get()) {
                  accepted.forEach(this::attemptCallback);
                }
              },
              pressure);

      // 4. Measure ordinary traffic while all of the above is happening.
      Measurement underPressure = measureOrdinaryTraffic(40);

      keepGoing.set(false);
      dispatching.get(30, TimeUnit.SECONDS);
      callbacks.get(30, TimeUnit.SECONDS);

      assertThat(underPressure.errors())
          .as("ordinary REST traffic must not fail while Studio is at its bounds")
          .isZero();
      double budget = Math.max(quiet.meanMs() * LATENCY_BUDGET_MULTIPLIER, LATENCY_FLOOR_MS);
      assertThat(underPressure.meanMs())
          .as(
              "ordinary REST mean latency under Studio overload (%.1f ms) must stay inside its "
                  + "budget (%.1f ms), measured in this same run rather than inferred from the "
                  + "pools being separate",
              underPressure.meanMs(), budget)
          .isLessThanOrEqualTo(budget);
    } finally {
      keepGoing.set(false);
      pressure.shutdownNow();
      readers.forEach(SseTestClient::close);
      stalled.forEach(
          response -> {
            try {
              response.body().close();
            } catch (Exception e) {
              // Already gone.
            }
          });
    }
  }

  @Test
  void everyBoundProducesABoundedRejectionRatherThanUnboundedGrowth() throws Exception {
    // Pending quota -> 429.
    AtomicInteger quotaRejections = new AtomicInteger();
    fillPendingQuota(quotaRejections);
    assertThat(quotaRejections.get()).isPositive();

    // SSE streams per pod -> 429, and the registry does not grow past its bound.
    UUID execution =
        jdbc.queryForObject(
            "SELECT execution_id FROM studio_dispatch_ledger WHERE csi_id = ? LIMIT 1",
            UUID.class,
            CSI_ID);
    List<SseTestClient> clients = new ArrayList<>();
    int refused = 0;
    try {
      for (int index = 0;
          index < properties.sseOrDefault().maxStreamsPerPodOrDefault() + 4;
          index++) {
        SseTestClient client = new SseTestClient();
        HttpResponse<?> response = client.open(eventsUrl(execution), identityHeaders());
        if (response.statusCode() == 429) {
          refused++;
          client.close();
        } else {
          clients.add(client);
        }
      }
      assertThat(refused).as("past the pod's stream bound, opens are refused").isPositive();
      assertThat(registry.openStreamCount())
          .as("and the watched set does not grow past its bound")
          .isLessThanOrEqualTo(properties.sseOrDefault().maxStreamsPerPodOrDefault());
    } finally {
      clients.forEach(SseTestClient::close);
    }

    // Sender capacity is named and finite.
    assertThat(senders.freeCapacity()).isPositive();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private record Measurement(double meanMs, long maxMs, int errors, int samples) {}

  /**
   * Ordinary REST traffic: a plain authenticated list request that has nothing to do with Studio,
   * measured over the same client the rest of the suite uses.
   */
  private Measurement measureOrdinaryTraffic(int samples) throws Exception {
    List<Long> latencies = new ArrayList<>();
    int errors = 0;
    for (int index = 0; index < samples; index++) {
      long started = System.nanoTime();
      HttpRequest request =
          HttpRequest.newBuilder(
                  URI.create("http://localhost:" + port + "/api/v1/checks?page=0&size=5"))
              .timeout(Duration.ofSeconds(5))
              .GET()
              .build();
      try {
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
          errors++;
        }
      } catch (Exception e) {
        errors++;
      }
      latencies.add(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
    }
    double mean = latencies.stream().mapToLong(Long::longValue).average().orElse(0);
    long max = latencies.stream().mapToLong(Long::longValue).max().orElse(0);
    return new Measurement(mean, max, errors, samples);
  }

  private List<UUID> fillPendingQuota(AtomicInteger rejections) {
    List<UUID> accepted = new ArrayList<>();
    for (int index = 0; index < properties.quotasOrDefault().globalOrDefault() + 4; index++) {
      try {
        accepted.add(studioService.executeTest(testId, owner, null).executionId());
      } catch (RuntimeException e) {
        rejections.incrementAndGet();
      }
    }
    return accepted;
  }

  private void attemptCallback(UUID executionId) {
    try {
      UUID attemptId = UUID.randomUUID();
      transactions.executeWithoutResult(
          status -> {
            statements.claim(executionId, "overload", Instant.now().plusSeconds(60), Instant.now());
            statements.beginDispatch(executionId, "overload", attemptId);
          });
      admissionService.claim(
          executionId,
          new AdmissionRequest(executionId, attemptId, RUNNER, UUID.randomUUID(), Map.of()));
    } catch (RuntimeException e) {
      // Refusals are expected under saturation and are exactly the bounded behaviour under test.
    }
  }

  private HttpResponse<InputStream> openAndNeverRead(String url) throws Exception {
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(url)).header("Accept", "text/event-stream").GET().build();
    HttpRequest.Builder withIdentity = HttpRequest.newBuilder(URI.create(url));
    identityHeaders().forEach(withIdentity::header);
    withIdentity.header("Accept", "text/event-stream");
    return http.send(withIdentity.GET().build(), HttpResponse.BodyHandlers.ofInputStream());
  }

  private String eventsUrl(UUID executionId) {
    return "http://localhost:" + port + "/api/v1/studio/executions/" + executionId + "/events";
  }

  private static Map<String, String> identityHeaders() {
    return Map.of(
        "X-User-Id",
        "uid-" + OWNER,
        "X-User-Email",
        OWNER,
        "X-User-Roles",
        "",
        "X-User-Csi-Ownership",
        CSI_ID + ":owner");
  }
}
