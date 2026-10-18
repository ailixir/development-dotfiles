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
  void setup() {
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
            repository, contracts, access, new GuidedSessionProperties(true, Map.of()), clock);
    materialization = new GuidedMaterializationService(jdbc, contracts);
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
    com.citi.put.checks.studio.support.ObservedPublicationFixture.installGovernance(
        result,
        jdbc,
        "CSI-123",
        "orders",
        List.of("fixture"),
        List.of("https://orders.example.test"),
        null);
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
        .put("testId", "test-1")
        .put("sourceRevision", "1")
        .put("configurationRevision", "1")
        .put("environmentId", "fixture")
        .put("applicationId", "orders")
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
    service.materialize(controller, id, 1, "materialize", new ObjectMapper().createArrayNode());
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
    ObjectNode o = fixture("observation");
    o.put("sessionId", id).put("scopeHash", scope(id)).put("generation", generation);
    for (JsonNode n : o.path("nodes")) {
      ((ObjectNode) n).put("generation", generation);
    }
    return o;
  }

  private ObjectNode proposal(String id) {
    ObjectNode p = fixture("action");
    p.put("sessionId", id).put("scopeHash", scope(id));
    // A click has no runtime-value producer side effects; only the action state matters here.
    p.putObject("operation").put("kind", "click");
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
    p.withObject("/target").put("generation", 1);
    return p;
  }

  /** Observe, admit and consume one click: the action is left {@code DISPATCHING}. */
  private JsonNode dispatch(String id) {
    service.observe(worker, id, 1, "observe", observation(id, 1));
    ObjectNode proposal = proposal(id);
    ObjectNode proof = materialization.identity(context(id));
    proof
        .put("preparationId", UUID.randomUUID().toString())
        .put("requestDigest", GuidedContracts.hash(proposal))
        .put("evidenceHash", proposal.path("evidenceHash").asText())
        .put("authoredInputsHash", proposal.path("authoredInputsHash").asText())
        .put("expiresAt", clock.now.plusSeconds(20).toString());
    JsonNode existing = service.existingAdmission(controller, id, 1, "admit", proposal);
    assertThat(existing).as("a new admission").isNull();
    service.storePreparation(controller, id, 1, proposal, proof);
    JsonNode admission = service.admit(controller, id, 1, "admit", proposal);
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
      for (String field : List.of("environmentId", "applicationId")) {
        scope.set(field, start.path(field));
      }
      return new Snapshot(scope, session.path("sourceSteps"));
    }

    @Override
    public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
      return new GuidedSourceReferenceValidator.Sources("1", "1", Map.of(), Map.of());
    }

    @Override
    public void checkCurrent(JsonNode session) {}

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
}
