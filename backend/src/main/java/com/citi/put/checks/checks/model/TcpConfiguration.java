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
  }
}
