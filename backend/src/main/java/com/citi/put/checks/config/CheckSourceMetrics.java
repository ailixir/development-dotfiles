package com.citi.put.checks.config;

import com.citi.put.checks.checks.model.CheckType;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class CheckSourceMetrics {

  private final CheckSourceProperties sourceProperties;
  private final MeterRegistry registry;

  public CheckSourceMetrics(CheckSourceProperties sourceProperties, MeterRegistry registry) {
    this.sourceProperties = sourceProperties;
    this.registry = registry;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void registerGauges() {
    for (CheckType type : CheckType.values()) {
      boolean enabled = sourceProperties.isEnabled(type);
      registry.gauge("checks.sources.enabled", Tags.of("type", type.name()), enabled ? 1.0 : 0.0);
    }
  }
}
