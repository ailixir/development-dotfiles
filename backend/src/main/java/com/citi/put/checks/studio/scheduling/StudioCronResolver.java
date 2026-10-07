package com.citi.put.checks.studio.scheduling;

import com.citi.put.checks.scheduling.CronRecurrence;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Canonical recurrence shared by preview and due admission. No browser work occurs here. */
@Component
public class StudioCronResolver {
  private final Clock clock;
  private final CronRecurrence recurrence;

  public StudioCronResolver(Clock clock) {
    this(clock, new CronRecurrence());
  }

  @Autowired
  public StudioCronResolver(Clock clock, CronRecurrence recurrence) {
    this.clock = clock;
    this.recurrence = recurrence;
  }

  public Instant now() {
    return clock.instant();
  }

  public record Slot(Instant scheduledAt, LocalDateTime localScheduledAt, int offsetSeconds) {}

  public record Rule(String cronExpression, String timeZone) {}

  public Rule validate(String expression, String timeZone) {
    String cron;
    try {
      cron = recurrence.normalize(expression, CronRecurrence.Format.MINUTE_ZERO_SECONDS);
      recurrence.parse(cron);
    } catch (IllegalArgumentException ex) {
      throw invalid("Invalid cron expression");
    }
    String zone = timeZone == null ? "UTC" : timeZone;
    try {
      recurrence.zone(zone, CronRecurrence.ZonePolicy.IANA_REGION);
    } catch (IllegalArgumentException ex) {
      throw new StudioScheduleException(
          400, "INVALID_TIME_ZONE", "Use UTC or an IANA region timezone");
    }
    Rule rule = new Rule(cron, zone);
    next(rule, now());
    return rule;
  }

  public Slot next(Rule rule, Instant after) {
    try {
      var next =
          recurrence.next(
              rule.cronExpression(),
              recurrence.zone(rule.timeZone(), CronRecurrence.ZonePolicy.IANA_REGION),
              after,
              CronRecurrence.Overlap.EARLIER_OFFSET);
      if (next == null) {
        throw invalid("Cron has no future occurrence");
      }
      return new Slot(next.scheduledAt(), next.localScheduledAt(), next.offsetSeconds());
    } catch (IllegalArgumentException ex) {
      throw invalid(ex.getMessage());
    }
  }

  public List<Slot> preview(Rule rule, Instant after) {
    List<Slot> result = new ArrayList<>();
    Instant cursor = after;
    for (int i = 0; i < 5; i++) {
      Slot slot = next(rule, cursor);
      result.add(slot);
      cursor = slot.scheduledAt();
    }
    return List.copyOf(result);
  }

  /** Finds only the latest eligible slot in the grace window, never iterating old backlog. */
  public Slot latestDue(Rule rule, Instant nominal, Instant now, int graceSeconds) {
    Instant floor = now.minusSeconds(graceSeconds);
    Instant cursor = nominal.isBefore(floor) ? floor.minusNanos(1) : nominal.minusNanos(1);
    Slot latest = null;
    int bound = graceSeconds / 60 + 181;
    for (int i = 0; i < bound; i++) {
      Slot slot = next(rule, cursor);
      if (slot.scheduledAt().isAfter(now)) {
        return latest;
      }
      latest = slot;
      cursor = slot.scheduledAt();
    }
    throw invalid("Grace window recurrence exceeded its bound");
  }

  private static StudioScheduleException invalid(String message) {
    return new StudioScheduleException(400, "INVALID_SCHEDULE", message);
  }
}
