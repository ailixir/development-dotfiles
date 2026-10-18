package com.citi.put.checks.studio.guided.publication;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** Same pins, verifier and dispatch authorization on API and worker pods. */
@Configuration
@EnableConfigurationProperties(ObservedReplayProperties.class)
public class ObservedReplayRuntimeConfiguration {
  @Bean
  GuidedPublicationRepository publications(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      org.springframework.beans.factory.ObjectProvider<GuidedPublicationEvidenceRepository>
          evidence) {
    // Lazy internal composition avoids the immutable base verifier -> publications cycle.
    return new GuidedPublicationRepository(jdbc, contracts, evidence::getObject);
  }

  @Bean
  ObservedReplayPins observedReplayPins(
      GuidedContracts contracts, ObservedReplayProperties properties) {
    return new ObservedReplayPins(contracts, properties);
  }

  @Bean
  ObservedRevisionVerifier observedRevisionVerifier(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      GuidedPublicationRepository publications,
      ObservedReplayPins pins,
      ObservedReplayProperties properties) {
    return new ObservedRevisionVerifier(jdbc, contracts, publications, pins, properties);
  }

  @Bean
  ObservedReplayAuthorization observedReplayAuthorization(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      ObservedRevisionVerifier verifier,
      ObservedReplayPins pins,
      StudioReferenceResolver references,
      ObservedReplayProperties properties,
      StudioExecutionProperties execution) {
    return new ObservedReplayAuthorization(
        jdbc,
        contracts,
        verifier,
        pins,
        references,
        properties,
        execution,
        new DatabaseClock(jdbc));
  }
}
