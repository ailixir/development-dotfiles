package com.citi.put.checks.studio.scheduling;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Separate, default-off capability. Existing execution recovery is never gated by this flag. */
@Component
@ConfigurationProperties(prefix = "studio.scheduling")
public class StudioSchedulingProperties {
  private volatile boolean enabled;
  private volatile boolean localGrantsEnabled;
  private int graceSeconds = 300;
  private int batchSize = 20;
  private int perCsiBatchSize = 2;
  private int passBudgetMillis = 5000;
  private String pollIntervalMs = "5000";

  public String getPollIntervalMs() {
    return pollIntervalMs;
  }

  public void setPollIntervalMs(String value) {
    pollIntervalMs = java.util.Objects.requireNonNull(value);
  }

  public void setPollIntervalMs(long value) {
    com.citi.put.checks.scheduling.SchedulingDelays.positive(Long.toString(value));
    setPollIntervalMs(Long.toString(value));
  }

  private volatile Map<String, String> localGrants = new java.util.concurrent.ConcurrentHashMap<>();

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean value) {
    enabled = value;
  }

  public boolean isLocalGrantsEnabled() {
    return localGrantsEnabled;
  }

  public void setLocalGrantsEnabled(boolean value) {
    localGrantsEnabled = value;
  }

  public int getGraceSeconds() {
    return graceSeconds;
  }

  public void setGraceSeconds(int value) {
    if (value < 1 || value > 3600) {
      throw new IllegalArgumentException("Scheduling grace must be 1..3600 seconds");
    }
    graceSeconds = value;
  }

  public int getBatchSize() {
    return batchSize;
  }

  public void setBatchSize(int value) {
    if (value < 1 || value > 100) {
      throw new IllegalArgumentException("Scheduling batch must be 1..100");
    }
    batchSize = value;
  }

  public int getPerCsiBatchSize() {
    return perCsiBatchSize;
  }

  public int getPassBudgetMillis() {
    return passBudgetMillis;
  }

  public void setPassBudgetMillis(int value) {
    if (value < 1 || value > 30000) {
      throw new IllegalArgumentException("Scheduling pass budget must be 1..30000ms");
    }
    passBudgetMillis = value;
  }

  public void setPerCsiBatchSize(int value) {
    if (value < 1 || value > 20) {
      throw new IllegalArgumentException("Scheduling CSI batch must be 1..20");
    }
    perCsiBatchSize = value;
  }

  public Map<String, String> getLocalGrants() {
    return localGrants;
  }

  public void setLocalGrants(Map<String, String> value) {
    localGrants = new java.util.concurrent.ConcurrentHashMap<>(value);
  }
}
