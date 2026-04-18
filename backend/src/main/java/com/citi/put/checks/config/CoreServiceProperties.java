package com.citi.put.checks.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "checks.core-service")
public record CoreServiceProperties(
    @DefaultValue("http://localhost:8081") String baseUrl, @DefaultValue Timeout timeout) {
  public record Timeout(@DefaultValue("2000") int connectMs, @DefaultValue("3000") int readMs) {}
}
