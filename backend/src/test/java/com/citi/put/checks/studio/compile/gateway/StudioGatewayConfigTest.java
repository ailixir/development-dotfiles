package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.PropertyPlaceholderAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * Story 10.5 AC-2, AC-6: which client is active must be decidable from configuration, and an
 * enabled-but-incomplete gateway must stop the application rather than start degraded.
 */
class StudioGatewayConfigTest {

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(PropertyPlaceholderAutoConfiguration.class))
          .withUserConfiguration(StudioGatewayConfig.class);

  @Test
  void theDefaultIsTheDisabledClient() {
    runner.run(
        context ->
            assertThat(context)
                .hasNotFailed()
                .getBean(LlmGatewayClient.class)
                .isInstanceOf(DisabledLlmGatewayClient.class));
  }

  @Test
  void anExplicitFalseAlsoSelectsTheDisabledClient() {
    runner
        .withPropertyValues("studio.compile.gateway.enabled=false")
        .run(
            context ->
                assertThat(context)
                    .getBean(LlmGatewayClient.class)
                    .isInstanceOf(DisabledLlmGatewayClient.class));
  }

  @Test
  void theLocalPassthroughIsSelectedOnlyUnderTheLocalProfile() {
    runner
        .withPropertyValues(
            "studio.compile.gateway.local-passthrough=true", "spring.profiles.active=local")
        .run(
            context ->
                assertThat(context)
                    .hasNotFailed()
                    .getBean(LlmGatewayClient.class)
                    .isInstanceOf(LocalPassthroughGatewayClient.class));
  }

  @Test
  void theLocalPassthroughOutsideTheLocalProfileFailsStartup() {
    runner
        .withPropertyValues(
            "studio.compile.gateway.local-passthrough=true", "spring.profiles.active=worker,dev")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining(
                        "local-passthrough=true is only permitted under the local"));
  }

  @Test
  void theLocalProfileAloneStillSelectsTheDisabledClient() {
    runner
        .withPropertyValues("spring.profiles.active=local")
        .run(
            context ->
                assertThat(context)
                    .getBean(LlmGatewayClient.class)
                    .isInstanceOf(DisabledLlmGatewayClient.class));
  }

  @Test
  void anEnabledGatewayWithoutConfigurationFailsStartup() {
    runner
        .withPropertyValues("studio.compile.gateway.enabled=true")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("the gateway configuration is incomplete")
                    .hasMessageContaining("studio.compile.gateway.endpoint is required"));
  }

  @Test
  void anAbsentArtifactSchemaFailsStartup() {
    runner
        .withPropertyValues("studio.compile.gateway.artifact-schema=classpath:studio/absent.json")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("artifact-schema does not resolve"));
  }

  @Test
  void aMissingServiceAccountKeyFileIsReportedByPath() {
    StudioGatewayProperties properties =
        new StudioGatewayProperties(
            true,
            "https://r2d2.example.invalid",
            "project",
            "location",
            "model",
            new StudioGatewayProperties.Credentials(
                StudioGatewayProperties.MODE_SERVICE_ACCOUNT_FILE, "/nonexistent/key.json"),
            Duration.ofSeconds(5),
            1,
            1024,
            1024,
            true,
            0d,
            new StudioGatewayProperties.TransportRetry(0, Duration.ofMillis(1), 2d, 0d),
            "classpath:studio/artifact.schema.json");

    assertThatThrownBy(() -> VertexAiClientFactory.create(properties))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("service-account-key-file is not readable")
        .hasMessageContaining("/nonexistent/key.json");
  }
}
