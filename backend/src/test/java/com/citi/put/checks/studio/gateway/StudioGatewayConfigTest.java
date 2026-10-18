package com.citi.put.checks.studio.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedModelResponse;
import java.nio.file.NoSuchFileException;
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
        context -> {
          assertThat(context).hasNotFailed();
          assertDisabled(context.getBean(GuidedLlmGatewayClient.class));
        });
  }

  @Test
  void anExplicitDisabledProviderSelectsTheDisabledClient() {
    runner
        .withPropertyValues("studio.gateway.provider=disabled")
        .run(context -> assertDisabled(context.getBean(GuidedLlmGatewayClient.class)));
  }

  @Test
  void theLocalProfileAloneStillSelectsTheDisabledClient() {
    runner
        .withPropertyValues("spring.profiles.active=local")
        .run(context -> assertDisabled(context.getBean(GuidedLlmGatewayClient.class)));
  }

  @Test
  void vertexWithoutConfigurationFailsStartup() {
    runner
        .withPropertyValues("studio.gateway.provider=vertex")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("the gateway configuration is incomplete")
                    .hasMessageContaining("studio.gateway.endpoint is required"));
  }

  @Test
  void deployedStudioRefusesToAdvertiseTranslationWithoutVertex() {
    runner
        .withPropertyValues(
            "spring.profiles.active=staging",
            "checks.sources.UI_TEST=true",
            "studio.gateway.provider=disabled")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("UI_TEST is enabled")
                    .hasMessageContaining("provider is not vertex"));
  }

  @Test
  void unknownProviderFailsConfigurationValidation() {
    runner
        .withPropertyValues("studio.gateway.provider=surprise")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("must be one of disabled, vertex"));
  }

  @Test
  void aMissingServiceAccountKeyFileIsReportedByPath() {
    StudioGatewayProperties properties =
        new StudioGatewayProperties(
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
            1024,
            StudioGatewayProperties.ThinkingLevel.LOW,
            StudioGatewayProperties.ProviderFeatures.ALL);

    // The production transport opens the key file when it is built; the path is the report.
    assertThatThrownBy(() -> new GenAiGatewayTransport(properties))
        .isInstanceOf(NoSuchFileException.class)
        .hasMessageContaining("/nonexistent/key.json");
  }

  private static void assertDisabled(GuidedLlmGatewayClient client) {
    assertThat(client.propose(null, null).code()).isEqualTo(GuidedModelResponse.Code.DISABLED);
  }
}
