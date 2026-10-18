package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/** Captures original pre-effect facts, never facts supplied by the replay lowerer. */
public final class GuidedPublicationEvidenceRepository {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private java.util.function.Function<java.util.UUID, ObjectNode> revisionVerifier;

  public void installRevisionVerifier(
      java.util.function.Function<java.util.UUID, ObjectNode> verifier) {
    this.revisionVerifier = java.util.Objects.requireNonNull(verifier);
  }

  public GuidedPublicationEvidenceRepository(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  public void captureQuestion(
      GuidedSessionRepository.Session current, JsonNode capture, Instant now) {
    GuidedPublicationBaseRepository.transaction();
    if (new GuidedPublicationBaseRepository(jdbc, contracts)
        .find(current.document().path("sessionId").asText())
        .isEmpty()) {
      return;
    }
    contracts.validate("v3/replay-validation#/definitions/QuestionCapture1", capture);
    JsonNode material = materializationIdentity(current.document().path("sessionId").asText());
    for (String key :
        List.of("contextId", "contextRevision", "workerId", "ownerFence", "authoredInputsHash")) {
      require(capture.path(key).equals(material.path(key)), "EVIDENCE_MISMATCH", 422);
    }
    require(
        capture.path("executionEvidence").path("kind").asText().equals("observedDocument"),
        "EVIDENCE_MISMATCH",
        422);
    String hash =
        captureObservation(
            current,
            capture.path("contextId").asText(),
            capture.path("ownerFence").asInt(),
            capture.path("executionEvidence"),
            now);
    require(hash.equals(capture.path("observationHash").asText()), "EVIDENCE_MISMATCH", 422);
  }

  private String captureObservation(
      GuidedSessionRepository.Session current,
      String contextId,
      int ownerFence,
      JsonNode evidence,
      Instant now) {
    String id = current.document().path("sessionId").asText();
    JsonNode observation = current.progress().path("observation");
    contracts.validate("v3/observation", observation);
    String hash = GuidedContracts.hash(observation);
    require(
        evidence.equals(current.progress().path("executionEvidence"))
            && hash.equals(current.progress().path("observationHash").asText())
            && hash.equals(evidence.path("observationHash").asText())
            && observation.path("documentId").equals(evidence.path("documentId"))
            && observation.path("generation").equals(evidence.path("generation"))
            && observation.path("sessionId").equals(current.document().path("sessionId"))
            && observation.path("scopeHash").equals(current.document().path("scopeHash"))
            && observation.path("origin").equals(evidence.path("origin"))
            && contextId.equals(evidence.path("contextId").asText())
            && ownerFence == current.document().path("owner").path("fence").asInt(),
        "EVIDENCE_MISMATCH",
        422);
    var old =
        jdbc.queryForList(
            "SELECT observation::text FROM studio_guided_publication_observations"
                + " WHERE session_id=? AND observation_hash=?",
            String.class,
            id,
            hash);
    if (old.isEmpty()) {
      jdbc.update(
          "INSERT INTO"
              + " studio_guided_publication_observations(session_id,observation_hash,context_id,"
              + "owner_fence,document_id,generation,observation,captured_at)"
              + " VALUES (?,?,?,?,?,?,?::jsonb,?)",
          id,
          hash,
          contextId,
          ownerFence,
          evidence.path("documentId").asText(),
          evidence.path("generation").asInt(),
          observation.toString(),
          Timestamp.from(PublicationContracts.millisecond(now)));
    } else {
      require(contracts.parse(old.getFirst()).equals(observation), "IDEMPOTENCY_CONFLICT", 409);
    }
    return hash;
  }

  private ObjectNode materializationIdentity(String id) {
    return jdbc.queryForObject(
        "SELECT context_id,context_revision,worker_id,owner_fence,authored_inputs_hash"
            + " FROM studio_guided_materializations WHERE session_id=?",
        (rs, n) ->
            contracts
                .object()
                .put("contextId", rs.getString(1))
                .put("contextRevision", rs.getInt(2))
                .put("workerId", rs.getString(3))
                .put("ownerFence", rs.getInt(4))
                .put("authoredInputsHash", rs.getString(5)),
        id);
  }

  private List<ObjectNode> observedChoices(String id) {
    return new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
            jdbc, contracts)
        .acceptedObserved(id);
  }

  private JsonNode selectedMeaning(JsonNode row) {
    JsonNode selected = null;
    for (JsonNode mapping : row.path("meanings")) {
      if (mapping.path("choiceId").equals(row.path("acceptedChoiceId"))) {
        require(selected == null, "EVIDENCE_MISMATCH", 422);
        selected = mapping.path("meaning");
      }
    }
    require(selected != null, "EVIDENCE_MISMATCH", 422);
    return selected;
  }

  private JsonNode preparationChoice(
      GuidedSessionRepository.Session current, JsonNode proposal, JsonNode proof) {
    String id = current.document().path("sessionId").asText();
    List<ObjectNode> decisions = observedChoices(id);
    if (decisions.isEmpty()) {
      return null;
    }
    JsonNode plan =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT p.plan::text FROM studio_guided_translation_state s JOIN"
                    + " studio_guided_translation_plans p USING(session_id,plan_revision) WHERE"
                    + " s.session_id=?",
                String.class,
                id));
    JsonNode obligation = null;
    for (JsonNode item : plan.path("obligations")) {
      if (item.path("stepId").equals(proposal.path("coordinate").path("stepId"))
          && item.path("occurrence").equals(proposal.path("coordinate").path("ordinal"))) {
        require(obligation == null, "EVIDENCE_MISMATCH", 422);
        obligation = item;
      }
    }
    require(obligation != null, "EVIDENCE_MISMATCH", 422);
    JsonNode decision = null;
    for (JsonNode row : decisions) {
      if (selectedMeaning(row).path("obligationId").equals(obligation.path("obligationId"))) {
        require(decision == null, "EVIDENCE_MISMATCH", 422);
        decision = row;
      }
    }
    if (decision == null) {
      return null;
    }
    JsonNode identity = decision.path("context"), capture = identity.path("questionCapture");
    String questionId = identity.path("clarificationId").asText();
    ObjectNode receipt =
        contracts
            .object()
            .put("version", 1)
            .put("sessionId", id)
            .put("preparationId", proof.path("preparationId").asText())
            .put("clarificationId", questionId)
            .put("obligationId", obligation.path("obligationId").asText())
            .put("contextIdentityHash", GuidedContracts.hash(identity))
            .put("meaningsHash", GuidedContracts.hash(decision.path("meanings")))
            .put("questionCaptureHash", GuidedContracts.hash(capture))
            .put("acceptedChoiceId", decision.path("acceptedChoiceId").asText());
    receipt.set("answer", current.progress().path("resolvedClarifications").path(questionId));
    contracts.validate("v3/replay-validation#/definitions/ObservedChoiceReceipt1", receipt);
    PublicationContracts.bounded(receipt, 16384);
    ObjectNode prepared =
        contracts.object().put("preparationId", proof.path("preparationId").asText());
    prepared.set("proposal", proposal);
    prepared.set("proof", proof);
    prepared.set("executionEvidence", proposal.path("executionEvidence"));
    prepared.set("observationHash", proposal.path("executionEvidence").path("observationHash"));
    prepared.set("observedChoice", choiceWitness(id, receipt));
    var observations = new java.util.HashMap<String, JsonNode>();
    for (JsonNode row : observationRows(id)) {
      observations.put(row.path("observationHash").asText(), row);
    }
    new GuidedPlanBuilder(contracts)
        .effectiveObservedObligation(
            current.document(),
            plan,
            materializationIdentity(id),
            prepared,
            observations,
            obligation);
    return receipt;
  }

  private ObjectNode choiceWitness(String id, JsonNode receipt) {
    contracts.validate("v3/replay-validation#/definitions/ObservedChoiceReceipt1", receipt);
    var decisions =
        observedChoices(id).stream()
            .filter(
                row ->
                    row.path("context")
                        .path("clarificationId")
                        .equals(receipt.path("clarificationId")))
            .toList();
    require(decisions.size() == 1, "EVIDENCE_MISMATCH", 422);
    JsonNode decision = decisions.getFirst(),
        capture = decision.path("context").path("questionCapture");
    contracts.validate("v3/replay-validation#/definitions/QuestionCapture1", capture);
    var attempts =
        jdbc.query(
            "SELECT identity::text,status,safe_result::text FROM studio_guided_model_attempts"
                + " WHERE session_id=? AND attempt_id=?",
            (rs, n) -> {
              JsonNode identity = contracts.parse(rs.getString(1));
              require(
                  rs.getString(2).equals("APPLIED") && rs.getString(3) != null,
                  "EVIDENCE_MISMATCH",
                  422);
              JsonNode result = contracts.parse(rs.getString(3));
              ObjectNode attempt = contracts.object().put("status", rs.getString(2));
              for (String key :
                  List.of(
                      "attemptId",
                      "requestId",
                      "attempt",
                      "kind",
                      "projectionHash",
                      "scopeHash",
                      "scope",
                      "owner",
                      "documentId",
                      "generation",
                      "executionEvidence")) {
                attempt.set(key, identity.path(key));
              }
              attempt.put("planRevision", identity.path("planRevision").asText());
              attempt.set("responseSchemaVersion", result.path("schemaVersion"));
              attempt.set("responseRequestId", result.path("requestId"));
              attempt.set("responseKind", result.path("kind"));
              attempt.set("responseStatus", result.path("status"));
              attempt.set("modelQuestion", result.path("question"));
              return attempt;
            },
            id,
            capture.path("attemptId").asText());
    require(attempts.size() == 1, "EVIDENCE_MISMATCH", 422);
    var plans =
        jdbc.query(
            "SELECT plan_revision,plan_hash,plan::text FROM studio_guided_translation_plans"
                + " WHERE session_id=? AND plan_revision=?",
            (rs, n) -> {
              ObjectNode plan =
                  contracts
                      .object()
                      .put("revision", Long.toString(rs.getLong(1)))
                      .put("planHash", rs.getString(2));
              plan.set("plan", contracts.parse(rs.getString(3)));
              return plan;
            },
            id,
            Long.parseLong(capture.path("planRevision").asText()));
    require(plans.size() == 1, "EVIDENCE_MISMATCH", 422);
    ObjectNode witness = contracts.object().put("version", 1);
    witness.set("receipt", receipt);
    witness.set("context", decision.path("context"));
    witness.set("meanings", decision.path("meanings"));
    witness.set("acceptedChoiceId", decision.path("acceptedChoiceId"));
    witness.set("attempt", attempts.getFirst());
    witness.set("questionPlan", plans.getFirst());
    contracts.validate("v3/replay-validation#/definitions/ObservedChoiceWitness1", witness);
    return PublicationContracts.bounded(witness, 262144);
  }

  private List<ObjectNode> observationRows(String id) {
    return jdbc.query(
        "SELECT observation_hash,observation::text FROM studio_guided_publication_observations"
            + " WHERE session_id=? ORDER BY generation,observation_hash",
        (rs, n) -> {
          ObjectNode row = contracts.object().put("observationHash", rs.getString(1));
          row.set("observation", contracts.parse(rs.getString(2)));
          return row;
        },
        id);
  }

  public void capturePrefixObservation(GuidedSessionRepository.Session current, JsonNode context) {
    JsonNode execution = current.progress().path("executionEvidence");
    if (execution.path("kind").asText().equals("observedDocument")) {
      captureObservation(
          current,
          context.path("contextId").asText(),
          context.path("ownerFence").asInt(),
          execution,
          Instant.now());
    }
  }

  public void capturePreparation(
      GuidedSessionRepository.Session current, JsonNode proposal, JsonNode proof, Instant now) {
    GuidedPublicationBaseRepository.transaction();
    String id = current.document().path("sessionId").asText();
    var base = new GuidedPublicationBaseRepository(jdbc, contracts).find(id);
    if (base.isEmpty()) {
      return;
    }
    contracts.validate("v3/action", proposal);
    contracts.validate("v3/bridge#/definitions/preparation", proof);
    JsonNode evidence = proposal.path("executionEvidence");
    require(
        evidence.equals(current.progress().path("executionEvidence"))
            && GuidedContracts.hash(evidence).equals(proposal.path("evidenceHash").asText())
            && GuidedContracts.hash(proposal).equals(proof.path("requestDigest").asText()),
        "EVIDENCE_MISMATCH",
        422);
    String observationHash = null;
    if (evidence.path("kind").asText().equals("observedDocument")) {
      observationHash =
          captureObservation(
              current,
              proof.path("contextId").asText(),
              proof.path("ownerFence").asInt(),
              evidence,
              now);
    } else {
      require(
          evidence.path("kind").asText().equals("initialBlank")
              && proposal.path("target").path("kind").asText().equals("page")
              && proposal.path("target").path("documentId").equals(evidence.path("documentId"))
              && proposal.path("target").path("generation").asInt(-1) == 0
              && proposal.path("operation").path("kind").asText().equals("navigate")
              && proposal.path("coordinate").path("ordinal").asInt(-1) == 0
              && current
                  .document()
                  .path("sourceSteps")
                  .get(0)
                  .path("stepId")
                  .equals(proposal.path("coordinate").path("stepId"))
              && jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_actions WHERE session_id=?",
                      Integer.class,
                      id)
                  == 0,
          "EVIDENCE_MISMATCH",
          422);
    }
    JsonNode choiceReceipt = preparationChoice(current, proposal, proof);
    if (choiceReceipt != null) {
      require(
          !Instant.parse(choiceReceipt.path("answer").path("resolvedAt").asText()).isAfter(now),
          "EVIDENCE_MISMATCH",
          422);
    }
    var old =
        jdbc.query(
            "SELECT proposal::text,proof::text,observed_choice_receipt::text FROM"
                + " studio_guided_publication_preparations WHERE session_id=? AND preparation_id=?",
            (rs, n) ->
                contracts.parse(rs.getString(1)).equals(proposal)
                    && contracts.parse(rs.getString(2)).equals(proof)
                    && (rs.getString(3) == null
                        ? choiceReceipt == null
                        : contracts.parse(rs.getString(3)).equals(choiceReceipt)),
            id,
            proof.path("preparationId").asText());
    if (!old.isEmpty()) {
      require(old.getFirst(), "IDEMPOTENCY_CONFLICT", 409);
      return;
    }
    Integer revision =
        jdbc.queryForObject(
            "SELECT materialization_revision FROM studio_guided_materializations WHERE"
                + " session_id=?",
            Integer.class,
            id);
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_publication_preparations(session_id,preparation_id"
            + ",context_id,owner_fence,request_digest,evidence_hash,inputs_hash,"
            + "materialization_revision,source_manifest_hash,observation_hash,ex"
            + "ecution_evidence,proposal,proof,captured_at,observed_choice_receipt)"
            + " VALUES (?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?::jsonb)",
        id,
        proof.path("preparationId").asText(),
        proof.path("contextId").asText(),
        proof.path("ownerFence").asInt(),
        GuidedContracts.hash(proposal),
        GuidedContracts.hash(evidence),
        proof.path("authoredInputsHash").asText(),
        revision,
        base.get().document().path("sourceManifestHash").asText(),
        observationHash,
        evidence.toString(),
        proposal.toString(),
        proof.toString(),
        Timestamp.from(PublicationContracts.millisecond(now)),
        choiceReceipt == null ? null : choiceReceipt.toString());
  }

  public void attachAdmission(JsonNode session, JsonNode ledger, JsonNode proposal, Instant now) {
    GuidedPublicationBaseRepository.transaction();
    String id = session.path("sessionId").asText();
    if (new GuidedPublicationBaseRepository(jdbc, contracts).find(id).isEmpty()) {
      return;
    }
    String admission = ledger.path("admission").path("admissionId").asText();
    String obligation =
        jdbc.queryForObject(
            "SELECT obligation_id FROM studio_guided_obligation_admissions WHERE session_id=? AND"
                + " admission_id=? AND proposal_digest=?",
            String.class,
            id,
            admission,
            GuidedContracts.hash(proposal));
    ObjectNode op = contracts.object();
    op.set("coordinate", proposal.path("coordinate"));
    op.set("origin", proposal.path("executionEvidence").path("origin"));
    op.set(
        "locator",
        proposal.path("target").has("locator")
            ? proposal.path("target").path("locator")
            : com.fasterxml.jackson.databind.node.NullNode.instance);
    op.set("operation", proposal.path("operation"));
    require(
        GuidedContracts.hash(op).equals(ledger.path("operationHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    var prior =
        jdbc.queryForList(
            "SELECT proposal_hash FROM studio_guided_publication_admissions WHERE session_id=? AND"
                + " admission_id=?",
            String.class,
            id,
            admission);
    if (!prior.isEmpty()) {
      require(prior.getFirst().equals(GuidedContracts.hash(proposal)), "IDEMPOTENCY_CONFLICT", 409);
      return;
    }
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_publication_admissions(session_id,admission_id,pre"
            + "paration_id,obligation_id,proposal_hash,captured_at)"
            + " VALUES (?,?,?,?,?,?)",
        id,
        admission,
        ledger.path("preparationId").asText(),
        obligation,
        GuidedContracts.hash(proposal),
        Timestamp.from(PublicationContracts.millisecond(now)));
  }

  /**
   * The observation hashes that this session's own prefix requests committed to. An observation row
   * is bound only when the observedDocument execution evidence over this session id, the request's
   * contextId, the row's documentId/generation/origin and its observationHash hashes to the
   * request's evidenceHash. Nothing is admitted on a partial match.
   */
  static java.util.Set<String> prefixRequestObservations(
      GuidedContracts contracts, String id, JsonNode incremental, JsonNode observations) {
    var bound = new java.util.HashSet<String>();
    if (incremental == null) {
      return bound;
    }
    for (JsonNode request : incremental.path("prefixRequests")) {
      for (JsonNode observation : observations) {
        JsonNode snapshot = observation.path("observation");
        ObjectNode execution =
            contracts
                .object()
                .put("kind", "observedDocument")
                .put("sessionId", id)
                .put("contextId", request.path("contextId").asText());
        for (String field : List.of("documentId", "generation", "origin")) {
          execution.set(field, snapshot.path(field));
        }
        execution.put("observationHash", observation.path("observationHash").asText());
        if (GuidedContracts.hash(execution).equals(request.path("evidenceHash").asText())) {
          bound.add(observation.path("observationHash").asText());
        }
      }
    }
    return bound;
  }

  public PublicationContracts.Evidence read(String id) {
    GuidedPublicationBaseRepository.transaction();
    new com.citi.put.checks.studio.guided.translation.GuidedPlanHistoryAudit(jdbc, contracts)
        .audit(id);
    ObjectNode out = contracts.object();
    var manifest =
        jdbc.queryForMap(
            "SELECT manifest::text,manifest_hash FROM studio_guided_source_manifests WHERE"
                + " session_id=?",
            id);
    ObjectNode source =
        PublicationContracts.copy(contracts.parse((String) manifest.get("manifest")));
    require(
        GuidedContracts.hash(source).equals(manifest.get("manifest_hash")),
        "EVIDENCE_MISMATCH",
        422);
    out.set("snapshotEvidence", snapshotEvidence(id, source));
    source.remove("configurationValues");
    out.set("sourceManifest", source);
    var plan =
        jdbc.queryForMap(
            "SELECT p.plan_revision,p.plan::text,p.plan_hash FROM studio_guided_translation_state s"
                + " JOIN studio_guided_translation_plans p USING(session_id,plan_revision) WHERE"
                + " s.session_id=?",
            id);
    JsonNode body = contracts.parse((String) plan.get("plan"));
    require(GuidedContracts.hash(body).equals(plan.get("plan_hash")), "EVIDENCE_MISMATCH", 422);
    out.put("translationRevision", plan.get("plan_revision").toString())
        .put("translationHash", (String) plan.get("plan_hash"))
        .set("translationPlan", body);
    out.set("materializationEvidence", new GuidedMaterializationEvidence(jdbc, contracts).read(id));
    var m =
        jdbc.queryForMap(
            "SELECT"
                + " context_id,context_revision,materialization_revision,worker_id,o"
                + "wner_fence,authored_inputs_hash,authored_inputs::text"
                + " FROM studio_guided_materializations WHERE session_id=?",
            id);
    JsonNode inputs = contracts.parse((String) m.get("authored_inputs"));
    require(
        GuidedContracts.hash(inputs).equals(m.get("authored_inputs_hash")),
        "EVIDENCE_MISMATCH",
        422);
    ObjectNode material =
        out.putObject("materialization")
            .put("contextId", (String) m.get("context_id"))
            .put("contextRevision", ((Number) m.get("context_revision")).intValue())
            .put("materializationRevision", ((Number) m.get("materialization_revision")).intValue())
            .put("workerId", (String) m.get("worker_id"))
            .put("ownerFence", ((Number) m.get("owner_fence")).intValue())
            .put("authoredInputsHash", (String) m.get("authored_inputs_hash"));
    var safeInputs = material.putArray("inputs");
    for (JsonNode input : inputs.path("inputs")) {
      ObjectNode safe = input.deepCopy();
      safe.remove("value");
      safeInputs.add(safe);
    }
    var observations = out.putArray("observations");
    jdbc.query(
            "SELECT observation_hash,observation::text FROM studio_guided_publication_observations"
                + " WHERE session_id=? ORDER BY generation,observation_hash",
            (rs, n) -> {
              ObjectNode o = contracts.object().put("observationHash", rs.getString(1));
              o.set("observation", contracts.parse(rs.getString(2)));
              return o;
            },
            id)
        .forEach(observations::add);
    var preparations = out.putArray("preparations");
    jdbc.query(
            "SELECT"
                + " preparation_id,proposal::text,proof::text,execution_evidence::text,"
                + "observation_hash,observed_choice_receipt::text,materialization_revision"
                + " FROM studio_guided_publication_preparations WHERE session_id=? ORDER BY"
                + " preparation_id",
            (rs, n) -> {
              ObjectNode p = contracts.object().put("preparationId", rs.getString(1));
              p.set("proposal", contracts.parse(rs.getString(2)));
              p.set("proof", contracts.parse(rs.getString(3)));
              p.set("executionEvidence", contracts.parse(rs.getString(4)));
              p.put("observationHash", rs.getString(5));
              p.put("materializationRevision", rs.getInt(7));
              if (rs.getString(6) != null) {
                p.set("observedChoice", choiceWitness(id, contracts.parse(rs.getString(6))));
              }
              return p;
            },
            id)
        .forEach(preparations::add);
    var associations = out.putArray("admissionAssociations");
    jdbc.query(
            "SELECT obligation_id,preparation_id,admission_id,proposal_hash FROM"
                + " studio_guided_publication_admissions WHERE session_id=? ORDER BY admission_id",
            (rs, n) ->
                contracts
                    .object()
                    .put("obligationId", rs.getString(1))
                    .put("preparationId", rs.getString(2))
                    .put("admissionId", rs.getString(3))
                    .put("proposalHash", rs.getString(4)),
            id)
        .forEach(associations::add);
    var obligations = out.putArray("obligationAssociations");
    jdbc.query(
            "SELECT"
                + " obligation_id,meaning::text,proposal::text,proposal_digest,admission_id,plan_revision"
                + " FROM studio_guided_obligation_admissions WHERE session_id=? ORDER BY"
                + " obligation_id",
            (rs, n) -> {
              ObjectNode o =
                  contracts
                      .object()
                      .put("obligationId", rs.getString(1))
                      .put("proposalDigest", rs.getString(4))
                      .put("admissionId", rs.getString(5))
                      .put("planRevision", rs.getLong(6));
              o.set("meaning", contracts.parse(rs.getString(2)));
              o.set("proposal", contracts.parse(rs.getString(3)));
              return o;
            },
            id)
        .forEach(obligations::add);
    var actions = out.putArray("actions");
    jsonRows(
            "SELECT document::text FROM studio_guided_actions WHERE session_id=? ORDER BY"
                + " step_id,ordinal",
            id)
        .forEach(actions::add);
    JsonNode sessionDocument =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id));
    ObjectNode incremental =
        new com.citi.put.checks.studio.guided.session.GuidedIncrementalStore(jdbc, contracts)
            .evidence(sessionDocument);
    if (incremental == null) {
      out.putNull("incrementalEvidence");
    } else {
      out.set("incrementalEvidence", incremental);
    }
    var witnessedQuestions = new java.util.HashSet<String>();
    var witnessedObligations = new java.util.HashSet<String>();
    for (JsonNode prepared : preparations) {
      if (!prepared.has("observedChoice")) {
        continue;
      }
      JsonNode receipt = prepared.path("observedChoice").path("receipt");
      require(
          witnessedQuestions.add(receipt.path("clarificationId").asText())
              && witnessedObligations.add(receipt.path("obligationId").asText()),
          "EVIDENCE_MISMATCH",
          422);
      boolean successful = false;
      for (JsonNode association : associations) {
        if (!association.path("preparationId").equals(prepared.path("preparationId"))
            || !association.path("obligationId").equals(receipt.path("obligationId"))) {
          continue;
        }
        for (JsonNode action : actions) {
          successful |=
              action.path("admission").path("admissionId").equals(association.path("admissionId"))
                  && action.path("state").asText().equals("SUCCEEDED");
        }
      }
      require(successful, "EVIDENCE_MISMATCH", 422);
    }
    var acceptedQuestions = new java.util.HashSet<String>();
    var acceptedObligations = new java.util.HashSet<String>();
    for (JsonNode row : observedChoices(id)) {
      require(
          acceptedQuestions.add(row.path("context").path("clarificationId").asText())
              && acceptedObligations.add(selectedMeaning(row).path("obligationId").asText()),
          "EVIDENCE_MISMATCH",
          422);
    }
    require(acceptedQuestions.equals(witnessedQuestions), "EVIDENCE_MISMATCH", 422);
    require(witnessedQuestions.size() <= 200, "BUDGET_EXCEEDED", 413);
    // Only original observations actually used by successful actions or their question proof,
    // or committed to by this session's own prefix requests (prefixRequestObservations), belong
    // to the independent basis. Captured but unexercised facts remain in immutable SQL.
    var neededObservations = new java.util.HashSet<String>();
    for (JsonNode association : associations) {
      boolean successful = false;
      for (JsonNode action : actions) {
        successful |=
            action.path("admission").path("admissionId").equals(association.path("admissionId"))
                && action.path("state").asText().equals("SUCCEEDED");
      }
      if (!successful) {
        continue;
      }
      JsonNode prepared =
          GuidedPlanBuilder.unique(
              preparations, "preparationId", association.path("preparationId").asText());
      if (!prepared.path("observationHash").isNull()) {
        neededObservations.add(prepared.path("observationHash").asText());
      }
      if (prepared.has("observedChoice")) {
        neededObservations.add(
            prepared
                .path("observedChoice")
                .path("context")
                .path("questionCapture")
                .path("observationHash")
                .asText());
      }
    }
    // A prefix request names the original observation it was issued against. A drifted request
    // has no successful action, but the basis still binds that observation (GuidedPlanBuilder
    // derive, GuidedBasisValidator validatePrefix), so it belongs to the independent basis too.
    neededObservations.addAll(prefixRequestObservations(contracts, id, incremental, observations));
    var usedObservations = contracts.object().putArray("observations");
    for (JsonNode observation : observations) {
      if (neededObservations.remove(observation.path("observationHash").asText())) {
        usedObservations.add(observation);
      }
    }
    require(neededObservations.isEmpty(), "EVIDENCE_MISMATCH", 422);
    out.set("observations", usedObservations);
    for (String[] table :
        new String[][] {
          {"allocations", "studio_guided_allocations"},
          {"producers", "studio_guided_producers"},
          {"consumerEdges", "studio_guided_consumer_edges"}
        }) {
      var array = out.putArray(table[0]);
      jsonRows(
              "SELECT document::text FROM "
                  + table[1]
                  + " WHERE session_id=? ORDER BY document::text",
              id)
          .forEach(array::add);
    }
    var selections = out.putArray("sourceSelections");
    jdbc.query(
            "SELECT meanings::text,accepted_choice FROM studio_guided_clarification_contexts WHERE"
                + " session_id=? AND accepted_choice IS NOT NULL ORDER BY clarification_id",
            (rs, n) -> {
              JsonNode meanings = contracts.parse(rs.getString(1));
              for (JsonNode entry : meanings) {
                if (entry.path("choiceId").asText().equals(rs.getString(2))) {
                  return entry.path("meaning");
                }
              }
              return com.fasterxml.jackson.databind.node.NullNode.instance;
            },
            id)
        .forEach(
            value -> {
              if (value.has("need") && value.has("reference")) {
                selections.add(value);
              }
            });
    JsonNode progress =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id));
    ObjectNode bootstrap = out.putObject("bootstrap");
    bootstrap.set("marker", progress.path("translationBootstrap").deepCopy());
    bootstrap.set("receipt", progress.path("translationBootstrapEvidence").deepCopy());
    JsonNode initial = null;
    for (JsonNode p : preparations) {
      if (p.path("executionEvidence").path("kind").asText().equals("initialBlank")) {
        require(
            initial == null || initial.equals(p.path("executionEvidence")),
            "EVIDENCE_MISMATCH",
            422);
        initial = p.path("executionEvidence");
      }
    }
    require(initial != null, "MISSING_SOURCE", 409);
    bootstrap.set("initialEvidence", initial.deepCopy());
    return new PublicationContracts.Evidence(out);
  }

  private ObjectNode snapshotEvidence(String id, JsonNode manifest) {
    ObjectNode current = contracts.object().put("authoringIdentityVersion", 1);
    current.set("authoring", manifest.path("authoringSnapshot"));
    current.set("authoredDeclarations", manifest.path("authoredDeclarations"));
    contracts.validate("v3/authoring-snapshot#/definitions/AuthoringSnapshotIdentity", current);
    // Complete declaration hashes are proved against the frozen private values, including
    // authored references that never materialized or executed.
    java.util.Map<String, String> values = new java.util.HashMap<>();
    for (JsonNode config : manifest.path("configurationValues")) {
      if (!config.path("kind").asText().equals("secretRef") && config.path("value").isTextual()) {
        String name = config.path("referenceName").asText();
        String previous = values.putIfAbsent(name, config.path("value").textValue());
        require(
            previous == null || previous.equals(config.path("value").textValue()),
            "REFERENCE_MISMATCH",
            422);
      }
    }
    java.util.List<com.citi.put.checks.studio.dto.StudioVariable> declarations =
        new java.util.ArrayList<>();
    for (JsonNode declaration : current.path("authoredDeclarations")) {
      String key = declaration.path("referenceId").asText();
      if (declaration.path("kind").asText().equals("plain")) {
        require(values.containsKey(key), "MISSING_SOURCE", 409);
        declarations.add(com.citi.put.checks.studio.dto.StudioVariable.plain(key, values.get(key)));
      } else {
        declarations.add(
            com.citi.put.checks.studio.dto.StudioVariable.secretRef(
                key, declaration.path("secretId").asText()));
      }
    }
    var frozen =
        com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.snapshot(current);
    var resolved =
        com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
            frozen.authoring(), declarations);
    require(
        resolved
                .references()
                .path("authoredDeclarations")
                .equals(current.path("authoredDeclarations"))
            && new com.fasterxml.jackson.databind.ObjectMapper()
                .valueToTree(resolved.inputs())
                .equals(manifest.path("authoringRevisionInputs")),
        "EVIDENCE_MISMATCH",
        422);
    ObjectNode result = contracts.object().put("schemaVersion", 3);
    result.set("current", current);
    result.putNull("pinnedBase");
    result.putNull("baseProof");
    var plans =
        jdbc.queryForList(
            "SELECT p.base_revision_id,p.initial_step_index,p.prefix_program::text,"
                + "r.revision_digest,r.authoring::text,r.authoring_revision_inputs::text,"
                + "r.configuration::text,"
                + "r.\"references\"::text AS reference_identity,r.step_snapshot_hashes::text,"
                + "r.step_reuse_provenance::text,"
                + "b.document::text AS start_base FROM studio_guided_relearn_plans p "
                + "JOIN ui_test_revisions r ON r.id=p.base_revision_id"
                + " JOIN studio_guided_publication_bases b ON b.session_id=p.session_id WHERE p.session_id=?",
            id);
    if (!plans.isEmpty()) {
      var row = plans.getFirst();
      String baseId = row.get("base_revision_id").toString();
      JsonNode startBase = contracts.parse((String) row.get("start_base"));
      JsonNode program = contracts.parse((String) row.get("prefix_program"));
      require(
          startBase.path("confirmedRevisionId").asText().equals(baseId)
              && program.path("baseRevisionId").asText().equals(baseId)
              && program.path("baseRevisionDigest").asText().equals(row.get("revision_digest")),
          "EVIDENCE_MISMATCH",
          422);
      result
          .putObject("pinnedBase")
          .put("revisionId", baseId)
          .put("revisionDigest", (String) row.get("revision_digest"));
      if (((Number) row.get("initial_step_index")).intValue() > 0) {
        require(revisionVerifier != null, "RUNTIME_INCOMPATIBLE", 409);
        ObjectNode verified = revisionVerifier.apply(java.util.UUID.fromString(baseId));
        ObjectNode baseIdentity = contracts.object().put("authoringIdentityVersion", 1);
        baseIdentity.set("authoring", contracts.parse((String) row.get("authoring")));
        baseIdentity.set(
            "authoredDeclarations",
            contracts.parse((String) row.get("reference_identity")).path("authoredDeclarations"));
        ObjectNode baseProof = result.putObject("baseProof");
        baseProof.set("authoringIdentity", baseIdentity);
        baseProof.set("configuration", verified.path("configuration"));
        baseProof.set("artifact", verified.path("artifact"));
        ObjectNode revision =
            baseProof
                .putObject("revision")
                .put("schemaVersion", 3)
                .put("id", baseId)
                .put("revisionDigest", (String) row.get("revision_digest"));
        revision.set("identity", verified.path("identity"));
        revision.set(
            "stepSnapshotHashes", contracts.parse((String) row.get("step_snapshot_hashes")));
        revision.set("reusedFrom", contracts.parse((String) row.get("step_reuse_provenance")));
      }
    }
    contracts.validate("v3/authoring-snapshot", result);
    return result;
  }

  private List<JsonNode> jsonRows(String sql, String id) {
    return jdbc.query(sql, (rs, n) -> contracts.parse(rs.getString(1)), id);
  }
}
