package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.dispatch.StudioRunnerTls;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
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
      GuidedContracts contracts, CredentialPatternScreen screen, GuidedPromptAssembler prompts) {
    return new GuidedSourceClassifier(contracts, screen, prompts);
  }

  @Bean
  GuidedSourceInputResolver guidedSourceInputs(GuidedContracts contracts, AllowedDomains domains) {
    return new GuidedSourceInputResolver(contracts, domains);
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
  GuidedPromptAssembler guidedPromptAssembler(GuidedContracts contracts, AllowedDomains domains) {
    return GuidedPromptAssembler.createForProductionFactory(contracts, domains);
  }

  @Bean
  GuidedDependencyPlanner guidedDependencyPlanner(GuidedSessionService sessions) {
    return new GuidedDependencyPlanner(sessions);
  }

  @Bean
  @ConditionalOnProperty(
      name = "studio.guided-authoring.translation.enabled",
      havingValue = "true",
      matchIfMissing = true)
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
        GuidedTranslationService.fromPureAssemblerFactory(
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

  /**
   * The durable continuation timer. A class-level {@code @Profile} on the coordinator would be
   * ignored (it is a bean method, not a scanned component), so the gate sits here: scheduler role
   * only, the same expression as {@code SchedulingCoordinator} (STUDIO-OBS-009 AC-5, ruling A5). It
   * reaches the API over HTTP ({@code controller-origin}), so it does not need to share a pod with
   * it. Spring closes it on shutdown, which interrupts the continuations it has in flight.
   */
  @Bean
  @Profile("!api | worker")
  @ConditionalOnProperty(
      name = "studio.guided-authoring.translation.enabled",
      havingValue = "true",
      matchIfMissing = true)
  GuidedTranslationCoordinator guidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      @Value(
              "${studio.guided-authoring.translation.controller-origin:https://unconfigured.invalid}")
          String origin,
      @Value(
              "${studio.guided-authoring.translation.controller-token-file:${stu"
                  + "dio.guided-authoring.controller-token-file:}}")
          String token,
      StudioRunnerTls tls,
      GuidedTranslationProperties properties) {
    return new GuidedTranslationCoordinator(
        store,
        sessions,
        contracts,
        java.net.URI.create(origin),
        java.nio.file.Path.of(token),
        tls,
        properties);
  }
}
