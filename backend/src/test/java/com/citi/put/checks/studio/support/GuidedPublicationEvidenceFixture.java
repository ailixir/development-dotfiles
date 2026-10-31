package com.citi.put.checks.studio.support;

import com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationBaseRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationEvidenceRepository;
import com.citi.put.checks.studio.guided.publication.PublicationContracts;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.translation.CredentialPatternScreen;
import com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Complete synthetic relational evidence for infrastructure/publication tests. Source
 * classification, captured evidence, final basis derivation and publication remain production
 * subjects. Browser observations, successful action outcomes and metadata acknowledgements are
 * controlled test input; this helper provides no native, authenticated worker, model or real joined
 * acceptance credit.
 */
public final class GuidedPublicationEvidenceFixture {
  private static final GuidedContracts C = new GuidedContracts();
  private static final Pattern URL = Pattern.compile("https?://[^\\s<>\"]+");

  private GuidedPublicationEvidenceFixture() {}

  /**
   * Freeze the actual classified source before the original-start base; never repair a manifest.
   */
  public static ObjectNode freezeSource(
      JdbcTemplate jdbc, TransactionTemplate tx, JsonNode supplied) {
    return freezeSource(jdbc, tx, supplied, false);
  }

  /** Explicit V18-only test adapter: no policy approval/table existed in this historical schema. */
  public static ObjectNode freezeHistoricalV18Source(
      JdbcTemplate jdbc, TransactionTemplate tx, JsonNode supplied) {
    requireV18(jdbc);
    return freezeSource(jdbc, tx, supplied, true);
  }

  private static ObjectNode freezeSource(
      JdbcTemplate jdbc, TransactionTemplate tx, JsonNode supplied, boolean historical) {
    return tx.execute(
        status -> {
          var sessions = new GuidedSessionRepository(jdbc, tx, C);
          String id = supplied.path("sessionId").asText();
          var actual = sessions.lock(id);
          JsonNode session = actual.document();
          var bases = new GuidedPublicationBaseRepository(jdbc, C);
          ObjectNode current =
              PublicationContracts.copy(
                  bases.lockCurrent(UUID.fromString(session.path("testId").asText())).document());
          current.put("environment", current.path("configuration").path("environment").asText());
          current.set(
              "variables",
              C.parse(
                  jdbc.queryForObject(
                      "SELECT variables::text FROM ui_tests WHERE id=?",
                      String.class,
                      UUID.fromString(session.path("testId").asText()))));
          var properties = new GuidedTranslationProperties(true, 65536, 4096, 60, "fixture-worker");
          ObjectNode manifest =
              new GuidedSourceClassifier(
                      C,
                      new CredentialPatternScreen(),
                      com.citi.put.checks.studio.support.TestDomains.FIXTURES)
                  .classify(current, session.path("scope"));
          var existing =
              jdbc.queryForList(
                  "SELECT manifest::text FROM studio_guided_source_manifests WHERE session_id=?",
                  String.class,
                  id);
          if (existing.isEmpty()) {
            jdbc.update(
                "INSERT INTO"
                    + " studio_guided_source_manifests(session_id,scope_hash,manifest,manifest_hash)"
                    + " VALUES (?,?,?::jsonb,?)",
                id,
                session.path("scopeHash").asText(),
                manifest.toString(),
                GuidedContracts.hash(manifest));
          } else if (!C.parse(existing.getFirst()).equals(manifest)) {
            throw new IllegalStateException(
                "Already frozen fixture source differs; no manifest rewrite permitted");
          }
          jdbc.update(
              "INSERT INTO studio_guided_translation_state(session_id) VALUES (?) ON"
                  + " CONFLICT(session_id) DO NOTHING",
              id);
          return manifest;
        });
  }

  /**
   * Original controlled metadata for the ordinary shared report fixture, before any action. All
   * values are read from actual fixture rows; ACK success is explicitly synthetic test input.
   */
  public static void captureSharedBootstrap(
      JdbcTemplate jdbc, TransactionTemplate tx, String id, JsonNode initial) {
    tx.executeWithoutResult(
        status -> {
          var sessions = new GuidedSessionRepository(jdbc, tx, C);
          var current = sessions.lock(id);
          JsonNode session = current.document();
          if (current.progress().has("translationBootstrap")
              || jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_actions WHERE session_id=?",
                      Integer.class,
                      id)
                  != 0
              || jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_preparations WHERE session_id=?",
                      Integer.class,
                      id)
                  != 0) {
            throw new IllegalStateException(
                "Shared original bootstrap must precede every action/preparation and cannot be"
                    + " replaced");
          }
          JsonNode material =
              C.parse(
                  jdbc.queryForObject(
                      "SELECT to_jsonb(m)::text FROM studio_guided_materializations m WHERE"
                          + " session_id=?",
                      String.class,
                      id));
          JsonNode inputs = material.path("authored_inputs");
          C.validate("v3/authored-inputs", inputs);
          C.validate("v3/execution-evidence", initial);
          String worker = session.path("owner").path("workerId").asText();
          int fence = session.path("owner").path("fence").asInt();
          if (!GuidedContracts.hash(inputs).equals(material.path("authored_inputs_hash").asText())
              || !material.path("scope_hash").equals(session.path("scopeHash"))
              || !material.path("worker_id").asText().equals(worker)
              || material.path("owner_fence").asInt() != fence
              || !initial.path("sessionId").asText().equals(id)
              || !initial.path("kind").asText().equals("initialBlank")
              || !initial.path("contextId").equals(material.path("context_id"))
              || initial.path("generation").asInt(-1) != 0) {
            throw new IllegalArgumentException(
                "Shared original bootstrap lacks its exact stored context authority");
          }
          ObjectNode context =
              C.object()
                  .put("schemaVersion", 3)
                  .put("sessionId", id)
                  .put("workerId", worker)
                  .put("ownerFence", fence)
                  .put("scopeHash", session.path("scopeHash").asText())
                  .put("contextId", material.path("context_id").asText())
                  .put("contextRevision", material.path("context_revision").asInt())
                  .put("materializationRevision", material.path("materialization_revision").asInt())
                  .put("authoredInputsHash", material.path("authored_inputs_hash").asText())
                  .put("expiresAt", session.path("expiresAt").asText())
                  .put("leaseExpiresAt", session.path("owner").path("leaseExpiresAt").asText());
          context.putObject("versions").put("contract", 3);
          context.set("authoredInputs", inputs.deepCopy());
          context.set("limits", session.path("limits").deepCopy());
          ArrayNode sourceIds = context.putArray("sourceStepIds");
          session.path("sourceSteps").forEach(step -> sourceIds.add(step.path("stepId")));
          for (String[] table :
              new String[][] {
                {"allocations", "studio_guided_allocations"},
                {"producers", "studio_guided_producers"},
                {"consumerEdges", "studio_guided_consumer_edges"}
              }) {
            ArrayNode values = context.putArray(table[0]);
            jdbc.queryForList(
                    "SELECT document::text FROM "
                        + table[1]
                        + " WHERE session_id=? ORDER BY document::text",
                    String.class,
                    id)
                .forEach(json -> values.add(C.parse(json)));
          }
          ObjectNode identity =
              C.object()
                  .put("workerId", worker)
                  .put("fence", fence)
                  .put("scopeHash", session.path("scopeHash").asText());
          for (String field : List.of("sourceRevision", "configurationRevision")) {
            JsonNode value =
                material.path(
                    field.equals("sourceRevision") ? "source_revision" : "configuration_revision");
            if (!value.equals(session.path("scope").path(field))) {
              throw new IllegalArgumentException("Shared bootstrap source/configuration differs");
            }
            context.set(field, value);
            identity.set(field, value);
          }
          C.validate("v3/runner-context", context);
          ObjectNode marker =
              current.progress().putObject("translationBootstrap").put("phase", "READY");
          marker.set("context", context);
          marker.set("identity", identity);
          marker
              .putObject("metadataAcknowledgement")
              .put("version", 2)
              .put("deliveryId", id + "-metadata")
              .put("contextHash", GuidedContracts.hash(context))
              .put("identityHash", GuidedContracts.hash(identity));
          ObjectNode receipt =
              current
                  .progress()
                  .putObject("translationBootstrapEvidence")
                  .put("contextId", context.path("contextId").asText())
                  .put("contextRevision", context.path("contextRevision").asInt())
                  .put("scopeHash", session.path("scopeHash").asText())
                  .put("workerId", worker)
                  .put("ownerFence", fence);
          receipt.set("sourceRevision", identity.path("sourceRevision"));
          receipt.set("configurationRevision", identity.path("configurationRevision"));
          current.progress().set("executionEvidence", initial.deepCopy());
          sessions.save(current);
        });
  }

  private record Exercise(ObjectNode coordinate, ObjectNode operation, int referenceIndex) {}

  /** The frozen step record (ADR-SC-008 D2): opaque code, what it captures and uses, its hash. */
  private static ObjectNode stepRecord(String code, ArrayNode uses) {
    ObjectNode operation = C.object().put("kind", "step").put("code", code);
    operation.putArray("captures");
    operation.set("uses", uses);
    operation.put("sourceHash", GuidedContracts.hash(operation.path("code")));
    return operation;
  }

  private static boolean usesSecret(JsonNode operation) {
    for (JsonNode use : operation.path("uses")) {
      if (use.path("kind").asText().equals("secret")) {
        return true;
      }
    }
    return false;
  }

  /**
   * Caller retains reserve/claim/finish/commit; this method only supplies complete exercised facts.
   */
  public static ObjectNode completeExistingSession(
      JdbcTemplate jdbc, TransactionTemplate tx, String id, PublicationContracts.Base base) {
    return completeExistingSession(jdbc, tx, id, base, false);
  }

  /**
   * Ordinary one-step navigation only; real V18 rows, complete current pure evidence projection.
   */
  public static ObjectNode completeHistoricalV18Session(
      JdbcTemplate jdbc, TransactionTemplate tx, String id, PublicationContracts.Base base) {
    requireV18(jdbc);
    return completeExistingSession(jdbc, tx, id, base, true);
  }

  private static ObjectNode completeExistingSession(
      JdbcTemplate jdbc,
      TransactionTemplate tx,
      String id,
      PublicationContracts.Base base,
      boolean historical) {
    return tx.execute(
        status -> {
          var sessions = new GuidedSessionRepository(jdbc, tx, C);
          var current = sessions.lock(id);
          ObjectNode session = current.document();
          if (!session.path("state").asText().equals("OBSERVING")) {
            throw new IllegalArgumentException("Evidence fixture must run before FINALIZING");
          }
          if (jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions WHERE session_id=?",
                  Integer.class,
                  id)
              != 0) {
            throw new IllegalStateException("Fixture evidence may be installed only once");
          }
          ObjectNode manifest =
              PublicationContracts.copy(
                  C.parse(
                      jdbc.queryForObject(
                          "SELECT manifest::text FROM studio_guided_source_manifests WHERE"
                              + " session_id=?",
                          String.class,
                          id)));
          if (historical
              && (manifest.path("sourceSteps").size() != 1
                  || !manifest.path("configurationReferences").isEmpty())) {
            throw new IllegalArgumentException(
                "Historical V18 adapter only supports its explicit one-step literal URL fixture");
          }
          String worker = session.path("owner").path("workerId").asText();
          int fence = session.path("owner").path("fence").asInt();
          if (worker.equals("unclaimed") || fence < 1) {
            throw new IllegalArgumentException("Fixture owner must be acquired first");
          }
          String contextId = id + "-context", scopeHash = session.path("scopeHash").asText();
          ObjectNode inputs =
              C.object()
                  .put("schemaVersion", 3)
                  .put("sessionId", id)
                  .put("scopeHash", scopeHash)
                  .put("sourceRevision", base.document().path("sourceRevision").asText())
                  .put(
                      "configurationRevision",
                      base.document().path("configurationRevision").asText());
          ArrayNode material = inputs.putArray("inputs"),
              references = C.object().putArray("references");
          List<Exercise> exercises = new ArrayList<>();
          String origin = null;
          int stepIndex = 0;
          for (JsonNode step : manifest.path("sourceSteps")) {
            String stepId = step.path("stepId").asText();
            // ADR-SC-008: one step is one action at ordinal 0; what it uses is named by `uses`.
            ArrayNode uses = C.object().putArray("uses");
            StringBuilder code = new StringBuilder();
            int stepReference = -1;
            if (stepIndex == 0) {
              var matcher = URL.matcher(step.path("text").asText());
              String destination;
              ObjectNode provenance;
              if (matcher.find()) {
                destination = matcher.group();
                provenance =
                    C.object()
                        .put("referenceKind", "sourceSpan")
                        .put("sourceRevision", base.document().path("sourceRevision").asText())
                        .put("stepId", stepId)
                        .put("startUtf16", matcher.start())
                        .put("endUtf16", matcher.end())
                        .put("kind", "destination");
              } else {
                JsonNode selected = null;
                for (JsonNode candidate : manifest.path("configurationReferences")) {
                  if (candidate.path("stepId").asText().equals(stepId)
                      && candidate.path("kind").asText().equals("destination")
                      && URL.matcher(
                              manifest
                                  .path("configurationValues")
                                  .path(candidate.path("referenceId").asText())
                                  .path("value")
                                  .asText(""))
                          .matches()) {
                    selected = candidate;
                    break;
                  }
                }
                if (selected == null) {
                  throw new IllegalArgumentException(
                      "First fixture step needs authored URL or explicit declared navigation"
                          + " context");
                }
                JsonNode value =
                    manifest
                        .path("configurationValues")
                        .path(selected.path("referenceId").asText())
                        .path("value");
                if (!value.isTextual()) {
                  throw new IllegalArgumentException(
                      "Declared fixture destination lacks exact value");
                }
                destination = value.asText();
                provenance =
                    PublicationContracts.copy(selected)
                        .put("referenceKind", "configuration")
                        .put(
                            "configurationRevision",
                            base.document().path("configurationRevision").asText());
                provenance.remove("referenceName");
              }
              URI uri = URI.create(destination);
              origin = uri.getScheme() + "://" + uri.getRawAuthority();
              if (!TestDomains.FIXTURES.allows(destination)) {
                throw new IllegalArgumentException("Fixture URL is outside the allowed domains");
              }
              String inputId = id + "-destination";
              int reference = references.size();
              references.add(provenance.deepCopy());
              ObjectNode input =
                  material
                      .addObject()
                      .put("inputId", inputId)
                      .put("sourceStepId", stepId)
                      .put("kind", "destination")
                      .put("value", destination);
              input.set("provenance", provenance);
              uses.addObject().put("kind", "input").put("id", inputId);
              code.append("await page.goto(inputs[\"").append(inputId).append("\"]);");
              stepReference = reference;
            }
            for (JsonNode configured : manifest.path("configurationReferences")) {
              if (!configured.path("stepId").asText().equals(stepId)
                  || !configured.path("kind").asText().equals("secretRef")) {
                continue;
              }
              String inputId = id + "-secret-" + material.size();
              ObjectNode provenance =
                  PublicationContracts.copy(configured)
                      .put("referenceKind", "configuration")
                      .put(
                          "configurationRevision",
                          base.document().path("configurationRevision").asText());
              int reference = references.size();
              references.add(provenance.deepCopy());
              ObjectNode input =
                  material
                      .addObject()
                      .put("inputId", inputId)
                      .put("sourceStepId", stepId)
                      .put("kind", "secretRef")
                      .put("secretId", configured.path("referenceName").asText());
              input.set("provenance", provenance);
              uses.addObject()
                  .put("kind", "secret")
                  .put("id", configured.path("referenceName").asText());
              code.append("await page.getByLabel(\"Password\").fill(secrets[\"")
                  .append(configured.path("referenceName").asText())
                  .append("\"]);");
              if (stepReference < 0) {
                stepReference = reference;
              }
            }
            for (JsonNode configured : manifest.path("configurationReferences")) {
              if (!configured.path("stepId").asText().equals(stepId)
                  || !configured.path("kind").asText().equals("nonsecretText")) {
                continue;
              }
              JsonNode value =
                  manifest
                      .path("configurationValues")
                      .path(configured.path("referenceId").asText())
                      .path("value");
              if (!value.isTextual()) {
                throw new IllegalArgumentException(
                    "Fixture plain assertion lacks exact authored value");
              }
              ObjectNode provenance =
                  PublicationContracts.copy(configured)
                      .put("referenceKind", "configuration")
                      .put(
                          "configurationRevision",
                          base.document().path("configurationRevision").asText());
              provenance.remove("referenceName");
              int reference = references.size();
              references.add(provenance.deepCopy());
              String inputId = id + "-plain-" + material.size();
              ObjectNode input =
                  material
                      .addObject()
                      .put("inputId", inputId)
                      .put("sourceStepId", stepId)
                      .put("kind", "nonsecretText")
                      .put("value", value.asText());
              input.set("provenance", provenance);
              uses.addObject().put("kind", "input").put("id", inputId);
              code.append("await expect(page).toHaveTitle(inputs[\"")
                  .append(inputId)
                  .append("\"]);");
              if (stepReference < 0) {
                stepReference = reference;
              }
            }
            if (code.length() == 0) {
              code.append("await page.keyboard.press(\"Enter\");");
            }
            exercises.add(
                new Exercise(
                    C.object().put("stepId", stepId).put("ordinal", 0),
                    stepRecord(code.toString(), uses),
                    stepReference));
            stepIndex++;
          }
          if (exercises.size() > 200) {
            throw new IllegalArgumentException("Fixture exceeds action budget");
          }
          ObjectNode plan = C.object();
          plan.set("sourceReferences", references);
          ArrayNode obligations = plan.putArray("obligations");
          plan.putArray("needs");
          for (int i = 0; i < exercises.size(); i++) {
            Exercise exercise = exercises.get(i);
            ObjectNode meaning =
                obligations
                    .addObject()
                    .put(
                        "obligationId",
                        UUID.nameUUIDFromBytes(
                                (id + ":obligation:" + i).getBytes(StandardCharsets.UTF_8))
                            .toString())
                    .put("stepId", exercise.coordinate().path("stepId").asText())
                    .put("occurrence", exercise.coordinate().path("ordinal").asInt())
                    .put("targetIntent", "page")
                    .putNull("scopeIntent")
                    .putNull("needId");
            meaning.putArray("uses");
            if (exercise.referenceIndex() < 0) {
              meaning.putNull("referenceIndex");
            } else {
              meaning.put("referenceIndex", exercise.referenceIndex());
            }
          }
          ArrayNode stepSections = plan.putArray("stepSections");
          for (JsonNode step : manifest.path("sourceSteps")) {
            stepSections
                .addObject()
                .put("stepId", step.path("stepId").asText())
                .putArray("sections");
          }
          com.citi.put.checks.studio.guided.translation.GuidedAcceptedPlan.validate(C, plan);
          if (jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_translation_plans WHERE session_id=?",
                  Integer.class,
                  id)
              != 0) {
            throw new IllegalStateException("Fixture may not overwrite an existing source plan");
          }
          jdbc.update(
              "INSERT INTO"
                  + " studio_guided_translation_plans(session_id,plan_revision,pa"
                  + "rent_revision,plan,plan_hash)"
                  + " VALUES (?,1,0,?::jsonb,?)",
              id,
              plan.toString(),
              GuidedContracts.hash(plan));
          jdbc.update(
              "UPDATE studio_guided_translation_state SET plan_revision=1,c"
                  + "ontinuation='OBSERVING'"
                  + " WHERE session_id=?",
              id);
          ObjectNode intent =
              C.object()
                  .put("sessionId", id)
                  .put("assignmentId", id + "-assignment")
                  .put("scopeHash", scopeHash)
                  .put("workerId", worker)
                  .put("expectedFence", fence - 1);
          jdbc.update(
              "INSERT INTO studio_guided_assignments(session_id,assignment_"
                  + "id,scope_hash,worker_id,"
                  + "expected_fence,intent) VALUES (?,?,?,?,?,?::jsonb)",
              id,
              id + "-assignment",
              scopeHash,
              worker,
              fence - 1,
              intent.toString());
          String inputsHash = GuidedContracts.hash(inputs);
          jdbc.update(
              "INSERT INTO"
                  + " studio_guided_materializations(session_id,scope_hash,contex"
                  + "t_id,context_revision,"
                  + "materialization_revision,worker_id,owner_fence,source_revisi"
                  + "on,configuration_revision,authored_inputs_hash,authored_inpu"
                  + "ts)"
                  + " VALUES (?,?,?,1,1,?,?,?,?,?,?::jsonb)",
              id,
              scopeHash,
              contextId,
              worker,
              fence,
              base.document().path("sourceRevision").asText(),
              base.document().path("configurationRevision").asText(),
              inputsHash,
              inputs.toString());
          ObjectNode initial = execution(id, contextId, id + "-blank", 0, null, null);
          ObjectNode context =
              C.object()
                  .put("schemaVersion", 3)
                  .put("sessionId", id)
                  .put("workerId", worker)
                  .put("ownerFence", fence)
                  .put("scopeHash", scopeHash)
                  .put("contextId", contextId)
                  .put("contextRevision", 1)
                  .put("materializationRevision", 1)
                  .put("authoredInputsHash", inputsHash);
          context.set("allocations", C.object().putArray("a"));
          context.set("authoredInputs", inputs);
          context
              .put("expiresAt", session.path("expiresAt").asText())
              .put("leaseExpiresAt", session.path("owner").path("leaseExpiresAt").asText());
          context.putObject("versions").put("contract", 3);
          ArrayNode sourceIds = context.putArray("sourceStepIds");
          manifest.path("sourceSteps").forEach(step -> sourceIds.add(step.path("stepId")));
          context.putArray("producers");
          context.putArray("consumerEdges");
          context.set("limits", session.path("limits"));
          ObjectNode identity =
              C.object().put("workerId", worker).put("fence", fence).put("scopeHash", scopeHash);
          for (String field : List.of("sourceRevision", "configurationRevision")) {
            identity.set(field, base.document().path(field));
            context.set(field, base.document().path(field));
          }
          C.validate("v3/runner-context", context);
          ObjectNode marker =
              current.progress().putObject("translationBootstrap").put("phase", "READY");
          marker.set("identity", identity);
          marker.set("context", context);
          marker
              .putObject("metadataAcknowledgement")
              .put("version", 2)
              .put("deliveryId", id + "-metadata")
              .put("contextHash", GuidedContracts.hash(context))
              .put("identityHash", GuidedContracts.hash(identity));
          ObjectNode receipt =
              current
                  .progress()
                  .putObject("translationBootstrapEvidence")
                  .put("contextId", contextId)
                  .put("contextRevision", 1)
                  .put("scopeHash", scopeHash)
                  .put("workerId", worker)
                  .put("ownerFence", fence);
          receipt.set("sourceRevision", base.document().path("sourceRevision"));
          receipt.set("configurationRevision", base.document().path("configurationRevision"));
          sessions.save(current);
          var evidence = new GuidedPublicationEvidenceRepository(jdbc, C);
          for (int i = 0; i < exercises.size(); i++) {
            Exercise exercise = exercises.get(i);
            String preparation = id + "-preparation-" + i, admission = id + "-admission-" + i;
            boolean first = i == 0, password = usesSecret(exercise.operation());
            ObjectNode observed =
                first ? null : observation(id, scopeHash, id + "-document", i, origin, password);
            ObjectNode execution =
                first
                    ? initial
                    : execution(
                        id, contextId, id + "-document", i, origin, GuidedContracts.hash(observed));
            ObjectNode proposal =
                C.object()
                    .put("schemaVersion", 3)
                    .put("sessionId", id)
                    .put("scopeHash", scopeHash)
                    .put("generation", i)
                    .put("evidenceHash", GuidedContracts.hash(execution))
                    .put("authoredInputsHash", inputsHash)
                    .put("contextRevision", 1);
            proposal.set("coordinate", exercise.coordinate());
            proposal.set("operation", exercise.operation());
            proposal.set("executionEvidence", execution);
            String digest = GuidedContracts.hash(proposal);
            ObjectNode proof =
                C.object()
                    .put("schemaVersion", 3)
                    .put("sessionId", id)
                    .put("workerId", worker)
                    .put("ownerFence", fence)
                    .put("scopeHash", scopeHash)
                    .put("contextId", contextId)
                    .put("contextRevision", 1)
                    .put("sourceRevision", base.document().path("sourceRevision").asText())
                    .put(
                        "configurationRevision",
                        base.document().path("configurationRevision").asText())
                    .put("preparationId", preparation)
                    .put("requestDigest", digest)
                    .put("evidenceHash", GuidedContracts.hash(execution))
                    .put("authoredInputsHash", inputsHash)
                    .put("expiresAt", PublicationContracts.time(Instant.now().plusSeconds(30)));
            proof.putObject("versions").put("contract", 3);
            current = sessions.lock(id);
            current.progress().set("executionEvidence", execution);
            if (observed != null) {
              current.progress().set("observation", observed);
              current.progress().put("observationHash", GuidedContracts.hash(observed));
            }
            sessions.save(current);
            jdbc.update(
                "INSERT INTO"
                    + " studio_guided_preparations(session_id,preparation_id,contex"
                    + "t_id,owner_fence,request_digest,proof,expires_at)"
                    + " VALUES (?,?,?,?,?,?::jsonb,?::timestamptz)",
                id,
                preparation,
                contextId,
                fence,
                digest,
                proof.toString(),
                proof.path("expiresAt").asText());
            evidence.capturePreparation(current, proposal, proof, Instant.now());
            ObjectNode operation = C.object();
            operation.set("coordinate", exercise.coordinate());
            operation.set("origin", execution.path("origin"));
            operation.set("operation", exercise.operation());
            ObjectNode ledger =
                C.object()
                    .put("schemaVersion", 3)
                    .put("sessionId", id)
                    .put("idempotencyKey", id + "-action-" + i)
                    .put("requestDigest", digest)
                    .put("scopeHash", scopeHash)
                    .put("operationHash", GuidedContracts.hash(operation))
                    .put("generation", i)
                    .put("documentId", execution.path("documentId").asText())
                    .put("ownerFence", fence)
                    .put("state", "SUCCEEDED")
                    .put("dispatchCount", 1)
                    .put("outcomeCode", "OK")
                    .put("evidenceHash", GuidedContracts.hash(execution))
                    .put("authoredInputsHash", inputsHash)
                    .put("contextRevision", 1)
                    .put("preparationId", preparation)
                    .put("attemptOrdinal", 0);
            ledger.set("coordinate", exercise.coordinate());
            ledger.set("executionEvidence", execution);
            ObjectNode decision =
                C.object().put("scopeHash", scopeHash).put("requestDigest", digest);
            decision.set("preparation", proof);
            ledger
                .putObject("admission")
                .put("admissionId", admission)
                .put(
                    "authorizationId",
                    session.path("runAuthorization").path("authorizationId").asText())
                .put("admittedAt", PublicationContracts.time(Instant.now()))
                .put("policyDecisionHash", GuidedContracts.hash(decision));
            if (historical) {
              // V18 has no SQL attempt_ordinal column. Validate the complete current pure document,
              // then insert through its actual historical table with every installed guard active.
              C.validate("v3/action", proposal);
              C.validate("v3/ledger", ledger);
              if (!GuidedContracts.hash(proposal).equals(ledger.path("requestDigest").asText())) {
                throw new IllegalStateException("Historical action digest mismatch");
              }
              jdbc.update(
                  "INSERT INTO"
                      + " studio_guided_actions(admission_id,session_id,step_id,ordin"
                      + "al,document,proposal)"
                      + " VALUES (?,?,?,?,?::jsonb,?::jsonb)",
                  admission,
                  id,
                  exercise.coordinate().path("stepId").asText(),
                  exercise.coordinate().path("ordinal").asInt(),
                  ledger.toString(),
                  proposal.toString());
            } else {
              sessions.insertAction(ledger, proposal);
            }
            jdbc.update(
                "UPDATE studio_guided_preparations SET admission_id=? WHERE session_id=? AND"
                    + " preparation_id=?",
                admission,
                id,
                preparation);
            JsonNode meaning = obligations.get(i);
            String attemptColumn = historical ? "" : ",attempt_ordinal",
                attemptValue = historical ? "" : ",0";
            jdbc.update(
                "INSERT INTO"
                    + " studio_guided_obligation_admissions(session_id,obligation_id,plan_revision,"
                    + "meaning,proposal,proposal_digest,admission_key,admission_id"
                    + attemptColumn
                    + ") VALUES (?,?,1,?::jsonb,?::jsonb,?,?,?"
                    + attemptValue
                    + ")",
                id,
                meaning.path("obligationId").asText(),
                meaning.toString(),
                proposal.toString(),
                digest,
                ledger.path("idempotencyKey").asText(),
                admission);
            evidence.attachAdmission(session, ledger, proposal, Instant.now());
          }
          current = sessions.lock(id);
          current.progress().put("stepIndex", session.path("sourceSteps").size());
          ((ObjectNode) current.document().path("counters"))
              .put("actions", exercises.size())
              .put("observations", exercises.size() - 1)
              .put(
                  "sanitizedEvidenceBytes",
                  jdbc.queryForObject(
                      "SELECT"
                          + " coalesce(sum(octet_length(convert_to(observation::text,'UTF8'))),0)::int"
                          + " FROM studio_guided_publication_observations WHERE session_id=?",
                      Integer.class,
                      id));
          sessions.save(current);
          var source =
              new GuidedPublicationBaseRepository(jdbc, C)
                  .lockCurrent(UUID.fromString(session.path("testId").asText()));
          var builder = new GuidedPlanBuilder(C);
          ObjectNode result =
              builder.basis(
                  base,
                  source,
                  historical ? readHistoricalV18(jdbc, id, manifest) : evidence.read(id),
                  current.document(),
                  builder.learningProvenance(manifest));
          jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
          return result;
        });
  }

  public static void requireV18(JdbcTemplate jdbc) {
    if (!jdbc.queryForObject(
            "SELECT count(*)=18 AND count(*) FILTER (WHERE success)=18 AN"
                + "D min(version::int)=1 AND"
                + " max(version::int)=18 AND count(DISTINCT version::int)=18 FROM"
                + " flyway_schema_history WHERE version IS NOT NULL",
            Boolean.class)
        || !jdbc.queryForObject(
            "SELECT current_setting('server_version_num')::integer BETWEE"
                + "N 150000 AND 159999 AND"
                + " current_setting('session_replication_role')='origin' AND NOT EXISTS(SELECT 1"
                + " FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'O' AND tgrelid IN"
                + " (SELECT oid FROM pg_class WHERE relnamespace=current_schema()::regnamespace))",
            Boolean.class)
        || jdbc.queryForObject(
            "SELECT to_regprocedure('studio_015_relearned_from(text)') IS NOT NULL OR "
                + "to_regclass('studio_guided_policies') IS NOT NULL OR "
                + "to_regclass('studio_guided_materialization_versions') IS NOT NULL OR "
                + "to_regclass('studio_guided_materialization_inputs') IS NOT NULL OR "
                + "to_regclass('studio_guided_relearn_plans') IS NOT NULL OR "
                + "to_regclass('studio_guided_relearn_switches') IS NOT NULL",
            Boolean.class)) {
      throw new IllegalArgumentException(
          "Historical publication adapter requires actual V18 and no later stores");
    }
  }

  private static PublicationContracts.Evidence readHistoricalV18(
      JdbcTemplate jdbc, String id, ObjectNode manifest) {
    requireV18(jdbc);
    ObjectNode raw = C.object(), safeManifest = manifest.deepCopy();
    safeManifest.remove("configurationValues");
    raw.set("sourceManifest", safeManifest);
    ObjectNode snapshot = raw.putObject("snapshotEvidence").put("schemaVersion", 3);
    ObjectNode identity = snapshot.putObject("current").put("authoringIdentityVersion", 1);
    identity.set("authoring", manifest.path("authoringSnapshot"));
    identity.set("authoredDeclarations", manifest.path("authoredDeclarations"));
    snapshot.putNull("pinnedBase").putNull("baseProof");
    var plan =
        jdbc.queryForMap(
            "SELECT p.plan_revision,p.plan::text,p.plan_hash FROM studio_"
                + "guided_translation_state s"
                + " JOIN studio_guided_translation_plans p USING(session_id,plan_revision) WHERE"
                + " s.session_id=?",
            id);
    JsonNode planBody = C.parse((String) plan.get("plan"));
    com.citi.put.checks.studio.guided.translation.GuidedAcceptedPlan.validate(C, planBody);
    if (!GuidedContracts.hash(planBody).equals(plan.get("plan_hash"))) {
      throw new IllegalStateException("Historical plan preimage mismatch");
    }
    raw.put("translationRevision", plan.get("plan_revision").toString())
        .put("translationHash", (String) plan.get("plan_hash"));
    raw.set("translationPlan", planBody);
    var m =
        jdbc.queryForMap(
            "SELECT"
                + " context_id,context_revision,materialization_revision,worker"
                + "_id,owner_fence,source_revision,configuration_revision,autho"
                + "red_inputs_hash,authored_inputs::text,scope_hash"
                + " FROM studio_guided_materializations WHERE session_id=?",
            id);
    JsonNode full = C.parse((String) m.get("authored_inputs"));
    C.validate("v3/authored-inputs", full);
    if (!GuidedContracts.hash(full).equals(m.get("authored_inputs_hash"))
        || ((Number) m.get("context_revision")).intValue() != 1) {
      throw new IllegalStateException("Historical materialization preimage mismatch");
    }
    ObjectNode material =
        raw.putObject("materialization")
            .put("contextId", (String) m.get("context_id"))
            .put("contextRevision", 1)
            .put("materializationRevision", ((Number) m.get("materialization_revision")).intValue())
            .put("workerId", (String) m.get("worker_id"))
            .put("ownerFence", ((Number) m.get("owner_fence")).intValue())
            .put("authoredInputsHash", (String) m.get("authored_inputs_hash"));
    ArrayNode safeInputs = material.putArray("inputs");
    ObjectNode materialEvidence = raw.putObject("materializationEvidence");
    ObjectNode version =
        materialEvidence
            .putArray("versions")
            .addObject()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("scopeHash", (String) m.get("scope_hash"))
            .put("contextId", (String) m.get("context_id"))
            .put("contextRevision", 1)
            .put("workerId", (String) m.get("worker_id"))
            .put("ownerFence", ((Number) m.get("owner_fence")).intValue())
            .put("sourceRevision", (String) m.get("source_revision"))
            .put("configurationRevision", (String) m.get("configuration_revision"))
            .put("authoredInputsHash", (String) m.get("authored_inputs_hash"))
            .put(
                "birthMaterializationRevision",
                ((Number) m.get("materialization_revision")).intValue())
            .put("inputCount", full.path("inputs").size())
            .putNull("previousInputsHash");
    ArrayNode entries = materialEvidence.putArray("entries");
    int ordinal = 0;
    for (JsonNode input : full.path("inputs")) {
      ObjectNode safe = PublicationContracts.copy(input);
      safe.remove("value");
      safeInputs.add(safe);
      entries
          .addObject()
          .put("inputOrdinal", ordinal++)
          .put("inputId", input.path("inputId").asText())
          .put("introducedContextRevision", 1)
          .put("inputHash", GuidedContracts.hash(input))
          .set("metadata", safe);
    }
    C.validate("v3/replay-validation#/definitions/MaterializationEvidence", materialEvidence);
    ArrayNode preps = raw.putArray("preparations");
    jdbc.query(
            "SELECT"
                + " preparation_id,proposal::text,proof::text,execution_evidenc"
                + "e::text,observation_hash,materialization_revision"
                + " FROM studio_guided_publication_preparations WHERE session_id=? ORDER BY "
                + "preparation_id",
            (rs, n) -> {
              ObjectNode out =
                  C.object()
                      .put("preparationId", rs.getString(1))
                      .put("observationHash", rs.getString(5))
                      .put("materializationRevision", rs.getInt(6));
              out.set("proposal", C.parse(rs.getString(2)));
              out.set("proof", C.parse(rs.getString(3)));
              out.set("executionEvidence", C.parse(rs.getString(4)));
              return out;
            },
            id)
        .forEach(preps::add);
    ArrayNode admissions = raw.putArray("admissionAssociations");
    jdbc.query(
            "SELECT obligation_id,preparation_id,admission_id,proposal_hash FROM "
                + "studio_guided_publication_admissions WHERE session_id=? ORDER BY admission_id",
            (rs, n) ->
                C.object()
                    .put("obligationId", rs.getString(1))
                    .put("preparationId", rs.getString(2))
                    .put("admissionId", rs.getString(3))
                    .put("proposalHash", rs.getString(4)),
            id)
        .forEach(admissions::add);
    ArrayNode obligations = raw.putArray("obligationAssociations");
    jdbc.query(
            "SELECT"
                + " obligation_id,meaning::text,proposal::text,proposal_digest,"
                + "admission_id,plan_revision"
                + " FROM studio_guided_obligation_admissions WHERE session_id=? ORDER BY"
                + " obligation_id",
            (rs, n) -> {
              ObjectNode out =
                  C.object()
                      .put("obligationId", rs.getString(1))
                      .put("proposalDigest", rs.getString(4))
                      .put("admissionId", rs.getString(5))
                      .put("planRevision", rs.getLong(6));
              out.set("meaning", C.parse(rs.getString(2)));
              out.set("proposal", C.parse(rs.getString(3)));
              return out;
            },
            id)
        .forEach(obligations::add);
    for (String[] table :
        new String[][] {
          {"actions", "studio_guided_actions"},
          {"allocations", "studio_guided_allocations"},
          {"producers", "studio_guided_producers"},
          {"consumerEdges", "studio_guided_consumer_edges"}
        }) {
      ArrayNode array = raw.putArray(table[0]);
      jdbc.queryForList(
              "SELECT document::text FROM "
                  + table[1]
                  + " WHERE session_id=? ORDER BY document::text",
              String.class,
              id)
          .forEach(json -> array.add(C.parse(json)));
    }
    // The adapter deliberately supports exactly the one initial-blank navigation persisted above.
    if (raw.path("actions").size() != 1
        || preps.size() != 1
        || admissions.size() != 1
        || obligations.size() != 1
        || jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_publication_observations WHERE session_id=?",
                Integer.class,
                id)
            != 0) {
      throw new IllegalStateException("Historical V18 fixture scope exceeded");
    }
    raw.putArray("observations");
    raw.putArray("sourceSelections");
    raw.putNull("incrementalEvidence");
    JsonNode progress =
        C.parse(
            jdbc.queryForObject(
                "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id));
    ObjectNode bootstrap = raw.putObject("bootstrap");
    bootstrap.set("marker", progress.path("translationBootstrap").deepCopy());
    bootstrap.set("receipt", progress.path("translationBootstrapEvidence").deepCopy());
    JsonNode initial = null;
    for (JsonNode prepared : preps) {
      if (prepared.path("executionEvidence").path("kind").asText().equals("initialBlank")) {
        if (initial != null && !initial.equals(prepared.path("executionEvidence"))) {
          throw new IllegalStateException(
              "Historical fixture has inconsistent original blank evidence");
        }
        initial = prepared.path("executionEvidence");
      }
    }
    if (initial == null) {
      throw new IllegalStateException("Historical fixture lacks captured original blank evidence");
    }
    C.validate("v3/execution-evidence", initial);
    bootstrap.set("initialEvidence", initial.deepCopy());
    return new PublicationContracts.Evidence(raw);
  }

  private static ObjectNode observation(
      String session,
      String scope,
      String document,
      int generation,
      String origin,
      boolean password) {
    // ADR-SC-007: an outline plus a facts table; these exercises act on the page or a password
    // control, so no element is shown (a password control is a line without a ref).
    var builder = ObservationFixtures.observation().coverage(0, 0, password ? 1 : 0);
    if (password) {
      builder.line("  - passwordControl");
    }
    ObjectNode out = builder.build();
    out.put("sessionId", session)
        .put("documentId", document)
        .put("generation", generation)
        .put("origin", origin)
        .put("scopeHash", scope)
        .put("observedAt", PublicationContracts.time(Instant.now()));
    return out;
  }

  private static ObjectNode execution(
      String session,
      String context,
      String document,
      int generation,
      String origin,
      String observation) {
    ObjectNode out =
        C.object()
            .put("kind", observation == null ? "initialBlank" : "observedDocument")
            .put("sessionId", session)
            .put("contextId", context)
            .put("documentId", document)
            .put("generation", generation);
    if (observation == null) {
      out.put("creationId", session + "-creation")
          .put("bootstrapId", session + "-bootstrap")
          .put("url", "about:blank")
          .putNull("origin");
    } else {
      out.put("origin", origin).put("observationHash", observation);
    }
    return out;
  }
}
