package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

/** An immutable claim deadline; worker renewals cannot extend network or commit authority. */
public record PublicationBudget(Instant deadline, Clock clock) {
  public PublicationBudget {
    Objects.requireNonNull(deadline);
    Objects.requireNonNull(clock);
  }

  public Duration remaining() {
    Duration remaining = Duration.between(clock.instant(), deadline);
    require(!remaining.isNegative() && !remaining.isZero(), "EXPIRED", 409);
    return remaining;
  }
}
