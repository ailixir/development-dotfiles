package com.citi.put.checks.studio.gateway;

import java.time.Duration;

/** Shared fixtures for the gateway tests. Never contains a real endpoint or credential. */
final class GatewayTestSupport {

  static final String PROJECT = "stub-project";
  static final String LOCATION = "stub-location";
  static final String MODEL = "stub-model";

  private GatewayTestSupport() {}

  static StudioGatewayProperties properties(String endpoint) {
    return properties(endpoint, Duration.ofSeconds(10), 4, 262144, 262144);
  }

  static StudioGatewayProperties properties(
      String endpoint,
      Duration requestTimeout,
      int maxConcurrency,
      int maxInputBytes,
      int maxOutputBytes) {
    return new StudioGatewayProperties(
        endpoint,
        PROJECT,
        LOCATION,
        MODEL,
        // Loopback stubs only: `none` is refused for any non-loopback endpoint.
        new StudioGatewayProperties.Credentials(StudioGatewayProperties.MODE_NONE, null),
        requestTimeout,
        maxConcurrency,
        maxInputBytes,
        maxOutputBytes,
        StudioGatewayProperties.DEFAULT_MAX_OUTPUT_TOKENS,
        StudioGatewayProperties.ThinkingLevel.LOW,
        StudioGatewayProperties.ProviderFeatures.ALL);
  }

  /** A deadline-only transport budget over a {@link CredentialBudget}. */
  static GenAiGatewayTransport.Budget budget(CredentialBudget deadline) {
    return new GenAiGatewayTransport.Budget() {
      @Override
      public Duration remaining() {
        return deadline.remaining();
      }

      @Override
      public AutoCloseable onCancel(Runnable action) {
        Runnable remove = deadline.onCancel(action);
        return remove::run;
      }
    };
  }

  /** A Vertex {@code generateContent} response body carrying the given model text. */
  static String generateContentBody(String modelText) {
    return "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\""
        + escape(modelText)
        + "\"}]},\"finishReason\":\"STOP\"}],\"modelVersion\":\"stub-model-001\"}";
  }

  private static String escape(String value) {
    StringBuilder out = new StringBuilder(value.length() + 16);
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> out.append(c);
      }
    }
    return out.toString();
  }
}
