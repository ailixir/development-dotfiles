package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

/**
 * The coordinator's scheduled tick starts continuations and returns; it never waits on a send. The
 * store, the session repository and the HTTP client are stubs, so no database or controller runs.
 */
@Timeout(30)
class GuidedTranslationCoordinatorTest {
  private static final GuidedContracts C = new GuidedContracts();

  @TempDir Path temp;

  private final GuidedTranslationStore store = mock(GuidedTranslationStore.class);
  private final GuidedSessionRepository sessions = mock(GuidedSessionRepository.class);
  private final HttpClient http = mock(HttpClient.class);
  private final List<String> runnable = new CopyOnWriteArrayList<>();
  private final List<HttpRequest> posts = new CopyOnWriteArrayList<>();
  private final List<String> completed = new CopyOnWriteArrayList<>();
  private final Map<String, CountDownLatch> gates = new ConcurrentHashMap<>();
  private final Map<String, IOException> failures = new ConcurrentHashMap<>();
  private GuidedTranslationCoordinator coordinator;

  @BeforeEach
  @SuppressWarnings("unchecked")
  void stubs() throws Exception {
    // The store orders by age and applies the limit, as the SQL does.
    when(store.runnable(anyInt()))
        .thenAnswer(call -> runnable.stream().limit(call.<Integer>getArgument(0)).toList());
    when(sessions.transaction(any()))
        .thenAnswer(call -> ((Supplier<Object>) call.getArgument(0)).get());
    when(sessions.lock(any())).thenAnswer(call -> session());
    when(store.state(any()))
        .thenAnswer(call -> C.object().put("planRevision", 1).put("continuation", "NEXT"));
    when(http.send(any(), any()))
        .thenAnswer(
            call -> {
              HttpRequest request = call.getArgument(0);
              String id = sessionOf(request);
              posts.add(request);
              CountDownLatch gate = gates.remove(id);
              if (gate != null) {
                gate.await();
              }
              IOException failure = failures.remove(id);
              if (failure != null) {
                throw failure;
              }
              completed.add(id);
              return null;
            });
    Files.writeString(temp.resolve("controller.jwt"), "token");
    coordinator = newCoordinator();
  }

  private GuidedTranslationCoordinator newCoordinator() {
    return new GuidedTranslationCoordinator(
        store,
        sessions,
        C,
        URI.create("https://controller.invalid"),
        temp.resolve("controller.jwt"),
        new GuidedTranslationProperties(true, 65536, 4096, 60, "worker-1"),
        http);
  }

  @AfterEach
  void stop() {
    gates.values().forEach(CountDownLatch::countDown);
    coordinator.close();
  }

  @Test
  void theTickReturnsWhileTheSendIsStillBlocked() throws Exception {
    runnable.add("a");
    CountDownLatch release = gate("a");

    coordinator.continueRuns();

    await().atMost(5, TimeUnit.SECONDS).until(() -> postsTo("a") == 1);
    assertThat(completed).isEmpty();
    release.countDown();
    coordinator.drain(Duration.ofSeconds(5));
    assertThat(completed).containsExactly("a");
  }

  @Test
  void aSlowSessionDoesNotDelayAnotherSession() throws Exception {
    runnable.addAll(List.of("a", "b"));
    CountDownLatch release = gate("a");

    coordinator.continueRuns();

    await().atMost(5, TimeUnit.SECONDS).until(() -> completed.contains("b"));
    assertThat(completed).doesNotContain("a");
    release.countDown();
    coordinator.drain(Duration.ofSeconds(5));
    assertThat(completed).containsExactlyInAnyOrder("a", "b");
  }

  @Test
  void aContinuationLongerThanTheOldSixtyFiveSecondTimeoutIsNotRedrivenWhileItRuns()
      throws Exception {
    runnable.add("a");
    CountDownLatch release = gate("a");

    coordinator.continueRuns();
    await().atMost(5, TimeUnit.SECONDS).until(() -> postsTo("a") == 1);
    // The POST is awaited well past 65 s, so the coordinator does not give up on it first.
    assertThat(posts.getFirst().timeout()).hasValue(Duration.ofSeconds(267));
    for (int poll = 0; poll < 5; poll++) {
      coordinator.continueRuns();
    }
    // A would-be second POST starts on another thread; give it the time it would need.
    Thread.sleep(200);
    assertThat(postsTo("a")).isEqualTo(1);

    release.countDown();
    await()
        .atMost(5, TimeUnit.SECONDS)
        .until(
            () -> {
              coordinator.continueRuns();
              return postsTo("a") > 1;
            });
    assertThat(completed).contains("a");
  }

  @Test
  void sessionsInFlightDoNotHideARunnableSessionBeyondTheWindow() throws Exception {
    List<String> ids = List.of("s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9");
    runnable.addAll(ids);
    ids.subList(0, 8).forEach(this::gate);

    coordinator.continueRuns();
    await().atMost(5, TimeUnit.SECONDS).until(() -> posts.size() == 8);
    assertThat(completed).isEmpty();

    // The eight blocked sessions still head the list; the ninth must be reached past them.
    coordinator.continueRuns();
    await().atMost(5, TimeUnit.SECONDS).until(() -> completed.contains("s9"));
    assertThat(posts).hasSize(9);
    assertThat(completed).containsExactly("s9");
  }

  @Test
  void drainRethrowsTheFirstContinuationFailureAndRecoversATimedOutSend() throws Exception {
    runnable.add("a");
    failures.put("a", new java.net.http.HttpTimeoutException("request timed out"));
    coordinator.continueRuns();
    coordinator.drain(Duration.ofSeconds(5));
    assertThat(postsTo("a")).isEqualTo(1);

    try (var failing = newCoordinator()) {
      when(sessions.lock(any())).thenThrow(new IllegalStateException("database down"));
      failing.continueRuns();
      assertThatThrownBy(() -> failing.drain(Duration.ofSeconds(5)))
          .isInstanceOf(IllegalStateException.class)
          .hasMessage("database down");
    }
  }

  @Test
  void aFailedContinuationFreesItsSlotForTheNextPoll() throws Exception {
    runnable.add("a");
    failures.put("a", new IOException("reset"));
    AtomicInteger transactions = new AtomicInteger();
    when(sessions.lock(any()))
        .thenAnswer(
            call -> {
              if (transactions.getAndIncrement() == 1) {
                throw new IllegalStateException("database down");
              }
              return session();
            });

    await()
        .atMost(5, TimeUnit.SECONDS)
        .until(
            () -> {
              coordinator.continueRuns();
              return completed.contains("a");
            });

    assertThat(transactions.get()).isGreaterThanOrEqualTo(3);
    assertThat(postsTo("a")).isGreaterThanOrEqualTo(2);
  }

  @Test
  void theTimeoutCoversTheLongestRequestForDefaultsAndARaisedSendCap() {
    // One pool of three requests, each (call + 2 s settle + 15 s prepare), the 2 s then 4 s backoff
    // between attempts and a fixed 30 s margin.
    Duration defaults =
        new GuidedTranslationProperties(true, 65536, 4096, 60, "w").continuationTimeout();
    assertThat(defaults).isGreaterThanOrEqualTo(Duration.ofSeconds(3 * (60 + 2 + 15) + 2 + 4));
    assertThat(defaults).isEqualTo(Duration.ofSeconds(3 * (60 + 2 + 15) + 6 + 30));

    var raised = new GuidedTranslationProperties(true, 65536, 4096, 120, "w", 2000, 110);
    assertThat(raised.isCallBudgetCoveringSendCap()).isTrue();
    assertThat(raised.continuationTimeout())
        .isGreaterThanOrEqualTo(Duration.ofSeconds(3 * (120 + 2 + 15) + 2 + 4));
  }

  @Test
  void startupRefusesACallBudgetThatDoesNotCoverTheSendCapAndItsSettlement() {
    var runner = new ApplicationContextRunner().withUserConfiguration(Bounds.class);
    String prefix = "studio.guided-authoring.translation.";

    runner.run(context -> assertThat(context).hasNotFailed());
    runner
        .withPropertyValues(prefix + "call-seconds=60", prefix + "send-timeout-seconds=50")
        .run(context -> assertThat(context).hasNotFailed());
    runner
        .withPropertyValues(prefix + "call-seconds=120", prefix + "send-timeout-seconds=110")
        .run(context -> assertThat(context).hasNotFailed());
    runner
        .withPropertyValues(prefix + "call-seconds=59", prefix + "send-timeout-seconds=50")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .hasStackTraceContaining("send-timeout-seconds + 10"));
    runner
        .withPropertyValues(prefix + "call-seconds=119", prefix + "send-timeout-seconds=110")
        .run(context -> assertThat(context).hasFailed());
  }

  @Configuration
  @EnableConfigurationProperties(GuidedTranslationProperties.class)
  static class Bounds {}

  private CountDownLatch gate(String id) {
    CountDownLatch latch = new CountDownLatch(1);
    gates.put(id, latch);
    return latch;
  }

  private long postsTo(String id) {
    return posts.stream().filter(post -> sessionOf(post).equals(id)).count();
  }

  private static String sessionOf(HttpRequest request) {
    String[] path = request.uri().getPath().split("/");
    return path[path.length - 2];
  }

  private static GuidedSessionRepository.Session session() {
    ObjectNode document = C.object().put("state", "PROPOSING");
    document.set("owner", C.object().put("fence", 7));
    document.set("scope", C.object().put("sourceRevision", 1).put("configurationRevision", 1));
    document.set("counters", C.object().put("modelProposals", 0));
    ObjectNode progress = C.object();
    progress.set("translationBootstrap", C.object().put("phase", "READY"));
    return new GuidedSessionRepository.Session(document, progress);
  }
}
