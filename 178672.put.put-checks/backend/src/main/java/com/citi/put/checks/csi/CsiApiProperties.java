package com.citi.put.checks.csi;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "checks.csi")
public record CsiApiProperties(
    @DefaultValue("local") String provider,
    @DefaultValue("http://localhost:9090") String baseUrl,
    @DefaultValue Timeout timeout) {
  public record Timeout(@DefaultValue("2000") int connectMs, @DefaultValue("5000") int readMs) {}
}
