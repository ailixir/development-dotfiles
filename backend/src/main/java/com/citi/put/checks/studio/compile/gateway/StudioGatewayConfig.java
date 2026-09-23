package com.citi.put.checks.studio.compile.gateway;

import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.io.Resource;

/**
 * Wires the gateway package (Story 10.5, AC-2, AC-6).
 *
 * <p>Both client beans are selected by an explicit {@code @ConditionalOnProperty} rather than
 * bean-ordering, so which implementation is active is decidable from configuration alone.
 */
@Configuration
@EnableConfigurationProperties({
  StudioGatewayProperties.class,
  StudioGatewaySelectionProperties.class
})
public class StudioGatewayConfig {

  private static final String PREFIX = "studio.compile.gateway";
  private static final String RECORDED_FIXTURES = "classpath*:studio/recorded-fixtures/*.json";
  private static final Logger LOG = LoggerFactory.getLogger(StudioGatewayConfig.class);

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

  /**
   * The Vertex AI provider: the maintained Google Gen AI SDK in Vertex mode, with no legacy
   * fallback. Configuration is validated before any client is built.
   */
  @Bean(destroyMethod = "close")
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "vertex")
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
      name = "provider",
      havingValue = "disabled",
      matchIfMissing = true)
  public LlmGatewayClient disabledLlmGatewayClient(GatewayAuditLogger auditLogger) {
    return new DisabledLlmGatewayClient(auditLogger);
  }

  /**
   * Answers recorded sources from a corpus, for local development and CI without a credential.
   *
   * <p>Fails startup when the corpus is empty, so a misconfigured local environment is a startup
   * error rather than a Studio that silently refuses every translation.
   *
   * @param auditLogger the gateway audit log
   * @param applicationContext used to resolve the fixture resources
   * @return the recorded-fixture client
   * @throws IOException when the fixture resources cannot be listed
   */
  @Bean
  @ConditionalOnProperty(prefix = PREFIX, name = "provider", havingValue = "recorded-fixture")
  public LlmGatewayClient recordedFixtureLlmGatewayClient(
      GatewayAuditLogger auditLogger, ApplicationContext applicationContext) throws IOException {
    Resource[] fixtures = applicationContext.getResources(RECORDED_FIXTURES);
    RecordedFixtureCorpus corpus = RecordedFixtureCorpus.load(fixtures);
    if (corpus.size() == 0) {
      throw new IllegalStateException(
          PREFIX
              + ".provider=recorded-fixture but no fixture was found at "
              + RECORDED_FIXTURES
              + "; Studio would refuse every translation");
    }
    LOG.info(
        "studio translation provider is a recorded fixture corpus, not a model: {} recorded"
            + " sources {}",
        corpus.size(),
        corpus.names());
    return new RecordedFixtureGatewayClient(corpus, auditLogger);
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
          "UI_TEST is enabled in a deployed profile but studio.compile.gateway.provider is not vertex");
    }
    return new Object();
  }
}
