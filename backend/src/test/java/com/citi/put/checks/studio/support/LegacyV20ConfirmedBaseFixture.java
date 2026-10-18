package com.citi.put.checks.studio.support;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationBaseRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationEvidenceRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationRepository;
import com.citi.put.checks.studio.guided.publication.ObservedArtifactLowerer;
import com.citi.put.checks.studio.guided.publication.PublicationContracts;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Actual synthetic V20 history, seeded before Spring; never a current-runtime compatibility path.
 */
public final class LegacyV20ConfirmedBaseFixture {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String PRINCIPAL = "user-1", APPLICATION = "orders";

  private LegacyV20ConfirmedBaseFixture() {}

  public record Seed(
      UUID testId,
      UUID baseRevisionId,
      UUID firstStepId,
      String sourceRevision,
      String configurationRevision,
      String revisionDigest,
      String immutableBaseRowBytes,
      String immutableReceiptRowBytes,
      String sessionId) {}

  public record PreparedCases(Seed incompleteImmutableBase, StaleSeed staleCurrentCache) {}

  public record StaleSeed(
      Seed publication,
      JsonNode oldAuthoring,
      JsonNode newAuthoring,
      JsonNode oldCachedInputs,
      JsonNode expectedCurrentInputs,
      JsonNode oldDeclarations,
      JsonNode newDeclarations,
      String sourceRevision,
      String configurationRevision) {}

  private static void prepareFreshV20(DataSource source) {
    var jdbc = new JdbcTemplate(source);
    assertThat(
            jdbc.queryForObject(
                "SELECT to_regclass('flyway_schema_history') IS NULL", Boolean.class))
        .as("fresh owned fixture database before Spring boot")
        .isTrue();
    Flyway.configure().dataSource(source).target("20").load().migrate();
    requireV20(jdbc);
  }

  /** Original primary-only API and meaning are preserved. */
  public static Seed seedV20(
      DataSource source,
      String csiId,
      String environment,
      UUID step,
      String sourceText,
      JsonNode profile,
      JsonNode build) {
    prepareFreshV20(source);
    return seedPreparedV20(source, csiId, environment, step, sourceText, profile, build);
  }

  /** Two named cases, atomically seeded under20 once; never call a fresh factory twice. */
  public static PreparedCases seedV20Cases(
      DataSource source,
      String csiId,
      String environment,
      UUID step,
      String sourceText,
      JsonNode profile,
      JsonNode build) {
    prepareFreshV20(source);
    var jdbc = new JdbcTemplate(source);
    var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    PreparedCases prepared =
        tx.execute(
            status -> {
              Seed primary =
                  seedPreparedV20(source, csiId, environment, step, sourceText, profile, build);
              Seed old =
                  seedPreparedV20(
                      source, csiId, environment, step, "Earlier: " + sourceText, profile, build);
              JsonNode oldAuthoring =
                  C.parse(
                      jdbc.queryForObject(
                          "SELECT authoring::text FROM ui_tests WHERE id=?",
                          String.class,
                          old.testId()));
              JsonNode oldCache =
                  C.parse(
                      jdbc.queryForObject(
                          "SELECT authoring_revision_inputs::text FROM ui_tests WHERE id=?",
                          String.class,
                          old.testId()));
              var mapper = new ObjectMapper().findAndRegisterModules();
              try {
                var oldSource = mapper.treeToValue(oldAuthoring, AuthoringV2Request.class);
                var oldIdentity =
                    com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
                        oldSource, List.of());
                assertThat(AuthoringRevisionIdentity.valid(oldSource, oldIdentity.inputs()))
                    .isTrue();
                assertThat(oldCache).isEqualTo(mapper.valueToTree(oldIdentity.inputs()));
                var context =
                    new com.citi.put.checks.studio.dto.StepAuthoringContext(
                        List.of(
                            new com.citi.put.checks.studio.dto.VariableReference(
                                "STUDIO_STALE_CONTEXT")),
                        List.of());
                var current =
                    new AuthoringV2Request(
                        2, null, List.of(new AuthoringStep(step, sourceText, context)));
                var declarations =
                    List.of(
                        com.citi.put.checks.studio.dto.StudioVariable.plain(
                            "STUDIO_STALE_CONTEXT", "fixture-context-current"));
                var resolved =
                    com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
                        current, declarations);
                assertThat(AuthoringRevisionIdentity.valid(current, oldIdentity.inputs()))
                    .isFalse();
                assertThat(AuthoringRevisionIdentity.valid(current, resolved.inputs())).isTrue();
                JsonNode currentAuthoring = mapper.valueToTree(current),
                    expected = mapper.valueToTree(resolved.inputs());
                assertThat(expected).isNotEqualTo(oldCache);
                // Legitimate changed draft/source/declaration facts under the old schema; the known
                // old,
                // well-shaped derived cache is deliberately retained. No protected historical row
                // changes.
                jdbc.update(
                    "UPDATE ui_tests SET authoring=?::jsonb,steps=?::jsonb,variables=?::jsonb,"
                        + "source_revision=source_revision+1,configuration_revision=configuration_revision+1 WHERE "
                        + "id=?",
                    currentAuthoring.toString(),
                    mapper.writeValueAsString(List.of(sourceText)),
                    com.citi.put.checks.studio.dto.CanonicalStudioCodec.variablesToJson(
                        declarations),
                    old.testId());
                StaleSeed stale =
                    new StaleSeed(
                        old,
                        oldAuthoring,
                        currentAuthoring,
                        oldCache,
                        expected,
                        oldIdentity.references().path("authoredDeclarations"),
                        resolved.references().path("authoredDeclarations"),
                        "2",
                        "2");
                assertStaleDraftFacts(jdbc, stale);
                jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
                return new PreparedCases(primary, stale);
              } catch (java.io.IOException failure) {
                throw new IllegalStateException(failure);
              }
            });
    assertStaleDraftFacts(jdbc, prepared.staleCurrentCache());
    return prepared;
  }

  private static Seed seedPreparedV20(
      DataSource source,
      String csiId,
      String environment,
      UUID step,
      String sourceText,
      JsonNode profile,
      JsonNode build) {
    var jdbc = new JdbcTemplate(source);
    var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    requireV20(jdbc);
    String url = sourceText.substring(sourceText.indexOf("http"));
    if (url.endsWith(".")) {
      url = url.substring(0, url.length() - 1);
    }
    var destination = java.net.URI.create(url);
    String origin = destination.getScheme() + "://" + destination.getRawAuthority();
    UUID test = UUID.randomUUID(), revision = UUID.randomUUID();
    String id = "legacy20-" + UUID.randomUUID();
    var sessions = new GuidedSessionRepository(jdbc, tx, C);
    var bases = new GuidedPublicationBaseRepository(jdbc, C);
    var publications = new GuidedPublicationRepository(jdbc, C);
    ObjectNode session =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("testId", test.toString())
            .put("state", "PREPARING")
            .put("createdAt", PublicationContracts.time(Instant.now()))
            .put("expiresAt", PublicationContracts.time(Instant.now().plusSeconds(600)));
    ObjectNode scope =
        session
            .putObject("scope")
            .put("principalId", PRINCIPAL)
            .put("csiId", csiId)
            .put("applicationId", APPLICATION)
            .put("environmentId", environment)
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("modelDataPolicyId", "fixture-model-policy")
            .putNull("valueTransferPolicyId");
    scope.putArray("approvedOrigins").add(origin);
    scope
        .putArray("capabilities")
        .add("observe")
        .add("navigate")
        .add("read")
        .add("fill")
        .add("click")
        .add("assert");
    session.put("scopeHash", GuidedContracts.hash(scope));
    session
        .putObject("owner")
        .put("workerId", "unclaimed")
        .put("fence", 0)
        .put("leaseExpiresAt", PublicationContracts.time(Instant.now()));
    session.putObject("versions").put("contract", 3);
    session
        .putArray("sourceSteps")
        .addObject()
        .put("stepId", step.toString())
        .put("requiresAssertion", false);
    session
        .putObject("runAuthorization")
        .put("authorizationId", UUID.randomUUID().toString())
        .put("kind", "scopedRun")
        .put("principalId", PRINCIPAL)
        .put("scopeHash", session.path("scopeHash").asText())
        .put("authorizedAt", PublicationContracts.time(Instant.now()));
    try {
      JsonNode template =
          C.parse(
                  Files.readString(
                      Path.of(
                          "../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
              .path("documents")
              .path("flow")
              .path("session");
      session.set("limits", template.path("limits").deepCopy());
      ObjectNode counters = session.putObject("counters");
      for (String key :
          List.of(
              "actions",
              "observations",
              "modelProposals",
              "modelInputTokens",
              "modelOutputTokens",
              "sanitizedEvidenceBytes")) {
        counters.put(key, 0);
      }
      var mapper = new ObjectMapper().findAndRegisterModules();
      var authoring =
          new AuthoringV2Request(2, null, List.of(new AuthoringStep(step, sourceText, null)));
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES ('user-1','Legacy fixture','fixture@example.invalid') "
              + "ON CONFLICT(email) DO NOTHING");
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES (?,"
              + "'Legacy fixture','unit','LOW','fixture@example.invalid','Development') ON CONFLICT(id) DO NOTHING",
          csiId);
      jdbc.update(
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by,authoring,"
              + "authoring_revision_inputs) VALUES (?,'Legacy observed base',?,?,'chromium',?::jsonb,?,?::jsonb,?::"
              + "jsonb)",
          test,
          csiId,
          environment,
          mapper.writeValueAsString(List.of(sourceText)),
          "fixture@example.invalid",
          mapper.writeValueAsString(authoring),
          mapper.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())));
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
    tx.executeWithoutResult(
        status -> {
          sessions.insert(session);
          GuidedPublicationEvidenceFixture.freezeSource(jdbc, tx, session);
        });
    ObjectNode requirements =
        C.object()
            .put("csiId", csiId)
            .put("environment", environment)
            .put("applicationId", APPLICATION)
            .put("policyId", "legacy-fixture-policy")
            .put("policyVersion", "1")
            .put("entryPolicyId", "legacy-entry");
    requirements.putArray("allowedOrigins").add(origin);
    // Match ObservedReplayPins.requirements: guided observation stays in scope; replay lists
    // executable operations only. Preserve every executable capability and its original order.
    ArrayNode executableCapabilities = requirements.putArray("capabilities");
    for (JsonNode capability : scope.path("capabilities")) {
      if (!capability.asText().equals("observe")) {
        executableCapabilities.add(capability.deepCopy());
      }
    }
    requirements.putObject("initialContext").put("kind", "initialBlank");
    C.validate("v3/replay-profile#/definitions/ReplayRequirements", requirements);
    var base =
        tx.execute(
            status -> {
              sessions.lock(id);
              return bases.capture(session, requirements, Instant.now());
            });
    String target = url;
    ObjectNode basis =
        tx.execute(
            status -> {
              var current = sessions.lock(id);
              current.document().put("state", "OBSERVING");
              current
                  .document()
                  .putObject("owner")
                  .put("workerId", "legacy-worker")
                  .put("fence", 1)
                  .put("leaseExpiresAt", PublicationContracts.time(Instant.now().plusSeconds(120)));
              sessions.save(current);
              ObjectNode manifest =
                  (ObjectNode)
                      C.parse(
                          jdbc.queryForObject(
                              "SELECT manifest::text FROM studio_guided_source_manifests WHERE session_id=?",
                              String.class,
                              id));
              ObjectNode input =
                  C.object()
                      .put("inputId", id + "-destination")
                      .put("sourceStepId", step.toString())
                      .put("kind", "destination")
                      .put("value", target)
                      .put("intendedSlot", "navigate.destination");
              ObjectNode provenance =
                  input
                      .putObject("provenance")
                      .put("referenceKind", "sourceSpan")
                      .put("sourceRevision", "1")
                      .put("stepId", step.toString())
                      .put("startUtf16", sourceText.indexOf(target))
                      .put("endUtf16", sourceText.indexOf(target) + target.length())
                      .put("kind", "destination")
                      .put("intendedSlot", "navigate.destination");
              ObjectNode inputs =
                  C.object()
                      .put("schemaVersion", 3)
                      .put("sessionId", id)
                      .put("scopeHash", session.path("scopeHash").asText())
                      .put("sourceRevision", "1")
                      .put("configurationRevision", "1");
              inputs.putArray("inputs").add(input);
              String inputsHash = GuidedContracts.hash(inputs);
              ObjectNode intent =
                  C.object()
                      .put("sessionId", id)
                      .put("assignmentId", id)
                      .put("scopeHash", session.path("scopeHash").asText())
                      .put("workerId", "legacy-worker")
                      .put("expectedFence", 0);
              jdbc.update(
                  "INSERT INTO studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,"
                      + "expected_fence,intent) VALUES (?,?,?,'legacy-worker',0,?::jsonb)",
                  id,
                  id,
                  session.path("scopeHash").asText(),
                  intent.toString());
              jdbc.update(
                  "INSERT INTO studio_guided_materializations(session_id,scope_hash,context_id,"
                      + "context_revision,materialization_revision,worker_id,owner_fence,source_revision,"
                      + "configuration_revision,authored_inputs_hash,authored_inputs) VALUES (?,?,?,1,1,"
                      + "'legacy-worker',1,'1','1',?,?::jsonb)",
                  id,
                  session.path("scopeHash").asText(),
                  id + "-context",
                  inputsHash,
                  inputs.toString());
              ObjectNode plan = C.object();
              plan.putArray("sourceReferences").add(provenance);
              ObjectNode meaning =
                  plan.putArray("obligations")
                      .addObject()
                      .put("obligationId", UUID.randomUUID().toString())
                      .put("stepId", step.toString())
                      .put("occurrence", 0)
                      .put("operationKind", "navigate")
                      .put("targetIntent", "page")
                      .put("referenceIndex", 0)
                      .putNull("needId")
                      .putNull("predicate");
              plan.putArray("needs");
              com.citi.put.checks.studio.guided.translation.GuidedAcceptedPlan.validate(C, plan);
              jdbc.update(
                  "INSERT INTO studio_guided_translation_plans(session_id,plan_revision,parent_revision,plan,"
                      + "plan_hash) VALUES (?,1,0,?::jsonb,?)",
                  id,
                  plan.toString(),
                  GuidedContracts.hash(plan));
              jdbc.update(
                  "UPDATE studio_guided_translation_state SET plan_revision=1,continuation='OBSERVING' WHERE "
                      + "session_id=?",
                  id);
              ObjectNode execution =
                  C.object()
                      .put("kind", "initialBlank")
                      .put("sessionId", id)
                      .put("contextId", id + "-context")
                      .put("creationId", id + "-creation")
                      .put("documentId", id + "-blank")
                      .put("bootstrapId", id + "-bootstrap")
                      .put("url", "about:blank")
                      .putNull("origin")
                      .put("generation", 0);
              persistOriginalBootstrap(jdbc, sessions, current, base, inputs, execution);
              ObjectNode proposal =
                  C.object()
                      .put("schemaVersion", 3)
                      .put("sessionId", id)
                      .put("scopeHash", session.path("scopeHash").asText())
                      .put("generation", 0)
                      .put("evidenceHash", GuidedContracts.hash(execution))
                      .put("authoredInputsHash", inputsHash)
                      .put("contextRevision", 1);
              proposal.putObject("coordinate").put("stepId", step.toString()).put("ordinal", 0);
              proposal
                  .putObject("target")
                  .put("kind", "page")
                  .put("documentId", id + "-blank")
                  .put("generation", 0);
              proposal
                  .putObject("operation")
                  .put("kind", "navigate")
                  .put("destinationInputId", input.path("inputId").asText());
              proposal.set("executionEvidence", execution);
              String digest = GuidedContracts.hash(proposal);
              ObjectNode proof =
                  C.object()
                      .put("schemaVersion", 3)
                      .put("sessionId", id)
                      .put("workerId", "legacy-worker")
                      .put("ownerFence", 1)
                      .put("scopeHash", session.path("scopeHash").asText())
                      .put("contextId", id + "-context")
                      .put("contextRevision", 1)
                      .put("sourceRevision", "1")
                      .put("configurationRevision", "1")
                      .put("preparationId", id + "-prep")
                      .put("requestDigest", digest)
                      .put("evidenceHash", GuidedContracts.hash(execution))
                      .put("authoredInputsHash", inputsHash)
                      .put("expiresAt", PublicationContracts.time(Instant.now().plusSeconds(30)));
              proof.putObject("versions").put("contract", 3);
              current.progress().set("executionEvidence", execution);
              sessions.save(current);
              jdbc.update(
                  "INSERT INTO studio_guided_preparations(session_id,preparation_id,context_id,owner_fence,"
                      + "request_digest,proof,expires_at) VALUES (?,?,?,1,?,?::jsonb,?::timestamptz)",
                  id,
                  id + "-prep",
                  id + "-context",
                  digest,
                  proof.toString(),
                  proof.path("expiresAt").asText());
              var evidence = new GuidedPublicationEvidenceRepository(jdbc, C);
              evidence.capturePreparation(current, proposal, proof, Instant.now());
              ObjectNode op = C.object();
              op.set("coordinate", proposal.path("coordinate"));
              op.putNull("origin").putNull("locator");
              op.set("operation", proposal.path("operation"));
              ObjectNode ledger =
                  C.object()
                      .put("schemaVersion", 3)
                      .put("sessionId", id)
                      .put("idempotencyKey", id + "-action")
                      .put("requestDigest", digest)
                      .put("scopeHash", session.path("scopeHash").asText())
                      .put("operationHash", GuidedContracts.hash(op))
                      .put("generation", 0)
                      .put("documentId", id + "-blank")
                      .put("ownerFence", 1)
                      .put("state", "SUCCEEDED")
                      .put("dispatchCount", 1)
                      .put("outcomeCode", "OK")
                      .putNull("assertionPassed")
                      .put("evidenceHash", GuidedContracts.hash(execution))
                      .put("authoredInputsHash", inputsHash)
                      .put("contextRevision", 1)
                      .put("preparationId", id + "-prep")
                      .put("attemptOrdinal", 0);
              ledger.set("coordinate", proposal.path("coordinate"));
              ledger.set("executionEvidence", execution);
              ObjectNode decision =
                  C.object()
                      .put("scopeHash", session.path("scopeHash").asText())
                      .put("requestDigest", digest);
              decision.set("preparation", proof);
              ledger
                  .putObject("admission")
                  .put("admissionId", id + "-admission")
                  .put(
                      "authorizationId",
                      session.path("runAuthorization").path("authorizationId").asText())
                  .put("admittedAt", PublicationContracts.time(Instant.now()))
                  .put("policyDecisionHash", GuidedContracts.hash(decision));
              C.validate("v3/action", proposal);
              C.validate("v3/ledger", ledger);
              jdbc.update(
                  "INSERT INTO studio_guided_actions(admission_id,session_id,step_id,ordinal,document,"
                      + "proposal) VALUES (?,?,?,0,?::jsonb,?::jsonb)",
                  id + "-admission",
                  id,
                  step.toString(),
                  ledger.toString(),
                  proposal.toString());
              jdbc.update(
                  "UPDATE studio_guided_preparations SET admission_id=? WHERE session_id=? AND preparation_id=?",
                  id + "-admission",
                  id,
                  id + "-prep");
              jdbc.update(
                  "INSERT INTO studio_guided_obligation_admissions(session_id,obligation_id,plan_revision,"
                      + "meaning,proposal,proposal_digest,admission_key,admission_id) VALUES (?,?,1,?::jsonb,?::"
                      + "jsonb,?,?,?)",
                  id,
                  meaning.path("obligationId").asText(),
                  meaning.toString(),
                  proposal.toString(),
                  digest,
                  id + "-action",
                  id + "-admission");
              evidence.attachAdmission(current.document(), ledger, proposal, Instant.now());
              current = sessions.lock(id);
              current.progress().put("stepIndex", 1);
              ((ObjectNode) current.document().path("counters")).put("actions", 1);
              sessions.save(current);
              var builder = new GuidedPlanBuilder(C);
              ObjectNode result =
                  builder.basis(
                      base,
                      bases.lockCurrent(test),
                      readHistoricalV20(jdbc, id, manifest),
                      current.document(),
                      builder.learningProvenance(manifest));
              current.document().put("state", "FINALIZING");
              sessions.save(current);
              jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
              return result;
            });
    var candidate = new ObservedArtifactLowerer(C).lower(basis, profile);
    ObjectNode identity =
        C.object()
            .put("ownerWorkerId", "legacy-worker")
            .put("ownerFence", 1)
            .put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(14)))
            .put("translationHash", basis.path("translationHash").asText())
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
      identity.set(key, candidate.hashes().path(key));
    }
    identity.put("validationBuildHash", GuidedContracts.hash(build));
    var snapshot = new PublicationContracts.Snapshot(identity, basis);
    String finalizeDigest =
        GuidedContracts.hash(
            C.object().put("sessionId", id).put("basisHash", GuidedContracts.hash(basis)));
    var attempt =
        tx.execute(
            status -> {
              sessions.lock(id);
              return publications.reserve(
                  new PublicationContracts.Claim(id, "legacy-final", finalizeDigest, snapshot),
                  Instant.now());
            });
    tx.executeWithoutResult(
        status -> {
          sessions.lock(id);
          publications.claim(
              id, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
        });
    ObjectNode verdict =
        C.object()
            .put("schemaVersion", 3)
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString())
            .put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash())
            .put("basisHash", GuidedContracts.hash(basis));
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "admissionProvenanceHash")) {
      verdict.set(key, candidate.hashes().path(key));
    }
    verdict.set("profile", profile);
    verdict.set("build", build);
    tx.executeWithoutResult(
        status -> {
          sessions.lock(id);
          publications.finish(
              id,
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
            id,
            revision,
            attempt.attemptId(),
            attempt.claimId(),
            "legacy-final",
            finalizeDigest,
            snapshot,
            candidate,
            new PublicationContracts.Grant(
                id, PRINCIPAL, csiId, snapshot.hash(), attempt.validationDeadline()));
    tx.executeWithoutResult(status -> commitHistoricalV20(jdbc, tx, command));
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_revisions r JOIN studio_guided_publications p ON "
                    + "p.revision_id=r.id AND p.session_id=r.guided_session_id WHERE r.id=?",
                Integer.class,
                revision))
        .isEqualTo(1);
    return new Seed(
        test,
        revision,
        step,
        "1",
        "1",
        candidate.hashes().path("revisionDigest").asText(),
        row(jdbc, "ui_test_revisions", "id", revision),
        row(jdbc, "studio_guided_publications", "session_id", id),
        id);
  }

  /** Controlled original fixture ACK, persisted before its action; no worker/browser claim. */
  private static void persistOriginalBootstrap(
      JdbcTemplate jdbc,
      GuidedSessionRepository sessions,
      GuidedSessionRepository.Session current,
      PublicationContracts.Base base,
      JsonNode inputs,
      JsonNode initial) {
    JsonNode session = current.document();
    String id = session.path("sessionId").asText();
    assertThat(current.progress().has("translationBootstrap")).isFalse();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_actions WHERE session_id=?", Integer.class, id))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_preparations WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
    C.validate("v3/authored-inputs", inputs);
    C.validate("v3/execution-evidence", initial);
    assertThat(
            C.parse(
                jdbc.queryForObject(
                    "SELECT authored_inputs::text FROM studio_guided_materializations WHERE session_id=?",
                    String.class,
                    id)))
        .isEqualTo(inputs);
    String inputsHash = GuidedContracts.hash(inputs);
    assertThat(
            jdbc.queryForObject(
                "SELECT authored_inputs_hash FROM studio_guided_materializations WHERE session_id=?",
                String.class,
                id))
        .isEqualTo(inputsHash);
    String worker = session.path("owner").path("workerId").asText();
    int fence = session.path("owner").path("fence").asInt();
    ObjectNode context =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("workerId", worker)
            .put("ownerFence", fence)
            .put("scopeHash", session.path("scopeHash").asText())
            .put("contextId", initial.path("contextId").asText())
            .put("contextRevision", 1)
            .put("materializationRevision", 1)
            .put("authoredInputsHash", inputsHash)
            .put("expiresAt", session.path("expiresAt").asText())
            .put("leaseExpiresAt", session.path("owner").path("leaseExpiresAt").asText());
    context.putObject("versions").put("contract", 3);
    context.set("approvedOrigins", session.path("scope").path("approvedOrigins").deepCopy());
    ArrayNode ids = context.putArray("sourceStepIds");
    session.path("sourceSteps").forEach(step -> ids.add(step.path("stepId")));
    context.set("authoredInputs", inputs.deepCopy());
    context.set("limits", session.path("limits").deepCopy());
    for (String[] table :
        new String[][] {
          {"allocations", "studio_guided_allocations"},
          {"producers", "studio_guided_producers"},
          {"consumerEdges", "studio_guided_consumer_edges"}
        }) {
      ArrayNode facts = context.putArray(table[0]);
      jdbc.queryForList(
              "SELECT document::text FROM "
                  + table[1]
                  + " WHERE session_id=? ORDER BY document::text",
              String.class,
              id)
          .forEach(json -> facts.add(C.parse(json)));
    }
    JsonNode application =
        C.parse(
                jdbc.queryForObject(
                    "SELECT v.document::text FROM studio_guided_session_policies s JOIN "
                        + "studio_guided_policy_versions v ON v.policy_id=s.policy_id AND "
                        + "v.version=s.policy_version WHERE s.session_id=?",
                    String.class,
                    id))
            .path("applicationPolicy");
    context.set("applicationPolicy", application.deepCopy());
    context.put("policyHash", GuidedContracts.hash(application));
    ObjectNode identity =
        C.object()
            .put("workerId", worker)
            .put("fence", fence)
            .put("scopeHash", session.path("scopeHash").asText());
    for (String field : List.of("sourceRevision", "configurationRevision")) {
      context.set(field, base.document().path(field));
      identity.set(field, base.document().path(field));
    }
    C.validate("v3/runner-context", context);
    ObjectNode marker = current.progress().putObject("translationBootstrap").put("phase", "READY");
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
            .put("contextId", context.path("contextId").asText())
            .put("contextRevision", 1)
            .put("workerId", worker)
            .put("ownerFence", fence)
            .put("scopeHash", session.path("scopeHash").asText());
    receipt.set("sourceRevision", base.document().path("sourceRevision"));
    receipt.set("configurationRevision", base.document().path("configurationRevision"));
    current.progress().set("executionEvidence", initial.deepCopy());
    sessions.save(current);
  }

  public static void assertPreservedAtHead(DataSource source, Seed seed) {
    var jdbc = new JdbcTemplate(source);
    assertThat(
            jdbc.queryForObject(
                "SELECT max(version::int) FROM flyway_schema_history WHERE success", Integer.class))
        .isEqualTo(22);
    assertThat(row(jdbc, "ui_test_revisions", "id", seed.baseRevisionId()))
        .isEqualTo(seed.immutableBaseRowBytes());
    assertThat(row(jdbc, "studio_guided_publications", "session_id", seed.sessionId()))
        .isEqualTo(seed.immutableReceiptRowBytes());
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_revision_id FROM ui_tests WHERE id=?", UUID.class, seed.testId()))
        .isEqualTo(seed.baseRevisionId());
    assertThat(
            jdbc.queryForObject(
                "SELECT NOT(\"references\" ?? 'authoringIdentityVersion') AND step_snapshot_hashes IS NULL "
                    + "AND step_reuse_provenance IS NULL FROM ui_test_revisions WHERE id=?",
                Boolean.class,
                seed.baseRevisionId()))
        .isTrue();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND attempt_ordinal=0",
                Integer.class,
                seed.sessionId()))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materialization_snapshots WHERE session_id=? AND "
                    + "authored_inputs_hash=studio_publication_hash(authored_inputs)",
                Integer.class,
                seed.sessionId()))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT to_regprocedure('studio_015_relearned_from(text)') IS NOT NULL AND EXISTS(SELECT 1 "
                    + "FROM pg_trigger WHERE tgname='tr_015_revision_guard' AND tgenabled='O')",
                Boolean.class))
        .isTrue();
    assertThat(
            jdbc.queryForObject(
                "SELECT studio_015_declarations(\"references\") FROM ui_test_revisions WHERE id=?",
                Boolean.class,
                seed.baseRevisionId()))
        .isFalse();
    assertThat(
            jdbc.queryForObject(
                "SELECT pg_get_functiondef('studio_015_revision_guard()'::regprocedure)",
                String.class))
        .contains("new revision requires complete immutable input and snapshot metadata");
    assertThatThrownBy(() -> requireV20(jdbc)).hasMessageContaining("exact V20");
    // Actual head guard refusal, entirely rolled back. No incomplete head base is created.
    String probe = "legacy-head-refusal-" + UUID.randomUUID();
    UUID refusedRevision = UUID.randomUUID();
    var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    int sessionsBefore =
        jdbc.queryForObject("SELECT count(*) FROM studio_guided_sessions", Integer.class);
    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> {
                      var sessions = new GuidedSessionRepository(jdbc, tx, C);
                      ObjectNode shadow =
                          PublicationContracts.copy(
                              C.parse(
                                  jdbc.queryForObject(
                                      "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
                                      String.class,
                                      seed.sessionId())));
                      shadow.put("sessionId", probe).put("state", "PREPARING");
                      shadow
                          .putObject("owner")
                          .put("workerId", "unclaimed")
                          .put("fence", 0)
                          .put("leaseExpiresAt", PublicationContracts.time(Instant.now()));
                      ObjectNode currentScope = (ObjectNode) shadow.path("scope");
                      currentScope.put(
                          "sourceRevision",
                          jdbc.queryForObject(
                              "SELECT source_revision::text FROM ui_tests WHERE id=?",
                              String.class,
                              seed.testId()));
                      currentScope.put(
                          "configurationRevision",
                          jdbc.queryForObject(
                              "SELECT configuration_revision::text FROM ui_tests WHERE id=?",
                              String.class,
                              seed.testId()));
                      shadow.put("scopeHash", GuidedContracts.hash(currentScope));
                      ((ObjectNode) shadow.path("runAuthorization"))
                          .put("authorizationId", UUID.randomUUID().toString())
                          .put("scopeHash", shadow.path("scopeHash").asText());
                      sessions.insert(shadow);
                      GuidedPublicationEvidenceFixture.freezeSource(jdbc, tx, shadow);
                      var bases = new GuidedPublicationBaseRepository(jdbc, C);
                      JsonNode originalBase =
                          C.parse(
                              jdbc.queryForObject(
                                  "SELECT document::text FROM studio_guided_publication_bases WHERE session_id=?",
                                  String.class,
                                  seed.sessionId()));
                      sessions.lock(probe);
                      bases.capture(shadow, originalBase.path("replayRequirements"), Instant.now());
                      jdbc.update(
                          "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,"
                              + "configuration_revision,source,source_hash,artifact,artifact_hash,"
                              + "artifact_schema_version,configuration,\"references\",provenance,created_by,"
                              + "confirmed_by,confirmed_at,confirmation_source,reference_policy,publication_kind,"
                              + "guided_session_id,learned_plan_hash,revision_digest,step_snapshot_hashes,"
                              + "step_reuse_provenance) SELECT ?,test_id,csi_id,source_revision,"
                              + "configuration_revision,source,source_hash,artifact,artifact_hash,"
                              + "artifact_schema_version,configuration,\"references\",provenance,created_by,"
                              + "confirmed_by,clock_timestamp(),confirmation_source,reference_policy,"
                              + "publication_kind,?,learned_plan_hash,?,NULL,NULL FROM ui_test_revisions WHERE id=?",
                          refusedRevision,
                          probe,
                          GuidedContracts.hash(C.object().put("probe", refusedRevision.toString())),
                          seed.baseRevisionId());
                      jdbc.execute("SET CONSTRAINTS tr_015_revision_guard IMMEDIATE");
                    }))
        .hasMessageContaining(
            "new revision requires complete immutable input and snapshot metadata");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_revisions WHERE id=?",
                Integer.class,
                refusedRevision))
        .isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_sessions", Integer.class))
        .isEqualTo(sessionsBefore);
    assertThat(row(jdbc, "ui_test_revisions", "id", seed.baseRevisionId()))
        .isEqualTo(seed.immutableBaseRowBytes());
    assertThat(row(jdbc, "studio_guided_publications", "session_id", seed.sessionId()))
        .isEqualTo(seed.immutableReceiptRowBytes());
  }

  /** Call before any supported HTTP save/run; this proves the actual preserved stale cache. */
  public static void assertStaleCachePreservedAtHead(DataSource source, StaleSeed stale) {
    assertPreservedAtHead(source, stale.publication());
    var jdbc = new JdbcTemplate(source);
    assertStaleDraftFacts(jdbc, stale);
  }

  private static void assertStaleDraftFacts(JdbcTemplate jdbc, StaleSeed stale) {
    UUID test = stale.publication().testId();
    assertThat(
            C.parse(
                jdbc.queryForObject(
                    "SELECT authoring::text FROM ui_tests WHERE id=?", String.class, test)))
        .isEqualTo(stale.newAuthoring());
    assertThat(
            C.parse(
                jdbc.queryForObject(
                    "SELECT authoring_revision_inputs::text FROM ui_tests WHERE id=?",
                    String.class,
                    test)))
        .isEqualTo(stale.oldCachedInputs())
        .isNotEqualTo(stale.expectedCurrentInputs());
    assertThat(
            jdbc.queryForObject(
                "SELECT source_revision::text FROM ui_tests WHERE id=?", String.class, test))
        .isEqualTo(stale.sourceRevision());
    assertThat(
            jdbc.queryForObject(
                "SELECT configuration_revision::text FROM ui_tests WHERE id=?", String.class, test))
        .isEqualTo(stale.configurationRevision());
    assertThat(row(jdbc, "ui_test_revisions", "id", stale.publication().baseRevisionId()))
        .isEqualTo(stale.publication().immutableBaseRowBytes());
    assertThat(
            row(jdbc, "studio_guided_publications", "session_id", stale.publication().sessionId()))
        .isEqualTo(stale.publication().immutableReceiptRowBytes());
    var tx = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    JsonNode current =
        tx.execute(
            status -> new GuidedPublicationBaseRepository(jdbc, C).lockCurrent(test).document());
    assertThat(current.path("authoringRevisionInputs")).isEqualTo(stale.expectedCurrentInputs());
    assertThat(current.path("authoredDeclarations"))
        .isEqualTo(stale.newDeclarations())
        .isNotEqualTo(stale.oldDeclarations());
    // Reading/reconstructing current identity is not a save and must not refresh its persisted
    // cache.
    assertThat(
            C.parse(
                jdbc.queryForObject(
                    "SELECT authoring_revision_inputs::text FROM ui_tests WHERE id=?",
                    String.class,
                    test)))
        .isEqualTo(stale.oldCachedInputs());
  }

  private static String row(JdbcTemplate jdbc, String table, String key, Object id) {
    return jdbc.queryForObject(
        "SELECT to_jsonb(r)::text FROM " + table + " r WHERE " + key + "=?", String.class, id);
  }

  private static void requireV20(JdbcTemplate jdbc) {
    if (!jdbc.queryForObject(
            "SELECT count(*)=20 AND bool_and(success) AND min(version::int)=1 AND max(version::int)=20 AND "
                + "count(DISTINCT version::int)=20 FROM flyway_schema_history WHERE version IS NOT NULL",
            Boolean.class)
        || jdbc.queryForObject(
            "SELECT to_regprocedure('studio_015_relearned_from(text)') IS NOT NULL OR "
                + "to_regclass('studio_guided_materialization_versions') IS NOT NULL",
            Boolean.class)
        || !jdbc.queryForObject(
            "SELECT current_setting('server_version_num')::integer BETWEEN 150000 AND 159999 AND "
                + "current_setting('session_replication_role')='origin' AND NOT EXISTS(SELECT 1 FROM pg_trigger "
                + "WHERE NOT tgisinternal AND tgenabled<>'O' AND tgrelid IN (SELECT oid FROM pg_class WHERE "
                + "relnamespace=current_schema()::regnamespace))",
            Boolean.class)) {
      throw new IllegalArgumentException(
          "Legacy fixture requires exact V20 with all guards active");
    }
  }

  private static PublicationContracts.Evidence readHistoricalV20(
      JdbcTemplate jdbc, String id, ObjectNode manifest) {
    requireV20(jdbc);
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
            "SELECT p.plan_revision,p.plan::text,p.plan_hash FROM studio_guided_translation_state s JOIN "
                + "studio_guided_translation_plans p USING(session_id,plan_revision) WHERE s.session_id=?",
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
            "SELECT context_id,context_revision,materialization_revision,worker_id,owner_fence,"
                + "source_revision,configuration_revision,authored_inputs_hash,authored_inputs::text,scope_hash "
                + "FROM studio_guided_materializations WHERE session_id=?",
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
            "SELECT preparation_id,proposal::text,proof::text,execution_evidence::text,observation_hash,"
                + "materialization_revision FROM studio_guided_publication_preparations WHERE session_id=? ORDER BY "
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
            "SELECT obligation_id,meaning::text,proposal::text,proposal_digest,admission_id,plan_revision "
                + "FROM studio_guided_obligation_admissions WHERE session_id=? ORDER BY obligation_id",
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
      throw new IllegalStateException("Historical V20 fixture scope exceeded");
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

  private static PublicationContracts.Receipt commitHistoricalV20(
      JdbcTemplate jdbc, TransactionTemplate tx, PublicationContracts.Commit commit) {
    requireV20(jdbc);
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
                "SELECT document::text FROM studio_guided_publication_bases WHERE session_id=? FOR UPDATE",
                String.class,
                commit.sessionId()));
    var a =
        jdbc.queryForObject(
            "SELECT attempt_id,claim_id,attempt_number,status,validation_deadline,identity::text,"
                + "validator_receipt::text,failure_code FROM studio_guided_publication_attempts WHERE session_id=? "
                + "AND attempt_id=? FOR UPDATE",
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
                "SELECT p.plan_hash FROM studio_guided_translation_state s JOIN "
                    + "studio_guided_translation_plans p USING(session_id,plan_revision) WHERE s.session_id=?",
                String.class,
                commit.sessionId())
            .equals(a.identity().path("translationHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    require(
        jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND "
                        + "(document->>'state'<>'SUCCEEDED' OR document->>'dispatchCount'<>'1')",
                    Integer.class,
                    commit.sessionId())
                == 0
            && jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND status IN "
                        + "('RESERVED','CALLING')",
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
    ObjectNode references =
        C.object(); // V20-valid historical identity lacks future version/declarations.
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
        "INSERT INTO"
            + " ui_test_revisions(id,test_id,csi_id,source_revision,configuration_revision,"
            + "source,source_hash,artifact,artifact_hash,artifact_schema_version,configuration,"
            + "\"references\",provenance,created_by,confirmed_by,confirmed_at,confirmation_source,"
            + "reference_policy,publication_kind,guided_session_id,learned_plan_hash,"
            + "revision_digest,step_snapshot_hashes,step_reuse_provenance)"
            + " VALUES"
            + " (?,?,?,?,?,?::jsonb,?,?::jsonb,?,3,?::jsonb,?::jsonb,?::jsonb,?,"
            + "?,?,'GUIDED_RUN',?::jsonb,'GUIDED_RUN',?,?,?,?::jsonb,?::jsonb)",
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
        null,
        null);
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
}
