package com.citi.put.checks.studio.scheduling;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/** Bounded aggregate operational state, available while the producer capability is disabled. */
@Component("studioSchedulingHealthIndicator")
public class StudioSchedulingHealthIndicator implements HealthIndicator {
  private final StudioScheduleRepository repository;
  private final StudioSchedulingProperties properties;
  private final StudioCronResolver resolver;

  public StudioSchedulingHealthIndicator(
      StudioScheduleRepository repository,
      StudioSchedulingProperties properties,
      StudioCronResolver resolver) {
    this.repository = repository;
    this.properties = properties;
    this.resolver = resolver;
  }

  @Override
  public Health health() {
    try {
      Map<String, Long> states = new LinkedHashMap<>();
      for (Map<String, Object> row :
          repository
              .jdbc()
              .queryForList(
                  "SELECT state,count(*) AS total FROM studio_schedules WHERE deleted_at IS NULL"
                      + " GROUP BY state")) {
        states.put((String) row.get("state"), ((Number) row.get("total")).longValue());
      }
      Long due =
          repository
              .jdbc()
              .queryForObject(
                  "SELECT count(*) FROM studio_schedules WHERE state='ENABLED' AND"
                      + " poll_after_at<=?",
                  Long.class,
                  StudioScheduleRepository.timestamp(resolver.now()));
      return Health.up()
          .withDetail("producerEnabled", properties.isEnabled())
          .withDetail("states", states)
          .withDetail("eligibleDueCount", due == null ? 0 : due)
          .build();
    } catch (RuntimeException ex) {
      return Health.down().withDetail("reason", "Scheduling state unavailable").build();
    }
  }
}
