package com.citi.put.checks.studio.compile.gateway;

import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Selects the Studio translation provider explicitly. */
@ConfigurationProperties(prefix = "studio.compile.gateway")
public record StudioGatewaySelectionProperties(@DefaultValue("disabled") String provider) {

  public enum Provider {
    DISABLED,
    VERTEX,
    RECORDED_FIXTURE
  }

  public Provider selectedProvider() {
    try {
      return Provider.valueOf(provider.trim().replace('-', '_').toUpperCase(Locale.ROOT));
    } catch (RuntimeException ignored) {
      throw new IllegalStateException(
          "studio.compile.gateway.provider must be one of disabled, vertex, recorded-fixture"
              + " but was "
              + provider);
    }
  }
}
