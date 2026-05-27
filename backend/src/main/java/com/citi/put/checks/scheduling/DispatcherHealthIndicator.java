package com.citi.put.checks.scheduling;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component("dispatchers")
public class DispatcherHealthIndicator implements HealthIndicator {

  private final FailedDispatchRepository failedDispatchRepository;
  private final MeterRegistry meterRegistry;
  private final int pendingThreshold;

  public DispatcherHealthIndicator(
      FailedDispatchRepository failedDispatchRepository,
      MeterRegistry meterRegistry,
      @Value("${checks.dispatch.pending-threshold:50}") int pendingThreshold) {
    this.failedDispatchRepository = failedDispatchRepository;
    this.meterRegistry = meterRegistry;
    this.pendingThreshold = pendingThreshold;
  }

  @Override
  public Health health() {
    long deadLetteredLast24h =
        failedDispatchRepository.countDeadLetteredSince(Instant.now().minus(24, ChronoUnit.HOURS));
    long pendingChecks = failedDispatchRepository.countPending("CHECK");
    long pendingReports = failedDispatchRepository.countPending("REPORT");
    long totalPending = pendingChecks + pendingReports;

    Health.Builder builder =
        Health.up()
            .withDetail("deadLetteredLast24h", deadLetteredLast24h)
            .withDetail("pendingRetries", totalPending)
            .withDetail("pendingChecks", pendingChecks)
            .withDetail("pendingReports", pendingReports);

    if (deadLetteredLast24h > 0) {
      return builder.down().build();
    }
    if (totalPending >= pendingThreshold) {
      return builder.status("WARNING").build();
    }
    return builder.build();
  }

  @Scheduled(fixedRate = 60_000, initialDelay = 30_000)
  void refreshMetrics() {
    for (String type : List.of("CHECK", "REPORT")) {
      long deadLettered = failedDispatchRepository.countDeadLettered(type);
      long pending = failedDispatchRepository.countPending(type);

      meterRegistry.gauge(
          "checks.dispatch.dead_lettered_total", List.of(Tag.of("type", type)), deadLettered);
      meterRegistry.gauge(
          "checks.dispatch.pending_retries", List.of(Tag.of("type", type)), pending);
    }
  }
}
