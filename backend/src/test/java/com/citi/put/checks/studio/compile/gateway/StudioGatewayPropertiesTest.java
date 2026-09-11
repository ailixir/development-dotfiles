package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;

/** Story 10.5 AC-2: an enabled gateway with incomplete configuration must not start. */
class StudioGatewayPropertiesTest {

  @Test
  void disabledGatewayNeedsNoConfiguration() {
    StudioGatewayProperties properties =
        new StudioGatewayProperties(
            false, null, null, null, null, null, null, 0, 0, 0, false, 0d, null, null);

    assertThatCode(properties::validateForEnabled).doesNotThrowAnyException();
  }

  @Test
  void enabledGatewayReportsEveryMissingValueAtOnce() {
    StudioGatewayProperties properties =
        new StudioGatewayProperties(
            true,
            "  ",
            null,
            null,
            null,
            new StudioGatewayProperties.Credentials("nonsense", null),
            Duration.ZERO,
            0,
            0,
            0,
            true,
            0d,
            new StudioGatewayProperties.TransportRetry(2, Duration.ofMillis(10), 2d, 0.5d),
            null);

    assertThatThrownBy(properties::validateForEnabled)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.compile.gateway.endpoint is required")
        .hasMessageContaining("studio.compile.gateway.project is required")
        .hasMessageContaining("studio.compile.gateway.location is required")
        .hasMessageContaining("studio.compile.gateway.model is required")
        .hasMessageContaining("studio.compile.gateway.artifact-schema is required")
        .hasMessageContaining("credentials.mode must be one of")
        .hasMessageContaining("studio.compile.gateway.request-timeout must be > 0")
        .hasMessageContaining("studio.compile.gateway.max-concurrency must be > 0")
        .hasMessageContaining("studio.compile.gateway.enabled=false");
  }

  @Test
  void serviceAccountModeRequiresAKeyFile() {
    StudioGatewayProperties properties =
        complete(
            new StudioGatewayProperties.Credentials(
                StudioGatewayProperties.MODE_SERVICE_ACCOUNT_FILE, null));

    assertThatThrownBy(properties::validateForEnabled)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("credentials.service-account-key-file is required");
  }

  @Test
  void aCompleteConfigurationValidates() {
    assertThatCode(
            complete(
                    new StudioGatewayProperties.Credentials(
                        StudioGatewayProperties.MODE_APPLICATION_DEFAULT, null))
                ::validateForEnabled)
        .doesNotThrowAnyException();
  }

  @Test
  void defaultsAreSafe() {
    StudioGatewayProperties defaults = GatewayTestSupport.properties("http://localhost:1");

    assertThat(defaults.temperature()).isZero();
    assertThat(defaults.structuredOutput()).isTrue();
    assertThat(defaults.retry().maxRetries()).isEqualTo(2);
  }

  private static StudioGatewayProperties complete(StudioGatewayProperties.Credentials credentials) {
    return new StudioGatewayProperties(
        true,
        "https://r2d2.example.invalid",
        "project",
        "location",
        "model",
        credentials,
        Duration.ofSeconds(30),
        2,
        1024,
        1024,
        true,
        0d,
        new StudioGatewayProperties.TransportRetry(2, Duration.ofMillis(10), 2d, 0.5d),
        "classpath:studio/artifact.schema.json");
  }
}
