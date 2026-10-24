package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Round 057: the region-qualified label rule against the vectors shared with the studio-runner
 * validator (qualifiedLabelVectors.test.ts). One observation, positive and negative cases; the two
 * implementations must agree on every one.
 */
class GuidedQualifiedLabelVectorsTest {
  private static final JsonNode VECTORS = load();

  private static JsonNode load() {
    try {
      return new ObjectMapper()
          .readTree(
              Files.readString(
                  Path.of(
                      "../docs/specs/studio-observed-authoring/contracts/v3/qualified-label-vectors.json")));
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  static Stream<JsonNode> cases() {
    List<JsonNode> all = new ArrayList<>();
    VECTORS.path("cases").forEach(all::add);
    return all.stream();
  }

  private static List<String> ids(List<JsonNode> nodes) {
    return nodes.stream().map(n -> n.path("nodeId").asText()).toList();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("cases")
  void everySharedVectorAgrees(JsonNode vector) {
    JsonNode observation = VECTORS.path("observation");
    JsonNode document = observation.path("documentId"), generation = observation.path("generation");
    List<String> expected = new ArrayList<>();
    vector.path("candidates").forEach(id -> expected.add(id.asText()));
    assertThat(
            ids(
                GuidedQualifiedLabel.candidates(
                    observation,
                    document,
                    generation,
                    vector.path("targetIntent").asText(),
                    vector.path("scopeIntent").asText())))
        .containsExactlyElementsOf(expected);
    ObjectNode obligation = new ObjectMapper().createObjectNode();
    obligation.put("targetIntent", vector.path("targetIntent").asText());
    obligation.put("scopeIntent", vector.path("scopeIntent").asText());
    if (vector.path("expected").asText().equals("ACCEPT")) {
      assertThat(
              GuidedQualifiedLabel.qualifiedLocator(
                  observation,
                  document,
                  generation,
                  obligation,
                  vector.path("target"),
                  "INVALID_CONTRACT",
                  422))
          .isEqualTo(vector.path("target").path("locator"));
    } else {
      assertThatThrownBy(
              () ->
                  GuidedQualifiedLabel.qualifiedLocator(
                      observation,
                      document,
                      generation,
                      obligation,
                      vector.path("target"),
                      "INVALID_CONTRACT",
                      422))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              e -> {
                assertThat(e.getMessage()).isEqualTo("INVALID_CONTRACT");
                assertThat(e.status()).isEqualTo(422);
              });
    }
  }

  @Test
  void aNullScopeIntentIsNeverQualified() {
    JsonNode observation = VECTORS.path("observation");
    ObjectNode obligation = new ObjectMapper().createObjectNode();
    obligation.put("targetIntent", "Open").putNull("scopeIntent");
    assertThatThrownBy(
            () ->
                GuidedQualifiedLabel.qualifiedLocator(
                    observation,
                    observation.path("documentId"),
                    observation.path("generation"),
                    obligation,
                    VECTORS.path("cases").get(0).path("target"),
                    "INVALID_CONTRACT",
                    422))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void aRegionNameFromAnotherDocumentOrGenerationIsAbsent() {
    JsonNode observation = VECTORS.path("observation");
    JsonNode node = null;
    for (JsonNode candidate : observation.path("nodes")) {
      if (candidate.path("nodeId").asText().equals("open-primary")) {
        node = candidate;
      }
    }
    assertThat(
            GuidedQualifiedLabel.regionName(
                    observation,
                    observation.path("documentId"),
                    observation.path("generation"),
                    node)
                .asText())
        .isEqualTo("Primary workspace");
    assertThat(
            GuidedQualifiedLabel.regionName(
                    observation,
                    new com.fasterxml.jackson.databind.node.TextNode("other"),
                    observation.path("generation"),
                    node)
                .isNull())
        .isTrue();
    assertThat(
            GuidedQualifiedLabel.regionName(
                    observation,
                    observation.path("documentId"),
                    new com.fasterxml.jackson.databind.node.IntNode(4),
                    node)
                .isNull())
        .isTrue();
  }
}
