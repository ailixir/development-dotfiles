package com.citi.put.checks.studio.guided.session;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration
@EnableConfigurationProperties(GuidedSessionProperties.class)
public class GuidedSessionConfiguration {
  @Bean
  GuidedContracts guidedContracts() {
    return new GuidedContracts();
  }

  @Bean
  GuidedSessionRepository guidedSessionRepository(
      JdbcTemplate jdbc, PlatformTransactionManager manager, GuidedContracts contracts) {
    return new GuidedSessionRepository(jdbc, new TransactionTemplate(manager), contracts);
  }

  @Bean
  GuidedSessionService guidedSessionService(
      GuidedSessionRepository repository,
      GuidedContracts contracts,
      GuidedSessionAccess access,
      GuidedSessionProperties properties,
      JdbcTemplate jdbc,
      com.citi.put.checks.studio.guided.translation.GuidedTranslationStore translation,
      com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore questions) {
    var service =
        new GuidedSessionService(repository, contracts, access, properties, Clock.systemUTC());
    var materialization =
        new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(jdbc, contracts);
    service.installBridge(
        materialization,
        new com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore(jdbc, contracts),
        new com.citi.put.checks.studio.guided.bridge.GuidedBindingStore(
            jdbc, contracts, materialization),
        new com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore(jdbc, contracts));
    service.installTranslation(translation, questions);
    return service;
  }

  @Bean
  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
      name = "studio.guided-authoring.runner-origin")
  com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient guidedRunnerClient(
      @org.springframework.beans.factory.annotation.Value(
              "${studio.guided-authoring.runner-origin}")
          String origin,
      @org.springframework.beans.factory.annotation.Value(
              "${studio.guided-authoring.controller-token-file}")
          String tokenFile,
      GuidedContracts contracts)
      throws java.security.NoSuchAlgorithmException {
    return new com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient(
        java.net.URI.create(origin),
        javax.net.ssl.SSLContext.getDefault(),
        () -> {
          try {
            return java.nio.file.Files.readString(java.nio.file.Path.of(tokenFile)).strip();
          } catch (java.io.IOException failure) {
            throw new GuidedSessionException("UNAUTHENTICATED", 401);
          }
        },
        contracts);
  }

  @Bean
  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
      name = "studio.guided-authoring.runner-origin")
  com.citi.put.checks.studio.guided.bridge.GuidedDispatchService guidedDispatchService(
      GuidedSessionService sessions,
      com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient runner,
      JdbcTemplate jdbc,
      GuidedContracts contracts) {
    var dispatch =
        new com.citi.put.checks.studio.guided.bridge.GuidedDispatchService(
            sessions,
            new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(
                jdbc, contracts),
            runner);
    sessions.installStopSender(dispatch::stop);
    return dispatch;
  }

  /**
   * Only the account connection remains a later fail-closed port. Source and verification are real.
   */
  @Bean
  @ConditionalOnMissingBean(
      com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess.AccountAccess
          .class)
  com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess.AccountAccess
      guidedAccountAccess() {
    return new com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess
        .AccountAccess() {
      @Override
      public GuidedSessionAccess.Snapshot resolve(Authentication user, JsonNode start) {
        throw new GuidedSessionException("AUTH_CONNECTION_REQUIRED", 409);
      }

      @Override
      public void checkCurrent(JsonNode session) {
        throw new GuidedSessionException("AUTH_CONNECTION_REQUIRED", 409);
      }
    };
  }

  @Bean
  @ConditionalOnMissingBean(GuidedSessionAccess.class)
  GuidedSessionAccess guidedProductionAccess(
      com.citi.put.checks.studio.guided.translation.GuidedSourceSnapshotRepository snapshots,
      com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier classifier,
      com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver resolver,
      com.citi.put.checks.studio.guided.translation.GuidedTranslationStore store,
      com.citi.put.checks.studio.guided.translation.GuidedStepVerifier verifier,
      CsiOwnershipEvaluator ownership,
      com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess.AccountAccess
          accounts) {
    return new com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess(
        snapshots, classifier, resolver, store, verifier, ownership, accounts);
  }
}
