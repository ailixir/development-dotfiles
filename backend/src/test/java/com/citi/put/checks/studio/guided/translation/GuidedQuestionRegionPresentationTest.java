package com.citi.put.checks.studio.guided.translation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * ADR-SC-007: the region shown with an observed choice is the text of the {@code group} evidence
 * segment of the element's fact, as the runner printed it. Presentation only (page text,
 * untrusted), never authority; anything unusable is an explicit JSON null so the UI shows no region
 * at all.
 */
class GuidedQuestionRegionPresentationTest {
  private static final String EVIDENCE = "Save Primary workspace";

  /** A button fact whose evidence is "Save Primary workspace": name 0-4, group 5-22. */
  private static ObjectNode fact() {
    ObjectNode fact = ObservationFixtures.fact("button", "Save", false, null);
    fact.put("evidence", EVIDENCE);
    fact.putArray("evidenceSegments")
        .addObject()
        .put("field", "name")
        .put("start", 0)
        .put("end", 4);
    fact.withArray("evidenceSegments")
        .addObject()
        .put("field", "group")
        .put("start", 5)
        .put("end", EVIDENCE.length());
    return fact;
  }

  private static ObjectNode segment(ObjectNode fact, int index) {
    return (ObjectNode) fact.path("evidenceSegments").get(index);
  }

  @Test
  void otherwiseEqualChoicesUseTheirOwnGroupSegments() {
    ObjectNode primary = fact();
    ObjectNode secondary = fact();
    secondary.put("evidence", "Save Secondary workspace");
    segment(secondary, 1).put("end", "Save Secondary workspace".length());
    assertEquals(primary.path("name"), secondary.path("name"));
    assertEquals(
        "Primary workspace", GuidedTranslationService.observedRegionName(primary).asText());
    assertEquals(
        "Secondary workspace", GuidedTranslationService.observedRegionName(secondary).asText());
    assertNotEquals(
        GuidedTranslationService.observedRegionName(primary),
        GuidedTranslationService.observedRegionName(secondary));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("unusableFacts")
  void unusablePresentationReturnsExplicitNull(String scenario, Consumer<ObjectNode> change) {
    ObjectNode fact = fact();
    change.accept(fact);
    JsonNode before = fact.deepCopy();
    JsonNode result = GuidedTranslationService.observedRegionName(fact);
    assertTrue(result.isNull(), scenario);
    assertFalse(result.isMissingNode(), scenario);
    assertEquals(before, fact, scenario);
  }

  static Stream<Arguments> unusableFacts() {
    return Stream.of(
        bad("no group segment", f -> segment(f, 1).put("field", "header")),
        bad("only a name segment", f -> f.withArray("evidenceSegments").remove(1)),
        bad("no segments", f -> f.withArray("evidenceSegments").removeAll()),
        bad("missing segments", f -> f.remove("evidenceSegments")),
        bad("sibling is not a region", f -> segment(f, 1).put("field", "sibling")),
        bad("near is not a region", f -> segment(f, 1).put("field", "near")),
        bad("empty segment", f -> segment(f, 1).put("start", 5).put("end", 5)),
        bad("inverted segment", f -> segment(f, 1).put("start", 9).put("end", 5)),
        bad("blank segment", f -> f.put("evidence", "Save           ")),
        bad("segment past the evidence", f -> segment(f, 1).put("start", 99).put("end", 120)),
        bad("missing evidence", f -> f.remove("evidence")),
        bad("empty evidence", f -> f.put("evidence", "")),
        bad("Unicode blank group", f -> f.put("evidence", "Save     ")));
  }

  @Test
  void aMissingOrNonObjectFactHasNoRegion() {
    assertTrue(GuidedTranslationService.observedRegionName(null).isNull());
    assertTrue(
        GuidedTranslationService.observedRegionName(
                com.fasterxml.jackson.databind.node.NullNode.instance)
            .isNull());
    assertTrue(
        GuidedTranslationService.observedRegionName(
                com.fasterxml.jackson.databind.node.TextNode.valueOf("region"))
            .isNull());
  }

  @Test
  void aSegmentBeyondTheEvidenceIsClampedToIt() {
    ObjectNode fact = fact();
    segment(fact, 1).put("end", 500);
    assertEquals("Primary workspace", GuidedTranslationService.observedRegionName(fact).asText());
  }

  @Test
  void theFirstGroupSegmentIsTheRegion() {
    ObjectNode fact = fact();
    fact.put("evidence", EVIDENCE + " Billing");
    fact.withArray("evidenceSegments")
        .addObject()
        .put("field", "group")
        .put("start", 23)
        .put("end", 31);
    assertEquals("Primary workspace", GuidedTranslationService.observedRegionName(fact).asText());
  }

  @Test
  void preservesAdmittedWhitespaceDecompositionAndUntrustedTextExactly() {
    String group = "  Café <b>workspace</b> ⁧synthetic⁩  ";
    ObjectNode fact = fact();
    fact.put("evidence", "Save " + group);
    segment(fact, 1).put("end", 5 + group.length());
    assertEquals(group, GuidedTranslationService.observedRegionName(fact).asText());
  }

  @Test
  void supplementaryCodePointsAreCountedInUtf16UnitsAsTheRunnerWritesThem() {
    String group = "🌟".repeat(100);
    ObjectNode fact = fact();
    fact.put("evidence", "Save " + group);
    segment(fact, 1).put("end", 5 + group.length());
    assertEquals(group, GuidedTranslationService.observedRegionName(fact).asText());
  }

  @Test
  void aRegionIsNeverTakenFromTheNameLabelsOrModelFields() {
    ObjectNode fact = fact();
    segment(fact, 1).put("field", "header");
    fact.put("region", "Synthetic model suggestion");
    fact.put("parentNodeId", "synthetic-region");
    assertTrue(GuidedTranslationService.observedRegionName(fact).isNull());
  }

  private static JsonNode observation(String... outlineLines) {
    ObjectNode observation = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
    observation.put("outline", String.join("\n", outlineLines));
    return observation;
  }

  private static ObjectNode link() {
    return ObservationFixtures.fact("link", "Benefits", false, null);
  }

  private static String region(JsonNode observation, String ref) {
    JsonNode result =
        GuidedTranslationService.choiceRegion(observation, observation.path("facts"), link(), ref);
    return result.isNull() ? null : result.asText();
  }

  @Test
  void unnamedLandmarksTellSameNameLinksApart() {
    JsonNode observation =
        observation(
            "- document",
            "  - banner",
            "    - navigation",
            "      - link \"Benefits\" [e1]",
            "  - main",
            "    - region \"Services and information\"",
            "      - link \"Benefits\" [e2]",
            "  - contentinfo",
            "    - link \"Benefits\" [e3]");
    assertEquals("header \u203a navigation", region(observation, "e1"));
    assertEquals(
        "main content \u203a region \"Services and information\"", region(observation, "e2"));
    assertEquals("footer", region(observation, "e3"));
  }

  @Test
  void aProjectedAwayAncestorFallsBackToTheInToken() {
    JsonNode observation =
        observation(
            "- document",
            "  - link \"Benefits\" [e1] {in=\"navigation > banner\"}",
            "  - link \"Benefits\" [e2] {in=\"contentinfo\"}",
            "  - link \"Benefits\" [e3] {in=\"region 'Help' > list#1/2\"}");
    assertEquals("header \u203a navigation", region(observation, "e1"));
    assertEquals("footer", region(observation, "e2"));
    assertEquals("region \"Help\"", region(observation, "e3"));
  }

  @Test
  void aNestedChainKeepsTheTwoNearestLandmarksOutermostFirst() {
    JsonNode observation =
        observation(
            "- document",
            "  - main",
            "    - complementary",
            "      - form",
            "        - group",
            "          - link \"Benefits\" [e1]");
    assertEquals("sidebar \u203a form", region(observation, "e1"));
  }

  @Test
  void noLandmarkMeansNoRegion() {
    JsonNode observation =
        observation(
            "- document", "  - list", "    - link \"Benefits\" [e1]", "  - link \"Other\" [e2]");
    assertNull(region(observation, "e1"));
    assertNull(region(observation, "e2"));
    assertNull(region(observation, "e9"));
  }

  @Test
  void aLongRegionIsBounded() {
    JsonNode observation =
        observation(
            "- document", "  - region \"" + "x".repeat(200) + "\"", "    - link \"Benefits\" [e1]");
    assertEquals(
        80, region(observation, "e1").codePointCount(0, region(observation, "e1").length()));
  }

  @Test
  void aNamedScopeStillWinsOverLandmarks() {
    ObjectNode observation =
        (ObjectNode) observation("- document", "  - banner", "    - link \"Benefits\" [e1]");
    ObjectNode facts = observation.putObject("facts");
    facts.set("e0", ObservationFixtures.fact("group", "Primary workspace", false, null));
    ObjectNode fact = link();
    fact.putArray("scopeRefs").add("e0");
    assertEquals(
        "Primary workspace",
        GuidedTranslationService.choiceRegion(observation, facts, fact, "e1").asText());
  }

  private static Arguments bad(String name, Consumer<ObjectNode> change) {
    return Arguments.of(name, change);
  }
}
