package com.citi.put.checks.studio.compile.gateway;

import com.google.api.gax.core.NoCredentialsProvider;
import com.google.cloud.vertexai.VertexAI;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.ClassPathResource;

/** Shared fixtures for the gateway tests. Never contains a real endpoint or credential. */
final class GatewayTestSupport {

  /**
   * A marker planted inside a request's own source lines. The wire body must carry it — it is
   * source text — while the audit line, the diagnostic log and every returned failure reason must
   * not. Asserting on it is only meaningful when it is genuinely in the request, so it is reached
   * through {@link #requestWithCanaryInSource()} and never through a literal.
   */
  static final String CANARY = "CANARY-8f3c1d2e-not-a-real-secret";

  static final String SECRET_PLACEHOLDER = "<secret LOGIN_PW>";
  static final String PROJECT = "stub-project";
  static final String LOCATION = "stub-location";
  static final String MODEL = "stub-model";

  static final String VALID_ARTIFACT =
      "{\"version\":1,\"steps\":[{\"stepIndex\":0,"
          + "\"originalText\":\"Go to \\\"https://example.invalid\\\"\","
          + "\"code\":\"await page.goto('https://example.invalid');\"}]}";

  private GatewayTestSupport() {}

  static StudioGatewayProperties properties(String endpoint) {
    return properties(endpoint, Duration.ofSeconds(10), 4, 262144, 262144, 2);
  }

  static StudioGatewayProperties properties(
      String endpoint,
      Duration requestTimeout,
      int maxConcurrency,
      int maxInputBytes,
      int maxOutputBytes,
      int maxRetries) {
    return new StudioGatewayProperties(
        true,
        endpoint,
        PROJECT,
        LOCATION,
        MODEL,
        new StudioGatewayProperties.Credentials(StudioGatewayProperties.MODE_NONE, null),
        requestTimeout,
        maxConcurrency,
        maxInputBytes,
        maxOutputBytes,
        true,
        0d,
        new StudioGatewayProperties.TransportRetry(maxRetries, Duration.ofMillis(10), 2.0d, 0.5d),
        "classpath:studio/artifact.schema.json");
  }

  static VertexAI vertexAi(StudioGatewayProperties properties) throws IOException {
    return VertexAiClientFactory.create(properties, NoCredentialsProvider.create());
  }

  static GatewayResponseParser parser() {
    return new GatewayResponseParser(new ClassPathResource("studio/artifact.schema.json"));
  }

  /** A request whose source carries a secret placeholder, never a resolved value. */
  static CompileRequest request() {
    return request(
        List.of(
            "1. Go to \"https://example.invalid\"",
            "2. Type \"" + SECRET_PLACEHOLDER + "\" in the \"Password\" field"));
  }

  /**
   * A request carrying both the secret placeholder and the canary in its source lines (AC-10).
   *
   * <p>Index 2 is the canary line; error-path tests echo it back from the stub gateway.
   */
  static CompileRequest requestWithCanaryInSource() {
    return request(
        List.of(
            "1. Go to \"https://example.invalid\"",
            "2. Type \"" + SECRET_PLACEHOLDER + "\" in the \"Password\" field",
            "3. Assert the confirmation banner reads \"" + CANARY + "\""));
  }

  static CompileRequest request(List<String> sourceLines) {
    return new CompileRequest(
        UUID.fromString("11111111-2222-3333-4444-555555555555"),
        "CSI12345",
        "u-test-principal",
        "cr-0001",
        1,
        sourceLines,
        "PLAYWRIGHT SYNTAX REFERENCE (stub body)",
        "syntax-2026.09.0",
        "Return a JSON artifact conforming to the artifact contract.",
        "prompt-2026.09.0");
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
