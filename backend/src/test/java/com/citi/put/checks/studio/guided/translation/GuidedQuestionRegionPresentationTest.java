package com.citi.put.checks.studio.guided.translation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.Method;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class GuidedQuestionRegionPresentationTest {
  private static final ObjectMapper JSON = new ObjectMapper();

  @Test
  void otherwiseEqualOpenChoicesUseTheirOwnAdmittedRegionNames() throws Exception {
    Fixture fixture = new Fixture();
    ObjectNode secondaryPage = fixture.page.deepCopy();
    secondaryPage.put("nodeId", "synthetic-secondary-button");
    secondaryPage.put("regionId", "synthetic-secondary-region");
    ObjectNode secondaryRegion = fixture.region.deepCopy();
    secondaryRegion.put("nodeId", "synthetic-secondary-region").put("name", "Secondary workspace");
    fixture.observation.withArray("nodes").add(secondaryPage).add(secondaryRegion);

    assertEquals(fixture.page.path("name"), secondaryPage.path("name"));
    assertEquals("Primary workspace", regionName(fixture.progress, fixture.page).asText());
    assertEquals("Secondary workspace", regionName(fixture.progress, secondaryPage).asText());
    assertNotEquals(fixture.page.path("regionId"), regionName(fixture.progress, fixture.page));
    assertNotEquals(secondaryPage.path("regionId"), regionName(fixture.progress, secondaryPage));
  }

  @ParameterizedTest
  @MethodSource("admittedRegions")
  void usesEachSupportedRoleAndAdmittedClassification(String role, String classification)
      throws Exception {
    Fixture fixture = new Fixture();
    fixture.region.put("role", role).put("classification", classification);
    assertEquals("Primary workspace", regionName(fixture.progress, fixture.page).asText());
  }

  static Stream<Arguments> admittedRegions() {
    return Stream.of("main", "region", "navigation")
        .flatMap(
            role ->
                Stream.of("structuralOnly", "permittedBusinessData", "nonsecretApproved")
                    .map(classification -> Arguments.of(role, classification)));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("ineligibleSnapshots")
  void unusableOrAmbiguousPresentationReturnsExplicitNull(String scenario, Consumer<Fixture> change)
      throws Exception {
    Fixture fixture = new Fixture();
    change.accept(fixture);
    JsonNode before = fixture.progress.deepCopy();
    JsonNode selectedBefore = fixture.page.deepCopy();
    JsonNode result = regionName(fixture.progress, fixture.page);
    assertTrue(result.isNull(), scenario);
    assertFalse(result.isMissingNode(), scenario);
    assertEquals(before, fixture.progress, scenario);
    assertEquals(selectedBefore, fixture.page, scenario);
  }

  static Stream<Arguments> ineligibleSnapshots() {
    return Stream.of(
        bad("missing reference", f -> f.page.remove("regionId")),
        bad("null reference", f -> f.page.putNull("regionId")),
        bad("numeric reference", f -> f.page.put("regionId", 1)),
        bad("object reference", f -> f.page.putObject("regionId")),
        bad("array reference", f -> f.page.putArray("regionId")),
        bad("boolean reference", f -> f.page.put("regionId", true)),
        bad("empty reference", f -> f.page.put("regionId", "")),
        bad("blank reference", f -> f.page.put("regionId", " \t\n")),
        bad("dangling reference", f -> f.page.put("regionId", "synthetic-absent-region")),
        bad("duplicate reference", f -> f.observation.withArray("nodes").add(f.region.deepCopy())),
        bad(
            "hidden duplicate still ambiguous",
            f -> f.observation.withArray("nodes").add(f.region.deepCopy().put("visible", false))),
        bad(
            "withheld duplicate still ambiguous",
            f ->
                f.observation
                    .withArray("nodes")
                    .add(f.region.deepCopy().put("classification", "withheld"))),
        bad(
            "stale duplicate still ambiguous",
            f -> f.observation.withArray("nodes").add(f.region.deepCopy().put("generation", 2))),
        bad(
            "unsupported duplicate still ambiguous",
            f -> f.observation.withArray("nodes").add(f.region.deepCopy().put("role", "button"))),
        bad("missing observation", f -> f.progress.remove("observation")),
        bad("null observation", f -> f.progress.putNull("observation")),
        bad("nonobject observation", f -> f.progress.put("observation", "synthetic-unusable")),
        bad("missing nodes", f -> f.observation.remove("nodes")),
        bad("null nodes", f -> f.observation.putNull("nodes")),
        bad("nonarray nodes", f -> f.observation.putObject("nodes")),
        bad("missing current document", f -> f.progress.remove("documentId")),
        bad("null current document", f -> f.progress.putNull("documentId")),
        bad("blank current document", f -> f.progress.put("documentId", " ")),
        bad("nontext current document", f -> f.progress.put("documentId", 3)),
        bad("missing current generation", f -> f.progress.remove("generation")),
        bad("null current generation", f -> f.progress.putNull("generation")),
        bad("text current generation", f -> f.progress.put("generation", "3")),
        bad("negative current generation", f -> f.progress.put("generation", -1)),
        bad("overflow current generation", f -> f.progress.put("generation", 2147483648L)),
        bad("fractional current generation", f -> f.progress.put("generation", 3.5)),
        bad(
            "stale observation document",
            f -> f.observation.put("documentId", "synthetic-other-doc")),
        bad("stale observation generation", f -> f.observation.put("generation", 2)),
        bad("missing observation document", f -> f.observation.remove("documentId")),
        bad("missing observation generation", f -> f.observation.remove("generation")),
        bad("text observation generation", f -> f.observation.put("generation", "3")),
        bad("stale selected document", f -> f.page.put("documentId", "synthetic-other-doc")),
        bad("stale selected generation", f -> f.page.put("generation", 2)),
        bad("missing selected document", f -> f.page.remove("documentId")),
        bad("missing selected generation", f -> f.page.remove("generation")),
        bad("text selected generation", f -> f.page.put("generation", "3")),
        bad("stale region document", f -> f.region.put("documentId", "synthetic-other-doc")),
        bad("stale region generation", f -> f.region.put("generation", 2)),
        bad("missing region document", f -> f.region.remove("documentId")),
        bad("missing region generation", f -> f.region.remove("generation")),
        bad("text region generation", f -> f.region.put("generation", "3")),
        bad("unsupported role", f -> f.region.put("role", "button")),
        bad("nonexact role", f -> f.region.put("role", "Region")),
        bad("missing role", f -> f.region.remove("role")),
        bad("null role", f -> f.region.putNull("role")),
        bad("nontext role", f -> f.region.put("role", 1)),
        bad("hidden region", f -> f.region.put("visible", false)),
        bad("missing visibility", f -> f.region.remove("visible")),
        bad("null visibility", f -> f.region.putNull("visible")),
        bad("text visibility", f -> f.region.put("visible", "true")),
        bad("numeric visibility", f -> f.region.put("visible", 1)),
        bad("withheld region", f -> f.region.put("classification", "withheld")),
        bad("unknown classification", f -> f.region.put("classification", "synthetic-unknown")),
        bad("missing classification", f -> f.region.remove("classification")),
        bad("null classification", f -> f.region.putNull("classification")),
        bad("nontext classification", f -> f.region.put("classification", true)),
        bad("missing name", f -> f.region.remove("name")),
        bad("null name", f -> f.region.putNull("name")),
        bad("numeric name", f -> f.region.put("name", 42)),
        bad("boolean name", f -> f.region.put("name", true)),
        bad("empty name", f -> f.region.put("name", "")),
        bad("blank name", f -> f.region.put("name", " \t\n")),
        bad("Unicode blank name", f -> f.region.put("name", "\u2003")),
        bad("257 ASCII code points", f -> f.region.put("name", "x".repeat(257))),
        bad(
            "257 supplementary code points",
            f -> f.region.put("name", "\uD83C\uDF1F".repeat(257))));
  }

  @Test
  void accepts256SupplementaryCodePointsWithoutTruncation() throws Exception {
    Fixture fixture = new Fixture();
    String name = "\uD83C\uDF1F".repeat(256);
    fixture.region.put("name", name);
    assertEquals(512, name.length());
    assertEquals(name, regionName(fixture.progress, fixture.page).asText());
  }

  @Test
  void preservesAdmittedWhitespaceDecompositionAndUntrustedTextExactly() throws Exception {
    Fixture fixture = new Fixture();
    String name = "  Cafe\u0301 <b>workspace</b> \u2067synthetic\u2069  ";
    fixture.region.put("name", name);
    assertEquals(name, regionName(fixture.progress, fixture.page).asText());
  }

  @Test
  void missingReferenceDoesNotTraverseAncestorOrUseModelAndLocatorAliases() throws Exception {
    Fixture fixture = new Fixture();
    fixture.page.remove("regionId");
    fixture.page.put("parentNodeId", fixture.region.path("nodeId").asText());
    fixture.page.put("region", "Synthetic model suggestion");
    fixture
        .page
        .withArray("locatorHints")
        .addObject()
        .put("kind", "text")
        .put("value", "Synthetic locator suggestion")
        .put("exact", true);
    assertTrue(regionName(fixture.progress, fixture.page).isNull());
  }

  @Test
  void validLookupDoesNotMutateSnapshotSelectedNodeOrBindingIdentity() throws Exception {
    Fixture fixture = new Fixture();
    fixture.page.put("bindingId", "synthetic-existing-binding");
    JsonNode before = fixture.progress.deepCopy();
    JsonNode selectedBefore = fixture.page.deepCopy();
    assertEquals("Primary workspace", regionName(fixture.progress, fixture.page).asText());
    assertEquals(before, fixture.progress);
    assertEquals(selectedBefore, fixture.page);
  }

  @Test
  void generationZeroIsAUsableCurrentSnapshot() throws Exception {
    Fixture fixture = new Fixture();
    fixture.progress.put("generation", 0);
    fixture.observation.put("generation", 0);
    fixture.page.put("generation", 0);
    fixture.region.put("generation", 0);
    assertEquals("Primary workspace", regionName(fixture.progress, fixture.page).asText());
  }

  private static Arguments bad(String name, Consumer<Fixture> change) {
    return Arguments.of(name, change);
  }

  private static JsonNode regionName(JsonNode progress, JsonNode selected) throws Exception {
    Method method =
        GuidedTranslationService.class.getDeclaredMethod(
            "observedRegionName", JsonNode.class, JsonNode.class);
    method.setAccessible(true);
    return (JsonNode) method.invoke(null, progress, selected);
  }

  private static final class Fixture {
    private final ObjectNode progress =
        JSON.createObjectNode()
            .put("documentId", "synthetic-current-document")
            .put("generation", 3);
    private final ObjectNode observation =
        progress
            .putObject("observation")
            .put("documentId", "synthetic-current-document")
            .put("generation", 3);
    private final ObjectNode page =
        JSON.createObjectNode()
            .put("nodeId", "synthetic-primary-button")
            .put("name", "Open")
            .put("documentId", "synthetic-current-document")
            .put("generation", 3)
            .put("regionId", "synthetic-primary-region");
    private final ObjectNode region =
        JSON.createObjectNode()
            .put("nodeId", "synthetic-primary-region")
            .put("name", "Primary workspace")
            .put("documentId", "synthetic-current-document")
            .put("generation", 3)
            .put("role", "region")
            .put("visible", true)
            .put("classification", "structuralOnly");

    private Fixture() {
      observation.putArray("nodes").add(page).add(region);
    }
  }
}
