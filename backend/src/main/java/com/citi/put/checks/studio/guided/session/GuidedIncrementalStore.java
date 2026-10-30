package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.authoring.IncrementalChangeService;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Immutable incremental facts. Callers hold the session row, then the existing source lock. */
public final class GuidedIncrementalStore {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public GuidedIncrementalStore(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  public record Selection(IncrementalChangeService.Change change, int index, ObjectNode program) {}

  public Selection select(JsonNode request, AllowedDomains domains) {
    var change =
        new IncrementalChangeService(jdbc)
            .inspect(UUID.fromString(request.path("testId").asText()));
    require(
        change.authoring() != null && !change.authoring().steps().isEmpty(),
        "INVALID_CONTRACT",
        422);
    UUID base = change.baseRevisionId();
    if (request.hasNonNull("baseRevisionId")
        && (base == null || !base.toString().equals(request.path("baseRevisionId").asText()))) {
      throw conflict("BASE_REVISION_MISMATCH");
    }
    int index = change.changed() ? change.index() : 0;
    if (request.hasNonNull("firstLearnStepId")) {
      int requested = -1;
      for (int at = 0; at < change.authoring().steps().size(); at++) {
        if (change
            .authoring()
            .steps()
            .get(at)
            .id()
            .toString()
            .equals(request.path("firstLearnStepId").asText())) {
          requested = at;
        }
      }
      if (requested < 0) {
        throw conflict("FIRST_LEARN_STEP_UNKNOWN");
      }
      if (change.changed() && requested > change.index()) {
        throw conflict("FIRST_LEARN_STEP_NARROWED");
      }
      index = requested;
    }
    if (change.reason() != null && !(request.hasNonNull("firstLearnStepId") && index == 0)) {
      throw conflict("BASE_IDENTITY_INCOMPLETE");
    }
    if (base == null) {
      require(index == 0, "REVISION_CONFLICT", 409);
      return new Selection(change, 0, null);
    }
    ArrayNode ids = contracts.object().putArray("items");
    for (int at = 0; at < index; at++) {
      ids.add(change.authoring().steps().get(at).id().toString());
    }
    ObjectNode program =
        (ObjectNode)
            contracts.parse(
                jdbc.queryForObject(
                    "SELECT studio_015_prefix_program(?,?::jsonb)::text",
                    String.class,
                    base,
                    ids.toString()));
    for (JsonNode action : program.path("actions")) {
      if (action.path("operation").path("kind").asText().equals("navigate")) {
        JsonNode recipe =
            com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.unique(
                change.baseArtifact().path("inputRecipes"),
                "inputId",
                action.path("operation").path("destinationInputId").asText());
        String destination = null;
        JsonNode provenance = recipe.path("provenance");
        if (provenance.path("kind").asText().equals("sourceSpan")) {
          var source =
              change.authoring().steps().stream()
                  .filter(step -> step.id().toString().equals(recipe.path("stepId").asText()))
                  .findFirst()
                  .orElseThrow();
          int start = provenance.path("start").asInt(-1), end = provenance.path("end").asInt(-1);
          require(
              start >= 0 && end > start && end <= source.text().length(),
              "REFERENCE_MISMATCH",
              422);
          destination = source.text().substring(start, end);
        } else {
          String variables =
              jdbc.queryForObject(
                  "SELECT variables::text FROM ui_tests WHERE id=?",
                  String.class,
                  UUID.fromString(request.path("testId").asText()));
          for (var variable :
              com.citi.put.checks.studio.dto.CanonicalStudioCodec.parseVariables(variables)) {
            if (variable.kind().equals("plain")
                && variable.name().equals(provenance.path("referenceName").asText())) {
              destination = variable.value();
            }
          }
        }
        require(destination != null, "MISSING_SOURCE", 409);
        requireAllowed(destination, domains);
      }
      // The reused prefix replays on the origin each step learned on, which must be on the
      // deployment's list as it stands now.
      JsonNode origin = action.path("origin");
      if (!origin.isNull() && !origin.isMissingNode()) {
        requireAllowed(origin.asText(), domains);
      }
    }
    return new Selection(change, index, program);
  }

  public void freeze(JsonNode session, Selection selection) {
    if (selection.program() == null) {
      return;
    }
    String id = session.path("sessionId").asText();
    jdbc.update(
        "INSERT INTO studio_guided_relearn_plans(session_id,base_revi"
            + "sion_id,initial_step_id,"
            + "initial_step_index,prefix_program,prefix_program_hash) VALUE"
            + "S (?,?,?, ?,?::jsonb,?)",
        id,
        selection.change().baseRevisionId(),
        selection.change().authoring().steps().get(selection.index()).id().toString(),
        selection.index(),
        selection.program().toString(),
        GuidedContracts.hash(selection.program()));
    if (selection.index() == 0) {
      switchToLearning(session, "EMPTY_PREFIX", 0, 0, null);
    } else {
      jdbc.update(
          "UPDATE studio_guided_translation_state SET continuation='REPLAYING_PREFIX' WHERE"
              + " session_id=?",
          id);
    }
  }

  public boolean pending(String id) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject("SELECT studio_015_prefix_pending(?)", Boolean.class, id));
  }

  public boolean hasBase(String id) {
    return jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_relearn_plans WHERE session_id=?",
            Integer.class,
            id)
        == 1;
  }

  public ObjectNode program(String id) {
    return (ObjectNode)
        contracts.parse(
            jdbc.queryForObject(
                "SELECT prefix_program::text FROM"
                    + " studio_guided_relearn_plans WHERE session_id=?",
                String.class,
                id));
  }

  public ObjectNode baseArtifact(String id) {
    return (ObjectNode)
        contracts.parse(
            jdbc.queryForObject(
                "SELECT r.artifact::text FROM studio_guided_relearn_plans p J"
                    + "OIN ui_test_revisions"
                    + " r ON r.id=p.base_revision_id WHERE p.session_id=?",
                String.class,
                id));
  }

  public record PrefixInputs(ArrayNode references, java.util.Map<String, String> stableIds) {}

  public PrefixInputs prefixInputs(JsonNode session) {
    String id = session.path("sessionId").asText();
    JsonNode artifact = baseArtifact(id);
    var used = new java.util.HashSet<String>();
    for (JsonNode action : program(id).path("actions")) {
      JsonNode operation = action.path("operation");
      if (operation.has("destinationInputId")) {
        used.add(operation.path("destinationInputId").asText());
      }
      for (String slot : List.of("value", "expected")) {
        if (operation.path(slot).has("sourceInputId")) {
          used.add(operation.path(slot).path("sourceInputId").asText());
        }
      }
    }
    ArrayNode references = contracts.object().putArray("items");
    java.util.Map<String, String> stable = new java.util.HashMap<>();
    for (JsonNode recipe : artifact.path("inputRecipes")) {
      String inputId = recipe.path("inputId").asText();
      if (!used.remove(inputId)) {
        continue;
      }
      ObjectNode reference = contracts.object();
      for (String field : List.of("stepId", "kind", "intendedSlot")) {
        reference.set(field, recipe.path(field));
      }
      JsonNode provenance = recipe.path("provenance");
      if (provenance.path("kind").asText().equals("sourceSpan")) {
        reference
            .put("referenceKind", "sourceSpan")
            .put("sourceRevision", session.path("scope").path("sourceRevision").asText())
            .set("startUtf16", provenance.path("start"));
        reference.set("endUtf16", provenance.path("end"));
      } else {
        reference
            .put("referenceKind", "configuration")
            .put(
                "configurationRevision",
                session.path("scope").path("configurationRevision").asText());
        reference.set("referenceId", provenance.path("referenceId"));
        if (recipe.path("kind").asText().equals("secretRef")) {
          reference.set("referenceName", provenance.path("referenceName"));
        }
      }
      contracts.validate("v3/source-reference", reference);
      references.add(reference);
      require(
          stable.putIfAbsent(GuidedContracts.hash(reference), inputId) == null,
          "REFERENCE_MISMATCH",
          422);
    }
    require(used.isEmpty(), "MISSING_SOURCE", 409);
    return new PrefixInputs(references, java.util.Map.copyOf(stable));
  }

  /**
   * Import verified prefix meanings only; no obsolete suffix needs, consumers or execution proof.
   */
  public ObjectNode prefixPlan(JsonNode session) {
    String id = session.path("sessionId").asText();
    JsonNode old =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT t.plan::text FROM studio_guided_relearn_plans p JOIN "
                    + "ui_test_revisions r ON"
                    + " r.id=p.base_revision_id JOIN studio_guided_translation_state h ON"
                    + " h.session_id=r.guided_session_id JOIN studio_guided_translation_plans t ON"
                    + " t.session_id=h.session_id AND t.plan_revision=h.plan_revision WHERE"
                    + " p.session_id=?",
                String.class,
                id));
    PrefixInputs inputs = prefixInputs(session);
    ObjectNode result = contracts.object();
    result.set("sourceReferences", inputs.references());
    ArrayNode obligations = result.putArray("obligations");
    ArrayNode needs = result.putArray("needs");
    var needed = new java.util.HashSet<String>();
    var prefixSteps = new java.util.HashSet<String>();
    program(id).path("sourceStepIds").forEach(step -> prefixSteps.add(step.asText()));
    for (JsonNode action : program(id).path("actions")) {
      JsonNode matched = null;
      for (JsonNode candidate : old.path("obligations")) {
        if (candidate.path("stepId").equals(action.path("coordinate").path("stepId"))
            && candidate.path("occurrence").equals(action.path("coordinate").path("ordinal"))) {
          require(matched == null, "EVIDENCE_MISMATCH", 409);
          matched = candidate;
        }
      }
      require(
          matched != null
              && matched.path("operationKind").equals(action.path("operation").path("kind")),
          "OPERATION_MISMATCH",
          409);
      ObjectNode meaning = matched.deepCopy();
      if (!meaning.path("referenceIndex").isNull()) {
        JsonNode operation = action.path("operation");
        String inputId = operation.path("destinationInputId").asText();
        if (inputId.isEmpty()) {
          inputId =
              operation
                  .path(operation.path("kind").asText().equals("assert") ? "expected" : "value")
                  .path("sourceInputId")
                  .asText();
        }
        int index = -1;
        for (int at = 0; at < inputs.references().size(); at++) {
          if (inputId.equals(
              inputs.stableIds().get(GuidedContracts.hash(inputs.references().get(at))))) {
            index = at;
          }
        }
        require(index >= 0, "MISSING_SOURCE", 409);
        meaning.put("referenceIndex", index);
      }
      if (!meaning.path("needId").isNull()) {
        needed.add(meaning.path("needId").asText());
      }
      obligations.add(meaning);
    }
    for (JsonNode oldNeed : old.path("needs")) {
      if (prefixSteps.contains(oldNeed.path("producerStepId").asText())
          && needed.contains(oldNeed.path("needId").asText())) {
        ObjectNode need = oldNeed.deepCopy();
        var consumers = need.putArray("consumers");
        for (JsonNode consumer : oldNeed.path("consumers")) {
          if (prefixSteps.contains(consumer.path("stepId").asText())) {
            consumers.add(consumer);
          }
        }
        needs.add(need);
      }
    }
    com.citi.put.checks.studio.guided.translation.GuidedAcceptedPlan.validate(contracts, result);
    return result;
  }

  public ObjectNode relearnedFrom(String id) {
    String stored =
        jdbc.queryForObject("SELECT studio_015_relearned_from(?)::text", String.class, id);
    JsonNode value = stored == null ? contracts.object().nullNode() : contracts.parse(stored);
    return value.isNull() ? null : (ObjectNode) value;
  }

  public JsonNode nextAction(String id) {
    for (JsonNode action : program(id).path("actions")) {
      String step = action.path("coordinate").path("stepId").asText();
      int ordinal = action.path("coordinate").path("ordinal").asInt();
      var rows =
          jdbc.queryForList(
              "SELECT document::text FROM studio_guided_actions WHERE"
                  + " session_id=? AND step_id=? AND ordinal=? ORDER BY attempt_ordinal DESC",
              String.class,
              id,
              step,
              ordinal);
      if (rows.isEmpty()
          || !contracts.parse(rows.getFirst()).path("state").asText().equals("SUCCEEDED")) {
        return action.deepCopy();
      }
    }
    return null;
  }

  public ObjectNode issue(
      JsonNode session,
      JsonNode context,
      JsonNode coordinate,
      JsonNode evidenceHash,
      JsonNode pressInheritance) {
    return issue(session, context, coordinate, evidenceHash, pressInheritance, null);
  }

  public ObjectNode issue(
      JsonNode session,
      JsonNode context,
      JsonNode coordinate,
      JsonNode evidenceHash,
      JsonNode pressInheritance,
      JsonNode assertSourceBinding) {
    String id = session.path("sessionId").asText();
    require(pending(id), "REVISION_CONFLICT", 409);
    ObjectNode request = contracts.object();
    for (String field :
        List.of(
            "schemaVersion",
            "sessionId",
            "workerId",
            "ownerFence",
            "scopeHash",
            "contextId",
            "contextRevision",
            "authoredInputsHash",
            "sourceRevision",
            "configurationRevision")) {
      request.set(field, context.path(field));
    }
    request.put("prefixProgramHash", GuidedContracts.hash(program(id)));
    request.set("coordinate", coordinate);
    request.set("evidenceHash", evidenceHash);
    request.set("pressInheritance", pressInheritance);
    if (assertSourceBinding != null && !assertSourceBinding.isNull()) {
      request.set("assertSourceBinding", assertSourceBinding);
    }
    contracts.validate("v3/bridge#/definitions/PrefixRequestIdentity", request);
    String digest = GuidedContracts.hash(request);
    var old =
        jdbc.queryForList(
            "SELECT document::text FROM studio_guided_prefix_requests"
                + " WHERE session_id=? AND request_digest=?",
            String.class,
            id,
            digest);
    if (old.isEmpty()) {
      jdbc.update(
          "INSERT INTO"
              + " studio_guided_prefix_requests(session_id,request_digest,ste"
              + "p_id,ordinal,evidence_hash,document)"
              + " VALUES (?,?,?,?,?,?::jsonb)",
          id,
          digest,
          coordinate.path("stepId").asText(),
          coordinate.path("ordinal").asInt(),
          evidenceHash.asText(),
          request.toString());
    } else {
      require(contracts.parse(old.getFirst()).equals(request), "IDEMPOTENCY_CONFLICT", 409);
    }
    ObjectNode envelope = contracts.object().put("kind", "prefix").put("requestDigest", digest);
    envelope.set("request", request);
    return envelope;
  }

  public void settle(String id, String digest, String status) {
    var rows =
        jdbc.queryForList(
            "SELECT status FROM studio_guided_prefix_requests WHERE session_id=? AND"
                + " request_digest=?",
            String.class,
            id,
            digest);
    require(rows.size() == 1, "EVIDENCE_MISMATCH", 409);
    if (!rows.getFirst().equals(status)) {
      require(rows.getFirst().equals("ISSUED"), "IDEMPOTENCY_CONFLICT", 409);
      jdbc.update(
          "UPDATE studio_guided_prefix_requests SET status=? WHERE session_id=? AND"
              + " request_digest=?",
          status,
          id,
          digest);
    }
  }

  public void verifyPrepared(String id, JsonNode request, JsonNode response) {
    contracts.validate("v3/bridge#/definitions/PrefixPrepareResult", response);
    verifyPrepared(program(id), request, response);
  }

  /**
   * The pure check of a prefix preparation against the verified learned program. The identity is
   * the single operation identity: coordinate, origin, the target the runner reported for this
   * preparation, and the operation. The proposal's ref, document and generation are not hashed, so
   * a replay on a later generation resolves a fresh ref to the same learned operation.
   */
  public static void verifyPrepared(JsonNode program, JsonNode request, JsonNode response) {
    require(
        response.path("requestDigest").equals(request.path("requestDigest")),
        "EVIDENCE_MISMATCH",
        409);
    if (!response.path("kind").asText().equals("PREPARED")) {
      return;
    }
    require(
        GuidedContracts.same(
            response.path("preparation").path("pressInheritance"),
            request.path("request").path("pressInheritance")),
        "EVIDENCE_MISMATCH",
        409);
    JsonNode issued = request.path("request"), prepared = response.path("preparation");
    boolean sourceBinding = issued.has("assertSourceBinding");
    require(
        sourceBinding == prepared.has("assertSourceBinding")
            && (!sourceBinding
                || issued.path("assertSourceBinding").isObject()
                    && prepared.path("assertSourceBinding").isObject()
                    && GuidedContracts.same(
                        prepared.path("assertSourceBinding"), issued.path("assertSourceBinding"))),
        "EVIDENCE_MISMATCH",
        409);
    JsonNode proposal = response.path("proposal");
    JsonNode expected = null;
    for (JsonNode action : program.path("actions")) {
      if (action.path("coordinate").equals(proposal.path("coordinate"))) {
        require(expected == null, "OPERATION_MISMATCH", 409);
        expected = action;
      }
    }
    require(
        expected != null
            && proposal.path("coordinate").equals(request.path("request").path("coordinate"))
            && proposal.path("operation").equals(expected.path("operation")),
        "OPERATION_MISMATCH",
        409);
    require(
        GuidedOperationIdentity.of(proposal, response.path("preparation").path("target"))
            .equals(expected.path("operationHash").asText()),
        "OPERATION_MISMATCH",
        409);
    require(
        response
            .path("preparation")
            .path("evidenceHash")
            .equals(request.path("request").path("evidenceHash")),
        "EVIDENCE_MISMATCH",
        409);
  }

  public boolean duplicateReceipt(String id, JsonNode receipt) {
    var old =
        jdbc.queryForList(
            "SELECT document::text FROM studio_guided_no_invocation_recei"
                + "pts WHERE session_id=?",
            String.class,
            id);
    if (old.isEmpty()) {
      return false;
    }
    require(contracts.parse(old.getFirst()).equals(receipt), "IDEMPOTENCY_CONFLICT", 409);
    return true;
  }

  public void receipt(JsonNode session, JsonNode receipt) {
    contracts.validate("v3/bridge#/definitions/DriftReceipt", receipt);
    ObjectNode preimage = receipt.deepCopy();
    preimage.remove("receiptHash");
    require(
        GuidedContracts.hash(preimage).equals(receipt.path("receiptHash").asText()),
        "EVIDENCE_MISMATCH",
        409);
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_no_invocation_receipts(session_id,request_dig"
            + "est,admission_id,preparation_id,receipt_hash,document)"
            + " VALUES (?,?,?,?,?,?::jsonb)",
        session.path("sessionId").asText(),
        receipt.path("requestDigest").asText(),
        receipt.path("admissionId").isNull() ? null : receipt.path("admissionId").asText(),
        receipt.path("preparationId").isNull() ? null : receipt.path("preparationId").asText(),
        receipt.path("receiptHash").asText(),
        receipt.toString());
  }

  public void switchToLearning(
      JsonNode session, String reason, int index, int ordinal, String receiptHash) {
    String id = session.path("sessionId").asText();
    ArrayNode admissions = contracts.object().putArray("items");
    if (!reason.equals("EMPTY_PREFIX")) {
      for (JsonNode action : program(id).path("actions")) {
        String step = action.path("coordinate").path("stepId").asText();
        int actionIndex = stepIndex(session, step);
        if (actionIndex < index
            || actionIndex == index
                && action.path("coordinate").path("ordinal").asInt() < ordinal) {
          String admission =
              jdbc.queryForObject(
                  "SELECT admission_id FROM studio_guided_actions WHERE session_id=? AND step_id=?"
                      + " AND ordinal=? AND attempt_ordinal=0 AND document->>'state'='SUCCEEDED'",
                  String.class,
                  id,
                  step,
                  action.path("coordinate").path("ordinal").asInt());
          admissions.add(admission);
        }
      }
    }
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_relearn_switches(session_id,reason,effective_"
            + "step_id,effective_step_index,next_ordinal,completed_prefix_c"
            + "ount,drift_receipt_hash,completed_admissions)"
            + " VALUES (?,?,?,?,?,?,?,?::jsonb)",
        id,
        reason,
        session.path("sourceSteps").get(index).path("stepId").asText(),
        index,
        ordinal,
        index,
        receiptHash,
        admissions.toString());
    jdbc.update(
        "UPDATE studio_guided_translation_state SET continuation='SOU"
            + "RCE_PLAN' WHERE session_id=?",
        id);
  }

  public ObjectNode evidence(JsonNode session) {
    String id = session.path("sessionId").asText();
    if (!hasBase(id)) {
      return null;
    }
    var pinned =
        jdbc.queryForMap("SELECT * FROM studio_guided_relearn_plans WHERE session_id=?", id);
    var switched =
        jdbc.queryForMap("SELECT * FROM studio_guided_relearn_switches WHERE session_id=?", id);
    var accepted =
        jdbc.queryForMap("SELECT * FROM studio_guided_suffix_acceptances WHERE session_id=?", id);
    ObjectNode evidence = contracts.object();
    ObjectNode plan =
        evidence
            .putObject("plan")
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("testId", session.path("testId").asText())
            .put("csiId", session.path("scope").path("csiId").asText())
            .put("baseRevisionId", pinned.get("base_revision_id").toString())
            .put("initialFirstLearnStepId", (String) pinned.get("initial_step_id"))
            .put("initialFirstLearnIndex", ((Number) pinned.get("initial_step_index")).intValue())
            .put("prefixProgramHash", (String) pinned.get("prefix_program_hash"));
    evidence.set("program", contracts.parse(String.valueOf(pinned.get("prefix_program"))));
    ObjectNode transition =
        evidence
            .putObject("switch")
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("baseRevisionId", pinned.get("base_revision_id").toString())
            .put("initialFirstLearnStepId", (String) pinned.get("initial_step_id"))
            .put("effectiveFirstLearnStepId", (String) switched.get("effective_step_id"))
            .put(
                "effectiveFirstLearnIndex",
                ((Number) switched.get("effective_step_index")).intValue())
            .put("nextSemanticOrdinal", ((Number) switched.get("next_ordinal")).intValue())
            .put(
                "completedPrefixCount",
                ((Number) switched.get("completed_prefix_count")).intValue())
            .put("reason", (String) switched.get("reason"))
            .put("driftReceiptHash", (String) switched.get("drift_receipt_hash"))
            .put(
                "retainedPrefixAdmissionsHash", (String) switched.get("completed_admissions_hash"));
    transition.set(
        "retainedPrefixAdmissionIds",
        contracts.parse(String.valueOf(switched.get("completed_admissions"))));
    ArrayNode requests = evidence.putArray("prefixRequests");
    var ordered = new java.util.ArrayList<JsonNode>();
    jdbc.queryForList(
            "SELECT document::text FROM studio_guided_prefix_requests WHE"
                + "RE session_id=? ORDER BY"
                + " created_at,request_digest",
            String.class,
            id)
        .forEach(value -> ordered.add(contracts.parse(value)));
    var generations = new java.util.HashMap<String, Integer>();
    for (var observed :
        jdbc.queryForList(
            "SELECT observation_hash,observation::text FROM studio_guided"
                + "_publication_observations"
                + " WHERE session_id=?",
            id)) {
      JsonNode snapshot = contracts.parse((String) observed.get("observation"));
      for (JsonNode request : ordered) {
        ObjectNode execution =
            contracts
                .object()
                .put("kind", "observedDocument")
                .put("sessionId", id)
                .put("contextId", request.path("contextId").asText());
        for (String field : java.util.List.of("documentId", "generation", "origin")) {
          execution.set(field, snapshot.path(field));
        }
        execution.put("observationHash", (String) observed.get("observation_hash"));
        if (GuidedContracts.hash(execution).equals(request.path("evidenceHash").asText())) {
          generations.put(
              request.path("evidenceHash").asText(), snapshot.path("generation").asInt());
        }
      }
    }
    for (JsonNode request : ordered) {
      if (!generations.containsKey(request.path("evidenceHash").asText())) {
        JsonNode initial =
            contracts.parse(
                jdbc.queryForObject(
                    "SELECT execution_evidence::text FROM studio_guided_publication_preparations"
                        + " WHERE session_id=? AND execution_evidence->>'kind'='initialBlank' ORDER"
                        + " BY preparation_id LIMIT 1",
                    String.class,
                    id));
        require(
            initial.path("kind").asText().equals("initialBlank")
                && GuidedContracts.hash(initial).equals(request.path("evidenceHash").asText()),
            "EVIDENCE_MISMATCH",
            422);
        generations.put(request.path("evidenceHash").asText(), 0);
      }
    }
    ordered.sort(
        java.util.Comparator.comparingInt(
                (JsonNode request) ->
                    stepIndex(session, request.path("coordinate").path("stepId").asText()))
            .thenComparingInt(request -> request.path("coordinate").path("ordinal").asInt())
            .thenComparingInt(request -> generations.get(request.path("evidenceHash").asText()))
            .thenComparing(GuidedContracts::hash));
    ordered.forEach(requests::add);
    var receipts =
        jdbc.queryForList(
            "SELECT document::text FROM studio_guided_no_invocation_recei"
                + "pts WHERE session_id=?",
            String.class,
            id);
    if (receipts.isEmpty()) {
      evidence.putNull("driftReceipt");
    } else {
      evidence.set("driftReceipt", contracts.parse(receipts.getFirst()));
    }
    ObjectNode first =
        evidence
            .putObject("firstSuffixAcceptance")
            .put("sessionId", id)
            .put(
                "previousPlanRevision",
                ((Number) accepted.get("previous_plan_revision")).longValue())
            .put("planRevision", ((Number) accepted.get("plan_revision")).longValue());
    first.set(
        "retainedPrefixAdmissionIds",
        contracts.parse(String.valueOf(accepted.get("retained_admissions"))));
    evidence.putArray("excludedAttempts");
    require(
        first
                .path("retainedPrefixAdmissionIds")
                .equals(transition.path("retainedPrefixAdmissionIds"))
            && GuidedContracts.hash(transition.path("retainedPrefixAdmissionIds"))
                .equals(transition.path("retainedPrefixAdmissionsHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    return evidence;
  }

  public boolean firstSuffixPending(String id) {
    return hasBase(id)
        && !pending(id)
        && jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_suffix_acceptances WHERE session_id=?",
                Integer.class,
                id)
            == 0;
  }

  public ArrayNode retainedAdmissions(String id) {
    return (ArrayNode)
        contracts.parse(
            jdbc.queryForObject(
                "SELECT completed_admissions::text FROM"
                    + " studio_guided_relearn_switches WHERE session_id=?",
                String.class,
                id));
  }

  public ObjectNode learningWindow(JsonNode session) {
    String id = session.path("sessionId").asText();
    require(hasBase(id) && !pending(id), "REVISION_CONFLICT", 409);
    var row =
        jdbc.queryForMap(
            "SELECT effective_step_id,effective_step_index,next_ordinal FROM"
                + " studio_guided_relearn_switches WHERE session_id=?",
            id);
    ObjectNode window =
        contracts
            .object()
            .put("firstLearnStepId", (String) row.get("effective_step_id"))
            .put("nextSemanticOrdinal", ((Number) row.get("next_ordinal")).intValue());
    var learnable = window.putArray("learnableStepIds");
    for (int at = ((Number) row.get("effective_step_index")).intValue();
        at < session.path("sourceSteps").size();
        at++) {
      learnable.add(session.path("sourceSteps").get(at).path("stepId"));
    }
    var completed = window.putArray("completedCoordinates");
    var available = window.putArray("availableBindingIds");
    for (JsonNode step : session.path("sourceSteps")) {
      jdbc.queryForList(
              "SELECT document::text FROM studio_guided_actions WHERE sessi"
                  + "on_id=? AND step_id=?"
                  + " AND document->>'state'='SUCCEEDED' ORDER BY ordinal",
              String.class,
              id,
              step.path("stepId").asText())
          .forEach(value -> completed.add(contracts.parse(value).path("coordinate")));
    }
    jdbc.queryForList(
            "SELECT binding_id FROM studio_guided_producers WHERE session_id=? ORDER BY"
                + " convert_to(binding_id,'UTF8')",
            String.class,
            id)
        .forEach(available::add);
    return window;
  }

  public int initialIndex(String id) {
    return jdbc.queryForObject(
        "SELECT initial_step_index FROM studio_guided_relearn_plans WHERE session_id=?",
        Integer.class,
        id);
  }

  public boolean excluded(String id, JsonNode action) {
    if (!action.path("state").asText().equals("FAILED")
        || !action.path("outcomeCode").asText().equals("TARGET_CHANGED")
        || action.path("dispatchCount").asInt() != 1
        || action.path("attemptOrdinal").asInt() != 0) {
      return false;
    }
    return jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_no_invocation_receipts r JOIN"
                + " studio_guided_relearn_switches s ON s.session_id=r.session_id AND"
                + " s.drift_receipt_hash=r.receipt_hash WHERE r.session_id=? AND r.admission_id=?"
                + " AND r.document->>'phase'='ADMITTED_PRE_INVOCATION'",
            Integer.class,
            id,
            action.path("admission").path("admissionId").asText())
        == 1;
  }

  public int attemptOrdinal(String id, JsonNode coordinate) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=?"
            + " AND admission_id IS NOT NULL AND document->'coordinate'=?::jsonb",
        Integer.class,
        id,
        coordinate.toString());
  }

  public static int stepIndex(JsonNode session, String stepId) {
    int at = 0;
    for (JsonNode step : session.path("sourceSteps")) {
      if (step.path("stepId").asText().equals(stepId)) {
        return at;
      }
      at++;
    }
    throw new GuidedSessionException("BINDING_ORDER", 422);
  }

  private static void requireAllowed(String url, AllowedDomains domains) {
    if (!domains.allows(url)) {
      throw new GuidedSessionException(
          "ORIGIN_NOT_ALLOWED", 403, "PREFIX_ORIGIN_NOT_ALLOWED", false, null);
    }
  }

  private static GuidedSessionException conflict(String reason) {
    return new GuidedSessionException("REVISION_CONFLICT", 409, reason, false, null);
  }
}
