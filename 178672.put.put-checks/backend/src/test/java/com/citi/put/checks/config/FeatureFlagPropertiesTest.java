package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

class FeatureFlagPropertiesTest {

  @Test
  void defaultsAllToTrueWhenNoFeaturesProvided() {
    FeatureFlagProperties props = new FeatureFlagProperties(Map.of());
    for (FeatureFlag f : FeatureFlag.values()) {
      assertThat(props.isEnabled(f)).as(f.name()).isTrue();
    }
  }

  @Test
  void allFlagsPresent() {
    FeatureFlagProperties props = new FeatureFlagProperties(Map.of());
    assertThat(props.features()).hasSize(FeatureFlag.values().length);
    for (FeatureFlag f : FeatureFlag.values()) {
      assertThat(props.features()).containsKey(f);
    }
  }

  @Test
  void explicitFalseOverridesDefault() {
    FeatureFlagProperties props =
        new FeatureFlagProperties(Map.of(FeatureFlag.STUDIO, false, FeatureFlag.REPORTS, false));
    assertThat(props.isEnabled(FeatureFlag.STUDIO)).isFalse();
    assertThat(props.isEnabled(FeatureFlag.REPORTS)).isFalse();
    assertThat(props.isEnabled(FeatureFlag.SCHEDULING)).isTrue();
    assertThat(props.isEnabled(FeatureFlag.DASHBOARD)).isTrue();
    assertThat(props.isEnabled(FeatureFlag.TEMPLATES)).isTrue();
    assertThat(props.isEnabled(FeatureFlag.BULK_OPERATIONS)).isTrue();
  }

  @Test
  void labelIsPopulated() {
    assertThat(FeatureFlag.STUDIO.label()).isEqualTo("Checks Studio");
    assertThat(FeatureFlag.SCHEDULING.label()).isEqualTo("Schedule Management");
  }
}
