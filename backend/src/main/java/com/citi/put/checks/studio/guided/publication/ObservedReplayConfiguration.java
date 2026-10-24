package com.citi.put.checks.studio.guided.publication;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
@Profile("!worker")
public class ObservedReplayConfiguration {
  @Bean
  ObservedReplayAuthorizer observedReplayAuthorizer(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      ObservedRevisionVerifier verifier,
      ObservedReplayPins pins,
      com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization,
      ObservedReplayProperties properties) {
    return new ObservedReplayAuthorizer(
        jdbc, contracts, verifier, pins, authorization, properties, new DatabaseClock(jdbc));
  }
}
