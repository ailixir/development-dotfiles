package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

/** Declarative exact-plan lowering. This class has no compiler, gateway, runner or SQL access. */
public final class ObservedArtifactLowerer {
  private final GuidedContracts contracts;
  private final GuidedPlanBuilder builder;
  private final ObservedReferencePolicyDeriver policies;

  public ObservedArtifactLowerer(GuidedContracts contracts) {
    this.contracts = contracts;
    this.builder = new GuidedPlanBuilder(contracts);
    this.policies = new ObservedReferencePolicyDeriver(contracts);
  }

  public PublicationContracts.Candidate lower(JsonNode basis, JsonNode profile) {
    // One collapsed tuple (STUDIO-OBS-012A): learned-plan versions = {contract: profile.contract};
    // the build identity is compared separately by ObservedReplayPins.
    ObjectNode versions = contracts.object();
    versions.set("contract", profile.path("contract"));
    ObjectNode plan = builder.plan(basis, versions);
    ArrayNode recipes = recipes(basis);
    ObjectNode policy = policies.derive(basis, plan, recipes);
    ObjectNode artifact = contracts.object().put("version", 3).put("kind", "observed");
    artifact.set("profile", profile.deepCopy());
    for (String field : List.of("sourceHash", "configurationHash", "authoringHash")) {
      artifact.set(field, basis.path(field));
    }
    artifact.set("learnedPlan", plan);
    artifact.put("learnedPlanHash", GuidedContracts.hash(plan));
    artifact.set("inputRecipes", recipes);
    artifact.set("replayPolicy", policy);
    ArrayNode guards = artifact.putArray("guards"), steps = artifact.putArray("steps");
    Map<String, ObjectNode> stepMap = new HashMap<>();
    for (JsonNode source : basis.path("sourceSteps")) {
      ObjectNode step =
          steps
              .addObject()
              .put("stepIndex", source.path("ordinal").asInt())
              .put("stepId", text(source, "stepId"));
      step.putArray("operations");
      stepMap.put(text(source, "stepId"), step);
    }
    ArrayNode operations = contracts.object().putArray("operations");
    int ordinal = 0;
    for (JsonNode fact : basis.path("actions")) {
      JsonNode proposal = GuidedPlanBuilder.proposal(basis, fact),
          execution = proposal.path("executionEvidence");
      String guardId = "g" + ordinal++;
      // ADR-SC-008: the Guard is only the origin the step ran on (null for the initial blank).
      guards.addObject().put("guardId", guardId).set("origin", execution.path("origin"));
      ObjectNode action = contracts.object().put("guardId", guardId);
      action.set("coordinate", proposal.path("coordinate").deepCopy());
      action.set("operation", proposal.path("operation").deepCopy());
      ObjectNode step = stepMap.get(text(proposal.path("coordinate"), "stepId"));
      require(step != null, "OPERATION_MISMATCH", 422);
      ((ArrayNode) step.path("operations")).add(action);
      operations.add(action.deepCopy());
    }
    ObjectNode equivalence = contracts.object();
    equivalence.set("operations", operations);
    equivalence.set("guards", guards);
    equivalence.set("inputRecipes", recipes);
    equivalence.set("bindings", basis.path("bindings"));
    equivalence.set("transfers", basis.path("transfers"));
    ObjectNode hashes = contracts.object();
    for (String field : List.of("sourceHash", "configurationHash", "authoringHash")) {
      hashes.set(field, basis.path(field));
    }
    hashes
        .put("learnedPlanHash", GuidedContracts.hash(plan))
        .put("artifactHash", GuidedContracts.hash(artifact))
        .put("referencePolicyHash", GuidedContracts.hash(policy))
        .put("operationEquivalenceHash", GuidedContracts.hash(equivalence))
        .put("admissionProvenanceHash", text(policy, "admissionProvenanceHash"))
        .put("publicationEvidenceHash", text(policy, "publicationEvidenceHash"))
        .put("runAuthorizationHash", text(policy, "runAuthorizationHash"))
        .put("profileHash", GuidedContracts.hash(profile));
    ObjectNode revision = revisionIdentity(basis, hashes);
    hashes.put("revisionDigest", GuidedContracts.hash(revision));
    return new PublicationContracts.Candidate(plan, artifact, policy, hashes);
  }

  public ObjectNode revisionIdentity(JsonNode basis, JsonNode hashes) {
    ObjectNode identity = contracts.object().put("version", 1);
    for (String field : List.of("testId", "csiId", "sourceRevision", "configurationRevision")) {
      identity.set(field, basis.path(field));
    }
    for (String field :
        List.of(
            "sourceHash",
            "configurationHash",
            "authoringHash",
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash",
            "runAuthorizationHash",
            "profileHash")) {
      identity.set(field, hashes.path(field));
    }
    return identity;
  }

  public ArrayNode recipes(JsonNode basis) {
    Map<String, Integer> order = new HashMap<>();
    for (JsonNode step : basis.path("sourceSteps")) {
      order.put(text(step, "stepId"), step.path("ordinal").asInt());
    }
    // Input history remains complete in the basis. A step's uses entry of kind input makes the
    // input a replay recipe; preparing/materializing a value is not execution authority.
    var usedInputs = new HashSet<String>();
    for (JsonNode fact : basis.path("actions")) {
      if (!fact.path("ledger").path("state").asText().equals("SUCCEEDED")) {
        continue;
      }
      JsonNode proposal = GuidedPlanBuilder.proposal(basis, fact);
      GuidedPlanBuilder.addUses(
          usedInputs, text(proposal.path("coordinate"), "stepId"), proposal.path("operation"));
    }
    List<ObjectNode> values = new ArrayList<>();
    var matched = new HashSet<String>();
    var ids = new HashSet<String>();
    var meanings = new HashSet<String>();
    for (JsonNode input : basis.path("inputs")) {
      JsonNode provenance = input.path("provenance");
      String stepId = text(input, "stepId");
      require(
          order.containsKey(stepId)
              && ids.add(text(input, "inputId"))
              && provenance.path("stepId").asText().equals(stepId)
              && provenance.path("kind").equals(input.path("kind")),
          "REFERENCE_MISMATCH",
          422);
      ObjectNode recipe = contracts.object();
      for (String field : List.of("inputId", "stepId", "kind")) {
        recipe.set(field, input.path(field));
      }
      ObjectNode projected = recipe.putObject("provenance");
      if (provenance.path("referenceKind").asText().equals("sourceSpan")) {
        JsonNode step = GuidedPlanBuilder.unique(basis.path("sourceSteps"), "stepId", stepId);
        String source = text(step, "source");
        int start = provenance.path("startUtf16").asInt(-1),
            end = provenance.path("endUtf16").asInt(-1);
        require(
            start >= 0
                && end > start
                && end <= source.length()
                && boundary(source, start)
                && boundary(source, end)
                && provenance.path("sourceRevision").equals(basis.path("sourceRevision")),
            "REFERENCE_MISMATCH",
            422);
        var secretToken =
            java.util.regex.Pattern.compile("<secret\\s+[A-Za-z0-9_.-]{1,64}>").matcher(source);
        while (secretToken.find()) {
          require(
              end <= secretToken.start() || start >= secretToken.end(), "REFERENCE_MISMATCH", 422);
        }
        // A template span never cuts a <var NAME> token in half.
        require(
            !com.citi.put.checks.studio.guided.bridge.SourceTemplate.splitsToken(
                source, start, end),
            "REFERENCE_MISMATCH",
            422);
        projected
            .put("kind", "sourceSpan")
            .put("start", start)
            .put("end", end)
            .set("sourceHash", basis.path("sourceHash"));
      } else {
        require(
            provenance.path("referenceKind").asText().equals("configuration")
                && provenance
                    .path("configurationRevision")
                    .equals(basis.path("configurationRevision")),
            "REFERENCE_MISMATCH",
            422);
        JsonNode mapped =
            GuidedPlanBuilder.unique(
                basis.path("configurationReferences"), "inputId", text(input, "inputId"));
        require(
            mapped.path("referenceId").equals(provenance.path("referenceId"))
                && mapped.path("stepId").equals(input.path("stepId")),
            "REFERENCE_MISMATCH",
            422);
        projected.put("kind", "configuration").set("referenceId", mapped.path("referenceId"));
        projected.set("referenceName", mapped.path("referenceName"));
      }
      ObjectNode meaning = recipe.deepCopy();
      meaning.remove("inputId");
      require(meanings.add(GuidedContracts.hash(meaning)), "REFERENCE_MISMATCH", 422);
      String useKey = GuidedPlanBuilder.useKey(stepId, input);
      if (usedInputs.contains(useKey)) {
        values.add(recipe);
        matched.add(useKey);
      }
    }
    require(matched.containsAll(usedInputs), "REFERENCE_MISMATCH", 422);
    values.sort(
        Comparator.comparingInt((ObjectNode r) -> order.get(text(r, "stepId")))
            .thenComparingInt(
                r -> r.path("provenance").path("kind").asText().equals("sourceSpan") ? 0 : 1)
            .thenComparingInt(r -> r.path("provenance").path("start").asInt())
            .thenComparingInt(r -> r.path("provenance").path("end").asInt())
            .thenComparing(
                r -> r.path("provenance").path("referenceId").asText(),
                ObservedArtifactLowerer::compareScalars)
            .thenComparing(r -> text(r, "kind"), ObservedArtifactLowerer::compareScalars)
            .thenComparing(r -> text(r, "inputId"), ObservedArtifactLowerer::compareScalars));
    ArrayNode result = contracts.object().putArray("inputs");
    values.forEach(result::add);
    return result;
  }

  private static boolean boundary(String value, int offset) {
    return offset == 0
        || offset == value.length()
        || !(Character.isHighSurrogate(value.charAt(offset - 1))
            && Character.isLowSurrogate(value.charAt(offset)));
  }

  private static int compareScalars(String left, String right) {
    var a = left.codePoints().iterator();
    var b = right.codePoints().iterator();
    while (a.hasNext() && b.hasNext()) {
      int compare = Integer.compare(a.nextInt(), b.nextInt());
      if (compare != 0) {
        return compare;
      }
    }
    return Boolean.compare(a.hasNext(), b.hasNext());
  }
}
