package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.CandidateRevision;
import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.PublishResult;
import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.AuthoringV2Response;
import com.citi.put.checks.studio.dto.ContextText;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.VariableReference;
import com.citi.put.checks.studio.readiness.ExecutionReadinessService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;

/** Atomic revision classification, stale publication and immutable snapshot tests. */
@SpringBootTest
@ActiveProfiles("test")
class StudioAuthoringRevisionTest {

  private static final String OWNER = "revision-owner@citi.com";
  private static final String CSI = "61837";
  private static final String FIRST_STEP = "Navigate to \"https://example.test/one\"";
  private static final String SECOND_STEP = "Navigate to \"https://example.test/two\"";

  @Autowired StudioService studioService;
  @Autowired CompileStateService compileStateService;
  @Autowired JdbcTemplate jdbc;
  @Autowired ExecutionReadinessService readiness;

  private UUID testId;
  private Authentication owner;
  private AuthoringV2Response promoted;

  @BeforeEach
  void setUp() {
    seed();
    testId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id,name,csi_id,environment,browser,steps,variables,created_by,"
            + "created_at,updated_at) VALUES (?,'Revision',?,'Production','chromium',"
            + "CAST(? AS jsonb),'[]'::jsonb,?,?,?)",
        testId,
        CSI,
        new com.fasterxml.jackson.databind.ObjectMapper()
            .valueToTree(List.of(FIRST_STEP, SECOND_STEP))
            .toString(),
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    owner = identity();
    promoted = studioService.adaptLegacyAuthoring(testId, 1, 1, owner);
  }

  @Test
  void duplicateAndOrphanIdsAreRejectedWithoutPartialWrites() {
    AuthoringStep first = promoted.steps().get(0);
    AuthoringV2Request duplicate =
        new AuthoringV2Request(2, GlobalAuthoringContext.empty(), List.of(first, first));
    assertThatThrownBy(() -> studioService.saveAuthoring(testId, duplicate, 1, 2, owner))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("more than once");

    AuthoringEvidenceReference orphan =
        new AuthoringEvidenceReference(
            UUID.randomUUID(),
            1,
            AuthoringEvidenceReference.Source.SUPPLIED,
            CSI,
            "Production",
            "/login",
            "visible",
            UUID.randomUUID(),
            OffsetDateTime.parse("2026-09-18T12:00:00Z"),
            AuthoringEvidenceReference.Completeness.COMPLETE,
            "a".repeat(64));
    AuthoringV2Request orphaned =
        new AuthoringV2Request(
            2, new GlobalAuthoringContext(List.of(), List.of(orphan)), promoted.steps());
    assertThatThrownBy(() -> studioService.saveAuthoring(testId, orphaned, 1, 2, owner))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("outside its context scope");
    assertThat(revisions()).containsExactly(1L, 2L);
  }

  @Test
  void twoWritesFromOneRevisionHaveOneWinnerAndOneStaleRevision() throws Exception {
    AuthoringV2Request left = withFirstText("left");
    AuthoringV2Request right = withFirstText("right");
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Callable<Object>> writes = List.of(() -> saveOrCode(left), () -> saveOrCode(right));
      List<Future<Object>> results = pool.invokeAll(writes);
      assertThat(results.get(0).get()).isIn("SUCCESS", "STALE_REVISION");
      assertThat(results.get(1).get()).isIn("SUCCESS", "STALE_REVISION");
      assertThat(List.of(results.get(0).get(), results.get(1).get()))
          .containsExactlyInAnyOrder("SUCCESS", "STALE_REVISION");
      assertThat(revisions()).containsExactly(2L, 2L);
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void contextEditDropsLateCompileAndRevisionSnapshotNeverChanges() {
    CompileRequest obsolete = compileStateService.beginCompile(testId);
    AuthoringV2Request contextOne = withGlobal("  first 雪\n  ");
    studioService.saveAuthoring(testId, contextOne, 1, 2, owner);
    assertThat(compileStateService.publishCandidate(testId, obsolete, candidate(obsolete, "old")))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);

    CompileRequest current = compileStateService.beginCompile(testId);
    assertThat(compileStateService.publishCandidate(testId, current, candidate(current, "current")))
        .isEqualTo(PublishResult.PUBLISHED);
    UUID revisionId =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?", UUID.class, testId);
    String frozen =
        jdbc.queryForObject(
            "SELECT authoring::text FROM ui_test_revisions WHERE id=?", String.class, revisionId);

    studioService.saveAuthoring(testId, withGlobal("second"), 1, 3, owner);
    assertThat(
            jdbc.queryForObject(
                "SELECT authoring::text FROM ui_test_revisions WHERE id=?",
                String.class,
                revisionId))
        .isEqualTo(frozen);
    assertThatThrownBy(
            () -> jdbc.update("UPDATE ui_test_revisions SET authoring=NULL WHERE id=?", revisionId))
        .hasMessageContaining("immutable");
    assertThat(
            jdbc.queryForObject(
                "SELECT compile_status FROM ui_tests WHERE id=?", String.class, testId))
        .isEqualTo("STALE");
    assertThat(
            jdbc.queryForObject(
                "SELECT current_candidate_revision_id IS NULL FROM ui_tests WHERE id=?",
                Boolean.class,
                testId))
        .isTrue();
  }

  @Test
  void promotedDraftRejectsOrdinaryStepMutationAndPublishesOneCanonicalSnapshot() {
    UITestRequest divergent =
        ordinaryRequest("Renamed", List.of("different", SECOND_STEP), List.of(), 1, 2);
    assertThatThrownBy(() -> studioService.updateTest(testId, divergent))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("v2 authoring save");

    UITestDto metadata =
        studioService.updateTest(
            testId, ordinaryRequest("Renamed", List.of(FIRST_STEP, SECOND_STEP), List.of(), 1, 2));
    assertThat(metadata.sourceRevision()).isEqualTo(1);
    assertThat(metadata.configurationRevision()).isEqualTo(2);

    CompileRequest compile = compileStateService.beginCompile(testId);
    assertThat(
            compileStateService.publishCandidate(testId, compile, candidate(compile, "canonical")))
        .isEqualTo(PublishResult.PUBLISHED);
    UUID revisionId =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?", UUID.class, testId);
    String snapshot =
        jdbc.queryForObject(
            "SELECT authoring::text FROM ui_test_revisions WHERE id=?", String.class, revisionId);
    assertThat(
            jdbc.queryForObject(
                "SELECT intent_derivation_version FROM ui_test_revisions WHERE id=?",
                String.class,
                revisionId))
        .isEqualTo("1.0.0");
    assertThat(
            jdbc.queryForObject(
                "SELECT provenance->>'intentDerivationVersion' FROM ui_test_revisions WHERE id=?",
                String.class,
                revisionId))
        .isEqualTo("1.0.0");
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE ui_test_revisions SET intent_derivation_version='2.0.0' WHERE id=?",
                    revisionId))
        .hasMessageContaining("immutable");
    try {
      com.fasterxml.jackson.databind.JsonNode frozen =
          new com.fasterxml.jackson.databind.ObjectMapper().readTree(snapshot);
      assertThat(frozen.path("steps").get(0).path("id").asText())
          .isEqualTo(promoted.steps().get(0).id().toString());
      assertThat(frozen.path("steps").get(0).path("text").asText()).isEqualTo(FIRST_STEP);
      assertThat(frozen.path("steps").get(1).path("text").asText()).isEqualTo(SECOND_STEP);
      assertThat(
              new com.fasterxml.jackson.databind.ObjectMapper()
                  .readTree(
                      jdbc.queryForObject(
                          "SELECT steps::text FROM ui_tests WHERE id=?", String.class, testId)))
          .isEqualTo(
              new com.fasterxml.jackson.databind.ObjectMapper()
                  .valueToTree(List.of(FIRST_STEP, SECOND_STEP)));
    } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
      throw new AssertionError(exception);
    }
  }

  @Test
  void corruptV2ExpectedIntentIsCompileRequiredBeforeAnyExecutionOrLedgerWrite() {
    UUID revisionId = publishAndConfirm(1, 2, "corrupt-intent");
    jdbc.update("ALTER TABLE ui_test_revisions DISABLE TRIGGER trg_ui_test_revisions_write_once");
    try {
      jdbc.update(
          "UPDATE ui_test_revisions SET expected_intent=jsonb_set(expected_intent,"
              + " '{steps,0,operations,0,url,value}', '"
              + '"'
              + "https://evil.test/"
              + '"'
              + "'::jsonb) WHERE id=?",
          revisionId);
    } finally {
      jdbc.update("ALTER TABLE ui_test_revisions ENABLE TRIGGER trg_ui_test_revisions_write_once");
    }
    int executionsBefore =
        jdbc.queryForObject("SELECT COUNT(*) FROM ui_test_executions", Integer.class);
    int ledgerBefore =
        jdbc.queryForObject("SELECT COUNT(*) FROM studio_dispatch_ledger", Integer.class);

    assertThat(readiness.evaluate(testId).code()).isEqualTo("COMPILE_REQUIRED");
    assertThatThrownBy(() -> studioService.executeTest(testId, owner, null))
        .isInstanceOf(StudioConflictException.class)
        .extracting(error -> ((StudioConflictException) error).getCode())
        .isEqualTo("COMPILE_REQUIRED");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ui_test_executions", Integer.class))
        .isEqualTo(executionsBefore);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM studio_dispatch_ledger", Integer.class))
        .isEqualTo(ledgerBefore);
  }

  @Test
  void semanticallyInvalidCandidateCannotBeConfirmed() {
    CompileRequest compile = compileStateService.beginCompile(testId);
    CandidateRevision candidate = candidate(compile, "invalid-confirm");
    assertThat(compileStateService.publishCandidate(testId, compile, candidate))
        .isEqualTo(PublishResult.PUBLISHED);
    UUID revisionId =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?", UUID.class, testId);
    jdbc.update("ALTER TABLE ui_test_revisions DISABLE TRIGGER trg_ui_test_revisions_write_once");
    try {
      jdbc.update(
          "UPDATE ui_test_revisions SET expected_intent=jsonb_set(expected_intent,"
              + " '{steps,0,operations,0,url,value}', '"
              + '"'
              + "https://evil.test/"
              + '"'
              + "'::jsonb) WHERE id=?",
          revisionId);
    } finally {
      jdbc.update("ALTER TABLE ui_test_revisions ENABLE TRIGGER trg_ui_test_revisions_write_once");
    }

    assertThatThrownBy(
            () ->
                compileStateService.confirm(
                    testId,
                    revisionId,
                    candidate.artifactHash(),
                    compile.sourceRevision(),
                    compile.configurationRevision(),
                    OWNER))
        .isInstanceOf(StudioConflictException.class)
        .extracting(error -> ((StudioConflictException) error).getCode())
        .isEqualTo("STALE_CANDIDATE");
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_at IS NULL FROM ui_test_revisions WHERE id=?",
                Boolean.class,
                revisionId))
        .isTrue();
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_revision_id IS NULL FROM ui_tests WHERE id=?",
                Boolean.class,
                testId))
        .isTrue();
  }

  @Test
  void missingRevisionIdentityCannotBeConfirmed() {
    CompileRequest compile = compileStateService.beginCompile(testId);
    CandidateRevision candidate = candidate(compile, "missing-identity");
    compileStateService.publishCandidate(testId, compile, candidate);
    UUID revisionId =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?", UUID.class, testId);
    jdbc.update("ALTER TABLE ui_test_revisions DISABLE TRIGGER trg_ui_test_revisions_write_once");
    try {
      jdbc.update(
          "UPDATE ui_test_revisions SET authoring_revision_inputs='{}'::jsonb WHERE id=?",
          revisionId);
    } finally {
      jdbc.update("ALTER TABLE ui_test_revisions ENABLE TRIGGER trg_ui_test_revisions_write_once");
    }

    assertThatThrownBy(
            () ->
                compileStateService.confirm(
                    testId,
                    revisionId,
                    candidate.artifactHash(),
                    compile.sourceRevision(),
                    compile.configurationRevision(),
                    OWNER))
        .isInstanceOf(StudioConflictException.class);
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_at IS NULL FROM ui_test_revisions WHERE id=?",
                Boolean.class,
                revisionId))
        .isTrue();
  }

  @Test
  void revisionIdentityMutationsRefuseAcceptanceWithoutDurableSideEffects() throws Exception {
    jdbc.update(
        "UPDATE ui_tests SET variables='[{\"name\":\"USER\",\"kind\":\"plain\","
            + "\"value\":\"alice\"}]'::jsonb WHERE id=?",
        testId);
    AuthoringEvidenceReference evidence = evidence(UUID.randomUUID(), "a".repeat(64));
    AuthoringStep first =
        new AuthoringStep(
            promoted.steps().get(0).id(),
            FIRST_STEP,
            new StepAuthoringContext(List.of(new VariableReference("USER")), List.of(evidence)));
    studioService.saveAuthoring(
        testId,
        new AuthoringV2Request(
            2,
            new GlobalAuthoringContext(List.of(new ContextText("bound context")), List.of()),
            List.of(first, promoted.steps().get(1))),
        1,
        2,
        owner);
    UUID revisionId = publishAndConfirm(1, 3, "identity-mutations");
    String original =
        jdbc.queryForObject(
            "SELECT authoring_revision_inputs::text FROM ui_test_revisions WHERE id=?",
            String.class,
            revisionId);
    ObjectNode valid =
        (ObjectNode) new com.fasterxml.jackson.databind.ObjectMapper().readTree(original);
    List<ObjectNode> mutations = new java.util.ArrayList<>();
    for (String field : List.of("contextDigest", "globalContext")) {
      ObjectNode changed = valid.deepCopy();
      changed.put(field, "f".repeat(64));
      mutations.add(changed);
    }
    for (String collection :
        List.of("stepContexts", "nonsecretReferencedValues", "selectedEvidenceReferences")) {
      ObjectNode changed = valid.deepCopy();
      ((ObjectNode) changed.path(collection).get(0))
          .put(
              collection.equals("selectedEvidenceReferences")
                  ? "hash"
                  : collection.equals("stepContexts") ? "hash" : "valueHash",
              "f".repeat(64));
      mutations.add(changed);
    }
    ObjectNode reordered = valid.deepCopy();
    com.fasterxml.jackson.databind.node.ArrayNode steps =
        (com.fasterxml.jackson.databind.node.ArrayNode) reordered.path("stepContexts");
    JsonNode firstHash = steps.get(0).deepCopy();
    steps.set(0, steps.get(1));
    steps.set(1, firstHash);
    mutations.add(reordered);

    int executionsBefore =
        jdbc.queryForObject("SELECT COUNT(*) FROM ui_test_executions", Integer.class);
    int ledgerBefore =
        jdbc.queryForObject("SELECT COUNT(*) FROM studio_dispatch_ledger", Integer.class);
    for (ObjectNode mutation : mutations) {
      replaceRevisionInputs(revisionId, mutation.toString());
      assertThatThrownBy(() -> studioService.executeTest(testId, owner, null))
          .isInstanceOf(StudioConflictException.class)
          .extracting(error -> ((StudioConflictException) error).getCode())
          .isEqualTo("COMPILE_REQUIRED");
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ui_test_executions", Integer.class))
          .isEqualTo(executionsBefore);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM studio_dispatch_ledger", Integer.class))
          .isEqualTo(ledgerBefore);
    }
    replaceRevisionInputs(revisionId, original);
    assertThat(readiness.evaluate(testId).ready()).isTrue();
  }

  @Test
  void readinessVerificationNeverReadsMutableDraftAuthoring() {
    UUID revisionId = publishAndConfirm(1, 2, "immutable-readiness");
    jdbc.update(
        "UPDATE ui_tests SET authoring=jsonb_set(authoring,'{steps,0,text}',"
            + "'\"mutable draft text\"'::jsonb) WHERE id=?",
        testId);

    assertThat(readiness.evaluate(testId).ready()).isTrue();
    assertThat(readiness.evaluate(testId).revisionId()).isEqualTo(revisionId);
  }

  @Test
  void unsupportedDerivationVersionRefusesBeforeExecutionAndLedgerEffects() {
    UUID revisionId = publishAndConfirm(1, 2, "unsupported-version");
    jdbc.update("ALTER TABLE ui_test_revisions DISABLE TRIGGER trg_ui_test_revisions_write_once");
    try {
      jdbc.update(
          "UPDATE ui_test_revisions SET intent_derivation_version='9.9.9',"
              + " provenance=jsonb_set(provenance,'{intentDerivationVersion}',"
              + " '\"9.9.9\"'::jsonb) WHERE id=?",
          revisionId);
    } finally {
      jdbc.update("ALTER TABLE ui_test_revisions ENABLE TRIGGER trg_ui_test_revisions_write_once");
    }
    int executionsBefore =
        jdbc.queryForObject("SELECT COUNT(*) FROM ui_test_executions", Integer.class);
    int ledgerBefore =
        jdbc.queryForObject("SELECT COUNT(*) FROM studio_dispatch_ledger", Integer.class);

    assertThatThrownBy(() -> studioService.executeTest(testId, owner, null))
        .isInstanceOf(StudioConflictException.class)
        .extracting(error -> ((StudioConflictException) error).getCode())
        .isEqualTo("COMPILE_REQUIRED");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ui_test_executions", Integer.class))
        .isEqualTo(executionsBefore);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM studio_dispatch_ledger", Integer.class))
        .isEqualTo(ledgerBefore);
  }

  @Test
  void referencedNonsecretValueChangeRefreshesIdentityAndInvalidatesCandidate() {
    jdbc.update(
        "UPDATE ui_tests SET variables='[{\"name\":\"USER\",\"kind\":\"plain\","
            + "\"value\":\"alpha\"}]'::jsonb WHERE id=?",
        testId);
    AuthoringStep referenced =
        new AuthoringStep(
            promoted.steps().get(0).id(),
            FIRST_STEP,
            new StepAuthoringContext(List.of(new VariableReference("USER")), List.of()));
    AuthoringV2Response saved =
        studioService.saveAuthoring(
            testId,
            new AuthoringV2Request(
                2, GlobalAuthoringContext.empty(), List.of(referenced, promoted.steps().get(1))),
            1,
            2,
            owner);
    String before = saved.revisionInputs().nonsecretReferencedValues().get(0).valueHash();
    publishAndConfirm(1, 3, "nonsecret");

    UITestDto changed =
        studioService.updateTest(
            testId,
            ordinaryRequest(
                "Revision",
                List.of(FIRST_STEP, SECOND_STEP),
                List.of(StudioVariable.plain("USER", "beta")),
                1,
                3));
    String after =
        studioService
            .findAuthoringV2ById(testId, owner)
            .revisionInputs()
            .nonsecretReferencedValues()
            .get(0)
            .valueHash();
    assertThat(after).isNotEqualTo(before);
    assertThat(changed.configurationRevision()).isEqualTo(4);
    assertThat(changed.compileStatus().name()).isEqualTo("STALE");
    assertThat(changed.currentCandidateRevisionId()).isNull();
  }

  @Test
  void selectedEvidenceChangeInvalidatesWhileMetadataOnlyUpdateRetainsReadiness() {
    AuthoringEvidenceReference firstEvidence = evidence(UUID.randomUUID(), "a".repeat(64));
    AuthoringV2Response selected =
        studioService.saveAuthoring(
            testId,
            new AuthoringV2Request(
                2, new GlobalAuthoringContext(List.of(), List.of(firstEvidence)), promoted.steps()),
            1,
            2,
            owner);
    UUID candidateId = publishAndConfirm(1, 3, "evidence");

    UITestDto metadata =
        studioService.updateTest(
            testId,
            ordinaryRequest("Metadata only", List.of(FIRST_STEP, SECOND_STEP), List.of(), 1, 3));
    assertThat(metadata.compileStatus().name()).isEqualTo("READY");
    assertThat(metadata.currentCandidateRevisionId()).isEqualTo(candidateId);
    assertThat(metadata.configurationRevision()).isEqualTo(3);

    AuthoringEvidenceReference replacement = evidence(UUID.randomUUID(), "b".repeat(64));
    AuthoringV2Response changed =
        studioService.saveAuthoring(
            testId,
            new AuthoringV2Request(
                2, new GlobalAuthoringContext(List.of(), List.of(replacement)), promoted.steps()),
            1,
            3,
            owner);
    assertThat(changed.revisionInputs().selectedEvidenceReferences())
        .extracting(input -> input.id())
        .containsExactly(replacement.id());
    assertThat(selected.revisionInputs().selectedEvidenceReferences())
        .extracting(input -> input.id())
        .containsExactly(firstEvidence.id());
    assertThat(revisions()).containsExactly(1L, 4L);
    assertThat(
            jdbc.queryForObject(
                "SELECT current_candidate_revision_id IS NULL FROM ui_tests WHERE id=?",
                Boolean.class,
                testId))
        .isTrue();
  }

  private Object saveOrCode(AuthoringV2Request request) {
    try {
      studioService.saveAuthoring(testId, request, 1, 2, owner);
      return "SUCCESS";
    } catch (StudioConflictException conflict) {
      return conflict.getCode();
    }
  }

  private AuthoringV2Request withFirstText(String text) {
    return new AuthoringV2Request(
        2,
        GlobalAuthoringContext.empty(),
        List.of(
            new AuthoringStep(promoted.steps().get(0).id(), text, StepAuthoringContext.empty()),
            promoted.steps().get(1)));
  }

  private AuthoringV2Request withGlobal(String value) {
    return new AuthoringV2Request(
        2,
        new GlobalAuthoringContext(List.of(new ContextText(value)), List.of()),
        promoted.steps());
  }

  private CandidateRevision candidate(CompileRequest request, String hash) {
    String source =
        com.citi.put.checks.studio.compile.ArtifactCanonicalizer.canonicalSource(
            List.of(FIRST_STEP, SECOND_STEP));
    String artifact = "{}";
    return new CandidateRevision(
        request.configurationRevision(),
        source,
        com.citi.put.checks.studio.compile.ArtifactCanonicalizer.hash(source),
        artifact,
        com.citi.put.checks.studio.compile.ArtifactCanonicalizer.hash(artifact),
        1,
        "{\"environment\":\"Production\"}",
        "{}",
        "{\"intentDerivationVersion\":\"1.0.0\","
            + "\"validatorSchemaVersion\":\"1.0.0\","
            + "\"syntaxReferenceVersion\":\"1.0.0\"}",
        OWNER,
        "{\"schemaVersion\":1,\"steps\":["
            + intentStep(0, promoted.steps().get(0).id(), "https://example.test/one")
            + ","
            + intentStep(1, promoted.steps().get(1).id(), "https://example.test/two")
            + "]}",
        "1.0.0");
  }

  private static String intentStep(int index, UUID id, String url) {
    return "{\"stepIndex\":"
        + index
        + ",\"stepId\":\""
        + id
        + "\",\"operations\":[{\"op\":\"goto\",\"url\":{\"kind\":\"literal\","
        + "\"value\":\""
        + url
        + "\"}}]}";
  }

  private UUID publishAndConfirm(long sourceRevision, long configurationRevision, String hash) {
    CompileRequest compile = compileStateService.beginCompile(testId);
    CandidateRevision candidate = candidate(compile, hash);
    assertThat(compile.sourceRevision()).isEqualTo(sourceRevision);
    assertThat(compile.configurationRevision()).isEqualTo(configurationRevision);
    assertThat(compileStateService.publishCandidate(testId, compile, candidate))
        .isEqualTo(PublishResult.PUBLISHED);
    UUID revisionId =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?", UUID.class, testId);
    java.util.Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT source::text source,authoring::text authoring,"
                + "authoring_revision_inputs::text inputs,csi_id,configuration::text configuration"
                + " FROM ui_test_revisions WHERE id=?",
            revisionId);
    assertThatCode(
            () ->
                new com.citi.put.checks.studio.compile.VersionedIntentDeriver()
                    .deriveRevision(
                        "1.0.0",
                        String.valueOf(row.get("source")),
                        String.valueOf(row.get("authoring")),
                        String.valueOf(row.get("inputs")),
                        String.valueOf(row.get("csi_id")),
                        String.valueOf(row.get("configuration"))))
        .doesNotThrowAnyException();
    compileStateService.confirm(
        testId, revisionId, candidate.artifactHash(), sourceRevision, configurationRevision, OWNER);
    return revisionId;
  }

  private UITestRequest ordinaryRequest(
      String name,
      List<String> steps,
      List<StudioVariable> variables,
      long sourceRevision,
      long configurationRevision) {
    return new UITestRequest(
        name,
        "metadata",
        CSI,
        "Production",
        steps,
        variables,
        TestConfiguration.defaults(),
        sourceRevision,
        configurationRevision);
  }

  private AuthoringEvidenceReference evidence(UUID id, String hash) {
    return new AuthoringEvidenceReference(
        id,
        1,
        AuthoringEvidenceReference.Source.SUPPLIED,
        CSI,
        "Production",
        "/login",
        "visible",
        promoted.steps().get(0).id(),
        OffsetDateTime.parse("2026-09-18T12:00:00Z"),
        AuthoringEvidenceReference.Completeness.COMPLETE,
        hash);
  }

  private List<Long> revisions() {
    return jdbc.queryForObject(
        "SELECT source_revision, configuration_revision FROM ui_tests WHERE id=?",
        (result, row) -> List.of(result.getLong(1), result.getLong(2)),
        testId);
  }

  private void replaceRevisionInputs(UUID revisionId, String json) {
    jdbc.update("ALTER TABLE ui_test_revisions DISABLE TRIGGER trg_ui_test_revisions_write_once");
    try {
      jdbc.update(
          "UPDATE ui_test_revisions SET authoring_revision_inputs=CAST(? AS jsonb) WHERE id=?",
          json,
          revisionId);
    } finally {
      jdbc.update("ALTER TABLE ui_test_revisions ENABLE TRIGGER trg_ui_test_revisions_write_once");
    }
  }

  private void seed() {
    jdbc.update(
        "INSERT INTO users (id,sso_id,name,email,created_at,is_active) VALUES"
            + " (?,?,'Owner',?,?,true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
    jdbc.update(
        "INSERT INTO csi_systems (id,name,business_unit,criticality,owner_email,environment,"
            + "status,created_at,updated_at) VALUES (?,'Revision CSI','Ops','HIGH',?,"
            + "'Production','OPERATIONAL',?,?) ON CONFLICT (id) DO NOTHING",
        CSI,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private static Authentication identity() {
    return new BffAuthenticationToken(
        new UserIdentity(
            "uid-revision",
            OWNER,
            "Owner",
            "Ops",
            List.of(),
            List.of(new CsiOwnershipEntry(CSI, "owner"))));
  }
}
