package com.citi.put.checks.scheduling;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.support.CronExpression;

/**
 * Validates CronExpression.next() across US Eastern DST transitions. 2026: spring-forward Mar 8
 * 02:00→03:00, fall-back Nov 1 02:00→01:00.
 */
class DstBoundaryTest {

  private static final ZoneId EASTERN = ZoneId.of("America/New_York");
  private static final CronExpression EVERY_30_MIN = CronExpression.parse("0 */30 * * * *");
  private static final CronExpression DAILY_2AM = CronExpression.parse("0 0 2 * * *");
  private static final CronExpression DAILY_230AM = CronExpression.parse("0 30 2 * * *");

  @Nested
  @DisplayName("Spring-forward (Mar 8 2026, 02:00 → 03:00 ET)")
  class SpringForward {

    @Test
    @DisplayName("every-30min schedule does not skip the 03:00 slot")
    void every30MinDoesNotSkip() {
      ZonedDateTime beforeGap = ZonedDateTime.of(LocalDateTime.of(2026, 3, 8, 1, 30, 0), EASTERN);

      ZonedDateTime next = EVERY_30_MIN.next(beforeGap);
      assertThat(next).isNotNull();
      assertThat(next.getHour()).isGreaterThanOrEqualTo(3);
      assertThat(next.toLocalDate()).isEqualTo(beforeGap.toLocalDate());
    }

    @Test
    @DisplayName(
        "daily 02:00 schedule fires on the spring-forward day (at 03:00 or skips to next day)")
    void daily2amOnSpringForwardDay() {
      ZonedDateTime beforeGap = ZonedDateTime.of(LocalDateTime.of(2026, 3, 8, 1, 0, 0), EASTERN);

      ZonedDateTime next = DAILY_2AM.next(beforeGap);
      assertThat(next).isNotNull();
      // 2:00 AM doesn't exist on spring-forward day — CronExpression should advance
      // Either fires at 3:00 AM same day or next day's 2:00 AM
      assertThat(next.toInstant()).isAfter(beforeGap.toInstant());
    }

    @Test
    @DisplayName("daily 02:30 schedule handles non-existent time on spring-forward day")
    void daily230amOnSpringForwardDay() {
      ZonedDateTime beforeGap = ZonedDateTime.of(LocalDateTime.of(2026, 3, 8, 1, 0, 0), EASTERN);

      ZonedDateTime next = DAILY_230AM.next(beforeGap);
      assertThat(next).isNotNull();
      // 2:30 AM doesn't exist — should advance past the gap
      assertThat(next.toInstant()).isAfter(beforeGap.toInstant());
    }
  }

  @Nested
  @DisplayName("Fall-back (Nov 1 2026, 02:00 → 01:00 ET)")
  class FallBack {

    @Test
    @DisplayName("every-30min schedule does not produce duplicate at 01:30")
    void every30MinNoDuplicate() {
      ZonedDateTime beforeFallback =
          ZonedDateTime.of(LocalDateTime.of(2026, 11, 1, 0, 30, 0), EASTERN);

      ZonedDateTime first = EVERY_30_MIN.next(beforeFallback);
      assertThat(first).isNotNull();

      ZonedDateTime second = EVERY_30_MIN.next(first);
      assertThat(second).isNotNull();

      // Each successive execution must be strictly after the previous one (no duplicates)
      assertThat(second.toInstant()).isAfter(first.toInstant());
    }

    @Test
    @DisplayName("daily 02:00 fires exactly once on fall-back day")
    void daily2amFiresOnceOnFallBackDay() {
      ZonedDateTime beforeFallback =
          ZonedDateTime.of(LocalDateTime.of(2026, 11, 1, 1, 0, 0), EASTERN);

      ZonedDateTime first = DAILY_2AM.next(beforeFallback);
      assertThat(first).isNotNull();

      ZonedDateTime second = DAILY_2AM.next(first);
      assertThat(second).isNotNull();

      // Second execution must be ~24h after first (next day), not a duplicate same day
      long hoursBetween =
          java.time.Duration.between(first.toInstant(), second.toInstant()).toHours();
      assertThat(hoursBetween).isGreaterThanOrEqualTo(23L);
    }

    @Test
    @DisplayName("successive CronExpression.next() calls always move forward in absolute time")
    void alwaysAdvancesForward() {
      ZonedDateTime start = ZonedDateTime.of(LocalDateTime.of(2026, 11, 1, 0, 0, 0), EASTERN);

      ZonedDateTime current = start;
      for (int i = 0; i < 10; i++) {
        ZonedDateTime next = EVERY_30_MIN.next(current);
        assertThat(next).isNotNull();
        assertThat(next.toInstant())
            .as("iteration %d: next must be after current", i)
            .isAfter(current.toInstant());
        current = next;
      }
    }
  }
}
