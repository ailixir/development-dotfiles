package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;

/** Frozen schemas and bounded canonical-v1, shared by HTTP, persistence and digest checks. */
public final class GuidedContracts {
  private static final ObjectMapper JSON =
      new ObjectMapper()
          .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
          .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
  private final Map<String, JsonSchema> schemas = new ConcurrentHashMap<>();

  public ObjectNode object() {
    return JSON.createObjectNode();
  }

  /** Reject ambiguous raw JSON before duplicate names or malformed UTF-8 can be lost. */
  public JsonNode parse(String json) {
    try {
      JsonNode result = JSON.readTree(json);
      require(result != null, "INVALID_CONTRACT", 422);
      return result;
    } catch (IOException e) {
      throw new GuidedSessionException("INVALID_CONTRACT", 422);
    }
  }

  /** Wire numbers use canonical-v1 integer lexemes, not lossy floating/negative-zero coercion. */
  public JsonNode parseWire(byte[] bytes) {
    return parseWire(bytes, 64, 1048576);
  }

  JsonNode parseWire(byte[] bytes, int maximumDepth, int maximumStringLength) {
    try {
      String decoded =
          StandardCharsets.UTF_8
              .newDecoder()
              .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
              .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
              .decode(java.nio.ByteBuffer.wrap(bytes))
              .toString();
      try (var parser = JSON.createParser(decoded)) {
        com.fasterxml.jackson.core.JsonToken token;
        int depth = 0;
        while ((token = parser.nextToken()) != null) {
          if (token.isStructStart()) {
            require(++depth <= maximumDepth, "INVALID_CONTRACT", 422);
          }
          if (token.isStructEnd()) {
            depth--;
          }
          if (token == com.fasterxml.jackson.core.JsonToken.VALUE_STRING
              || token == com.fasterxml.jackson.core.JsonToken.FIELD_NAME) {
            require(parser.getTextLength() <= maximumStringLength, "INVALID_CONTRACT", 422);
          }
          if (token.isNumeric()) {
            require(
                token == com.fasterxml.jackson.core.JsonToken.VALUE_NUMBER_INT
                    && !parser.getText().equals("-0"),
                "INVALID_CONTRACT",
                422);
          }
        }
      }
      JsonNode result = parse(decoded);
      canonical(result);
      return result;
    } catch (IOException failure) {
      throw new GuidedSessionException("INVALID_CONTRACT", 422);
    }
  }

  public void validate(String name, JsonNode value) {
    canonical(value);
    if (!name.startsWith("v2/") && value.path("schemaVersion").asInt() == 2) {
      name = "v2/" + name;
    }
    require(
        schemas.computeIfAbsent(name, this::schema).validate(value).isEmpty(),
        "INVALID_CONTRACT",
        422);
  }

  private JsonSchema schema(String name) {
    String[] parts = name.split("#", 2);
    String resourceName = parts[0] + ".schema.json";
    JsonNode document = resource(resourceName);
    JsonNode root = parts.length == 2 ? document.at(parts[1]) : document;
    require(!root.isMissingNode() && !root.isNull(), "RUNTIME_INCOMPATIBLE", 409);
    return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
        .getSchema(expand(root, resourceName, document));
  }

  private JsonNode resource(String name) {
    try (var in = getClass().getResourceAsStream("/studio/observed-contracts/" + name)) {
      if (in == null) {
        throw new IllegalStateException("Missing observed schema");
      }
      return JSON.readTree(in);
    } catch (IOException e) {
      throw new IllegalStateException("Cannot read observed schema", e);
    }
  }

  private JsonNode expand(JsonNode node, String resourceName, JsonNode document) {
    if (node.isObject()) {
      if (node.has("$ref")) {
        String ref = node.path("$ref").asText();
        String[] parts = ref.split("#", 2);
        String targetName =
            parts[0].isEmpty()
                ? resourceName
                : (parts[0].contains("/observed/v3/")
                        ? "v3/"
                        : parts[0].contains("/observed/v2/") ? "v2/" : "")
                    + parts[0].substring(parts[0].lastIndexOf('/') + 1);
        JsonNode targetDocument = parts[0].isEmpty() ? document : resource(targetName);
        JsonNode target = parts.length == 2 ? targetDocument.at(parts[1]) : targetDocument;
        require(!target.isMissingNode() && !target.isNull(), "RUNTIME_INCOMPATIBLE", 409);
        require(!target.isMissingNode(), "INVALID_CONTRACT", 422);
        return expand(target, targetName, targetDocument);
      }
      ObjectNode out = object();
      node.fields()
          .forEachRemaining(
              e -> {
                // Definitions are reference storage, not instance constraints. Every used $ref
                // is expanded from the original document above; traversing unused definitions
                // would loop on harmless root/definition backreferences (for example Step).
                if (!java.util.Set.of("$id", "definitions", "$defs").contains(e.getKey())) {
                  out.set(e.getKey(), expand(e.getValue(), resourceName, document));
                }
              });
      return out;
    }
    if (node.isArray()) {
      var out = JSON.createArrayNode();
      node.forEach(n -> out.add(expand(n, resourceName, document)));
      return out;
    }
    return node;
  }

  public static String canonical(JsonNode node) {
    if (node.isObject()) {
      Map<String, JsonNode> sorted = new TreeMap<>();
      node.fields()
          .forEachRemaining(
              e -> {
                require(
                    e.getKey().chars().allMatch(c -> c >= 32 && c <= 126), "INVALID_CONTRACT", 422);
                sorted.put(e.getKey(), e.getValue());
              });
      return "{"
          + sorted.entrySet().stream()
              .map(e -> quote(e.getKey()) + ":" + canonical(e.getValue()))
              .collect(java.util.stream.Collectors.joining(","))
          + "}";
    }
    if (node.isArray()) {
      var parts = new java.util.ArrayList<String>();
      node.forEach(n -> parts.add(canonical(n)));
      return "[" + String.join(",", parts) + "]";
    }
    if (node.isTextual()) {
      return quote(node.textValue());
    }
    require(
        node.isNull()
            || node.isBoolean()
            || (node.isIntegralNumber()
                && node.canConvertToLong()
                && node.longValue() >= -9007199254740991L
                && node.longValue() <= 9007199254740991L),
        "INVALID_CONTRACT",
        422);
    return node.toString();
  }

  private static String quote(String value) {
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      if (Character.isHighSurrogate(c)) {
        require(
            i + 1 < value.length() && Character.isLowSurrogate(value.charAt(++i)),
            "INVALID_CONTRACT",
            422);
      } else {
        require(!Character.isLowSurrogate(c), "INVALID_CONTRACT", 422);
      }
    }
    try {
      return JSON.writeValueAsString(value);
    } catch (IOException e) {
      throw new GuidedSessionException("INVALID_CONTRACT", 422);
    }
  }

  public static String hash(JsonNode node) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(canonical(node).getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
