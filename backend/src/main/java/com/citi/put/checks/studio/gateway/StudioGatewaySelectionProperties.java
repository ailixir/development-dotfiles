package com.citi.put.checks.studio.gateway;

import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Selects the Studio guided-authoring model provider explicitly. */
@ConfigurationProperties(prefix = "studio.gateway")
public record StudioGatewaySelectionProperties(@DefaultValue("disabled") String provider) {

  public enum Provider {
    DISABLED,
    VERTEX
  }

  public Provider selectedProvider() {
    try {
      return Provider.valueOf(provider.trim().replace('-', '_').toUpperCase(Locale.ROOT));
    } catch (RuntimeException ignored) {
      throw new IllegalStateException(
          "studio.gateway.provider must be one of disabled, vertex but was " + provider);
    }
  }
}
