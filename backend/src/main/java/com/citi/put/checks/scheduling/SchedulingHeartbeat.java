package com.citi.put.checks.scheduling;

import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * Completed neutral bean supplies the actual annotation delay without a coordinator self-reference.
 */
@Component("schedulingHeartbeat")
public class SchedulingHeartbeat {
  private final ObjectProvider<ScheduledTarget> targets;
  private final SchedulingCoordinatorProperties properties;

  public SchedulingHeartbeat(
      ObjectProvider<ScheduledTarget> targets, SchedulingCoordinatorProperties properties) {
    this.targets = targets;
    this.properties = properties;
  }

  public long millis() {
    return effectiveMillis(targets.orderedStream().toList(), properties);
  }

  static long effectiveMillis(
      List<ScheduledTarget> targets, SchedulingCoordinatorProperties properties) {
    return targets.stream().mapToLong(t -> Math.max(1, t.pollInterval().toMillis())).min().stream()
        .map(min -> Math.min(min, properties.getHeartbeatMs()))
        .findFirst()
        .orElse(properties.getHeartbeatMs());
  }
}
