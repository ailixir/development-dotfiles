package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Actual PG store/allocator/history phases; no browser, model-send or publication claim. */
class GuidedBootstrapPlanHistoryIT {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String ID = "bootstrap-phase";
  private static final String STEP = "00000000-0000-4000-8000-000000000001";

  private static ObjectNode initialize(GuidedTranslationMigrationTest.Database db)
      throws Exception {
    ObjectNode session =
        C.parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents")
            .path("flow")
            .path("session")
            .deepCopy();
    session
        .put("sessionId", ID)
        .put("testId", UUID.randomUUID().toString())
        .put("state", "PROPOSING")
        .put("createdAt", Instant.now().toString())
        .put("expiresAt", Instant.now().plusSeconds(600).toString());
    session
        .putObject("owner")
        .put("workerId", "worker")
        .put("fence", 1)
        .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
    session.putArray("sourceSteps").addObject().put("stepId", STEP).put("requiresAssertion", false);
    ObjectNode manifest =
        C.object()
            .put("testId", session.path("testId").asText())
            .put("sourceRevision", session.path("scope").path("sourceRevision").asText())
            .put(
                "configurationRevision",
                session.path("scope").path("configurationRevision").asText())
            .put("policy", "INPUT-POLICY-01-A");
    manifest
        .putArray("sourceSteps")
        .addObject()
        .put("stepId", STEP)
        .put("text", "Read Order reference then enter that order reference in Destination.");
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.insert(session);
          db.sessions.lock(ID);
          db.store.initialize(session, manifest);
        });
    return session;
  }

  private static ObjectNode admitted(JsonNode session) {
    ObjectNode response = C.object();
    response.putArray("sourceReferences");
    var meanings = response.putArray("obligations");
    for (int at = 0; at < 2; at++) {
      meanings
          .addObject()
          .put("stepId", STEP)
          .put("occurrence", at)
          .put("operationKind", at == 0 ? "read" : "fill")
          .put("targetIntent", at == 0 ? "Order reference" : "Destination")
          .putNull("scopeIntent")
          .putNull("referenceIndex")
          .put("needId", "order")
          .putNull("predicate");
    }
    response
        .putArray("needs")
        .addObject()
        .put("needId", "order")
        .put("producerStepId", STEP)
        .putArray("consumers")
        .addObject()
        .put("stepId", STEP)
        .put("argumentSlot", "fill.value");
    return new GuidedProposalValidator(C).admitPlan(session, response);
  }

  private static String history(GuidedTranslationMigrationTest.Database db) {
    ObjectNode result = C.object();
    for (String table :
        List.of(
            "studio_guided_sessions",
            "studio_guided_translation_plans",
            "studio_guided_translation_state",
            "studio_guided_allocations",
            "studio_guided_model_attempts",
            "studio_guided_materializations",
            "studio_guided_actions")) {
      result.set(
          table,
          C.parse(
              db.jdbc.queryForObject(
                  "SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM "
                      + table
                      + " t WHERE session_id=?",
                  String.class,
                  ID)));
    }
    return GuidedContracts.canonical(result);
  }

  @Test
  void unboundBootstrapAcceptanceThenActualAllocationPreservesImmutableOriginalHistory()
      throws Exception {
    try (var db = new GuidedTranslationMigrationTest.Database()) {
      ObjectNode session = initialize(db), initial = admitted(session);
      JsonNode original = initial.deepCopy();
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock(ID);
            assertThat(db.store.acceptPlan(ID, 0, initial)).isEqualTo(1);
          });
      assertThat(initial).isEqualTo(original);
      String raw =
          db.jdbc.queryForObject(
              "SELECT plan::text FROM studio_guided_translation_plans WHERE session_id=? AND plan_revision=1",
              String.class,
              ID);
      assertThat(C.parse(raw).path("needs").get(0).has("bindingId")).isFalse();
      assertThatThrownBy(() -> GuidedAcceptedPlan.validate(C, initial))
          .isInstanceOf(GuidedSessionException.class);
      ObjectNode allocated = initial.deepCopy();
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock(ID);
            ObjectNode inputs =
                C.object()
                    .put("schemaVersion", 3)
                    .put("sessionId", ID)
                    .put("scopeHash", session.path("scopeHash").asText());
            for (String field : List.of("sourceRevision", "configurationRevision")) {
              inputs.set(field, session.path("scope").path(field));
            }
            inputs.putArray("inputs");
            ObjectNode intent =
                C.object()
                    .put("sessionId", ID)
                    .put("assignmentId", "bootstrap-assignment")
                    .put("workerId", "worker")
                    .put("scopeHash", session.path("scopeHash").asText())
                    .put("expectedFence", 0);
            db.jdbc.update(
                "INSERT INTO studio_guided_assignments"
                    + "(session_id,assignment_id,scope_hash,worker_id,expected_fence,intent)"
                    + " VALUES (?, 'bootstrap-assignment',?,'worker',0,?::jsonb)",
                ID,
                session.path("scopeHash").asText(),
                intent.toString());
            db.jdbc.update(
                "INSERT INTO studio_guided_materializations"
                    + "(session_id,scope_hash,context_id,context_revision,materialization_revision,"
                    + "worker_id,owner_fence,source_revision,configuration_revision,"
                    + "authored_inputs_hash,authored_inputs)"
                    + " VALUES (?,?,'bootstrap-context',1,1,'worker',1,?,?,?,?::jsonb)",
                ID,
                session.path("scopeHash").asText(),
                session.path("scope").path("sourceRevision").asText(),
                session.path("scope").path("configurationRevision").asText(),
                GuidedContracts.hash(inputs),
                inputs.toString());
            var bindings =
                new GuidedBindingStore(
                    db.jdbc,
                    C,
                    new GuidedMaterializationService(
                        db.jdbc, C, com.citi.put.checks.studio.support.TestDomains.FIXTURES));
            JsonNode need = initial.path("needs").get(0);
            JsonNode actual =
                bindings.allocate(
                    session,
                    need.path("needId").asText(),
                    need.path("producerStepId").asText(),
                    need.path("consumers"));
            ((ObjectNode) allocated.path("needs").get(0))
                .set("bindingId", actual.path("bindingId"));
            GuidedAcceptedPlan.validate(C, allocated);
            assertThat(db.store.acceptPlan(ID, 1, allocated)).isEqualTo(2);
            assertThat(db.store.state(ID).path("plan")).isEqualTo(allocated);
            new GuidedPlanHistoryAudit(db.jdbc, C).audit(ID);
          });
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT plan::text FROM studio_guided_translation_plans WHERE session_id=? AND plan_revision=1",
                  String.class,
                  ID))
          .isEqualTo(raw);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT plan_hash FROM studio_guided_translation_plans WHERE session_id=? AND plan_revision=1",
                  String.class,
                  ID))
          .isEqualTo(GuidedContracts.hash(original));
      assertThat(allocated.path("obligations")).isEqualTo(original.path("obligations"));
      assertThat(initial).isEqualTo(original);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_allocations WHERE session_id=?",
                  Integer.class,
                  ID))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions WHERE session_id=?",
                  Integer.class,
                  ID))
          .isZero();
    }
  }

  @ParameterizedTest(name = "bootstrap history before-write refuses {0}")
  @ValueSource(
      strings = {
        "fresh-zero",
        "duplicate-id",
        "foreign-reference",
        "foreign-producer",
        "foreign-consumer",
        "source-order"
      })
  void malformedPreallocationPlansWriteNeitherHistoryNorAllocation(String mutation)
      throws Exception {
    try (var db = new GuidedTranslationMigrationTest.Database()) {
      ObjectNode session = initialize(db), plan = admitted(session);
      switch (mutation) {
        case "fresh-zero" -> ((ObjectNode) plan.path("needs").get(0)).putArray("consumers");
        case "duplicate-id" ->
            ((ObjectNode) plan.path("obligations").get(1))
                .set("obligationId", plan.path("obligations").get(0).path("obligationId"));
        case "foreign-reference" -> {
          ((ArrayNode) plan.path("sourceReferences"))
              .addObject()
              .put("referenceKind", "sourceSpan")
              .put("sourceRevision", "1")
              .put("stepId", "foreign-step")
              .put("startUtf16", 0)
              .put("endUtf16", 4)
              .put("kind", "nonsecretText")
              .put("intendedSlot", "fill.value");
          ((ObjectNode) plan.path("obligations").get(1)).put("referenceIndex", 0).putNull("needId");
        }
        case "foreign-producer" ->
            ((ObjectNode) plan.path("needs").get(0)).put("producerStepId", "foreign-step");
        case "foreign-consumer" ->
            ((ObjectNode) plan.path("needs").get(0).path("consumers").get(0))
                .put("stepId", "foreign-step");
        case "source-order" -> {
          var meanings = (ArrayNode) plan.path("obligations");
          JsonNode first = meanings.get(0).deepCopy();
          meanings.set(0, meanings.get(1).deepCopy());
          meanings.set(1, first);
        }
        default -> throw new AssertionError(mutation);
      }
      String before = history(db);
      assertThatThrownBy(
              () ->
                  db.tx.execute(
                      t -> {
                        db.sessions.lock(ID);
                        return db.store.acceptPlan(ID, 0, plan);
                      }))
          .isInstanceOf(GuidedSessionException.class);
      assertThat(history(db)).isEqualTo(before);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_translation_plans WHERE session_id=?",
                  Integer.class,
                  ID))
          .isZero();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_allocations WHERE session_id=?",
                  Integer.class,
                  ID))
          .isZero();
    }
  }
}
