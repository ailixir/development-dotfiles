package com.citi.put.checks.studio.gateway;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;

/**
 * Monotonic deadline and cancellation for one credential refresh.
 *
 * <p>It carries no proposal, retry, transport or usage accounting: the caller's own budget owns
 * those. {@link GenAiGatewayTransport.Lease#authenticate()} creates one from the caller's remaining
 * time and cancels it when the caller cancels, so a stalled token endpoint can never outlive the
 * guided attempt that asked for the token. The deadline is fixed at construction and never reset.
 */
public final class CredentialBudget {
  private final long started = System.nanoTime();
  private final long durationNanos;
  private final List<Runnable> cancellations = new ArrayList<>();
  private boolean cancelled;

  public CredentialBudget(Duration duration) {
    if (duration == null || duration.isZero() || duration.isNegative()) {
      throw new IllegalArgumentException("credential duration must be positive");
    }
    durationNanos = duration.toNanos();
  }

  public synchronized boolean isCancelled() {
    return cancelled || durationNanos - (System.nanoTime() - started) <= 0;
  }

  /**
   * The time left.
   *
   * @return the remaining duration, always positive
   * @throws CancellationException once the deadline has passed or the budget was cancelled
   */
  public synchronized Duration remaining() {
    long nanos = durationNanos - (System.nanoTime() - started);
    if (cancelled || nanos <= 0) {
      throw new CancellationException("credential budget expired or cancelled");
    }
    return Duration.ofNanos(nanos);
  }

  /**
   * The smaller of the remaining time and a per-call cap.
   *
   * @param perCall the per-call cap
   * @return the bound for one call
   */
  public Duration cap(Duration perCall) {
    Duration left = remaining();
    return left.compareTo(perCall) < 0 ? left : perCall;
  }

  /**
   * Registers a cancellation hook. Registration and cancellation are serialized so cancellation
   * cannot miss a socket opened concurrently with it.
   *
   * @param cancellation the hook, run at most once
   * @return a handle that unregisters the hook
   * @throws CancellationException after running the hook, when the budget is already over
   */
  public synchronized Runnable onCancel(Runnable cancellation) {
    if (cancelled || durationNanos - (System.nanoTime() - started) <= 0) {
      cancellation.run();
      throw new CancellationException("credential budget expired or cancelled");
    }
    cancellations.add(cancellation);
    return () -> removeCancellation(cancellation);
  }

  private synchronized void removeCancellation(Runnable cancellation) {
    cancellations.remove(cancellation);
  }

  /** Cancels once, running every registered hook even when one of them fails. */
  public synchronized void cancel() {
    if (!cancelled) {
      cancelled = true;
      for (Runnable action : cancellations) {
        try {
          action.run();
        } catch (RuntimeException ignored) {
          // Continue cancelling other sockets even if one cancellation hook fails.
        }
      }
      cancellations.clear();
    }
  }
}
