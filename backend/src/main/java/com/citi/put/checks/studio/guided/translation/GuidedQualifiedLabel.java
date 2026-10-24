package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import java.util.ArrayList;
import java.util.List;

/**
 * Region-qualified step labels (STUDIO-OBS-009 round 057, user decision). An obligation carries
 * {@code targetIntent} (the bare label) and {@code scopeIntent} (the name of the nearest enclosing
 * {@code main}, {@code region} or {@code navigation} landmark, or null). This is the one definition
 * of that correspondence: admission, acquisition, clarification and the publication re-check all
 * call it, and the Node validator ({@code qualifiedLabel.ts}) implements the same rules against the
 * shared vectors {@code contracts/v3/qualified-label-vectors.json}.
 *
 * <p>It is a correspondence rule, not a locator and not permission to act. Region names are
 * page-derived: they are compared, never executed or echoed. Comparison is {@code equalsIgnoreCase}
 * with no further normalization (delayed-state-design.md section 5).
 */
public final class GuidedQualifiedLabel {
  private static final List<String> REGION_ROLES = List.of("main", "region", "navigation");
  private static final List<String> REGION_CLASSES =
      List.of("structuralOnly", "permittedBusinessData", "nonsecretApproved");

  private GuidedQualifiedLabel() {}

  /** The accessible name of the node's nearest eligible region, or JSON null when none is. */
  public static JsonNode regionName(
      JsonNode observation, JsonNode document, JsonNode generation, JsonNode pageNode) {
    JsonNode absent = NullNode.instance;
    if (observation == null || pageNode == null) {
      return absent;
    }
    JsonNode regionId = pageNode.path("regionId");
    if (!document.isTextual()
        || document.asText().isBlank()
        || !generation.isIntegralNumber()
        || !generation.canConvertToInt()
        || generation.asInt() < 0
        || !observation.path("documentId").equals(document)
        || !observation.path("generation").equals(generation)
        || !pageNode.path("documentId").equals(document)
        || !pageNode.path("generation").equals(generation)
        || !regionId.isTextual()
        || regionId.asText().isBlank()
        || !observation.path("nodes").isArray()) {
      return absent;
    }
    JsonNode region = null;
    int matches = 0;
    for (JsonNode node : observation.path("nodes")) {
      if (node.path("nodeId").equals(regionId)) {
        matches++;
        region = node;
      }
    }
    if (matches != 1
        || !region.path("documentId").equals(document)
        || !region.path("generation").equals(generation)
        || !REGION_ROLES.contains(region.path("role").asText())
        || !region.path("visible").isBoolean()
        || !region.path("visible").booleanValue()
        || !REGION_CLASSES.contains(region.path("classification").asText())
        || !region.path("name").isTextual()) {
      return absent;
    }
    String name = region.path("name").asText();
    int codePoints = name.codePointCount(0, name.length());
    return !name.isBlank() && codePoints >= 1 && codePoints <= 256 ? region.path("name") : absent;
  }

  /** The label match acquisition has always used: node name, or any hint name/value. */
  public static boolean matchesIntent(JsonNode node, String intent) {
    if (intent.equalsIgnoreCase(node.path("name").asText())) {
      return true;
    }
    for (JsonNode locator : node.path("locatorHints")) {
      if (intent.equalsIgnoreCase(locatorLabel(locator))) {
        return true;
      }
    }
    return false;
  }

  /** The text a locator names: the accessible name of a role locator, else its value. */
  public static String locatorLabel(JsonNode locator) {
    return locator.path(locator.path("kind").asText().equals("role") ? "name" : "value").asText();
  }

  /** True when the nearest region of {@code node} is named {@code scopeIntent}. */
  public static boolean inRegion(
      JsonNode observation,
      JsonNode document,
      JsonNode generation,
      JsonNode node,
      String scopeIntent) {
    JsonNode name = regionName(observation, document, generation, node);
    return name.isTextual() && scopeIntent.equalsIgnoreCase(name.asText());
  }

  /**
   * Every node the qualified label can mean: it matches {@code targetIntent} and its nearest region
   * is named {@code scopeIntent}. Empty when the author named a region that does not exist.
   */
  public static List<JsonNode> candidates(
      JsonNode observation,
      JsonNode document,
      JsonNode generation,
      String targetIntent,
      String scopeIntent) {
    List<JsonNode> result = new ArrayList<>();
    for (JsonNode node : observation.path("nodes")) {
      if (matchesIntent(node, targetIntent)
          && inRegion(observation, document, generation, node, scopeIntent)) {
        result.add(node);
      }
    }
    return result;
  }

  /** How many nodes of the observation carry exactly this locator hint. */
  public static long locatorCardinality(JsonNode observation, JsonNode locator) {
    long count = 0;
    for (JsonNode node : observation.path("nodes")) {
      for (JsonNode hint : node.path("locatorHints")) {
        if (hint.equals(locator)) {
          count++;
          break;
        }
      }
    }
    return count;
  }

  /**
   * A clarification for a qualified obligation is allowed only when several nodes of the named
   * region carry the label, and then only among those nodes: the author already said which one, so
   * a question with a single candidate (or none) defeats the rule. {@code INVALID_CONTRACT} 422.
   */
  public static void requireQuestionChoice(
      JsonNode observation,
      JsonNode document,
      JsonNode generation,
      JsonNode obligation,
      String nodeId) {
    if (!obligation.path("scopeIntent").isTextual()) {
      return;
    }
    List<JsonNode> candidates =
        candidates(
            observation,
            document,
            generation,
            obligation.path("targetIntent").asText(),
            obligation.path("scopeIntent").asText());
    require(
        candidates.size() >= 2
            && candidates.stream().anyMatch(c -> c.path("nodeId").asText().equals(nodeId)),
        "INVALID_CONTRACT",
        422);
  }

  /**
   * Verifies a proposed element target against a qualified obligation and returns the locator that
   * makes the selection publishable: the target must be the only candidate, and its locator must be
   * one of its hints and unique in the observation. Refusals use {@code code} with {@code status}.
   *
   * @param observation the observation the action was proposed on
   * @param target the proposed action target ({@code nodeId} and {@code locator})
   */
  public static JsonNode qualifiedLocator(
      JsonNode observation,
      JsonNode document,
      JsonNode generation,
      JsonNode obligation,
      JsonNode target,
      String code,
      int status) {
    require(
        obligation.path("scopeIntent").isTextual()
            && target.path("nodeId").isTextual()
            && target.path("locator").isObject(),
        code,
        status);
    List<JsonNode> candidates =
        candidates(
            observation,
            document,
            generation,
            obligation.path("targetIntent").asText(),
            obligation.path("scopeIntent").asText());
    require(
        candidates.size() == 1
            && candidates.getFirst().path("nodeId").equals(target.path("nodeId")),
        code,
        status);
    JsonNode locator = target.path("locator");
    boolean hint = false;
    for (JsonNode candidate : candidates.getFirst().path("locatorHints")) {
      hint |= candidate.equals(locator);
    }
    require(hint && locatorCardinality(observation, locator) == 1, code, status);
    return locator;
  }
}
