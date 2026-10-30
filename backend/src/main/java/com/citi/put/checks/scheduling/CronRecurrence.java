package com.citi.put.checks.scheduling;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.OptionalLong;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

/** Shared application recurrence implementation; callers retain domain policy and wire errors. */
@Component
public class CronRecurrence {
  public enum ZonePolicy {
    ANY_ZONE_ID,
    SHORT_IDS
  }

  public record Slot(Instant scheduledAt) {}

  /**
   * Existing catalog normalization deliberately preserves interior whitespace and Spring macros.
   */
  public static String normalizeCompatible(String expression) {
    if (expression == null) {
      return null;
    }
    String trimmed = expression.strip();
    return trimmed.split("\\s+").length == 5 ? "0 " + trimmed : trimmed;
  }

  public CronExpression parse(String expression) {
    return CronExpression.parse(expression);
  }

  public ZoneId zone(String text, ZonePolicy policy) {
    String id = text == null ? "UTC" : text;
    return policy == ZonePolicy.SHORT_IDS ? ZoneId.of(id, ZoneId.SHORT_IDS) : ZoneId.of(id);
  }

  /**
   * The next slot after {@code after}, following Spring's own instant sequence across DST
   * transitions. Null when the expression has no further occurrence.
   */
  public Slot next(String cron, ZoneId zone, Instant after) {
    ZonedDateTime next = parse(cron).next(after.atZone(zone));
    return next == null ? null : new Slot(next.toInstant());
  }

  /** Compatibility extraction of the existing two-UTC-sample minimum check, not new validation. */
  public OptionalLong sampledUtcGap(String cron, Instant reference) {
    Slot first = next(cron, ZoneOffset.UTC, reference);
    Slot second = first == null ? null : next(cron, ZoneOffset.UTC, first.scheduledAt());
    return second == null
        ? OptionalLong.empty()
        : OptionalLong.of(Duration.between(first.scheduledAt(), second.scheduledAt()).getSeconds());
  }
}
