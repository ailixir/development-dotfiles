package com.citi.put.checks.studio.sse;

import com.citi.put.checks.studio.ExecutionSnapshotMapper;
import com.citi.put.checks.studio.UITestExecutionRepository;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.entity.UITestExecution;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The per-replica batched reader (AC-33).
 *
 * <p>This is the one design decision the story fixes outright, and it is fixed because production
 * runs <b>three API replicas scaling to six</b>. A runner callback and a browser subscription
 * routinely reach different pods, so a mechanism in which a callback publishes into an in-memory
 * structure is wrong by construction: on the pod that holds the subscription, the callback never
 * happened. The only state both pods can see is the database.
 *
 * <p>So each replica batches a read for the execution ids <em>its own</em> subscribers are
 * watching, on a 500–1000 ms interval, and broadcasts only snapshots whose {@code revision}
 * changed. One read is shared across every local viewer of the same run. There is no cross-pod
 * messaging, no broker, no sticky session, and no in-memory emitter registry that a callback writes
 * into.
 *
 * <p><b>No transaction and no database connection is held for a stream's lifetime.</b> Each pass
 * borrows a connection for the duration of one read and returns it; a stream that is open and idle
 * holds nothing. That is what makes N open streams cost N sockets rather than N connections.
 */
@Component
@Profile("!worker")
public class SnapshotBroadcaster {

  private static final Logger LOGGER = LoggerFactory.getLogger(SnapshotBroadcaster.class);

  private final WatchedExecutionRegistry registry;
  private final UITestExecutionRepository executions;
  private final ExecutionSnapshotMapper snapshotMapper;
  private final BoundedSenders senders;
  private final StreamAuthorization authorization;
  private final com.citi.put.checks.studio.StudioExecutionProperties properties;

  public SnapshotBroadcaster(
      WatchedExecutionRegistry registry,
      UITestExecutionRepository executions,
      ExecutionSnapshotMapper snapshotMapper,
      BoundedSenders senders,
      StreamAuthorization authorization,
      com.citi.put.checks.studio.StudioExecutionProperties properties) {
    this.registry = registry;
    this.executions = executions;
    this.snapshotMapper = snapshotMapper;
    this.senders = senders;
    this.authorization = authorization;
    this.properties = properties;
  }

  /** One batched pass. Returns how many snapshots it broadcast. */
  @Scheduled(fixedDelayString = "${studio.execution.sse.read-interval-ms:750}")
  public void broadcastOnce() {
    try {
      broadcast();
    } catch (RuntimeException e) {
      LOGGER.warn("Studio SSE broadcast pass failed", e);
    }
  }

  /**
   * Visible so a test can drive a deterministic pass. The read is transactional and the transaction
   * ends here — it never spans a send, and it never spans a stream.
   */
  public int broadcast() {
    Set<UUID> watchedIds = registry.watchedExecutionIds();
    if (watchedIds.isEmpty()) {
      return 0;
    }
    int broadcast = 0;
    for (UUID executionId : watchedIds) {
      // One read per execution, shared across every local viewer of that run.
      Optional<ExecutionSnapshotDto> snapshot = read(executionId);
      if (snapshot.isEmpty()) {
        continue;
      }
      broadcast += deliver(executionId, snapshot.get());
    }
    return broadcast;
  }

  @Transactional(readOnly = true)
  protected Optional<ExecutionSnapshotDto> read(UUID executionId) {
    Optional<UITestExecution> execution = executions.findByExecutionId(executionId);
    return execution.map(snapshotMapper::toSnapshot);
  }

  private int deliver(UUID executionId, ExecutionSnapshotDto snapshot) {
    int delivered = 0;
    Instant now = authorization.now();
    for (StreamSubscription subscription : registry.subscribersOf(executionId)) {
      Runnable release = () -> registry.release(subscription);

      // A bounded authorization refresh: a revocation stops delivery within the interval and the
      // stream closes with an auth-shaped signal rather than silently.
      if (authorization.isRefreshDue(subscription.lastAuthorizedAt())) {
        if (!authorization.stillAuthorized(subscription.capturedIdentity(), snapshot.csiId())) {
          senders.terminateUnauthorized(subscription, release);
          continue;
        }
        subscription.recordAuthorized(now);
      }

      if (subscription
          .openedAt()
          .plus(properties.sseOrDefault().lifetimeOrDefault())
          .isBefore(now)) {
        // The bounded stream lifetime. The client reconnects and gets current state; it is not a
        // failure and it is what keeps a pod's socket budget finite.
        subscription.emitter().complete();
        release.run();
        continue;
      }

      if (snapshot.revision() == subscription.lastSentRevision()) {
        // Broadcast only on a changed revision. An unchanged run costs one shared read and no
        // sends at all, which is what makes a hundred idle streams nearly free.
        senders.heartbeatIfIdle(
            subscription, release, properties.sseOrDefault().heartbeatOrDefault(), now);
        continue;
      }
      senders.offer(subscription, snapshot, release);
      delivered++;
    }
    return delivered;
  }
}
