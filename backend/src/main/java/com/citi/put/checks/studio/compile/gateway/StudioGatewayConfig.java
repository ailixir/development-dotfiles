package com.citi.put.checks.studio.compile.gateway;

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

  /** Enabled production path uses the maintained SDK; no legacy fallback. */
  @Bean(destroyMethod = "close")
  @ConditionalOnProperty(prefix = PREFIX, name = "enabled", havingValue = "true")
  public GenAiLlmGatewayClient vertexLlmGatewayClient(
      StudioGatewayProperties properties,
      GatewayResponseParser parser,
      GatewayAuditLogger auditLogger)
      throws IOException {
    return new GenAiLlmGatewayClient(properties, parser, auditLogger);
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
