package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.canonical;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.hash;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Declared synthetic conformance history, with no DB, callback, clock or native execution claims.
 * Every historical plan contains the same 100 actual current obligations; all 99 questions are
 * unique, exercised by their own successful click and backed by two small proper observations.
 * Expected documents use literal facts and the independent test canonical encoder, never a
 * production lowerer, snapshot/policy deriver, or an actual emitted candidate.
 */
final class IncrementalBoundaryFixture {
  private static final GuidedContracts C = new GuidedContracts();
  static final int EXACT_BYTES = 6_291_456;
  private static final int PLAN_COPIES = 100; // current plan + 99 historical question plans
  private static final String INSTANT = "2026-10-08T03:00:05.123456789Z";

  record Parent(
      ObjectNode basis,
      ObjectNode artifact,
      ObjectNode hashes,
      ObjectNode privateInputs,
      ObjectNode session,
      int baselineBytes,
      int intentBytes,
      int residue) {}

  private IncrementalBoundaryFixture() {}

  static Parent exact() throws Exception {
    JsonNode corpus =
        C.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    // Arithmetic construction, with no validator/lowerer retries or until-pass sampling.
    Parent small = construct(corpus, 0, 0);
    int baseline = bytes(small.basis());
    int remaining = EXACT_BYTES - baseline;
    if (remaining < 0 || remaining / PLAN_COPIES > 99 * 986) {
      throw new AssertionError("Declared lawful boundary dimensions cannot span 6 MiB");
    }
    int intentBytes = remaining / PLAN_COPIES, residue = remaining % PLAN_COPIES;
    Parent parent = construct(corpus, intentBytes, residue);
    if (bytes(parent.basis()) != baseline + PLAN_COPIES * intentBytes + residue
        || bytes(parent.basis()) != EXACT_BYTES) {
      throw new AssertionError(
          "Boundary arithmetic must equal exactly 6291456 canonical UTF-8 bytes");
    }
    return new Parent(
        parent.basis(),
        parent.artifact(),
        parent.hashes(),
        parent.privateInputs(),
        parent.session(),
        baseline,
        intentBytes,
        residue);
  }

  static int bytes(JsonNode value) {
    return canonical(value).getBytes(StandardCharsets.UTF_8).length;
  }

  static ObjectNode plusOne(Parent parent) {
    ObjectNode basis = parent.basis().deepCopy();
    ObjectNode witness = obj(basis.path("preparations").get(1), "observedChoice");
    ObjectNode provider = (ObjectNode) witness.at("/attempt/modelQuestion/choices/0");
    provider.put("safeLabel", provider.path("safeLabel").asText() + "a");
    resealWitness(witness);
    return basis;
  }

  private static Parent construct(JsonNode corpus, int intentBytes, int residue) {
    ObjectNode basis = corpus.at("/incrementalContracts/basisCases/4/basis").deepCopy();
    String sessionId = basis.path("sessionId").asText();
    String scopeHash = hash(basis.path("scope"));
    JsonNode originalNav = basis.path("preparations").get(0).deepCopy();
    JsonNode originalLedger = basis.path("actions").get(0).path("ledger").deepCopy();
    JsonNode originalClick = corpus.at("/observedChoice/basis/preparations/3");
    JsonNode originalObservation = corpus.at("/observedChoice/basis/observations/0/observation");
    ArrayNode sources = basis.putArray("sourceSteps"), sourceLines = arr();
    ObjectNode current = obj(obj(basis, "snapshotEvidence"), "current");
    current.putArray("authoredDeclarations");
    ObjectNode authoring = obj(current, "authoring");
    authoring.set("globalContext", context());
    ArrayNode authored = authoring.putArray("steps");
    ObjectNode plan = basis.putObject("translationPlan");
    ArrayNode references = plan.putArray("sourceReferences"),
        obligations = plan.putArray("obligations");
    plan.putArray("needs");
    references.add(basis.path("inputs").get(0).path("provenance").deepCopy());
    int remainingIntent = intentBytes;
    for (int index = 0; index < 100; index++) {
      String id = stepId(index),
          source = index == 0 ? "Open https://orders.example.test/start" : "Click Proceed";
      sources.addObject().put("stepId", id).put("ordinal", index).put("source", source);
      sourceLines.add(source);
      authored.addObject().put("id", id).put("text", source).set("context", context());
      int addedBytes = index == 0 ? 0 : Math.min(986, remainingIntent);
      remainingIntent -= addedBytes;
      ObjectNode obligation =
          obligations
              .addObject()
              .put("obligationId", obligationId(index))
              .put("stepId", id)
              .put("occurrence", 0)
              .put("operationKind", index == 0 ? "navigate" : "click")
              .put(
                  "targetIntent",
                  index == 0
                      ? "page"
                      : "Proceed" + "é".repeat(addedBytes / 2) + (addedBytes % 2 == 0 ? "" : "e"));
      if (index == 0) {
        obligation.put("referenceIndex", 0);
      } else {
        obligation.putNull("referenceIndex");
      }
      obligation.putNull("needId").putNull("predicate");
    }
    if (remainingIntent != 0) {
      throw new AssertionError("TargetIntent dimensions exhausted");
    }
    basis.put("sourceHash", hash(sourceLines)).put("authoringHash", hash(sources));
    ObjectNode manifest = C.object();
    ArrayNode manifestSteps = manifest.putArray("sourceSteps");
    sources.forEach(
        s ->
            manifestSteps
                .addObject()
                .put("stepId", s.path("stepId").asText())
                .put("text", s.path("source").asText()));
    manifest.putArray("configurationReferences");
    basis.put("sourceManifestHash", hash(manifest));
    for (String field :
        List.of(
            "configurationReferences",
            "sourceSelections",
            "allocations",
            "producers",
            "consumerEdges",
            "bindings",
            "transfers")) {
      basis.putArray(field);
    }
    ArrayNode inputs = basis.putArray("inputs");
    ObjectNode privateInput =
        corpus.at("/observedChoice/syntheticTestMetadata/privateInputs/inputs/0").deepCopy();
    ObjectNode input = inputs.addObject();
    for (String field : List.of("inputId", "kind", "intendedSlot", "provenance")) {
      input.set(field, privateInput.path(field));
    }
    input.set("stepId", privateInput.path("sourceStepId"));
    ObjectNode privateInputs =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", sessionId)
            .put("scopeHash", scopeHash)
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    privateInputs.putArray("inputs").add(privateInput);
    String inputsHash = hash(privateInputs);
    basis.put("authoredInputsHash", inputsHash).put("translationHash", hash(plan));
    ObjectNode history = basis.putObject("materializationEvidence");
    ObjectNode header = history.putArray("versions").addObject();
    header
        .put("schemaVersion", 3)
        .put("sessionId", sessionId)
        .put("scopeHash", scopeHash)
        .put("contextId", "context-1")
        .put("contextRevision", 1)
        .put("workerId", "worker-1")
        .put("ownerFence", 1)
        .put("sourceRevision", "1")
        .put("configurationRevision", "1")
        .put("authoredInputsHash", inputsHash)
        .put("birthMaterializationRevision", 1)
        .put("inputCount", 1)
        .putNull("previousInputsHash");
    ObjectNode metadata = privateInput.deepCopy();
    metadata.remove("value");
    history
        .putArray("entries")
        .addObject()
        .put("inputOrdinal", 0)
        .put("inputId", "input-destination")
        .put("introducedContextRevision", 1)
        .put("inputHash", hash(privateInput))
        .set("metadata", metadata);
    obj(basis, "bootstrap").put("inputsHash", inputsHash).put("allocationHash", hash(arr()));
    ObjectNode session =
        C.object()
            .put("sessionId", sessionId)
            .put("scopeHash", scopeHash)
            .put("expiresAt", "2026-10-08T03:10:00Z");
    session.set("scope", basis.path("scope"));
    session.set("runAuthorization", basis.path("runAuthorization"));
    session
        .putObject("owner")
        .put("workerId", "worker-1")
        .put("fence", 1)
        .put("leaseExpiresAt", "2026-10-08T03:00:30Z");
    ArrayNode preparations = basis.putArray("preparations"), actions = basis.putArray("actions");
    ArrayNode associations = basis.putArray("obligationAssociations"),
        observations = basis.putArray("observations");
    for (int index = 0; index < 100; index++) {
      ObjectNode preparation = (index == 0 ? originalNav : originalClick).deepCopy();
      String prepId = "boundary-preparation-" + index, admissionId = "boundary-admission-" + index;
      ObjectNode coordinate = C.object().put("stepId", stepId(index)).put("ordinal", 0);
      ObjectNode proposal = obj(preparation, "proposal"), proof = obj(preparation, "proof");
      proposal
          .put("sessionId", sessionId)
          .put("scopeHash", scopeHash)
          .put("authoredInputsHash", inputsHash)
          .put("contextRevision", 1)
          .set("coordinate", coordinate);
      proof
          .put("sessionId", sessionId)
          .put("workerId", "worker-1")
          .put("ownerFence", 1)
          .put("scopeHash", scopeHash)
          .put("contextId", "context-1")
          .put("contextRevision", 1)
          .put("authoredInputsHash", inputsHash)
          .put("preparationId", prepId);
      preparation.put("preparationId", prepId).put("materializationRevision", 1);
      ObjectNode execution;
      if (index == 0) {
        execution = basis.at("/bootstrap/initialEvidence").deepCopy();
        preparation.putNull("observationHash");
      } else {
        ObjectNode old = observation(originalObservation, sessionId, scopeHash, index, false);
        ObjectNode fresh = observation(originalObservation, sessionId, scopeHash, index, true);
        String oldHash = hash(old), freshHash = hash(fresh);
        observations.addObject().put("observationHash", oldHash).set("observation", old);
        observations.addObject().put("observationHash", freshHash).set("observation", fresh);
        execution = execution(sessionId, fresh, freshHash);
        proposal.put("generation", 2 * index);
        ObjectNode target =
            proposal
                .putObject("target")
                .put("nodeId", nodeId(index, true, 0))
                .put("documentId", "document-1")
                .put("generation", 2 * index);
        target.set("locator", locator(index, 0));
        proposal.putObject("operation").put("kind", "click");
        preparation.put("observationHash", freshHash);
        ObjectNode witness =
            witness(
                originalClick.path("observedChoice"),
                session,
                header,
                plan,
                index,
                prepId,
                coordinate,
                execution(sessionId, old, oldHash),
                index == 1 ? residue : 0);
        preparation.set("observedChoice", witness);
      }
      preparation.set("executionEvidence", execution);
      proposal.set("executionEvidence", execution.deepCopy());
      proposal.put("evidenceHash", hash(execution));
      proof.put("evidenceHash", hash(execution));
      String proposalHash = hash(proposal);
      proof.put("requestDigest", proposalHash);
      ObjectNode ledger = originalLedger.deepCopy();
      ledger
          .put("sessionId", sessionId)
          .put("scopeHash", scopeHash)
          .put("preparationId", prepId)
          .put("idempotencyKey", "boundary-idempotency-" + index)
          .put("requestDigest", proposalHash)
          .put("generation", index == 0 ? 0 : 2 * index)
          .put("documentId", execution.path("documentId").asText())
          .put("authoredInputsHash", inputsHash)
          .put("contextRevision", 1)
          .put("attemptOrdinal", 0)
          .putNull("assertionPassed");
      ledger.set("coordinate", coordinate);
      ledger.set("executionEvidence", execution.deepCopy());
      ledger.put("evidenceHash", hash(execution));
      ObjectNode operation = C.object();
      operation.set("coordinate", coordinate);
      operation.set("origin", execution.path("origin"));
      operation.set("locator", index == 0 ? C.object().nullNode() : locator(index, 0));
      operation.set("operation", proposal.path("operation"));
      ledger.put("operationHash", hash(operation));
      ObjectNode decision =
          C.object().put("scopeHash", scopeHash).put("requestDigest", proposalHash);
      decision.set("preparation", proof);
      obj(ledger, "admission")
          .put("admissionId", admissionId)
          .put("policyDecisionHash", hash(decision));
      preparations.add(preparation);
      actions
          .addObject()
          .put("obligationId", obligationId(index))
          .put("preparationId", prepId)
          .set("ledger", ledger);
      associations
          .addObject()
          .put("obligationId", obligationId(index))
          .put("admissionId", admissionId)
          .put("proposalHash", proposalHash)
          .set("coordinate", coordinate);
    }
    ObjectNode expected = expectedArtifact(basis, corpus.path("artifact").path("profile"));
    return new Parent(
        basis,
        expected,
        expectedHashes(basis, expected),
        privateInputs,
        session,
        0,
        intentBytes,
        residue);
  }

  private static ObjectNode observation(
      JsonNode template, String sessionId, String scopeHash, int index, boolean fresh) {
    int generation = 2 * index - (fresh ? 0 : 1);
    ObjectNode observation = template.deepCopy();
    observation
        .put("sessionId", sessionId)
        .put("scopeHash", scopeHash)
        .put("generation", generation)
        .put("observedAt", INSTANT);
    ArrayNode nodes = observation.putArray("nodes");
    for (int choice = 0; choice < 2; choice++) {
      ObjectNode node = template.path("nodes").get(0).deepCopy();
      node.put("nodeId", nodeId(index, fresh, choice))
          .put("generation", generation)
          .put("role", "button")
          .put("name", choice == 0 ? "Proceed" : "Continue")
          .put("elementType", "button")
          .put("controlType", "none")
          .put("classification", "nonsecretApproved")
          .put("policyRuleId", "nonsecret-form");
      node.putArray("locatorHints").add(locator(index, choice));
      nodes.add(node);
    }
    return observation;
  }

  private static ObjectNode execution(String sessionId, JsonNode observation, String hash) {
    ObjectNode result =
        C.object()
            .put("kind", "observedDocument")
            .put("sessionId", sessionId)
            .put("contextId", "context-1")
            .put("observationHash", hash);
    for (String field : List.of("documentId", "generation", "origin")) {
      result.set(field, observation.path(field));
    }
    return result;
  }

  private static ObjectNode witness(
      JsonNode template,
      JsonNode session,
      JsonNode header,
      JsonNode plan,
      int index,
      String prepId,
      JsonNode coordinate,
      JsonNode oldExecution,
      int residue) {
    ObjectNode witness = template.deepCopy(),
        identity = obj(witness, "context"),
        receipt = obj(witness, "receipt"),
        question = obj(identity, "question"),
        capture = obj(identity, "questionCapture"),
        attempt = obj(witness, "attempt"),
        answer = obj(receipt, "answer");
    String clarification = "boundary-question-" + index,
        choiceId = "boundary-choice-" + index + "-0";
    String sessionId = session.path("sessionId").asText(),
        scopeHash = session.path("scopeHash").asText();
    for (ObjectNode object : List.of(identity, receipt, question, answer)) {
      object.put("sessionId", sessionId).put("clarificationId", clarification);
    }
    for (ObjectNode object : List.of(identity, question, answer, attempt)) {
      object.put("scopeHash", scopeHash);
    }
    receipt
        .put("preparationId", prepId)
        .put("obligationId", obligationId(index))
        .put("acceptedChoiceId", choiceId);
    witness.put("acceptedChoiceId", choiceId);
    for (ObjectNode object : List.of(question, answer)) {
      object.set("coordinate", coordinate);
      object.put("documentId", "document-1").put("generation", 2 * index - 1);
    }
    answer
        .put("choiceId", choiceId)
        .put("nodeId", nodeId(index, false, 0))
        .put("resolvedAt", INSTANT);
    capture
        .put("attemptId", "boundary-attempt-" + index)
        .put("requestId", "boundary-request-" + index)
        .put("planRevision", "2")
        .put("obligationId", obligationId(index))
        .put("planHash", hash(plan));
    for (String field :
        List.of("contextId", "contextRevision", "authoredInputsHash", "workerId", "ownerFence")) {
      capture.set(field, header.path(field));
    }
    capture.set("executionEvidence", oldExecution);
    capture.set("observationHash", oldExecution.path("observationHash"));
    capture.put("evidenceHash", hash(oldExecution));
    for (String field :
        List.of("attemptId", "requestId", "attempt", "planRevision", "executionEvidence")) {
      attempt.set(field, capture.path(field));
    }
    attempt.set("scope", session.path("scope"));
    attempt.set("owner", session.path("owner"));
    attempt
        .put("responseRequestId", capture.path("requestId").asText())
        .put("documentId", "document-1")
        .put("generation", 2 * index - 1);
    attempt.put(
        "projectionHash",
        hash(
            C.object()
                .put("kind", "NEXT_ACTION")
                .put("stepId", stepId(index))
                .put("generation", 2 * index - 1)));
    ArrayNode choices = question.putArray("choices"), meanings = witness.putArray("meanings");
    ObjectNode model = obj(attempt, "modelQuestion");
    ArrayNode providerChoices = model.putArray("choices");
    for (int choice = 0; choice < 2; choice++) {
      String id = "boundary-choice-" + index + "-" + choice;
      choices
          .addObject()
          .put("choiceId", id)
          .put("safeLabel", choice == 0 ? "Proceed" : "Continue")
          .put("labelSource", "PAGE")
          .put("role", "button")
          .putNull("region")
          .put("nodeId", nodeId(index, false, choice))
          .putNull("bindingId");
      ObjectNode meaning =
          C.object()
              .put("obligationId", obligationId(index))
              .put("nodeId", nodeId(index, false, choice))
              .putNull("bindingId");
      meaning.set("locator", locator(index, choice));
      meanings.addObject().put("choiceId", id).set("meaning", meaning);
      providerChoices
          .addObject()
          .put("choiceId", "boundary-provider-" + index + "-" + choice)
          .put("safeLabel", "audit" + (choice == 0 ? "a".repeat(residue) : ""))
          .set("meaning", meaning.deepCopy());
    }
    ObjectNode questionPlan = obj(witness, "questionPlan");
    questionPlan.put("revision", "2").put("planHash", hash(plan)).set("plan", plan.deepCopy());
    resealWitness(witness);
    return witness;
  }

  private static void resealWitness(ObjectNode witness) {
    ObjectNode identity = obj(witness, "context"),
        capture = obj(identity, "questionCapture"),
        receipt = obj(witness, "receipt");
    capture.put("modelQuestionHash", hash(witness.at("/attempt/modelQuestion")));
    receipt
        .put("questionCaptureHash", hash(capture))
        .put("contextIdentityHash", hash(identity))
        .put("meaningsHash", hash(witness.path("meanings")));
  }

  private static ObjectNode expectedArtifact(JsonNode basis, JsonNode profile) {
    ObjectNode artifact = C.object().put("version", 3).put("kind", "observed");
    artifact.set("profile", profile);
    for (String field : List.of("sourceHash", "configurationHash", "authoringHash")) {
      artifact.set(field, basis.path(field));
    }
    ObjectNode plan =
        artifact
            .putObject("learnedPlan")
            .put("schemaVersion", 3)
            .put(
                "planId",
                "plan-" + hash(C.object().put("sessionId", basis.path("sessionId").asText())))
            .put("scopeHash", hash(basis.path("scope")));
    for (String field : List.of("sourceRevision", "configurationRevision", "authoredInputsHash")) {
      plan.set(field, basis.path(field));
    }
    plan.set("initialContext", C.object().put("kind", "initialBlank"));
    plan.putObject("versions").put("contract", 3);
    ArrayNode sourceIds = plan.putArray("sourceSteps"),
        planActions = plan.putArray("actions"),
        guards = artifact.putArray("guards"),
        steps = artifact.putArray("steps"),
        tuples = arr();
    plan.putArray("bindings");
    ObjectNode maps = C.object();
    ObjectNode config = C.object().put("domain", "studio.test-config").put("version", 1);
    for (String field :
        List.of("environment", "browser", "viewport", "timeoutSeconds", "waitStrategy")) {
      config.set(field, basis.path("configuration").path(field));
    }
    config.put("globalContextHash", hash(context())).set("globalReferences", arr());
    String previous = hash(config);
    for (int index = 0; index < 100; index++) {
      String id = stepId(index);
      sourceIds.add(id);
      ObjectNode coordinate = C.object().put("stepId", id).put("ordinal", 0);
      ObjectNode operation = C.object().put("kind", index == 0 ? "navigate" : "click");
      if (index == 0) {
        operation.put("destinationInputId", "input-destination");
      }
      ObjectNode action = planActions.addObject();
      action.set("coordinate", coordinate);
      if (index == 0) {
        action.putNull("origin");
      } else {
        action.put("origin", "https://orders.example.test");
      }
      action.set("locator", index == 0 ? C.object().nullNode() : locator(index, 0));
      action.set("operation", operation);
      ObjectNode operationIdentity = action.deepCopy();
      action
          .put("operationHash", hash(operationIdentity))
          .put("admissionId", "boundary-admission-" + index);
      ObjectNode guard = guards.addObject().put("guardId", "g" + index);
      guard.set("origin", action.path("origin"));
      ObjectNode target =
          guard.putObject("target").put("kind", index == 0 ? "initialBlank" : "element");
      if (index > 0) {
        target.set("locator", locator(index, 0));
        target
            .put("role", "button")
            .put("elementType", "button")
            .put("controlType", "none")
            .put("classification", "nonsecretApproved")
            .put("visible", true)
            .put("actionable", true)
            .putNull("readRuleId");
      }
      ObjectNode step = steps.addObject().put("stepIndex", index).put("stepId", id);
      ObjectNode executable = step.putArray("operations").addObject().put("guardId", "g" + index);
      executable.set("coordinate", coordinate);
      executable.set("operation", operation);
      ObjectNode input =
          C.object()
              .put("domain", "studio.step-input")
              .put("version", 1)
              .put("stepId", id)
              .put("text", index == 0 ? "Open https://orders.example.test/start" : "Click Proceed");
      input.set("context", context());
      input.set("references", arr());
      ObjectNode chain =
          C.object()
              .put("domain", "studio.step-chain")
              .put("version", 1)
              .put("stepId", id)
              .put("stepInputHash", hash(input))
              .put("previous", previous);
      previous = hash(chain);
      ObjectNode content = C.object();
      ObjectNode semanticAction = action.deepCopy();
      semanticAction.remove("admissionId");
      content.putArray("actions").add(semanticAction);
      content.putArray("producedBindings");
      content.putArray("consumedBindings");
      maps.put(
          id,
          hash(
              C.object()
                  .put("domain", "studio.step-snapshot")
                  .put("version", 1)
                  .put("stepId", id)
                  .put("inputChain", previous)
                  .put("learnedStepHash", hash(content))));
      JsonNode ledger = basis.path("actions").get(index).path("ledger");
      ObjectNode tuple = tuples.addObject();
      for (String field : List.of("coordinate", "admission", "operationHash", "scopeHash")) {
        tuple.set(field, ledger.path(field));
      }
    }
    plan.set("stepSnapshotHashes", maps);
    plan.putObject("reusedFrom");
    JsonNode incremental = basis.path("incrementalEvidence");
    ObjectNode metadata = plan.putObject("incremental");
    metadata.set("baseRevisionId", basis.at("/snapshotEvidence/pinnedBase/revisionId"));
    metadata.set("initialFirstLearnStepId", incremental.at("/plan/initialFirstLearnStepId"));
    metadata.set("effectiveFirstLearnStepId", incremental.at("/switch/effectiveFirstLearnStepId"));
    metadata.putArray("retainedPrefixAdmissionIds");
    metadata.putNull("driftReceiptHash");
    String planHash = hash(plan);
    artifact.put("learnedPlanHash", planHash);
    ObjectNode recipe =
        artifact
            .putArray("inputRecipes")
            .addObject()
            .put("inputId", "input-destination")
            .put("stepId", stepId(0))
            .put("kind", "destination")
            .put("intendedSlot", "navigate.destination");
    recipe
        .putObject("provenance")
        .put("kind", "sourceSpan")
        .put("start", 5)
        .put("end", 38)
        .put("sourceHash", basis.path("sourceHash").asText());
    ObjectNode evidence =
        C.object()
            .put("version", 1)
            .put("basisHash", hash(basis))
            .put("runAuthorizationHash", hash(basis.path("runAuthorization")))
            .put("translationHash", basis.path("translationHash").asText())
            .put("bootstrapHash", hash(basis.path("bootstrap")))
            .put("sourceManifestHash", basis.path("sourceManifestHash").asText());
    ObjectNode policy =
        artifact
            .putObject("replayPolicy")
            .put("schemaVersion", 4)
            .put("learnedPlanHash", planHash)
            .put("admissionProvenanceHash", hash(tuples))
            .put("publicationEvidenceHash", hash(evidence))
            .put("runAuthorizationHash", hash(basis.path("runAuthorization")));
    policy.set("scope", basis.path("replayRequirements"));
    policy.set("inputs", artifact.path("inputRecipes").deepCopy());
    policy.putArray("bindings");
    policy.putArray("transfers");
    return artifact;
  }

  private static ObjectNode expectedHashes(JsonNode basis, JsonNode artifact) {
    ObjectNode hashes = C.object(), equivalence = C.object();
    ArrayNode operations = equivalence.putArray("operations");
    for (JsonNode step : artifact.path("steps")) {
      step.path("operations").forEach(operations::add);
    }
    for (String field : List.of("guards", "inputRecipes")) {
      equivalence.set(field, artifact.path(field));
    }
    equivalence.putArray("bindings");
    equivalence.putArray("transfers");
    for (String field : List.of("sourceHash", "configurationHash", "authoringHash")) {
      hashes.set(field, basis.path(field));
    }
    hashes
        .put("learnedPlanHash", hash(artifact.path("learnedPlan")))
        .put("artifactHash", hash(artifact))
        .put("referencePolicyHash", hash(artifact.path("replayPolicy")))
        .put("operationEquivalenceHash", hash(equivalence))
        .put("profileHash", hash(artifact.path("profile")));
    for (String field :
        List.of("admissionProvenanceHash", "publicationEvidenceHash", "runAuthorizationHash")) {
      hashes.set(field, artifact.path("replayPolicy").path(field));
    }
    ObjectNode revision = C.object().put("version", 1);
    for (String field : List.of("testId", "csiId", "sourceRevision", "configurationRevision")) {
      revision.set(field, basis.path(field));
    }
    hashes.fields().forEachRemaining(entry -> revision.set(entry.getKey(), entry.getValue()));
    hashes.put("revisionDigest", hash(revision));
    return hashes;
  }

  private static ObjectNode locator(int index, int choice) {
    return C.object()
        .put("kind", "testId")
        .put("value", "proceed-" + index + "-" + choice)
        .put("exact", true);
  }

  private static String nodeId(int index, boolean fresh, int choice) {
    return "button-" + index + "-" + (fresh ? "fresh" : "old") + "-" + choice;
  }

  private static String stepId(int index) {
    return String.format(java.util.Locale.ROOT, "00000000-0000-4000-8000-%012d", index + 1);
  }

  private static String obligationId(int index) {
    return String.format(java.util.Locale.ROOT, "00000000-0000-4000-8000-%012d", index + 1000);
  }

  private static ObjectNode context() {
    ObjectNode context = C.object();
    context.putArray("entries");
    context.putArray("evidenceReferences");
    return context;
  }

  private static ObjectNode obj(JsonNode node, String field) {
    return (ObjectNode) node.path(field);
  }

  private static ArrayNode arr() {
    return C.object().putArray("items");
  }
}
