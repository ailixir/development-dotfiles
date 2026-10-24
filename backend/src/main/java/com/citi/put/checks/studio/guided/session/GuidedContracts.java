package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.PropertiesValidator;
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
  private final Map<String, CompiledSchema> schemas = new ConcurrentHashMap<>();

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
    validatedCanonical(name, value);
  }

  /** Canonical request bytes are usable only after the same original schema succeeds. */
  public String validateAndCanonical(String name, JsonNode value) {
    return validatedCanonical(name, value);
  }

  private String validatedCanonical(String name, JsonNode value) {
    String representation = canonical(value);
    // contracts/v3 is the only generation on the classpath; bare names resolve to it.
    if (!name.startsWith("v3/")) {
      name = "v3/" + name;
    }
    require(
        schemas.computeIfAbsent(name, this::compileSchema).valid(value), "INVALID_CONTRACT", 422);
    return representation;
  }

  // Independent expanded root oracles. Unknown contracts retain native root validation.
  // STUDIO-OBS-012A re-epoch: the {contract:3} tuple collapse changes the expanded session and
  // replay-validation roots (they reach versions/profile by $ref); ledger/observation are
  // unchanged. DECISION-1 (2026-10-13) re-epochs session again: it reaches limits by $ref and
  // limits.maxModelInputTokensTotal maximum/default moved 128000 -> 262144. MODEL-SIZING
  // (2026-10-18, ruling option A-ii) re-epochs session once more: limits.maxModelOutputTokensTotal
  // maximum/default 32000 -> 131072/98304 and limits.maxModelInputTokensTotal maximum/default
  // 262144 -> 1572864/786432.
  private static final String SESSION_SCHEMA_EPOCH =
      "dace2f2b43be2052997f7fff9c970b18e81b0f7b1931baba5ffd3a07f24f476b";
  // STUDIO-OBS-014 C2a re-epochs replay-validation: ObservedQuestionContext.question $refs
  // clarification.schema.json, which gained labelSource/role/region and two enum values.
  // STUDIO-OBS-009 round 057 re-epochs it again: every accepted-plan obligation gained the required
  // nullable scopeIntent (region-qualified step labels; user decision).
  private static final String REPLAY_VALIDATION_SCHEMA_EPOCH =
      "d4d60c1248a7bb4cb0338ce38de51da248b49ebb4bc94dc9d3964d81683fccdf";

  private static final String LEDGER_SCHEMA_EPOCH =
      "b1a71bd543c51f4eaebd849f99139d077e475caf3ca90efa84a4c9d9d062b80d";
  private static final String OBSERVATION_SCHEMA_EPOCH =
      "9be57abe1679bafcf7dbbcf3452a515dab7032c999ad630a241c7cbb856ac2d2";

  // The only constraint of this frozen root is exactly one COMPLETE native alternative.
  private static final String OUTCOME_SCHEMA_EPOCH =
      "95f7878408ce7d089646898aef3d528bc2e3c62d7f2bf8f228134556dfe451e8";

  private record ArraySchema(JsonSchema shape, JsonSchema item, CompiledSchema itemObject) {
    ArraySchema(JsonSchema shape, JsonSchema item) {
      this(shape, item, null);
    }

    boolean valid(JsonNode value) {
      boolean valid = shape.validate(value).isEmpty();
      if (value.isArray()) {
        for (JsonNode node : value) {
          valid &= itemObject == null ? item.validate(node).isEmpty() : itemObject.valid(node);
        }
      }
      return valid;
    }
  }

  private record CompiledSchema(
      JsonSchema shape,
      Map<String, JsonSchema> properties,
      Map<String, CompiledSchema> objects,
      Map<String, ArraySchema> arrays,
      java.util.List<JsonSchema> alternatives) {
    CompiledSchema {
      alternatives = java.util.List.copyOf(alternatives);
    }

    CompiledSchema(
        JsonSchema shape,
        Map<String, JsonSchema> properties,
        Map<String, CompiledSchema> objects,
        Map<String, ArraySchema> arrays) {
      this(shape, properties, objects, arrays, java.util.List.of());
    }

    CompiledSchema(JsonSchema shape, Map<String, JsonSchema> properties) {
      this(shape, properties, Map.of(), Map.of());
    }

    boolean valid(JsonNode value) {
      if (!alternatives.isEmpty()) {
        int matches = 0;
        for (JsonSchema alternative : alternatives) {
          // Public native validation creates a fresh context. Evaluate both, including after a
          // match.
          if (alternative.validate(value).isEmpty()) {
            matches++;
          }
        }
        return matches == 1;
      }
      boolean valid = shape.validate(value).isEmpty();
      for (var property : properties.entrySet()) {
        JsonNode child = value.get(property.getKey());
        if (child != null) {
          // Every present child, including null, is evaluated even after an earlier refusal.
          CompiledSchema nested = objects.get(property.getKey());
          if (nested != null) {
            valid &= nested.valid(child);
          } else if (arrays.containsKey(property.getKey())) {
            valid &= arrays.get(property.getKey()).valid(child);
          } else {
            valid &= property.getValue().validate(child).isEmpty();
          }
        }
      }
      return valid;
    }
  }

  private CompiledSchema compileSchema(String name) {
    return compileSchema(name, schema(name));
  }

  private CompiledSchema compileSchema(String name, JsonSchema original) {
    CompiledSchema baseline = new CompiledSchema(original, Map.of());
    if (name.equals("v3/bridge#/definitions/outcome")) {
      try {
        CompiledSchema outcome = compileOutcome(original);
        return outcome == null ? baseline : outcome;
      } catch (RuntimeException unavailable) {
        return baseline;
      }
    }
    String epoch =
        name.equals("v3/session")
            ? SESSION_SCHEMA_EPOCH
            : name.equals("v3/replay-validation")
                ? REPLAY_VALIDATION_SCHEMA_EPOCH
                : name.equals("v3/ledger")
                    ? LEDGER_SCHEMA_EPOCH
                    : name.equals("v3/observation") ? OBSERVATION_SCHEMA_EPOCH : null;
    if (epoch == null) {
      return baseline;
    }
    try {
      if (!epoch.equals(hash(original.getSchemaNode()))) {
        return baseline;
      }
      CompiledSchema root = compileProperties(original);
      if (root == null) {
        return baseline;
      }
      if (name.equals("v3/replay-validation")) {
        // Only these two original child roots are independent objects in this frozen epoch.
        CompiledSchema artifact = compileProperties(root.properties().get("artifact"));
        CompiledSchema basis = compileBasis(root.properties().get("validationBasis"));
        if (artifact == null || basis == null) {
          return baseline;
        }
        return new CompiledSchema(
            root.shape(),
            root.properties(),
            Map.of("artifact", artifact, "validationBasis", basis),
            Map.of());
      }
      if (name.equals("v3/observation")) {
        CompiledSchema observation = withObservationNodes(root);
        return observation == null ? baseline : observation;
      }
      return root;
    } catch (RuntimeException unavailable) {
      return baseline;
    }
  }

  /** Pin the full native branches; unsupported contexts keep the complete original root. */
  private CompiledSchema compileOutcome(JsonSchema original) {
    var context = original.getValidationContext();
    var config = context.getConfig();
    var defaults = config.getApplyDefaultsStrategy();
    JsonNode root = original.getSchemaNode();
    JsonNode alternatives = root.path("oneOf");
    if (context.getMetaSchema().getSpecification() != SpecVersion.VersionFlag.V7
        || !context.getMetaSchema().equals(com.networknt.schema.JsonMetaSchema.getV7())
        || config.isFailFast()
        || config.isTypeLoose()
        || defaults.shouldApplyPropertyDefaults()
        || defaults.shouldApplyPropertyDefaultsIfNull()
        || defaults.shouldApplyArrayDefaults()
        || config.getExecutionContextCustomizer() != null
        || !config.getKeywordWalkListenersMap().isEmpty()
        || !config.getPropertyWalkListeners().isEmpty()
        || !config.getArrayItemWalkListeners().isEmpty()
        || config.isOpenAPI3StyleDiscriminators()
        || !root.isObject()
        || root.size() != 1
        || !alternatives.isArray()
        || alternatives.size() != 2
        || !OUTCOME_SCHEMA_EPOCH.equals(hash(root))
        || original.getValidators().size() != 1
        || !(original.getValidators().getFirst() instanceof com.networknt.schema.OneOfValidator)) {
      return null;
    }
    var compiled = new java.util.ArrayList<JsonSchema>(2);
    for (JsonNode branch : alternatives) {
      if (!branch.isObject() || !branch.path("type").asText().equals("object")) {
        return null;
      }
      JsonSchema nativeBranch =
          JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(branch, config);
      if (nativeBranch.getValidationContext().getConfig() != config
          || !nativeBranch.getSchemaNode().equals(branch)) {
        return null;
      }
      compiled.add(nativeBranch);
    }
    return new CompiledSchema(original, Map.of(), Map.of(), Map.of(), compiled);
  }

  private CompiledSchema withObservationNodes(CompiledSchema observation) {
    ArraySchema nodes = compileArray(observation.properties().get("nodes"));
    return nodes == null
        ? null
        : new CompiledSchema(
            observation.shape(), observation.properties(), Map.of(), Map.of("nodes", nodes));
  }

  /** Only the three original exercised-fact collections in the frozen replay request. */
  private CompiledSchema compileBasis(JsonSchema original) {
    CompiledSchema basis = compileProperties(original);
    if (basis == null) {
      return null;
    }
    ArraySchema observations = compileArray(basis.properties().get("observations"));
    ArraySchema actions = compileArray(basis.properties().get("actions"));
    ArraySchema preparations = compileArray(basis.properties().get("preparations"));
    if (observations == null || actions == null || preparations == null) {
      return null;
    }
    CompiledSchema observationFact = compileProperties(observations.item());
    CompiledSchema actionFact = compileProperties(actions.item());
    if (observationFact == null || actionFact == null) {
      return null;
    }
    JsonSchema observed = observationFact.properties().get("observation");
    JsonSchema ledger = actionFact.properties().get("ledger");
    if (!OBSERVATION_SCHEMA_EPOCH.equals(hash(observed.getSchemaNode()))
        || !LEDGER_SCHEMA_EPOCH.equals(hash(ledger.getSchemaNode()))) {
      return null;
    }
    CompiledSchema observation = compileProperties(observed);
    CompiledSchema ledgerPlan = compileProperties(ledger);
    if (observation == null || ledgerPlan == null) {
      return null;
    }
    observation = withObservationNodes(observation);
    if (observation == null) {
      return null;
    }
    observationFact =
        new CompiledSchema(
            observationFact.shape(),
            observationFact.properties(),
            Map.of("observation", observation),
            Map.of());
    actionFact =
        new CompiledSchema(
            actionFact.shape(), actionFact.properties(), Map.of("ledger", ledgerPlan), Map.of());
    return new CompiledSchema(
        basis.shape(),
        basis.properties(),
        Map.of(),
        Map.of(
            "observations",
                new ArraySchema(observations.shape(), observations.item(), observationFact),
            "actions", new ArraySchema(actions.shape(), actions.item(), actionFact),
            "preparations", preparations));
  }

  /** Shallow only: callers above name every supported property/item path explicitly. */
  private CompiledSchema compileProperties(JsonSchema original) {
    var config = original.getValidationContext().getConfig();
    var defaults = config.getApplyDefaultsStrategy();
    if (config.isTypeLoose()
        || defaults.shouldApplyPropertyDefaults()
        || defaults.shouldApplyPropertyDefaultsIfNull()
        || defaults.shouldApplyArrayDefaults()
        || config.getExecutionContextCustomizer() != null
        || !config.getKeywordWalkListenersMap().isEmpty()
        || !config.getPropertyWalkListeners().isEmpty()
        || !config.getArrayItemWalkListeners().isEmpty()
        || config.isOpenAPI3StyleDiscriminators()) {
      return null;
    }
    Map<String, JsonSchema> properties = null;
    for (var validator : original.getValidators()) {
      if (validator instanceof PropertiesValidator compiled) {
        if (properties != null) {
          return null;
        }
        properties = compiled.getSchemas();
      }
    }
    JsonNode declarations = original.getSchemaNode().path("properties");
    if (properties == null || properties.size() != declarations.size()) {
      return null;
    }
    ObjectNode shape = original.getSchemaNode().deepCopy();
    ObjectNode shapeProperties = shape.withObject("/properties");
    for (var property : properties.entrySet()) {
      if (property.getValue().getValidationContext().getConfig() != config
          || !property.getValue().getSchemaNode().equals(declarations.get(property.getKey()))) {
        return null;
      }
      shapeProperties.set(property.getKey(), object());
    }
    return new CompiledSchema(
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(shape, config),
        java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(properties)));
  }

  /** Original native item plus all collection constraints; callers select only literal paths. */
  private ArraySchema compileArray(JsonSchema original) {
    var config = original.getValidationContext().getConfig();
    if (config.isTypeLoose() || !original.getSchemaNode().path("items").isObject()) {
      return null;
    }
    JsonSchema item = null;
    for (var validator : original.getValidators()) {
      if (validator instanceof com.networknt.schema.ItemsValidator compiled) {
        if (item != null || compiled.getSchema() == null || !compiled.getTupleSchema().isEmpty()) {
          return null;
        }
        item = compiled.getSchema();
      }
    }
    if (item == null
        || item.getValidationContext().getConfig() != config
        || !item.getSchemaNode().equals(original.getSchemaNode().path("items"))) {
      return null;
    }
    ObjectNode shape = original.getSchemaNode().deepCopy();
    shape.set("items", object());
    return new ArraySchema(
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(shape, config), item);
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
        require(
            parts[0].isEmpty() || parts[0].contains("/observed/v3/"), "RUNTIME_INCOMPATIBLE", 409);
        String targetName =
            parts[0].isEmpty()
                ? resourceName
                : "v3/" + parts[0].substring(parts[0].lastIndexOf('/') + 1);
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
    // Normative canonical-v1 string form (ar-2-r14-stops.json ruling 1, RFC 8785 §3.2.2.2, the
    // same bytes as ECMAScript JSON.stringify and PostgreSQL jsonb text): quote and backslash,
    // the short escapes \b \t \n \f \r, every other U+0000-U+001F as \\u00 plus two LOWERCASE
    // hex digits, and nothing else escaped. Jackson's default writer used uppercase hex for nine
    // of those code points, which diverged from the runner and the database.
    StringBuilder out = new StringBuilder(value.length() + 2).append('"');
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\b' -> out.append("\\b");
        case '\t' -> out.append("\\t");
        case '\n' -> out.append("\\n");
        case '\f' -> out.append("\\f");
        case '\r' -> out.append("\\r");
        default -> {
          if (c < 0x20) {
            out.append("\\u00")
                .append(Character.forDigit(c >> 4, 16))
                .append(Character.forDigit(c & 0xF, 16));
          } else {
            out.append(c);
          }
        }
      }
    }
    return out.append('"').toString();
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
