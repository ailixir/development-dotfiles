package com.citi.put.checks.studio.sse;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioExecutionProperties;
import java.time.Clock;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/**
 * The identity an async SSE writer authorizes against, and how often it re-checks (AC-36).
 *
 * <p><b>The request thread's {@code SecurityContextHolder} is unusable here, and that is a fact
 * about code that already exists rather than a precaution.</b> {@code
 * BffSessionAuthenticationFilter} clears the context in a {@code finally} block after {@code
 * chain.doFilter}, so a writer that reads it after the request returns reads nothing. The
 * subscription therefore <em>captures</em> the {@link Authentication} at open and carries it.
 *
 * <p>A captured identity that is never re-checked is its own hazard: a stream opened before an
 * access revocation would keep delivering for as long as it stayed open, which for a 60 s lifetime
 * is bounded but for a reconnecting client is not. So authorization is refreshed on a bounded
 * interval and delivery stops when it fails — and a reconnect re-authorizes from scratch, because
 * it is a new request through the whole chain.
 */
@Component
public class StreamAuthorization {

  private final CsiOwnershipEvaluator evaluator;
  private final StudioExecutionProperties properties;
  private final Clock clock;

  @Autowired
  public StreamAuthorization(
      CsiOwnershipEvaluator evaluator, StudioExecutionProperties properties) {
    this(evaluator, properties, Clock.systemUTC());
  }

  StreamAuthorization(
      CsiOwnershipEvaluator evaluator, StudioExecutionProperties properties, Clock clock) {
    this.evaluator = evaluator;
    this.properties = properties;
    this.clock = clock;
  }

  /** Whether this captured identity may still read this execution's CSI. */
  public boolean stillAuthorized(Authentication captured, String csiId) {
    return csiId != null && evaluator.canRead(captured, csiId);
  }

  /** Whether the bounded refresh interval has elapsed for a subscription. */
  public boolean isRefreshDue(Instant lastCheckedAt) {
    return lastCheckedAt
        .plus(properties.sseOrDefault().authorizationRefreshOrDefault())
        .isBefore(clock.instant());
  }

  public Instant now() {
    return clock.instant();
  }
}
