package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.BindException;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/** Story 10.5 AC-2: an enabled gateway with incomplete configuration must not start. */
class StudioGatewayPropertiesTest {

  @Test
  void vertexGatewayReportsEveryMissingValueAtOnce() {
    StudioGatewayProperties properties =
        new StudioGatewayProperties(
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

    assertThatThrownBy(properties::validateForVertex)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.compile.gateway.endpoint is required")
        .hasMessageContaining("studio.compile.gateway.project is required")
        .hasMessageContaining("studio.compile.gateway.location is required")
        .hasMessageContaining("studio.compile.gateway.model is required")
        .hasMessageContaining("studio.compile.gateway.artifact-schema is required")
        .hasMessageContaining("credentials.mode must be one of")
        .hasMessageContaining("studio.compile.gateway.request-timeout must be > 0")
        .hasMessageContaining("studio.compile.gateway.max-concurrency must be > 0")
        .hasMessageContaining("studio.compile.gateway.provider=disabled");
  }

  @Test
  void serviceAccountModeRequiresAKeyFile() {
    StudioGatewayProperties properties =
        complete(
            new StudioGatewayProperties.Credentials(
                StudioGatewayProperties.MODE_SERVICE_ACCOUNT_FILE, null));

    assertThatThrownBy(properties::validateForVertex)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("credentials.service-account-key-file is required");
  }

  @Test
  void aCompleteConfigurationValidates() {
    assertThatCode(
            complete(
                    new StudioGatewayProperties.Credentials(
                        StudioGatewayProperties.MODE_APPLICATION_DEFAULT, null))
                ::validateForVertex)
        .doesNotThrowAnyException();
  }

  @Test
  void defaultsAreSafe() {
    StudioGatewayProperties defaults = GatewayTestSupport.properties("http://localhost:1");

    assertThat(defaults.temperature()).isZero();
    assertThat(defaults.structuredOutput()).isTrue();
    assertThat(defaults.retry().maxRetries()).isEqualTo(2);
    assertThat(defaults.thinkingLevel()).isEqualTo(StudioGatewayProperties.ThinkingLevel.MEDIUM);
    assertThat(defaults.providerFeatures().systemInstruction()).isTrue();
    assertThat(defaults.providerFeatures().thinkingConfig()).isTrue();
    assertThat(defaults.effectiveThinkingLevel()).isEqualTo("MEDIUM");
  }

  @Test
  void bindingDefaultsPinMediumAndSendEveryProviderFeature() {
    StudioGatewayProperties bound = bind(Map.of());

    assertThat(bound.thinkingLevel()).isEqualTo(StudioGatewayProperties.ThinkingLevel.MEDIUM);
    assertThat(bound.providerFeatures()).isEqualTo(StudioGatewayProperties.ProviderFeatures.ALL);
  }

  @Test
  void bindingAcceptsTheSupportedThinkingLevels() {
    assertThat(bind(Map.of("studio.compile.gateway.thinking-level", "low")).thinkingLevel())
        .isEqualTo(StudioGatewayProperties.ThinkingLevel.LOW);
    assertThat(bind(Map.of("studio.compile.gateway.thinking-level", "HIGH")).thinkingLevel())
        .isEqualTo(StudioGatewayProperties.ThinkingLevel.HIGH);
  }

  @Test
  void bindingRejectsMinimalAndUnspecifiedThinkingLevels() {
    for (String value : new String[] {"MINIMAL", "minimal", "THINKING_LEVEL_UNSPECIFIED"}) {
      assertThatThrownBy(() -> bind(Map.of("studio.compile.gateway.thinking-level", value)))
          .as(value)
          .isInstanceOf(BindException.class)
          .hasMessageContaining("thinking-level");
    }
  }

  @Test
  void degradationSwitchesBindAndRecordProviderDefault() {
    Map<String, String> values = new HashMap<>();
    values.put("studio.compile.gateway.provider-features.system-instruction", "false");
    values.put("studio.compile.gateway.provider-features.thinking-config", "false");
    StudioGatewayProperties bound = bind(values);

    assertThat(bound.providerFeatures().systemInstruction()).isFalse();
    assertThat(bound.providerFeatures().thinkingConfig()).isFalse();
    assertThat(bound.effectiveThinkingLevel())
        .isEqualTo(StudioGatewayProperties.PROVIDER_DEFAULT_THINKING_LEVEL);
  }

  private static StudioGatewayProperties bind(Map<String, String> values) {
    return new Binder(new MapConfigurationPropertySource(values))
        .bindOrCreate("studio.compile.gateway", StudioGatewayProperties.class);
  }

  private static StudioGatewayProperties complete(StudioGatewayProperties.Credentials credentials) {
    return new StudioGatewayProperties(
        "https://aiplatform.googleapis.com",
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
