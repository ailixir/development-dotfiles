package com.citi.put.checks.studio.guided.publication;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/** Pure policy projection: a frozen graph records requirements, never current execution grants. */
public final class ObservedReferencePolicyDeriver {
  private final GuidedContracts contracts;

  public ObservedReferencePolicyDeriver(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public ObjectNode derive(JsonNode basis, JsonNode plan, JsonNode recipes) {
    ArrayNode admissions = contracts.object().putArray("admissions");
    for (JsonNode fact : basis.path("actions")) {
      JsonNode ledger = fact.path("ledger");
      ObjectNode tuple = admissions.addObject();
      for (String field :
          java.util.List.of("coordinate", "admission", "operationHash", "scopeHash")) {
        tuple.set(field, ledger.path(field));
      }
    }
    ObjectNode evidence =
        contracts
            .object()
            .put("version", 1)
            .put("basisHash", GuidedContracts.hash(basis))
            .put("runAuthorizationHash", GuidedContracts.hash(basis.path("runAuthorization")))
            .put("translationHash", basis.path("translationHash").asText())
            .put("bootstrapHash", GuidedContracts.hash(basis.path("bootstrap")))
            .put("sourceManifestHash", basis.path("sourceManifestHash").asText());
    ObjectNode policy =
        contracts
            .object()
            .put("schemaVersion", 4)
            .put("learnedPlanHash", GuidedContracts.hash(plan))
            .put("admissionProvenanceHash", GuidedContracts.hash(admissions))
            .put("publicationEvidenceHash", GuidedContracts.hash(evidence))
            .put("runAuthorizationHash", GuidedContracts.hash(basis.path("runAuthorization")));
    policy.set("scope", basis.path("replayRequirements").deepCopy());
    policy.set("inputs", recipes.deepCopy());
    policy.set("bindings", basis.path("bindings").deepCopy());
    policy.set("transfers", basis.path("transfers").deepCopy());
    return policy;
  }
}
