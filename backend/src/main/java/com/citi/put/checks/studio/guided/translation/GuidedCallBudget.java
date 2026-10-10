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

  public GuidedCallBudget(Instant deadline, Clock clock) {
    this.deadline = java.util.Objects.requireNonNull(deadline);
    this.clock = java.util.Objects.requireNonNull(clock);
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
