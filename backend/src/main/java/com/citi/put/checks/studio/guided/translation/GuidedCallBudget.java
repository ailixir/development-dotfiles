package com.citi.put.checks.studio.guided.translation;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

/** Request-owned absolute deadline; retries cannot extend it. */
public final class GuidedCallBudget {
  private final Instant deadline;
  private final Clock clock;
  private final AtomicBoolean cancelled = new AtomicBoolean();
  private final CopyOnWriteArrayList<Runnable> cancellations = new CopyOnWriteArrayList<>();

  private final Duration sendCap;

  public GuidedCallBudget(Instant deadline, Clock clock) {
    this(deadline, clock, null);
  }

  /**
   * @param sendCap longest a single provider send may wait for its response, or null for none
   */
  public GuidedCallBudget(Instant deadline, Clock clock, Duration sendCap) {
    this.deadline = java.util.Objects.requireNonNull(deadline);
    this.clock = java.util.Objects.requireNonNull(clock);
    this.sendCap = sendCap;
  }

  public Duration sendCap() {
    return sendCap;
  }

  /** True once the call was cancelled or its deadline was observed; never reads the clock. */
  public boolean cancelled() {
    return cancelled.get();
  }

  public Duration remaining() {
    Duration left = Duration.between(clock.instant(), deadline);
    if (cancelled.get() || left.isNegative() || left.isZero()) {
      cancel();
      throw new CancellationException("Guided deadline exceeded");
    }
    return left;
  }

  public AutoCloseable onCancel(Runnable action) {
    AtomicBoolean invoked = new AtomicBoolean();
    Runnable once =
        () -> {
          if (invoked.compareAndSet(false, true)) {
            action.run();
          }
        };
    cancellations.add(once);
    if (cancelled.get() && cancellations.remove(once)) {
      once.run();
    }
    return () -> cancellations.remove(once);
  }

  public void cancel() {
    if (cancelled.compareAndSet(false, true)) {
      for (Runnable action : cancellations) {
        try {
          action.run();
        } catch (RuntimeException ignored) {
          /* Cancel remaining calls. */
        }
      }
      cancellations.clear();
    }
  }
}
