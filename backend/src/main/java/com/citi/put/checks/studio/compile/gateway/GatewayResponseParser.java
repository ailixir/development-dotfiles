package com.citi.put.checks.studio.compile.gateway;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.io.IOException;
import java.io.InputStream;
import java.util.Comparator;
import java.util.Optional;
import java.util.Set;
import org.springframework.core.io.Resource;

/**
 * Defensive parsing of a gateway answer into a schema-valid artifact document (Story 10.5, AC-7).
 *
 * <p>No code path assumes the proxy honoured the requested schema — SPK-01 explicitly leaves R2D2's
 * structured-output behaviour unverified — so structured and plain-text answers go through exactly
 * the same extraction and validation.
 */
public class GatewayResponseParser {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final int MAX_REASON_LENGTH = 300;

  private final JsonSchema schema;

  /**
   * @param artifactSchema the artifact JSON schema resource; must exist at startup
   */
  public GatewayResponseParser(Resource artifactSchema) {
    try (InputStream in = artifactSchema.getInputStream()) {
      JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
      this.schema = factory.getSchema(in);
    } catch (IOException e) {
      throw new IllegalStateException(
          "Unable to load the artifact schema from " + artifactSchema.getDescription(), e);
    }
  }

  /**
   * Result of one parse: either an artifact document or a reason, never both.
   *
   * @param artifactJson canonical artifact JSON when valid
   * @param failureReason scrubbed reason, prefixed with the failing schema path when applicable
   */
  public record ParseResult(String artifactJson, String failureReason) {

    public boolean isValid() {
      return artifactJson != null;
    }

    static ParseResult valid(String artifactJson) {
      return new ParseResult(artifactJson, null);
    }

    static ParseResult invalid(String reason) {
      return new ParseResult(null, reason);
    }
  }

  /**
   * Extracts the JSON document from a gateway answer and validates it against the artifact schema.
   *
   * @param responseText raw text returned by the gateway; may be pure JSON, fenced JSON or prose
   * @return a valid artifact or the reason it was rejected
   */
  public ParseResult parse(String responseText) {
    if (responseText == null || responseText.isBlank()) {
      return ParseResult.invalid("empty gateway response");
    }
    Optional<String> extracted = extractJsonDocument(responseText);
    if (extracted.isEmpty()) {
      return ParseResult.invalid("no JSON document found in the gateway response");
    }
    JsonNode node;
    try {
      node = MAPPER.readTree(extracted.get());
    } catch (JsonProcessingException e) {
      return ParseResult.invalid("malformed JSON: " + truncate(e.getOriginalMessage()));
    }
    Set<ValidationMessage> violations = schema.validate(node);
    if (!violations.isEmpty()) {
      ValidationMessage first =
          violations.stream()
              .min(Comparator.comparing(v -> String.valueOf(v.getInstanceLocation())))
              .orElseThrow();
      return ParseResult.invalid(
          "schema violation at "
              + first.getInstanceLocation()
              + ": "
              + truncate(first.getMessage()));
    }
    return ParseResult.valid(node.toString());
  }

  /**
   * Finds the artifact document inside an answer that may be pure JSON, a fenced block or prose
   * with an embedded object. Brace scanning is string- and escape-aware so a brace inside {@code
   * originalText} does not truncate the document.
   */
  private static Optional<String> extractJsonDocument(String text) {
    String trimmed = text.strip();
    int fenceStart = trimmed.indexOf("```");
    if (fenceStart >= 0) {
      int bodyStart = trimmed.indexOf('\n', fenceStart);
      int fenceEnd = bodyStart < 0 ? -1 : trimmed.indexOf("```", bodyStart);
      if (bodyStart > 0 && fenceEnd > bodyStart) {
        Optional<String> fenced = scanBalancedObject(trimmed.substring(bodyStart, fenceEnd));
        if (fenced.isPresent()) {
          return fenced;
        }
      }
    }
    return scanBalancedObject(trimmed);
  }

  private static Optional<String> scanBalancedObject(String text) {
    int start = text.indexOf('{');
    if (start < 0) {
      return Optional.empty();
    }
    int depth = 0;
    boolean inString = false;
    boolean escaped = false;
    for (int i = start; i < text.length(); i++) {
      char c = text.charAt(i);
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c == '\\') {
          escaped = true;
        } else if (c == '"') {
          inString = false;
        }
        continue;
      }
      if (c == '"') {
        inString = true;
      } else if (c == '{') {
        depth++;
      } else if (c == '}') {
        depth--;
        if (depth == 0) {
          return Optional.of(text.substring(start, i + 1));
        }
      }
    }
    return Optional.empty();
  }

  private static String truncate(String value) {
    if (value == null) {
      return "";
    }
    String single = value.replaceAll("\\s+", " ").strip();
    return single.length() <= MAX_REASON_LENGTH
        ? single
        : single.substring(0, MAX_REASON_LENGTH) + "...";
  }
}
