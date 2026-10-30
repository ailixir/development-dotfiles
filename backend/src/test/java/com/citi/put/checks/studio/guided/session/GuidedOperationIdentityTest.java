package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D2 / I-4: the operation hash has one definition, {@code
 * sha256(canonical-v1({coordinate, origin, target, operation}))}, where target is null or the
 * runner-reported ResolvedTarget of the preparation proof. The same vectors are pinned in the
 * contract fixtures that the runner and the contract tools reproduce.
 */
class GuidedOperationIdentityTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final Path CONTRACTS =
      Path.of("../docs/specs/studio-observed-authoring/contracts/v3");

  @Test
  void theHashedDocumentIsTheClosedFourKeyDocument() {
    ObjectNode coordinate = C.object().put("stepId", "step-1").put("ordinal", 0);
    ObjectNode operation =
        C.object().put("kind", "navigate").put("destinationInputId", "input-destination");
    String canonical =
        GuidedContracts.canonical(
            GuidedOperationIdentity.preimage(
                coordinate, NullNode.instance, NullNode.instance, operation));
    assertThat(canonical)
        .isEqualTo(
            "{\"coordinate\":{\"ordinal\":0,\"stepId\":\"step-1\"},"
                + "\"operation\":{\"destinationInputId\":\"input-destination\",\"kind\":\"navigate\"},"
                + "\"origin\":null,\"target\":null}");
  }

  @Test
  void aMissingOriginOrTargetIsAJsonNullNotAnAbsentKey() {
    ObjectNode coordinate = C.object().put("stepId", "step-1").put("ordinal", 0);
    ObjectNode operation = C.object().put("kind", "click");
    ObjectNode proposal = C.object();
    proposal.set("coordinate", coordinate);
    proposal.set("operation", operation);
    proposal.putObject("executionEvidence").put("kind", "initialBlank");
    assertThat(GuidedOperationIdentity.of(proposal, C.object().path("target")))
        .isEqualTo(
            GuidedOperationIdentity.hash(
                coordinate, NullNode.instance, NullNode.instance, operation));
    assertThat(
            GuidedOperationIdentity.preimage(coordinate, null, null, operation)
                .get("origin")
                .isNull())
        .isTrue();
  }

  @Test
  void theOperationVectorsPinnedInTheContractFixturesAreReproduced() throws Exception {
    JsonNode vectors =
        C.parse(Files.readString(CONTRACTS.resolve("fixtures.json"))).path("hashVectors");
    int checked = 0;
    for (JsonNode vector : vectors) {
      String name = vector.path("name").asText();
      if (!List.of(
              "initial navigation operation with actual null origin",
              "operation on a runner-reported resolved target",
              "secret fill with a null target")
          .contains(name)) {
        continue;
      }
      JsonNode value = vector.path("value");
      assertThat(
              GuidedContracts.canonical(
                  GuidedOperationIdentity.preimage(
                      value.path("coordinate"),
                      value.path("origin"),
                      value.path("target"),
                      value.path("operation"))))
          .as(name + " canonical preimage")
          .isEqualTo(vector.path("canonical").asText());
      assertThat(
              GuidedOperationIdentity.hash(
                  value.path("coordinate"),
                  value.path("origin"),
                  value.path("target"),
                  value.path("operation")))
          .as(name + " digest")
          .isEqualTo(vector.path("sha256").asText());
      checked++;
    }
    assertThat(checked).isEqualTo(3);
  }

  @Test
  void everyLedgerOperationHashOfTheFixtureBasisIsTheIdentityOfItsProposalAndReportedTarget()
      throws Exception {
    JsonNode basis =
        C.parse(Files.readString(CONTRACTS.resolve("publication-fixtures.json"))).path("basis");
    int checked = 0;
    for (JsonNode action : basis.path("actions")) {
      JsonNode preparation = null;
      for (JsonNode candidate : basis.path("preparations")) {
        if (candidate.path("preparationId").equals(action.path("preparationId"))) {
          preparation = candidate;
        }
      }
      assertThat(preparation).isNotNull();
      assertThat(
              GuidedOperationIdentity.of(
                  preparation.path("proposal"), preparation.path("proof").path("target")))
          .as(action.path("preparationId").asText())
          .isEqualTo(action.path("ledger").path("operationHash").asText());
      checked++;
    }
    assertThat(checked).isEqualTo(basis.path("actions").size()).isPositive();
  }

  @Test
  void theRefDocumentAndGenerationOfTheProposalAreNotPartOfTheIdentity() {
    ObjectNode operation = C.object().put("kind", "click");
    ObjectNode target = C.object();
    target.putArray("locator").addObject().put("by", "testId").put("value", "save");
    target.put("tier", "testId");
    target.putObject("identity").put("role", "button").put("name", "Save");
    ObjectNode first = proposal("e3", "doc-1", 2, operation);
    ObjectNode later = proposal("e17", "doc-9", 6, operation);
    assertThat(GuidedOperationIdentity.of(first, target))
        .isEqualTo(GuidedOperationIdentity.of(later, target));
    ObjectNode other = target.deepCopy();
    ((ObjectNode) other.path("locator").get(0)).put("value", "cancel");
    assertThat(GuidedOperationIdentity.of(first, other))
        .isNotEqualTo(GuidedOperationIdentity.of(first, target));
    assertThat(GuidedOperationIdentity.of(first, NullNode.instance))
        .isNotEqualTo(GuidedOperationIdentity.of(first, target));
  }

  private static ObjectNode proposal(
      String ref, String documentId, int generation, ObjectNode operation) {
    ObjectNode proposal = C.object();
    proposal.putObject("coordinate").put("stepId", "step-1").put("ordinal", 1);
    proposal
        .putObject("executionEvidence")
        .put("kind", "observedDocument")
        .put("origin", "https://orders.example.test");
    proposal
        .putObject("target")
        .put("kind", "node")
        .put("ref", ref)
        .put("documentId", documentId)
        .put("generation", generation);
    proposal.set("operation", operation);
    return proposal;
  }
}
