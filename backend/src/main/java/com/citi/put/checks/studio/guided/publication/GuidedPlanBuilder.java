package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.translation.GuidedProposalValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Reconstructs exercised evidence from independent original rows, never a model's final answer. */
public final class GuidedPlanBuilder {
  private final GuidedContracts contracts;
  private final GuidedProposalValidator proposals;

  public GuidedPlanBuilder(GuidedContracts contracts) {
    this.contracts = contracts;
    this.proposals = new GuidedProposalValidator(contracts);
  }

  /**
   * Truthful immutable learning pins: a missing historical full prompt/model version is unknown.
   */
  public ObjectNode learningProvenance(JsonNode manifest) {
    JsonNode pins = manifest.path("schemaPins");
    String strict = text(pins, "strictSchemaHash"), output = text(pins, "outputContractHash");
    require(
        strict.matches("[a-f0-9]{64}")
            && output.matches("[a-f0-9]{64}")
            && pins.path("providerSchemaHashes").isObject()
            && !pins.path("providerSchemaHashes").isEmpty(),
        "EVIDENCE_MISMATCH",
        422);
    for (String kind : List.of("SOURCE_PLAN", "NEXT_ACTION", "VERIFY_STEP")) {
      require(
          text(pins.path("providerSchemaHashes"), kind).matches("[a-f0-9]{64}"),
          "EVIDENCE_MISMATCH",
          422);
    }
    return contracts
        .object()
        .put("guidedModelContractHash", strict)
        .put("guidedProviderSchemaHash", GuidedContracts.hash(pins.path("providerSchemaHashes")))
        .putNull("guidedPromptHash")
        .put("outputContractHash", output)
        .put("publicationResultVersion", 3)
        .putNull("configuredModel")
        .putNull("providerReturnedModelVersion");
  }

  private static final String VALIDATION_BASIS =
      "v3/replay-validation#/definitions/ValidationBasis";

  public ObjectNode basis(
      PublicationContracts.Base original,
      PublicationContracts.CurrentSource current,
      PublicationContracts.Evidence evidence,
      JsonNode session,
      JsonNode learningProvenance) {
    ObjectNode result = derive(original, current, evidence, session, learningProvenance);
    contracts.validate(VALIDATION_BASIS, result);
    return result;
  }

  /**
   * The same derivation as {@link #basis}, skipping only the repeated pure schema check. {@code
   * validated} must be a document this process already passed through {@code basis()} or {@code
   * plan()}; never wire input. Validity is a pure function of the document, so an equal document
   * has the same verdict. Unequal or absent ⇒ validated here, with today's exact error
   * (STUDIO-OBS-015 ruling E-2).
   */
  public ObjectNode basisMatching(
      PublicationContracts.Base original,
      PublicationContracts.CurrentSource current,
      PublicationContracts.Evidence evidence,
      JsonNode session,
      JsonNode learningProvenance,
      JsonNode validated) {
    ObjectNode result = derive(original, current, evidence, session, learningProvenance);
    if (validated == null || !result.equals(validated)) {
      contracts.validate(VALIDATION_BASIS, result);
    }
    return result;
  }

  private ObjectNode derive(
      PublicationContracts.Base original,
      PublicationContracts.CurrentSource current,
      PublicationContracts.Evidence evidence,
      JsonNode session,
      JsonNode learningProvenance) {
    JsonNode base = original.document(), source = current.document(), raw = evidence.document();
    String sessionId = text(session, "sessionId");
    require(base.path("sessionId").asText().equals(sessionId), "EVIDENCE_MISMATCH", 422);
    JsonNode manifest = raw.path("sourceManifest"), plan = raw.path("translationPlan");
    require(
        GuidedContracts.hash(manifest).equals(text(base, "sourceManifestHash")),
        "EVIDENCE_MISMATCH",
        422);
    require(
        GuidedContracts.hash(plan).equals(text(raw, "translationHash")), "EVIDENCE_MISMATCH", 422);
    ObjectNode result = contracts.object().put("schemaVersion", 1);
    for (String key :
        List.of(
            "sessionId",
            "testId",
            "csiId",
            "sourceRevision",
            "configurationRevision",
            "sourceHash",
            "configurationHash",
            "authoringHash",
            "sourceManifestHash")) {
      result.set(key, base.path(key).deepCopy());
    }
    result.set("configuration", source.path("configuration").deepCopy());
    result.set("learningProvenance", learningProvenance.deepCopy());
    result.set("scope", session.path("scope").deepCopy());
    result.set("runAuthorization", session.path("runAuthorization").deepCopy());
    result.set("replayRequirements", base.path("replayRequirements").deepCopy());
    result.set("translationRevision", raw.path("translationRevision"));
    result.set("translationHash", raw.path("translationHash"));
    result.set("translationPlan", plan.deepCopy());
    result.set("sourceSelections", raw.path("sourceSelections").deepCopy());
    result.set("materializationEvidence", raw.path("materializationEvidence").deepCopy());
    result.set("incrementalEvidence", raw.path("incrementalEvidence").deepCopy());
    result.set("snapshotEvidence", raw.path("snapshotEvidence").deepCopy());
    proposals.sourceSelections(session, plan, raw.path("sourceSelections"));
    ArrayNode steps = result.putArray("sourceSteps");
    ArrayNode orderedSource = contracts.object().putArray("source");
    Map<String, Integer> order = new LinkedHashMap<>();
    for (JsonNode step : manifest.path("sourceSteps")) {
      String id = text(step, "stepId");
      require(!order.containsKey(id), "EVIDENCE_MISMATCH", 422);
      int ordinal = order.size();
      order.put(id, ordinal);
      steps.addObject().put("stepId", id).put("ordinal", ordinal).put("source", text(step, "text"));
      orderedSource.add(text(step, "text"));
    }
    require(
        !order.isEmpty()
            && order.size() <= 100
            && GuidedContracts.hash(orderedSource).equals(text(base, "sourceHash"))
            && GuidedContracts.hash(steps).equals(text(base, "authoringHash"))
            && GuidedContracts.hash(result.path("configuration"))
                .equals(text(base, "configurationHash")),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode materialization = raw.path("materialization");
    JsonNode materializationEvidence = raw.path("materializationEvidence");
    ObjectNode latestContext =
        GuidedMaterializationEvidence.versionContext(
            contracts, materializationEvidence, materializationEvidence.path("versions").size());
    require(
        materialization.path("inputs").equals(latestContext.path("inputs")),
        "EVIDENCE_MISMATCH",
        422);
    result.set("authoredInputsHash", materialization.path("authoredInputsHash"));
    ArrayNode inputs = result.putArray("inputs"),
        configs = result.putArray("configurationReferences");
    var inputIds = new HashSet<String>();
    var usedInputs = new HashSet<String>();
    for (JsonNode ledger : raw.path("actions")) {
      if (!ledger.path("state").asText().equals("SUCCEEDED")) {
        continue;
      }
      JsonNode joined =
          unique(
              raw.path("admissionAssociations"),
              "admissionId",
              text(ledger.path("admission"), "admissionId"));
      JsonNode proposal =
          unique(raw.path("preparations"), "preparationId", text(joined, "preparationId"))
              .path("proposal");
      JsonNode operation = proposal.path("operation");
      if (operation.has("destinationInputId")) {
        usedInputs.add(text(operation, "destinationInputId"));
      }
      for (String slot : List.of("value", "expected")) {
        if (operation.path(slot).has("sourceInputId")) {
          usedInputs.add(text(operation.path(slot), "sourceInputId"));
        }
      }
    }
    for (JsonNode input : materialization.path("inputs")) {
      if (!usedInputs.contains(text(input, "inputId"))) {
        continue;
      }
      require(
          !input.has("value") && inputIds.add(text(input, "inputId")), "REFERENCE_MISMATCH", 422);
      ObjectNode safe = inputs.addObject();
      for (String key : List.of("inputId", "kind", "intendedSlot", "provenance")) {
        safe.set(key, input.path(key).deepCopy());
      }
      safe.set("stepId", input.path("sourceStepId"));
      require(order.containsKey(text(safe, "stepId")), "REFERENCE_MISMATCH", 422);
      contracts.validate("v3/source-reference", input.path("provenance"));
      if (input.path("provenance").path("referenceKind").asText().equals("configuration")) {
        JsonNode mapped =
            unique(
                manifest.path("configurationReferences"),
                "referenceId",
                input.path("provenance").path("referenceId").asText());
        for (String key : List.of("kind", "intendedSlot")) {
          require(mapped.path(key).equals(input.path(key)), "REFERENCE_MISMATCH", 422);
        }
        require(
            mapped.path("stepId").equals(input.path("sourceStepId")), "REFERENCE_MISMATCH", 422);
        ObjectNode item = (ObjectNode) mapped.deepCopy();
        item.set("inputId", input.path("inputId"));
        configs.add(item);
      }
    }
    require(inputs.size() <= 200, "BUDGET_EXCEEDED", 413);
    ObjectNode context = contracts.object();
    context.putObject("authoredInputs").set("inputs", materialization.path("inputs"));
    Map<String, JsonNode> observations = index(raw.path("observations"), "observationHash");
    Map<String, JsonNode> preparations = index(raw.path("preparations"), "preparationId");
    Map<String, JsonNode> allAssociations =
        index(raw.path("obligationAssociations"), "obligationId");
    Map<String, JsonNode> allAdmissions = index(raw.path("admissionAssociations"), "admissionId");
    List<JsonNode> actions = new ArrayList<>();
    Map<String, JsonNode> associations = new LinkedHashMap<>(), admissions = new LinkedHashMap<>();
    ArrayNode excluded =
        result.path("incrementalEvidence").isObject()
            ? (ArrayNode) result.path("incrementalEvidence").path("excludedAttempts")
            : contracts.object().putArray("items");
    require(excluded.isEmpty(), "EVIDENCE_MISMATCH", 422);
    for (JsonNode ledger : raw.path("actions")) {
      contracts.validate("v3/ledger", ledger);
      String admissionId = text(ledger.path("admission"), "admissionId");
      JsonNode joined = allAdmissions.get(admissionId);
      require(joined != null, "EVIDENCE_MISMATCH", 422);
      JsonNode association = allAssociations.get(text(joined, "obligationId"));
      require(association != null, "EVIDENCE_MISMATCH", 422);
      if (ledger.path("state").asText().equals("SUCCEEDED")) {
        actions.add(ledger);
        admissions.put(admissionId, joined);
        associations.put(text(joined, "obligationId"), association);
      } else {
        require(
            excluded.isEmpty() && result.path("incrementalEvidence").isObject(),
            "EVIDENCE_MISMATCH",
            422);
        JsonNode receipt = result.path("incrementalEvidence").path("driftReceipt");
        JsonNode preparation = preparations.get(text(joined, "preparationId"));
        require(preparation != null, "EVIDENCE_MISMATCH", 422);
        verifyExcluded(
            session, result.path("incrementalEvidence"), ledger, association, preparation, receipt);
        ObjectNode fact = excluded.addObject();
        fact.putObject("action")
            .put("obligationId", text(joined, "obligationId"))
            .put("preparationId", text(joined, "preparationId"))
            .set("ledger", ledger.deepCopy());
        fact.set("preparation", preparation.deepCopy());
        ObjectNode excludedAssociation =
            fact.putObject("obligationAssociation")
                .put("obligationId", text(joined, "obligationId"))
                .put("admissionId", admissionId)
                .put("proposalHash", text(joined, "proposalHash"));
        excludedAssociation.set("coordinate", ledger.path("coordinate"));
      }
    }
    actions.sort(
        Comparator.comparingInt((JsonNode a) -> position(order, a.path("coordinate")))
            .thenComparingInt(a -> a.path("coordinate").path("ordinal").asInt()));
    require(
        actions.size() == plan.path("obligations").size()
            && actions.size() == associations.size()
            && actions.size() == admissions.size()
            && !actions.isEmpty()
            && actions.size() <= 200,
        "EVIDENCE_MISMATCH",
        422);
    ArrayNode actionFacts = result.putArray("actions"),
        obligationFacts = result.putArray("obligationAssociations");
    ArrayNode preparedFacts = result.putArray("preparations"),
        observedFacts = result.putArray("observations");
    var seenObservations = new HashSet<String>();
    var questionObservations = new java.util.LinkedHashSet<String>();
    var seenAdmissions = new HashSet<String>();
    var seenObligations = new HashSet<String>();
    Map<String, Integer> ordinal = new HashMap<>();
    for (JsonNode ledger : actions) {
      contracts.validate("v3/ledger", ledger);
      String admissionId = text(ledger.path("admission"), "admissionId");
      String stepId = text(ledger.path("coordinate"), "stepId");
      int expected = ordinal.getOrDefault(stepId, 0);
      ordinal.put(stepId, expected + 1);
      require(
          ledger.path("coordinate").path("ordinal").asInt(-1) == expected
              && expected < 8
              && ledger.path("sessionId").asText().equals(sessionId)
              && ledger.path("scopeHash").equals(session.path("scopeHash"))
              && ledger.path("state").asText().equals("SUCCEEDED")
              && ledger.path("dispatchCount").asInt() == 1
              && ledger.path("outcomeCode").asText().equals("OK")
              && seenAdmissions.add(admissionId),
          "EVIDENCE_MISMATCH",
          422);
      JsonNode joined = admissions.get(admissionId);
      require(joined != null, "EVIDENCE_MISMATCH", 422);
      String obligationId = text(joined, "obligationId");
      JsonNode association = associations.get(obligationId);
      require(association != null && seenObligations.add(obligationId), "EVIDENCE_MISMATCH", 422);
      JsonNode obligation = unique(plan.path("obligations"), "obligationId", obligationId);
      JsonNode prepared = preparations.get(text(joined, "preparationId"));
      require(prepared != null, "EVIDENCE_MISMATCH", 422);
      JsonNode proposal = prepared.path("proposal"),
          proof = prepared.path("proof"),
          execution = prepared.path("executionEvidence");
      ObjectNode actionMaterialization =
          GuidedMaterializationEvidence.versionContext(
              contracts,
              result.path("materializationEvidence"),
              ledger.path("contextRevision").asInt());
      JsonNode header =
          result
              .path("materializationEvidence")
              .path("versions")
              .get(ledger.path("contextRevision").asInt() - 1);
      require(
          prepared.path("materializationRevision").isIntegralNumber()
              && prepared.path("materializationRevision").asInt()
                  >= header.path("birthMaterializationRevision").asInt()
              && prepared.path("materializationRevision").asInt()
                  <= materialization.path("materializationRevision").asInt(),
          "EVIDENCE_MISMATCH",
          422);
      ObjectNode actionContext = contracts.object();
      actionContext.putObject("authoredInputs").set("inputs", actionMaterialization.path("inputs"));
      String digest = GuidedContracts.hash(proposal);
      require(
          proposal.equals(association.path("proposal"))
              && obligation.equals(association.path("meaning"))
              && association.path("admissionId").asText().equals(admissionId)
              && digest.equals(text(association, "proposalDigest"))
              && digest.equals(text(joined, "proposalHash"))
              && digest.equals(text(ledger, "requestDigest"))
              && digest.equals(text(proof, "requestDigest"))
              && proof.path("preparationId").equals(ledger.path("preparationId"))
              && execution.equals(proposal.path("executionEvidence"))
              && execution.equals(ledger.path("executionEvidence"))
              && GuidedContracts.hash(execution).equals(text(proof, "evidenceHash"))
              && proof.path("evidenceHash").equals(ledger.path("evidenceHash")),
          "EVIDENCE_MISMATCH",
          422);
      contracts.validate("v3/bridge#/definitions/preparation", proof);
      ObjectNode policyDecision = contracts.object();
      policyDecision.set("scopeHash", session.path("scopeHash"));
      policyDecision.set("preparation", proof);
      policyDecision.put("requestDigest", digest);
      require(
          ledger
                  .path("admission")
                  .path("authorizationId")
                  .equals(session.path("runAuthorization").path("authorizationId"))
              && ledger
                  .path("admission")
                  .path("policyDecisionHash")
                  .asText()
                  .equals(GuidedContracts.hash(policyDecision))
              && ledger.path("ownerFence").equals(session.path("owner").path("fence"))
              && proof.path("ownerFence").equals(ledger.path("ownerFence"))
              && proof.path("workerId").equals(session.path("owner").path("workerId"))
              && proof.path("scopeHash").equals(session.path("scopeHash"))
              && proof.path("contextId").equals(actionMaterialization.path("contextId"))
              && proof.path("contextRevision").equals(actionMaterialization.path("contextRevision"))
              && ledger.path("contextRevision").equals(proof.path("contextRevision"))
              && ledger
                  .path("authoredInputsHash")
                  .equals(actionMaterialization.path("authoredInputsHash"))
              && proof
                  .path("authoredInputsHash")
                  .equals(actionMaterialization.path("authoredInputsHash"))
              && proposal
                  .path("authoredInputsHash")
                  .equals(actionMaterialization.path("authoredInputsHash"))
              && ledger.path("coordinate").equals(proposal.path("coordinate"))
              && ledger.path("documentId").equals(proposal.path("target").path("documentId"))
              && ledger.path("generation").equals(proposal.path("generation")),
          "EVIDENCE_MISMATCH",
          422);

      ObjectNode progress = contracts.object();
      for (String key : List.of("generation", "evidenceHash", "executionEvidence")) {
        progress.set(key, proposal.path(key));
      }
      ObjectNode effective =
          effectiveObservedObligation(
              session, plan, actionMaterialization, prepared, observations, obligation);
      if (proposal.path("target").path("kind").asText().equals("passwordControl")) {
        JsonNode observed = observations.get(text(prepared, "observationHash"));
        require(observed != null, "EVIDENCE_MISMATCH", 422);
        progress.set("observation", observed.path("observation"));
      }
      proposals.action(session, progress, plan, effective, proposal, actionContext);
      if (prepared.has("observedChoice")) {
        String questionObservation =
            prepared
                .path("observedChoice")
                .path("context")
                .path("questionCapture")
                .path("observationHash")
                .asText();
        questionObservations.add(questionObservation);
      }
      ObjectNode operationIdentity = contracts.object();
      operationIdentity.set("coordinate", proposal.path("coordinate"));
      operationIdentity.set("origin", execution.path("origin"));
      operationIdentity.set(
          "locator",
          proposal.path("target").has("locator")
              ? proposal.path("target").path("locator")
              : contracts.object().nullNode());
      operationIdentity.set("operation", proposal.path("operation"));
      require(
          GuidedContracts.hash(operationIdentity).equals(text(ledger, "operationHash")),
          "OPERATION_MISMATCH",
          422);
      if (proposal.path("operation").path("kind").asText().equals("assert")) {
        require(ledger.path("assertionPassed").asBoolean(), "EVIDENCE_MISMATCH", 422);
      }
      if (execution.path("kind").asText().equals("initialBlank")) {
        require(
            actionFacts.isEmpty()
                && prepared.path("observationHash").isNull()
                && proposal.path("operation").path("kind").asText().equals("navigate")
                && proposal.path("target").path("kind").asText().equals("page")
                && proposal.path("target").path("documentId").equals(execution.path("documentId"))
                && execution.path("generation").asInt(-1) == 0
                && execution.path("origin").isNull(),
            "EVIDENCE_MISMATCH",
            422);
      } else {
        String hash = text(prepared, "observationHash");
        JsonNode observed = observations.get(hash);
        require(
            observed != null
                && hash.equals(GuidedContracts.hash(observed.path("observation")))
                && execution.path("observationHash").asText().equals(hash),
            "EVIDENCE_MISMATCH",
            422);
        contracts.validate("v3/observation", observed.path("observation"));
        JsonNode target = proposal.path("target"), obs = observed.path("observation");
        for (String key : List.of("documentId", "generation")) {
          require(target.path(key).equals(obs.path(key)), "EVIDENCE_MISMATCH", 422);
        }
        require(
            obs.path("scopeHash").equals(session.path("scopeHash"))
                && obs.path("origin").equals(execution.path("origin")),
            "EVIDENCE_MISMATCH",
            422);
        if (!java.util.Set.of("page", "passwordControl").contains(target.path("kind").asText())) {
          JsonNode node = unique(obs.path("nodes"), "nodeId", text(target, "nodeId"));
          require(
              list(node.path("locatorHints")).contains(target.path("locator")),
              "EVIDENCE_MISMATCH",
              422);
          if (proposal.path("operation").path("kind").asText().equals("read")) {
            JsonNode recipe = proposal.path("operation").path("recipe");
            require(
                node.path("visible").asBoolean()
                    && recipe.path("classification").equals(node.path("classification"))
                    && recipe.path("policyRuleId").equals(node.path("policyRuleId"))
                    && (!recipe.path("kind").asText().equals("controlValue")
                        || recipe.path("controlType").equals(node.path("controlType"))),
                "REFERENCE_MISMATCH",
                422);
          }
        }
        if (seenObservations.add(hash)) {
          observedFacts.add(observed.deepCopy());
        }
      }
      preparedFacts.add(prepared.deepCopy());
      actionFacts
          .addObject()
          .put("obligationId", obligationId)
          .put("preparationId", text(prepared, "preparationId"))
          .set("ledger", ledger.deepCopy());
      ObjectNode joinedObligation =
          obligationFacts
              .addObject()
              .put("obligationId", obligationId)
              .put("admissionId", admissionId)
              .put("proposalHash", digest);
      joinedObligation.set("coordinate", ledger.path("coordinate").deepCopy());
    }
    // Preserve the established exercised-preparation order; append only additional question
    // snapshots in source action order so zero/source-only canonical projections stay identical.
    for (String hash : questionObservations) {
      if (seenObservations.add(hash)) {
        observedFacts.add(observations.get(hash).deepCopy());
      }
    }
    for (JsonNode request : result.path("incrementalEvidence").path("prefixRequests")) {
      boolean found = false;
      for (JsonNode observed : raw.path("observations")) {
        JsonNode snapshot = observed.path("observation");
        ObjectNode execution =
            contracts
                .object()
                .put("kind", "observedDocument")
                .put("sessionId", sessionId)
                .put("contextId", request.path("contextId").asText());
        for (String field : List.of("documentId", "generation", "origin")) {
          execution.set(field, snapshot.path(field));
        }
        execution.set("observationHash", observed.path("observationHash"));
        if (GuidedContracts.hash(execution).equals(request.path("evidenceHash").asText())) {
          found = true;
          if (seenObservations.add(observed.path("observationHash").asText())) {
            observedFacts.add(observed.deepCopy());
          }
        }
      }
      if (!found) {
        require(
            request
                .path("evidenceHash")
                .asText()
                .equals(GuidedContracts.hash(raw.path("bootstrap").path("initialEvidence"))),
            "EVIDENCE_MISMATCH",
            422);
      }
    }
    require(ordinal.keySet().equals(order.keySet()), "EVIDENCE_MISMATCH", 422);
    require(seenObservations.size() == observations.size(), "EVIDENCE_MISMATCH", 422);
    require(
        !preparedFacts.isEmpty()
            && raw.path("bootstrap")
                .path("initialEvidence")
                .equals(preparedFacts.get(0).path("executionEvidence")),
        "EVIDENCE_MISMATCH",
        422);
    result.set("bootstrap", bootstrap(raw.path("bootstrap"), session));
    for (String key : List.of("allocations", "producers", "consumerEdges")) {
      result.set(key, raw.path(key).deepCopy());
    }
    // ARCH015-02: the publication summary commits complete current cumulative raw intent.
    // bootstrap() independently checked the original issued context/ACK; those captured bytes
    // remain unchanged when suffix allocation later extends metadata.
    ((ObjectNode) result.path("bootstrap"))
        .put("allocationHash", GuidedContracts.hash(result.path("allocations")));
    graph(result, order);
    PublicationContracts.bounded(result, PublicationContracts.MAX_BASIS_BYTES);
    return result;
  }

  private void verifyExcluded(
      JsonNode session,
      JsonNode incremental,
      JsonNode ledger,
      JsonNode association,
      JsonNode prepared,
      JsonNode receipt) {
    contracts.validate("v3/bridge#/definitions/DriftReceipt", receipt);
    contracts.validate("v3/replay-validation#/definitions/PreparationFact", prepared);
    ObjectNode preimage = receipt.deepCopy();
    preimage.remove("receiptHash");
    require(
        receipt.path("phase").asText().equals("ADMITTED_PRE_INVOCATION")
            && !receipt.path("nativeInvocationStarted").asBoolean(true)
            && receipt.path("attemptOrdinal").asInt(-1) == 0
            && GuidedContracts.hash(preimage).equals(receipt.path("receiptHash").asText())
            && receipt
                .path("receiptHash")
                .equals(incremental.path("switch").path("driftReceiptHash"))
            && ledger.path("state").asText().equals("FAILED")
            && ledger.path("outcomeCode").asText().equals("TARGET_CHANGED")
            && ledger.path("attemptOrdinal").asInt(-1) == 0
            && ledger.path("dispatchCount").asInt() == 1
            && receipt.path("admissionId").equals(ledger.path("admission").path("admissionId"))
            && receipt.path("preparationId").equals(ledger.path("preparationId"))
            && receipt.path("preparationId").equals(prepared.path("preparationId"))
            && receipt.path("coordinate").equals(ledger.path("coordinate"))
            && receipt.path("operationHash").equals(ledger.path("operationHash")),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode request = null;
    for (JsonNode candidate : incremental.path("prefixRequests")) {
      if (GuidedContracts.hash(candidate).equals(receipt.path("requestDigest").asText())) {
        require(request == null, "EVIDENCE_MISMATCH", 422);
        request = candidate;
      }
    }
    require(request != null, "EVIDENCE_MISMATCH", 422);
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
      require(receipt.path(field).equals(request.path(field)), "EVIDENCE_MISMATCH", 422);
    }
    for (String field :
        List.of(
            "sessionId",
            "scopeHash",
            "contextRevision",
            "authoredInputsHash",
            "evidenceHash",
            "ownerFence")) {
      require(
          receipt.path(field).equals(ledger.path(field))
              && receipt.path(field).equals(prepared.path("proof").path(field)),
          "EVIDENCE_MISMATCH",
          422);
    }
    require(
        receipt.path("workerId").equals(session.path("owner").path("workerId"))
            && receipt.path("ownerFence").equals(session.path("owner").path("fence"))
            && prepared.path("proposal").equals(association.path("proposal"))
            && GuidedContracts.hash(prepared.path("proposal"))
                .equals(ledger.path("requestDigest").asText())
            && ledger.path("requestDigest").equals(prepared.path("proof").path("requestDigest"))
            && ledger.path("requestDigest").equals(association.path("proposalDigest"))
            && ledger.path("admission").path("admissionId").equals(association.path("admissionId")),
        "EVIDENCE_MISMATCH",
        422);
  }

  /**
   * Independent original-fact validation; only explicit human target resolution changes locally.
   */
  ObjectNode effectiveObservedObligation(
      JsonNode session,
      JsonNode plan,
      JsonNode materialization,
      JsonNode prepared,
      Map<String, JsonNode> observations,
      JsonNode obligation) {
    ObjectNode effective = PublicationContracts.copy(obligation);
    if (!prepared.has("observedChoice")) {
      return effective;
    }
    JsonNode witness = prepared.path("observedChoice");
    PublicationContracts.bounded(witness, 262144);
    contracts.validate("v3/replay-validation#/definitions/ObservedChoiceWitness1", witness);
    JsonNode receipt = witness.path("receipt"),
        identity = witness.path("context"),
        capture = identity.path("questionCapture"),
        question = identity.path("question"),
        answer = receipt.path("answer"),
        attempt = witness.path("attempt"),
        questionPlan = witness.path("questionPlan"),
        modelQuestion = attempt.path("modelQuestion"),
        proposal = prepared.path("proposal"),
        proof = prepared.path("proof");
    PublicationContracts.bounded(receipt, 16384);
    PublicationContracts.bounded(identity, 65536);
    require(
        GuidedContracts.canonical(witness.path("meanings"))
                .getBytes(java.nio.charset.StandardCharsets.UTF_8)
                .length
            <= 65536,
        "BUDGET_EXCEEDED",
        413);
    require(
        receipt.path("sessionId").equals(session.path("sessionId"))
            && identity.path("sessionId").equals(session.path("sessionId"))
            && identity.path("scopeHash").equals(session.path("scopeHash"))
            && receipt.path("preparationId").equals(prepared.path("preparationId"))
            && receipt.path("preparationId").equals(proof.path("preparationId"))
            && receipt.path("clarificationId").equals(identity.path("clarificationId"))
            && receipt.path("clarificationId").equals(question.path("clarificationId"))
            && receipt.path("acceptedChoiceId").equals(witness.path("acceptedChoiceId"))
            && receipt.path("obligationId").equals(obligation.path("obligationId"))
            && capture.path("obligationId").equals(obligation.path("obligationId"))
            && GuidedContracts.hash(identity).equals(receipt.path("contextIdentityHash").asText())
            && GuidedContracts.hash(witness.path("meanings"))
                .equals(receipt.path("meaningsHash").asText())
            && GuidedContracts.hash(capture).equals(receipt.path("questionCaptureHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    for (String key : List.of("sourceRevision", "configurationRevision")) {
      require(
          identity.path(key).equals(session.path("scope").path(key))
              && answer.path(key).equals(identity.path(key)),
          "EVIDENCE_MISMATCH",
          422);
    }
    for (String key :
        List.of(
            "sessionId",
            "scopeHash",
            "clarificationId",
            "coordinate",
            "documentId",
            "generation")) {
      require(answer.path(key).equals(question.path(key)), "EVIDENCE_MISMATCH", 422);
    }
    require(
        question.path("sessionId").equals(session.path("sessionId"))
            && question.path("scopeHash").equals(session.path("scopeHash"))
            && question.path("phase").asText().equals("observed")
            && question.path("coordinate").equals(proposal.path("coordinate"))
            && question.path("coordinate").path("stepId").equals(obligation.path("stepId"))
            && question.path("coordinate").path("ordinal").equals(obligation.path("occurrence"))
            && answer.path("choiceId").equals(witness.path("acceptedChoiceId"))
            && !java.time.Instant.parse(answer.path("resolvedAt").asText())
                .isAfter(java.time.Instant.parse(question.path("expiresAt").asText()))
            && !java.time.Instant.parse(answer.path("resolvedAt").asText())
                .isAfter(java.time.Instant.parse(session.path("expiresAt").asText())),
        "EVIDENCE_MISMATCH",
        422);
    for (String key :
        List.of("attemptId", "requestId", "attempt", "planRevision", "executionEvidence")) {
      require(attempt.path(key).equals(capture.path(key)), "EVIDENCE_MISMATCH", 422);
    }
    require(
        attempt.path("kind").asText().equals("NEXT_ACTION")
            && attempt.path("status").asText().equals("APPLIED")
            && attempt.path("responseKind").equals(attempt.path("kind"))
            && attempt.path("responseRequestId").equals(attempt.path("requestId"))
            && attempt.path("responseStatus").asText().equals("CLARIFICATION")
            && attempt.path("responseSchemaVersion").asInt() == 3
            && attempt.path("scope").equals(session.path("scope"))
            && attempt.path("scopeHash").equals(session.path("scopeHash"))
            && attempt.path("owner").path("workerId").equals(capture.path("workerId"))
            && attempt.path("owner").path("fence").equals(capture.path("ownerFence"))
            && capture.path("workerId").equals(materialization.path("workerId"))
            && capture.path("ownerFence").equals(materialization.path("ownerFence"))
            && capture.path("workerId").equals(session.path("owner").path("workerId"))
            && capture.path("ownerFence").equals(session.path("owner").path("fence"))
            && GuidedContracts.hash(modelQuestion)
                .equals(capture.path("modelQuestionHash").asText())
            && modelQuestion.path("reason").equals(question.path("reason")),
        "EVIDENCE_MISMATCH",
        422);
    for (String key : List.of("contextId", "contextRevision", "authoredInputsHash")) {
      require(
          capture.path(key).equals(materialization.path(key))
              && capture.path(key).equals(proof.path(key)),
          "EVIDENCE_MISMATCH",
          422);
    }
    JsonNode evidence = capture.path("executionEvidence");
    require(
        evidence.path("kind").asText().equals("observedDocument")
            && evidence.path("contextId").equals(capture.path("contextId"))
            && evidence.path("documentId").equals(question.path("documentId"))
            && evidence.path("generation").equals(question.path("generation"))
            && evidence.path("documentId").equals(attempt.path("documentId"))
            && evidence.path("generation").equals(attempt.path("generation"))
            && evidence.path("observationHash").equals(capture.path("observationHash"))
            && GuidedContracts.hash(evidence).equals(capture.path("evidenceHash").asText())
            && proposal.path("generation").asLong() > question.path("generation").asLong(),
        "EVIDENCE_MISMATCH",
        422);
    require(
        questionPlan.path("revision").equals(capture.path("planRevision"))
            && questionPlan.path("planHash").equals(capture.path("planHash"))
            && GuidedContracts.hash(questionPlan.path("plan"))
                .equals(capture.path("planHash").asText())
            && unique(
                    questionPlan.path("plan").path("obligations"),
                    "obligationId",
                    obligation.path("obligationId").asText())
                .equals(obligation)
            && unique(
                    plan.path("obligations"),
                    "obligationId",
                    obligation.path("obligationId").asText())
                .equals(obligation),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode oldEntry = observations.get(capture.path("observationHash").asText());
    require(oldEntry != null, "EVIDENCE_MISMATCH", 422);
    JsonNode oldObservation = oldEntry.path("observation");
    contracts.validate("v3/observation", oldObservation);
    require(
        GuidedContracts.hash(oldObservation).equals(capture.path("observationHash").asText())
            && oldObservation.path("scopeHash").equals(session.path("scopeHash"))
            && oldObservation.path("documentId").equals(question.path("documentId"))
            && oldObservation.path("generation").equals(question.path("generation"))
            && oldObservation.path("origin").equals(evidence.path("origin"))
            && list(session.path("scope").path("approvedOrigins"))
                .contains(oldObservation.path("origin"))
            && !oldObservation.path("coverage").path("truncated").asBoolean()
            && !oldObservation
                .path("coverage")
                .path("reason")
                .asText()
                .equals("unsupportedSurface"),
        "EVIDENCE_MISMATCH",
        422);
    int count = modelQuestion.path("choices").size();
    require(
        count >= 2
            && count <= 10
            && question.path("choices").size() == count
            && witness.path("meanings").size() == count,
        "EVIDENCE_MISMATCH",
        422);
    var serverIds = new HashSet<String>();
    var providerIds = new HashSet<String>();
    var meaningHashes = new HashSet<String>();
    JsonNode selected = null;
    for (int i = 0; i < count; i++) {
      JsonNode provider = modelQuestion.path("choices").get(i),
          mapping = witness.path("meanings").get(i),
          choice = question.path("choices").get(i),
          meaning = mapping.path("meaning");
      require(
          provider.path("meaning").equals(meaning)
              && meaning.path("obligationId").equals(obligation.path("obligationId"))
              && mapping.path("choiceId").equals(choice.path("choiceId"))
              && meaning.path("nodeId").equals(choice.path("nodeId"))
              && meaning.path("bindingId").equals(choice.path("bindingId"))
              && serverIds.add(choice.path("choiceId").asText())
              && providerIds.add(provider.path("choiceId").asText())
              && meaningHashes.add(GuidedContracts.hash(meaning)),
          "EVIDENCE_MISMATCH",
          422);
      JsonNode oldNode =
          unique(oldObservation.path("nodes"), "nodeId", meaning.path("nodeId").asText());
      require(
          oldNode.path("visible").asBoolean()
              && list(oldNode.path("locatorHints")).contains(meaning.path("locator")),
          "EVIDENCE_MISMATCH",
          422);
      if (choice.path("choiceId").equals(witness.path("acceptedChoiceId"))) {
        require(
            answer.path("nodeId").equals(choice.path("nodeId"))
                && answer.path("bindingId").equals(choice.path("bindingId")),
            "EVIDENCE_MISMATCH",
            422);
        selected = meaning;
      }
    }
    require(
        selected != null
            && selected.path("locator").equals(proposal.path("target").path("locator")),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode locator = selected.path("locator");
    JsonNode freshEntry = observations.get(prepared.path("observationHash").asText());
    require(
        freshEntry != null
            && locatorCardinality(oldObservation, locator) == 1
            && locatorCardinality(freshEntry.path("observation"), locator) == 1,
        "EVIDENCE_MISMATCH",
        422);
    effective.put(
        "targetIntent",
        locator.path(locator.path("kind").asText().equals("role") ? "name" : "value").asText());
    effective.set("selectedLocator", locator.deepCopy());
    return effective;
  }

  private static long locatorCardinality(JsonNode observation, JsonNode locator) {
    return list(observation.path("nodes")).stream()
        .filter(node -> list(node.path("locatorHints")).contains(locator))
        .count();
  }

  private ObjectNode bootstrap(JsonNode original, JsonNode session) {
    JsonNode marker = original.path("marker"),
        context = marker.path("context"),
        proof = marker.path("metadataAcknowledgement");
    JsonNode evidence = original.path("initialEvidence"), identity = marker.path("identity");
    JsonNode receipt = original.path("receipt");
    List<String> receiptFields =
        List.of(
            "contextId",
            "contextRevision",
            "sourceRevision",
            "configurationRevision",
            "scopeHash",
            "workerId",
            "ownerFence");
    require(receipt.isObject() && receipt.size() == receiptFields.size(), "EVIDENCE_MISMATCH", 422);
    for (String field : receiptFields) {
      require(receipt.hasNonNull(field), "EVIDENCE_MISMATCH", 422);
    }
    contracts.validate("v3/execution-evidence", evidence);
    require(
        receipt.path("contextId").equals(context.path("contextId"))
            && receipt.path("contextRevision").equals(context.path("contextRevision"))
            && receipt.path("sourceRevision").equals(identity.path("sourceRevision"))
            && receipt.path("configurationRevision").equals(identity.path("configurationRevision"))
            && receipt.path("scopeHash").equals(identity.path("scopeHash"))
            && receipt.path("workerId").equals(identity.path("workerId"))
            && receipt.path("ownerFence").equals(identity.path("fence"))
            && receipt.path("sourceRevision").equals(session.path("scope").path("sourceRevision"))
            && receipt
                .path("configurationRevision")
                .equals(session.path("scope").path("configurationRevision"))
            && receipt.path("scopeHash").equals(session.path("scopeHash"))
            && evidence.path("sessionId").equals(session.path("sessionId"))
            && evidence.path("contextId").equals(receipt.path("contextId"))
            && evidence.path("generation").asInt(-1) == 0
            && evidence.path("origin").isNull(),
        "EVIDENCE_MISMATCH",
        422);
    require(
        marker.path("phase").asText().equals("READY")
            && proof.path("version").asInt() == 2
            && !proof.path("deliveryId").asText().isBlank()
            && GuidedContracts.hash(context).equals(text(proof, "contextHash"))
            && GuidedContracts.hash(identity).equals(text(proof, "identityHash"))
            && identity.path("workerId").equals(session.path("owner").path("workerId"))
            && identity.path("fence").equals(session.path("owner").path("fence"))
            && evidence.path("kind").asText().equals("initialBlank")
            && evidence.path("contextId").equals(context.path("contextId")),
        "EVIDENCE_MISMATCH",
        422);
    ObjectNode result = contracts.object();
    for (String key : List.of("contextId", "contextRevision", "materializationRevision")) {
      result.set(key, context.path(key));
    }
    result.set("ownerFence", identity.path("fence"));
    result.set("inputsHash", context.path("authoredInputsHash"));
    result
        .put("allocationHash", GuidedContracts.hash(context.path("allocations")))
        .put("metadataAcknowledged", true);
    result.set("initialEvidence", evidence.deepCopy());
    return result;
  }

  private void graph(ObjectNode basis, Map<String, Integer> order) {
    GuidedEffectiveGraph.Projection projection = new GuidedEffectiveGraph(contracts).project(basis);
    ObjectNode effective = basis.deepCopy();
    effective.set("allocations", projection.allocations());
    effective.set("consumerEdges", projection.consumerEdges());
    graphExact(effective, order);
    basis.set("bindings", effective.path("bindings"));
    basis.set("transfers", effective.path("transfers"));
  }

  private void graphExact(ObjectNode basis, Map<String, Integer> order) {
    Map<String, JsonNode> allocations = index(basis.path("allocations"), "bindingId");
    Map<String, JsonNode> producers = index(basis.path("producers"), "bindingId");
    require(
        allocations.size() == basis.path("translationPlan").path("needs").size()
            && allocations.size() == producers.size(),
        "REFERENCE_MISMATCH",
        422);
    ArrayNode bindings = basis.putArray("bindings"), transfers = basis.putArray("transfers");
    List<JsonNode> ordered = new ArrayList<>(producers.values());
    ordered.sort(
        Comparator.comparingInt((JsonNode p) -> position(order, p.path("coordinate")))
            .thenComparingInt(p -> p.path("coordinate").path("ordinal").asInt())
            .thenComparing(p -> text(p, "bindingId")));
    for (JsonNode producer : ordered) {
      contracts.validate("v3/producer", producer);
      String id = text(producer, "bindingId");
      JsonNode allocation = allocations.get(id);
      JsonNode need = unique(basis.path("translationPlan").path("needs"), "bindingId", id);
      require(
          allocation != null
              && need.path("needId").equals(allocation.path("needId"))
              && need.path("producerStepId").equals(allocation.path("producerStepId"))
              && need.path("consumers").equals(allocation.path("consumers"))
              && producer
                  .path("coordinate")
                  .path("stepId")
                  .equals(allocation.path("producerStepId")),
          "REFERENCE_MISMATCH",
          422);
      JsonNode producerAction = actionByAdmission(basis, text(producer, "producerAdmissionId"));
      JsonNode availability = producer.path("availability");
      contracts.validate("v3/availability", availability);
      JsonNode producerPreparation =
          unique(
              basis.path("preparations"), "preparationId", text(producerAction, "preparationId"));
      JsonNode producerProof = producerPreparation.path("proof");
      require(
          availability.path("bindingId").equals(producer.path("bindingId"))
              && availability
                  .path("producerAdmissionId")
                  .equals(producerAction.path("ledger").path("admission").path("admissionId"))
              && availability.path("contextId").equals(producerProof.path("contextId"))
              && availability
                  .path("contextId")
                  .equals(producerAction.path("ledger").path("executionEvidence").path("contextId"))
              && availability.path("workerId").equals(producerProof.path("workerId"))
              && availability.path("ownerFence").equals(producerProof.path("ownerFence"))
              && availability
                  .path("ownerFence")
                  .equals(producerAction.path("ledger").path("ownerFence")),
          "REFERENCE_MISMATCH",
          422);
      require(
          producer.path("coordinate").equals(producerAction.path("ledger").path("coordinate"))
              && producer
                  .path("origin")
                  .equals(producerAction.path("ledger").path("executionEvidence").path("origin"))
              && producer
                  .path("availability")
                  .path("producerAdmissionId")
                  .equals(producer.path("producerAdmissionId")),
          "REFERENCE_MISMATCH",
          422);
      JsonNode operation = proposal(basis, producerAction).path("operation");
      require(
          operation.path("kind").asText().equals("read")
              && operation.path("bindingId").asText().equals(id)
              && operation.path("recipe").equals(producer.path("recipe")),
          "REFERENCE_MISMATCH",
          422);
      ObjectNode binding =
          bindings
              .addObject()
              .put("schemaVersion", 3)
              .put("bindingId", id)
              .put("valueType", "string")
              .put("transferPolicy", "sameOrigin")
              .put("preserveBytes", true);
      binding.set("producer", producer.path("coordinate"));
      binding.set("recipe", producer.path("recipe"));
      binding.set("sourceOrigin", producer.path("origin"));
      binding
          .putObject("provenance")
          .put("sessionId", text(basis, "sessionId"))
          .put("producerAdmissionId", text(producer, "producerAdmissionId"))
          .put("sourceIntentStepId", text(allocation, "producerStepId"));
      ArrayNode consumers = binding.putArray("consumers");
      var satisfied = new HashSet<String>();
      List<JsonNode> edges =
          list(basis.path("consumerEdges")).stream()
              .filter(e -> e.path("bindingId").asText().equals(id))
              .sorted(
                  Comparator.comparingInt((JsonNode e) -> position(order, e.path("coordinate")))
                      .thenComparingInt(e -> e.path("coordinate").path("ordinal").asInt())
                      .thenComparing(e -> text(e, "argumentSlot")))
              .toList();
      for (JsonNode edge : edges) {
        contracts.validate("v3/consumer-edge", edge);
        require(
            edge.path("producerAdmissionId").equals(producer.path("producerAdmissionId"))
                && edge.path("destinationOrigin").equals(producer.path("origin")),
            "REFERENCE_MISMATCH",
            422);
        JsonNode action = actionByAdmission(basis, text(edge, "consumerAdmissionId")),
            consumerOperation = proposal(basis, action).path("operation");
        require(
            edge.path("coordinate").equals(action.path("ledger").path("coordinate"))
                && edge.path("destinationOrigin")
                    .equals(action.path("ledger").path("executionEvidence").path("origin")),
            "REFERENCE_MISMATCH",
            422);
        String slot = text(edge, "argumentSlot"),
            field = slot.endsWith("expected") ? "expected" : "value";
        require(
            consumerOperation.path("kind").asText().equals(slot.substring(0, slot.indexOf('.')))
                && consumerOperation.path(field).path("kind").asText().equals("binding")
                && consumerOperation.path(field).path("bindingId").asText().equals(id)
                && compare(order, producer.path("coordinate"), edge.path("coordinate")) < 0,
            "REFERENCE_MISMATCH",
            422);
        boolean declared = false;
        for (JsonNode consumer : allocation.path("consumers")) {
          if (consumer.path("stepId").equals(edge.path("coordinate").path("stepId"))
              && consumer.path("argumentSlot").asText().equals(slot)) {
            declared = true;
          }
        }
        require(declared, "REFERENCE_MISMATCH", 422);
        satisfied.add(text(edge.path("coordinate"), "stepId") + ":" + slot);
        consumers.add(edge.deepCopy());
        ObjectNode transfer = transfers.addObject().put("bindingId", id).put("slot", slot);
        transfer.set("producer", producer.path("coordinate"));
        transfer.set("consumer", edge.path("coordinate"));
        transfer.set("origin", producer.path("origin"));
      }
      for (JsonNode consumer : allocation.path("consumers")) {
        require(
            satisfied.contains(text(consumer, "stepId") + ":" + text(consumer, "argumentSlot")),
            "REFERENCE_MISMATCH",
            422);
      }
      contracts.validate("v3/binding", binding);
    }
    require(
        transfers.size() == basis.path("consumerEdges").size() && transfers.size() <= 200,
        "REFERENCE_MISMATCH",
        422);
  }

  public ObjectNode plan(JsonNode basis, JsonNode versions) {
    PublicationContracts.bounded(basis, PublicationContracts.MAX_BASIS_BYTES);
    contracts.validate("v3/replay-validation#/definitions/ValidationBasis", basis);
    new GuidedBasisValidator(contracts).validate(basis);
    var order = new LinkedHashMap<String, Integer>();
    for (JsonNode step : basis.path("sourceSteps")) {
      require(
          step.path("ordinal").asInt(-1) == order.size()
              && order.putIfAbsent(text(step, "stepId"), order.size()) == null,
          "EVIDENCE_MISMATCH",
          422);
    }
    require(
        GuidedContracts.hash(basis.path("allocations"))
            .equals(basis.path("bootstrap").path("allocationHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    ObjectNode derived = basis.deepCopy();
    graph(derived, order);
    require(
        derived.path("bindings").equals(basis.path("bindings"))
            && derived.path("transfers").equals(basis.path("transfers")),
        "EVIDENCE_MISMATCH",
        422);
    ObjectNode plan =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put(
                "planId",
                "plan-"
                    + GuidedContracts.hash(
                        contracts.object().put("sessionId", text(basis, "sessionId"))));
    plan.put("scopeHash", GuidedContracts.hash(basis.path("scope")));
    for (String key : List.of("sourceRevision", "configurationRevision", "authoredInputsHash")) {
      plan.set(key, basis.path(key));
    }
    plan.set("initialContext", basis.path("replayRequirements").path("initialContext"));
    plan.set("versions", versions.deepCopy());
    ArrayNode steps = plan.putArray("sourceSteps");
    basis.path("sourceSteps").forEach(s -> steps.add(text(s, "stepId")));
    ArrayNode actions = plan.putArray("actions");
    for (JsonNode fact : basis.path("actions")) {
      JsonNode ledger = fact.path("ledger"), proposal = proposal(basis, fact);
      ObjectNode action = actions.addObject();
      action.set("coordinate", ledger.path("coordinate"));
      action.set("origin", proposal.path("executionEvidence").path("origin"));
      action.set(
          "locator",
          proposal.path("target").has("locator")
              ? proposal.path("target").path("locator")
              : contracts.object().nullNode());
      action.set("operation", proposal.path("operation"));
      action.set("admissionId", ledger.path("admission").path("admissionId"));
      action.set("operationHash", ledger.path("operationHash"));
    }
    plan.set("bindings", basis.path("bindings"));
    new GuidedSnapshotDeriver(contracts).apply(basis, plan);
    contracts.validate("v3/learned-plan", plan);
    return plan;
  }

  public static JsonNode proposal(JsonNode basis, JsonNode action) {
    return unique(basis.path("preparations"), "preparationId", text(action, "preparationId"))
        .path("proposal");
  }

  private static JsonNode actionByAdmission(JsonNode basis, String id) {
    JsonNode found = null;
    for (JsonNode action : basis.path("actions")) {
      if (action.path("ledger").path("admission").path("admissionId").asText().equals(id)) {
        require(found == null, "EVIDENCE_MISMATCH", 422);
        found = action;
      }
    }
    require(found != null, "EVIDENCE_MISMATCH", 422);
    return found;
  }

  public static String text(JsonNode node, String key) {
    JsonNode value = node.path(key);
    require(value.isTextual() && !value.asText().isBlank(), "INVALID_CONTRACT", 422);
    return value.asText();
  }

  public static List<JsonNode> list(JsonNode node) {
    require(node.isArray(), "INVALID_CONTRACT", 422);
    var result = new ArrayList<JsonNode>();
    node.forEach(result::add);
    return result;
  }

  public static Map<String, JsonNode> index(JsonNode array, String key) {
    var result = new LinkedHashMap<String, JsonNode>();
    for (JsonNode value : list(array)) {
      require(result.put(text(value, key), value) == null, "EVIDENCE_MISMATCH", 422);
    }
    return result;
  }

  public static JsonNode unique(JsonNode array, String key, String value) {
    JsonNode result = index(array, key).get(value);
    require(result != null, "EVIDENCE_MISMATCH", 422);
    return result;
  }

  private static int position(Map<String, Integer> order, JsonNode coordinate) {
    Integer result = order.get(text(coordinate, "stepId"));
    require(result != null, "EVIDENCE_MISMATCH", 422);
    return result;
  }

  private static int compare(Map<String, Integer> order, JsonNode left, JsonNode right) {
    int steps = Integer.compare(position(order, left), position(order, right));
    return steps != 0
        ? steps
        : Integer.compare(left.path("ordinal").asInt(), right.path("ordinal").asInt());
  }
}
