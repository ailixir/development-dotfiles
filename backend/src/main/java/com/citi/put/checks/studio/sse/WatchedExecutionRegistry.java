package com.citi.put.checks.studio.sse;

import com.citi.put.checks.studio.StudioExecutionProperties;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * The per-pod set of watched execution ids and their local subscribers (AC-33, AC-35).
 *
 * <p><b>This is local only and is never a distribution mechanism.</b> Production runs three API
 * replicas scaling to six, so a runner callback and a browser subscription routinely land on
 * different pods; an in-memory structure that a callback writes into is wrong by construction, not
 * merely inelegant, because the callback is not on this pod. Nothing outside this package ever
 * publishes into it, and the only thing that feeds it is {@link SnapshotBroadcaster} reading
 * <em>committed database state</em>.
 *
 * <p>What it is for is the opposite: knowing which execution ids this pod's subscribers care about,
 * so the batched read is one query for all of them and one read is shared across every local viewer
 * of the same run.
 *
 * <p>Three bounds, all named in configuration (AC-38): streams per user, streams per pod, and
 * watched executions per pod. Exceeding any of them is a bounded rejection at open, not unbounded
 * growth.
 */
@Component
@Profile("!worker")
public class WatchedExecutionRegistry {

  private final Map<UUID, Set<StreamSubscription>> watched = new ConcurrentHashMap<>();
  private final AtomicInteger openStreams = new AtomicInteger();
  private final StudioExecutionProperties properties;

  public WatchedExecutionRegistry(StudioExecutionProperties properties) {
    this.properties = properties;
  }

  /** A bound was reached; the caller answers {@code 429} rather than growing. */
  public static class StreamLimitExceededException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String code;

    public StreamLimitExceededException(String code, String message) {
      super(message);
      this.code = code;
    }

    public String getCode() {
      return code;
    }
  }

  /** Registers a subscription, or refuses it against one of the three bounds. */
  public void register(StreamSubscription subscription) {
    StudioExecutionProperties.Sse bounds = properties.sseOrDefault();

    if (openStreams.get() >= bounds.maxStreamsPerPodOrDefault()) {
      throw new StreamLimitExceededException(
          "SSE_POD_LIMIT",
          "This pod is already serving its bound of "
              + bounds.maxStreamsPerPodOrDefault()
              + " streams");
    }
    long forPrincipal =
        watched.values().stream()
            .flatMap(Set::stream)
            .filter(open -> open.principal().equals(subscription.principal()))
            .count();
    if (forPrincipal >= bounds.maxStreamsPerUserOrDefault()) {
      throw new StreamLimitExceededException(
          "SSE_USER_LIMIT",
          "You already have " + forPrincipal + " open Studio streams on this pod");
    }
    if (!watched.containsKey(subscription.executionId())
        && watched.size() >= bounds.maxWatchedExecutionsOrDefault()) {
      throw new StreamLimitExceededException(
          "SSE_WATCH_LIMIT", "This pod is already watching its bound of executions");
    }

    watched
        .computeIfAbsent(subscription.executionId(), id -> ConcurrentHashMap.newKeySet())
        .add(subscription);
    openStreams.incrementAndGet();
  }

  /**
   * Releases a subscription and drops the execution from the watched set when it was the last
   * viewer (AC-35). Idempotent: the five release paths can and do overlap.
   */
  public boolean release(StreamSubscription subscription) {
    Set<StreamSubscription> subscribers = watched.get(subscription.executionId());
    if (subscribers == null || !subscribers.remove(subscription)) {
      return false;
    }
    openStreams.decrementAndGet();
    // Only when it was the last viewer: a shared read stays shared.
    watched.computeIfPresent(
        subscription.executionId(), (id, remaining) -> remaining.isEmpty() ? null : remaining);
    return true;
  }

  /** The ids this pod's subscribers are watching. One batched read covers all of them. */
  public Set<UUID> watchedExecutionIds() {
    return Set.copyOf(watched.keySet());
  }

  public Set<StreamSubscription> subscribersOf(UUID executionId) {
    Set<StreamSubscription> subscribers = watched.get(executionId);
    return subscribers == null ? Set.of() : Set.copyOf(subscribers);
  }

  public int openStreamCount() {
    return openStreams.get();
  }

  public int watchedExecutionCount() {
    return watched.size();
  }
}
