package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class StudioGatewayPropertiesTest {

  @Test
  void apiKeyModeDoesNotRequireProjectOrLocation() {
    assertThatCode(() -> properties("key-value").validateForEnabled()).doesNotThrowAnyException();
  }

  @Test
  void apiKeyModeFailsFastWithoutTheKey() {
    assertThatThrownBy(() -> properties("").validateForEnabled())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("credentials.api-key is required");
  }

  private static StudioGatewayProperties properties(String key) {
    return new StudioGatewayProperties(
        true,
        "",
        "",
        "us-central1",
        "gemini-3.8-flash",
        new StudioGatewayProperties.Credentials(StudioGatewayProperties.MODE_API_KEY, "", key),
        Duration.ofSeconds(10),
        2,
        4096,
        4096,
        true,
        0,
        new StudioGatewayProperties.TransportRetry(0, Duration.ofMillis(1), 2, 0),
        "classpath:studio/artifact.schema.json");
  }
}
