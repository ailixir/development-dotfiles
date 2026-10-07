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
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

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
    assertThat(defaults.thinkingLevel()).isEqualTo(StudioGatewayProperties.ThinkingLevel.LOW);
    assertThat(defaults.providerFeatures().systemInstruction()).isTrue();
    assertThat(defaults.providerFeatures().thinkingConfig()).isTrue();
    assertThat(defaults.effectiveThinkingLevel()).isEqualTo("LOW");
  }

  @Test
  void bindingDefaultsToLowAndSendsEveryProviderFeature() {
    StudioGatewayProperties bound = bind(Map.of());

    assertThat(bound.thinkingLevel()).isEqualTo(StudioGatewayProperties.ThinkingLevel.LOW);
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

  @Test
  void applicationYamlDefaultsToLowAndTheEnvironmentOverridesIt() throws Exception {
    assertThat(bindApplicationYaml(Map.of()).thinkingLevel())
        .isEqualTo(StudioGatewayProperties.ThinkingLevel.LOW);
    assertThat(
            bindApplicationYaml(Map.of("STUDIO_GATEWAY_THINKING_LEVEL", "MEDIUM")).thinkingLevel())
        .isEqualTo(StudioGatewayProperties.ThinkingLevel.MEDIUM);
  }

  /** Binds the real {@code application.yml}, resolving its placeholders against {@code env}. */
  private static StudioGatewayProperties bindApplicationYaml(Map<String, Object> env)
      throws Exception {
    StandardEnvironment environment = new StandardEnvironment();
    environment
        .getPropertySources()
        .remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
    environment.getPropertySources().addFirst(new MapPropertySource("test-env", env));
    for (PropertySource<?> source :
        new YamlPropertySourceLoader()
            .load("application.yml", new ClassPathResource("application.yml"))) {
      environment.getPropertySources().addLast(source);
    }
    return Binder.get(environment)
        .bindOrCreate("studio.compile.gateway", StudioGatewayProperties.class);
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
