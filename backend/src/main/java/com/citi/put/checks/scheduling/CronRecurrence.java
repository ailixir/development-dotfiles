package com.citi.put.checks.scheduling;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.OptionalLong;
import java.util.Set;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

/** Shared application recurrence implementation; callers retain domain policy and wire errors. */
@Component
public class CronRecurrence {
  public enum Format {
    COMPATIBLE,
    MINUTE_ZERO_SECONDS
  }

  public enum ZonePolicy {
    ANY_ZONE_ID,
    IANA_REGION,
    SHORT_IDS
  }

  public enum Overlap {
    INSTANT_SEQUENCE,
    EARLIER_OFFSET
  }

  public record Slot(Instant scheduledAt, LocalDateTime localScheduledAt, int offsetSeconds) {}

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

  public String normalize(String expression, Format format) {
    if (format == Format.COMPATIBLE) {
      return normalizeCompatible(expression);
    }
    String cron = expression == null ? "" : expression.strip().replaceAll("\\s+", " ");
    cron = normalizeCompatible(cron);
    if (cron.split(" ").length != 6 || !cron.startsWith("0 ")) {
      throw new IllegalArgumentException("Use five fields or six fields with seconds exactly 0");
    }
    return cron;
  }

  public CronExpression parse(String expression) {
    return CronExpression.parse(expression);
  }

  public ZoneId zone(String text, ZonePolicy policy) {
    String id = text == null ? "UTC" : text;
    if (policy == ZonePolicy.IANA_REGION
        && !("UTC".equals(id)
            || (id.contains("/") && Set.copyOf(ZoneId.getAvailableZoneIds()).contains(id)))) {
      throw new IllegalArgumentException("Use UTC or an IANA region timezone");
    }
    return policy == ZonePolicy.SHORT_IDS ? ZoneId.of(id, ZoneId.SHORT_IDS) : ZoneId.of(id);
  }

  /**
   * Nullable exhaustion is preserved for ordinary/report callers; Studio rejects it in its adapter.
   */
  public Slot next(String cron, ZoneId zone, Instant after, Overlap overlap) {
    CronExpression expression = parse(cron);
    ZonedDateTime cursor = after.atZone(zone);
    for (int attempted = 0; attempted < 2161; attempted++) {
      ZonedDateTime next = expression.next(cursor);
      if (next == null) {
        return null;
      }
      if (overlap == Overlap.INSTANT_SEQUENCE) {
        return slot(next);
      }
      List<ZoneOffset> offsets = zone.getRules().getValidOffsets(next.toLocalDateTime());
      if (!offsets.isEmpty() && next.getOffset().equals(offsets.get(0))) {
        return slot(next);
      }
      cursor = next;
    }
    throw new IllegalArgumentException("Recurrence resolution exceeded its bound");
  }

  /** Compatibility extraction of the existing two-UTC-sample minimum check, not new validation. */
  public OptionalLong sampledUtcGap(String cron, Instant reference) {
    Slot first = next(cron, ZoneOffset.UTC, reference, Overlap.INSTANT_SEQUENCE);
    Slot second =
        first == null
            ? null
            : next(cron, ZoneOffset.UTC, first.scheduledAt(), Overlap.INSTANT_SEQUENCE);
    return second == null
        ? OptionalLong.empty()
        : OptionalLong.of(Duration.between(first.scheduledAt(), second.scheduledAt()).getSeconds());
  }

  private static Slot slot(ZonedDateTime value) {
    return new Slot(
        value.toInstant(), value.toLocalDateTime(), value.getOffset().getTotalSeconds());
  }
}
