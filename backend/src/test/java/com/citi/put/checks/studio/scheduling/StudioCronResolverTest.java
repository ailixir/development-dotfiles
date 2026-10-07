package com.citi.put.checks.studio.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class StudioCronResolverTest {
  private final StudioCronResolver resolver =
      new StudioCronResolver(Clock.fixed(Instant.parse("2026-10-05T12:00:00Z"), ZoneOffset.UTC));

  @Test
  void normalizesAndRejectsAmbiguousGrammarAndZones() {
    assertThat(resolver.validate("*/5 * * * *", null).cronExpression()).isEqualTo("0 */5 * * * *");
    assertThatThrownBy(() -> resolver.validate("*/30 * * * * *", "UTC"))
        .isInstanceOf(StudioScheduleException.class);
    assertThatThrownBy(() -> resolver.validate("* * * * *", "EST"))
        .isInstanceOf(StudioScheduleException.class);
    assertThatThrownBy(() -> resolver.validate("0 0 0 31 2 *", "UTC"))
        .isInstanceOf(StudioScheduleException.class);
  }

  @Test
  void selectsEarlierOverlapAndSkipsNonexistentLocalTime() {
    var rule = resolver.validate("30 1 * * *", "America/New_York");
    var first = resolver.next(rule, Instant.parse("2026-11-01T04:00:00Z"));
    var next = resolver.next(rule, first.scheduledAt());
    assertThat(first.scheduledAt()).isEqualTo(Instant.parse("2026-11-01T05:30:00Z"));
    assertThat(next.scheduledAt()).isEqualTo(Instant.parse("2026-11-02T06:30:00Z"));
    var gap =
        resolver.next(
            resolver.validate("30 2 * * *", "America/New_York"),
            Instant.parse("2026-03-08T06:00:00Z"));
    assertThat(gap.localScheduledAt().toString()).isEqualTo("2026-03-09T02:30");
  }

  @Test
  void handlesHalfHourAndThreeHourOverlapsWithoutAnAssumedOneHourLimit() {
    var lordHowe = resolver.validate("45 1 * * *", "Australia/Lord_Howe");
    var first = resolver.next(lordHowe, Instant.parse("2026-04-04T13:00:00Z"));
    assertThat(resolver.next(lordHowe, first.scheduledAt()).localScheduledAt().toLocalDate())
        .isAfter(first.localScheduledAt().toLocalDate());
    var zone = ZoneId.of("Antarctica/Casey");
    var overlap = zone.getRules().previousTransition(Instant.parse("2023-03-10T00:00:00Z"));
    assertThat(overlap.isOverlap()).isTrue();
    var dense = new StudioCronResolver.Rule("0 * * * * *", zone.getId());
    var afterEarlierWindow = overlap.getInstant().minusSeconds(60);
    var next = resolver.next(dense, afterEarlierWindow);
    assertThat(next.scheduledAt()).isAfterOrEqualTo(overlap.getInstant().plusSeconds(3 * 3600));
  }

  @Test
  void longDowntimeIsResolvedOnlyInsideTheGraceWindow() {
    var rule = resolver.validate("* * * * *", "UTC");
    var result =
        resolver.latestDue(rule, Instant.parse("2000-01-01T00:00:00Z"), resolver.now(), 300);
    assertThat(result.scheduledAt()).isEqualTo(resolver.now());
    assertThat(resolver.preview(rule, resolver.now())).hasSize(5);
  }
}
