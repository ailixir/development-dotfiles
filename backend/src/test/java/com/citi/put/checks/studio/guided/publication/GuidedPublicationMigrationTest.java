package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

public class GuidedPublicationMigrationTest {
  static final GuidedContracts C = new GuidedContracts();

  /** Positive current fixture only; historical tuples remain literal independent negatives. */
  static ObjectNode currentProfile() {
    try {
      var schema =
          C.parse(
              Files.readString(
                  Path.of(
                      "../docs/specs/studio-observed-authoring/contracts/v3/replay-profile.schema.json")));
      var profile = C.object();
      schema
          .path("properties")
          .fields()
          .forEachRemaining(field -> profile.set(field.getKey(), field.getValue().path("const")));
      return profile;
    } catch (java.io.IOException failure) {
      throw new IllegalStateException("Current profile fixture unavailable", failure);
    }
  }

  static final class Database implements AutoCloseable {
    final TestPostgresDatabase pg = new TestPostgresDatabase();
    final JdbcTemplate jdbc;
    final TransactionTemplate tx;
    final GuidedPublicationBaseRepository bases;
    final GuidedPublicationRepository publications;
    final GuidedPublicationEvidenceRepository evidence;
    final GuidedSessionRepository sessions;
    final UUID testId;
    final UUID stepId = UUID.randomUUID();
    private UUID prefixWriteRevision;
    private java.util.function.BiConsumer<JsonNode, JsonNode> directPreparationStore;
    final ObjectNode session;
    final String sourceText;
    private boolean ownsContainer = true;
    private ObjectNode sharedBasis;
    private ObjectNode exercisedBasis;
    private ObjectNode sharedPrivateInputs;
    private List<com.citi.put.checks.studio.dto.StudioVariable> sharedVariables;
    private String fixtureSession = "session";
    java.util.function.Consumer<ObjectNode> producerDocumentMutation;
    java.util.function.Consumer<ObjectNode> obligationMeaningMutation;

    Database() {
      this(List.of());
    }

    /**
     * A fresh database at the forward migration head (core V1–V11, observed V12–V21). Historical
     * V11/V18 upgrade assertions below retain their explicit targets.
     */
    Database(List<String> secretIds) {
      testId = UUID.randomUUID();
      for (String id : secretIds) {
        if (!com.citi.put.checks.studio.secrets.StudioVaultProvider.isValidSecretName(id)) {
          throw new IllegalArgumentException("Invalid fixture declaration");
        }
      }
      sourceText =
          "Open https://orders.example.test/start"
              + secretIds.stream()
                  .map(id -> " Enter <secret " + id + "> as password.")
                  .collect(java.util.stream.Collectors.joining());
      pg.start();
      var ds = new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
      jdbc = new JdbcTemplate(ds);
      tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
      Flyway.configure().dataSource(ds).load().migrate();
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES ('owner','owner','owner@example.test')");
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
              + " VALUES ('CSI','test','unit','LOW','owner@example.test','Development')");
      try {
        var a =
            new AuthoringV2Request(
                2,
                null,
                List.of(
                    new AuthoringStep(
                        stepId,
                        sourceText,
                        new com.citi.put.checks.studio.dto.StepAuthoringContext(
                            List.of(
                                new com.citi.put.checks.studio.dto.VariableReference(
                                    "fixture-private")),
                            List.of()))));
        var m = new ObjectMapper().findAndRegisterModules();
        jdbc.update(
            "INSERT INTO"
                + " ui_tests(id,name,csi_id,environment,browser,steps,created_by,authoring,authoring_revision_inputs)"
                + " VALUES"
                + " (?,'test','CSI','Development','chromium',?::jsonb,'owner@example.test',?::jsonb,?::jsonb)",
            testId,
            m.writeValueAsString(List.of(sourceText)),
            m.writeValueAsString(a),
            m.writeValueAsString(
                AuthoringRevisionIdentity.create(
                    a, Map.of("fixture-private", "saved-value-canary"))));
      } catch (Exception e) {
        throw new IllegalStateException(e);
      }
      var variableDeclarations = C.object().putArray("declarations");
      variableDeclarations
          .addObject()
          .put("name", "fixture-private")
          .put("kind", "plain")
          .put("value", "saved-value-canary");
      secretIds.forEach(
          id ->
              variableDeclarations
                  .addObject()
                  .put("name", id)
                  .put("kind", "secretRef")
                  .put("secretId", id));
      jdbc.update(
          "UPDATE ui_tests SET variables=?::jsonb WHERE id=?",
          variableDeclarations.toString(),
          testId);
      sessions = new GuidedSessionRepository(jdbc, tx, C);
      bases = new GuidedPublicationBaseRepository(jdbc, C);
      publications = new GuidedPublicationRepository(jdbc, C);
      evidence = new GuidedPublicationEvidenceRepository(jdbc, C);
      session =
          C.object()
              .put("sessionId", "session")
              .put("testId", testId.toString())
              .put("state", "PREPARING")
              .put("expiresAt", Instant.now().plusSeconds(600).toString());
      var scope =
          session
              .putObject("scope")
              .put("principalId", "owner@example.test")
              .put("csiId", "CSI")
              .put("sourceRevision", "1")
              .put("configurationRevision", "1");
      ordinaryScope(scope, "Development");
      session.put("scopeHash", GuidedContracts.hash(scope));
      session
          .putObject("owner")
          .put("workerId", "unclaimed")
          .put("fence", 0)
          .put("leaseExpiresAt", Instant.now().toString());
      session
          .putObject("runAuthorization")
          .put("authorizationId", UUID.randomUUID().toString())
          .put("kind", "scopedRun")
          .put("principalId", "owner@example.test")
          .put("scopeHash", session.path("scopeHash").asText())
          .put("authorizedAt", Instant.now().toString());
      session
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", stepId.toString())
          .put("requiresAssertion", false);
      tx.executeWithoutResult(
          s -> {
            completeSessionMetadata(session);
            sessions.insert(session);
            com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture.freezeSource(
                jdbc, tx, session);
          });
    }

    /** Uses the existing Spring transaction context; never migrates or owns its datasource. */
    Database(
        JdbcTemplate sharedJdbc,
        TransactionTemplate sharedTransactions,
        String namespace,
        ObjectNode canonicalBasis) {
      this(sharedJdbc, sharedTransactions, namespace, canonicalBasis, null, null);
    }

    /** Controlled replay fixture: reuse the real test and pin its already-published revision. */
    Database(
        JdbcTemplate sharedJdbc,
        TransactionTemplate sharedTransactions,
        String namespace,
        ObjectNode canonicalBasis,
        UUID existingTestId,
        UUID prefixRevision) {
      testId = existingTestId == null ? UUID.randomUUID() : existingTestId;
      prefixWriteRevision = prefixRevision;
      if (namespace == null || !namespace.matches("[A-Za-z0-9_-]{1,100}")) {
        throw new IllegalArgumentException("Invalid fixture namespace");
      }
      ownsContainer = false;
      fixtureSession = namespace;
      jdbc = sharedJdbc;
      tx = sharedTransactions;
      sharedBasis = canonicalBasis.deepCopy();
      sharedBasis.put("sessionId", fixtureSession).put("testId", testId.toString());
      var source = C.object().putArray("source");
      var mapper = new ObjectMapper().findAndRegisterModules();
      AuthoringV2Request authoring;
      try {
        if (!sharedBasis.path("snapshotEvidence").path("current").path("authoring").isObject()
            || !sharedBasis.path("incrementalEvidence").isNull()) {
          throw new IllegalArgumentException(
              "Shared report fixture requires a complete ordinary corrected basis");
        }
        authoring =
            mapper.treeToValue(
                sharedBasis.path("snapshotEvidence").path("current").path("authoring"),
                AuthoringV2Request.class);
      } catch (java.io.IOException failure) {
        throw new IllegalStateException("Corrected fixture authoring unavailable", failure);
      }
      var authored = authoring.steps();
      if (authored.isEmpty() || authored.size() != sharedBasis.path("sourceSteps").size()) {
        throw new IllegalArgumentException("Missing or mismatched observed source");
      }
      for (int index = 0; index < authored.size(); index++) {
        var step = authored.get(index);
        JsonNode expected = sharedBasis.path("sourceSteps").get(index);
        if (!step.id().toString().equals(expected.path("stepId").asText())
            || !step.text().equals(expected.path("source").asText())) {
          throw new IllegalArgumentException(
              "Fixture source must agree with its frozen snapshotEvidence");
        }
        source.add(step.text());
      }
      sourceText = authored.getFirst().text();
      sharedVariables = sharedFixtureVariables(sharedBasis);
      var currentIdentity =
          com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
              authoring, sharedVariables);
      if (!currentIdentity
          .references()
          .path("authoredDeclarations")
          .equals(
              sharedBasis.path("snapshotEvidence").path("current").path("authoredDeclarations"))) {
        throw new IllegalArgumentException(
            "Fixture declarations do not match complete authored identity");
      }
      String csi = sharedBasis.path("csiId").asText();
      String environment = sharedBasis.path("replayRequirements").path("environment").asText();
      ((ObjectNode) sharedBasis.path("replayRequirements")).put("csiId", csi);
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING",
          "fixture-" + namespace,
          "Report fixture",
          "owner@example.test");
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) "
              + ("VALUES (?,'Report fixture','unit','LOW','owner@example.test',"
                  + "'Development') ON CONFLICT(id) DO NOTHING"),
          csi);
      try {
        if (existingTestId == null) {
          jdbc.update(
              ("INSERT INTO ui_tests(id,name,csi_id,environment,browser,"
                      + "viewport_width,viewport_height,timeout_seconds,wait_strategy,"
                      + "steps,created_by,authoring,authoring_revision_inputs,variables) ")
                  + "VALUES (?,'Observed report fixture',?,?,?,"
                  + " ?,?,?,?,?::jsonb,'owner@example.test',?::jsonb,?::jsonb,?::jsonb)",
              testId,
              csi,
              environment,
              sharedBasis.path("configuration").path("browser").asText(),
              sharedBasis.path("configuration").path("viewport").path("width").asInt(),
              sharedBasis.path("configuration").path("viewport").path("height").asInt(),
              sharedBasis.path("configuration").path("timeoutSeconds").asInt(),
              sharedBasis.path("configuration").path("waitStrategy").asText(),
              source.toString(),
              mapper.writeValueAsString(authoring),
              mapper.writeValueAsString(currentIdentity.inputs()),
              mapper.writeValueAsString(sharedVariables));
        }
      } catch (java.io.IOException failure) {
        throw new IllegalStateException("Observed fixture source unavailable", failure);
      }
      sessions = new GuidedSessionRepository(jdbc, tx, C);
      bases = new GuidedPublicationBaseRepository(jdbc, C);
      publications = new GuidedPublicationRepository(jdbc, C);
      evidence = new GuidedPublicationEvidenceRepository(jdbc, C);
      session =
          C.object()
              .put("sessionId", fixtureSession)
              .put("testId", testId.toString())
              .put("state", "PREPARING")
              .put("expiresAt", Instant.now().plusSeconds(600).toString());
      session
          .putObject("limits")
          .put("maxActions", 200)
          .put("maxStatementsPerStep", 8)
          .put("maxObservations", 400);
      session
          .putObject("counters")
          .put("modelProposals", 0)
          .put("modelInputTokens", 0)
          .put("modelOutputTokens", 0);
      ObjectNode scope = sharedBasis.path("scope").deepCopy();
      scope
          .put("principalId", "owner@example.test")
          .put("csiId", csi)
          .put("sourceRevision", "1")
          .put("configurationRevision", "1");
      if (existingTestId != null) {
        scope.put(
            "sourceRevision",
            jdbc.queryForObject(
                "SELECT source_revision::text FROM ui_tests WHERE id=?", String.class, testId));
        scope.put(
            "configurationRevision",
            jdbc.queryForObject(
                "SELECT configuration_revision::text FROM ui_tests WHERE id=?",
                String.class,
                testId));
      }
      session.set("scope", scope);
      session.put("scopeHash", GuidedContracts.hash(scope));
      sharedBasis.set("scope", scope.deepCopy());
      session
          .putObject("owner")
          .put("workerId", "unclaimed")
          .put("fence", 0)
          .put("leaseExpiresAt", Instant.now().toString());
      session
          .putObject("runAuthorization")
          .put("authorizationId", UUID.randomUUID().toString())
          .put("kind", "scopedRun")
          .put("principalId", "owner@example.test")
          .put("scopeHash", GuidedContracts.hash(scope))
          .put("authorizedAt", Instant.now().toString());
      var steps = session.putArray("sourceSteps");
      authored.forEach(
          step ->
              steps
                  .addObject()
                  .put("stepId", step.id().toString())
                  .put("requiresAssertion", false));
      if (prefixWriteRevision != null) {
        session.put("baseRevisionId", prefixWriteRevision.toString());
        session.put("firstLearnStepId", authored.getLast().id().toString());
      }
      tx.executeWithoutResult(
          status -> {
            completeSessionMetadata(session);
            sessions.insert(session);
            // Freeze actual classifier output, schema provenance, private values and identity
            // before
            // Base.capture. The caller's canonical document is only a synthetic before-image.
            ObjectNode manifest =
                com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture.freezeSource(
                    jdbc, tx, session);
            rebindSharedBasis(canonicalBasis, manifest);
          });
    }

    private void rebindSharedBasis(ObjectNode original, ObjectNode manifest) {
      if (original.path("materializationEvidence").path("versions").size() != 1
          || original
                  .path("materializationEvidence")
                  .path("versions")
                  .get(0)
                  .path("contextRevision")
                  .asInt()
              != 1) {
        throw new IllegalArgumentException(
            "Shared ordinary report fixture requires its single initial materialization version");
      }
      java.util.Map<String, String> admissions = new java.util.HashMap<>();
      for (JsonNode action : original.path("actions")) {
        String id = action.path("ledger").path("admission").path("admissionId").asText();
        admissions.put(id, fixtureSession + "-" + id);
      }
      rebindIdentities(sharedBasis, original, admissions);
      sharedBasis.set("scope", session.path("scope").deepCopy());
      sharedBasis.set("runAuthorization", session.path("runAuthorization").deepCopy());
      // First prove every original private document against its canonical inputHash. Only then
      // map its configuration references to exact classifier facts and hash the new before-image.
      sharedPrivateInputs =
          privateFixtureInputs(sharedBasis, fixtureSession, session.path("scopeHash").asText());
      if (prefixWriteRevision != null) {
        // Verify the original private hashes first; then rebind only version identity to the
        // actual appended draft, before recomputing the fresh input document hashes below.
        rebindFixtureRevisions(sharedBasis);
        rebindFixtureRevisions(sharedPrivateInputs);
      }
      rebindClassifiedReferences(sharedBasis, original.path("configurationReferences"), manifest);
      rebindClassifiedReferences(
          sharedPrivateInputs, original.path("configurationReferences"), manifest);
      for (JsonNode raw : sharedBasis.path("configurationReferences")) {
        ObjectNode reference = (ObjectNode) raw;
        reference.put(
            "referenceId",
            classifiedReference(reference, original.path("configurationReferences"), manifest)
                .path("referenceId")
                .asText());
      }
      for (int index = 0; index < sharedPrivateInputs.path("inputs").size(); index++) {
        JsonNode input = sharedPrivateInputs.path("inputs").get(index);
        ObjectNode entry =
            (ObjectNode) sharedBasis.path("materializationEvidence").path("entries").get(index);
        if (!entry.path("inputId").equals(input.path("inputId"))) {
          throw new IllegalArgumentException("Fixture input order changed");
        }
        ObjectNode safe = PublicationContracts.copy(input);
        safe.remove("value");
        entry.set("metadata", safe);
        entry.put("inputHash", GuidedContracts.hash(input));
      }
      C.validate("v3/authored-inputs", sharedPrivateInputs);
      ObjectNode safeManifest = manifest.deepCopy();
      safeManifest.remove("configurationValues");
      sharedBasis.put("sourceManifestHash", GuidedContracts.hash(safeManifest));
      sharedBasis.set("learningProvenance", new GuidedPlanBuilder(C).learningProvenance(manifest));
      sharedBasis.put("translationHash", GuidedContracts.hash(sharedBasis.path("translationPlan")));
      com.citi.put.checks.studio.guided.translation.GuidedAcceptedPlan.validate(
          C, sharedBasis.path("translationPlan"));
      String inputHash = GuidedContracts.hash(sharedPrivateInputs);
      sharedBasis.put("authoredInputsHash", inputHash);
      for (JsonNode raw : sharedBasis.path("materializationEvidence").path("versions")) {
        ((ObjectNode) raw).put("authoredInputsHash", inputHash);
      }
      var observationHashes = new java.util.HashMap<String, String>();
      for (JsonNode raw : sharedBasis.path("observations")) {
        ObjectNode observation = (ObjectNode) raw;
        String old = observation.path("observationHash").asText();
        String fresh = GuidedContracts.hash(observation.path("observation"));
        observation.put("observationHash", fresh);
        observationHashes.put(old, fresh);
      }
      replaceHashReferences(sharedBasis, "observationHash", observationHashes);
      var prepared = new java.util.HashMap<String, ObjectNode>();
      for (JsonNode raw : sharedBasis.path("preparations")) {
        ObjectNode fact = (ObjectNode) raw,
            proposal = (ObjectNode) fact.path("proposal"),
            proof = (ObjectNode) fact.path("proof");
        proposal
            .put("authoredInputsHash", inputHash)
            .put("evidenceHash", GuidedContracts.hash(proposal.path("executionEvidence")));
        proof
            .put("authoredInputsHash", inputHash)
            .put("evidenceHash", proposal.path("evidenceHash").asText())
            .put("requestDigest", GuidedContracts.hash(proposal))
            .put("expiresAt", Instant.now().plusSeconds(60).toString());
        fact.set("executionEvidence", proposal.path("executionEvidence").deepCopy());
        prepared.put(fact.path("preparationId").asText(), fact);
      }
      var proposalHashes = new java.util.HashMap<String, String>();
      for (JsonNode raw : sharedBasis.path("actions")) {
        ObjectNode action = (ObjectNode) raw, ledger = (ObjectNode) action.path("ledger");
        ObjectNode preparation = prepared.get(action.path("preparationId").asText());
        if (preparation == null
            || !ledger.path("state").asText().equals("SUCCEEDED")
            || ledger.path("dispatchCount").asInt() != 1) {
          throw new IllegalArgumentException(
              "Shared positive fixture requires exact successful action/preparation facts");
        }
        JsonNode proposal = preparation.path("proposal");
        ledger
            .put("authoredInputsHash", inputHash)
            .put("evidenceHash", proposal.path("evidenceHash").asText())
            .put("requestDigest", GuidedContracts.hash(proposal))
            .put("attemptOrdinal", 0);
        ledger.set("executionEvidence", proposal.path("executionEvidence").deepCopy());
        ObjectNode operation = C.object();
        operation.set("coordinate", proposal.path("coordinate"));
        operation.set(
            "origin",
            proposal.path("executionEvidence").path("origin").isMissingNode()
                ? com.fasterxml.jackson.databind.node.NullNode.instance
                : proposal.path("executionEvidence").path("origin"));
        // ADR-SC-008: the identity is {coordinate, origin, operation}; the step has no target.
        operation.set("operation", proposal.path("operation"));
        ledger.put("operationHash", GuidedContracts.hash(operation));
        ObjectNode decision =
            C.object()
                .put("scopeHash", session.path("scopeHash").asText())
                .put("requestDigest", GuidedContracts.hash(proposal));
        decision.set("preparation", preparation.path("proof"));
        ((ObjectNode) ledger.path("admission"))
            .put(
                "authorizationId",
                session.path("runAuthorization").path("authorizationId").asText())
            .put("admittedAt", PublicationContracts.time(Instant.now()))
            .put("policyDecisionHash", GuidedContracts.hash(decision));
        proposalHashes.put(
            ledger.path("admission").path("admissionId").asText(), GuidedContracts.hash(proposal));
      }
      for (JsonNode raw : sharedBasis.path("obligationAssociations")) {
        ObjectNode association = (ObjectNode) raw;
        String digest = proposalHashes.get(association.path("admissionId").asText());
        if (digest == null) {
          throw new IllegalArgumentException("Fixture association lacks its real admission");
        }
        association.put("proposalHash", digest);
      }
      ((ObjectNode) sharedBasis.path("bootstrap"))
          .put("inputsHash", inputHash)
          .put("allocationHash", GuidedContracts.hash(sharedBasis.path("allocations")));
      if (!sharedBasis.path("preparations").isEmpty()) {
        ((ObjectNode) sharedBasis.path("bootstrap"))
            .set(
                "initialEvidence",
                sharedBasis.path("preparations").get(0).path("executionEvidence").deepCopy());
      }
    }

    private JsonNode classifiedReference(
        JsonNode reference, JsonNode originalDeclarations, JsonNode manifest) {
      String previous = reference.path("referenceId").asText(),
          name = reference.path("referenceName").asText();
      if (name.isEmpty()) {
        for (JsonNode declared : originalDeclarations) {
          if (declared.path("referenceId").asText().equals(previous)) {
            name = declared.path("referenceName").asText();
          }
        }
      }
      if (name.isEmpty()) {
        for (var variable : sharedVariables) {
          if (variable.name().equals(previous)) {
            name = variable.name();
          }
        }
      }
      if (name.isEmpty()) {
        for (JsonNode actual : manifest.path("configurationReferences")) {
          if (actual.path("referenceId").asText().equals(previous)) {
            name = actual.path("referenceName").asText();
          }
        }
      }
      JsonNode found = null;
      for (JsonNode actual : manifest.path("configurationReferences")) {
        if (actual.path("referenceName").asText().equals(name)
            && actual.path("stepId").equals(reference.path("stepId"))
            && actual.path("kind").equals(reference.path("kind"))
            && actual.path("intendedSlot").equals(reference.path("intendedSlot"))) {
          if (found != null) {
            throw new IllegalArgumentException("Ambiguous classified fixture reference");
          }
          found = actual;
        }
      }
      if (found == null) {
        throw new IllegalArgumentException(
            "Fixture reference lacks its exact classified declaration: " + previous);
      }
      return found;
    }

    private void rebindClassifiedReferences(
        JsonNode node, JsonNode originalDeclarations, JsonNode manifest) {
      if (node.isArray()) {
        node.forEach(child -> rebindClassifiedReferences(child, originalDeclarations, manifest));
        return;
      }
      if (!node.isObject()) {
        return;
      }
      ObjectNode object = (ObjectNode) node;
      if (object.path("referenceKind").asText().equals("configuration")) {
        object.put(
            "referenceId",
            classifiedReference(object, originalDeclarations, manifest)
                .path("referenceId")
                .asText());
      }
      object
          .elements()
          .forEachRemaining(
              child -> rebindClassifiedReferences(child, originalDeclarations, manifest));
    }

    private void rebindFixtureRevisions(JsonNode node) {
      if (node.isArray()) {
        node.forEach(this::rebindFixtureRevisions);
      } else if (node.isObject()) {
        var object = (ObjectNode) node;
        for (String field : List.of("sourceRevision", "configurationRevision")) {
          if (object.path(field).isTextual()) {
            object.set(field, session.path("scope").path(field));
          }
        }
        object.elements().forEachRemaining(this::rebindFixtureRevisions);
      }
    }

    private void rebindIdentities(
        JsonNode node, JsonNode original, java.util.Map<String, String> admissions) {
      if (node.isArray()) {
        node.forEach(child -> rebindIdentities(child, original, admissions));
        return;
      }
      if (!node.isObject()) {
        return;
      }
      ObjectNode object = (ObjectNode) node;
      var names = new java.util.ArrayList<String>();
      object.fieldNames().forEachRemaining(names::add);
      for (String field : names) {
        JsonNode value = object.path(field);
        if (!value.isTextual()) {
          rebindIdentities(value, original, admissions);
          continue;
        }
        switch (field) {
          case "sessionId" -> object.put(field, fixtureSession);
          case "testId" -> object.put(field, testId.toString());
          case "scopeHash" -> object.put(field, session.path("scopeHash").asText());
          case "principalId" -> object.put(field, "owner@example.test");
          case "workerId" -> object.put(field, "worker");
          case "contextId" -> object.put(field, fixtureSession + "-context");
          case "admissionId", "producerAdmissionId", "consumerAdmissionId" -> {
            if (admissions.containsKey(value.asText())) {
              object.put(field, admissions.get(value.asText()));
            }
          }
          default -> {
            /* Source text, opaque reference and semantic IDs are intentionally exact. */
          }
        }
      }
    }

    private static void replaceHashReferences(
        JsonNode node, String field, java.util.Map<String, String> hashes) {
      if (node.isArray()) {
        node.forEach(child -> replaceHashReferences(child, field, hashes));
        return;
      }
      if (!node.isObject()) {
        return;
      }
      ObjectNode object = (ObjectNode) node;
      if (object.path(field).isTextual() && hashes.containsKey(object.path(field).asText())) {
        object.put(field, hashes.get(object.path(field).asText()));
      }
      object.elements().forEachRemaining(child -> replaceHashReferences(child, field, hashes));
    }

    String fixtureSession() {
      return fixtureSession;
    }

    PublicationContracts.Base capture() {
      if (sharedBasis != null) {
        return tx.execute(
            status -> {
              sessions.lock(fixtureSession);
              return bases.capture(session, sharedBasis.path("replayRequirements"), Instant.now());
            });
      }
      return tx.execute(
          s -> {
            sessions.lock("session");
            var r = C.object().put("csiId", "CSI").put("environment", "Development");
            r.putArray("capabilities").add("step");
            r.putObject("initialContext").put("kind", "initialBlank");
            return bases.capture(session, r, Instant.now());
          });
    }

    void finalizing() {
      if (sharedBasis != null) {
        prepareSharedWorkflow(false);
        return;
      }
      tx.executeWithoutResult(
          status -> {
            var current = sessions.lock("session");
            current.document().put("state", "OBSERVING");
            current
                .document()
                .putObject("owner")
                .put("workerId", "worker")
                .put("fence", 1)
                .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
            sessions.save(current);
            var base = bases.find("session").orElseThrow();
            exercisedBasis =
                com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture
                    .completeExistingSession(jdbc, tx, "session", base);
            current = sessions.lock("session");
            current.document().put("state", "FINALIZING");
            sessions.save(current);
          });
    }

    /** Current-head fixture stages only the direct assertion through the production service. */
    void prepareDirectObservation(java.util.function.BiConsumer<JsonNode, JsonNode> store) {
      directPreparationStore = java.util.Objects.requireNonNull(store);
      prepareSharedWorkflow(false);
    }

    /** Actual stored preterminal authority case; never reverses a terminal action. */
    void preparePendingBindingConsumer() {
      if (sharedBasis == null) {
        throw new IllegalStateException(
            "Pending binding fixture requires complete ordinary shared source");
      }
      prepareSharedWorkflow(true);
    }

    private void prepareSharedWorkflow(boolean pending) {
      tx.executeWithoutResult(
          status -> {
            sessions.lock(fixtureSession);
            if (prefixWriteRevision != null) {
              var ids = C.object().putArray("ids");
              for (int i = 0; i < session.path("sourceSteps").size() - 1; i++) {
                ids.add(session.path("sourceSteps").get(i).path("stepId"));
              }
              String program =
                  jdbc.queryForObject(
                      "SELECT studio_015_prefix_program(?,?::jsonb)::text",
                      String.class,
                      prefixWriteRevision,
                      ids.toString());
              jdbc.update(
                  "INSERT INTO studio_guided_relearn_plans(session_id,base_revision_id,"
                      + "initial_step_id,initial_step_index,prefix_program,prefix_program_hash)"
                      + " VALUES (?,?,?,?,?::jsonb,?)",
                  fixtureSession,
                  prefixWriteRevision,
                  session.path("firstLearnStepId").asText(),
                  ids.size(),
                  program,
                  GuidedContracts.hash(C.parse(program)));
            }
            var owner =
                C.object()
                    .put("workerId", "worker")
                    .put("fence", 1)
                    .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
            jdbc.update(
                ("UPDATE studio_guided_sessions SET "
                    + "state='OBSERVING',document=jsonb_set(jsonb_set(document,"
                    + "'{state}','\"OBSERVING\"'),'{owner}',?::jsonb) WHERE "
                    + "session_id=?"),
                owner.toString(),
                fixtureSession);
            if (prefixWriteRevision != null) {
              jdbc.update(
                  "UPDATE studio_guided_sessions SET state='REPLAYING_PREFIX',"
                      + "document=jsonb_set(document,'{state}','\"REPLAYING_PREFIX\"') WHERE session_id=?",
                  fixtureSession);
            }
            JsonNode plan = sharedBasis.path("translationPlan");
            jdbc.update(
                ("INSERT INTO studio_guided_translation_plans(session_id,"
                    + "plan_revision,parent_revision,plan,plan_hash) VALUES "
                    + "(?,1,0,?::jsonb,?)"),
                fixtureSession,
                plan.toString(),
                GuidedContracts.hash(plan));
            jdbc.update(
                "UPDATE studio_guided_translation_state SET plan_revision=1,continuation=?"
                    + " WHERE session_id=?",
                prefixWriteRevision == null ? "SOURCE_PLAN" : "REPLAYING_PREFIX",
                fixtureSession);
            persistSharedEvidence(pending);
            if (prefixWriteRevision == null && directPreparationStore == null) {
              jdbc.update(
                  "UPDATE studio_guided_sessions SET"
                      + " state='FINALIZING',document=jsonb_set(document,'{state}','\"FINALIZING\"')"
                      + " WHERE session_id=?",
                  fixtureSession);
            }
          });
    }

    ObjectNode prefixSourceProof() {
      if (prefixWriteRevision == null) {
        throw new IllegalStateException("Not a prefix fixture");
      }
      return PublicationContracts.copy(sharedBasis.path("preparations").get(4).path("proof"));
    }

    private String selectPendingBindingConsumer() {
      JsonNode selected = null, selectedProposal = null;
      var facts = new java.util.HashMap<String, JsonNode>();
      var positions = new java.util.HashMap<String, Integer>();
      int index = 0;
      for (JsonNode preparation : sharedBasis.path("preparations")) {
        facts.put(preparation.path("preparationId").asText(), preparation);
        positions.put(preparation.path("preparationId").asText(), index++);
      }
      for (JsonNode action : sharedBasis.path("actions")) {
        JsonNode fact = facts.get(action.path("preparationId").asText());
        if (fact == null) {
          throw new IllegalArgumentException("Shared action lacks its exact preparation");
        }
        JsonNode operation = fact.path("proposal").path("operation");
        if (operation.path("kind").asText().equals("step")
            && operation.path("uses").path(0).path("kind").asText().equals("binding")
            && operation.path("code").asText().contains(".fill(")) {
          if (selected != null) {
            throw new IllegalArgumentException("Pending binding consumer is ambiguous");
          }
          selected = action;
          selectedProposal = fact.path("proposal");
        }
      }
      if (selected == null) {
        throw new IllegalArgumentException(
            "Shared fixture has no actual binding-using consumer step");
      }
      String admission = selected.path("ledger").path("admission").path("admissionId").asText();
      String binding = selectedProposal.path("operation").path("uses").path(0).path("id").asText();
      JsonNode edge = null, producer = null, producerAction = null, allocation = null;
      for (JsonNode value : sharedBasis.path("consumerEdges")) {
        if (value.path("consumerAdmissionId").asText().equals(admission)) {
          if (edge != null) {
            throw new IllegalArgumentException("Pending consumer edge is ambiguous");
          }
          edge = value;
        }
      }
      for (JsonNode value : sharedBasis.path("producers")) {
        if (value.path("bindingId").asText().equals(binding)) {
          if (producer != null) {
            throw new IllegalArgumentException("Pending consumer producer is ambiguous");
          }
          producer = value;
        }
      }
      for (JsonNode value : sharedBasis.path("allocations")) {
        if (value.path("bindingId").asText().equals(binding)) {
          if (allocation != null) {
            throw new IllegalArgumentException("Pending consumer allocation is ambiguous");
          }
          allocation = value;
        }
      }
      if (edge == null
          || producer == null
          || allocation == null
          || !edge.path("bindingId").asText().equals(binding)
          || !edge.path("producerAdmissionId").equals(producer.path("producerAdmissionId"))
          || !edge.path("coordinate").equals(selected.path("ledger").path("coordinate"))) {
        throw new IllegalArgumentException(
            "Pending consumer lacks its actual allocation/producer/edge lineage");
      }
      for (JsonNode action : sharedBasis.path("actions")) {
        if (action
            .path("ledger")
            .path("admission")
            .path("admissionId")
            .equals(producer.path("producerAdmissionId"))) {
          producerAction = action;
        }
      }
      if (producerAction == null
          || !producerAction.path("ledger").path("state").asText().equals("SUCCEEDED")
          || producerAction.path("ledger").path("dispatchCount").asInt() != 1
          || positions.get(producerAction.path("preparationId").asText())
              >= positions.get(selected.path("preparationId").asText())) {
        throw new IllegalArgumentException(
            "Pending consumer requires its earlier actual successful producer");
      }
      return admission;
    }

    private void persistSharedEvidence(boolean pending) {
      String pendingAdmission = pending ? selectPendingBindingConsumer() : null;
      int inserted = 0;
      JsonNode pendingCoordinate = null;
      ObjectNode header =
          (ObjectNode) sharedBasis.path("materializationEvidence").path("versions").get(0);
      String context = header.path("contextId").asText();
      ObjectNode intent =
          C.object()
              .put("sessionId", fixtureSession)
              .put("assignmentId", fixtureSession + "-assignment")
              .put("scopeHash", session.path("scopeHash").asText())
              .put("workerId", "worker")
              .put("expectedFence", 0);
      jdbc.update(
          "INSERT INTO"
              + " studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,expected_fence,intent)"
              + " VALUES (?,?,?,'worker',0,?::jsonb)",
          fixtureSession,
          fixtureSession + "-assignment",
          session.path("scopeHash").asText(),
          intent.toString());
      jdbc.update(
          "INSERT INTO studio_guided_materializations(session_id,scope_hash,conte"
              + ("xt_id,context_revision,materialization_revision,worker_id,owner_fence,")
              + ("source_revision,configuration_revision,authored_inputs_hash,authored_i")
              + ("nputs) VALUES (?,?,?,1,?,'worker',1,?,?,?,?::jsonb)"),
          fixtureSession,
          session.path("scopeHash").asText(),
          context,
          header.path("birthMaterializationRevision").asInt(),
          session.path("scope").path("sourceRevision").asText(),
          session.path("scope").path("configurationRevision").asText(),
          GuidedContracts.hash(sharedPrivateInputs),
          sharedPrivateInputs.toString());
      for (JsonNode allocation : sharedBasis.path("allocations")) {
        jdbc.update(
            "INSERT INTO studio_guided_allocations(session_id,binding_id,need_id,document) VALUES"
                + " (?,?,?,?::jsonb)",
            fixtureSession,
            allocation.path("bindingId").asText(),
            allocation.path("needId").asText(),
            allocation.toString());
      }
      JsonNode initial = null;
      for (JsonNode preparation : sharedBasis.path("preparations")) {
        if (preparation.path("executionEvidence").path("kind").asText().equals("initialBlank")) {
          if (initial != null && !initial.equals(preparation.path("executionEvidence"))) {
            throw new IllegalArgumentException(
                "Shared fixture original blank evidence is ambiguous");
          }
          initial = preparation.path("executionEvidence");
        }
      }
      if (initial == null) {
        throw new IllegalArgumentException("Shared fixture lacks its actual initial preparation");
      }
      com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture.captureSharedBootstrap(
          jdbc, tx, fixtureSession, initial);
      JsonNode manifest =
          C.parse(
              jdbc.queryForObject(
                  "SELECT manifest::text FROM studio_guided_source_manifests WHERE session_id=?",
                  String.class,
                  fixtureSession));
      ObjectNode safeManifest = ((ObjectNode) manifest).deepCopy();
      safeManifest.remove("configurationValues");
      String manifestHash = GuidedContracts.hash(safeManifest);
      java.util.Map<String, JsonNode> observations = new java.util.HashMap<>(),
          actions = new java.util.HashMap<>();
      for (JsonNode observation : sharedBasis.path("observations")) {
        observations.put(
            observation.path("observationHash").asText(), observation.path("observation"));
      }
      for (JsonNode action : sharedBasis.path("actions")) {
        actions.put(action.path("preparationId").asText(), action);
      }
      for (JsonNode preparation : sharedBasis.path("preparations")) {
        JsonNode proposal = preparation.path("proposal"),
            proof = preparation.path("proof"),
            execution = preparation.path("executionEvidence");
        if (directPreparationStore != null
            && !proof.path("target").path("assertTextMode").asText().equals("DIRECT_PUBLIC")) {
          continue;
        }
        String preparationId = preparation.path("preparationId").asText(),
            observationHash =
                preparation.path("observationHash").isNull()
                    ? null
                    : preparation.path("observationHash").asText();
        JsonNode fact = actions.get(preparationId);
        if (fact == null) {
          throw new IllegalArgumentException("Missing fixture action");
        }
        ObjectNode ledger = PublicationContracts.copy(fact.path("ledger"));
        String admission = ledger.path("admission").path("admissionId").asText();
        boolean admittedPending = admission.equals(pendingAdmission);
        if (admittedPending) {
          ledger.put("state", "ADMITTED").put("dispatchCount", 0).put("outcomeCode", "PENDING");
          pendingCoordinate = ledger.path("coordinate");
        }
        if (prefixWriteRevision != null && proof.has("assertSourceBinding")) {
          // The source assertion remains unadmitted for a real PRE_ADMISSION drift receipt.
          break;
        }
        String obligation = fact.path("obligationId").asText();
        JsonNode meaning = null;
        for (JsonNode item : sharedBasis.path("translationPlan").path("obligations")) {
          if (item.path("obligationId").asText().equals(obligation)) {
            meaning = item;
          }
        }
        if (meaning == null) {
          throw new IllegalArgumentException("Missing fixture obligation meaning");
        }
        ObjectNode storedMeaning = PublicationContracts.copy(meaning);
        if (obligationMeaningMutation != null) {
          obligationMeaningMutation.accept(storedMeaning);
        }
        jdbc.update(
            "INSERT INTO studio_guided_obligation_admissions(session_id,obligation_"
                + ("id,plan_revision,meaning,proposal,proposal_digest,admission_key,admiss")
                + ("ion_id,attempt_ordinal) VALUES (?,?,1,?::jsonb,?::jsonb,?,?,NULL,0)"),
            fixtureSession,
            storedMeaning.path("obligationId").asText(),
            storedMeaning.toString(),
            proposal.toString(),
            GuidedContracts.hash(proposal),
            ledger.path("idempotencyKey").asText());
        // Keep the original context/ACK/receipt while later controlled observations advance.
        ObjectNode progress = sessions.lock(fixtureSession).progress().deepCopy();
        progress.set("executionEvidence", execution);
        if (observationHash != null) {
          JsonNode observation = observations.get(observationHash);
          if (observation == null) {
            throw new IllegalArgumentException("Missing fixture observation");
          }
          progress.set("observation", observation);
          progress.put("observationHash", GuidedContracts.hash(observation));
          jdbc.update(
              "UPDATE studio_guided_sessions SET progress=?::jsonb WHERE session_id=?",
              progress.toString(),
              fixtureSession);
          if (directPreparationStore == null
              && jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_publication_observations WHERE session_id=?"
                          + " AND observation_hash=?",
                      Integer.class,
                      fixtureSession,
                      observationHash)
                  == 0) {
            jdbc.update(
                "INSERT INTO studio_guided_publication_observations(session_id,observat"
                    + ("ion_hash,context_id,owner_fence,document_id,generation,observation,cap")
                    + ("tured_at) VALUES (?,?,?,1,?,?,?::jsonb,clock_timestamp())"),
                fixtureSession,
                observationHash,
                context,
                observation.path("documentId").asText(),
                observation.path("generation").asInt(),
                observation.toString());
          }
        } else {
          jdbc.update(
              "UPDATE studio_guided_sessions SET progress=?::jsonb WHERE session_id=?",
              progress.toString(),
              fixtureSession);
        }
        if (directPreparationStore != null) {
          directPreparationStore.accept(proposal, proof);
          return;
        }
        jdbc.update(
            "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
                + ("xt_id,owner_fence,request_digest,proof,expires_at) VALUES (?,?,?,1,?,?")
                + ("::jsonb,?::timestamptz)"),
            fixtureSession,
            preparationId,
            context,
            GuidedContracts.hash(proposal),
            proof.toString(),
            proof.path("expiresAt").asText());
        jdbc.update(
            "INSERT INTO studio_guided_publication_preparations(session_id,preparat"
                + ("ion_id,context_id,owner_fence,request_digest,evidence_hash,inputs_hash")
                + (",materialization_revision,source_manifest_hash,observation_hash,execut")
                + ("ion_evidence,proposal,proof,captured_at) VALUES (?,?,?,1,?,?,?,?,?,?,?")
                + ("::jsonb,?::jsonb,?::jsonb,clock_timestamp())"),
            fixtureSession,
            preparationId,
            context,
            GuidedContracts.hash(proposal),
            GuidedContracts.hash(execution),
            proof.path("authoredInputsHash").asText(),
            preparation.path("materializationRevision").asInt(),
            manifestHash,
            observationHash,
            execution.toString(),
            proposal.toString(),
            proof.toString());
        C.validate("v3/ledger", ledger);
        jdbc.update(
            "INSERT INTO"
                + " studio_guided_actions(admission_id,session_id,step_id,ordinal,attempt_ordinal,document,proposal)"
                + " VALUES (?,?,?,?,0,?::jsonb,?::jsonb)",
            admission,
            fixtureSession,
            ledger.path("coordinate").path("stepId").asText(),
            ledger.path("coordinate").path("ordinal").asInt(),
            ledger.toString(),
            proposal.toString());
        jdbc.update(
            "UPDATE studio_guided_preparations SET admission_id=? WHERE session_id=? AND"
                + " preparation_id=?",
            admission,
            fixtureSession,
            preparationId);
        jdbc.update(
            "UPDATE studio_guided_obligation_admissions SET admission_id=? WHERE session_id=? AND"
                + " obligation_id=? AND admission_id IS NULL",
            admission,
            fixtureSession,
            obligation);
        jdbc.update(
            "INSERT INTO studio_guided_publication_admissions(session_id,admission_"
                + ("id,preparation_id,obligation_id,proposal_hash,captured_at) VALUES (?,?")
                + (",?,?,?,clock_timestamp())"),
            fixtureSession,
            admission,
            preparationId,
            obligation,
            GuidedContracts.hash(proposal));
        for (JsonNode producer : sharedBasis.path("producers")) {
          if (producer.path("producerAdmissionId").asText().equals(admission)) {
            ObjectNode producerDocument = PublicationContracts.copy(producer);
            if (producerDocumentMutation != null) {
              producerDocumentMutation.accept(producerDocument);
            }
            jdbc.update(
                "INSERT INTO studio_guided_producers(session_id,binding_id,admission_id,document)"
                    + " VALUES (?,?,?,?::jsonb)",
                fixtureSession,
                producer.path("bindingId").asText(),
                admission,
                producerDocument.toString());
          }
        }
        for (JsonNode edge : sharedBasis.path("consumerEdges")) {
          if (edge.path("consumerAdmissionId").asText().equals(admission)) {
            jdbc.update(
                "INSERT INTO studio_guided_consumer_edges(session_id,consumer_admission"
                    + ("_id,binding_id,producer_admission_id,document) VALUES (?")
                    + (",?,?,?,?::jsonb)"),
                fixtureSession,
                admission,
                edge.path("bindingId").asText(),
                edge.path("producerAdmissionId").asText(),
                edge.toString());
          }
        }
        inserted++;
        if (admittedPending) {
          break;
        }
      }
      var completed = sessions.lock(fixtureSession);
      int completedSteps = sharedBasis.path("sourceSteps").size();
      if (pending) {
        if (pendingCoordinate == null) {
          throw new IllegalStateException("Actual pending binding admission was not inserted");
        }
        completedSteps = -1;
        for (int index = 0; index < sharedBasis.path("sourceSteps").size(); index++) {
          if (sharedBasis
              .path("sourceSteps")
              .get(index)
              .path("stepId")
              .equals(pendingCoordinate.path("stepId"))) {
            completedSteps = index;
          }
        }
        if (completedSteps < 0) {
          throw new IllegalArgumentException("Pending source coordinate absent");
        }
      }
      completed.progress().put("stepIndex", completedSteps);
      ((ObjectNode) completed.document().path("counters"))
          .put("actions", inserted)
          .put(
              "observations",
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_observations WHERE session_id=?",
                  Integer.class,
                  fixtureSession))
          .put(
              "sanitizedEvidenceBytes",
              jdbc.queryForObject(
                  "SELECT coalesce(sum(octet_length(convert_to(observation::text,'UTF8'))),0)::int"
                      + " FROM studio_guided_publication_observations WHERE session_id=?",
                  Integer.class,
                  fixtureSession));
      sessions.save(completed);
      if (!pending && prefixWriteRevision == null && directPreparationStore == null) {
        var builder = new GuidedPlanBuilder(C);
        exercisedBasis =
            builder.basis(
                bases.find(fixtureSession).orElseThrow(),
                bases.lockCurrent(testId),
                evidence.read(fixtureSession),
                completed.document(),
                builder.learningProvenance(manifest));
      }
      jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions WHERE session_id=?",
                  Integer.class,
                  fixtureSession))
          .isEqualTo(inserted);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_preparations WHERE session_id=?",
                  Integer.class,
                  fixtureSession))
          .isEqualTo(inserted);
      if (pending) {
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_actions a JOIN studio_guided_preparations p"
                        + " ON p.session_id=a.session_id AND"
                        + " p.preparation_id=a.document->>'preparationId' JOIN"
                        + " studio_guided_obligation_admissions o ON o.session_id=a.session_id AND"
                        + " o.admission_id=a.admission_id JOIN studio_guided_consumer_edges e ON"
                        + " e.session_id=a.session_id AND e.consumer_admission_id=a.admission_id"
                        + " JOIN studio_guided_producers r ON r.session_id=e.session_id AND"
                        + " r.admission_id=e.producer_admission_id JOIN studio_guided_actions"
                        + " producer ON producer.session_id=r.session_id AND"
                        + " producer.admission_id=r.admission_id WHERE a.session_id=? AND"
                        + " a.admission_id=? AND a.document->>'state'='ADMITTED' AND"
                        + " a.document->>'dispatchCount'='0' AND"
                        + " p.request_digest=studio_publication_hash(a.proposal) AND"
                        + " o.proposal_digest=p.request_digest AND"
                        + " producer.document->>'state'='SUCCEEDED' AND"
                        + " producer.document->>'dispatchCount'='1'",
                    Integer.class,
                    fixtureSession,
                    pendingAdmission))
            .isEqualTo(1);
      } else if (prefixWriteRevision != null) {
        assertThat(sharedBasis.path("actions").size()).isEqualTo(5);
        assertThat(inserted).isEqualTo(4);
        JsonNode consumer = sharedBasis.path("preparations").get(4);
        assertThat(consumer.path("proof").has("assertSourceBinding")).isTrue();
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?"
                        + " AND ordinal=?",
                    Integer.class,
                    fixtureSession,
                    consumer.path("proposal").path("coordinate").path("stepId").asText(),
                    consumer.path("proposal").path("coordinate").path("ordinal").asInt()))
            .isZero();
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_preparations WHERE session_id=?"
                        + " AND preparation_id=?",
                    Integer.class,
                    fixtureSession,
                    consumer.path("preparationId").asText()))
            .isZero();
      } else {
        assertThat(inserted).isEqualTo(sharedBasis.path("actions").size());
      }
    }

    PublicationContracts.Snapshot snapshot(PublicationContracts.Base base) {
      if (sharedBasis != null) {
        if (exercisedBasis == null) {
          throw new IllegalStateException(
              "Shared fixture requires complete persisted evidence before snapshot");
        }
        ObjectNode basis = exercisedBasis.deepCopy();
        var identity =
            C.object()
                .put("ownerWorkerId", "worker")
                .put("ownerFence", 1)
                .put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)))
                .put("translationHash", basis.path("translationHash").asText())
                .put("basisHash", GuidedContracts.hash(basis));
        identity.set("base", base.document());
        return new PublicationContracts.Snapshot(identity, basis);
      }
      if (exercisedBasis == null) {
        throw new IllegalStateException("Complete fixture evidence required before snapshot");
      }
      ObjectNode basis = exercisedBasis.deepCopy();
      ObjectNode identity =
          C.object()
              .put("ownerWorkerId", "worker")
              .put("ownerFence", 1)
              .put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)))
              .put("translationHash", basis.path("translationHash").asText())
              .put("basisHash", GuidedContracts.hash(basis));
      identity.set("base", base.document());
      var profile = currentProfile();
      var candidate = new ObservedArtifactLowerer(C).lower(basis, profile);
      for (String field :
          List.of(
              "learnedPlanHash",
              "artifactHash",
              "referencePolicyHash",
              "operationEquivalenceHash",
              "publicationEvidenceHash",
              "profileHash")) {
        identity.set(field, candidate.hashes().path(field));
      }
      identity.put("validationBuildHash", GuidedContracts.hash(observedBuild(profile)));
      return new PublicationContracts.Snapshot(identity, basis);
    }

    @Override
    public void close() {
      if (ownsContainer) {
        pg.stop();
      }
    }
  }

  @Test
  void upgradeBaseEpochAndImmutableHistory() {
    try (var db = new Database()) {
      var b = db.capture();
      assertThat(b.document().toString()).doesNotContain("saved-value-canary");
      // STUDIO-OBS-012A / ADR-SC-005 D-B: no pre-observed revision family exists or can be written.
      assertThat(db.jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions", Integer.class))
          .isZero();
      assertThatThrownBy(
              () ->
                  db.jdbc.update("UPDATE studio_guided_publication_bases SET document='{}'::jsonb"))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () -> db.jdbc.update("UPDATE ui_tests SET publication_epoch=7 WHERE id=?", db.testId))
          .hasMessageContaining("epoch");
      long epoch =
          db.jdbc.queryForObject(
              "SELECT publication_epoch FROM ui_tests WHERE id=?", Long.class, db.testId);
      // The epoch follows only the confirmed-revision pointer; an unrelated draft write leaves it
      // and the captured base untouched.
      db.jdbc.update("UPDATE ui_tests SET name='renamed' WHERE id=?", db.testId);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT publication_epoch FROM ui_tests WHERE id=?", Long.class, db.testId))
          .isEqualTo(epoch);
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("session");
            db.bases.requireCurrent(b, db.bases.lockCurrent(db.testId));
          });
      db.jdbc.update("UPDATE ui_tests SET source_revision=source_revision+1 WHERE id=?", db.testId);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("session");
                        db.bases.requireCurrent(b, db.bases.lockCurrent(db.testId));
                      }))
          .hasMessageContaining("PUBLICATION_CONFLICT");
    }
  }

  @Test
  void freshCoreToHeadHasNoCutoverAndNoLegacyRevisionFamily() throws Exception {
    try (var pg = new TestPostgresDatabase()) {
      pg.start();
      var ds = new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
      var jdbc = new JdbcTemplate(ds);
      // A populated, untouched core database is the only supported starting point (D-B).
      Flyway.configure().dataSource(ds).target("11").load().migrate();
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES ('core','core','core@example.test')");
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
              + " VALUES ('CORE','core','unit','LOW','core@example.test','Development')");
      var draft = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by) VALUES"
              + " (?,'core','CORE','Development','chrome','[]','core@example.test')",
          draft);
      Flyway.configure().dataSource(ds).load().migrate();
      assertThat(
              jdbc.queryForList(
                  "SELECT version FROM flyway_schema_history WHERE version IS NOT NULL"
                      + " ORDER BY installed_rank",
                  String.class))
          .startsWith(
              "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16",
              "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
              "31", "32", "33");
      assertThat(Files.exists(Path.of("db/cutover"))).isFalse();
      assertThat(
              jdbc.queryForObject(
                  "SELECT to_regprocedure('studio_inference_require_request()') IS NULL",
                  Boolean.class))
          .isTrue();
      assertThat(
              jdbc.queryForObject(
                  "SELECT to_regclass('uq_ui_test_revisions_identity') IS NULL", Boolean.class))
          .isTrue();
      assertThat(
              jdbc.queryForObject(
                  "SELECT to_regclass('uq_observed_revision_session') IS NOT NULL", Boolean.class))
          .isTrue();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM ui_tests WHERE id=? AND browser='chromium'"
                      + " AND confirmed_revision_id IS NULL",
                  Integer.class,
                  draft))
          .isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions", Integer.class))
          .isZero();
      // A revision outside the observed family cannot be written at all: without publication
      // identity it is refused NOT NULL, and with it an artifact-1 row fails the origin check.
      String legacyRevision =
          "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,"
              + "configuration_revision,source,source_hash,artifact,artifact_hash,"
              + "artifact_schema_version,configuration,\"references\",provenance,"
              + "created_by,confirmed_by,confirmed_at,confirmation_source%s) VALUES"
              + " (?,?,'CORE',1,1,'[]',?,'{}',?,1,'{}','{}','{}','core@example.test',"
              + "'core@example.test',now(),'GUIDED_RUN'%s)";
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      legacyRevision.formatted("", ""),
                      UUID.randomUUID(),
                      draft,
                      "a".repeat(64),
                      "b".repeat(64)))
          .hasMessageContaining("publication_kind");
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      legacyRevision.formatted(
                          ",publication_kind,guided_session_id,learned_plan_hash,revision_digest",
                          ",'GUIDED_RUN','none','" + "c".repeat(64) + "','" + "d".repeat(64) + "'"),
                      UUID.randomUUID(),
                      draft,
                      "a".repeat(64),
                      "b".repeat(64)))
          .hasMessageContaining("ck_observed_revision_origin");
    }
  }

  @Test
  void claimIsSingleSendRenewalStableAndSessionBudgetCannotReset() {
    try (var db = new Database()) {
      var b = db.capture();
      db.finalizing();
      var snap = db.snapshot(b);
      var c = new PublicationContracts.Claim("session", "key", "d".repeat(64), snap);
      var a =
          db.tx.execute(
              s -> {
                db.sessions.lock("session");
                return db.publications.reserve(c, Instant.now());
              });
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("session");
            db.publications.claim(
                "session", a.attemptId(), a.claimId(), snap.hash(), Instant.now());
          });
      assertThatThrownBy(
              () ->
                  db.tx.execute(
                      s -> {
                        db.sessions.lock("session");
                        return db.publications.claim(
                            "session", a.attemptId(), a.claimId(), snap.hash(), Instant.now());
                      }))
          .hasMessageContaining("IDEMPOTENCY_CONFLICT");
      db.jdbc.update(
          "UPDATE studio_guided_sessions SET"
              + " document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb(?::text)) WHERE"
              + " session_id='session'",
          Instant.now().plusSeconds(200).toString());
      assertThat(
              db.tx
                  .execute(
                      s -> {
                        db.sessions.lock("session");
                        return db.publications.reserve(c, Instant.now());
                      })
                  .attemptId())
          .isEqualTo(a.attemptId());
      for (int n = 1; n <= 3; n++) {
        var active =
            n == 1
                ? a
                : db.tx.execute(
                    s -> {
                      db.sessions.lock("session");
                      return db.publications.reserve(
                          new PublicationContracts.Claim(
                              "session", UUID.randomUUID().toString(), "d".repeat(64), snap),
                          Instant.now());
                    });
        db.tx.executeWithoutResult(
            s -> {
              db.sessions.lock("session");
              db.publications.finish(
                  "session",
                  active.attemptId(),
                  active.claimId(),
                  snap.hash(),
                  PublicationContracts.AttemptStatus.UNKNOWN,
                  null,
                  "TRANSPORT",
                  Instant.now());
            });
      }
      assertThatThrownBy(
              () ->
                  db.tx.execute(
                      s -> {
                        db.sessions.lock("session");
                        return db.publications.reserve(c, Instant.now());
                      }))
          .hasMessageContaining("BUDGET_EXCEEDED");
    }
  }

  @Test
  void halfRevisionAndMissingObservationCannotCommit() {
    try (var db = new Database()) {
      db.capture();
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO studio_guided_publication_observations(session_id,observat"
                          + ("ion_hash,context_id,owner_fence,document_id,generation,observation,cap")
                          + ("tured_at) VALUES ('session',?,'missing',1,'d',0,'{}',now())"),
                      "a".repeat(64)))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
      db.finalizing();
      var sourceBase = db.bases.find("session").orElseThrow();
      var actual = db.snapshot(sourceBase);
      var completeCandidate =
          new ObservedArtifactLowerer(C).lower(actual.basis(), currentProfile());
      ObjectNode references = C.object().put("authoringIdentityVersion", 1);
      references.putArray("variables").add("fixture-private");
      references.putArray("secrets");
      references.set(
          "authoredDeclarations",
          actual.basis().path("snapshotEvidence").path("current").path("authoredDeclarations"));
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      status -> {
                        db.sessions.lock("session");
                        db.jdbc.update(
                            "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,config"
                                + ("uration_revision,source,source_hash,artifact,artifact_hash,artifact_sc")
                                + ("hema_version,configuration,\"references\",provenance,created_by,confirme")
                                + ("d_by,confirmed_at,confirmation_source,reference_policy,publication_kin")
                                + ("d,guided_session_id,learned_plan_hash,revision_digest,step_snapshot_ha")
                                + ("shes,step_reuse_provenance) VALUES"
                                    + " (?,?,'CSI',1,1,?::jsonb,?,?::jsonb,")
                                + ("?,3,?::jsonb,?::jsonb,'{}','owner@example.test','owner@example.test',c")
                                + ("lock_timestamp(),'GUIDED_RUN',?::jsonb,'GUIDED_RUN','session',?,?,?::j")
                                + ("sonb,?::jsonb)"),
                            UUID.randomUUID(),
                            db.testId,
                            C.object().putArray("source").add(db.sourceText).toString(),
                            completeCandidate.hashes().path("sourceHash").asText(),
                            completeCandidate.artifact().toString(),
                            completeCandidate.hashes().path("artifactHash").asText(),
                            actual.basis().path("configuration").toString(),
                            references.toString(),
                            completeCandidate.policy().toString(),
                            completeCandidate.hashes().path("learnedPlanHash").asText(),
                            completeCandidate.hashes().path("revisionDigest").asText(),
                            completeCandidate.learnedPlan().path("stepSnapshotHashes").toString(),
                            completeCandidate.learnedPlan().path("reusedFrom").toString());
                        db.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
                      }))
          .isInstanceOf(org.springframework.dao.DataAccessException.class)
          .hasMessageContaining("fk_observed_revision_receipt");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM ui_test_revisions WHERE publication_kind='GUIDED_RUN'",
                  Integer.class))
          .isZero();
    }
  }

  @Test
  void validatedRelationalCycleCommitsOnceAndKeepsHistoricalReceiptAfterExpiry() {
    try (var db = new Database()) {
      var base = db.capture();
      db.finalizing();
      var raw = db.snapshot(base);
      var basis = raw.basis();
      var profile = currentProfile();
      var build = observedBuild(profile);
      var lowered = new ObservedArtifactLowerer(C).lower(basis, profile);
      var learned = (ObjectNode) lowered.learnedPlan();
      var policy = (ObjectNode) lowered.policy();
      var artifact = (ObjectNode) lowered.artifact();
      var hashes = (ObjectNode) lowered.hashes();
      var identity = PublicationContracts.copy(raw.identity());
      for (String key :
          List.of(
              "artifactHash",
              "learnedPlanHash",
              "referencePolicyHash",
              "profileHash",
              "operationEquivalenceHash",
              "publicationEvidenceHash")) {
        identity.set(key, hashes.path(key));
      }
      identity.put("validationBuildHash", GuidedContracts.hash(build));
      var snapshot = new PublicationContracts.Snapshot(identity, basis);
      var attempt =
          db.tx.execute(
              t -> {
                db.sessions.lock("session");
                return db.publications.reserve(
                    new PublicationContracts.Claim("session", "final", "d".repeat(64), snapshot),
                    Instant.now());
              });
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock("session");
            db.publications.claim(
                "session", attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
          });
      var verdict =
          C.object()
              .put("ok", true)
              .putNull("errorCode")
              .put("attemptId", attempt.attemptId().toString())
              .put("claimId", attempt.claimId().toString())
              .put("snapshotHash", snapshot.hash())
              .put("basisHash", identity.path("basisHash").asText());
      for (String key :
          List.of(
              "artifactHash",
              "learnedPlanHash",
              "referencePolicyHash",
              "operationEquivalenceHash",
              "publicationEvidenceHash")) {
        verdict.set(key, hashes.path(key));
      }
      verdict.put("schemaVersion", 3);
      verdict.set("admissionProvenanceHash", hashes.path("admissionProvenanceHash"));
      verdict.set("profile", profile);
      verdict.set("build", build);
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock("session");
            db.publications.finish(
                "session",
                attempt.attemptId(),
                attempt.claimId(),
                snapshot.hash(),
                PublicationContracts.AttemptStatus.VALIDATED,
                verdict,
                null,
                Instant.now());
          });
      var candidate = new PublicationContracts.Candidate(learned, artifact, policy, hashes);
      var grant =
          new PublicationContracts.Grant(
              "session",
              "owner@example.test",
              "CSI",
              snapshot.hash(),
              attempt.validationDeadline());
      var command =
          new PublicationContracts.Commit(
              "session",
              UUID.randomUUID(),
              attempt.attemptId(),
              attempt.claimId(),
              "final",
              "d".repeat(64),
              snapshot,
              candidate,
              grant);
      assertThatThrownBy(() -> commitHistoricalV18(db.jdbc, db.tx, command, HistoricalFault.NONE))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("actual V18");
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      t -> {
                        db.sessions.lock("session");
                        db.publications.commit(command, Instant.now());
                        throw new IllegalStateException("fault-after-write");
                      }))
          .hasMessageContaining("fault-after-write");
      assertThat(db.publications.receipt("session")).isEmpty();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT state FROM studio_guided_sessions WHERE session_id='session'",
                  String.class))
          .isEqualTo("FINALIZING");
      var receipt =
          db.tx.execute(
              t -> {
                db.sessions.lock("session");
                var r = db.publications.commit(command, Instant.now());
                db.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
                return r;
              });
      assertThat(receipt.document().path("publicReceipt").has("relearnedFrom")).isTrue();
      assertThat(receipt.document().path("publicReceipt").path("relearnedFrom").isNull()).isTrue();
      assertThat(receipt.document().path("revisionId").asText())
          .isEqualTo(command.revisionId().toString());
      // Readiness is derived (STUDIO-OBS-012A AC-2): the commit moved the candidate pointer (the
      // head) and with it the publication epoch; only the proof confirms (ADR-SC-008 D5).
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT candidate_revision_id::text FROM ui_tests WHERE id=?",
                  String.class,
                  db.testId))
          .isEqualTo(command.revisionId().toString());
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT publication_epoch FROM ui_tests WHERE id=?", Long.class, db.testId))
          .isEqualTo(Long.parseLong(base.document().path("publicationEpoch").asText()) + 1);
      db.jdbc.update(
          "UPDATE studio_guided_sessions SET"
              + " document=jsonb_set(document,'{owner,leaseExpiresAt}','\"2000-01-01T00:00:00Z\"')"
              + " WHERE session_id='session'");
      assertThat(db.publications.receipt("session").orElseThrow().document())
          .isEqualTo(receipt.document());
      testObservedBinding(db, command.revisionId(), base, hashes, profile, build);
      assertThatThrownBy(() -> db.jdbc.update("DELETE FROM studio_guided_publications"))
          .hasMessageContaining("immutable");
      assertThat(db.jdbc.queryForObject("SELECT count(*) FROM ui_test_executions", Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void directSqlClaimsAndNewPartitionsKeepTheirIndependentGuards() {
    try (var db = new Database()) {
      var base = db.capture();
      db.finalizing();
      var snap = db.snapshot(base);
      var attempt =
          db.tx.execute(
              t -> {
                db.sessions.lock("session");
                return db.publications.reserve(
                    new PublicationContracts.Claim("session", "key", "d".repeat(64), snap),
                    Instant.now());
              });
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_publication_attempts SET snapshot_hash=? WHERE"
                          + " attempt_id=?",
                      "f".repeat(64),
                      attempt.attemptId()))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_publication_attempts SET"
                          + " status='VALIDATED',claimed_at=now(),completed_at=now(),validator_receipt='{}'::jsonb"
                          + " WHERE attempt_id=?",
                      attempt.attemptId()))
          .hasMessageContaining("not claimed");
      assertThatThrownBy(() -> db.jdbc.update("DELETE FROM studio_guided_publication_attempts"))
          .hasMessageContaining("immutable");
      db.jdbc.execute(
          "CREATE TABLE ui_test_executions_publication_future PARTITION OF ui_test_executions FOR"
              + " VALUES FROM ('2099-01-01') TO ('2099-02-01')");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM pg_trigger WHERE"
                      + " tgrelid='ui_test_executions_publication_future'::regclass AND"
                      + " tgname='tr_studio_observed_execution_guard'",
                  Integer.class))
          .isEqualTo(1);
      var execution = UUID.randomUUID();
      db.jdbc.update(
          "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,ended_at,duration_ms)"
              + " VALUES (?,?,'PASSED','2099-01-02','2099-01-02',0)",
          execution,
          db.testId);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE ui_test_executions SET observed_revision_binding='{}'::jsonb WHERE"
                          + " id=?",
                      execution))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE ui_test_executions SET observed_admission_receipt='{}'::jsonb WHERE"
                          + " id=?",
                      execution))
          .hasMessageContaining("needs binding");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_publication_hash('{\"b\":2,\"a\":\"é\"}'::jsonb)", String.class))
          .isEqualTo("06c264c46ad5ada9493abd3aa2383fb205ae99d7d0bad40b03a43bfec8a1b8de");
    }
  }

  /**
   * PostgreSQL as a third independent canonical-v1 witness (STUDIO-OBS-014, ar-2-r14-stops.json
   * ruling 1): every positive vector of the shared canonical vector file goes through {@code
   * studio_publication_canonical} and {@code studio_publication_hash} and must reproduce the
   * vector's bytes and digest, which Java and Node already check separately.
   */
  @Test
  void postgresReproducesEveryPositiveCanonicalVector() throws Exception {
    JsonNode vectors =
        C.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-canonical-vectors.json")));
    assertThat(vectors.path("positive").size()).isPositive();
    try (var db = new Database()) {
      for (JsonNode vector : vectors.path("positive")) {
        String name = vector.path("name").asText();
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT"
                        + " encode(convert_to(studio_publication_canonical(?::jsonb),'UTF8'),'hex')",
                    String.class,
                    vector.path("input").toString()))
            .as(name)
            .isEqualTo(vector.path("canonicalUtf8Hex").asText());
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT studio_publication_hash(?::jsonb)",
                    String.class,
                    vector.path("input").toString()))
            .as(name)
            .isEqualTo(vector.path("sha256").asText());
      }
    }
  }

  static String wire(Instant value) {
    return PublicationContracts.time(value);
  }

  /**
   * The database wall clock at millisecond precision. A fixture that mints a replay grant emulates
   * the BFF mint, which reads {@code clock_timestamp()} (STUDIO-OBS-012A ruling R9), so the guard
   * judges the grant on the same clock that issued it.
   */
  static Instant databaseNow(JdbcTemplate jdbc) {
    return PublicationContracts.millisecond(
        jdbc.queryForObject("SELECT clock_timestamp()", java.sql.Timestamp.class).toInstant());
  }

  /** A guided session whose publication base is captured but not yet committed. */
  public record Prepared(
      UUID testId,
      String sessionId,
      String csiId,
      String environment,
      String principal,
      UUID stepId,
      String sourceText,
      PublicationContracts.Base base) {}

  /** One committed observed publication; see {@link #publishObserved}. */
  public record Published(
      UUID testId,
      UUID revisionId,
      String sessionId,
      String csiId,
      String environment,
      String principal) {}

  /**
   * A genuine {@code GUIDED_RUN} revision on a caller-owned, already migrated database.
   *
   * <p>Since the STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) every revision is an observed
   * publication: the base, receipt and origin constraints make a hand-written revision row
   * impossible. Current-head tests therefore go through the production writers — session insert,
   * base capture, reserve/claim/finish/commit — with every SQL guard active, exactly as {@link
   * GuidedSecretLoginMigrationTest#publishedRetry()} does. The explicitly named historical V18
   * helper retains reserve/claim/finish and uses its reviewed test-only historical SQL commit; it
   * does not claim current Java commit compatibility with V18. The validator verdict is synthetic
   * (no browser, no live validator); nothing here is a runner or replay claim. Creates the draft
   * (with v2 authoring), the user and the CSI if absent, and commits in its own transactions.
   */
  public static Published publishObserved(
      javax.sql.DataSource source,
      String sessionId,
      String csiId,
      String environment,
      String principal) {
    return publishObserved(
        source, prepareObserved(source, sessionId, null, csiId, environment, principal));
  }

  /**
   * Inserts the guided session, its source manifest and translation state, and captures the
   * publication base — the pre-effect half of {@link #publishObserved}. With {@code testId == null}
   * a new draft (with v2 authoring) is created; otherwise the existing draft's current authoring is
   * the session's source, so a later session on the same draft sees its current confirmed pointer.
   */
  public static Prepared prepareObserved(
      javax.sql.DataSource source,
      String sessionId,
      UUID existingTestId,
      String csiId,
      String environment,
      String principal) {
    return prepareObserved(source, sessionId, existingTestId, csiId, environment, principal, false);
  }

  /** Explicit historical V18 test fixture; current runtime compatibility is not claimed. */
  public static Published publishHistoricalV18Observed(
      javax.sql.DataSource source,
      String sessionId,
      String csiId,
      String environment,
      String principal) {
    return publishObserved(
        source,
        prepareObserved(source, sessionId, null, csiId, environment, principal, true),
        true);
  }

  public static Prepared prepareHistoricalV18Observed(
      javax.sql.DataSource source,
      String sessionId,
      UUID existingTestId,
      String csiId,
      String environment,
      String principal) {
    return prepareObserved(source, sessionId, existingTestId, csiId, environment, principal, true);
  }

  private static Prepared prepareObserved(
      javax.sql.DataSource source,
      String sessionId,
      UUID existingTestId,
      String csiId,
      String environment,
      String principal,
      boolean historicalV18) {
    var jdbc = new JdbcTemplate(source);
    var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    var sessions = new GuidedSessionRepository(jdbc, tx, C);
    var bases = new GuidedPublicationBaseRepository(jdbc, C);
    if (existingTestId != null) {
      var authored =
          C.parse(
              jdbc.queryForObject(
                  "SELECT authoring::text FROM ui_tests WHERE id=?", String.class, existingTestId));
      var first = authored.path("steps").path(0);
      return prepare(
          jdbc,
          tx,
          sessions,
          bases,
          sessionId,
          existingTestId,
          UUID.fromString(first.path("id").asText()),
          first.path("text").asText(),
          csiId,
          environment,
          principal,
          historicalV18);
    }
    UUID testId = UUID.randomUUID(), stepId = UUID.randomUUID();
    String sourceText = "Open https://orders.example.test/start";
    jdbc.update(
        "INSERT INTO users(sso_id,name,email) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING",
        "publisher-" + UUID.randomUUID(),
        "Observed publisher",
        principal);
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES"
            + " (?,'Observed fixture','unit','LOW',?,'Development') ON CONFLICT(id) DO NOTHING",
        csiId,
        principal);
    try {
      var authoring =
          new AuthoringV2Request(2, null, List.of(new AuthoringStep(stepId, sourceText, null)));
      var mapper = new ObjectMapper().findAndRegisterModules();
      jdbc.update(
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by,authoring,"
              + "authoring_revision_inputs) VALUES (?,'Observed fixture',?,?,'chromium',?::jsonb,?,"
              + "?::jsonb,?::jsonb)",
          testId,
          csiId,
          environment,
          mapper.writeValueAsString(List.of(sourceText)),
          principal,
          mapper.writeValueAsString(authoring),
          mapper.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())));
    } catch (java.io.IOException failure) {
      throw new IllegalStateException("Observed fixture source unavailable", failure);
    }
    return prepare(
        jdbc,
        tx,
        sessions,
        bases,
        sessionId,
        testId,
        stepId,
        sourceText,
        csiId,
        environment,
        principal,
        historicalV18);
  }

  private static Prepared prepare(
      JdbcTemplate jdbc,
      TransactionTemplate tx,
      GuidedSessionRepository sessions,
      GuidedPublicationBaseRepository bases,
      String sessionId,
      UUID testId,
      UUID stepId,
      String sourceText,
      String csiId,
      String environment,
      String principal,
      boolean historicalV18) {
    String sourceRevision =
        jdbc.queryForObject(
            "SELECT source_revision::text FROM ui_tests WHERE id=?", String.class, testId);
    String configurationRevision =
        jdbc.queryForObject(
            "SELECT configuration_revision::text FROM ui_tests WHERE id=?", String.class, testId);
    var session =
        C.object()
            .put("sessionId", sessionId)
            .put("testId", testId.toString())
            .put("state", "PREPARING")
            .put("expiresAt", Instant.now().plusSeconds(600).toString());
    var scope =
        session
            .putObject("scope")
            .put("principalId", principal)
            .put("csiId", csiId)
            .put("sourceRevision", sourceRevision)
            .put("configurationRevision", configurationRevision);
    ordinaryScope(scope, environment);
    session.put("scopeHash", GuidedContracts.hash(scope));
    session
        .putObject("owner")
        .put("workerId", "unclaimed")
        .put("fence", 0)
        .put("leaseExpiresAt", Instant.now().toString());
    session
        .putObject("runAuthorization")
        .put("authorizationId", UUID.randomUUID().toString())
        .put("kind", "scopedRun")
        .put("principalId", principal)
        .put("scopeHash", session.path("scopeHash").asText())
        .put("authorizedAt", Instant.now().toString());
    session
        .putArray("sourceSteps")
        .addObject()
        .put("stepId", stepId.toString())
        .put("requiresAssertion", false);
    tx.executeWithoutResult(
        status -> {
          completeSessionMetadata(session);
          sessions.insert(session);
          if (historicalV18) {
            com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture
                .freezeHistoricalV18Source(jdbc, tx, session);
          } else {
            com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture.freezeSource(
                jdbc, tx, session);
          }
        });
    var requirements = C.object().put("csiId", csiId).put("environment", environment);
    requirements.putArray("capabilities").add("step");
    requirements.putObject("initialContext").put("kind", "initialBlank");
    var base =
        tx.execute(
            status -> {
              sessions.lock(sessionId);
              return bases.capture(session, requirements, Instant.now());
            });
    return new Prepared(testId, sessionId, csiId, environment, principal, stepId, sourceText, base);
  }

  /** Finalizes and commits {@code prepared} through reserve/claim/finish/commit. */
  public static Published publishObserved(javax.sql.DataSource source, Prepared prepared) {
    return publishObserved(source, prepared, false);
  }

  private static Published publishObserved(
      javax.sql.DataSource source, Prepared prepared, boolean historicalV18) {
    var jdbc = new JdbcTemplate(source);
    var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    var sessions = new GuidedSessionRepository(jdbc, tx, C);
    var publications = new GuidedPublicationRepository(jdbc, C);
    String sessionId = prepared.sessionId();
    String csiId = prepared.csiId();
    String principal = prepared.principal();
    UUID testId = prepared.testId();
    var base = prepared.base();
    ObjectNode basis =
        tx.execute(
            status -> {
              var current = sessions.lock(sessionId);
              current.document().put("state", "OBSERVING");
              current
                  .document()
                  .putObject("owner")
                  .put("workerId", "worker")
                  .put("fence", 1)
                  .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
              sessions.save(current);
              ObjectNode exercised =
                  historicalV18
                      ? com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture
                          .completeHistoricalV18Session(jdbc, tx, sessionId, base)
                      : com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture
                          .completeExistingSession(jdbc, tx, sessionId, base);
              current = sessions.lock(sessionId);
              current.document().put("state", "FINALIZING");
              sessions.save(current);
              return exercised;
            });
    JsonNode plan = basis.path("translationPlan");
    var profile = currentProfile();
    var build = observedBuild(profile);
    var lowered = new ObservedArtifactLowerer(C).lower(basis, profile);
    var learned = (ObjectNode) lowered.learnedPlan();
    var policy = (ObjectNode) lowered.policy();
    var artifact = (ObjectNode) lowered.artifact();
    var hashes = (ObjectNode) lowered.hashes();
    var identity =
        C.object()
            .put("ownerWorkerId", "worker")
            .put("ownerFence", 1)
            .put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)))
            .put("translationHash", GuidedContracts.hash(plan))
            .put("basisHash", GuidedContracts.hash(basis));
    identity.set("base", base.document());
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "profileHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      identity.set(key, hashes.path(key));
    }
    identity.put("validationBuildHash", GuidedContracts.hash(build));
    var snapshot = new PublicationContracts.Snapshot(identity, basis);
    String finalizeDigest =
        GuidedContracts.hash(
            C.object()
                .put("sessionId", sessionId)
                .put("basisHash", GuidedContracts.hash(basis))
                .put("baseHash", GuidedContracts.hash(base.document())));
    var attempt =
        tx.execute(
            status -> {
              sessions.lock(sessionId);
              return publications.reserve(
                  new PublicationContracts.Claim(sessionId, "final", finalizeDigest, snapshot),
                  Instant.now());
            });
    tx.executeWithoutResult(
        status -> {
          sessions.lock(sessionId);
          publications.claim(
              sessionId, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
        });
    var verdict =
        C.object()
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString())
            .put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash())
            .put("basisHash", identity.path("basisHash").asText());
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      verdict.set(key, hashes.path(key));
    }
    verdict.put("schemaVersion", 3);
    verdict.set("admissionProvenanceHash", hashes.path("admissionProvenanceHash"));
    verdict.set("profile", profile);
    verdict.set("build", build);
    if (historicalV18) {
      ObjectNode badVerdict = verdict.deepCopy().put("basisHash", "0".repeat(64));
      assertThatThrownBy(
              () ->
                  tx.executeWithoutResult(
                      status -> {
                        sessions.lock(sessionId);
                        publications.finish(
                            sessionId,
                            attempt.attemptId(),
                            attempt.claimId(),
                            snapshot.hash(),
                            PublicationContracts.AttemptStatus.VALIDATED,
                            badVerdict,
                            null,
                            Instant.now());
                      }))
          .hasMessageContaining("EVIDENCE_MISMATCH");
      assertThat(
              jdbc.queryForObject(
                  "SELECT status FROM studio_guided_publication_attempts WHERE session_id=? AND"
                      + " attempt_id=?",
                  String.class,
                  sessionId,
                  attempt.attemptId()))
          .isEqualTo("VALIDATING");
    }
    tx.executeWithoutResult(
        status -> {
          sessions.lock(sessionId);
          publications.finish(
              sessionId,
              attempt.attemptId(),
              attempt.claimId(),
              snapshot.hash(),
              PublicationContracts.AttemptStatus.VALIDATED,
              verdict,
              null,
              Instant.now());
        });
    var command =
        new PublicationContracts.Commit(
            sessionId,
            UUID.randomUUID(),
            attempt.attemptId(),
            attempt.claimId(),
            "final",
            finalizeDigest,
            snapshot,
            new PublicationContracts.Candidate(learned, artifact, policy, hashes),
            new PublicationContracts.Grant(
                sessionId, principal, csiId, snapshot.hash(), attempt.validationDeadline()));
    if (historicalV18) {
      probeHistoricalAdapter(jdbc, tx, command);
    }
    tx.executeWithoutResult(
        status -> {
          sessions.lock(sessionId);
          if (historicalV18) {
            commitHistoricalV18(jdbc, tx, command, HistoricalFault.NONE);
          } else {
            publications.commit(command, Instant.now());
          }
          jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
        });
    if (historicalV18) {
      System.out.println(
          "[historical-v18-installed-authority] "
              + jdbc.queryForObject(
                  "SELECT"
                      + " jsonb_agg(jsonb_build_object('function',proname,'definition',pg_get_functiondef(oid))"
                      + " ORDER BY proname)::text FROM pg_proc WHERE"
                      + " pronamespace=current_schema()::regnamespace AND proname IN"
                      + " ('capture_ui_test_revision_authoring','ui_test_revisions_write_once',"
                      + "'studio_publication_receipt_guard','studio_publication_step_metadata_guard',"
                      + "'studio_execution_scope_immutable','studio_publication_epoch')",
                  String.class));
      System.out.println(
          "[historical-v18-enabled-guards] "
              + jdbc.queryForObject(
                  "SELECT jsonb_agg(jsonb_build_object('trigger',tgname,'enabled',tgenabled) ORDER"
                      + " BY tgname)::text FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN"
                      + " ('ui_test_revisions'::regclass,'ui_test_executions'::regclass,"
                      + "'studio_guided_publications'::regclass,'studio_guided_publication_attempts'::regclass)",
                  String.class));
      System.out.println(
          "[historical-v18-constraints] "
              + jdbc.queryForObject(
                  "SELECT jsonb_agg(jsonb_build_object('constraint',conname,'definition',"
                      + ("pg_get_constraintdef(oid),'validated',convalidated) ORDER BY conname):")
                      + (":text FROM pg_constraint WHERE conrelid IN ('ui_test_revisions'::regcl")
                      + ("ass,'ui_test_executions'::regclass,'studio_guided_publications'::regcl")
                      + ("ass,'studio_guided_publication_attempts'::regclass)"),
                  String.class));
      System.out.println(
          "[historical-v18-flyway] "
              + jdbc.queryForObject(
                  "SELECT jsonb_build_object('serverVersion',current_setting('server_vers"
                      + ("ion'),'migrations',(SELECT jsonb_agg(jsonb_build_object('version',vers")
                      + ("ion,'description',description,'checksum',checksum,'success',success) O")
                      + ("RDER BY installed_rank) FROM flyway_schema_history))::text"),
                  String.class));
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM ui_test_revisions r JOIN studio_guided_publications p ON"
                      + " p.revision_id=r.id AND p.session_id=r.guided_session_id JOIN"
                      + " studio_guided_publication_attempts a ON a.session_id=p.session_id AND"
                      + " a.attempt_id=p.attempt_id AND a.claim_id=p.claim_id WHERE r.id=? AND"
                      + " a.status='VALIDATED' AND p.snapshot_hash=? AND p.basis_hash=?",
                  Integer.class,
                  command.revisionId(),
                  snapshot.hash(),
                  GuidedContracts.hash(basis)))
          .isEqualTo(1);
      assertThat(
              C.parse(
                      jdbc.queryForObject(
                          "SELECT document::text FROM studio_guided_publications WHERE"
                              + " session_id=?",
                          String.class,
                          sessionId))
                  .path("publicReceipt")
                  .has("relearnedFrom"))
          .isFalse();
    }
    return new Published(
        testId, command.revisionId(), sessionId, csiId, prepared.environment(), principal);
  }

  private static PublicationContracts.Commit changedHistoricalCommand(
      PublicationContracts.Commit c,
      UUID attempt,
      UUID claim,
      PublicationContracts.Snapshot snapshot,
      PublicationContracts.Candidate candidate) {
    return new PublicationContracts.Commit(
        c.sessionId(),
        c.revisionId(),
        attempt,
        claim,
        c.finalizeKey(),
        c.finalizeDigest(),
        snapshot,
        candidate,
        c.grant());
  }

  private static String historicalRows(JdbcTemplate jdbc, PublicationContracts.Commit c) {
    return jdbc.queryForObject(
        "SELECT jsonb_build_object('draft',(SELECT to_jsonb(t) FROM ui_tests t WHERE id=?),"
            + " 'session',(SELECT to_jsonb(s) FROM studio_guided_sessions s WHERE session_id=?),"
            + " 'revision',(SELECT to_jsonb(r) FROM ui_test_revisions r WHERE id=?),"
            + " 'receipt',(SELECT to_jsonb(p) FROM studio_guided_publications p WHERE"
            + " session_id=?),'attempt',(SELECT to_jsonb(a) FROM studio_guided_publication_attempts"
            + " a WHERE session_id=? AND attempt_id=?))::text",
        String.class,
        UUID.fromString(c.snapshot().identity().path("base").path("testId").asText()),
        c.sessionId(),
        c.revisionId(),
        c.sessionId(),
        c.sessionId(),
        c.attemptId());
  }

  /** Each negative invokes actual prechecks or installed SQL guards and proves full rollback. */
  private static void probeHistoricalAdapter(
      JdbcTemplate jdbc, TransactionTemplate tx, PublicationContracts.Commit c) {
    String before = historicalRows(jdbc, c);
    ObjectNode wrongPolicy =
        PublicationContracts.copy(c.candidate().policy()).put("unexpectedHistoricalMutation", true);
    var wrongCandidate =
        new PublicationContracts.Candidate(
            c.candidate().learnedPlan(),
            c.candidate().artifact(),
            wrongPolicy,
            c.candidate().hashes());
    ObjectNode wrongIdentity =
        PublicationContracts.copy(c.snapshot().identity()).put("basisHash", "0".repeat(64));
    ObjectNode wrongBasis =
        PublicationContracts.copy(c.snapshot().basis()).put("translationRevision", "999");
    var invalid =
        List.of(
            changedHistoricalCommand(c, c.attemptId(), c.claimId(), c.snapshot(), wrongCandidate),
            changedHistoricalCommand(
                c, c.attemptId(), UUID.randomUUID(), c.snapshot(), c.candidate()),
            changedHistoricalCommand(
                c,
                c.attemptId(),
                c.claimId(),
                new PublicationContracts.Snapshot(wrongIdentity, c.snapshot().basis()),
                c.candidate()),
            changedHistoricalCommand(
                c,
                c.attemptId(),
                c.claimId(),
                new PublicationContracts.Snapshot(c.snapshot().identity(), wrongBasis),
                c.candidate()));
    for (var bad : invalid) {
      assertThatThrownBy(
              () ->
                  tx.executeWithoutResult(
                      status -> commitHistoricalV18(jdbc, tx, bad, HistoricalFault.NONE)))
          .hasMessageContaining("EVIDENCE_MISMATCH");
      assertThat(historicalRows(jdbc, c)).isEqualTo(before);
    }
    var absentAttempt =
        changedHistoricalCommand(c, UUID.randomUUID(), c.claimId(), c.snapshot(), c.candidate());
    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> commitHistoricalV18(jdbc, tx, absentAttempt, HistoricalFault.NONE)))
        .isInstanceOf(org.springframework.dao.EmptyResultDataAccessException.class);
    assertThat(historicalRows(jdbc, c)).isEqualTo(before);
    var expiredGrant =
        new PublicationContracts.Grant(
            c.sessionId(),
            c.grant().principalId(),
            c.grant().csiId(),
            c.snapshot().hash(),
            Instant.parse("2000-01-01T00:00:00Z"));
    var expired =
        new PublicationContracts.Commit(
            c.sessionId(),
            c.revisionId(),
            c.attemptId(),
            c.claimId(),
            c.finalizeKey(),
            c.finalizeDigest(),
            c.snapshot(),
            c.candidate(),
            expiredGrant);
    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> commitHistoricalV18(jdbc, tx, expired, HistoricalFault.NONE)))
        .hasMessageContaining("FORBIDDEN_SCOPE");
    assertThat(historicalRows(jdbc, c)).isEqualTo(before);
    var previous =
        jdbc.queryForList("SELECT id FROM ui_test_revisions ORDER BY created_at,id", UUID.class);
    if (!previous.isEmpty()) {
      assertThatThrownBy(
              () ->
                  tx.executeWithoutResult(
                      status -> {
                        jdbc.update(
                            "UPDATE ui_tests SET confirmed_revision_id=? WHERE id=?",
                            previous.getFirst(),
                            UUID.fromString(
                                c.snapshot().identity().path("base").path("testId").asText()));
                        commitHistoricalV18(jdbc, tx, c, HistoricalFault.NONE);
                      }))
          .hasMessageContaining("PUBLICATION_CONFLICT");
      assertThat(historicalRows(jdbc, c)).isEqualTo(before);
    }
    for (HistoricalFault fault :
        List.of(
            HistoricalFault.MISSING_RECEIPT,
            HistoricalFault.WRONG_RECEIPT_HASH,
            HistoricalFault.EXTRA_PUBLIC_FIELD,
            HistoricalFault.STALE_CAS,
            HistoricalFault.POST_WRITE)) {
      var failure =
          assertThatThrownBy(
              () -> tx.executeWithoutResult(status -> commitHistoricalV18(jdbc, tx, c, fault)));
      switch (fault) {
        case MISSING_RECEIPT ->
            failure
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class)
                .hasMessageContaining("fk_observed_revision_receipt")
                .satisfies(
                    error ->
                        assertThat(
                                ((java.sql.SQLException)
                                        ((org.springframework.dao.DataAccessException) error)
                                            .getMostSpecificCause())
                                    .getSQLState())
                            .isEqualTo("23503"));
        case WRONG_RECEIPT_HASH, EXTRA_PUBLIC_FIELD ->
            failure
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .hasMessageContaining("publication receipt shape invalid")
                .satisfies(
                    error ->
                        assertThat(
                                ((java.sql.SQLException)
                                        ((org.springframework.dao.DataAccessException) error)
                                            .getMostSpecificCause())
                                    .getSQLState())
                            .isEqualTo("P0001"));
        case STALE_CAS -> failure.hasMessageContaining("PUBLICATION_CONFLICT");
        case POST_WRITE -> failure.hasMessage("historical-fault-after-write");
        default -> throw new AssertionError(fault);
      }
      assertThat(historicalRows(jdbc, c)).isEqualTo(before);
    }
    // All real authority mutations remain rollback-scoped. Immutable attempt facts are never
    // edited.
    for (String mutation :
        List.of(
            "UPDATE ui_tests SET source_revision=source_revision+1 WHERE id=?",
            "UPDATE ui_tests SET configuration_revision=configuration_revision+1 WHERE id=?",
            "UPDATE ui_tests SET confirmed_revision_id=NULL WHERE id=?",
            "UPDATE studio_guided_sessions SET"
                + " state='OBSERVING',document=jsonb_set(document,'{state}','\"OBSERVING\"') WHERE"
                + " session_id=?",
            "UPDATE studio_guided_sessions SET"
                + " document=jsonb_set(document,'{owner,workerId}','\"wrong-worker\"') WHERE"
                + " session_id=?",
            "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,fence}','2')"
                + " WHERE session_id=?",
            "UPDATE studio_guided_sessions SET"
                + " document=jsonb_set(document,'{owner,leaseExpiresAt}','\"2000-01-01T00:00:00Z\"')"
                + " WHERE session_id=?",
            "UPDATE studio_guided_sessions SET"
                + " expires_at='2000-01-01',document=jsonb_set(document,'{expiresAt}','\"2000-01-01T00:00:00Z\"')"
                + " WHERE session_id=?")) {
      // A null->null pointer mutation is intentionally excluded when there is no prior pointer.
      if (mutation.contains("confirmed_revision_id=NULL")
          && c.snapshot().identity().path("base").path("confirmedRevisionId").isNull()) {
        continue;
      }
      assertThatThrownBy(
              () ->
                  tx.executeWithoutResult(
                      status -> {
                        jdbc.update(
                            mutation,
                            mutation.startsWith("UPDATE ui_tests")
                                ? UUID.fromString(
                                    c.snapshot().identity().path("base").path("testId").asText())
                                : c.sessionId());
                        commitHistoricalV18(jdbc, tx, c, HistoricalFault.NONE);
                      }))
          .isInstanceOf(RuntimeException.class);
      assertThat(historicalRows(jdbc, c)).isEqualTo(before);
    }
  }

  private enum HistoricalFault {
    NONE,
    MISSING_RECEIPT,
    WRONG_RECEIPT_HASH,
    EXTRA_PUBLIC_FIELD,
    STALE_CAS,
    POST_WRITE
  }

  /** Exact V18 installed-SQL fixture writer. Never entered by any current-head publication. */
  private static PublicationContracts.Receipt commitHistoricalV18(
      JdbcTemplate jdbc,
      TransactionTemplate tx,
      PublicationContracts.Commit commit,
      HistoricalFault fault) {
    com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture.requireV18(jdbc);
    require(
        org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    var sessions = new GuidedSessionRepository(jdbc, tx, C);
    var locked = sessions.lock(commit.sessionId());
    JsonNode session = locked.document();
    var bases = new GuidedPublicationBaseRepository(jdbc, C);
    JsonNode draft = bases.lockCurrent(UUID.fromString(session.path("testId").asText())).document();
    JsonNode captured =
        C.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_publication_bases WHERE session_id=? FOR"
                    + " UPDATE",
                String.class,
                commit.sessionId()));
    var a =
        jdbc.queryForObject(
            "SELECT attempt_id,claim_id,attempt_number,status,validation_deadline,i"
                + ("dentity::text,validator_receipt::text,failure_code FROM studio_guided_")
                + ("publication_attempts WHERE session_id=? AND attempt_id=? FOR UPDATE"),
            (rs, n) ->
                new PublicationContracts.Attempt(
                    commit.sessionId(),
                    rs.getObject(1, UUID.class),
                    rs.getObject(2, UUID.class),
                    rs.getInt(3),
                    PublicationContracts.AttemptStatus.valueOf(rs.getString(4)),
                    rs.getTimestamp(5).toInstant(),
                    C.parse(rs.getString(6)),
                    rs.getString(7) == null ? null : C.parse(rs.getString(7)),
                    rs.getString(8)),
            commit.sessionId(),
            commit.attemptId());
    require(
        a != null
            && a.status() == PublicationContracts.AttemptStatus.VALIDATED
            && a.claimId().equals(commit.claimId())
            && a.identity().path("snapshotHash").asText().equals(commit.snapshot().hash())
            && a.identity().path("finalizeKey").asText().equals(commit.finalizeKey())
            && a.identity().path("finalizeDigest").asText().equals(commit.finalizeDigest()),
        "EVIDENCE_MISMATCH",
        422);
    var fields = commit.snapshot().identity().fields();
    while (fields.hasNext()) {
      var field = fields.next();
      require(a.identity().path(field.getKey()).equals(field.getValue()), "EVIDENCE_MISMATCH", 422);
    }
    Instant wall =
        jdbc.queryForObject("SELECT clock_timestamp()", (rs, n) -> rs.getTimestamp(1).toInstant());
    require(
        session.path("state").asText().equals("FINALIZING")
            && session.path("testId").equals(captured.path("testId"))
            && session.path("scopeHash").equals(captured.path("scopeHash"))
            && session.path("runAuthorization").equals(captured.path("runAuthorization"))
            && session.path("scope").path("csiId").equals(captured.path("csiId"))
            && session.path("owner").path("workerId").equals(a.identity().path("ownerWorkerId"))
            && session.path("owner").path("fence").equals(a.identity().path("ownerFence"))
            && Instant.parse(session.path("owner").path("leaseExpiresAt").asText()).isAfter(wall)
            && Instant.parse(session.path("expiresAt").asText()).isAfter(wall)
            && a.validationDeadline().isAfter(wall),
        "PUBLICATION_CONFLICT",
        409);
    require(
        captured.equals(a.identity().path("base"))
            && captured.equals(commit.snapshot().identity().path("base")),
        "EVIDENCE_MISMATCH",
        422);
    bases.requireCurrent(
        new PublicationContracts.Base(captured), new PublicationContracts.CurrentSource(draft));
    require(
        jdbc.queryForObject(
                "SELECT p.plan_hash FROM studio_guided_translation_state s JOIN"
                    + " studio_guided_translation_plans p USING(session_id,plan_revision) WHERE"
                    + " s.session_id=?",
                String.class,
                commit.sessionId())
            .equals(a.identity().path("translationHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    require(
        jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND"
                        + " (document->>'state'<>'SUCCEEDED' OR document->>'dispatchCount'<>'1')",
                    Integer.class,
                    commit.sessionId())
                == 0
            && jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND"
                        + " status IN ('RESERVED','CALLING')",
                    Integer.class,
                    commit.sessionId())
                == 0
            && !commit.snapshot().basis().path("actions").isEmpty(),
        "EVIDENCE_MISMATCH",
        422);
    verifyHistoricalVerdict(a, a.verdict());
    JsonNode base = captured;
    var grant = commit.grant();
    require(
        grant.sessionId().equals(commit.sessionId())
            && grant.snapshotHash().equals(commit.snapshot().hash())
            && grant.principalId().equals(base.path("originalPrincipalId").asText())
            && grant.csiId().equals(base.path("csiId").asText())
            && grant.expiresAt().isAfter(wall)
            && !grant.expiresAt().isAfter(a.validationDeadline()),
        "FORBIDDEN_SCOPE",
        403);
    var candidate = commit.candidate();
    verifyHistoricalCandidate(commit.snapshot(), candidate, a.verdict());
    jdbc.execute("SET CONSTRAINTS ALL DEFERRED");
    JsonNode current = bases.lockCurrent(UUID.fromString(base.path("testId").asText())).document();
    JsonNode basis = commit.snapshot().basis();
    var source = C.object().putArray("items");
    for (JsonNode step : basis.path("sourceSteps")) {
      source.add(step.path("source"));
    }
    require(
        basis
                .path("snapshotEvidence")
                .path("current")
                .path("authoring")
                .equals(current.path("authoring"))
            && basis
                .path("snapshotEvidence")
                .path("current")
                .path("authoredDeclarations")
                .equals(current.path("authoredDeclarations")),
        "PUBLICATION_CONFLICT",
        409);
    jdbc.update(
        "UPDATE ui_tests SET authoring_revision_inputs=?::jsonb WHERE id=?",
        current.path("authoringRevisionInputs").toString(),
        UUID.fromString(base.path("testId").asText()));
    ObjectNode references = C.object().put("authoringIdentityVersion", 1);
    references.set("authoredDeclarations", current.path("authoredDeclarations"));
    var variables = references.putArray("variables");
    var secrets = references.putArray("secrets");
    var seen =
        new java.util.TreeSet<String>(
            com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.UTF8);
    var secretNames =
        new java.util.TreeSet<String>(
            com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.UTF8);
    for (JsonNode ref : basis.path("configurationReferences")) {
      if (ref.path("kind").asText().equals("secretRef")) {
        secretNames.add(ref.path("referenceName").asText());
      } else {
        seen.add(ref.path("referenceName").asText());
      }
    }
    seen.forEach(variables::add);
    secretNames.forEach(secrets::add);
    ObjectNode provenance = PublicationContracts.copy(candidate.hashes());
    provenance.set("profile", candidate.artifact().path("profile"));
    provenance.put("guidedSessionId", commit.sessionId()).put("publicationKind", "GUIDED_RUN");
    provenance.set("runAuthorization", base.path("runAuthorization"));
    jdbc.update(
        "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,config"
            + ("uration_revision,source,source_hash,artifact,artifact_hash,artifact_sc")
            + ("hema_version,configuration,\"references\",provenance,created_by,confirme")
            + ("d_by,confirmed_at,confirmation_source,reference_policy,publication_kin")
            + ("d,guided_session_id,learned_plan_hash,revision_digest,step_snapshot_ha")
            + ("shes,step_reuse_provenance) VALUES (?,?,?,?,?,?::jsonb,?,?::jsonb,?,3,")
            + ("?::jsonb,?::jsonb,?::jsonb,?,?,?,'GUIDED_RUN',?::jsonb,'GUIDED_RUN',?,")
            + ("?,?,?::jsonb,?::jsonb)"),
        commit.revisionId(),
        UUID.fromString(base.path("testId").asText()),
        base.path("csiId").asText(),
        Long.parseLong(base.path("sourceRevision").asText()),
        Long.parseLong(base.path("configurationRevision").asText()),
        source.toString(),
        candidate.hashes().path("sourceHash").asText(),
        candidate.artifact().toString(),
        candidate.hashes().path("artifactHash").asText(),
        current.path("configuration").toString(),
        references.toString(),
        provenance.toString(),
        grant.principalId(),
        grant.principalId(),
        Timestamp.from(PublicationContracts.millisecond(wall)),
        candidate.policy().toString(),
        commit.sessionId(),
        candidate.hashes().path("learnedPlanHash").asText(),
        candidate.hashes().path("revisionDigest").asText(),
        candidate.learnedPlan().path("stepSnapshotHashes").toString(),
        candidate.learnedPlan().path("reusedFrom").toString());
    JsonNode inserted =
        C.parse(
            jdbc.queryForObject(
                "SELECT authoring::text FROM ui_test_revisions WHERE id=?",
                String.class,
                commit.revisionId()));
    require(inserted.equals(current.path("authoring")), "PUBLICATION_CONFLICT", 409);
    ObjectNode document =
        C.object()
            .put("sessionId", commit.sessionId())
            .put("revisionId", commit.revisionId().toString())
            .put("testId", base.path("testId").asText())
            .put("csiId", base.path("csiId").asText())
            .put("originalPrincipalId", grant.principalId())
            .put("finalizeKey", a.identity().path("finalizeKey").asText())
            .put("finalizeDigest", commit.finalizeDigest())
            .put("attemptId", commit.attemptId().toString())
            .put("claimId", commit.claimId().toString())
            .put("snapshotHash", commit.snapshot().hash())
            .put("basisHash", a.identity().path("basisHash").asText())
            .put("publishedAt", PublicationContracts.time(wall));
    for (String key :
        List.of(
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash",
            "revisionDigest",
            "profileHash")) {
      document.set(key, candidate.hashes().path(key));
    }
    ObjectNode publicReceipt =
        document
            .putObject("publicReceipt")
            .put("schemaVersion", 3)
            .put("sessionId", commit.sessionId())
            .put("revisionId", commit.revisionId().toString())
            .put("publishedAt", PublicationContracts.time(wall))
            .put("learnedFromThisRun", true)
            .put("replayVerified", false);
    for (String key :
        List.of("revisionDigest", "learnedPlanHash", "artifactHash", "publicationEvidenceHash")) {
      publicReceipt.set(key, candidate.hashes().path(key));
    }
    if (fault == HistoricalFault.WRONG_RECEIPT_HASH) {
      document.put("artifactHash", "0".repeat(64));
    }
    if (fault == HistoricalFault.EXTRA_PUBLIC_FIELD) {
      publicReceipt.putNull("relearnedFrom");
    }
    if (fault != HistoricalFault.MISSING_RECEIPT) {
      jdbc.update(
          "INSERT INTO"
              + " studio_guided_publications(session_id,revision_id,test_id,csi_id"
              + ",attempt_id,claim_id,snapshot_hash,basis_hash,document,learned_pl"
              + "an,published_at)"
              + " VALUES (?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?)",
          commit.sessionId(),
          commit.revisionId(),
          UUID.fromString(base.path("testId").asText()),
          base.path("csiId").asText(),
          commit.attemptId(),
          commit.claimId(),
          commit.snapshot().hash(),
          a.identity().path("basisHash").asText(),
          document.toString(),
          candidate.learnedPlan().toString(),
          Timestamp.from(PublicationContracts.millisecond(wall)));
    }
    if (fault == HistoricalFault.STALE_CAS) {
      jdbc.update(
          "UPDATE ui_tests SET deleted_at=clock_timestamp() WHERE id=?",
          UUID.fromString(base.path("testId").asText()));
    }
    int changed =
        jdbc.update(
            "UPDATE ui_tests SET confirmed_revision_id=?"
                + " WHERE id=? AND source_revision=? AND configuration_revision=? AND"
                + " publication_epoch=? AND"
                + " confirmed_revision_id IS NOT DISTINCT FROM ?::uuid AND deleted_at IS NULL AND"
                + " quarantined_at IS NULL AND clock_timestamp()<? AND EXISTS(SELECT 1 FROM"
                + " studio_guided_sessions WHERE session_id=? AND state='FINALIZING' AND"
                + " expires_at>clock_timestamp() AND"
                + " (document->'owner'->>'leaseExpiresAt')::timestamptz>clock_timestamp())",
            commit.revisionId(),
            UUID.fromString(base.path("testId").asText()),
            Long.parseLong(base.path("sourceRevision").asText()),
            Long.parseLong(base.path("configurationRevision").asText()),
            Long.parseLong(base.path("publicationEpoch").asText()),
            base.path("confirmedRevisionId").isNull()
                ? null
                : base.path("confirmedRevisionId").asText(),
            Timestamp.from(grant.expiresAt()),
            commit.sessionId());
    require(changed == 1, "PUBLICATION_CONFLICT", 409);
    require(
        jdbc.update(
                "UPDATE studio_guided_sessions SET"
                    + " state='SUCCEEDED',document=jsonb_set(document,'{state}','\"SUCCE"
                    + "EDED\"'),progress=progress||jsonb_build_object('publicationRevisi"
                    + "onId',?::text,'publicationRevisionDigest',?::text)"
                    + " WHERE session_id=? AND state='FINALIZING'",
                commit.revisionId().toString(),
                candidate.hashes().path("revisionDigest").asText(),
                commit.sessionId())
            == 1,
        "PUBLICATION_CONFLICT",
        409);
    jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
    if (fault == HistoricalFault.POST_WRITE) {
      throw new IllegalStateException("historical-fault-after-write");
    }
    return new PublicationContracts.Receipt(document);
  }

  private static void verifyHistoricalCandidate(
      PublicationContracts.Snapshot snapshot, PublicationContracts.Candidate c, JsonNode verdict) {
    PublicationContracts.Candidate recomputed =
        new ObservedArtifactLowerer(C).lower(snapshot.basis(), c.artifact().path("profile"));
    require(
        recomputed.learnedPlan().equals(c.learnedPlan())
            && recomputed.artifact().equals(c.artifact())
            && recomputed.policy().equals(c.policy())
            && recomputed.hashes().equals(c.hashes()),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode h = c.hashes(), b = snapshot.basis();
    require(
        GuidedContracts.hash(b).equals(snapshot.identity().path("basisHash").asText())
            && GuidedContracts.hash(c.artifact()).equals(h.path("artifactHash").asText())
            && GuidedContracts.hash(c.learnedPlan()).equals(h.path("learnedPlanHash").asText())
            && GuidedContracts.hash(c.policy()).equals(h.path("referencePolicyHash").asText())
            && c.artifact().path("learnedPlan").equals(c.learnedPlan())
            && c.artifact().path("replayPolicy").equals(c.policy()),
        "EVIDENCE_MISMATCH",
        422);
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      require(
          h.path(key).equals(verdict.path(key))
              && h.path(key).equals(snapshot.identity().path(key)),
          "EVIDENCE_MISMATCH",
          422);
    }
    for (String key :
        List.of("sourceHash", "configurationHash", "authoringHash", "runAuthorizationHash")) {
      require(
          h.path(key).equals(snapshot.identity().path("base").path(key)), "EVIDENCE_MISMATCH", 422);
    }
    require(
        h.path("admissionProvenanceHash").equals(verdict.path("admissionProvenanceHash")),
        "EVIDENCE_MISMATCH",
        422);
    require(
        GuidedContracts.hash(c.artifact().path("profile")).equals(h.path("profileHash").asText()),
        "PROFILE_MISMATCH",
        409);
    ObjectNode digest = C.object().put("version", 1);
    for (String key : List.of("testId", "csiId", "sourceRevision", "configurationRevision")) {
      digest.set(key, b.path(key));
    }
    for (String key :
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
      digest.set(key, h.path(key));
    }
    require(
        GuidedContracts.hash(digest).equals(h.path("revisionDigest").asText()),
        "EVIDENCE_MISMATCH",
        422);
  }

  private static void verifyHistoricalVerdict(PublicationContracts.Attempt a, JsonNode v) {
    require(
        v != null
            && v.path("ok").isBoolean()
            && v.path("ok").asBoolean()
            && v.path("errorCode").isNull()
            && v.path("attemptId").asText().equals(a.attemptId().toString())
            && v.path("claimId").asText().equals(a.claimId().toString()),
        "EVIDENCE_MISMATCH",
        422);
    for (String key :
        List.of(
            "snapshotHash",
            "basisHash",
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      require(v.path(key).equals(a.identity().path(key)), "EVIDENCE_MISMATCH", 422);
    }
    require(
        GuidedContracts.hash(v.path("profile")).equals(a.identity().path("profileHash").asText())
            && GuidedContracts.hash(v.path("build"))
                .equals(a.identity().path("validationBuildHash").asText()),
        "PROFILE_MISMATCH",
        409);
  }

  private static void completeSessionMetadata(ObjectNode session) {
    session.put("schemaVersion", 3).put("createdAt", PublicationContracts.time(Instant.now()));
    session.putObject("versions").put("contract", 3);
    session.set(
        "limits",
        new com.citi.put.checks.studio.guided.session.GuidedSessionProperties(true, Map.of())
            .snapshot(C));
    ObjectNode counters = session.putObject("counters");
    for (String field :
        List.of(
            "actions",
            "observations",
            "modelProposals",
            "modelInputTokens",
            "modelOutputTokens",
            "sanitizedEvidenceBytes")) {
      counters.put(field, 0);
    }
  }

  private static void ordinaryScope(ObjectNode scope, String environment) {
    scope
        .put("environmentId", environment)
        .put("modelDataPolicyId", "fixture-model-policy")
        .putNull("valueTransferPolicyId");
    scope.putArray("capabilities").add("observe").add("step");
  }

  private static JsonNode approvedFixturePrivateValues() {
    try {
      return C.parse(
              Files.readString(
                  Path.of(
                      "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")))
          .path("snapshotAuthority")
          .path("sourceManifest")
          .path("configurationValues");
    } catch (java.io.IOException failure) {
      throw new IllegalStateException("Approved private fixture authority unavailable", failure);
    }
  }

  private static List<com.citi.put.checks.studio.dto.StudioVariable> sharedFixtureVariables(
      JsonNode basis) {
    var result = new java.util.ArrayList<com.citi.put.checks.studio.dto.StudioVariable>();
    JsonNode values = approvedFixturePrivateValues();
    for (JsonNode declaration :
        basis.path("snapshotEvidence").path("current").path("authoredDeclarations")) {
      String name = declaration.path("referenceId").asText();
      if (declaration.path("kind").asText().equals("plain")) {
        JsonNode value = values.path(name);
        if (!value.isTextual()
            || !GuidedContracts.hash(value).equals(declaration.path("valueHash").asText())) {
          throw new IllegalArgumentException(
              "Fixture plain declaration lacks exact approved private value: " + name);
        }
        result.add(com.citi.put.checks.studio.dto.StudioVariable.plain(name, value.asText()));
      } else {
        result.add(
            com.citi.put.checks.studio.dto.StudioVariable.secretRef(
                name, declaration.path("secretId").asText()));
      }
    }
    return result;
  }

  private static ObjectNode privateFixtureInputs(JsonNode basis, String session, String scopeHash) {
    ObjectNode payload =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", session)
            .put("scopeHash", scopeHash)
            .put("sourceRevision", basis.path("sourceRevision").asText())
            .put("configurationRevision", basis.path("configurationRevision").asText());
    var inputs = payload.putArray("inputs");
    JsonNode values = approvedFixturePrivateValues();
    for (JsonNode entry : basis.path("materializationEvidence").path("entries")) {
      ObjectNode input = ((ObjectNode) entry.path("metadata")).deepCopy();
      if (!input.path("kind").asText().equals("secretRef")) {
        JsonNode provenance = input.path("provenance");
        String value;
        if (provenance.path("referenceKind").asText().equals("sourceSpan")) {
          JsonNode source = null;
          for (JsonNode step : basis.path("sourceSteps")) {
            if (step.path("stepId").equals(input.path("sourceStepId"))) {
              source = step.path("source");
            }
          }
          int start = provenance.path("startUtf16").asInt(-1),
              end = provenance.path("endUtf16").asInt(-1);
          if (source == null
              || !source.isTextual()
              || start < 0
              || end < start
              || end > source.asText().length()) {
            throw new IllegalArgumentException(
                "Fixture span cannot reconstruct exact private input");
          }
          value = source.asText().substring(start, end);
        } else {
          String reference = provenance.path("referenceId").asText(), name = reference;
          for (JsonNode declared : basis.path("configurationReferences")) {
            if (declared.path("referenceId").asText().equals(reference)) {
              name = declared.path("referenceName").asText();
            }
          }
          JsonNode raw = values.path(name);
          if (!raw.isTextual()) {
            throw new IllegalArgumentException(
                "Fixture private input has no exact value authority: " + reference);
          }
          value = raw.asText();
        }
        input.put("value", value);
      }
      if (!GuidedContracts.hash(input).equals(entry.path("inputHash").asText())) {
        throw new IllegalArgumentException(
            "Fixture private input differs from committed safe metadata/hash: "
                + input.path("inputId").asText());
      }
      inputs.add(input);
    }
    return payload;
  }

  /** Complete canonical map metadata for low-level ordinary publication fixtures. */
  public static void completeLearnedMetadata(JdbcTemplate jdbc, UUID testId, ObjectNode learned) {
    try {
      ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
      AuthoringV2Request authoring =
          mapper.readValue(
              jdbc.queryForObject(
                  "SELECT authoring::text FROM ui_tests WHERE id=?", String.class, testId),
              AuthoringV2Request.class);
      var variables =
          com.citi.put.checks.studio.dto.CanonicalStudioCodec.parseVariables(
              jdbc.queryForObject(
                  "SELECT variables::text FROM ui_tests WHERE id=?", String.class, testId));
      var identity =
          com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
              authoring, variables);
      JsonNode configuration =
          C.parse(
              jdbc.queryForObject(
                  "SELECT jsonb_build_object('browser',browser,'viewport',jsonb_build_obj"
                      + ("ect('width',viewport_width,'height',viewport_height),'timeoutSeconds',")
                      + ("timeout_seconds,'waitStrategy',wait_strategy,'environment',environment")
                      + (")::text FROM ui_tests WHERE id=?"),
                  String.class,
                  testId));
      if (!learned.has("actions")) {
        learned.putArray("actions");
      }
      if (!learned.has("bindings")) {
        learned.putArray("bindings");
      }
      learned.set(
          "stepSnapshotHashes",
          com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.snapshots(
              authoring, identity, configuration, learned));
      learned.putObject("reusedFrom");
      learned.putNull("incremental");
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(
          "Canonical publication fixture identity unavailable", failure);
    }
  }

  /** A closed five-field build identity for {@code profile}; fixed synthetic digests. */
  public static ObjectNode observedBuild(JsonNode profile) {
    return C.object()
        .put("profileHash", GuidedContracts.hash(profile))
        .put("schemaBundleHash", "b".repeat(64))
        .put("referenceBundleHash", "c".repeat(64))
        .put("executableImageDigest", "d".repeat(64))
        .put("chromiumBuild", "chromium-test");
  }

  /**
   * The {@code observed_revision_binding} an accepted execution of {@code revisionId} must carry,
   * read from the committed revision and publication rows (never transcribed), for the given row
   * identity. The replay grant is issued now and expires within the 30 s bound the guard enforces.
   */
  public static ObjectNode observedBinding(
      JdbcTemplate jdbc, UUID revisionId, UUID executionId, Instant startedAt, String principal) {
    var row =
        jdbc.queryForMap(
            "SELECT r.test_id::text AS test_id,r.csi_id,r.revision_digest,r.artifac"
                + ("t_hash,r.learned_plan_hash,studio_publication_hash(r.configuration) AS")
                + (" configuration_hash,studio_publication_hash(r.reference_policy) AS ref")
                + ("erence_policy_hash,r.configuration->>'environment' AS environment,(r.r")
                + ("eference_policy->'scope')::text AS scope,(r.artifact->'profile')::text")
                + (" AS profile,p.document->>'publicationEvidenceHash' AS evidence FROM ui")
                + ("_test_revisions r JOIN studio_guided_publications p ON p.revision_id=r")
                + (".id WHERE r.id=?"),
            revisionId);
    var profile = C.parse(String.valueOf(row.get("profile")));
    var build = observedBuild(profile);
    var scope = PublicationContracts.copy(C.parse(String.valueOf(row.get("scope"))));
    scope.put("principalId", principal);
    String scopeHash = GuidedContracts.hash(scope);
    Instant issued = databaseNow(jdbc);
    UUID attempt = UUID.randomUUID();
    var grant =
        C.object()
            .put("version", 1)
            .put("grantId", UUID.randomUUID().toString())
            .put("executionId", executionId.toString())
            .put("attemptId", attempt.toString())
            .put("revisionId", revisionId.toString())
            .put("revisionDigest", String.valueOf(row.get("revision_digest")))
            .put("principalId", principal)
            .put("csiId", String.valueOf(row.get("csi_id")))
            .put("scopeHash", scopeHash)
            .put("profileHash", GuidedContracts.hash(profile))
            .put("buildHash", GuidedContracts.hash(build))
            .put("issuedAt", wire(issued))
            .put("expiresAt", wire(issued.plusSeconds(25)));
    var binding =
        C.object()
            .put("version", 1)
            .put("executionId", executionId.toString())
            .put("startedAt", wire(startedAt))
            .put("attemptId", attempt.toString())
            .put("revisionId", revisionId.toString())
            .put("testId", String.valueOf(row.get("test_id")))
            .put("csiId", String.valueOf(row.get("csi_id")))
            .put("principalId", principal)
            .put("environment", String.valueOf(row.get("environment")))
            .put("scopeHash", scopeHash)
            .put("revisionDigest", String.valueOf(row.get("revision_digest")))
            .put("artifactHash", String.valueOf(row.get("artifact_hash")))
            .put("configurationHash", String.valueOf(row.get("configuration_hash")))
            .put("learnedPlanHash", String.valueOf(row.get("learned_plan_hash")))
            .put("referencePolicyHash", String.valueOf(row.get("reference_policy_hash")))
            .put("publicationEvidenceHash", String.valueOf(row.get("evidence")));
    binding.set("requiredProfile", profile);
    binding.set("requiredBuild", build);
    binding.set("scope", scope);
    binding.set("replayGrant", grant);
    return binding;
  }

  static void testObservedBinding(
      Database db,
      UUID revision,
      PublicationContracts.Base base,
      ObjectNode hashes,
      com.fasterxml.jackson.databind.JsonNode profile,
      ObjectNode build) {
    Instant started = databaseNow(db.jdbc);
    String at = wire(started), expires = wire(started.plusSeconds(25));
    UUID execution = UUID.randomUUID(), attempt = UUID.randomUUID(), grantId = UUID.randomUUID();
    var scope =
        PublicationContracts.copy(base.document().path("replayRequirements"))
            .put("principalId", "owner@example.test");
    String scopeHash = GuidedContracts.hash(scope);
    var grant =
        C.object()
            .put("version", 1)
            .put("grantId", grantId.toString())
            .put("executionId", execution.toString())
            .put("attemptId", attempt.toString())
            .put("revisionId", revision.toString())
            .put("revisionDigest", hashes.path("revisionDigest").asText())
            .put("principalId", "owner@example.test")
            .put("csiId", "CSI")
            .put("scopeHash", scopeHash)
            .put("profileHash", GuidedContracts.hash(profile))
            .put("buildHash", GuidedContracts.hash(build))
            .put("issuedAt", at)
            .put("expiresAt", expires);
    var binding =
        C.object()
            .put("version", 1)
            .put("executionId", execution.toString())
            .put("startedAt", at)
            .put("attemptId", attempt.toString())
            .put("revisionId", revision.toString())
            .put("testId", db.testId.toString())
            .put("csiId", "CSI")
            .put("principalId", "owner@example.test")
            .put("environment", "Development")
            .put("scopeHash", scopeHash);
    for (String key :
        List.of(
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash")) {
      binding.set(key, hashes.path(key));
    }
    binding.set("requiredProfile", profile);
    binding.set("requiredBuild", build);
    binding.set("scope", scope);
    binding.set("replayGrant", grant);
    String insert =
        "INSERT INTO"
            + " ui_test_executions(id,ui_test_id,status,started_at,ended_at,dura"
            + "tion_ms,revision_id,csi_id,principal,environment,observed_revisio"
            + "n_binding)"
            + " VALUES (?,?,'PENDING',?,?,0,?,'CSI','owner@example.test','Development',?::jsonb)";
    for (String key : List.of("requiredBuild", "replayGrant", "attemptId", "scope")) {
      var invalid = binding.deepCopy();
      invalid.remove(key);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      insert,
                      execution,
                      db.testId,
                      java.sql.Timestamp.from(started),
                      java.sql.Timestamp.from(started),
                      revision,
                      invalid.toString()))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
      var nulled = binding.deepCopy();
      nulled.putNull(key);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      insert,
                      execution,
                      db.testId,
                      java.sql.Timestamp.from(started),
                      java.sql.Timestamp.from(started),
                      revision,
                      nulled.toString()))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    for (String obsolete : List.of("accountAuthorization", "accountHandle")) {
      var rejected = binding.deepCopy();
      rejected.putObject(obsolete).put("version", 1);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      insert,
                      execution,
                      db.testId,
                      java.sql.Timestamp.from(started),
                      java.sql.Timestamp.from(started),
                      revision,
                      rejected.toString()))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    var extra = binding.deepCopy().put("cookie", "must-not-persist");
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    insert,
                    execution,
                    db.testId,
                    java.sql.Timestamp.from(started),
                    java.sql.Timestamp.from(started),
                    revision,
                    extra.toString()))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    var wrong = binding.deepCopy().put("version", "1");
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    insert,
                    execution,
                    db.testId,
                    java.sql.Timestamp.from(started),
                    java.sql.Timestamp.from(started),
                    revision,
                    wrong.toString()))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    insert,
                    execution,
                    db.testId,
                    java.sql.Timestamp.from(started.plusNanos(123000)),
                    java.sql.Timestamp.from(started),
                    revision,
                    binding.toString()))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    db.jdbc.update(
        insert,
        execution,
        db.testId,
        java.sql.Timestamp.from(started),
        java.sql.Timestamp.from(started),
        revision,
        binding.toString());
    var request =
        C.object()
            .put("schemaVersion", 3)
            .put("kind", "observed")
            .put("runnerInstanceId", "runner")
            .put("admissionId", UUID.randomUUID().toString())
            .put("grantId", grantId.toString());
    for (String key :
        List.of(
            "executionId",
            "startedAt",
            "attemptId",
            "revisionId",
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash",
            "scopeHash")) {
      request.set(key, binding.path(key));
    }
    request.set("profile", profile);
    request.set("build", build);
    var receipt =
        C.object()
            .put("schemaVersion", 3)
            .put("kind", "observed")
            .put("admissionId", request.path("admissionId").asText())
            .put("admittedAt", at)
            .put("startDeadlineAt", wire(started.plusSeconds(10)))
            .put("runDeadlineAt", wire(started.plusSeconds(120)));
    receipt.set("request", request);
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
                    receipt.toString(),
                    execution))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    db.jdbc.update(
        "INSERT INTO"
            + " studio_dispatch_ledger(execution_id,execution_accepted_at,test_i"
            + "d,csi_id,principal,state,attempt_id,admission_id,runner_instance_"
            + "id,start_deadline_at,run_deadline_at)"
            + " VALUES (?,?,?,'CSI','owner@example.test','ADMITTED',?,?,'runner',?,?)",
        execution,
        java.sql.Timestamp.from(started),
        db.testId,
        attempt,
        UUID.fromString(request.path("admissionId").asText()),
        java.sql.Timestamp.from(started.plusSeconds(10)),
        java.sql.Timestamp.from(started.plusSeconds(120)));
    var incorrect = receipt.deepCopy();
    ((ObjectNode) incorrect.path("request")).put("scopeHash", "a".repeat(64));
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
                    incorrect.toString(),
                    execution))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    db.jdbc.update(
        "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
        receipt.toString(),
        execution);
    db.jdbc.update(
        "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
        receipt.toString(),
        execution);
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    "UPDATE ui_test_executions SET observed_admission_receipt=NULL WHERE id=?",
                    execution))
        .hasMessageContaining("immutable");
  }

  @Test
  void realLegacyChromeUpgradeAndMillisecondNormalization() throws Exception {
    try (var pg = new TestPostgresDatabase()) {
      pg.start();
      var ds = new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
      var jdbc = new JdbcTemplate(ds);
      Flyway.configure().dataSource(ds).target("11").load().migrate();
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES ('legacy','legacy','legacy@example.test')");
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
              + " VALUES ('LEGACY','legacy','unit','LOW','legacy@example.test','Development')");
      var id = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by) VALUES"
              + " (?,'legacy','LEGACY','Development','chrome','[]','legacy@example.test')",
          id);
      assertThat(jdbc.queryForObject("SELECT browser FROM ui_tests WHERE id=?", String.class, id))
          .isEqualTo("chrome");
      Flyway.configure().dataSource(ds).load().migrate();
      jdbc.update(
          "UPDATE ui_tests SET authoring=?::jsonb WHERE id=?",
          "{\"authoringSchemaVersion\":2,\"steps\":[]}",
          id);
      var tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
      var current = tx.execute(t -> new GuidedPublicationBaseRepository(jdbc, C).lockCurrent(id));
      assertThat(current.document().path("configuration").path("browser").asText())
          .isEqualTo("chromium");
      assertThat(com.citi.put.checks.studio.dto.CanonicalStudioCodec.normalizeBrowser("chromium"))
          .isEqualTo(current.document().path("configuration").path("browser").asText());
      assertThatThrownBy(
              () -> com.citi.put.checks.studio.dto.CanonicalStudioCodec.normalizeBrowser("chrome"))
          .isInstanceOf(com.citi.put.checks.studio.StudioValidationException.class)
          .satisfies(
              error ->
                  assertThat(
                          ((com.citi.put.checks.studio.StudioValidationException) error).getCode())
                      .isEqualTo("INVALID_CONFIGURATION"));
    }
    assertThat(PublicationContracts.time(Instant.parse("2026-10-09T00:00:00Z")))
        .isEqualTo("2026-10-09T00:00:00.000Z");
    Instant sub = Instant.parse("2026-10-09T00:00:00.123999999Z");
    assertThat(PublicationContracts.time(sub)).isEqualTo("2026-10-09T00:00:00.123Z");
    assertThat(PublicationContracts.millisecond(sub)).isBefore(sub);
  }

  /** Synthetic relational receipts only: these do not prove a human answer or browser action. */
  static ObjectNode choiceReceipt(String preparation) {
    ObjectNode receipt =
        C.object()
            .put("version", 1)
            .put("sessionId", "session")
            .put("preparationId", preparation)
            .put("clarificationId", "question")
            .put("obligationId", UUID.randomUUID().toString())
            .put("contextIdentityHash", "a".repeat(64))
            .put("meaningsHash", "b".repeat(64))
            .put("questionCaptureHash", "c".repeat(64))
            .put("acceptedChoiceId", "choice");
    ObjectNode answer =
        receipt
            .putObject("answer")
            .put("sessionId", "session")
            .put("scopeHash", "d".repeat(64))
            .put("clarificationId", "question")
            .put("documentId", "document")
            .put("generation", 1)
            .put("choiceId", "choice")
            .putNull("bindingId")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("resolvedAt", "2026-10-09T13:00:00.123456789Z");
    answer
        .putObject("coordinate")
        .put("stepId", "00000000-0000-0000-0000-000000000002")
        .put("ordinal", 0);
    return receipt;
  }

  private static void insertReceipt(
      Database db, String id, com.fasterxml.jackson.databind.JsonNode receipt) {
    db.sessions.lock("session");
    db.jdbc.update(
        "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
            + ("xt_id,owner_fence,request_digest,proof,expires_at) SELECT session_id,?")
            + (",context_id,owner_fence,request_digest,jsonb_set(proof,'{preparationId")
            + ("}',to_jsonb(?::text)),clock_timestamp()+interval '60 seconds' FROM stu")
            + ("dio_guided_publication_preparations WHERE observed_choice_receipt IS N")
            + ("ULL ORDER BY preparation_id LIMIT 1"),
        id,
        id);
    db.jdbc.update(
        "INSERT INTO studio_guided_publication_preparations(session_id,preparat"
            + ("ion_id,context_id,owner_fence,request_digest,evidence_hash,inputs_hash")
            + (",materialization_revision,source_manifest_hash,observation_hash,execut")
            + ("ion_evidence,proposal,proof,captured_at,observed_choice_receipt) SELEC")
            + ("T session_id,?,context_id,owner_fence,request_digest,evidence_hash,inp")
            + ("uts_hash,materialization_revision,source_manifest_hash,observation_has")
            + ("h,execution_evidence,proposal,jsonb_set(proof,'{preparationId}',to_jso")
            + ("nb(?::text)),clock_timestamp(),?::jsonb FROM studio_guided_publication")
            + ("_preparations WHERE observed_choice_receipt IS NULL ORDER BY preparati")
            + ("on_id LIMIT 1"),
        id,
        id,
        receipt == null ? null : receipt.toString());
  }

  // ---- ADR-SC-007 V29: the observation is an outline plus a facts table ----

  /** A valid new-shape observation for the fixture session, with {@code facts} shown elements. */
  private static ObjectNode v29Observation(Database db, int generation, int facts) {
    var shown = com.citi.put.checks.studio.support.ObservationFixtures.observation();
    for (int i = 1; i <= facts; i++) {
      shown.element("e" + i, "button", "Button " + i);
    }
    ObjectNode observation = shown.build();
    observation
        .put("sessionId", "session")
        .put("documentId", "document-" + generation)
        .put("generation", generation)
        .put("scopeHash", db.session.path("scopeHash").asText())
        .put("origin", "https://orders.example.test");
    // The read-rule id left the observation contract (E5 row 33d).
    observation.remove("readRuleId");
    return observation;
  }

  /** Commits the row exactly as the capture path does: current in the session, then captured. */
  private static void v29Insert(Database db, ObjectNode observation) {
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock("session");
          db.jdbc.update(
              "UPDATE studio_guided_sessions SET"
                  + " progress=jsonb_set(progress,'{observation}',?::jsonb) WHERE"
                  + " session_id='session'",
              observation.toString());
          db.jdbc.update(
              "INSERT INTO studio_guided_publication_observations(session_id,observat"
                  + ("ion_hash,context_id,owner_fence,document_id,generation,observation,cap")
                  + ("tured_at) VALUES ('session',?,'context-1',1,?,?,?::jsonb,now())"),
              GuidedContracts.hash(observation),
              observation.path("documentId").asText(),
              observation.path("generation").asInt(),
              observation.toString());
        });
  }

  private static Database v29Database() throws Exception {
    var db = new Database();
    db.capture();
    GuidedPublicationEvidenceTest.setup(db);
    return db;
  }

  private static int v29Rows(Database db) {
    return db.jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_publication_observations", Integer.class);
  }

  @Test
  void v29ObservationAcceptsAValidNewShapeRow() throws Exception {
    try (var db = v29Database()) {
      ObjectNode observation = v29Observation(db, 1, 3);
      v29Insert(db, observation);
      assertThat(v29Rows(db)).isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT observation->'facts'->'e2'->>'name' FROM"
                      + " studio_guided_publication_observations",
                  String.class))
          .isEqualTo("Button 2");
    }
  }

  @Test
  void v29ObservationRejectsExtraFactKey() throws Exception {
    try (var db = v29Database()) {
      ObjectNode observation = v29Observation(db, 1, 2);
      ((ObjectNode) observation.path("facts").path("e1")).put("value", "do-not-store");
      assertThatThrownBy(() -> v29Insert(db, observation))
          .hasMessageContaining("ck_publication_observation_shape");
      assertThat(v29Rows(db)).isZero();
    }
  }

  @Test
  void v29ObservationRejectsABadFactKey() throws Exception {
    try (var db = v29Database()) {
      for (String key : List.of("node-1", "e0x", "E1", "e1234567", "")) {
        ObjectNode observation = v29Observation(db, 1, 1);
        ObjectNode facts = (ObjectNode) observation.path("facts");
        facts.set(key, facts.remove("e1"));
        assertThatThrownBy(() -> v29Insert(db, observation))
            .as("fact key '%s'", key)
            .hasMessageContaining("ck_publication_observation_shape");
      }
      assertThat(v29Rows(db)).isZero();
    }
  }

  @Test
  void v29ObservationRejectsABadSegmentField() throws Exception {
    try (var db = v29Database()) {
      ObjectNode observation = v29Observation(db, 1, 1);
      ((ObjectNode) observation.path("facts").path("e1").path("evidenceSegments").get(0))
          .put("field", "innerHtml");
      assertThatThrownBy(() -> v29Insert(db, observation))
          .hasMessageContaining("ck_publication_observation_shape");
      ObjectNode inverted = v29Observation(db, 1, 1);
      ((ObjectNode) inverted.path("facts").path("e1").path("evidenceSegments").get(0))
          .put("start", 9)
          .put("end", 3);
      assertThatThrownBy(() -> v29Insert(db, inverted))
          .hasMessageContaining("ck_publication_observation_shape");
      assertThat(v29Rows(db)).isZero();
    }
  }

  @Test
  void v29ObservationRejectsAnOldNodesKey() throws Exception {
    try (var db = v29Database()) {
      ObjectNode observation = v29Observation(db, 1, 1);
      observation.putArray("nodes");
      assertThatThrownBy(() -> v29Insert(db, observation))
          .hasMessageContaining("ck_publication_observation_closed");
      ObjectNode withoutFacts = v29Observation(db, 1, 1);
      withoutFacts.remove("facts");
      assertThatThrownBy(() -> v29Insert(db, withoutFacts))
          .hasMessageContaining("ck_publication_observation");
      assertThat(v29Rows(db)).isZero();
    }
  }

  /** The row is closed at 512 KiB of jsonb text; a valid shape over that is refused. */
  @Test
  void v29ObservationRejectsOversizeObservation() throws Exception {
    try (var db = v29Database()) {
      ObjectNode observation = v29Observation(db, 1, 1);
      ObjectNode facts = (ObjectNode) observation.path("facts");
      ObjectNode template = (ObjectNode) facts.path("e1");
      var segments = template.putArray("evidenceSegments");
      for (int i = 0; i < 128; i++) {
        segments.addObject().put("field", "name").put("start", 0).put("end", 1);
      }
      for (int i = 2; i <= 200; i++) {
        facts.set("e" + i, template.deepCopy());
      }
      int size =
          db.jdbc.queryForObject(
              "SELECT octet_length(convert_to(?::jsonb::text,'UTF8'))",
              Integer.class,
              observation.toString());
      assertThat(size).isGreaterThan(524_288);
      assertThatThrownBy(() -> v29Insert(db, observation))
          .hasMessageContaining("ck_publication_observation_closed");
      assertThat(v29Rows(db)).isZero();
    }
  }

  /**
   * The evidence guard counts 4 MiB of observation text per session: eight rows of just under 512
   * KiB fit and the ninth is refused. (Under the earlier 1 MiB total the third would have been.)
   */
  @Test
  void v29EvidenceGuardAllowsFourMiBAndRefusesMore() throws Exception {
    try (var db = v29Database()) {
      ObjectNode base = v29Observation(db, 1, 1);
      ObjectNode facts = (ObjectNode) base.path("facts");
      ObjectNode template = (ObjectNode) facts.path("e1");
      var segments = template.putArray("evidenceSegments");
      for (int i = 0; i < 128; i++) {
        segments.addObject().put("field", "name").put("start", 0).put("end", 1);
      }
      int count = 1;
      int size;
      do {
        // A fact equal to a peer in role, name and evidence needs an ordinal (V32); stay unique.
        ObjectNode fact = template.deepCopy();
        fact.put("name", "Button " + (count + 1)).put("evidence", "Button " + (count + 1));
        facts.set("e" + ++count, fact);
        size =
            db.jdbc.queryForObject(
                "SELECT octet_length(convert_to(?::jsonb::text,'UTF8'))",
                Integer.class,
                base.toString());
      } while (size + 5_000 < 524_288);
      assertThat(size).isLessThanOrEqualTo(524_288).isGreaterThan(500_000);
      for (int generation = 1; generation <= 8; generation++) {
        ObjectNode row = base.deepCopy();
        row.put("documentId", "document-" + generation).put("generation", generation);
        v29Insert(db, row);
      }
      assertThat(v29Rows(db)).isEqualTo(8);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT sum(octet_length(convert_to(observation::text,'UTF8'))) FROM"
                      + " studio_guided_publication_observations",
                  Long.class))
          .isGreaterThan(1_048_576L)
          .isLessThanOrEqualTo(4_194_304L);
      ObjectNode ninth = base.deepCopy();
      ninth.put("documentId", "document-9").put("generation", 9);
      assertThatThrownBy(() -> v29Insert(db, ninth))
          .hasMessageContaining("publication evidence limit");
      assertThat(v29Rows(db)).isEqualTo(8);
    }
  }

  /**
   * The two observation checks and the preparation check are added NOT VALID (old rows are not
   * scanned, new rows are enforced), and the constraints that named the retired node list are gone.
   */
  @Test
  void v29NewConstraintsAreNotValidatedAndTheOldOnesAreGone() throws Exception {
    try (var db = v29Database()) {
      for (String name :
          List.of(
              "ck_publication_observation_closed",
              "ck_publication_observation_identity",
              "ck_publication_preparation_shape")) {
        assertThat(
                db.jdbc.queryForList(
                    "SELECT convalidated FROM pg_constraint WHERE conname=? AND contype='c'",
                    Boolean.class,
                    name))
            .as(name)
            .containsExactly(false);
      }
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM pg_constraint WHERE"
                      + " conrelid='studio_guided_publication_observations'::regclass AND"
                      + " contype='c' AND pg_get_constraintdef(oid) LIKE '%nodes%'",
                  Integer.class))
          .isZero();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM pg_constraint WHERE"
                      + " conrelid='studio_guided_publication_observations'::regclass AND"
                      + " conname='ck_publication_observation_shape'",
                  Integer.class))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT pg_get_functiondef('studio_publication_evidence_guard()'::regprocedure)",
                  String.class))
          .contains("4194304")
          .doesNotContain("1048576");
    }
  }

  private static int canonicalBytes(com.fasterxml.jackson.databind.JsonNode receipt) {
    return GuidedContracts.canonical(receipt)
        .getBytes(java.nio.charset.StandardCharsets.UTF_8)
        .length;
  }

  private static void assertReceiptShape(Database db, ObjectNode receipt, boolean expected) {
    assertThat(
            db.jdbc.queryForObject(
                "SELECT studio_publication_observed_choice_receipt(?::jsonb)",
                Boolean.class,
                receipt.toString()))
        .as("synthetic closed receipt shape")
        .isEqualTo(expected);
  }
}
