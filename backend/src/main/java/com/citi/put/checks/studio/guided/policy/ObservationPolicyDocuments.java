package com.citi.put.checks.studio.guided.policy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The stored governed observation policy document and its two hashes (STUDIO-OBS-014 AC-1, AC-5,
 * AC-6; c2b-spec.json guidedPolicySchema, which supersedes AR-2 h where they differ).
 *
 * <p>The server stores {@code policyDocument}, never the submitted {@code policyDocumentInput}.
 * Before hashing it (1) materializes an omitted {@code sideEffectStance} as {@code CLARIFY_FIRST}
 * and an omitted {@code destructiveVocabulary} as the configured baseline, (2) sorts {@code
 * allowedOrigins} and {@code destructiveVocabulary} by Unicode code point, (3) sorts {@code
 * readGrants} by {@code policyRuleId} code point and (4) orders each {@code controlValue.types} in
 * the enum order. So one policy has one canonical form, one {@code documentHash} and one {@code
 * observationPolicyHash}. PostgreSQL re-derives both hashes at insert (V19 CHECKs).
 *
 * <p>Refusals are {@code 400 INVALID_POLICY} with a fixed message that never quotes the body. The
 * v3 {@code guided-policy} schema (C2b) validates the closed grant internals at the HTTP boundary;
 * the rules here are the semantic ones plus the shape the database also enforces.
 */
public final class ObservationPolicyDocuments {

  public static final String DEFAULT_STANCE = "CLARIFY_FIRST";
  public static final Set<String> STANCES = Set.of("ALLOW", "CLARIFY_FIRST", "DENY");
  public static final List<String> CONTROL_TYPES =
      List.of("text", "search", "email", "tel", "url", "textarea");

  private static final Set<String> DOCUMENT_KEYS =
      Set.of(
          "schemaVersion",
          "allowedOrigins",
          "applicationPolicy",
          "sideEffectStance",
          "destructiveVocabulary");
  private static final Set<String> APPLICATION_KEYS =
      Set.of("policyRuleId", "allowStructuralDiscovery", "readGrants");
  private static final Pattern ORIGIN =
      Pattern.compile("^https?://(?:[a-z0-9.-]+|\\[[0-9a-f:]+\\])(?::[1-9][0-9]{0,4})?$");
  private static final Pattern VOCABULARY_ENTRY = Pattern.compile("^\\S+(?: \\S+)*$");
  private static final Comparator<String> CODE_POINT = ObservationPolicyDocuments::codePointCompare;

  private ObservationPolicyDocuments() {}

  /** Validates a submitted document and returns the normalized stored form. */
  public static ObjectNode materialize(
      GuidedContracts contracts, JsonNode submitted, List<String> defaultVocabulary) {
    require(submitted != null && submitted.isObject(), "document must be an object");
    submitted
        .fieldNames()
        .forEachRemaining(key -> require(DOCUMENT_KEYS.contains(key), "unknown document field"));
    require(
        submitted.path("schemaVersion").isInt() && submitted.path("schemaVersion").asInt() == 3,
        "schemaVersion must be 3");
    ObjectNode document = contracts.object().put("schemaVersion", 3);

    List<String> origins = strings(submitted.path("allowedOrigins"), "allowedOrigins");
    require(
        !origins.isEmpty()
            && origins.size() <= 10
            && new HashSet<>(origins).size() == origins.size()
            && origins.stream().allMatch(o -> o.length() <= 256 && ORIGIN.matcher(o).matches()),
        "allowedOrigins must hold 1..10 distinct lowercase http(s) origins");
    origins.sort(CODE_POINT);
    ArrayNode storedOrigins = document.putArray("allowedOrigins");
    origins.forEach(storedOrigins::add);

    document.set(
        "applicationPolicy", application(contracts, submitted.path("applicationPolicy"), origins));

    JsonNode suppliedStance = submitted.path("sideEffectStance");
    require(
        suppliedStance.isMissingNode()
            || (suppliedStance.isTextual() && STANCES.contains(suppliedStance.asText())),
        "sideEffectStance is not a known stance");
    String stance = suppliedStance.isMissingNode() ? DEFAULT_STANCE : suppliedStance.asText();
    document.put("sideEffectStance", stance);

    List<String> vocabulary =
        submitted.has("destructiveVocabulary")
            ? strings(submitted.path("destructiveVocabulary"), "destructiveVocabulary")
            : new ArrayList<>(defaultVocabulary);
    require(validVocabulary(vocabulary), "destructiveVocabulary is not a valid vocabulary");
    vocabulary.sort(CODE_POINT);
    ArrayNode storedVocabulary = document.putArray("destructiveVocabulary");
    vocabulary.forEach(storedVocabulary::add);
    return document;
  }

  /** Hash of the whole stored document (versions, audit chain). */
  public static String documentHash(JsonNode document) {
    return GuidedContracts.hash(document);
  }

  /**
   * Hash of {@code applicationPolicy} exactly as stored and as sent to the runner in the context
   * ({@code policyHash}); the runner re-derives it before the first observation.
   */
  public static String observationPolicyHash(JsonNode document) {
    return GuidedContracts.hash(document.path("applicationPolicy"));
  }

  static boolean validVocabulary(List<String> entries) {
    if (entries.isEmpty() || entries.size() > 64) {
      return false;
    }
    var seen = new HashSet<String>();
    for (String entry : entries) {
      if (entry == null
          || entry.isEmpty()
          || entry.length() > 64
          || !VOCABULARY_ENTRY.matcher(entry).matches()
          || !entry.equals(entry.toLowerCase(Locale.ROOT))
          || !seen.add(entry)) {
        return false;
      }
    }
    return true;
  }

  private static ObjectNode application(
      GuidedContracts contracts, JsonNode submitted, List<String> allowedOrigins) {
    require(submitted.isObject(), "applicationPolicy must be an object");
    submitted
        .fieldNames()
        .forEachRemaining(
            key -> require(APPLICATION_KEYS.contains(key), "unknown applicationPolicy field"));
    String ruleId = submitted.path("policyRuleId").asText("");
    require(
        submitted.path("policyRuleId").isTextual() && !ruleId.isEmpty() && ruleId.length() <= 256,
        "applicationPolicy.policyRuleId is required");
    require(
        submitted.path("allowStructuralDiscovery").isBoolean()
            && submitted.path("allowStructuralDiscovery").asBoolean(),
        "applicationPolicy.allowStructuralDiscovery must be true");
    JsonNode grants = submitted.path("readGrants");
    require(grants.isArray() && grants.size() <= 32, "applicationPolicy.readGrants is required");
    List<ObjectNode> sorted = new ArrayList<>();
    var ruleIds = new HashSet<String>();
    var origins = new HashSet<>(allowedOrigins);
    for (JsonNode grant : grants) {
      require(grant.isObject(), "readGrants entries must be objects");
      require(
          grant.path("policyRuleId").isTextual()
              && ruleIds.add(grant.path("policyRuleId").asText()),
          "readGrants policyRuleId values must be present and distinct");
      require(
          grant.path("origin").isTextual() && origins.contains(grant.path("origin").asText()),
          "every readGrants origin must be one of allowedOrigins");
      ObjectNode copy = grant.deepCopy();
      if (copy.path("controlValue").path("types").isArray()) {
        List<String> types = strings(copy.path("controlValue").path("types"), "types");
        require(CONTROL_TYPES.containsAll(types), "controlValue.types holds an unknown type");
        types.sort(Comparator.comparingInt(CONTROL_TYPES::indexOf));
        ArrayNode ordered = ((ObjectNode) copy.path("controlValue")).putArray("types");
        types.forEach(ordered::add);
      }
      sorted.add(copy);
    }
    sorted.sort(
        (a, b) ->
            codePointCompare(a.path("policyRuleId").asText(), b.path("policyRuleId").asText()));
    ObjectNode application = contracts.object();
    application
        .put("policyRuleId", ruleId)
        .put("allowStructuralDiscovery", true)
        .putArray("readGrants")
        .addAll(sorted);
    return application;
  }

  private static List<String> strings(JsonNode array, String field) {
    require(array.isArray(), field + " must be an array");
    List<String> out = new ArrayList<>();
    for (JsonNode entry : array) {
      require(entry.isTextual(), field + " entries must be strings");
      out.add(entry.asText());
    }
    return out;
  }

  static int codePointCompare(String a, String b) {
    int i = 0;
    int j = 0;
    while (i < a.length() && j < b.length()) {
      int x = a.codePointAt(i);
      int y = b.codePointAt(j);
      if (x != y) {
        return Integer.compare(x, y);
      }
      i += Character.charCount(x);
      j += Character.charCount(y);
    }
    return Integer.compare(a.length() - i, b.length() - j);
  }

  private static void require(boolean condition, String message) {
    if (!condition) {
      throw new StudioValidationException("INVALID_POLICY", message);
    }
  }
}
