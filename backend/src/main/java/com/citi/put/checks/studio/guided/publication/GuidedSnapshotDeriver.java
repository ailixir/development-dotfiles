package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;

/** ARCH015-01: derive every snapshot from source/identity/learned facts, never a claimed map. */
public final class GuidedSnapshotDeriver {
  private final GuidedContracts contracts;

  public GuidedSnapshotDeriver(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public void apply(JsonNode basis, ObjectNode plan) {
    JsonNode proof = basis.path("snapshotEvidence");
    contracts.validate("v3/authoring-snapshot", proof);
    var current = IncrementalAuthoringIdentity.snapshot(proof.path("current"));
    require(
        current.authoring().steps().size() == basis.path("sourceSteps").size(),
        "EVIDENCE_MISMATCH",
        422);
    for (int index = 0; index < current.authoring().steps().size(); index++) {
      var step = current.authoring().steps().get(index);
      JsonNode source = basis.path("sourceSteps").get(index);
      require(
          step.id().toString().equals(source.path("stepId").asText())
              && step.text().equals(source.path("source").asText())
              && source.path("ordinal").asInt(-1) == index,
          "EVIDENCE_MISMATCH",
          422);
    }
    ObjectNode snapshots =
        IncrementalAuthoringIdentity.snapshots(
            current.authoring(), current.identity(), basis.path("configuration"), plan);
    ObjectNode reuse = contracts.object();
    JsonNode incremental = basis.path("incrementalEvidence");
    if (incremental.isNull()) {
      require(
          proof.path("pinnedBase").isNull() && proof.path("baseProof").isNull(),
          "EVIDENCE_MISMATCH",
          422);
      plan.putNull("incremental");
    } else {
      JsonNode initial = incremental.path("plan"), transition = incremental.path("switch");
      JsonNode pin = proof.path("pinnedBase"), program = incremental.path("program");
      require(
          pin.path("revisionId").equals(initial.path("baseRevisionId"))
              && pin.path("revisionId").equals(program.path("baseRevisionId"))
              && pin.path("revisionId").equals(transition.path("baseRevisionId"))
              && pin.path("revisionDigest").equals(program.path("baseRevisionDigest"))
              && transition
                  .path("initialFirstLearnStepId")
                  .equals(initial.path("initialFirstLearnStepId"))
              && GuidedContracts.hash(program).equals(initial.path("prefixProgramHash").asText()),
          "EVIDENCE_MISMATCH",
          422);
      int originalIndex = initial.path("initialFirstLearnIndex").asInt(-1);
      int effectiveIndex = transition.path("effectiveFirstLearnIndex").asInt(-1);
      require(
          originalIndex >= 0
              && originalIndex < current.authoring().steps().size()
              && effectiveIndex >= 0
              && effectiveIndex <= originalIndex
              && current
                  .authoring()
                  .steps()
                  .get(originalIndex)
                  .id()
                  .toString()
                  .equals(initial.path("initialFirstLearnStepId").asText())
              && current
                  .authoring()
                  .steps()
                  .get(effectiveIndex)
                  .id()
                  .toString()
                  .equals(transition.path("effectiveFirstLearnStepId").asText())
              && transition.path("completedPrefixCount").asInt(-1) == effectiveIndex,
          "EVIDENCE_MISMATCH",
          422);
      String reason = transition.path("reason").asText();
      int enteredOrdinal = transition.path("nextSemanticOrdinal").asInt(-1);
      if (reason.equals("BOUNDARY") || reason.equals("EMPTY_PREFIX")) {
        require(
            effectiveIndex == originalIndex
                && enteredOrdinal == 0
                && transition.path("driftReceiptHash").isNull()
                && incremental.path("driftReceipt").isNull()
                && incremental.path("excludedAttempts").isEmpty(),
            "EVIDENCE_MISMATCH",
            422);
      } else {
        JsonNode receipt = incremental.path("driftReceipt");
        contracts.validate("v3/bridge#/definitions/DriftReceipt", receipt);
        ObjectNode preimage = receipt.deepCopy();
        preimage.remove("receiptHash");
        require(
            reason.equals("DRIFT")
                && effectiveIndex < originalIndex
                && receipt
                    .path("coordinate")
                    .path("stepId")
                    .equals(transition.path("effectiveFirstLearnStepId"))
                && receipt
                    .path("coordinate")
                    .path("ordinal")
                    .equals(transition.path("nextSemanticOrdinal"))
                && receipt.path("receiptHash").equals(transition.path("driftReceiptHash"))
                && GuidedContracts.hash(preimage).equals(receipt.path("receiptHash").asText()),
            "EVIDENCE_MISMATCH",
            422);
      }
      if (originalIndex == 0) {
        require(
            proof.path("baseProof").isNull()
                && transition.path("reason").asText().equals("EMPTY_PREFIX")
                && program.path("sourceStepIds").isEmpty()
                && program.path("actions").isEmpty()
                && incremental.path("prefixRequests").isEmpty()
                && incremental.path("driftReceipt").isNull()
                && incremental.path("excludedAttempts").isEmpty()
                && transition.path("retainedPrefixAdmissionIds").isEmpty(),
            "EVIDENCE_MISMATCH",
            422);
      } else {
        JsonNode base = proof.path("baseProof");
        require(base.isObject(), "EVIDENCE_MISMATCH", 422);
        verifyBase(base, pin, basis);
        var old = IncrementalAuthoringIdentity.snapshot(base.path("authoringIdentity"));
        int computed =
            IncrementalAuthoringIdentity.boundary(
                current.authoring(),
                current.identity(),
                basis.path("configuration"),
                old.authoring(),
                old.identity(),
                base.path("configuration"));
        require(computed < 0 || originalIndex <= computed, "EVIDENCE_MISMATCH", 422);
        JsonNode oldSnapshots = base.path("revision").path("stepSnapshotHashes");
        ArrayNode prefixIds = contracts.object().putArray("items");
        for (int at = 0; at < originalIndex; at++) {
          require(
              current.authoring().steps().get(at).id().equals(old.authoring().steps().get(at).id()),
              "EVIDENCE_MISMATCH",
              422);
          prefixIds.add(current.authoring().steps().get(at).id().toString());
        }
        require(
            program.path("sourceStepIds").equals(prefixIds)
                && expectedProgram(base.path("artifact"), pin, prefixIds).equals(program),
            "EVIDENCE_MISMATCH",
            422);
        for (int at = 0; at < effectiveIndex; at++) {
          String id = current.authoring().steps().get(at).id().toString();
          require(snapshots.path(id).equals(oldSnapshots.path(id)), "EVIDENCE_MISMATCH", 422);
          reuse.putObject(id).put("revisionId", pin.path("revisionId").asText()).put("stepId", id);
        }
      }
      ArrayNode retained = contracts.object().putArray("items");
      int nextOrdinal = transition.path("nextSemanticOrdinal").asInt(-1);
      for (JsonNode action : basis.path("actions")) {
        JsonNode ledger = action.path("ledger"), coordinate = ledger.path("coordinate");
        int index = index(current.authoring(), coordinate.path("stepId").asText());
        if (index < effectiveIndex
            || index == effectiveIndex && coordinate.path("ordinal").asInt() < nextOrdinal) {
          JsonNode oldAction = null;
          for (JsonNode candidate : program.path("actions")) {
            if (candidate.path("coordinate").equals(coordinate)) {
              require(oldAction == null, "EVIDENCE_MISMATCH", 422);
              oldAction = candidate;
            }
          }
          require(
              oldAction != null
                  && oldAction.path("operationHash").equals(ledger.path("operationHash")),
              "EVIDENCE_MISMATCH",
              422);
          retained.add(ledger.path("admission").path("admissionId"));
        }
      }
      require(
          retained.equals(transition.path("retainedPrefixAdmissionIds"))
              && GuidedContracts.hash(retained)
                  .equals(transition.path("retainedPrefixAdmissionsHash").asText()),
          "EVIDENCE_MISMATCH",
          422);
      ObjectNode metadata = contracts.object();
      metadata.set("baseRevisionId", pin.path("revisionId"));
      metadata.set("initialFirstLearnStepId", initial.path("initialFirstLearnStepId"));
      metadata.set("effectiveFirstLearnStepId", transition.path("effectiveFirstLearnStepId"));
      metadata.set("retainedPrefixAdmissionIds", retained);
      metadata.set("driftReceiptHash", transition.path("driftReceiptHash"));
      plan.set("incremental", metadata);
    }
    plan.set("stepSnapshotHashes", snapshots);
    plan.set("reusedFrom", reuse);
  }

  public void verifyBase(JsonNode base, JsonNode pin, JsonNode basis) {
    JsonNode revision = base.path("revision"),
        identity = revision.path("identity"),
        artifact = base.path("artifact");
    contracts.validate("v3/revision", revision);
    contracts.validate("v3/replay-artifact", artifact);
    var source = IncrementalAuthoringIdentity.snapshot(base.path("authoringIdentity"));
    ArrayNode lines = contracts.object().putArray("items"),
        ordered = contracts.object().putArray("items");
    for (var step : source.authoring().steps()) {
      lines.add(step.text());
      ordered
          .addObject()
          .put("stepId", step.id().toString())
          .put("ordinal", ordered.size() - 1)
          .put("source", step.text());
    }
    require(
        revision.path("id").equals(pin.path("revisionId"))
            && revision.path("revisionDigest").equals(pin.path("revisionDigest"))
            && GuidedContracts.hash(identity).equals(pin.path("revisionDigest").asText())
            && identity.path("testId").equals(basis.path("testId"))
            && identity.path("csiId").equals(basis.path("csiId"))
            && GuidedContracts.hash(lines).equals(identity.path("sourceHash").asText())
            && GuidedContracts.hash(ordered).equals(identity.path("authoringHash").asText())
            && GuidedContracts.hash(base.path("configuration"))
                .equals(identity.path("configurationHash").asText())
            && GuidedContracts.hash(artifact).equals(identity.path("artifactHash").asText())
            && GuidedContracts.hash(artifact.path("learnedPlan"))
                .equals(identity.path("learnedPlanHash").asText())
            && artifact.path("learnedPlanHash").equals(identity.path("learnedPlanHash"))
            && GuidedContracts.hash(artifact.path("replayPolicy"))
                .equals(identity.path("referencePolicyHash").asText())
            && GuidedContracts.hash(artifact.path("profile"))
                .equals(identity.path("profileHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    for (String field : List.of("sourceHash", "configurationHash", "authoringHash")) {
      require(artifact.path(field).equals(identity.path(field)), "EVIDENCE_MISMATCH", 422);
    }
    for (String field :
        List.of("admissionProvenanceHash", "publicationEvidenceHash", "runAuthorizationHash")) {
      require(
          artifact.path("replayPolicy").path(field).equals(identity.path(field)),
          "EVIDENCE_MISMATCH",
          422);
    }
    ObjectNode equivalence = contracts.object();
    ArrayNode operations = equivalence.putArray("operations");
    for (JsonNode step : artifact.path("steps")) {
      step.path("operations").forEach(operations::add);
    }
    equivalence.set("guards", artifact.path("guards"));
    equivalence.set("inputRecipes", artifact.path("inputRecipes"));
    equivalence.set("bindings", artifact.path("replayPolicy").path("bindings"));
    equivalence.set("transfers", artifact.path("replayPolicy").path("transfers"));
    require(
        GuidedContracts.hash(equivalence)
            .equals(identity.path("operationEquivalenceHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    ObjectNode snapshots =
        IncrementalAuthoringIdentity.snapshots(
            source.authoring(),
            source.identity(),
            base.path("configuration"),
            artifact.path("learnedPlan"));
    require(
        snapshots.equals(revision.path("stepSnapshotHashes"))
            && snapshots.equals(artifact.path("learnedPlan").path("stepSnapshotHashes"))
            && revision.path("reusedFrom").equals(artifact.path("learnedPlan").path("reusedFrom")),
        "EVIDENCE_MISMATCH",
        422);
  }

  private ObjectNode expectedProgram(JsonNode artifact, JsonNode pin, JsonNode ids) {
    ObjectNode expected = contracts.object().put("schemaVersion", 3);
    expected.set("baseRevisionId", pin.path("revisionId"));
    expected.set("baseRevisionDigest", pin.path("revisionDigest"));
    expected.set("sourceStepIds", ids);
    ArrayNode actions = expected.putArray("actions");
    for (JsonNode id : ids) {
      for (JsonNode action : artifact.path("learnedPlan").path("actions")) {
        if (!action.path("coordinate").path("stepId").equals(id)) {
          continue;
        }
        ObjectNode copy = action.deepCopy();
        copy.remove("admissionId");
        JsonNode matched = null;
        for (JsonNode step : artifact.path("steps")) {
          for (JsonNode operation : step.path("operations")) {
            if (operation.path("coordinate").equals(action.path("coordinate"))) {
              require(matched == null, "EVIDENCE_MISMATCH", 422);
              matched =
                  GuidedPlanBuilder.unique(
                      artifact.path("guards"), "guardId", operation.path("guardId").asText());
            }
          }
        }
        require(matched != null, "EVIDENCE_MISMATCH", 422);
        copy.set("guard", matched);
        actions.add(copy);
      }
    }
    return expected;
  }

  private static int index(com.citi.put.checks.studio.dto.AuthoringV2Request source, String id) {
    for (int at = 0; at < source.steps().size(); at++) {
      if (source.steps().get(at).id().toString().equals(id)) {
        return at;
      }
    }
    throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
        "EVIDENCE_MISMATCH", 422);
  }
}
