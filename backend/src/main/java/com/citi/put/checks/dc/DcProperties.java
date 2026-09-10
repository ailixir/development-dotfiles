package com.citi.put.checks.dc;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "checks.dc")
public record DcProperties(
    @DefaultValue("true") boolean enabled,
    @DefaultValue("http://localhost:9091") String baseUrl,
    @DefaultValue("/api/v1/execute") String executePath,
    @DefaultValue Auth auth,
    @DefaultValue Timeout timeout) {

  public record Auth(
      @DefaultValue("none") String mode,
      String username,
      String password,
      String token,
      @DefaultValue("X-Api-Key") String headerName,
      String headerValue) {}

  public record Timeout(@DefaultValue("3000") int connectMs, @DefaultValue("60000") int readMs) {}
}
