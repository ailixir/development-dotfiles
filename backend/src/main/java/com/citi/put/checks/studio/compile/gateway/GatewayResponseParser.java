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

  /**
   * The only artifact schema version this backend can hand to the runner.
   *
   * <p>The frozen schema constrains {@code version} to {@code integer, minimum 1} so that a future
   * V2 document is still schema-valid. That deliberately leaves {@code version: 2} acceptable to
   * the validator, which is not the same as executable here: nothing downstream understands a V2
   * artifact. The parser is the defensive boundary against gateway output, so it pins the version
   * it can actually consume rather than inheriting the schema's forward-compatible range.
   *
   * <p>Public since story 10.8: the compile pipeline re-asserts this same pin on whatever artifact
   * it is handed, records it as {@code ui_test_revisions.artifact_schema_version}, and the
   * readiness gate re-asserts it again before every execute (10.8 AC-10, AC-25). One constant, read
   * by all four, so there is no second place for the supported version to be decided.
   */
  public static final int SUPPORTED_ARTIFACT_VERSION =
      com.citi.put.checks.studio.compile.CompilePins.SUPPORTED_ARTIFACT_VERSION;

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
   * <p>Schema validity is necessary but not sufficient: the document must also declare {@link
   * #SUPPORTED_ARTIFACT_VERSION}, which the schema alone does not require.
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
    JsonNode version = node.path("version");
    if (version.intValue() != SUPPORTED_ARTIFACT_VERSION) {
      return ParseResult.invalid(
          "unsupported artifact version at $.version: expected "
              + SUPPORTED_ARTIFACT_VERSION
              + " but the gateway returned "
              + version.intValue());
    }
    return ParseResult.valid(node.toString());
  }

  /** Strict proposal envelope acceptance; never extracts JSON from prose or fences. */
  public ParseResult parseProposal(String text, String kind, java.util.List<java.util.UUID> ids) {
    if (text == null || text.isBlank()) {
      return ParseResult.invalid("empty model envelope");
    }
    try {
      ObjectMapper strict = new ObjectMapper();
      strict.enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
      strict.enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
      JsonNode root = strict.readTree(text);
      if (!keys(root, Set.of("version", "kind", "steps"))
          || !root.path("version").isIntegralNumber()
          || !root.path("version").canConvertToInt()
          || root.path("version").intValue() != 1
          || !root.path("kind").isTextual()
          || !kind.equals(root.path("kind").textValue())
          || !root.path("steps").isArray()
          || root.path("steps").size() != ids.size()
          || ids.isEmpty()
          || ids.size() > 100) {
        return ParseResult.invalid("invalid model envelope shape or coverage");
      }
      java.util.Set<java.util.UUID> seen = new java.util.HashSet<>();
      for (int i = 0; i < ids.size(); i++) {
        JsonNode step = root.path("steps").get(i);
        if (!step.path("stepId").isTextual()
            || !ids.get(i).toString().equals(step.path("stepId").textValue())
            || !seen.add(ids.get(i))) {
          return ParseResult.invalid("invalid model step identity or order");
        }
        String status = step.path("status").textValue();
        boolean generated = "GENERATED".equals(status);
        if (generated) {
          if (!keys(step, Set.of("stepId", "status", "code"))
              || !boundedText(step.path("code"), 2000)) {
            return ParseResult.invalid("invalid generated step");
          }
        } else {
          String expected =
              "UNSUPPORTED".equals(status)
                  ? "UNSUPPORTED_CAPABILITY"
                  : "CLARIFICATION".equals(status) ? "AMBIGUOUS_INTENT" : null;
          if (expected == null
              || !keys(step, Set.of("stepId", "status", "reason", "message"))
              || !expected.equals(step.path("reason").textValue())
              || !boundedText(step.path("message"), 400)) {
            return ParseResult.invalid("invalid unsupported or clarification step");
          }
        }
      }
      return ParseResult.valid(root.toString());
    } catch (JsonProcessingException | IllegalArgumentException e) {
      return ParseResult.invalid("malformed model envelope");
    }
  }

  private static boolean keys(JsonNode node, Set<String> expected) {
    if (!node.isObject() || node.size() != expected.size()) {
      return false;
    }
    java.util.Iterator<String> fields = node.fieldNames();
    while (fields.hasNext()) {
      if (!expected.contains(fields.next())) {
        return false;
      }
    }
    return true;
  }

  private static boolean boundedText(JsonNode node, int limit) {
    return node.isTextual() && !node.textValue().isEmpty() && node.textValue().length() <= limit;
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
