package com.citi.put.checks.studio.gateway;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.translation.GenAiGuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedModelResponse;
import com.citi.put.checks.studio.guided.translation.GuidedResponseParser;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Wires the guided-authoring model transport (Story 10.5, AC-2, AC-6; ADR-SC-005).
 *
 * <p>Both guided client beans are selected by an explicit condition rather than bean ordering, so
 * which implementation is active is decidable from configuration alone. There is exactly one real
 * provider, Vertex AI; every other configuration answers {@code DISABLED} and never invents a
 * proposal.
 */
@Configuration
@EnableConfigurationProperties({
  StudioGatewayProperties.class,
  StudioGatewaySelectionProperties.class
})
public class StudioGatewayConfig {

  private static final String PREFIX = "studio.gateway";

  /**
   * The Vertex AI transport: the maintained Google Gen AI SDK in Vertex mode, with no legacy
   * fallback. Configuration is validated before any client is built.
   */
  @Bean(destroyMethod = "close")
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "vertex")
  public GenAiGatewayTransport genAiGatewayTransport(StudioGatewayProperties properties)
      throws IOException {
    return new GenAiGatewayTransport(properties);
  }

  @Bean
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "vertex")
  public GuidedLlmGatewayClient guidedLlmGatewayClient(
      GenAiGatewayTransport transport, ObjectProvider<MeterRegistry> registry) {
    return new GenAiGuidedLlmGatewayClient(
        transport,
        new GuidedResponseParser(new GuidedContracts()),
        registry.getIfAvailable(SimpleMeterRegistry::new));
  }

  /** Any provider other than Vertex answers DISABLED; nothing is synthesized. */
  @Bean
  @ConditionalOnExpression("'${studio.gateway.provider:disabled}' != 'vertex'")
  public GuidedLlmGatewayClient disabledGuidedLlmGatewayClient() {
    return (request, budget) ->
        new GuidedModelResponse(GuidedModelResponse.Code.DISABLED, null, null, null, null);
  }

  /** Fails deployed Studio startup when its core translation dependency is not Vertex AI. */
  @Bean
  public Object studioTranslationReadinessGuard(
      StudioGatewaySelectionProperties selection, Environment environment) {
    selection.selectedProvider();
    boolean deployed = environment.acceptsProfiles("staging", "prod");
    boolean studioEnabled = environment.getProperty("checks.sources.UI_TEST", Boolean.class, false);
    if (deployed
        && studioEnabled
        && selection.selectedProvider() != StudioGatewaySelectionProperties.Provider.VERTEX) {
      throw new IllegalStateException(
          "UI_TEST is enabled in a deployed profile but studio.gateway.provider is not vertex");
    }
    return new Object();
  }
}
