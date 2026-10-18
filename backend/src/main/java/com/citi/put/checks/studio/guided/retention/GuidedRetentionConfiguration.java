package com.citi.put.checks.studio.guided.retention;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Wires the guided observation pruner (STUDIO-OBS-014 AC-3). */
@Configuration
@EnableConfigurationProperties(GuidedRetentionProperties.class)
public class GuidedRetentionConfiguration {

  @Bean
  GuidedObservationPruner guidedObservationPruner(
      JdbcTemplate jdbc, PlatformTransactionManager manager, GuidedRetentionProperties properties) {
    return new GuidedObservationPruner(jdbc, new TransactionTemplate(manager), properties);
  }
}
