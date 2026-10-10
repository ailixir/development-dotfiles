package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.compile.CredentialPatternScreen;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
@EnableConfigurationProperties(GuidedTranslationProperties.class)
public class GuidedTranslationConfiguration {
  @Bean
  GuidedTranslationStore guidedTranslationStore(JdbcTemplate jdbc, GuidedContracts contracts) {
    return new GuidedTranslationStore(jdbc, contracts);
  }

  @Bean
  GuidedSourceSnapshotRepository guidedSourceSnapshots(
      StudioRepository tests, GuidedContracts contracts) {
    return new GuidedSourceSnapshotRepository(tests, contracts);
  }

  @Bean
  GuidedClarificationContextStore guidedQuestionContexts(
      JdbcTemplate jdbc, GuidedContracts contracts) {
    return new GuidedClarificationContextStore(jdbc, contracts);
  }

  @Bean
  GuidedSourceClassifier guidedSourceClassifier(
      GuidedContracts contracts,
      GuidedTranslationProperties properties,
      CredentialPatternScreen screen) {
    return new GuidedSourceClassifier(contracts, properties, screen);
  }

  @Bean
  GuidedSourceInputResolver guidedSourceInputs(GuidedContracts contracts) {
    return new GuidedSourceInputResolver(contracts);
  }

  @Bean
  GuidedStepVerifier guidedStepVerifier(GuidedTranslationStore store) {
    return new GuidedStepVerifier(store);
  }

  @Bean
  GuidedResponseParser guidedResponseParser(GuidedContracts contracts) {
    return new GuidedResponseParser(contracts);
  }

  @Bean
  GuidedProposalValidator guidedProposalValidator(GuidedContracts contracts) {
    return new GuidedProposalValidator(contracts);
  }

  @Bean
  GuidedPromptAssembler guidedPromptAssembler(GuidedContracts contracts) {
    return new GuidedPromptAssembler(contracts);
  }

  @Bean
  GuidedDependencyPlanner guidedDependencyPlanner(GuidedSessionService sessions) {
    return new GuidedDependencyPlanner(sessions);
  }

  @Bean
  @ConditionalOnProperty(name = "studio.guided-authoring.translation.enabled", havingValue = "true")
  GuidedTranslationService guidedTranslationService(
      GuidedSessionService sessions,
      GuidedSessionRepository repository,
      GuidedTranslationStore store,
      GuidedClarificationContextStore questions,
      GuidedDispatchService dispatch,
      GuidedLlmGatewayClient gateway,
      GuidedContracts contracts,
      GuidedPromptAssembler prompts,
      GuidedSourceInputResolver inputs,
      GuidedProposalValidator validator,
      GuidedDependencyPlanner dependencies,
      GuidedTranslationProperties properties,
      JdbcTemplate jdbc) {
    var service =
        new GuidedTranslationService(
            sessions,
            repository,
            store,
            questions,
            dispatch,
            gateway,
            contracts,
            prompts,
            inputs,
            validator,
            dependencies,
            properties,
            Clock.systemUTC());
    service.installDatabase(jdbc);
    return service;
  }

  @Bean
  @ConditionalOnProperty(name = "studio.guided-authoring.translation.enabled", havingValue = "true")
  GuidedTranslationCoordinator guidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      @Value("${studio.guided-authoring.translation.controller-origin}") String origin,
      @Value(
              "${studio.guided-authoring.translation.controller-token-file:${stu"
                  + "dio.guided-authoring.controller-token-file}}")
          String token)
      throws java.security.NoSuchAlgorithmException {
    return new GuidedTranslationCoordinator(
        store, sessions, contracts, java.net.URI.create(origin), java.nio.file.Path.of(token));
  }
}
