package com.citi.put.checks.config;

import com.citi.put.checks.checks.model.CheckType;
import java.util.EnumMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "checks.executor")
public record SourceConcurrencyProperties(
    @DefaultValue("250") int maxConcurrency, @DefaultValue Map<CheckType, Integer> sourceLimits) {

  public SourceConcurrencyProperties {
    if (maxConcurrency < 1) {
      throw new IllegalArgumentException(
          "checks.executor.max-concurrency must be >= 1, got " + maxConcurrency);
    }
    EnumMap<CheckType, Integer> merged = new EnumMap<>(CheckType.class);
    merged.put(CheckType.HTTP, 150);
    merged.put(CheckType.TCP, 150);
    merged.put(CheckType.SPLUNK, 75);
    merged.put(CheckType.GRAFANA, 75);
    merged.put(CheckType.ITRS, 75);
    merged.put(CheckType.APPDYNAMICS, 75);
    merged.put(CheckType.UI_TEST, 25);
    if (sourceLimits != null) {
      merged.putAll(sourceLimits);
    }
    sourceLimits = Map.copyOf(merged);

    for (var entry : sourceLimits.entrySet()) {
      if (entry.getValue() > maxConcurrency) {
        throw new IllegalArgumentException(
            "Source limit for "
                + entry.getKey().name()
                + " ("
                + entry.getValue()
                + ") exceeds checks.executor.max-concurrency ("
                + maxConcurrency
                + "). Individual source limits must not exceed the global maximum.");
      }
    }
  }

  public int limitFor(CheckType type) {
    return sourceLimits.getOrDefault(type, 0);
  }
}
