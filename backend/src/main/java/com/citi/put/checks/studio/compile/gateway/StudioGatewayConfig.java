package com.citi.put.checks.studio.compile.gateway;

import com.google.genai.Client;
import java.io.IOException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;

/**
 * Wires the gateway package (Story 10.5, AC-2, AC-6).
 *
 * <p>Both client beans are selected by an explicit {@code @ConditionalOnProperty} rather than
 * bean-ordering, so which implementation is active is decidable from configuration alone.
 */
@Configuration
@EnableConfigurationProperties(StudioGatewayProperties.class)
public class StudioGatewayConfig {

  private static final String PREFIX = "studio.compile.gateway";

  @Bean
  public GatewayAuditLogger gatewayAuditLogger() {
    return new GatewayAuditLogger();
  }

  @Bean
  public GatewayResponseParser gatewayResponseParser(
      StudioGatewayProperties properties, ApplicationContext applicationContext) {
    Resource schema = applicationContext.getResource(properties.artifactSchema());
    if (!schema.exists()) {
      throw new IllegalStateException(
          PREFIX
              + ".artifact-schema does not resolve to an existing resource: "
              + properties.artifactSchema());
    }
    return new GatewayResponseParser(schema);
  }

  /** Fails startup with one message listing every missing value when the gateway is on (AC-2). */
  @Bean(destroyMethod = "close")
  @ConditionalOnProperty(prefix = PREFIX, name = "enabled", havingValue = "true")
  public Client studioGatewayVertexAi(StudioGatewayProperties properties) throws IOException {
    properties.validateForEnabled();
    return VertexAiClientFactory.create(properties);
  }

  @Bean
  @ConditionalOnProperty(prefix = PREFIX, name = "enabled", havingValue = "true")
  public LlmGatewayClient vertexLlmGatewayClient(
      StudioGatewayProperties properties,
      Client studioGatewayVertexAi,
      GatewayResponseParser parser,
      GatewayAuditLogger auditLogger) {
    return new VertexLlmGatewayClient(properties, studioGatewayVertexAi, parser, auditLogger);
  }

  @Bean
  @ConditionalOnProperty(
      prefix = PREFIX,
      name = "enabled",
      havingValue = "false",
      matchIfMissing = true)
  public LlmGatewayClient disabledLlmGatewayClient(GatewayAuditLogger auditLogger) {
    return new DisabledLlmGatewayClient(auditLogger);
  }
}
