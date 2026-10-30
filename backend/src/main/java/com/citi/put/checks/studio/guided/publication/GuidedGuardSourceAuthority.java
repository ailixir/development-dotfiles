package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.translation.GuidedActionGuard;
import com.citi.put.checks.studio.guided.translation.GuidedPressInheritance;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;

/** The locked private-source boundary, before values are discarded. No wire minting API. */
public final class GuidedGuardSourceAuthority {
  private GuidedGuardSourceAuthority() {}

  @com.fasterxml.jackson.annotation.JsonIgnoreType
  public static final class VerifiedSource {
    private final String commitment;
    private final ArrayNode witnesses;

    private VerifiedSource(String commitment, ArrayNode witnesses) {
      this.commitment = commitment;
      this.witnesses = witnesses.deepCopy();
    }

    ArrayNode requireFor(JsonNode evidence) {
      require(commitment.equals(GuidedContracts.hash(evidence)), "EVIDENCE_MISMATCH", 422);
      return witnesses.deepCopy();
    }

    @Override
    public String toString() {
      return "VerifiedSource";
    }
  }

  static VerifiedSource verify(GuidedContracts contracts, JsonNode privateManifest, JsonNode raw) {
    GuidedPublicationBaseRepository.transaction();
    ObjectNode safeManifest = PublicationContracts.copy(privateManifest);
    safeManifest.remove("configurationValues");
    require(
        GuidedContracts.same(safeManifest, raw.path("sourceManifest")), "EVIDENCE_MISMATCH", 422);
    for (JsonNode value : privateManifest.path("configurationValues")) {
      if (value.path("kind").asText().equals("secretRef") || !value.path("value").isTextual()) {
        continue;
      }
      JsonNode declaration =
          one(
              raw.path("snapshotEvidence").path("current").path("authoredDeclarations"),
              "referenceId",
              value.path("referenceName").asText());
      require(
          declaration.path("kind").asText().equals("plain")
              && declaration
                  .path("valueHash")
                  .asText()
                  .equals(GuidedContracts.hash(value.path("value"))),
          "EVIDENCE_MISMATCH",
          422);
    }
    ArrayNode history = contracts.object().putArray("history");
    for (JsonNode ledger : raw.path("actions")) {
      JsonNode association =
          one(
              raw.path("admissionAssociations"),
              "admissionId",
              ledger.path("admission").path("admissionId").asText());
      JsonNode prepared =
          one(
              raw.path("preparations"),
              "preparationId",
              association.path("preparationId").asText());
      ObjectNode row = history.addObject();
      row.set("ledger", ledger);
      row.set("proposal", prepared.path("proposal"));
      row.set("proof", prepared.path("proof"));
      row.set("observation", observation(raw, prepared.path("observationHash").asText("")));
    }
    ArrayNode witnesses = contracts.object().putArray("witnesses");
    for (JsonNode row : history) {
      JsonNode proof = row.path("proof"), inheritance = proof.path("pressInheritance");
      if (inheritance.isNull() || inheritance.isMissingNode()) {
        ObjectNode progress = contracts.object();
        progress.set("observation", row.path("observation"));
        require(
            !GuidedActionGuard.evaluateProposal(progress, privateManifest, row.path("proposal"))
                .refused(),
            "EVIDENCE_MISMATCH",
            422);
        continue;
      }
      require(
          row.path("ledger").path("state").asText().equals("SUCCEEDED"), "EVIDENCE_MISMATCH", 422);
      JsonNode expected =
          GuidedPressInheritance.derive(
              contracts,
              privateManifest,
              raw.path("translationPlan"),
              row.path("proposal"),
              row.path("observation"),
              proof,
              history);
      require(!expected.isNull() && expected.equals(inheritance), "EVIDENCE_MISMATCH", 422);
      JsonNode predecessor = null;
      for (JsonNode candidate : history) {
        if (candidate
            .path("ledger")
            .path("admission")
            .path("admissionId")
            .equals(inheritance.path("predecessorAdmissionId"))) {
          require(predecessor == null, "EVIDENCE_MISMATCH", 422);
          predecessor = candidate;
        }
      }
      require(predecessor != null, "EVIDENCE_MISMATCH", 422);
      ObjectNode witness = witnesses.addObject().put("version", 1);
      witness.put(
          "pressAdmissionId", row.path("ledger").path("admission").path("admissionId").asText());
      witness.set("predecessorAdmissionId", inheritance.path("predecessorAdmissionId"));
      witness.set("pressPreparationId", proof.path("preparationId"));
      witness.set("predecessorPreparationId", predecessor.path("proof").path("preparationId"));
      witness.put("pressProofHash", GuidedContracts.hash(proof));
      witness.put("predecessorProofHash", GuidedContracts.hash(predecessor.path("proof")));
      witness.put("pressObservationHash", GuidedContracts.hash(row.path("observation")));
      witness.put(
          "predecessorObservationHash", GuidedContracts.hash(predecessor.path("observation")));
      witness.put("sourceManifestHash", GuidedContracts.hash(raw.path("sourceManifest")));
      witness.put(
          "sourceIdentityHash", GuidedContracts.hash(raw.path("snapshotEvidence").path("current")));
      for (String field :
          List.of(
              "contextId",
              "contextRevision",
              "authoredInputsHash",
              "sourceRevision",
              "configurationRevision",
              "scopeHash",
              "workerId",
              "ownerFence")) {
        witness.set(field, proof.path(field));
      }
      String priorStep = predecessor.path("proposal").path("coordinate").path("stepId").asText();
      String currentStep = row.path("proposal").path("coordinate").path("stepId").asText();
      JsonNode priorFact = fact(predecessor), currentFact = fact(row);
      GuidedActionGuard.Grounding grounding =
          GuidedActionGuard.grounding(
              priorFact, GuidedPressInheritance.sources(privateManifest, priorStep));
      require(grounding != null, "EVIDENCE_MISMATCH", 422);
      ObjectNode ground =
          witness
              .putObject("predecessorGrounding")
              .put("field", grounding.field())
              .put("mode", grounding.mode());
      ground.set(
          "source", source(contracts, privateManifest, raw, priorStep, grounding.sourceIndex()));
      destructive(
          contracts,
          privateManifest,
          raw,
          priorStep,
          priorFact,
          witness.putArray("predecessorDestructive"));
      destructive(
          contracts,
          privateManifest,
          raw,
          currentStep,
          currentFact,
          witness.putArray("currentDestructive"));
      contracts.validate("v3/replay-validation#/definitions/GuardSourceAuthorization", witness);
    }
    require(witnesses.size() <= 200, "BUDGET_EXCEEDED", 413);
    return new VerifiedSource(GuidedContracts.hash(raw), witnesses);
  }

  private static void destructive(
      GuidedContracts contracts,
      JsonNode manifest,
      JsonNode raw,
      String step,
      JsonNode fact,
      ArrayNode out) {
    List<String> sources = GuidedPressInheritance.sources(manifest, step);
    for (String verb : GuidedActionGuard.destructiveTerms(fact)) {
      int selected = -1;
      for (int index = 0; index < sources.size(); index++) {
        if (GuidedActionGuard.containsPhrase(sources.get(index), verb)) {
          selected = index;
          break;
        }
      }
      require(selected >= 0, "EVIDENCE_MISMATCH", 422);
      out.addObject()
          .put("verb", verb)
          .set("source", source(contracts, manifest, raw, step, selected));
    }
  }

  private static JsonNode source(
      GuidedContracts contracts, JsonNode manifest, JsonNode raw, String step, int index) {
    ObjectNode source =
        contracts.object().put("kind", index == 0 ? "AUTHORED" : "SAVED_INPUT").put("stepId", step);
    if (index == 0) {
      return source;
    }
    List<JsonNode> values = new ArrayList<>();
    for (JsonNode value : manifest.path("configurationValues")) {
      if (value.path("stepId").asText().equals(step)
          && !value.path("kind").asText().equals("secretRef")
          && value.path("value").isTextual()) {
        values.add(value);
      }
    }
    require(index > 0 && index <= values.size(), "EVIDENCE_MISMATCH", 422);
    String declarationId = values.get(index - 1).path("referenceName").asText();
    JsonNode declaration =
        one(
            raw.path("snapshotEvidence").path("current").path("authoredDeclarations"),
            "referenceId",
            declarationId);
    require(declaration.path("kind").asText().equals("plain"), "EVIDENCE_MISMATCH", 422);
    source
        .put("declarationId", declarationId)
        .put("declarationHash", GuidedContracts.hash(declaration));
    return source;
  }

  private static JsonNode fact(JsonNode row) {
    return row.path("observation")
        .path("facts")
        .path(row.path("proposal").path("target").path("ref").asText());
  }

  /**
   * Pure public reconstruction. Only saved-input lexical membership relies on the sealed source
   * verdict.
   */
  static void validatePublic(GuidedContracts contracts, JsonNode basis) {
    var used = new java.util.HashSet<String>();
    for (JsonNode action : basis.path("actions")) {
      JsonNode current =
          one(basis.path("preparations"), "preparationId", action.path("preparationId").asText());
      JsonNode inheritance = current.path("proof").path("pressInheritance");
      if (inheritance.isNull()) {
        continue;
      }
      require(inheritance.isObject(), "EVIDENCE_MISMATCH", 422);
      String currentStep = action.path("ledger").path("coordinate").path("stepId").asText();
      String previousStep = null;
      for (JsonNode step : basis.path("sourceSteps")) {
        if (step.path("stepId").asText().equals(currentStep)) {
          break;
        }
        previousStep = step.path("stepId").asText();
      }
      require(previousStep != null, "EVIDENCE_MISMATCH", 422);
      JsonNode previousAction = null;
      int currentCount = 0;
      for (JsonNode candidate : basis.path("actions")) {
        String step = candidate.path("ledger").path("coordinate").path("stepId").asText();
        if (step.equals(currentStep)) {
          currentCount++;
        }
        if (step.equals(previousStep)) {
          require(previousAction == null, "EVIDENCE_MISMATCH", 422);
          previousAction = candidate;
        }
      }
      require(previousAction != null && currentCount == 1, "EVIDENCE_MISMATCH", 422);
      JsonNode prior =
          one(
              basis.path("preparations"),
              "preparationId",
              previousAction.path("preparationId").asText());
      JsonNode proposal = current.path("proposal"),
          priorProposal = prior.path("proposal"),
          priorLedger = previousAction.path("ledger");
      require(
          proposal.path("operation").path("kind").asText().equals("press")
              && proposal.path("target").path("kind").asText().equals("node")
              && java.util.Set.of("fill", "click", "check")
                  .contains(priorProposal.path("operation").path("kind").asText())
              && priorProposal.path("target").path("kind").asText().equals("node")
              && !priorProposal
                  .path("operation")
                  .path("value")
                  .path("kind")
                  .asText()
                  .equals("secretRef")
              && prior.path("proof").path("pressInheritance").isNull()
              && priorLedger.path("state").asText().equals("SUCCEEDED")
              && priorLedger.path("dispatchCount").asInt(-1) == 1
              && priorLedger.path("outcomeCode").asText().equals("OK")
              && priorLedger.path("attemptOrdinal").asInt(-1) == 0
              && action.path("ledger").path("attemptOrdinal").asInt(-1) == 0
              && priorProposal.path("coordinate").path("ordinal").asInt(-1) == 0
              && proposal.path("coordinate").path("ordinal").asInt(-1) == 0
              && priorProposal
                  .path("target")
                  .path("documentId")
                  .equals(proposal.path("target").path("documentId"))
              && priorProposal
                  .path("executionEvidence")
                  .path("origin")
                  .equals(proposal.path("executionEvidence").path("origin")),
          "EVIDENCE_MISMATCH",
          422);
      ObjectNode publicManifest = contracts.object();
      for (JsonNode step : basis.path("sourceSteps")) {
        publicManifest
            .withArray("sourceSteps")
            .addObject()
            .put("stepId", step.path("stepId").asText())
            .put("text", step.path("source").asText());
      }
      require(GuidedPressInheritance.bare(publicManifest, proposal), "EVIDENCE_MISMATCH", 422);
      JsonNode currentObligation =
          GuidedPressInheritance.onlyObligation(basis.path("translationPlan"), currentStep);
      JsonNode priorObligation =
          GuidedPressInheritance.onlyObligation(basis.path("translationPlan"), previousStep);
      require(
          currentObligation != null
              && priorObligation != null
              && currentObligation
                  .path("targetIntent")
                  .equals(priorObligation.path("targetIntent")),
          "EVIDENCE_MISMATCH",
          422);
      JsonNode priorObservation = observation(basis, prior.path("observationHash").asText()),
          currentObservation = observation(basis, current.path("observationHash").asText());
      JsonNode oldFact =
          priorObservation.path("facts").path(priorProposal.path("target").path("ref").asText());
      JsonNode currentFact =
          currentObservation.path("facts").path(proposal.path("target").path("ref").asText());
      require(
          oldFact.path("nameComplete").asBoolean(false)
              && oldFact.path("ownTextComplete").asBoolean(false)
              && currentFact.path("nameComplete").asBoolean(false)
              && currentFact.path("ownTextComplete").asBoolean(false)
              && GuidedPressInheritance.sameElementSelection(
                  com.citi.put.checks.studio.guided.translation.GuidedGates.selectionOf(
                      priorObservation.path("facts"), oldFact),
                  com.citi.put.checks.studio.guided.translation.GuidedGates.selectionOf(
                      currentObservation.path("facts"), currentFact))
              && com.citi.put.checks.studio.guided.translation.GuidedGates.scopeSatisfied(
                  priorObligation, priorObservation.path("facts"), oldFact)
              && com.citi.put.checks.studio.guided.translation.GuidedGates.scopeSatisfied(
                  currentObligation, currentObservation.path("facts"), currentFact)
              && com.citi.put.checks.studio.guided.translation.GuidedGates.intent(
                      priorProposal.path("operation").path("kind").asText(),
                      priorObligation.path("targetIntent").asText(),
                      com.citi.put.checks.studio.guided.translation.GuidedGates.of(oldFact))
                  .passed()
              && com.citi.put.checks.studio.guided.translation.GuidedGates.intent(
                      "press",
                      currentObligation.path("targetIntent").asText(),
                      com.citi.put.checks.studio.guided.translation.GuidedGates.of(currentFact))
                  .passed(),
          "EVIDENCE_MISMATCH",
          422);
      for (JsonNode excluded : basis.path("incrementalEvidence").path("excludedAttempts")) {
        require(
            !java.util.Set.of(previousStep, currentStep)
                .contains(
                    excluded
                        .path("action")
                        .path("ledger")
                        .path("coordinate")
                        .path("stepId")
                        .asText()),
            "EVIDENCE_MISMATCH",
            422);
      }
      ObjectNode expected =
          contracts
              .object()
              .put("kind", "same-element-press")
              .put(
                  "predecessorAdmissionId",
                  priorLedger.path("admission").path("admissionId").asText())
              .put("predecessorRequestDigest", priorLedger.path("requestDigest").asText())
              .put("predecessorOperationHash", priorLedger.path("operationHash").asText())
              .put("documentId", proposal.path("target").path("documentId").asText());
      expected.set("predecessorCoordinate", priorLedger.path("coordinate"));
      require(GuidedContracts.same(expected, inheritance), "EVIDENCE_MISMATCH", 422);
      String admission = action.path("ledger").path("admission").path("admissionId").asText();
      JsonNode witness = one(basis.path("guardAuthorizations"), "pressAdmissionId", admission);
      require(used.add(admission), "EVIDENCE_MISMATCH", 422);
      require(
          witness.path("predecessorAdmissionId").equals(inheritance.path("predecessorAdmissionId"))
              && witness.path("pressPreparationId").equals(current.path("preparationId"))
              && witness.path("predecessorPreparationId").equals(prior.path("preparationId"))
              && witness
                  .path("pressProofHash")
                  .asText()
                  .equals(GuidedContracts.hash(current.path("proof")))
              && witness
                  .path("predecessorProofHash")
                  .asText()
                  .equals(GuidedContracts.hash(prior.path("proof")))
              && witness.path("pressObservationHash").equals(current.path("observationHash"))
              && witness.path("predecessorObservationHash").equals(prior.path("observationHash"))
              && witness.path("sourceManifestHash").equals(basis.path("sourceManifestHash"))
              && witness
                  .path("sourceIdentityHash")
                  .asText()
                  .equals(GuidedContracts.hash(basis.path("snapshotEvidence").path("current"))),
          "EVIDENCE_MISMATCH",
          422);
      for (String field :
          List.of(
              "contextId",
              "contextRevision",
              "authoredInputsHash",
              "sourceRevision",
              "configurationRevision",
              "scopeHash",
              "workerId",
              "ownerFence")) {
        require(
            GuidedContracts.same(witness.path(field), current.path("proof").path(field))
                && GuidedContracts.same(
                    prior.path("proof").path(field), current.path("proof").path(field)),
            "EVIDENCE_MISMATCH",
            422);
      }
      require(
          GuidedActionGuard.ownText(oldFact) != null
              && GuidedActionGuard.ownText(currentFact) != null,
          "EVIDENCE_MISMATCH",
          422);
      JsonNode ground = witness.path("predecessorGrounding");
      String label;
      switch (ground.path("field").asText()) {
        case "NAME" -> label = oldFact.path("name").asText();
        case "OWN_TEXT" -> label = GuidedActionGuard.ownText(oldFact);
        case "ROLE" -> label = oldFact.path("role").asText();
        default -> label = null;
      }
      require(label != null && !label.isBlank(), "EVIDENCE_MISMATCH", 422);
      if (ground.path("field").asText().equals("ROLE")) {
        require(
            oldFact.path("name").asText().isEmpty()
                && "".equals(GuidedActionGuard.ownText(oldFact))
                && ground.path("mode").asText().equals("ROLE"),
            "EVIDENCE_MISMATCH",
            422);
      }
      String authored = publicSource(basis, ground.path("source"), previousStep);
      if (authored != null) {
        if (ground.path("mode").asText().equals("ALL_WORDS")) {
          var words =
              new java.util.HashSet<>(List.of(GuidedActionGuard.normalize(authored).split(" ")));
          require(
              words.containsAll(List.of(GuidedActionGuard.normalize(label).split(" "))),
              "EVIDENCE_MISMATCH",
              422);
        } else {
          require(GuidedActionGuard.containsPhrase(authored, label), "EVIDENCE_MISMATCH", 422);
        }
      }
      publicDestructive(basis, witness.path("predecessorDestructive"), oldFact, previousStep);
      publicDestructive(basis, witness.path("currentDestructive"), currentFact, currentStep);
    }
    require(used.size() == basis.path("guardAuthorizations").size(), "EVIDENCE_MISMATCH", 422);
  }

  private static void publicDestructive(
      JsonNode basis, JsonNode entries, JsonNode fact, String step) {
    List<String> verbs = GuidedActionGuard.destructiveTerms(fact);
    require(entries.size() == verbs.size(), "EVIDENCE_MISMATCH", 422);
    for (int index = 0; index < verbs.size(); index++) {
      JsonNode entry = entries.get(index);
      require(entry.path("verb").asText().equals(verbs.get(index)), "EVIDENCE_MISMATCH", 422);
      String authored = publicSource(basis, entry.path("source"), step);
      if (authored != null) {
        require(
            GuidedActionGuard.containsPhrase(authored, verbs.get(index)), "EVIDENCE_MISMATCH", 422);
      }
    }
  }

  private static String publicSource(JsonNode basis, JsonNode source, String step) {
    require(source.path("stepId").asText().equals(step), "EVIDENCE_MISMATCH", 422);
    if (source.path("kind").asText().equals("AUTHORED")) {
      return one(basis.path("sourceSteps"), "stepId", step).path("source").asText();
    }
    JsonNode declaration =
        one(
            basis.path("snapshotEvidence").path("current").path("authoredDeclarations"),
            "referenceId",
            source.path("declarationId").asText());
    require(
        declaration.path("kind").asText().equals("plain")
            && source.path("declarationHash").asText().equals(GuidedContracts.hash(declaration)),
        "EVIDENCE_MISMATCH",
        422);
    var identity =
        com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.snapshot(
                basis.path("snapshotEvidence").path("current"))
            .identity();
    boolean referenced = false;
    for (JsonNode references :
        List.of(identity.globalReferences(), identity.stepReferences().path(step))) {
      for (JsonNode reference : references) {
        referenced |=
            reference.path("referenceId").equals(source.path("declarationId"))
                && reference.path("kind").asText().equals("plain");
      }
    }
    require(referenced, "EVIDENCE_MISMATCH", 422);
    return null;
  }

  private static JsonNode observation(JsonNode raw, String hash) {
    if (hash.isEmpty()) {
      return com.fasterxml.jackson.databind.node.NullNode.instance;
    }
    return one(raw.path("observations"), "observationHash", hash).path("observation");
  }

  private static JsonNode one(JsonNode array, String field, String value) {
    JsonNode found = null;
    for (JsonNode node : array) {
      if (node.path(field).asText().equals(value)) {
        require(found == null, "EVIDENCE_MISMATCH", 422);
        found = node;
      }
    }
    require(found != null, "EVIDENCE_MISMATCH", 422);
    return found;
  }
}
