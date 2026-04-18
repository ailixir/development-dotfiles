package com.citi.put.checks.checks.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public record HttpConfiguration(
    @JsonProperty("type") String type,
    @JsonProperty("method") String method,
    @JsonProperty("url") String url,
    @JsonProperty("headers") Map<String, String> headers,
    @JsonProperty("body") String body,
    @JsonProperty("expectedStatusCode") Integer expectedStatusCode,
    @JsonProperty("followRedirects") Boolean followRedirects,
    @JsonProperty("timeoutMs") Integer timeoutMs,
    @JsonProperty("verifyTls") Boolean verifyTls)
    implements CheckConfiguration {
  public HttpConfiguration {
    if (type == null) {
      type = "HTTP";
    }
    if (expectedStatusCode == null) {
      expectedStatusCode = 200;
    }
    if (followRedirects == null) {
      followRedirects = true;
    }
    if (timeoutMs == null) {
      timeoutMs = 5000;
    }
    if (verifyTls == null) {
      verifyTls = true;
    }
  }
}
