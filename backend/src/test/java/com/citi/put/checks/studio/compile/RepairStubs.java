package com.citi.put.checks.studio.compile;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * The stub wiring shared by every story 10.9 repair test.
 *
 * <p>Top-level and imported rather than nested, deliberately: Spring Boot's {@code
 * ImportsContextCustomizer} keys the application-context cache on the set of imported classes, so
 * every test class that imports exactly this one shares a single context. A nested {@code
 * &#64;TestConfiguration} per test class would build a fresh Spring context and a fresh embedded
 * PostgreSQL for each of them.
 */
@TestConfiguration
public class RepairStubs {

  @Bean
  @Primary
  ScriptedRepairGateway scriptedRepairGateway() {
    return new ScriptedRepairGateway();
  }
}
