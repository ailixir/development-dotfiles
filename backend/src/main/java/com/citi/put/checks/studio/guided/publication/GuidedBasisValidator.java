package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Pure joins over the frozen basis; private value reconstruction stays at the SQL boundary. */
final class GuidedBasisValidator {
  private final GuidedContracts contracts;

  GuidedBasisValidator(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  void validate(JsonNode basis) {
    JsonNode history = basis.path("materializationEvidence");
    int previousCount = -1;
    String previousHash = null;
    var inputIds = new HashSet<String>();
    for (int ordinal = 0; ordinal < history.path("entries").size(); ordinal++) {
      JsonNode entry = history.path("entries").get(ordinal), metadata = entry.path("metadata");
      require(
          entry.path("inputOrdinal").asInt(-1) == ordinal
              && inputIds.add(entry.path("inputId").asText())
              && entry.path("inputId").equals(metadata.path("inputId"))
              && !metadata.has("value"),
          "EVIDENCE_MISMATCH",
          422);
    }
    for (int index = 0; index < history.path("versions").size(); index++) {
      JsonNode header = history.path("versions").get(index);
      int count = header.path("inputCount").asInt(-1);
      require(
          header.path("contextRevision").asInt(-1) == index + 1
              && count > previousCount
              && count <= history.path("entries").size()
              && (previousHash == null
                  ? header.path("previousInputsHash").isNull()
                  : header.path("previousInputsHash").asText().equals(previousHash)),
          "EVIDENCE_MISMATCH",
          422);
      for (String field : List.of("sessionId", "sourceRevision", "configurationRevision")) {
        require(header.path(field).equals(basis.path(field)), "EVIDENCE_MISMATCH", 422);
      }
      require(
          header.path("scopeHash").asText().equals(GuidedContracts.hash(basis.path("scope"))),
          "EVIDENCE_MISMATCH",
          422);
      if (index > 0) {
        for (String field : List.of("contextId", "workerId", "ownerFence")) {
          require(
              header.path(field).equals(history.path("versions").get(0).path(field)),
              "EVIDENCE_MISMATCH",
              422);
        }
        require(
            header.path("birthMaterializationRevision").asInt()
                > history
                    .path("versions")
                    .get(index - 1)
                    .path("birthMaterializationRevision")
                    .asInt(),
            "EVIDENCE_MISMATCH",
            422);
      }
      for (int at = Math.max(previousCount, 0); at < count; at++) {
        require(
            history.path("entries").get(at).path("introducedContextRevision").asInt(-1)
                == index + 1,
            "EVIDENCE_MISMATCH",
            422);
      }
      previousCount = count;
      previousHash = header.path("authoredInputsHash").asText();
    }
    require(
        previousCount == history.path("entries").size()
            && basis.path("authoredInputsHash").asText().equals(previousHash),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode first = history.path("versions").get(0), bootstrap = basis.path("bootstrap");
    require(
        first != null
            && bootstrap.path("contextRevision").asInt(-1) == 1
            && bootstrap.path("contextId").equals(first.path("contextId"))
            && bootstrap.path("ownerFence").equals(first.path("ownerFence"))
            && bootstrap.path("inputsHash").equals(first.path("authoredInputsHash")),
        "EVIDENCE_MISMATCH",
        422);
    var observations = new HashMap<String, JsonNode>();
    for (JsonNode row : basis.path("observations")) {
      com.citi.put.checks.studio.guided.translation.GuidedOutline.requireConsistent(
          row.path("observation"));
      require(
          GuidedContracts.hash(row.path("observation")).equals(row.path("observationHash").asText())
              && observations.putIfAbsent(
                      row.path("observationHash").asText(), row.path("observation"))
                  == null,
          "EVIDENCE_MISMATCH",
          422);
    }
    var usedObservations = new HashSet<String>();
    var admissions = new HashSet<String>();
    for (JsonNode action : basis.path("actions")) {
      validateAction(basis, action, observations, usedObservations);
      require(
          admissions.add(action.path("ledger").path("admission").path("admissionId").asText()),
          "EVIDENCE_MISMATCH",
          422);
    }
    JsonNode incremental = basis.path("incrementalEvidence");
    if (incremental.isObject()) {
      validatePrefix(basis, incremental, observations, usedObservations);
      for (JsonNode excluded : incremental.path("excludedAttempts")) {
        validateAction(
            basis,
            excluded.path("action"),
            excluded.path("preparation"),
            observations,
            usedObservations);
        require(
            !admissions.contains(
                excluded
                    .path("action")
                    .path("ledger")
                    .path("admission")
                    .path("admissionId")
                    .asText()),
            "EVIDENCE_MISMATCH",
            422);
      }
    }
    require(usedObservations.equals(observations.keySet()), "EVIDENCE_MISMATCH", 422);
    GuidedGuardSourceAuthority.validatePublic(contracts, basis);
  }

  private void validateAction(
      JsonNode basis, JsonNode fact, Map<String, JsonNode> observations, Set<String> used) {
    JsonNode preparation =
        GuidedPlanBuilder.unique(
            basis.path("preparations"), "preparationId", fact.path("preparationId").asText());
    validateAction(basis, fact, preparation, observations, used);
  }

  private void validateAction(
      JsonNode basis,
      JsonNode fact,
      JsonNode preparation,
      Map<String, JsonNode> observations,
      Set<String> used) {
    JsonNode ledger = fact.path("ledger"),
        proposal = preparation.path("proposal"),
        proof = preparation.path("proof");
    int revision = ledger.path("contextRevision").asInt();
    ObjectNode context =
        GuidedMaterializationEvidence.versionContext(
            contracts, basis.path("materializationEvidence"), revision);
    JsonNode header = basis.path("materializationEvidence").path("versions").get(revision - 1);
    String digest = GuidedContracts.hash(proposal);
    require(
        digest.equals(ledger.path("requestDigest").asText())
            && digest.equals(proof.path("requestDigest").asText())
            && ledger.path("preparationId").equals(preparation.path("preparationId"))
            && ledger.path("preparationId").equals(proof.path("preparationId"))
            && preparation.path("materializationRevision").asInt(-1)
                >= header.path("birthMaterializationRevision").asInt(),
        "EVIDENCE_MISMATCH",
        422);
    for (String field : List.of("sessionId", "scopeHash")) {
      JsonNode expected =
          field.equals("scopeHash")
              ? com.fasterxml.jackson.databind.node.TextNode.valueOf(
                  GuidedContracts.hash(basis.path("scope")))
              : basis.path(field);
      require(
          proposal.path(field).equals(expected)
              && proof.path(field).equals(expected)
              && ledger.path(field).equals(expected),
          "EVIDENCE_MISMATCH",
          422);
    }
    for (String field : List.of("sourceRevision", "configurationRevision")) {
      require(proof.path(field).equals(basis.path(field)), "EVIDENCE_MISMATCH", 422);
    }
    require(
        proof.path("ownerFence").equals(context.path("ownerFence"))
            && ledger.path("ownerFence").equals(context.path("ownerFence")),
        "EVIDENCE_MISMATCH",
        422);
    for (String field : List.of("contextRevision", "authoredInputsHash")) {
      require(
          proposal.path(field).equals(context.path(field))
              && proof.path(field).equals(context.path(field))
              && ledger.path(field).equals(context.path(field)),
          "EVIDENCE_MISMATCH",
          422);
    }
    require(
        proof.path("workerId").equals(header.path("workerId"))
            && proof.path("contextId").equals(header.path("contextId"))
            && proposal.path("coordinate").equals(ledger.path("coordinate"))
            && proposal.path("executionEvidence").equals(preparation.path("executionEvidence"))
            && proposal.path("executionEvidence").equals(ledger.path("executionEvidence"))
            && proposal.path("evidenceHash").equals(ledger.path("evidenceHash"))
            && proposal.path("evidenceHash").equals(proof.path("evidenceHash"))
            && GuidedContracts.hash(proposal.path("executionEvidence"))
                .equals(proposal.path("evidenceHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    observedEvidence(basis, proposal.path("executionEvidence"), observations, used);
    if (preparation.has("observedChoice")) {
      choiceObservation(basis, fact, preparation, context, observations, used);
    }
    require(
        com.citi.put.checks.studio.guided.session.GuidedOperationIdentity.of(
                proposal, proof.path("target"))
            .equals(ledger.path("operationHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    ObjectNode policy =
        contracts
            .object()
            .put("scopeHash", GuidedContracts.hash(basis.path("scope")))
            .put("requestDigest", digest);
    policy.set("preparation", proof);
    require(
        GuidedContracts.hash(policy)
            .equals(ledger.path("admission").path("policyDecisionHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    var sourceHistory = contracts.object().putArray("history");
    for (JsonNode historical : basis.path("actions")) {
      JsonNode preparedRow =
          GuidedPlanBuilder.unique(
              basis.path("preparations"),
              "preparationId",
              historical.path("preparationId").asText());
      var row = sourceHistory.addObject();
      row.set("ledger", historical.path("ledger"));
      row.set("proposal", preparedRow.path("proposal"));
      row.set("proof", preparedRow.path("proof"));
    }
    com.citi.put.checks.studio.guided.session.GuidedPreparationCrossCheck.verifySourceHistory(
        contracts,
        basis.path("translationPlan"),
        proposal,
        proof,
        sourceHistory,
        basis.path("producers"));
    JsonNode op = proposal.path("operation");
    var ids = new HashSet<String>();
    context.path("inputs").forEach(input -> ids.add(input.path("inputId").asText()));
    if (op.has("destinationInputId")) {
      require(ids.contains(op.path("destinationInputId").asText()), "REFERENCE_MISMATCH", 422);
    }
    for (String slot : List.of("value", "expected")) {
      if (op.path(slot).has("sourceInputId")) {
        require(
            ids.contains(op.path(slot).path("sourceInputId").asText()), "REFERENCE_MISMATCH", 422);
      }
    }
  }

  private void observedEvidence(
      JsonNode basis, JsonNode execution, Map<String, JsonNode> observations, Set<String> used) {
    if (execution.path("kind").asText().equals("initialBlank")) {
      require(
          execution.equals(basis.path("bootstrap").path("initialEvidence")),
          "EVIDENCE_MISMATCH",
          422);
      return;
    }
    JsonNode snapshot = observations.get(execution.path("observationHash").asText());
    require(
        snapshot != null
            && execution.path("sessionId").equals(basis.path("sessionId"))
            && execution.path("contextId").equals(basis.path("bootstrap").path("contextId")),
        "EVIDENCE_MISMATCH",
        422);
    for (String field : List.of("documentId", "generation", "origin")) {
      require(execution.path(field).equals(snapshot.path(field)), "EVIDENCE_MISMATCH", 422);
    }
    used.add(execution.path("observationHash").asText());
  }

  /** A historical question capture is an anchor only through its actual exercised preparation. */
  private void choiceObservation(
      JsonNode basis,
      JsonNode fact,
      JsonNode preparation,
      JsonNode context,
      Map<String, JsonNode> observations,
      Set<String> used) {
    JsonNode witness = preparation.path("observedChoice"),
        identity = witness.path("context"),
        capture = identity.path("questionCapture"),
        question = identity.path("question"),
        receipt = witness.path("receipt"),
        evidence = capture.path("executionEvidence");
    require(
        identity.path("sessionId").equals(basis.path("sessionId"))
            && identity.path("scopeHash").asText().equals(GuidedContracts.hash(basis.path("scope")))
            && receipt.path("preparationId").equals(preparation.path("preparationId"))
            && receipt.path("obligationId").equals(fact.path("obligationId"))
            && capture.path("obligationId").equals(fact.path("obligationId"))
            && receipt.path("contextIdentityHash").asText().equals(GuidedContracts.hash(identity))
            && receipt.path("questionCaptureHash").asText().equals(GuidedContracts.hash(capture))
            && capture.path("evidenceHash").asText().equals(GuidedContracts.hash(evidence))
            && capture.path("observationHash").equals(evidence.path("observationHash"))
            && evidence.path("kind").asText().equals("observedDocument")
            && question.path("documentId").equals(evidence.path("documentId"))
            && question.path("generation").equals(evidence.path("generation"))
            && question.path("coordinate").equals(preparation.path("proposal").path("coordinate"))
            && preparation.path("executionEvidence").path("generation").asLong()
                > evidence.path("generation").asLong(),
        "EVIDENCE_MISMATCH",
        422);
    for (String field :
        List.of("contextId", "contextRevision", "authoredInputsHash", "workerId", "ownerFence")) {
      require(capture.path(field).equals(context.path(field)), "EVIDENCE_MISMATCH", 422);
    }
    observedEvidence(basis, evidence, observations, used);
  }

  private void validatePrefix(
      JsonNode basis, JsonNode incremental, Map<String, JsonNode> observations, Set<String> used) {
    JsonNode first = incremental.path("firstSuffixAcceptance");
    require(
        first.path("sessionId").equals(basis.path("sessionId"))
            && first
                .path("retainedPrefixAdmissionIds")
                .equals(incremental.path("switch").path("retainedPrefixAdmissionIds"))
            && first.path("planRevision").asLong()
                == first.path("previousPlanRevision").asLong() + 1
            && java.math.BigInteger.valueOf(first.path("planRevision").asLong())
                    .compareTo(new java.math.BigInteger(basis.path("translationRevision").asText()))
                <= 0,
        "EVIDENCE_MISMATCH",
        422);
    var order = new HashMap<String, Integer>();
    for (JsonNode source : basis.path("sourceSteps")) {
      order.put(source.path("stepId").asText(), source.path("ordinal").asInt());
    }
    String previousDigest = "";
    int previousStep = -1, previousOrdinal = -1, previousGeneration = -1;
    var digests = new HashSet<String>();
    for (JsonNode request : incremental.path("prefixRequests")) {
      int index = order.getOrDefault(request.path("coordinate").path("stepId").asText(), -1);
      int ordinal = request.path("coordinate").path("ordinal").asInt();
      String digest = GuidedContracts.hash(request);
      JsonNode context =
          GuidedMaterializationEvidence.versionContext(
              contracts,
              basis.path("materializationEvidence"),
              request.path("contextRevision").asInt());
      for (String field :
          List.of("workerId", "ownerFence", "contextId", "contextRevision", "authoredInputsHash")) {
        require(request.path(field).equals(context.path(field)), "EVIDENCE_MISMATCH", 422);
      }
      require(
          request.path("sessionId").equals(basis.path("sessionId"))
              && request
                  .path("scopeHash")
                  .asText()
                  .equals(GuidedContracts.hash(basis.path("scope")))
              && request.path("sourceRevision").equals(basis.path("sourceRevision"))
              && request.path("configurationRevision").equals(basis.path("configurationRevision"))
              && request
                  .path("prefixProgramHash")
                  .equals(incremental.path("plan").path("prefixProgramHash"))
              && index >= 0
              && index < incremental.path("plan").path("initialFirstLearnIndex").asInt()
              && digests.add(digest),
          "EVIDENCE_MISMATCH",
          422);
      int generation = -1;
      if (request
          .path("evidenceHash")
          .asText()
          .equals(GuidedContracts.hash(basis.path("bootstrap").path("initialEvidence")))) {
        generation = 0;
      }
      for (var observed : observations.entrySet()) {
        ObjectNode execution =
            contracts
                .object()
                .put("kind", "observedDocument")
                .put("sessionId", basis.path("sessionId").asText())
                .put("contextId", context.path("contextId").asText())
                .put("observationHash", observed.getKey());
        for (String field : List.of("documentId", "generation", "origin")) {
          execution.set(field, observed.getValue().path(field));
        }
        if (GuidedContracts.hash(execution).equals(request.path("evidenceHash").asText())) {
          generation = observed.getValue().path("generation").asInt();
          used.add(observed.getKey());
        }
      }
      require(
          generation >= 0
              && (index > previousStep
                  || index == previousStep
                      && (ordinal > previousOrdinal
                          || ordinal == previousOrdinal
                              && (generation > previousGeneration
                                  || generation == previousGeneration
                                      && digest.compareTo(previousDigest) > 0))),
          "EVIDENCE_MISMATCH",
          422);
      previousStep = index;
      previousOrdinal = ordinal;
      previousGeneration = generation;
      previousDigest = digest;
    }
    if (incremental.path("switch").path("reason").asText().equals("DRIFT")) {
      JsonNode receipt = incremental.path("driftReceipt");
      require(digests.contains(receipt.path("requestDigest").asText()), "EVIDENCE_MISMATCH", 422);
      JsonNode request = null;
      for (JsonNode candidate : incremental.path("prefixRequests")) {
        if (GuidedContracts.hash(candidate).equals(receipt.path("requestDigest").asText())) {
          request = candidate;
        }
      }
      for (String field :
          List.of(
              "sessionId",
              "workerId",
              "ownerFence",
              "scopeHash",
              "contextId",
              "contextRevision",
              "authoredInputsHash",
              "sourceRevision",
              "configurationRevision",
              "prefixProgramHash",
              "coordinate",
              "evidenceHash")) {
        require(
            request != null && receipt.path(field).equals(request.path(field)),
            "EVIDENCE_MISMATCH",
            422);
      }
      require(
          receipt.path("phase").asText().equals("PRE_ADMISSION")
              ? incremental.path("excludedAttempts").isEmpty()
              : incremental.path("excludedAttempts").size() == 1,
          "EVIDENCE_MISMATCH",
          422);
    }
  }
}
