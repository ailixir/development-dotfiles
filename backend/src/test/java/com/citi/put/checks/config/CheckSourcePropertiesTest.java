package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.model.CheckType;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CheckSourcePropertiesTest {

  @Test
  void defaultsAllToTrueWhenNoSourcesProvided() {
    CheckSourceProperties props = new CheckSourceProperties(Map.of());
    for (CheckType t : CheckType.values()) {
      assertThat(props.isEnabled(t)).as(t.name()).isTrue();
    }
  }

  @Test
  void missingKeyDefaultsToTrue() {
    CheckSourceProperties props =
        new CheckSourceProperties(Map.of(CheckType.HTTP, false, CheckType.TCP, false));
    assertThat(props.isEnabled(CheckType.HTTP)).isFalse();
    assertThat(props.isEnabled(CheckType.TCP)).isFalse();
    assertThat(props.isEnabled(CheckType.SPLUNK)).isTrue();
    assertThat(props.isEnabled(CheckType.GRAFANA)).isTrue();
    assertThat(props.isEnabled(CheckType.ITRS)).isTrue();
    assertThat(props.isEnabled(CheckType.APPDYNAMICS)).isTrue();
    assertThat(props.isEnabled(CheckType.UI_TEST)).isTrue();
  }

  @Test
  void allSevenTypesPresent() {
    CheckSourceProperties props = new CheckSourceProperties(Map.of());
    assertThat(props.sources()).hasSize(7);
    for (CheckType t : CheckType.values()) {
      assertThat(props.sources()).containsKey(t);
    }
  }

  @Test
  void enabledTypesReturnsOnlyTrueEntries() {
    CheckSourceProperties props =
        new CheckSourceProperties(
            Map.of(
                CheckType.HTTP, true,
                CheckType.TCP, true,
                CheckType.SPLUNK, false,
                CheckType.GRAFANA, false,
                CheckType.ITRS, false,
                CheckType.APPDYNAMICS, false,
                CheckType.UI_TEST, false));
    assertThat(props.enabledTypes()).containsExactlyInAnyOrder(CheckType.HTTP, CheckType.TCP);
    assertThat(props.enabledTypeNames()).containsExactlyInAnyOrder("HTTP", "TCP");
  }

  @Test
  void explicitFalseOverridesDefault() {
    CheckSourceProperties props =
        new CheckSourceProperties(
            Map.of(
                CheckType.HTTP, true,
                CheckType.TCP, false,
                CheckType.SPLUNK, true));
    assertThat(props.isEnabled(CheckType.HTTP)).isTrue();
    assertThat(props.isEnabled(CheckType.TCP)).isFalse();
    assertThat(props.isEnabled(CheckType.SPLUNK)).isTrue();
  }
}
