package com.citi.put.checks.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.reports.schedule.ReportScheduleResolver;
import com.citi.put.checks.studio.scheduling.StudioCronResolver;
import com.citi.put.checks.studio.scheduling.StudioScheduleException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class CronRecurrenceTest {
  private final CronRecurrence kernel = new CronRecurrence();

  @Test
  void normalizationPreservesCatalogSyntaxAndStudioAloneNarrowsSeconds() {
    assertThat(kernel.normalize("  */5  * * * *  ", CronRecurrence.Format.COMPATIBLE))
        .isEqualTo("0 */5  * * * *");
    assertThat(kernel.normalize("@hourly", CronRecurrence.Format.COMPATIBLE)).isEqualTo("@hourly");
    kernel.parse("*/15 * * * * *");
    kernel.parse("0 0 0 L * *");
    kernel.parse("0 0 0 ? * MON#1");
    assertThat(kernel.normalize("  */5  * * * *  ", CronRecurrence.Format.MINUTE_ZERO_SECONDS))
        .isEqualTo("0 */5 * * * *");
    assertThatThrownBy(
            () -> kernel.normalize("*/15 * * * * *", CronRecurrence.Format.MINUTE_ZERO_SECONDS))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(
            kernel
                .sampledUtcGap("*/15 * * * * *", Instant.parse("2026-01-01T00:00:00Z"))
                .getAsLong())
        .isEqualTo(15);
  }

  @Test
  void genericAcceptsOffsetsAndNullableExhaustionWhileStudioPreservesItsRefusal() {
    assertThat(kernel.zone("+02:30", CronRecurrence.ZonePolicy.ANY_ZONE_ID))
        .isEqualTo(ZoneOffset.ofHoursMinutes(2, 30));
    assertThat(kernel.zone("EST", CronRecurrence.ZonePolicy.SHORT_IDS))
        .isEqualTo(ZoneOffset.ofHours(-5));
    assertThatThrownBy(() -> kernel.zone("+02:30", CronRecurrence.ZonePolicy.IANA_REGION))
        .isInstanceOf(IllegalArgumentException.class);
    String impossible = "0 0 0 31 2 *";
    Instant base = Instant.parse("2026-01-01T00:00:00Z");
    assertThat(
            kernel.next(impossible, ZoneOffset.UTC, base, CronRecurrence.Overlap.INSTANT_SEQUENCE))
        .isNull();
    assertThat(kernel.sampledUtcGap(impossible, base)).isEmpty();
    var studio = new StudioCronResolver(Clock.fixed(base, ZoneOffset.UTC), kernel);
    assertThatThrownBy(() -> studio.validate(impossible, "UTC"))
        .isInstanceOf(StudioScheduleException.class);
  }

  @Test
  void sameKernelExpressesBothEstablishedFallbackPoliciesAndStoredBase() {
    Instant base = Instant.parse("2026-11-01T04:00:00Z");
    ZoneId zone = ZoneId.of("America/New_York");
    var first = kernel.next("0 30 1 * * *", zone, base, CronRecurrence.Overlap.INSTANT_SEQUENCE);
    var second =
        kernel.next(
            "0 30 1 * * *", zone, first.scheduledAt(), CronRecurrence.Overlap.INSTANT_SEQUENCE);
    var studioSecond =
        kernel.next(
            "0 30 1 * * *", zone, first.scheduledAt(), CronRecurrence.Overlap.EARLIER_OFFSET);
    assertThat(first.scheduledAt()).isEqualTo(Instant.parse("2026-11-01T05:30:00Z"));
    assertThat(second.scheduledAt()).isEqualTo(Instant.parse("2026-11-01T06:30:00Z"));
    assertThat(studioSecond.scheduledAt()).isEqualTo(Instant.parse("2026-11-02T06:30:00Z"));
    assertThat(
            kernel
                .next(
                    "0 */5 * * * *",
                    ZoneOffset.UTC,
                    Instant.parse("2000-01-01T00:00:00Z"),
                    CronRecurrence.Overlap.INSTANT_SEQUENCE)
                .scheduledAt())
        .isEqualTo(Instant.parse("2000-01-01T00:05:00Z"));
  }

  @Test
  void reportsRetainMacrosShortAliasesNoFiveFieldNormalizationAndNullNext() throws Exception {
    var reports = new ReportScheduleResolver(kernel);
    var mapper = new ObjectMapper();
    var hourly =
        mapper.readTree("{\"frequency\":\"custom\",\"cron\":\"@hourly\",\"timezone\":\"EST\"}");
    assertThat(reports.toCronExpression(hourly)).isEqualTo("@hourly");
    assertThat(reports.nextDeliveryFrom(hourly, Instant.parse("2026-01-01T00:30:00Z")))
        .isEqualTo(Instant.parse("2026-01-01T01:00:00Z"));
    assertThatThrownBy(
            () ->
                reports.toCronExpression(
                    mapper.readTree("{\"frequency\":\"custom\",\"cron\":\"0 * * * *\"}")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(
            reports.nextDeliveryFrom(
                mapper.readTree("{\"frequency\":\"custom\",\"cron\":\"0 0 0 31 2 *\"}"),
                Instant.parse("2026-01-01T00:00:00Z")))
        .isNull();
  }
}
