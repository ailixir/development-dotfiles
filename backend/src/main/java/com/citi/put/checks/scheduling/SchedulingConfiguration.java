package com.citi.put.checks.scheduling;

import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Neutral time infrastructure is available without a Studio feature module or enabled target. */
@Configuration
public class SchedulingConfiguration {
  @Bean
  @ConditionalOnMissingBean(Clock.class)
  public Clock schedulingClock() {
    return Clock.systemUTC();
  }

  @Bean
  @ConditionalOnMissingBean(SchedulingTicker.class)
  public SchedulingTicker schedulingTicker() {
    return System::nanoTime;
  }
}
