package com.citi.put.checks.checks.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class SplunkConfigurationTest {

  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void defaultsAndRoundTrip() throws Exception {
    SplunkConfiguration config =
        new SplunkConfiguration(null, "search index=x | stats count", null, null, null, null);
    assertThat(config.type()).isEqualTo("SPLUNK");
    assertThat(config.timeRange()).isEqualTo("15m");
    assertThat(config.expectedCount()).isEqualTo(0);
    assertThat(config.countOperator()).isEqualTo(">");

    String json = mapper.writeValueAsString(config);
    CheckConfiguration parsed = mapper.readValue(json, CheckConfiguration.class);
    assertThat(parsed).isInstanceOf(SplunkConfiguration.class);
    assertThat(((SplunkConfiguration) parsed).query()).contains("index=x");
  }

  @Test
  void rejectsBlankQuery() {
    assertThatThrownBy(() -> new SplunkConfiguration("SPLUNK", " ", null, "15m", 0, ">"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("query");
  }
}
