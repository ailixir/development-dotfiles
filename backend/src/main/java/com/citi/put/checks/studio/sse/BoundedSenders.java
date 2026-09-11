package com.citi.put.checks.studio.sse;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * The dedicated, bounded sender pool (AC-35).
 *
 * <p>Sends run <b>here and nowhere else</b>: never on the runner-callback thread, never on the
 * batched DB-reader thread, and never on an ordinary check-execution thread. A Servlet write can
 * block for as long as a slow client takes to read, so a send on any of those threads makes one
 * stalled browser able to stall a callback, a database read, or a check.
 *
 * <p>Per-client snapshots are <b>coalesced</b> rather than queued: a reader N revisions behind
 * receives the current snapshot, not N of them. That is sound precisely because every snapshot is
 * full current state.
 *
 * <p>A stalled client is disconnected rather than left holding a sender.
 */
@Component
@Profile("!worker")
public class BoundedSenders implements AutoCloseable {

  private static final Logger LOGGER = LoggerFactory.getLogger(BoundedSenders.class);

  private final ThreadPoolExecutor pool;
  private final AtomicInteger inFlight = new AtomicInteger();
  private final int capacity;

  public BoundedSenders(StudioExecutionProperties properties) {
    int threads = properties.sseOrDefault().senderThreadsOrDefault();
    this.capacity = threads * 8;
    this.pool =
        new ThreadPoolExecutor(
            threads,
            threads,
            0L,
            TimeUnit.MILLISECONDS,
            new LinkedBlockingQueue<>(capacity),
            runnable -> {
              Thread thread = Executors.defaultThreadFactory().newThread(runnable);
              thread.setName("studio-sse-sender");
              thread.setDaemon(true);
              return thread;
            },
            new ThreadPoolExecutor.AbortPolicy());
  }

  /** Named capacity, so AC-38's inventory has something to count and a test can watch it return. */
  public int freeCapacity() {
    return capacity - inFlight.get();
  }

  public int inFlightCount() {
    return inFlight.get();
  }

  /**
   * Offers a snapshot to one subscription. At most one send task per subscription is ever in
   * flight; a later snapshot simply overwrites the pending one.
   */
  public void offer(
      StreamSubscription subscription, ExecutionSnapshotDto snapshot, Runnable onRelease) {
    subscription.pending().set(snapshot);
    if (!subscription.sending().compareAndSet(false, true)) {
      return;
    }
    inFlight.incrementAndGet();
    try {
      pool.execute(() -> drain(subscription, onRelease));
    } catch (RuntimeException e) {
      subscription.sending().set(false);
      inFlight.decrementAndGet();
      LOGGER.warn(
          "Studio SSE sender pool is saturated; disconnecting a stream rather than growing");
      disconnect(subscription, onRelease);
    }
  }

  private void drain(StreamSubscription subscription, Runnable onRelease) {
    try {
      ExecutionSnapshotDto snapshot = subscription.pending().getAndSet(null);
      if (snapshot == null) {
        return;
      }
      subscription
          .emitter()
          .send(
              SseEmitter.event()
                  .id(Long.toString(snapshot.revision()))
                  .name("execution.snapshot")
                  .data(snapshot, MediaType.APPLICATION_JSON));
      subscription.recordSent(snapshot.revision());
      subscription.recordActivity(java.time.Instant.now());
      if (snapshot.streamComplete()) {
        // Outcome and evidence are both settled: close the stream explicitly (§5.5, §6.1).
        subscription.emitter().complete();
        onRelease.run();
      }
    } catch (IOException | IllegalStateException e) {
      // A stalled or gone client. Disconnect rather than leave it holding a sender.
      disconnect(subscription, onRelease);
    } finally {
      subscription.sending().set(false);
      inFlight.decrementAndGet();
    }
  }

  /**
   * Sends a comment frame when the stream has been idle longer than the heartbeat interval (§5.5).
   *
   * <p>It exists so an idle interval longer than a proxy's read timeout does not close a stream
   * that is perfectly healthy and simply has nothing new to say. It is a comment rather than an
   * event, so a client's snapshot handling never sees it.
   */
  public void heartbeatIfIdle(
      StreamSubscription subscription,
      Runnable onRelease,
      java.time.Duration heartbeat,
      java.time.Instant now) {
    if (subscription.lastActivityAt().plus(heartbeat).isAfter(now)) {
      return;
    }
    try {
      subscription.emitter().send(SseEmitter.event().comment("heartbeat"));
      subscription.recordActivity(now);
    } catch (IOException | IllegalStateException e) {
      disconnect(subscription, onRelease);
    }
  }

  /** Ends a stream with an auth-shaped signal rather than silently (AC-36). */
  public void terminateUnauthorized(StreamSubscription subscription, Runnable onRelease) {
    try {
      subscription
          .emitter()
          .send(
              SseEmitter.event()
                  .name("execution.forbidden")
                  .data("{\"error\":\"STUDIO_FORBIDDEN\"}"));
    } catch (IOException | IllegalStateException e) {
      LOGGER.debug("Studio SSE stream closed before its revocation signal could be written");
    }
    disconnect(subscription, onRelease);
  }

  private void disconnect(StreamSubscription subscription, Runnable onRelease) {
    try {
      subscription.emitter().complete();
    } catch (RuntimeException e) {
      LOGGER.debug("Studio SSE emitter was already complete");
    }
    onRelease.run();
  }

  @Override
  public void close() {
    pool.shutdownNow();
  }
}
