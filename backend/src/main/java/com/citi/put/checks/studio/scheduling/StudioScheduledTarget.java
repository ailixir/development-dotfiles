package com.citi.put.checks.studio.scheduling;

import com.citi.put.checks.scheduling.ScheduledTarget;
import com.citi.put.checks.scheduling.SchedulingDelays;
import java.time.Duration;
import org.springframework.context.EmbeddedValueResolverAware;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;
import org.springframework.util.StringValueResolver;

/**
 * Studio contributes the same scheduling target port; its admission and runner pipeline stay owned.
 */
@Component
public class StudioScheduledTarget implements ScheduledTarget, EmbeddedValueResolverAware {
  private final StudioScheduleProcessor processor;
  private final StudioSchedulingProperties properties;
  private final Environment environment;
  private StringValueResolver valueResolver;

  @Override
  public void setEmbeddedValueResolver(StringValueResolver value) {
    valueResolver = value;
  }

  public StudioScheduledTarget(
      StudioScheduleProcessor processor,
      StudioSchedulingProperties properties,
      Environment environment) {
    this.processor = processor;
    this.properties = properties;
    this.environment = environment;
  }

  @Override
  public String targetId() {
    return "studio";
  }

  @Override
  public boolean enabled() {
    return properties.isEnabled()
        && environment.acceptsProfiles(Profiles.of("worker | (local & !api)"));
  }

  @Override
  public Duration pollInterval() {
    String value = properties.getPollIntervalMs();
    return SchedulingDelays.positive(
        valueResolver == null ? value : valueResolver.resolveStringValue(value));
  }

  @Override
  public Duration initialDelay() {
    return Duration.ZERO;
  }

  @Override
  public void pollAndDispatch() {
    if (enabled()) {
      processor.poll();
    }
  }
}
