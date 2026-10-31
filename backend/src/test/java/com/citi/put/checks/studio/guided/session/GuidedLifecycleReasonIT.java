package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.secrets.SecretAuditLifecycle;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * STUDIO-OBS-009 AC-11 obligation LIFECYCLE-REASON-01 (LR a-c): the context lifecycle callback maps
 * the runner's stop reason, as the no-browser {@code assignmentLifecycle} always did.
 *
 * <p><b>The defect.</b> {@code GuidedSessionService.lifecycle}, the owning worker's callback for a
 * session with a running browser, stopped the session {@code UNKNOWN_OUTCOME} if any action was
 * {@code DISPATCHING} and {@code FAILED} otherwise. It never read {@code reason}. So an {@code
 * EXPIRED} report accepted just before the backend's own expiry (the runner clock ahead of the
 * backend, or a close faster than the skew) ended {@code FAILED}: no {@code errorCode}, later
 * commands answering {@code PUBLICATION_CONFLICT} instead of {@code EXPIRED}, and the secret audit
 * recording the wrong terminal state.
 *
 * <p><b>The ruling</b> (T0 §4, "LIFECYCLE-REASON-01 tolerance: no tolerance"). Mirror {@code
 * assignmentLifecycle} exactly: reason {@code EXPIRED} gives state {@code EXPIRED}; a {@code
 * DISPATCHING} action still wins with {@code UNKNOWN_OUTCOME}; every other reason stays {@code
 * FAILED}. A tolerance would add a cross-host clock comparison and a new margin, against the R9/R10
 * precedent (judge on the database clock). The accepted consequence is that a worker that labels an
 * early stop {@code EXPIRED} gets {@code EXPIRED} instead of {@code FAILED}; both are terminal and
 * nothing is published.
 *
 * <p><b>Unchanged and pinned here:</b> the owning-worker mTLS identity, the fence and the L1 {@code
 * verifyLifecycle} identity check; the refusal of a callback past the lease (409 {@code
 * STALE_FENCE}); no new vocabulary ({@code EXPIRED} already exists); no wire, schema or OpenAPI
 * change. The hand-built {@code LEASE_LOST} cases in {@code GuidedSessionIT} and {@code
 * GuidedServiceTransportFaultIT} are not touched.
 *
 * <p><b>Fixture lineage.</b> The service wiring, access double and clock adapt {@code
 * GuidedSessionIT}, whose helpers are private to a 1.9k-line class. If the originals change, change
 * these with them.
 */
class GuidedLifecycleReasonIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");
  private static JsonNode documents;

  private final GuidedContracts contracts = new GuidedContracts();
  private final MutableClock clock = new MutableClock();
  private final TestAccess access = new TestAccess();
  private JdbcTemplate jdbc;
  private GuidedSessionRepository repository;
  private GuidedSessionService service;
  private GuidedMaterializationService materialization;
  private SecretAuditLifecycle audit;
  private final Authentication user = user("user-1", "owner");
  private final Authentication worker =
      new GuidedInternalSecurity.Identity("worker-1", "owning-worker");
  private final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");

  @BeforeAll
  static void database() throws Exception {
    POSTGRES.start();
    try (var in =
        GuidedLifecycleReasonIT.class.getResourceAsStream(
            "/studio/guided/session-it-documents.json")) {
      documents = new ObjectMapper().readTree(in).path("documents");
    }
  }

  @AfterAll
  static void close() {
    POSTGRES.stop();
  }

  @BeforeEach
  void setup(org.junit.jupiter.api.TestInfo testInfo) {
    admissionSubject =
        ADMISSION_SUBJECTS.contains(testInfo.getTestMethod().orElseThrow().getName());
    // An isolated real database per case keeps the append-only audit triggers intact.
    String database = "lifecycle_" + UUID.randomUUID().toString().replace("-", "");
    new JdbcTemplate(
            new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()))
        .execute("CREATE DATABASE " + database);
    var source =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl().replace(POSTGRES.getDatabaseName(), database),
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    jdbc = new JdbcTemplate(source);
    Flyway.configure().dataSource(source).load().migrate();
    repository =
        new GuidedSessionRepository(
            jdbc,
            new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())),
            contracts);
    sourceFixture();
    service = newService();
  }

  // ---- LR c, case 1: the defect (red before the fix) ----

  @Test
  void anExpiredReportAcceptedBeforeTheBackendExpiryEndsExpired() {
    String id = observing();

    JsonNode stopped = lifecycle(id, "EXPIRED", "lifecycle-expired");

    assertThat(stopped.path("state").asText()).isEqualTo("EXPIRED");
    assertThat(persistedState(id)).isEqualTo("EXPIRED");
    assertThat(terminalStateRecordedByTheSecretAudit())
        .as("the secret-audit guided terminal records the resulting state")
        .isEqualTo("EXPIRED");
    assertThatThrownBy(() -> service.observe(worker, id, 1, "late", observation(id, 1)))
        .as("a later command on the session answers EXPIRED, not PUBLICATION_CONFLICT")
        .hasMessage("EXPIRED");
    assertThat(teardownReason(id))
        .as("the stop sent to the runner names the same reason (assignmentLifecycle does too)")
        .isEqualTo("EXPIRED");
    assertThat(persistedErrorCode(id)).as("EXPIRED is not a failure code").isNull();
  }

  // ---- LR c, case 2: every other reason stays FAILED ----

  @Test
  void everyOtherReasonStillEndsFailed() {
    for (String reason :
        List.of("LEASE_LOST", "CANCELLED", "UNKNOWN_OUTCOME", "CONTEXT_LOST", "REVOKED")) {
      String id = observing();

      JsonNode stopped = lifecycle(id, reason, "lifecycle-" + reason);

      assertThat(stopped.path("state").asText()).as(reason).isEqualTo("FAILED");
      assertThat(persistedState(id)).as(reason).isEqualTo("FAILED");
      assertThat(teardownReason(id)).as(reason).isEqualTo("UNKNOWN_OUTCOME");
      // SC008-FIX-20: the reason is kept as a closed code the author can read, not a bare FAILED.
      assertThat(persistedErrorCode(id)).as(reason).isEqualTo("LEARNING_" + reason);
    }
    ArgumentCaptor<JsonNode> terminal = ArgumentCaptor.forClass(JsonNode.class);
    verify(audit, org.mockito.Mockito.atLeastOnce()).guidedTerminal(terminal.capture());
    assertThat(terminal.getAllValues())
        .extracting(session -> session.path("state").asText())
        .containsOnly("FAILED");
  }

  // ---- LR c, case 3: a DISPATCHING action still wins ----

  @Test
  void aDispatchingActionStillEndsUnknownOutcomeWhateverTheReason() {
    for (String reason : List.of("EXPIRED", "LEASE_LOST")) {
      String id = observing();
      JsonNode dispatched = dispatch(id);
      assertThat(dispatched.path("state").asText()).isEqualTo("DISPATCHING");

      JsonNode stopped = lifecycle(id, reason, "lifecycle-dispatching-" + reason);

      assertThat(stopped.path("state").asText()).as(reason).isEqualTo("UNKNOWN_OUTCOME");
      assertThat(persistedState(id)).as(reason).isEqualTo("UNKNOWN_OUTCOME");
      assertThat(repository.actions(id).getFirst().path("state").asText())
          .as("the uncertain action is recorded, as before")
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(persistedErrorCode(id)).as(reason).isNull();
    }
  }

  // ---- SC008-FIX-20: a code that is already there is kept ----

  @Test
  void anErrorCodeAlreadyOnTheSessionIsKept() {
    String id = observing();
    jdbc.update(
        "UPDATE studio_guided_sessions SET progress = jsonb_set(progress, '{errorCode}',"
            + " '\"BUDGET_EXCEEDED\"') WHERE session_id=?",
        id);

    lifecycle(id, "CONTEXT_LOST", "lifecycle-kept");

    assertThat(persistedState(id)).isEqualTo("FAILED");
    assertThat(persistedErrorCode(id)).isEqualTo("BUDGET_EXCEEDED");
  }

  // ---- SC008-FIX-20: the no-browser path gives the same codes ----

  @Test
  void theNoBrowserAssignmentLifecycleGivesTheSameCodes() {
    for (String reason : List.of("CONTEXT_LOST", "LEASE_LOST", "EXPIRED")) {
      String id = observing();
      ObjectNode request =
          contracts
              .object()
              .put("schemaVersion", 3)
              .put("kind", "assignment")
              .put("reason", reason);
      request.set("assignment", new GuidedAssignmentStore(jdbc, contracts).find(id));

      service.assignmentLifecycle(worker, id, "assignment-" + reason, request);

      if (reason.equals("EXPIRED")) {
        assertThat(persistedState(id)).as(reason).isEqualTo("EXPIRED");
        assertThat(persistedErrorCode(id)).as(reason).isNull();
      } else {
        assertThat(persistedState(id)).as(reason).isEqualTo("FAILED");
        assertThat(persistedErrorCode(id)).as(reason).isEqualTo("LEARNING_" + reason);
      }
    }
  }

  // ---- LR b: the refusals and identity checks are unchanged ----

  @Test
  void aCallbackPastTheLeaseIsStillRefusedStaleFenceAndNothingIsStopped() {
    String id = observing();
    ObjectNode request = request(id, "EXPIRED");
    clock.now = clock.now.plusSeconds(3600);

    assertThatThrownBy(() -> service.lifecycle(worker, id, 1, "lifecycle-late", request))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("STALE_FENCE");

    assertThat(persistedState(id)).isNotIn("EXPIRED", "FAILED", "UNKNOWN_OUTCOME");
    verify(audit, never()).guidedTerminal(any());
  }

  @Test
  void theContextIdentityIsStillCheckedWhateverTheReason() {
    String id = observing();
    ObjectNode request = request(id, "EXPIRED");
    request.put("contextId", "context-of-another-session");

    assertThatThrownBy(() -> service.lifecycle(worker, id, 1, "lifecycle-foreign", request))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("STALE_FENCE");

    assertThat(persistedState(id)).isNotIn("EXPIRED", "FAILED", "UNKNOWN_OUTCOME");
  }

  // ---- the publication commit's stop names PUBLISHED (and nothing else does) ----

  @Test
  void onlyThePublicationCommitStopCarriesPublishedAndARedrivenStopKeepsIt() throws Exception {
    var sent = new java.util.concurrent.CopyOnWriteArrayList<String>();
    service.installStopSender(
        (target, reason) -> {
          sent.add(reason);
          // Never confirmed: the durable request stays PENDING so it can be re-driven.
          throw new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
        });

    String published = observing();
    repository.transaction(
        () -> {
          var current = repository.lock(published);
          current.document().put("state", "SUCCEEDED");
          current.progress().put("publicationRevisionId", UUID.randomUUID().toString());
          repository.save(current);
          service.publicationCommitted(published);
          return null;
        });
    assertThat(teardownReason(published)).isEqualTo("PUBLISHED");
    org.awaitility.Awaitility.await()
        .atMost(java.time.Duration.ofSeconds(10))
        .until(() -> sent.contains("PUBLISHED"));

    // A restart re-drives the persisted request: the same reason, read back from the row.
    sent.clear();
    var redriven = new java.util.concurrent.CopyOnWriteArrayList<String>();
    service.installStopSender((target, reason) -> redriven.add(reason));
    service.redriveTeardowns(java.time.Duration.ofHours(1), 32);
    org.awaitility.Awaitility.await()
        .atMost(java.time.Duration.ofSeconds(10))
        .until(() -> redriven.contains("PUBLISHED"));

    // Every other terminal keeps a recording: a conflict is not a publication.
    String conflict = observing();
    repository.transaction(
        () -> {
          var current = repository.lock(conflict);
          current.document().put("state", "PUBLICATION_CONFLICT");
          repository.save(current);
          service.publicationConflicted(conflict);
          return null;
        });
    assertThat(teardownReason(conflict)).isEqualTo("UNKNOWN_OUTCOME");
  }

  // ---- helpers ----

  private JsonNode lifecycle(String id, String reason, String key) {
    return service.lifecycle(worker, id, 1, key, request(id, reason));
  }

  /** The owning worker's context lifecycle body: the frozen identity plus the stop reason. */
  private ObjectNode request(String id, String reason) {
    return materialization.identity(context(id)).put("reason", reason);
  }

  private String persistedState(String id) {
    return jdbc.queryForObject(
        "SELECT document->>'state' FROM studio_guided_sessions WHERE session_id=?",
        String.class,
        id);
  }

  private String persistedErrorCode(String id) {
    return jdbc.queryForObject(
        "SELECT progress->>'errorCode' FROM studio_guided_sessions WHERE session_id=?",
        String.class,
        id);
  }

  private String teardownReason(String id) {
    return jdbc.queryForObject(
        "SELECT progress->'teardownRequest'->>'reason' FROM studio_guided_sessions"
            + " WHERE session_id=?",
        String.class,
        id);
  }

  /** The state of the document the last {@code guidedTerminal} call was handed. */
  private String terminalStateRecordedByTheSecretAudit() {
    ArgumentCaptor<JsonNode> terminal = ArgumentCaptor.forClass(JsonNode.class);
    verify(audit, org.mockito.Mockito.atLeastOnce()).guidedTerminal(terminal.capture());
    return terminal.getValue().path("state").asText();
  }

  private GuidedSessionService newService() {
    var result =
        new GuidedSessionService(
            repository,
            contracts,
            sourceAccess(),
            new GuidedSessionProperties(true, Map.of()),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            clock);
    installTranslation(result, jdbc, contracts);
    materialization =
        new GuidedMaterializationService(
            jdbc, contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    result.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, contracts),
        new GuidedBindingStore(jdbc, contracts, materialization),
        new GuidedAssignmentStore(jdbc, contracts));
    // The audit is a double so the terminal state it is handed can be read. Its real work needs
    // secret rows this fixture does not have.
    audit = mock(SecretAuditLifecycle.class);
    result.installSecretAudit(audit);
    // Every start needs an approved governed policy for its scope.
    com.citi.put.checks.studio.support.ObservedPublicationFixture.installCsiBudget(result, jdbc);
    result.installEvidence(
        new com.citi.put.checks.studio.guided.evidence.RecordedGuidedEvidenceProjection(
            new com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceRepository(jdbc),
            new com.citi.put.checks.studio.guided.evidence.GuidedRecordingProperties(null),
            false,
            contracts));
    return result;
  }

  private ObjectNode versions() {
    return (ObjectNode) contracts.parse("{\"contract\":3}");
  }

  private ObjectNode context(String id) {
    return repository.transaction(() -> materialization.context(repository.lock(id).document()));
  }

  private ObjectNode claim(String id, String workerId, int fence) {
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("sessionId", id)
        .put("workerId", workerId)
        .put("expectedFence", fence)
        .set("versions", versions());
  }

  private ObjectNode start() {
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("testId", SOURCE_TEST.toString())
        .put("sourceRevision", "1")
        .put("configurationRevision", "1")
        .put("environmentId", "fixture")
        .set("versions", versions());
  }

  /** A session assigned to worker-1 and materialized at v1, with no delivery pending. */
  private String observing() {
    String id =
        service.start(user, UUID.randomUUID().toString(), start()).path("sessionId").asText();
    ObjectNode intent = service.prepareAssignment(controller, id, "assignment", "worker-1");
    JsonNode claimed = service.claim(worker, id, "claim", claim(id, "worker-1", 0));
    ObjectNode receipt =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("status", "OWNED")
            .put("ownerFence", 1)
            .put("leaseExpiresAt", claimed.path("owner").path("leaseExpiresAt").asText());
    receipt.set("assignment", intent);
    service.acknowledgeAssignment(controller, id, receipt);
    if (admissionSubject) {
      planner(id).bootstrap(id);
    } else {
      service.materialize(controller, id, 1, "materialize", new ObjectMapper().createArrayNode());
    }
    return id;
  }

  private String scope(String id) {
    return repository.transaction(() -> repository.lock(id).document().path("scopeHash").asText());
  }

  private ObjectNode fixture(String name) {
    ObjectNode value = documents.path(name).deepCopy();
    value.put("schemaVersion", 3);
    if (name.equals("observation")) {
      value.withObject("/coverage").put("passwordControls", 0);
    }
    if (name.equals("session")) {
      value.withObject("/scope").remove("accountRef");
      value.remove("authConnection");
      value.set("versions", versions());
    }
    return value;
  }

  private ObjectNode observation(String id, int generation) {
    ObjectNode o =
        com.citi.put.checks.studio.support.ObservationFixtures.observation()
            .document("document-1", generation)
            .element("e1", "button", "Save")
            .build();
    o.put("sessionId", id).put("scopeHash", scope(id)).put("generation", generation);
    return o;
  }

  private ObjectNode proposal(String id) {
    ObjectNode p = fixture("action");
    p.put("sessionId", id).put("scopeHash", scope(id));
    // A click has no runtime-value producer side effects; only the action state matters here.
    p.remove("target");
    String code = "await page.getByRole('button', { name: 'Save' }).click();";
    ObjectNode operation = p.putObject("operation");
    operation.put("kind", "step").put("code", code);
    operation.putArray("captures");
    operation.putArray("uses");
    operation.put(
        "sourceHash",
        GuidedContracts.hash(com.fasterxml.jackson.databind.node.TextNode.valueOf(code)));
    ObjectNode observation = observation(id, 1);
    ObjectNode context = context(id);
    ObjectNode evidence =
        contracts
            .object()
            .put("kind", "observedDocument")
            .put("sessionId", id)
            .put("contextId", context.path("contextId").asText())
            .put("documentId", "document-1")
            .put("generation", 1)
            .put("origin", "https://orders.example.test")
            .put("observationHash", GuidedContracts.hash(observation));
    p.remove("observationHash");
    p.put("generation", 1)
        .put("evidenceHash", GuidedContracts.hash(evidence))
        .put("authoredInputsHash", context.path("authoredInputsHash").asText())
        .put("contextRevision", 1);
    p.set("executionEvidence", evidence);
    return p;
  }

  /** Observe, admit and consume one click: the action is left {@code DISPATCHING}. */
  private JsonNode dispatch(String id) {
    service.observe(worker, id, 1, "observe", observation(id, 1));
    firstObservationCommitted(repository, id);
    JsonNode association = planner(id).reserve(id, "admit", proposal(id));
    JsonNode proposal = association.path("proposal");
    String issuedKey = association.path("admissionKey").asText();
    ObjectNode proof = materialization.identity(context(id));
    proof
        .put("preparationId", UUID.randomUUID().toString())
        .put("requestDigest", GuidedContracts.hash(proposal))
        .put("evidenceHash", proposal.path("evidenceHash").asText())
        .put("authoredInputsHash", proposal.path("authoredInputsHash").asText())
        .put("expiresAt", clock.now.plusSeconds(20).toString());
    JsonNode existing = service.existingAdmission(controller, id, 1, issuedKey, proposal);
    assertThat(existing).as("a new admission").isNull();
    service.storePreparation(controller, id, 1, proposal, proof);
    JsonNode admission =
        service.admit(controller, id, 1, issuedKey, proposal, proof.path("preparationId").asText());
    ObjectNode advance =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("ownerFence", 1)
            .put("admissionId", admission.path("admission").path("admissionId").asText())
            .put("operationHash", admission.path("operationHash").asText());
    GuidedSessionService.Consumption result =
        service.consume(controller, id, 1, "advance", advance);
    if (result instanceof GuidedSessionService.WonConsumption won) {
      return won.ledger();
    }
    return ((GuidedSessionService.AlreadyConsumed) result).ledger();
  }

  private static Authentication user(String id, String role) {
    return new BffAuthenticationToken(
        new UserIdentity(
            id,
            "fixture@example.test",
            "Fixture",
            "Test",
            List.of(),
            List.of(new CsiOwnershipEntry("CSI-123", role))));
  }

  private static final class MutableClock extends Clock {
    private Instant now = Instant.parse("2026-10-08T03:00:00Z");

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }

  /** The trusted CSI, source and configuration boundary for the fixture tests. */
  private final class TestAccess implements GuidedSessionAccess, GuidedSessionService.StepVerifier {
    @Override
    public boolean complete(JsonNode session, JsonNode completion, List<ObjectNode> actions) {
      return true;
    }

    @Override
    public Snapshot resolve(Authentication principal, JsonNode start) {
      ObjectNode session = fixture("session"), scope = (ObjectNode) session.path("scope");
      for (String field : List.of("environmentId")) {
        scope.set(field, start.path(field));
      }
      return new Snapshot(scope, session.path("sourceSteps"));
    }

    @Override
    public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
      return new GuidedSourceReferenceValidator.Sources("1", "1", Map.of(), Map.of());
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {}

    @Override
    public void checkUser(Authentication principal, JsonNode session) {
      GuidedSessionException.require(
          principal instanceof BffAuthenticationToken
              && ((BffAuthenticationToken) principal)
                  .getPrincipal()
                  .userId()
                  .equals(session.path("scope").path("principalId").asText())
              && new CsiOwnershipEvaluator()
                  .canExecute(principal, session.path("scope").path("csiId").asText()),
          "FORBIDDEN_SCOPE",
          403);
    }

    @Override
    public boolean recoverableContext(String id, String workerId) {
      return false;
    }

    @Override
    public String authorizeAction(JsonNode session, JsonNode proposal) {
      return "a".repeat(64);
    }
  }

  private static final java.util.Set<String> ADMISSION_SUBJECTS =
      java.util.Set.of("aDispatchingActionStillEndsUnknownOutcomeWhateverTheReason");

  private static final UUID SOURCE_TEST = UUID.fromString("00000000-0000-4000-8000-0000000000b1");
  private final Map<String, PlanningPath> planningPaths =
      new java.util.concurrent.ConcurrentHashMap<>();
  private boolean admissionSubject;

  private void sourceFixture() {
    try {
      var mapper = new ObjectMapper().findAndRegisterModules();
      var authoring =
          new com.citi.put.checks.studio.dto.AuthoringV2Request(
              2,
              null,
              List.of(
                  new com.citi.put.checks.studio.dto.AuthoringStep(
                      UUID.fromString("00000000-0000-4000-8000-0000000000a1"),
                      "Click Order number.",
                      null),
                  new com.citi.put.checks.studio.dto.AuthoringStep(
                      UUID.fromString("00000000-0000-4000-8000-0000000000a2"),
                      "Assert Order reference is visible.",
                      null)));
      var principal = ((BffAuthenticationToken) user).getPrincipal();
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES (?,'GS-T fixture',?)",
          principal.userId(),
          principal.email());
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) "
              + "VALUES ('CSI-123','GS-T fixture','Test','LOW',?,'Development')",
          principal.email());
      jdbc.update(
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,authoring,"
              + "authoring_revision_inputs,created_by) VALUES (?,'GS-T source','CSI-123','fixture',"
              + "'chromium',?::jsonb,?::jsonb,?::jsonb,?::jsonb,?)",
          SOURCE_TEST,
          mapper.writeValueAsString(
              List.of("Click Order number.", "Assert Order reference is visible.")),
          // A test may only be learned on the origins it names (STUDIO-GOV-001.4).
          "[{\"name\":\"appUrl\",\"kind\":\"plain\",\"value\":\"https://orders.example.test\"}]",
          mapper.writeValueAsString(authoring),
          mapper.writeValueAsString(
              com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity.create(
                  authoring, Map.of())),
          principal.email());
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalStateException("GS-T source fixture serialization", failure);
    }
  }

  private com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess
      sourceAccess() {
    return productionAccess(jdbc, contracts, access, "https://orders.example.test");
  }

  private PlanningPath planner(String id) {
    return planningPaths.computeIfAbsent(
        id,
        ignored -> {
          var runner =
              org.mockito.Mockito.mock(
                  com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.class);
          org.mockito.stubbing.Answer<JsonNode> contextReply =
              call -> {
                JsonNode context = call.getArgument(1);
                if (repository.transaction(
                    () -> !repository.lock(id).progress().has("executionEvidence"))) {
                  service.bootstrap(
                      worker, id, 1, "gs-t-bootstrap-" + id, blankBootstrap(contracts, context));
                }
                return materialization.identity(context);
              };
          org.mockito.Mockito.doAnswer(contextReply)
              .when(runner)
              .send(org.mockito.ArgumentMatchers.eq("context"), org.mockito.ArgumentMatchers.any());
          org.mockito.Mockito.doAnswer(contextReply)
              .when(runner)
              .send(
                  org.mockito.ArgumentMatchers.eq("context"),
                  org.mockito.ArgumentMatchers.any(),
                  org.mockito.ArgumentMatchers.anyString(),
                  org.mockito.ArgumentMatchers.any(Instant.class));
          return new PlanningPath(
              jdbc,
              contracts,
              repository,
              service,
              new com.citi.put.checks.studio.guided.bridge.GuidedDispatchService(
                  service, materialization, runner),
              clock,
              controller);
        });
  }

  /** A JDBC-backed adapter for the existing JPA source seam, with the real source row locked. */
  private static com.citi.put.checks.studio.StudioRepository sourceRepository(
      JdbcTemplate jdbc, GuidedContracts contracts) {
    var sources = org.mockito.Mockito.mock(com.citi.put.checks.studio.StudioRepository.class);
    org.mockito.Mockito.when(
            sources.findByIdForUpdate(org.mockito.ArgumentMatchers.any(UUID.class)))
        .thenAnswer(
            call -> {
              UUID id = call.getArgument(0);
              var rows =
                  jdbc.queryForList(
                      "SELECT csi_id,environment,steps::text,variables::text,authoring::text,"
                          + "authoring_revision_inputs::text,source_revision,configuration_revision"
                          + " FROM ui_tests WHERE id=? AND deleted_at IS NULL AND quarantined_at IS"
                          + " NULL FOR UPDATE",
                      id);
              if (rows.isEmpty()) {
                return java.util.Optional.empty();
              }
              var row = rows.getFirst();
              var test =
                  new com.citi.put.checks.studio.entity.UITest(
                      "GS-T source",
                      null,
                      (String) row.get("csi_id"),
                      (String) row.get("steps"),
                      (String) row.get("variables"),
                      "chromium",
                      1280,
                      720,
                      (String) row.get("environment"),
                      "user-1");
              test.setCsiId((String) row.get("csi_id"));
              test.setEnvironment((String) row.get("environment"));
              test.setSteps((String) row.get("steps"));
              test.setVariables((String) row.get("variables"));
              test.setAuthoring((String) row.get("authoring"));
              test.setAuthoringRevisionInputs((String) row.get("authoring_revision_inputs"));
              test.setSourceRevision(((Number) row.get("source_revision")).longValue());
              test.setConfigurationRevision(
                  ((Number) row.get("configuration_revision")).longValue());
              return java.util.Optional.of(test);
            });
    return sources;
  }

  private static com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties
      planningProperties() {
    return new com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties(
        true, 131072, 2048, 60, "worker-1");
  }

  /** The controls can only narrow real current/source/user checks; initialize is never stubbed. */
  private static com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess
      productionAccess(
          JdbcTemplate jdbc,
          GuidedContracts contracts,
          GuidedSessionAccess controls,
          String origin) {
    var store =
        new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts);
    var access =
        org.mockito.Mockito.spy(
            new com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess(
                new com.citi.put.checks.studio.guided.translation.GuidedSourceSnapshotRepository(
                    sourceRepository(jdbc, contracts), contracts),
                new com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier(
                    contracts,
                    new com.citi.put.checks.studio.guided.translation.CredentialPatternScreen(),
                    com.citi.put.checks.studio.support.TestDomains.FIXTURES),
                new com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver(
                    contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES),
                store,
                new CsiOwnershipEvaluator(),
                com.citi.put.checks.studio.support.TestDomains.FIXTURES,
                org.mockito.Mockito.mock(
                    com.citi.put.checks.studio.dispatch.StudioReferenceResolver.class)));
    org.mockito.Mockito.doAnswer(
            call -> {
              controls.checkSourceCurrent(call.getArgument(0));
              return call.callRealMethod();
            })
        .when(access)
        .checkSourceCurrent(org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.doAnswer(
            call -> {
              controls.checkUser(call.getArgument(0), call.getArgument(1));
              return call.callRealMethod();
            })
        .when(access)
        .checkUser(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.doAnswer(
            call -> controls.recoverableContext(call.getArgument(0), call.getArgument(1)))
        .when(access)
        .recoverableContext(
            org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
    return access;
  }

  /**
   * Mirrors production installation; initialization remains inside real production access.start.
   */
  private static void installTranslation(
      GuidedSessionService sessions, JdbcTemplate jdbc, GuidedContracts contracts) {
    sessions.installTranslation(
        new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts),
        new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
            jdbc, contracts));
  }

  /** The exact bounded document-state-only R-5 seam, architect GS-T-S1. */
  private static void firstObservationWindow(GuidedSessionRepository repository, String id) {
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          assertThat(current.document().path("state").asText()).isEqualTo("PROPOSING");
          assertThat(current.progress().path("translationBootstrap").path("phase").asText())
              .isEqualTo("READY");
          assertThat(
                  current
                      .progress()
                      .path("translationBootstrap")
                      .path("metadataAcknowledgement")
                      .path("version")
                      .asInt())
              .isEqualTo(2);
          assertThat(current.progress().path("executionEvidence").path("kind").asText())
              .isEqualTo("initialBlank");
          assertThat(current.progress().path("executionEvidence").path("generation").asInt())
              .isZero();
          assertThat(repository.actions(id)).isEmpty();
          assertThat(current.document().path("counters").path("actions").asInt()).isZero();
          JsonNode beforeProgress = current.progress().deepCopy();
          current.document().put("state", "OBSERVING");
          repository.save(current);
          assertThat(repository.lock(id).progress()).isEqualTo(beforeProgress);
          return null;
        });
  }

  private static void firstObservationCommitted(GuidedSessionRepository repository, String id) {
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          assertThat(current.document().path("state").asText()).isEqualTo("PROPOSING");
          assertThat(current.progress().path("executionEvidence").path("kind").asText())
              .isEqualTo("observedDocument");
          assertThat(repository.actions(id)).isEmpty();
          assertThat(current.document().path("counters").path("actions").asInt()).isZero();
          return null;
        });
  }

  /** Authenticated worker protocol at the existing trusted transport seam, not browser proof. */
  private static ObjectNode blankBootstrap(GuidedContracts contracts, JsonNode context) {
    var request =
        new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(
                null, contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES)
            .identity(context);
    var evidence =
        contracts
            .object()
            .put("kind", "initialBlank")
            .put("sessionId", context.path("sessionId").asText())
            .put("contextId", context.path("contextId").asText())
            .put("creationId", UUID.randomUUID().toString())
            .put("documentId", "gs-t-blank-" + UUID.randomUUID())
            .put("bootstrapId", UUID.randomUUID().toString())
            .put("url", "about:blank")
            .putNull("origin")
            .put("generation", 0);
    request.set("executionEvidence", evidence);
    request.put("evidenceHash", GuidedContracts.hash(evidence));
    return request;
  }

  /** Per-composition planner; controlled model replies never construct bridge authority. */
  private static final class PlanningPath {
    private final JdbcTemplate jdbc;
    private final GuidedContracts contracts;
    private final GuidedSessionRepository repository;
    private final GuidedSessionService sessions;
    private final com.citi.put.checks.studio.guided.translation.GuidedTranslationStore store;
    private final com.citi.put.checks.studio.guided.translation.GuidedTranslationService
        translation;
    private final Authentication controller;
    private final Map<String, JsonNode> selected = new java.util.HashMap<>();
    private final Map<String, JsonNode> associations = new java.util.HashMap<>();
    private final Map<String, JsonNode> probes = new java.util.HashMap<>();

    PlanningPath(
        JdbcTemplate jdbc,
        GuidedContracts contracts,
        GuidedSessionRepository repository,
        GuidedSessionService sessions,
        com.citi.put.checks.studio.guided.bridge.GuidedDispatchService dispatch,
        Clock clock,
        Authentication controller) {
      this.jdbc = jdbc;
      this.contracts = contracts;
      this.repository = repository;
      this.sessions = sessions;
      this.controller = controller;
      store =
          new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts);
      var stopped = org.mockito.Mockito.spy(dispatch);
      org.mockito.Mockito.doThrow(new AssertionError("gs-t-planner-reservation-stop"))
          .when(stopped)
          .prepareAndAdmit(
              org.mockito.ArgumentMatchers.any(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.anyLong(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.any());
      // The runner's prepare accepts the code; the run stops at admission, after the reservation.
      org.mockito.Mockito.doReturn(contracts.object().put("preparationId", "gs-t-stand-in"))
          .when(stopped)
          .prepareStep(
              org.mockito.ArgumentMatchers.any(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.anyLong(),
              org.mockito.ArgumentMatchers.any());
      org.mockito.Mockito.doThrow(new AssertionError("gs-t-planner-reservation-stop"))
          .when(stopped)
          .admitPrepared(
              org.mockito.ArgumentMatchers.any(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.anyLong(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.any(),
              org.mockito.ArgumentMatchers.any());
      com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient gateway =
          (request, budget) -> {
            var context = request.projection().document();
            var response =
                contracts
                    .object()
                    .put("schemaVersion", 3)
                    .put("requestId", request.requestId())
                    .put("kind", request.kind().name());
            if (request.kind()
                == com.citi.put.checks.studio.guided.translation.GuidedModelRequest.Kind
                    .SOURCE_PLAN) {
              var references = response.putArray("sourceReferences");
              var obligations = response.putArray("obligations");
              for (JsonNode step : context.path("sourceSteps")) {
                String stepId = step.path("stepId").asText();
                JsonNode secret = null;
                for (JsonNode reference : context.path("configurationReferences")) {
                  if (reference.path("stepId").asText().equals(stepId)
                      && reference.path("kind").asText().equals("secretRef")) {
                    secret = reference;
                  }
                }
                var obligation =
                    obligations
                        .addObject()
                        .put("stepId", stepId)
                        .put("occurrence", 0)
                        .put("targetIntent", secret == null ? "Order number" : "Password")
                        .putNull("scopeIntent")
                        .putNull("needId");
                obligation.putArray("uses");
                if (secret == null) {
                  obligation.putNull("referenceIndex");
                } else {
                  obligation.put("referenceIndex", references.size());
                  var reference = (ObjectNode) secret.deepCopy();
                  reference
                      .put("referenceKind", "configuration")
                      .put("configurationRevision", context.path("configurationRevision").asText());
                  references.add(reference);
                }
              }
              response.putArray("stepSections");
            } else if (request.kind()
                == com.citi.put.checks.studio.guided.translation.GuidedModelRequest.Kind
                    .STEP_CODE) {
              JsonNode probe = selected.get(context.path("sessionId").asText());
              assertThat(probe).as("selected controlled-provider action").isNotNull();
              JsonNode chosen = null;
              for (JsonNode obligation : context.path("obligations")) {
                if (obligation.path("stepId").equals(probe.path("coordinate").path("stepId"))
                    && obligation
                        .path("occurrence")
                        .equals(probe.path("coordinate").path("ordinal"))) {
                  chosen = obligation;
                }
              }
              assertThat(chosen).as("remaining planner obligation").isNotNull();
              response
                  .put("status", "CODE")
                  .put("code", probe.path("operation").path("code").asText());
              response.putArray("captures");
            } else {
              throw new AssertionError("Unexpected GS-T model request: " + request.kind());
            }
            contracts.validate("v3/guided-model-response", response);
            return new com.citi.put.checks.studio.guided.translation.GuidedModelResponse(
                com.citi.put.checks.studio.guided.translation.GuidedModelResponse.Code.OK,
                response,
                1,
                1,
                "gs-t-controlled");
          };
      translation =
          new com.citi.put.checks.studio.guided.translation.GuidedTranslationService(
              sessions,
              repository,
              store,
              new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
                  jdbc, contracts),
              stopped,
              gateway,
              contracts,
              new com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler(
                  contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES),
              new com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver(
                  contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES),
              new com.citi.put.checks.studio.guided.translation.GuidedProposalValidator(contracts),
              new com.citi.put.checks.studio.guided.translation.GuidedDependencyPlanner(sessions),
              planningProperties(),
              clock);
      translation.installDatabase(jdbc);
    }

    private ObjectNode command(String id) {
      return repository.transaction(
          () -> {
            var current = repository.lock(id).document();
            return contracts
                .object()
                .put("schemaVersion", 3)
                .put("sessionId", id)
                .put(
                    "expectedSourceRevision", current.path("scope").path("sourceRevision").asText())
                .put(
                    "expectedConfigurationRevision",
                    current.path("scope").path("configurationRevision").asText())
                .put("expectedPlanRevision", store.state(id).path("planRevision").asInt());
          });
    }

    synchronized void bootstrap(String id) {
      translation.plan(controller, id, 1, "gs-t-plan-" + id, command(id));
      firstObservationWindow(repository, id);
    }

    /**
     * Call before opening a rollback transaction; only read the committed association afterward.
     */
    synchronized JsonNode reserve(String id, String key, JsonNode probe) {
      String cache = id + ":" + key;
      if (!associations.containsKey(cache)) {
        assertThat(
                org.springframework.transaction.support.TransactionSynchronizationManager
                    .isActualTransactionActive())
            .as("planner reservation precedes the test's admission rollback transaction")
            .isFalse();
        if (associations.keySet().stream().noneMatch(saved -> saved.startsWith(id + ":"))) {
          firstObservationCommitted(repository, id);
        }
        selected.put(id, probe.deepCopy());
        boolean stopped = false;
        for (int attempt = 0; attempt < 3 && !stopped; attempt++) {
          try {
            translation.advance(
                controller, id, 1, "gs-t-reserve-" + UUID.randomUUID(), command(id));
          } catch (AssertionError expected) {
            assertThat(expected).hasMessage("gs-t-planner-reservation-stop");
            stopped = true;
          }
        }
        assertThat(stopped)
            .as("real planner reached committed prepareAndAdmit crash window")
            .isTrue();
        JsonNode association =
            sessions.translationTransaction(
                controller,
                id,
                1,
                current -> {
                  for (JsonNode obligation : store.state(id).path("plan").path("obligations")) {
                    if (obligation.path("stepId").equals(probe.path("coordinate").path("stepId"))
                        && obligation
                            .path("occurrence")
                            .equals(probe.path("coordinate").path("ordinal"))) {
                      return store.obligation(id, obligation.path("obligationId").asText());
                    }
                  }
                  return null;
                });
        assertThat(association).as("committed planner-issued authority").isNotNull();
        assertThat(association.path("admissionId").isNull()).isTrue();
        assertThat(association.path("admissionKey").asText()).startsWith("obligation-");
        associations.put(cache, association.deepCopy());
        probes.put(cache, probe.deepCopy());
      }
      JsonNode association = associations.get(cache).deepCopy();
      if (!probes.get(cache).equals(probe)) {
        // Preserve the hostile changed-payload idempotency probe under its original issued key.
        ((ObjectNode) association.path("proposal"))
            .set("operation", probe.path("operation").deepCopy());
      }
      return association;
    }
  }
}
