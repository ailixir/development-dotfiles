package com.citi.put.checks.reports.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.StringJoiner;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

@Component
public class ReportScheduleResolver {

  private static final String[] SPRING_DAYS = {"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"};

  public String toCronExpression(JsonNode schedule) {
    String frequency = requireField(schedule, "frequency").asText();
    return switch (frequency) {
      case "hourly" -> buildHourlyCron();
      case "daily" -> buildDailyCron(schedule);
      case "weekly" -> buildWeeklyCron(schedule);
      case "monthly" -> buildMonthlyCron(schedule);
      case "custom" -> {
        String cron = requireField(schedule, "cron").asText();
        CronExpression.parse(cron);
        yield cron;
      }
      default -> throw new IllegalArgumentException("Unknown frequency: " + frequency);
    };
  }

  public Instant nextDelivery(JsonNode schedule) {
    String cron = toCronExpression(schedule);
    ZoneId zone = resolveTimezone(schedule);
    CronExpression expr = CronExpression.parse(cron);
    ZonedDateTime next = expr.next(ZonedDateTime.now(zone));
    return next != null ? next.toInstant() : null;
  }

  public Instant nextDeliveryFrom(JsonNode schedule, Instant base) {
    String cron = toCronExpression(schedule);
    ZoneId zone = resolveTimezone(schedule);
    CronExpression expr = CronExpression.parse(cron);
    ZonedDateTime baseZoned = base != null ? base.atZone(zone) : ZonedDateTime.now(zone);
    ZonedDateTime next = expr.next(baseZoned);
    return next != null ? next.toInstant() : null;
  }

  private String buildHourlyCron() {
    return "0 0 * * * *";
  }

  private String buildDailyCron(JsonNode schedule) {
    int[] hm = parseTime(timeOrDefault(schedule));
    return "0 %d %d * * *".formatted(hm[1], hm[0]);
  }

  private String buildWeeklyCron(JsonNode schedule) {
    JsonNode daysNode = schedule.get("daysOfWeek");
    int[] hm = parseTime(timeOrDefault(schedule));
    StringJoiner days = new StringJoiner(",");
    if (daysNode != null && daysNode.isArray() && !daysNode.isEmpty()) {
      for (JsonNode day : daysNode) {
        int iso = day.asInt();
        if (iso < 1 || iso > 7) {
          throw new IllegalArgumentException("Invalid day of week: " + iso);
        }
        days.add(SPRING_DAYS[iso % 7]);
      }
    } else if (daysNode != null && daysNode.isNumber()) {
      int iso = daysNode.asInt();
      if (iso < 1 || iso > 7) {
        throw new IllegalArgumentException("Invalid day of week: " + iso);
      }
      days.add(SPRING_DAYS[iso % 7]);
    } else {
      JsonNode singleDay = schedule.get("dayOfWeek");
      if (singleDay != null && !singleDay.isNull()) {
        int iso = singleDay.asInt();
        if (iso < 1 || iso > 7) {
          throw new IllegalArgumentException("Invalid day of week: " + iso);
        }
        days.add(SPRING_DAYS[iso % 7]);
      } else {
        days.add("MON");
      }
    }
    return "0 %d %d * * %s".formatted(hm[1], hm[0], days);
  }

  private String buildMonthlyCron(JsonNode schedule) {
    JsonNode daysNode = schedule.get("daysOfMonth");
    int[] hm = parseTime(timeOrDefault(schedule));
    StringJoiner days = new StringJoiner(",");
    if (daysNode != null && daysNode.isArray() && !daysNode.isEmpty()) {
      for (JsonNode day : daysNode) {
        int d = day.asInt();
        if (d < 1 || d > 31) {
          throw new IllegalArgumentException("Invalid dayOfMonth: " + d);
        }
        days.add(String.valueOf(d));
      }
    } else if (daysNode != null && daysNode.isNumber()) {
      int d = daysNode.asInt();
      if (d < 1 || d > 31) {
        throw new IllegalArgumentException("Invalid dayOfMonth: " + d);
      }
      days.add(String.valueOf(d));
    } else {
      JsonNode singleDay = schedule.get("dayOfMonth");
      if (singleDay != null && !singleDay.isNull()) {
        int d = singleDay.asInt();
        if (d < 1 || d > 31) {
          throw new IllegalArgumentException("Invalid dayOfMonth: " + d);
        }
        days.add(String.valueOf(d));
      } else {
        days.add("1");
      }
    }
    return "0 %d %d %s * *".formatted(hm[1], hm[0], days);
  }

  private String timeOrDefault(JsonNode schedule) {
    JsonNode time = schedule.get("time");
    return (time != null && !time.isNull()) ? time.asText() : "00:00";
  }

  private ZoneId resolveTimezone(JsonNode schedule) {
    JsonNode tz = schedule.get("timezone");
    String tzText = tz != null && !tz.isNull() ? tz.asText() : "UTC";
    return ZoneId.of(tzText, ZoneId.SHORT_IDS);
  }

  private int[] parseTime(String time) {
    String[] parts = time.split(":");
    if (parts.length != 2) {
      throw new IllegalArgumentException("Invalid time format (expected HH:mm): " + time);
    }
    return new int[] {Integer.parseInt(parts[0]), Integer.parseInt(parts[1])};
  }

  private JsonNode requireField(JsonNode node, String field) {
    JsonNode value = node.get(field);
    if (value == null || value.isNull()) {
      throw new IllegalArgumentException("Missing required field: " + field);
    }
    return value;
  }
}
