package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPublicationMigrationTest.C;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class GuidedPublicationEvidenceTest {
  static JsonNode setup(GuidedPublicationMigrationTest.Database db) throws Exception {
    JsonNode original =
        C.parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents")
            .path("flow");
    String originalFirstStep =
        original.path("session").path("sourceSteps").get(0).path("stepId").asText();
    var identities =
        java.util.Map.of(
            original.path("session").path("sessionId").asText(),
            "session",
            originalFirstStep,
            db.stepId.toString(),
            original.path("source").path("sourceRevision").asText(),
            "1",
            original.path("source").path("configurationRevision").asText(),
            "1",
            original.path("session").path("scopeHash").asText(),
            db.session.path("scopeHash").asText());
    ObjectNode flow = (ObjectNode) rebindIdentity(original, identities);
    // Rebuild dependent hashes from structurally rebound facts. No text replacement can safely
    // identify a UUID coordinate or distinguish it from authored English/private input content.
    for (JsonNode item : flow.path("contexts")) {
      ((ObjectNode) item)
          .put("authoredInputsHash", GuidedContracts.hash(item.path("authoredInputs")));
    }
    for (int index = 0; index < flow.path("proposals").size(); index++) {
      ObjectNode proposal = (ObjectNode) flow.path("proposals").get(index);
      ObjectNode evidence = (ObjectNode) proposal.path("executionEvidence");
      if (evidence.path("kind").asText().equals("observedDocument")) {
        for (JsonNode observed : flow.path("observations")) {
          if (observed.path("documentId").equals(evidence.path("documentId"))
              && observed.path("generation").equals(evidence.path("generation"))) {
            evidence.put("observationHash", GuidedContracts.hash(observed));
          }
        }
      }
      JsonNode at = flow.path("contexts").get(flow.path("contextAtAction").get(index).asInt());
      proposal
          .put("authoredInputsHash", at.path("authoredInputsHash").asText())
          .put("evidenceHash", GuidedContracts.hash(evidence));
      ObjectNode proof = (ObjectNode) flow.path("preparations").get(index);
      proof
          .put("authoredInputsHash", proposal.path("authoredInputsHash").asText())
          .put("evidenceHash", proposal.path("evidenceHash").asText())
          .put("requestDigest", GuidedContracts.hash(proposal));
    }
    var context = flow.path("contexts").get(0);
    var inputs = context.path("authoredInputs");
    db.tx.executeWithoutResult(
        s -> {
          db.sessions.lock("session");
          var intent =
              C.object()
                  .put("sessionId", "session")
                  .put("assignmentId", "assignment")
                  .put("workerId", "worker-1")
                  .put("scopeHash", db.session.path("scopeHash").asText())
                  .put("expectedFence", 0);
          db.jdbc.update(
              "INSERT INTO"
                  + " studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,expected_fence,intent)"
                  + " VALUES ('session','assignment',?,'worker-1',0,?::jsonb)",
              db.session.path("scopeHash").asText(),
              intent.toString());
          db.jdbc.update(
              "INSERT INTO"
                  + " studio_guided_materializations(session_id,scope_hash,context_id,"
                  + "context_revision,materialization_revision,worker_id,owner_fence,s"
                  + "ource_revision,configuration_revision,authored_inputs_hash,author"
                  + "ed_inputs)"
                  + " VALUES ('session',?,'context-1',1,1,'worker-1',1,'1','1',?,?::jsonb)",
              db.session.path("scopeHash").asText(),
              GuidedContracts.hash(inputs),
              inputs.toString());
          var owner =
              C.object()
                  .put("workerId", "worker-1")
                  .put("fence", 1)
                  .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
          db.jdbc.update(
              "UPDATE studio_guided_sessions SET"
                  + " state='PROPOSING',document=jsonb_set(jsonb_set(document,'{state}"
                  + "','\"PROPOSING\"'),'{owner}',?::jsonb)"
                  + " WHERE session_id='session'",
              owner.toString());
          var plan = C.object();
          plan.putArray("sourceReferences")
              .add(inputs.path("inputs").get(0).path("provenance").deepCopy());
          plan.putArray("obligations")
              .addObject()
              .put("obligationId", "00000000-0000-0000-0000-000000000001")
              .put("stepId", db.stepId.toString())
              .put("occurrence", 0)
              .put("operationKind", "navigate")
              .put("targetIntent", "Open")
              .putNull("scopeIntent")
              .put("referenceIndex", 0)
              .putNull("needId")
              .putNull("predicate");
          plan.putArray("needs")
              .addObject()
              .put("needId", "need")
              .put("bindingId", "server-binding")
              .put("producerStepId", db.stepId.toString())
              .putArray("consumers");
          com.citi.put.checks.studio.guided.translation.GuidedAcceptedPlan.validate(C, plan);
          db.jdbc.update(
              "INSERT INTO"
                  + " studio_guided_translation_plans(session_id,plan_revision,parent_revision,plan,plan_hash)"
                  + " VALUES ('session',1,0,?::jsonb,?)",
              plan.toString(),
              GuidedContracts.hash(plan));
          db.jdbc.update(
              "UPDATE studio_guided_translation_state SET plan_revision=1 WHERE"
                  + " session_id='session'");
        });
    return flow;
  }

  private static JsonNode rebindIdentity(JsonNode node, java.util.Map<String, String> identities) {
    if (node.isTextual()) {
      return com.fasterxml.jackson.databind.node.TextNode.valueOf(
          identities.getOrDefault(node.textValue(), node.textValue()));
    }
    if (node.isArray()) {
      var result = C.object().putArray("items");
      node.forEach(item -> result.add(rebindIdentity(item, identities)));
      return result;
    }
    if (node.isObject()) {
      ObjectNode result = C.object();
      node.fields()
          .forEachRemaining(
              field ->
                  result.set(
                      identities.getOrDefault(field.getKey(), field.getKey()),
                      rebindIdentity(field.getValue(), identities)));
      return result;
    }
    return node.deepCopy();
  }

  static void capture(GuidedPublicationMigrationTest.Database db, JsonNode flow, int index) {
    ObjectNode proposal = ((ObjectNode) flow.path("proposals").get(index)).deepCopy();
    ObjectNode proof = ((ObjectNode) flow.path("preparations").get(index)).deepCopy();
    JsonNode obs = index == 0 ? null : flow.path("observations").get(0);
    if (obs != null) {
      ((ObjectNode) proposal.path("executionEvidence"))
          .put("observationHash", GuidedContracts.hash(obs));
    }
    String inputsHash =
        db.jdbc.queryForObject(
            "SELECT authored_inputs_hash FROM studio_guided_materializations WHERE"
                + " session_id='session'",
            String.class);
    proposal
        .put("authoredInputsHash", inputsHash)
        .put("evidenceHash", GuidedContracts.hash(proposal.path("executionEvidence")));
    proof
        .put("authoredInputsHash", inputsHash)
        .put("requestDigest", GuidedContracts.hash(proposal))
        .put("evidenceHash", proposal.path("evidenceHash").asText())
        .put("expiresAt", Instant.now().plusSeconds(60).toString());
    db.tx.executeWithoutResult(
        s -> {
          var current = db.sessions.lock("session");
          var p = current.progress();
          p.set("executionEvidence", proposal.path("executionEvidence"));
          if (obs != null) {
            p.set("observation", obs);
            p.put("observationHash", GuidedContracts.hash(obs));
          }
          p.set("translationBootstrap", C.object().put("phase", "READY"));
          p.set("translationBootstrapEvidence", C.object().put("contextId", "context-1"));
          db.jdbc.update(
              "UPDATE studio_guided_sessions SET progress=?::jsonb WHERE session_id='session'",
              p.toString());
          new GuidedPreparationStore(db.jdbc, C).store(proof, proposal, Instant.now());
          db.evidence.capturePreparation(current, proposal, proof, Instant.now());
          db.evidence.capturePreparation(current, proposal, proof, Instant.now());
        });
  }

  @Test
  void originalBlankAndPageEvidenceSurviveOverwriteWithSafeInputs() throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      db.capture();
      JsonNode flow = setup(db);
      capture(db, flow, 0);
      capture(db, flow, 1);
      db.jdbc.update(
          "UPDATE studio_guided_sessions SET progress=progress-'observation'-'executionEvidence'"
              + " WHERE session_id='session'");
      JsonNode evidence =
          db.tx.execute(
              s -> {
                db.sessions.lock("session");
                return db.evidence.read("session").document();
              });
      assertThat(evidence.path("preparations").size()).isEqualTo(2);
      // This storage-only fixture has no successful action associations. Original capture is
      // retained in SQL, while the exported validation basis contains only used observations.
      assertThat(evidence.path("observations").size()).isZero();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_observations", Integer.class))
          .isEqualTo(1);
      assertThat(evidence.path("bootstrap").path("initialEvidence").path("kind").asText())
          .isEqualTo("initialBlank");
      assertThat(evidence.path("preparations").get(0).path("proposal").path("target").isObject())
          .isTrue();
      assertThat(evidence.path("translationPlan").path("needs").get(0).path("bindingId").asText())
          .isEqualTo("server-binding");
      assertThat(GuidedContracts.hash(evidence.path("translationPlan")))
          .isEqualTo(evidence.path("translationHash").asText());
      for (JsonNode input : evidence.path("materialization").path("inputs")) {
        assertThat(input.has("value")).isFalse();
      }
      assertThat(evidence.path("sourceManifest").has("configurationValues")).isFalse();
      assertThatThrownBy(() -> db.jdbc.update("DELETE FROM studio_guided_publication_preparations"))
          .hasMessageContaining("immutable");
    }
  }

  @Test
  void captureRollbackAndMissingTargetOrMismatchedObservationRefuse() throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      db.capture();
      JsonNode flow = setup(db);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        capture(db, flow, 0);
                        throw new IllegalStateException("crash");
                      }))
          .hasMessageContaining("crash");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_preparations", Integer.class))
          .isZero();
      ((ObjectNode) flow.path("proposals").get(0)).putNull("target");
      assertThatThrownBy(() -> capture(db, flow, 0)).hasMessageContaining("INVALID_CONTRACT");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_preparations", Integer.class))
          .isZero();
    }
  }

  @Test
  void directSqlObservationCapsAndNestedUnknownFieldsRefuse() throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      db.capture();
      var flow = setup(db);
      var template = (ObjectNode) flow.path("observations").get(0);
      for (int index = 0; index < 400; index++) {
        var observation = template.deepCopy().put("generation", index);
        observation
            .path("nodes")
            .forEach(
                node ->
                    ((ObjectNode) node).put("generation", observation.path("generation").asInt()));
        db.tx.executeWithoutResult(
            t -> {
              db.sessions.lock("session");
              db.jdbc.update(
                  "UPDATE studio_guided_sessions SET"
                      + " progress=jsonb_set(progress,'{observation}',?::jsonb) WHERE"
                      + " session_id='session'",
                  observation.toString());
              db.jdbc.update(
                  "INSERT INTO"
                      + " studio_guided_publication_observations(session_id,observation_ha"
                      + "sh,context_id,owner_fence,document_id,generation,observation,capt"
                      + "ured_at)"
                      + " VALUES ('session',?,'context-1',1,?,?,?::jsonb,now())",
                  GuidedContracts.hash(observation),
                  observation.path("documentId").asText(),
                  observation.path("generation").asInt(),
                  observation.toString());
            });
      }
      var overflow = template.deepCopy().put("generation", 400);
      overflow.path("nodes").forEach(node -> ((ObjectNode) node).put("generation", 400));
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      t -> {
                        db.sessions.lock("session");
                        db.jdbc.update(
                            "UPDATE studio_guided_sessions SET"
                                + " progress=jsonb_set(progress,'{observation}',?::jsonb) WHERE"
                                + " session_id='session'",
                            overflow.toString());
                        db.jdbc.update(
                            "INSERT INTO"
                                + " studio_guided_publication_observations(session_id,observation_ha"
                                + "sh,context_id,owner_fence,document_id,generation,observation,captured_at)"
                                + " VALUES ('session',?,'context-1',1,?,400,?::jsonb,now())",
                            GuidedContracts.hash(overflow),
                            overflow.path("documentId").asText(),
                            overflow.toString());
                      }))
          .hasMessageContaining("evidence limit");
      var privateField = template.deepCopy();
      ((ObjectNode) privateField.path("nodes").get(0)).put("value", "do-not-store");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_publication_observation_shape(?::jsonb)",
                  Boolean.class,
                  privateField.toString()))
          .isFalse();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_publication_closed(?::jsonb,ARRAY['value'],32768)",
                  Boolean.class,
                  C.object().put("value", "x".repeat(32769)).toString()))
          .isFalse();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_observations", Integer.class))
          .isEqualTo(400);
    }
  }

  private static void acceptOldObservedQuestion(
      GuidedPublicationMigrationTest.Database db, String questionId, String targetName) {
    db.tx.executeWithoutResult(
        t -> {
          var current = db.sessions.lock("session");
          ObjectNode question =
              C.object()
                  .put("schemaVersion", 3)
                  .put("phase", "observed")
                  .put("clarificationId", questionId)
                  .put("sessionId", "session")
                  .put("scopeHash", current.document().path("scopeHash").asText())
                  .put("reason", "AMBIGUOUS_BINDING")
                  .put("promptCode", "CHOOSE_FIELD")
                  .put("documentId", "original-question-document")
                  .put("generation", 1)
                  .put("expiresAt", Instant.now().plusSeconds(60).toString());
          question.putObject("coordinate").put("stepId", db.stepId.toString()).put("ordinal", 0);
          var meanings = C.object().putArray("meanings");
          var choices = question.putArray("choices");
          for (int i = 0; i < 2; i++) {
            String choiceId = questionId + "-" + i, nodeId = "old-node-" + i;
            choices
                .addObject()
                .put("choiceId", choiceId)
                .put("safeLabel", "Observed candidate " + i)
                // STUDIO-OBS-014 AC-7 (C2a): an observed-phase choice names a page node.
                .put("labelSource", "PAGE")
                .put("role", "button")
                .putNull("region")
                .put("nodeId", nodeId)
                .putNull("bindingId");
            ObjectNode meaning =
                C.object()
                    .put("obligationId", "00000000-0000-0000-0000-000000000001")
                    .put("nodeId", nodeId)
                    .putNull("bindingId");
            meaning.set(
                "locator",
                C.object()
                    .put("kind", "role")
                    .put("role", "button")
                    .put("name", i == 0 ? targetName : "Alternative")
                    .put("exact", true));
            meanings.addObject().put("choiceId", choiceId).set("meaning", meaning);
          }
          C.validate("v3/clarification", question);
          var contexts =
              new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
                  db.jdbc, C);
          contexts.create(current.document(), question, meanings);
          contexts.accept(current.document(), questionId, questionId + "-0");
        });
  }

  @Test
  void actualAcceptedSameTargetAndAlternateTargetRowsCannotDisappearWithoutProspectiveProof()
      throws Exception {
    for (String target : List.of("Open", "Alternate")) {
      try (var db = new GuidedPublicationMigrationTest.Database()) {
        db.capture();
        JsonNode flow = setup(db);
        capture(db, flow, 0);
        assertThat(
                db.tx
                    .execute(t -> db.evidence.read("session").document())
                    .path("preparations")
                    .size())
            .isEqualTo(1);
        acceptOldObservedQuestion(db, "old-question", target);
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT accepted_choice FROM studio_guided_clarification_contexts"
                        + " WHERE session_id='session' AND clarification_id='old-question'",
                    String.class))
            .isEqualTo("old-question-0");
        assertThatThrownBy(() -> db.tx.execute(t -> db.evidence.read("session")))
            .hasMessageContaining("EVIDENCE_MISMATCH");
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT observed_choice_receipt IS NULL FROM"
                        + " studio_guided_publication_preparations WHERE session_id='session'",
                    Boolean.class))
            .isTrue();
      }
    }
  }

  @Test
  void actualEqualTargetAcceptedDecisionsAreAmbiguousAndCannotBackfillAnOldPreparation()
      throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      db.capture();
      JsonNode flow = setup(db);
      capture(db, flow, 0);
      acceptOldObservedQuestion(db, "first-question", "Open");
      acceptOldObservedQuestion(db, "second-question", "Open");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_clarification_contexts"
                      + " WHERE session_id='session' AND accepted_choice IS NOT NULL",
                  Integer.class))
          .isEqualTo(2);
      assertThatThrownBy(() -> db.tx.execute(t -> db.evidence.read("session")))
          .hasMessageContaining("EVIDENCE_MISMATCH");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_publication_preparations SET"
                          + " observed_choice_receipt='{}'::jsonb WHERE session_id='session'"))
          .hasMessageContaining("immutable");
    }
  }

  /**
   * qa-review01 H3 follow-up (negative regression for the prefix-request observation binding in
   * {@code GuidedPublicationEvidenceRepository.read}): an observation enters the evidence read only
   * when this session's own prefix request committed to it. A request hashed for another session,
   * for another context, or naming another observation binds nothing.
   */
  @Test
  void prefixRequestBindsOnlyTheObservationItsOwnSessionContextAndHashCommitTo() {
    String session = "00000000-0000-4000-8000-0000000000a1";
    String foreign = "00000000-0000-4000-8000-0000000000b2";
    var observations = C.object().putArray("observations");
    ObjectNode committed = observations.addObject().put("observationHash", "observation-a");
    committed
        .putObject("observation")
        .put("documentId", "document-1")
        .put("generation", 2)
        .put("origin", "https://app.example.invalid");
    ObjectNode uncommitted = observations.addObject().put("observationHash", "observation-b");
    uncommitted
        .putObject("observation")
        .put("documentId", "document-2")
        .put("generation", 3)
        .put("origin", "https://app.example.invalid");

    assertThat(bound(session, observations, request("context-1", session, "context-1", committed)))
        .as("this session's own request binds exactly the observation it committed to")
        .containsExactly("observation-a");
    assertThat(bound(session, observations, request("context-1", foreign, "context-1", committed)))
        .as("wrong session: a request hashed for another session binds nothing")
        .isEmpty();
    assertThat(bound(session, observations, request("context-2", session, "context-1", committed)))
        .as("wrong context: the request's own contextId must be the committed one")
        .isEmpty();
    ObjectNode forged = committed.deepCopy().put("observationHash", "observation-forged");
    assertThat(bound(session, observations, request("context-1", session, "context-1", forged)))
        .as("wrong hash: a request naming no stored observation binds nothing")
        .isEmpty();
    assertThat(
            GuidedPublicationEvidenceRepository.prefixRequestObservations(
                C, session, null, observations))
        .as("no incremental evidence binds nothing")
        .isEmpty();
  }

  private static java.util.Set<String> bound(
      String session, JsonNode observations, ObjectNode request) {
    ObjectNode incremental = C.object();
    incremental.putArray("prefixRequests").add(request);
    return GuidedPublicationEvidenceRepository.prefixRequestObservations(
        C, session, incremental, observations);
  }

  /**
   * A prefix request with {@code contextId}, whose evidenceHash commits to {@code row} as seen by
   * {@code hashedSession} in {@code hashedContext}.
   */
  private static ObjectNode request(
      String contextId, String hashedSession, String hashedContext, JsonNode row) {
    ObjectNode execution =
        C.object()
            .put("kind", "observedDocument")
            .put("sessionId", hashedSession)
            .put("contextId", hashedContext);
    for (String field : List.of("documentId", "generation", "origin")) {
      execution.set(field, row.path("observation").path(field));
    }
    execution.put("observationHash", row.path("observationHash").asText());
    return C.object()
        .put("contextId", contextId)
        .put("evidenceHash", GuidedContracts.hash(execution));
  }
}
