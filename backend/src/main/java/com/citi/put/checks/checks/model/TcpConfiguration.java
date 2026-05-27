package com.citi.put.checks.checks.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public record TcpConfiguration(
    @JsonProperty("type") String type,
    @JsonProperty("host") String host,
    @JsonProperty("port") int port,
    @JsonProperty("timeoutMs") Integer timeoutMs)
    implements CheckConfiguration {
  public TcpConfiguration {
    if (type == null) {
      type = "TCP";
    }
    if (timeoutMs == null) {
      timeoutMs = 5000;
    }
    if (timeoutMs < 1000) {
      timeoutMs = 1000;
    }
    if (host == null || host.isBlank()) {
      throw new IllegalArgumentException("TCP host is required");
    }
    if (port <= 0 || port > 65535) {
      throw new IllegalArgumentException("TCP port must be between 1 and 65535");
    }
  }
}
