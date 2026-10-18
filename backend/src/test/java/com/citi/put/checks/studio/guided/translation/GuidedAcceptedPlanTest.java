package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class GuidedAcceptedPlanTest {
  private static final GuidedContracts C = new GuidedContracts();

  private ObjectNode plan() throws Exception {
    return C.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")))
        .path("basis")
        .path("translationPlan")
        .deepCopy();
  }

  @Test
  void internalServerIdentitiesRemainExactWhileRawWireRejectsThem() throws Exception {
    ObjectNode plan = plan(), before = plan.deepCopy();
    GuidedAcceptedPlan.validate(C, plan);
    assertThat(plan).isEqualTo(before);
    assertThatThrownBy(() -> C.validate("v3/source-selection", plan))
        .isInstanceOf(GuidedSessionException.class);
    ((ObjectNode) plan.path("obligations").get(0)).remove("obligationId");
    assertThatThrownBy(() -> GuidedAcceptedPlan.validate(C, plan))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void pendingNewNeedUsesRawDefinitionAndCannotClaimAnUnconsumedImport() throws Exception {
    ObjectNode plan = plan();
    ObjectNode need = (ObjectNode) plan.path("needs").get(0);
    need.remove("bindingId");
    GuidedAcceptedPlan.validateBeforeAllocation(C, plan);
    assertThatThrownBy(() -> GuidedAcceptedPlan.validate(C, plan))
        .isInstanceOf(GuidedSessionException.class);
    need.putArray("consumers");
    assertThatThrownBy(() -> GuidedAcceptedPlan.validateBeforeAllocation(C, plan))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void duplicateServerIdentitiesCoordinatesAndUnknownFieldsAreRefused() throws Exception {
    ObjectNode duplicate = plan();
    ((ObjectNode) duplicate.path("obligations").get(1))
        .set("obligationId", duplicate.path("obligations").get(0).path("obligationId"));
    assertThatThrownBy(() -> GuidedAcceptedPlan.validate(C, duplicate))
        .isInstanceOf(GuidedSessionException.class);
    ObjectNode unknown = plan().put("prefixAuthority", true);
    assertThatThrownBy(() -> GuidedAcceptedPlan.validateBeforeAllocation(C, unknown))
        .isInstanceOf(GuidedSessionException.class);
    ObjectNode unbound = plan();
    ((ObjectNode) unbound.path("needs").get(0)).put("bindingId", "");
    assertThatThrownBy(() -> GuidedAcceptedPlan.validate(C, unbound))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void beforeAllocationKeepsBoundImportedZeroNeedAndFreshRawNeedDistinct() throws Exception {
    ObjectNode plan = plan();
    ObjectNode retained = (ObjectNode) plan.path("needs").get(0);
    ObjectNode fresh = retained.deepCopy();
    fresh.put("needId", "new-model-need");
    fresh.remove("bindingId");
    retained.putArray("consumers");
    ((com.fasterxml.jackson.databind.node.ArrayNode) plan.path("needs")).add(fresh);
    JsonNode before = plan.deepCopy();
    GuidedAcceptedPlan.validateBeforeAllocation(C, plan);
    assertThat(plan).isEqualTo(before);
    assertThatThrownBy(() -> GuidedAcceptedPlan.validate(C, plan))
        .isInstanceOf(GuidedSessionException.class);
    fresh.putArray("consumers");
    assertThatThrownBy(() -> GuidedAcceptedPlan.validateBeforeAllocation(C, plan))
        .isInstanceOf(GuidedSessionException.class);
  }

  @org.junit.jupiter.params.ParameterizedTest(name = "internal accepted plan rejects {0}")
  @org.junit.jupiter.params.provider.ValueSource(
      strings = {
        "duplicate-coordinate",
        "duplicate-need-id",
        "duplicate-binding-id",
        "duplicate-consumer-pair",
        "reference-out-of-range",
        "unknown-need-property",
        "unknown-obligation-property"
      })
  void internalIdentifiersAndClosedShapesAreCheckedBeforeAnyHistoryWrite(String mutation)
      throws Exception {
    ObjectNode plan = plan();
    ObjectNode first = (ObjectNode) plan.path("obligations").get(0),
        second = (ObjectNode) plan.path("obligations").get(1);
    ObjectNode need = (ObjectNode) plan.path("needs").get(0);
    var needs = (com.fasterxml.jackson.databind.node.ArrayNode) plan.path("needs");
    switch (mutation) {
      case "duplicate-coordinate" -> {
        second.set("stepId", first.path("stepId"));
        second.set("occurrence", first.path("occurrence"));
      }
      case "duplicate-need-id" ->
          needs.add(need.deepCopy().put("bindingId", "different-server-binding"));
      case "duplicate-binding-id" ->
          needs.add(need.deepCopy().put("needId", "different-server-need"));
      case "duplicate-consumer-pair" ->
          ((com.fasterxml.jackson.databind.node.ArrayNode) need.path("consumers"))
              .add(need.path("consumers").get(0).deepCopy());
      case "reference-out-of-range" ->
          first.put("referenceIndex", plan.path("sourceReferences").size());
      case "unknown-need-property" -> need.put("trusted", true);
      case "unknown-obligation-property" -> first.put("allowReplay", true);
      default -> throw new AssertionError(mutation);
    }
    assertThatThrownBy(() -> GuidedAcceptedPlan.validate(C, plan))
        .isInstanceOf(GuidedSessionException.class);
    assertThatThrownBy(() -> GuidedAcceptedPlan.validateBeforeAllocation(C, plan))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void acceptedZeroConsumerShapeCannotReplaceActualRetainedProducerAuthority() throws Exception {
    JsonNode fixtures =
        C.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    JsonNode positive = null;
    for (JsonNode vector : fixtures.path("graphTimingConformance").path("graphCases")) {
      if (vector.path("name").asText().equals("admitted-binding-replacement")) {
        positive = vector.path("basis");
      }
    }
    assertThat(positive).isNotNull();
    GuidedAcceptedPlan.validate(C, positive.path("translationPlan"));
    assertThat(
            new com.citi.put.checks.studio.guided.publication.GuidedEffectiveGraph(C)
                .project(positive)
                .allocations()
                .get(0)
                .path("consumers"))
        .isEmpty();
    ObjectNode forged = positive.deepCopy();
    ((ObjectNode) forged.path("incrementalEvidence").path("switch"))
        .putArray("retainedPrefixAdmissionIds");
    assertThatThrownBy(
            () ->
                new com.citi.put.checks.studio.guided.publication.GuidedEffectiveGraph(C)
                    .project(forged))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void ordinaryHistoryPreservesActualServerMeaningAndConsumerBytes() throws Exception {
    JsonNode old = plan();
    var audit =
        new GuidedPlanHistoryAudit(
            org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class), C);
    audit.transition(C.object(), C.object().nullNode(), old, false);
    audit.transition(C.object(), old, old.deepCopy(), false);
    ObjectNode removed = old.deepCopy();
    ((com.fasterxml.jackson.databind.node.ArrayNode) removed.path("obligations")).remove(0);
    assertThatThrownBy(() -> audit.transition(C.object(), old, removed, false))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("IDEMPOTENCY_CONFLICT");
    ObjectNode shrunk = old.deepCopy();
    ((ObjectNode) shrunk.path("needs").get(0)).putArray("consumers");
    assertThatThrownBy(() -> audit.transition(C.object(), old, shrunk, false))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("BINDING_ORDER");
  }
}
