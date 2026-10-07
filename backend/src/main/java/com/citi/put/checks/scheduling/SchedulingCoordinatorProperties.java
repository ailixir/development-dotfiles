package com.citi.put.checks.scheduling;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "checks.scheduling.coordinator")
public class SchedulingCoordinatorProperties {
  private long heartbeatMs = 1000;
  private long shutdownTimeoutMs = 5000;

  public long getHeartbeatMs() {
    return heartbeatMs;
  }

  public void setHeartbeatMs(long value) {
    if (value < 1) {
      throw new IllegalArgumentException("Heartbeat must be positive");
    }
    heartbeatMs = value;
  }

  public long getShutdownTimeoutMs() {
    return shutdownTimeoutMs;
  }

  public void setShutdownTimeoutMs(long value) {
    if (value < 0) {
      throw new IllegalArgumentException("Shutdown timeout must be nonnegative");
    }
    shutdownTimeoutMs = value;
  }
}
