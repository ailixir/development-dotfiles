package com.citi.put.checks.checks.dto;

import com.citi.put.checks.config.FeatureFlag;

public record FeatureFlagDto(String key, boolean enabled, String label) {

  public static FeatureFlagDto of(FeatureFlag flag, boolean enabled) {
    return new FeatureFlagDto(flag.name(), enabled, flag.label());
  }
}
