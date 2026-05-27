package com.citi.put.checks.checks.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.net.URI;
import java.util.Map;
import java.util.Set;

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

  private static final Set<String> ALLOWED_METHODS =
      Set.of("GET", "POST", "PUT", "DELETE", "HEAD", "PATCH", "OPTIONS");

  public HttpConfiguration {
    if (type == null) {
      type = "HTTP";
    }
    if (url == null || url.isBlank()) {
      throw new IllegalArgumentException("HTTP url is required");
    }
    try {
      URI parsed = URI.create(url);
      if (parsed.getScheme() == null
          || (!parsed.getScheme().equalsIgnoreCase("http")
              && !parsed.getScheme().equalsIgnoreCase("https"))) {
        throw new IllegalArgumentException("HTTP url must use http or https scheme");
      }
    } catch (IllegalArgumentException e) {
      if (e.getMessage().startsWith("HTTP url")) {
        throw e;
      }
      throw new IllegalArgumentException("Invalid HTTP url: " + url);
    }
    if (method == null || method.isBlank()) {
      method = "GET";
    }
    method = method.toUpperCase();
    if (!ALLOWED_METHODS.contains(method)) {
      throw new IllegalArgumentException(
          "Unsupported HTTP method: " + method + ". Allowed: " + ALLOWED_METHODS);
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
    if (timeoutMs < 1000) {
      timeoutMs = 1000;
    }
    if (verifyTls == null) {
      verifyTls = true;
    }
  }
}
