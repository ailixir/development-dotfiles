package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.checks.model.CheckType;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SourceConcurrencyConfigValidationTest {

  @Test
  void defaultsAreValid() {
    SourceConcurrencyProperties props = new SourceConcurrencyProperties(250, null);
    assertThat(props.maxConcurrency()).isEqualTo(250);
    assertThat(props.limitFor(CheckType.HTTP)).isEqualTo(150);
    assertThat(props.limitFor(CheckType.TCP)).isEqualTo(150);
    assertThat(props.limitFor(CheckType.SPLUNK)).isEqualTo(75);
    assertThat(props.limitFor(CheckType.UI_TEST)).isEqualTo(25);
  }

  @Test
  void customLimitsOverrideDefaults() {
    SourceConcurrencyProperties props =
        new SourceConcurrencyProperties(500, Map.of(CheckType.HTTP, 300));
    assertThat(props.limitFor(CheckType.HTTP)).isEqualTo(300);
    assertThat(props.limitFor(CheckType.TCP)).isEqualTo(150);
  }

  @Test
  void singleSourceLimitExceedingMaxConcurrencyThrows() {
    assertThatThrownBy(() -> new SourceConcurrencyProperties(10, Map.of(CheckType.HTTP, 150)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("exceeds")
        .hasMessageContaining("max-concurrency");
  }

  @Test
  void maxConcurrencyLessThanOneThrows() {
    assertThatThrownBy(() -> new SourceConcurrencyProperties(0, null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("must be >= 1");
  }

  @Test
  void negativeMaxConcurrencyThrows() {
    assertThatThrownBy(() -> new SourceConcurrencyProperties(-5, null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("must be >= 1");
  }

  @Test
  void sourceLimitEqualToMaxIsAllowed() {
    SourceConcurrencyProperties props =
        new SourceConcurrencyProperties(150, Map.of(CheckType.HTTP, 150));
    assertThat(props.maxConcurrency()).isEqualTo(150);
    assertThat(props.limitFor(CheckType.HTTP)).isEqualTo(150);
  }
}
