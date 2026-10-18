package com.citi.put.checks.studio.guided.policy;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Wires the governed observation policy (STUDIO-OBS-014 AC-1). */
@Configuration
@EnableConfigurationProperties(GuidedPolicyProperties.class)
public class GuidedPolicyConfiguration {

  @Bean
  ObservationPolicyRepository observationPolicyRepository(
      JdbcTemplate jdbc, GuidedContracts contracts) {
    return new ObservationPolicyRepository(jdbc, contracts);
  }

  @Bean
  ObservationPolicyService observationPolicyService(
      ObservationPolicyRepository repository,
      GuidedContracts contracts,
      CsiOwnershipEvaluator ownership,
      ObservedReplayPins pins,
      GuidedPolicyProperties properties,
      PlatformTransactionManager manager) {
    return new ObservationPolicyService(
        repository, contracts, ownership, pins, properties, new TransactionTemplate(manager));
  }
}
