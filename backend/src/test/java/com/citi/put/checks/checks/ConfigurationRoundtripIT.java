package com.citi.put.checks.checks;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.model.CheckConfiguration;
import com.citi.put.checks.checks.model.HttpConfiguration;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ConfigurationRoundtripIT {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void httpConfigurationRoundtripsViaJackson() throws Exception {
    HttpConfiguration original =
        new HttpConfiguration(
            "HTTP",
            "POST",
            "https://api.example.com/webhook",
            Map.of("Authorization", "Bearer tok123", "Content-Type", "application/json"),
            "{\"key\":\"value\"}",
            201,
            false,
            10000,
            true);

    String json = objectMapper.writeValueAsString(original);
    CheckConfiguration deserialized = objectMapper.readValue(json, CheckConfiguration.class);

    assertThat(deserialized).isInstanceOf(HttpConfiguration.class);
    HttpConfiguration roundtripped = (HttpConfiguration) deserialized;
    assertThat(roundtripped.type()).isEqualTo("HTTP");
    assertThat(roundtripped.method()).isEqualTo("POST");
    assertThat(roundtripped.url()).isEqualTo("https://api.example.com/webhook");
    assertThat(roundtripped.headers()).containsEntry("Authorization", "Bearer tok123");
    assertThat(roundtripped.body()).isEqualTo("{\"key\":\"value\"}");
    assertThat(roundtripped.expectedStatusCode()).isEqualTo(201);
    assertThat(roundtripped.followRedirects()).isFalse();
    assertThat(roundtripped.timeoutMs()).isEqualTo(10000);
    assertThat(roundtripped.verifyTls()).isTrue();
  }

  @Test
  void httpConfigurationDefaultsApplied() throws Exception {
    String minimal =
        """
        {"type":"HTTP","method":"GET","url":"https://example.com"}
        """;
    CheckConfiguration config = objectMapper.readValue(minimal, CheckConfiguration.class);
    assertThat(config).isInstanceOf(HttpConfiguration.class);
    HttpConfiguration http = (HttpConfiguration) config;
    assertThat(http.expectedStatusCode()).isEqualTo(200);
    assertThat(http.followRedirects()).isTrue();
    assertThat(http.timeoutMs()).isEqualTo(5000);
    assertThat(http.verifyTls()).isTrue();
  }
}
