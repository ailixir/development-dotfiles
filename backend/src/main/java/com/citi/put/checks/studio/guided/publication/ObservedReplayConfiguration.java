package com.citi.put.checks.studio.guided.publication;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.account.ReplayAccountAccess;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

/** Ordinary replay has concrete authorization; only account connection remains a later provider. */
@Configuration
@Profile("!worker")
public class ObservedReplayConfiguration {
  @Bean
  @ConditionalOnMissingBean(ReplayAccountAccess.class)
  ReplayAccountAccess replayAccountAccess() {
    return ReplayAccountAccess.unavailable();
  }

  @Bean
  ObservedReplayAuthorization observedReplayAuthorization(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      ObservedRevisionVerifier verifier,
      ObservedReplayPins pins,
      GuidedPublicationAuthorization authorization,
      ReplayAccountAccess accounts,
      ObservedReplayProperties properties,
      StudioExecutionProperties execution) {
    return new ObservedReplayAuthorization(
        jdbc,
        contracts,
        verifier,
        pins,
        authorization,
        accounts,
        properties,
        execution,
        Clock.systemUTC());
  }
}
