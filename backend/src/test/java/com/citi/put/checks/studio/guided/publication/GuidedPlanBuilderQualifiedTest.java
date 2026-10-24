package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Round 057 publication parity, Java side: the builder resolves a qualified obligation (non-null
 * scopeIntent, no accepted choice) exactly as admission did, against the same vectors the Node
 * validator reads (qualifiedLabelVectors.test.ts).
 */
class GuidedPlanBuilderQualifiedTest {
  static final GuidedContracts C = new GuidedContracts();
  static final JsonNode VECTORS = load();

  static JsonNode load() {
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

  private static ObjectNode prepared(JsonNode target) {
    ObjectNode prepared = C.object().put("observationHash", "h".repeat(64));
    ObjectNode proposalTarget = prepared.putObject("proposal").putObject("target");
    proposalTarget.setAll((ObjectNode) target.deepCopy());
    proposalTarget.put("documentId", VECTORS.at("/observation/documentId").asText());
    proposalTarget.put("generation", VECTORS.at("/observation/generation").asInt());
    return prepared;
  }

  private static Map<String, JsonNode> observations() {
    Map<String, JsonNode> map = new HashMap<>();
    map.put("h".repeat(64), C.object().set("observation", VECTORS.path("observation")));
    return map;
  }

  private static ObjectNode obligation(JsonNode vector) {
    ObjectNode obligation =
        C.object()
            .put("obligationId", "o1")
            .put("targetIntent", vector.path("targetIntent").asText());
    obligation.put("scopeIntent", vector.path("scopeIntent").asText());
    return obligation;
  }

  private static ObjectNode effective(
      ObjectNode obligation, ObjectNode prepared, Map<String, JsonNode> observations) {
    return new GuidedPlanBuilder(C)
        .effectiveObservedObligation(null, null, null, prepared, observations, obligation);
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("cases")
  void everySharedVectorAgrees(JsonNode vector) {
    ObjectNode obligation = obligation(vector);
    ObjectNode prepared = prepared(vector.path("target"));
    if (vector.path("expected").asText().equals("ACCEPT")) {
      ObjectNode effective = effective(obligation, prepared, observations());
      JsonNode locator = vector.path("target").path("locator");
      assertThat(effective.path("selectedLocator")).isEqualTo(locator);
      assertThat(effective.path("targetIntent").asText())
          .isEqualTo(
              locator
                  .path(locator.path("kind").asText().equals("role") ? "name" : "value")
                  .asText());
      // The raw obligation keeps its bare label and its qualifier.
      assertThat(obligation.path("targetIntent").asText())
          .isEqualTo(vector.path("targetIntent").asText());
      assertThat(effective.path("scopeIntent").asText())
          .isEqualTo(vector.path("scopeIntent").asText());
    } else {
      assertThatThrownBy(() -> effective(obligation, prepared, observations()))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              e -> {
                assertThat(e.getMessage()).isEqualTo("OPERATION_MISMATCH");
                assertThat(e.status()).isEqualTo(422);
              });
    }
  }

  @Test
  void anUnqualifiedObligationIsReturnedUnchanged() {
    ObjectNode obligation = C.object().put("obligationId", "o1").put("targetIntent", "Open");
    obligation.putNull("scopeIntent");
    ObjectNode effective =
        effective(obligation, prepared(VECTORS.at("/cases/0/target")), observations());
    assertThat(effective).isEqualTo(obligation);
    assertThat(effective.has("selectedLocator")).isFalse();
  }

  @Test
  void aMissingOrMismatchedEvidenceObservationIsAnEvidenceMismatch() {
    JsonNode vector = VECTORS.at("/cases/0");
    ObjectNode obligation = obligation(vector);
    assertThatThrownBy(
            () -> effective(obligation, prepared(vector.path("target")), new HashMap<>()))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> assertThat(e.getMessage()).isEqualTo("EVIDENCE_MISMATCH"));
    ObjectNode otherGeneration = prepared(vector.path("target"));
    ((ObjectNode) otherGeneration.at("/proposal/target")).put("generation", 99);
    assertThatThrownBy(() -> effective(obligation, otherGeneration, observations()))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> assertThat(e.getMessage()).isEqualTo("EVIDENCE_MISMATCH"));
  }

  @Test
  void aPageTargetCannotSatisfyAQualifiedObligation() {
    JsonNode vector = VECTORS.at("/cases/0");
    ObjectNode page = C.object().put("kind", "page");
    assertThatThrownBy(() -> effective(obligation(vector), prepared(page), observations()))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> assertThat(e.getMessage()).isEqualTo("OPERATION_MISMATCH"));
  }
}
