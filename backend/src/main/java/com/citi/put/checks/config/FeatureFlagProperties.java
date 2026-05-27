package com.citi.put.checks.config;

import java.util.EnumMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "checks")
public record FeatureFlagProperties(@DefaultValue Map<FeatureFlag, Boolean> features) {

  public FeatureFlagProperties {
    EnumMap<FeatureFlag, Boolean> merged = new EnumMap<>(FeatureFlag.class);
    for (FeatureFlag f : FeatureFlag.values()) {
      merged.put(f, true);
    }
    if (features != null) {
      merged.putAll(features);
    }
    features = Map.copyOf(merged);
  }

  public boolean isEnabled(FeatureFlag flag) {
    return Boolean.TRUE.equals(features.get(flag));
  }
}
