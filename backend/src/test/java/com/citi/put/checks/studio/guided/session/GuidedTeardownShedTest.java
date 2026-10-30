package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * C-OBS009-1: bounded shed visibility and one queued or running attempt for each durable request.
 */
class GuidedTeardownShedTest {
  private static final Duration WINDOW = Duration.ofMinutes(15);
  private static final int BATCH = 32;
  private final GuidedContracts contracts = new GuidedContracts();
  private final MutableClock clock = new MutableClock();
  private final String id = UUID.randomUUID().toString();
  private final GuidedSessionRepository repository = mock(GuidedSessionRepository.class);
  private final AtomicReference<GuidedSessionRepository.Session> durable = new AtomicReference<>();
  private final AtomicInteger sends = new AtomicInteger();
  private final CountDownLatch workerBlocked = new CountDownLatch(1);
  private final CountDownLatch releaseWorker = new CountDownLatch(1);
  private final CountDownLatch releaseSender = new CountDownLatch(1);
  private final Logger logger = (Logger) LoggerFactory.getLogger(GuidedSessionService.class);
  private final ListAppender<ILoggingEvent> log = new ListAppender<>();
  private ThreadPoolExecutor executor;
  private GuidedSessionService service;

  @BeforeEach
  void setUp() {
    ObjectNode document = contracts.object().put("sessionId", id).put("state", "CANCELLED");
    ObjectNode progress = contracts.object().put("teardownStatus", "PENDING");
    progress
        .putObject("teardownRequest")
        .put("reason", "CANCELLED")
        .putObject("target")
        .put("assignmentId", "private-target-" + id);
    durable.set(new GuidedSessionRepository.Session(document, progress));
    when(repository.transaction(any()))
        .thenAnswer(
            invocation -> {
              synchronized (durable) {
                return ((Supplier<?>) invocation.getArgument(0)).get();
              }
            });
    when(repository.pendingTeardowns(any(), eq(WINDOW), eq(BATCH)))
        .thenAnswer(
            invocation ->
                "PENDING".equals(durable.get().progress().path("teardownStatus").asText())
                    ? List.of(id)
                    : List.of());
    when(repository.teardownRequest(id))
        .thenAnswer(invocation -> durable.get().progress().path("teardownRequest").deepCopy());
    when(repository.lock(id))
        .thenAnswer(
            invocation ->
                new GuidedSessionRepository.Session(
                    durable.get().document().deepCopy(), durable.get().progress().deepCopy()));
    doAnswer(
            invocation -> {
              durable.set(invocation.getArgument(0));
              return null;
            })
        .when(repository)
        .save(any());
    service =
        new GuidedSessionService(
            repository,
            contracts,
            mock(GuidedSessionAccess.class),
            new GuidedSessionProperties(true, Map.of()),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            clock);
    service.installStopSender((target, reason) -> sends.incrementAndGet());
    // A small injected executor makes saturation deterministic; production remains 2 / 64.
    // DiscardPolicy is intentional: the final installer must install the production handler.
    executor =
        new ThreadPoolExecutor(
            1,
            1,
            30,
            TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(2),
            runnable -> new Thread(runnable, "shed-test-" + id),
            new ThreadPoolExecutor.DiscardPolicy());
    service.installTeardownExecutor(executor);
    log.start();
    logger.addAppender(log);
  }

  @AfterEach
  void close() throws InterruptedException {
    releaseWorker.countDown();
    releaseSender.countDown();
    try {
      if (executor != null) {
        executor.shutdown();
        if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
          executor.shutdownNow();
          assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
      }
    } finally {
      logger.detachAppender(log);
      log.stop();
    }
  }

  @Test
  void shedWarnsOncePerIntervalAndTheNextTickKeepsOneDurableAttempt() throws Exception {
    blockWorker();
    executor.execute(
        () -> {
          /* no-op fixture hook */
        });
    executor.execute(
        () -> {
          /* no-op fixture hook */
        }); // Occupy both queue slots as well as the one worker.
    ObjectNode request = durable.get().progress().path("teardownRequest").deepCopy();
    ObjectNode document = durable.get().document().deepCopy();

    service.redriveTeardowns(WINDOW, BATCH);
    service.redriveTeardowns(WINDOW, BATCH);
    assertThat(warnings()).containsExactly("Guided teardown executor shed: 1 attempt(s)");
    clock.advance(WINDOW.minusNanos(1));
    service.redriveTeardowns(WINDOW, BATCH);
    assertThat(warnings()).hasSize(1);
    clock.advance(Duration.ofNanos(1));
    service.redriveTeardowns(WINDOW, BATCH);
    assertThat(warnings())
        .containsExactly(
            "Guided teardown executor shed: 1 attempt(s)",
            "Guided teardown executor shed: 3 attempt(s)");
    assertThat(log.list)
        .allSatisfy(
            event -> {
              assertThat(event.getLevel()).isEqualTo(Level.WARN);
              assertThat(event.getThrowableProxy()).isNull();
              assertThat(event.getFormattedMessage())
                  .doesNotContain(id, "private-target", "CANCELLED");
            });
    assertThat(durable.get().progress().path("teardownRequest")).isEqualTo(request);
    assertThat(durable.get().progress().path("teardownStatus").asText()).isEqualTo("PENDING");
    assertThat(durable.get().document()).isEqualTo(document);
    assertThat(sends).hasValue(0);
    verify(repository, never()).save(any());

    releaseWorker.countDown();
    await()
        .alias("saturated executor drains")
        .atMost(Duration.ofSeconds(5))
        .pollInterval(Duration.ofMillis(20))
        .until(() -> executor.getActiveCount() == 0 && executor.getQueue().isEmpty());
    service.redriveTeardowns(WINDOW, BATCH);
    service.redriveTeardowns(WINDOW, BATCH);
    await()
        .alias("next tick acknowledges the original durable request")
        .atMost(Duration.ofSeconds(5))
        .pollInterval(Duration.ofMillis(20))
        .untilAsserted(
            () -> {
              assertThat(sends).hasValue(1);
              assertThat(durable.get().progress().path("teardownStatus").asText())
                  .isEqualTo("CONFIRMED");
              assertThat(durable.get().progress().has("teardownRequest")).isFalse();
              assertThat(service.teardownInFlight(id)).isFalse();
            });
    assertThat(warnings()).hasSize(2);
    assertThat(durable.get().document()).isEqualTo(document);
  }

  @Test
  void anIdAlreadyQueuedOrInFlightIsNeverSubmittedTwice() throws Exception {
    blockWorker();
    service.installStopSender(
        (target, reason) -> {
          sends.incrementAndGet();
          blockUntil(releaseSender);
        });
    service.redriveTeardowns(WINDOW, BATCH);
    assertThat(executor.getQueue()).hasSize(1);
    service.redriveTeardowns(WINDOW, BATCH);
    assertThat(executor.getQueue()).hasSize(1);
    assertThat(warnings()).isEmpty();
    assertThat(durable.get().progress().path("teardownStatus").asText()).isEqualTo("PENDING");

    releaseWorker.countDown();
    await()
        .alias("one queued teardown starts")
        .atMost(Duration.ofSeconds(5))
        .pollInterval(Duration.ofMillis(20))
        .until(() -> service.teardownInFlight(id) && sends.get() == 1);
    service.redriveTeardowns(WINDOW, BATCH);
    assertThat(executor.getQueue()).isEmpty();
    assertThat(sends).hasValue(1);
    assertThat(durable.get().progress().path("teardownStatus").asText()).isEqualTo("PENDING");
    releaseSender.countDown();
    await()
        .alias("one acknowledged attempt completes")
        .atMost(Duration.ofSeconds(5))
        .pollInterval(Duration.ofMillis(20))
        .untilAsserted(
            () -> {
              assertThat(durable.get().progress().path("teardownStatus").asText())
                  .isEqualTo("CONFIRMED");
              assertThat(service.teardownInFlight(id)).isFalse();
            });
    service.redriveTeardowns(WINDOW, BATCH);
    assertThat(sends).hasValue(1);
    assertThat(warnings()).isEmpty();
  }

  private void blockWorker() throws InterruptedException {
    executor.execute(
        () -> {
          workerBlocked.countDown();
          blockUntil(releaseWorker);
        });
    assertThat(workerBlocked.await(5, TimeUnit.SECONDS)).isTrue();
  }

  private static void blockUntil(CountDownLatch latch) {
    try {
      if (!latch.await(10, TimeUnit.SECONDS)) {
        throw new IllegalStateException("Test did not release its owned executor");
      }
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(interrupted);
    }
  }

  private List<String> warnings() {
    return log.list.stream()
        .filter(event -> event.getLevel().equals(Level.WARN))
        .map(ILoggingEvent::getFormattedMessage)
        .toList();
  }

  private static final class MutableClock extends Clock {
    private Instant now = Instant.parse("2026-10-18T00:00:00Z");

    void advance(Duration duration) {
      now = now.plus(duration);
    }

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
  }
}
