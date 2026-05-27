package com.citi.put.checks.reports.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;

class ReportScheduleResolverTest {

  private final ReportScheduleResolver resolver = new ReportScheduleResolver();
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void dailyResolution() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"daily","time":"06:00","timezone":"UTC"}
        """);
    assertThat(resolver.toCronExpression(schedule)).isEqualTo("0 0 6 * * *");
  }

  @Test
  void weeklyResolution() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"weekly","daysOfWeek":[1,3,5],"time":"08:00","timezone":"UTC"}
        """);
    assertThat(resolver.toCronExpression(schedule)).isEqualTo("0 0 8 * * MON,WED,FRI");
  }

  @Test
  void monthlyResolution() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"monthly","dayOfMonth":15,"time":"09:30","timezone":"UTC"}
        """);
    assertThat(resolver.toCronExpression(schedule)).isEqualTo("0 30 9 15 * *");
  }

  @Test
  void customPassthrough() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"custom","cron":"0 0 6 * * MON-FRI","timezone":"UTC"}
        """);
    assertThat(resolver.toCronExpression(schedule)).isEqualTo("0 0 6 * * MON-FRI");
  }

  @Test
  void invalidFrequencyThrows() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"biweekly","time":"06:00"}
        """);
    assertThatThrownBy(() -> resolver.toCronExpression(schedule))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Unknown frequency");
  }

  @Test
  void missingFrequencyThrows() throws Exception {
    JsonNode schedule = mapper.readTree("{\"time\":\"06:00\"}");
    assertThatThrownBy(() -> resolver.toCronExpression(schedule))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("frequency");
  }

  @Test
  void invalidCustomCronThrows() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"custom","cron":"not a cron"}
        """);
    assertThatThrownBy(() -> resolver.toCronExpression(schedule))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void nextDeliveryReturnsFutureInstant() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"daily","time":"06:00","timezone":"UTC"}
        """);
    Instant next = resolver.nextDelivery(schedule);
    assertThat(next).isNotNull().isAfter(Instant.now());
  }

  @Test
  void nextDeliveryFromAdvancesFromBase() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"daily","time":"06:00","timezone":"UTC"}
        """);
    Instant yesterday = Instant.now().minus(1, ChronoUnit.DAYS);
    Instant next = resolver.nextDeliveryFrom(schedule, yesterday);
    assertThat(next).isNotNull().isAfter(yesterday);
  }

  @Test
  void defaultsTimezoneToUtc() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"daily","time":"12:00"}
        """);
    String cron = resolver.toCronExpression(schedule);
    assertThat(cron).isEqualTo("0 0 12 * * *");

    Instant next = resolver.nextDelivery(schedule);
    assertThat(next).isNotNull();
  }

  @Test
  void dailyWithoutTimeDefaultsToMidnight() throws Exception {
    JsonNode schedule = mapper.readTree("{\"frequency\":\"daily\"}");
    assertThat(resolver.toCronExpression(schedule)).isEqualTo("0 0 0 * * *");
  }

  @Test
  void weeklyWithSundayIso7() throws Exception {
    JsonNode schedule =
        mapper.readTree(
            """
        {"frequency":"weekly","daysOfWeek":[7],"time":"10:00","timezone":"UTC"}
        """);
    assertThat(resolver.toCronExpression(schedule)).isEqualTo("0 0 10 * * SUN");
  }
}
