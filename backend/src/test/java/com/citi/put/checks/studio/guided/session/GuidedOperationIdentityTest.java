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
 * ADR-SC-008 D2: a step's operation hash has one definition, {@code
 * sha256(canonical-v1({coordinate, origin, operation}))}. The same vectors are pinned in the
 * contract fixtures that the runner and the contract tools reproduce.
 */
class GuidedOperationIdentityTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final Path CONTRACTS =
      Path.of("../docs/specs/studio-observed-authoring/contracts/v3");

  private static ObjectNode step(String code) {
    ObjectNode operation = C.object().put("kind", "step").put("code", code);
    operation.putArray("captures");
    operation.putArray("uses");
    operation.put("sourceHash", GuidedContracts.hash(C.object().textNode(code)));
    return operation;
  }

  @Test
  void theHashedDocumentIsTheClosedThreeKeyDocument() {
    ObjectNode coordinate = C.object().put("stepId", "step-1").put("ordinal", 0);
    ObjectNode operation = C.object().put("kind", "step").put("code", "x");
    String canonical =
        GuidedContracts.canonical(
            GuidedOperationIdentity.preimage(coordinate, NullNode.instance, operation));
    assertThat(canonical)
        .isEqualTo(
            "{\"coordinate\":{\"ordinal\":0,\"stepId\":\"step-1\"},"
                + "\"operation\":{\"code\":\"x\",\"kind\":\"step\"},"
                + "\"origin\":null}");
  }

  @Test
  void aMissingOriginIsAJsonNullNotAnAbsentKey() {
    ObjectNode coordinate = C.object().put("stepId", "step-1").put("ordinal", 0);
    ObjectNode operation = step("await page.goto('x');");
    ObjectNode proposal = C.object();
    proposal.set("coordinate", coordinate);
    proposal.set("operation", operation);
    proposal.putObject("executionEvidence").put("kind", "initialBlank");
    assertThat(GuidedOperationIdentity.of(proposal))
        .isEqualTo(GuidedOperationIdentity.hash(coordinate, NullNode.instance, operation));
    assertThat(GuidedOperationIdentity.preimage(coordinate, null, operation).get("origin").isNull())
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
              "secret fill with a null target",
              "step operation identity with an input and a capture",
              "step operation identity with a secret handle")
          .contains(name)) {
        continue;
      }
      JsonNode value = vector.path("value");
      assertThat(
              GuidedContracts.canonical(
                  GuidedOperationIdentity.preimage(
                      value.path("coordinate"), value.path("origin"), value.path("operation"))))
          .as(name + " canonical preimage")
          .isEqualTo(vector.path("canonical").asText());
      assertThat(
              GuidedOperationIdentity.hash(
                  value.path("coordinate"), value.path("origin"), value.path("operation")))
          .as(name + " digest")
          .isEqualTo(vector.path("sha256").asText());
      checked++;
    }
    assertThat(checked).isEqualTo(5);
  }

  @Test
  void everyLedgerOperationHashOfTheFixtureBasisIsTheIdentityOfItsProposal() throws Exception {
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
      assertThat(GuidedOperationIdentity.of(preparation.path("proposal")))
          .as(action.path("preparationId").asText())
          .isEqualTo(action.path("ledger").path("operationHash").asText());
      checked++;
    }
    assertThat(checked).isEqualTo(basis.path("actions").size()).isPositive();
  }

  @Test
  void theDocumentAndGenerationOfTheProposalAreNotPartOfTheIdentity() {
    ObjectNode operation = step("await page.getByRole('button').click();");
    assertThat(GuidedOperationIdentity.of(proposal("doc-1", 2, operation)))
        .isEqualTo(GuidedOperationIdentity.of(proposal("doc-9", 6, operation)));
    // The code is part of it: one byte of code is another identity.
    assertThat(GuidedOperationIdentity.of(proposal("doc-1", 2, step("await a();"))))
        .isNotEqualTo(GuidedOperationIdentity.of(proposal("doc-1", 2, step("await b();"))));
  }

  private static ObjectNode proposal(String documentId, int generation, ObjectNode operation) {
    ObjectNode proposal = C.object();
    proposal.putObject("coordinate").put("stepId", "step-1").put("ordinal", 0);
    proposal
        .putObject("executionEvidence")
        .put("kind", "observedDocument")
        .put("documentId", documentId)
        .put("generation", generation)
        .put("origin", "https://orders.example.test");
    proposal.set("operation", operation);
    return proposal;
  }
}
