package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.evidence.GuidedRecordingProperties;
import com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceRepository;
import com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceService;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationStore;
import com.citi.put.checks.studio.secrets.SecretAuditLifecycle;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * STUDIO-OBS-009 AC-11 obligation R1 (STUDIO-OBS-015 KL-015-R1): recording-evidence identity during
 * a pending append ACK. Steps a (the probe) and b-c (the binding and its cases).
 *
 * <p><b>The state.</b> A guided session is materialized at v1 (fence 1) and a second context, v2,
 * is appended and issued, so one delivery is {@code PENDING} and no runner has acknowledged it. The
 * materialization head row is now v2. The owning worker's runner never applied v2, so it still
 * holds v1, and when its browser context closes after an owner or browser loss it reports its
 * recording fact under v1: the same identity with {@code contextRevision - 1} (L1's v(n-1)).
 *
 * <p><b>The probe (step a).</b> Before the binding, {@code POST .../recording-evidence} compared
 * {@code contextRevision} only against the head row, so it answered {@code 409 STALE_FENCE} and the
 * session kept no video (PR-BE run {@code obs009-prbe-r1-02}). {@link
 * #recordingAtThePreviousRevisionIsAcceptedWhileAnAppendIsPending} is that case.
 *
 * <p><b>The binding (ruling part 2 §1.3).</b> The route accepts exactly the revisions that {@code
 * GuidedMaterializationService.acceptedContextRevisions} derives, the same derivation the L1
 * lifecycle route uses: {@code {v(n)}} with no delivery pending, {@code {v(n), v(n-1)}} with one.
 * Every other term of the identity check, and the owner, fence, scope, versions and idempotency
 * checks, are unchanged. Recording evidence is non-consuming (it creates no action, preparation,
 * binding or counter), which is why the L1 binding can be applied to it unchanged.
 *
 * <p><b>The cases</b> (ruling table R1-1 to R1-7; R1-8, the L1 regressions, are {@code
 * GuidedServiceTransportFaultIT} and {@code GuidedSessionIT}, run unchanged; R1-M, the mutation, is
 * in the lane receipt).
 *
 * <ul>
 *   <li>R1-1 v(n-1) accepted while pending; the stored row is the report's own; the delivery stays
 *       {@code PENDING}.
 *   <li>R1-2 v(n) accepted while pending (the control).
 *   <li>R1-3 n-2 refused, nothing written. R1-4 n+1 refused, nothing written.
 *   <li>R1-5 a foreign {@code contextId} at v(n-1) refused, nothing written.
 *   <li>R1-6 a foreign fence at v(n-1), in the header and in the body, refused, nothing written.
 *   <li>R1-7 with no pending delivery v(n-1) is refused, as before.
 * </ul>
 *
 * <p>The refusal cases are guards on the widening: they are green before the binding as well. R1-1
 * is the one that is red without it.
 *
 * <p>R1 d, the joined proof (a real runner, a real browser loss and the recording that settles,
 * plays and seeks), is {@link GuidedEvidencePendingAppendJoinedIT}, a sibling class: it needs a
 * real HTTPS application context and a spawned runner, which this class's plain-Java fixture does
 * not have.
 *
 * <p><b>Fixture lineage.</b> The session set-up adapts {@code GuidedServiceTransportFaultIT}
 * ({@code materializedStopScenario} and {@code appendPendingDelivery}, the helpers that ruling §3
 * names). Those are private to a 5.7k-line class that boots Spring and an HTTPS relay; this class
 * needs only the services and PostgreSQL, so the helpers are reproduced here with the same SQL and
 * the same service calls. If the originals change, change these with them.
 */
class GuidedEvidencePendingAppendIT {

  private static final GuidedContracts C = new GuidedContracts();
  private static final String ORIGIN = "https://orders.example.test";
  private static final String EMAIL = "r1-probe@example.test";
  private static final TestPostgresDatabase DATABASE = new TestPostgresDatabase();
  private static final Map<UUID, Source> SOURCES = new ConcurrentHashMap<>();

  private static JdbcTemplate jdbc;
  private static JsonNode documents;
  private static String stepId;
  private static GuidedSessionRepository repository;
  private static GuidedMaterializationService materialization;
  private static GuidedSessionService sessions;
  private static GuidedSessionEvidenceService evidence;

  private final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");
  private final Authentication user =
      new BffAuthenticationToken(
          new UserIdentity(
              "user-1",
              EMAIL,
              "Fixture",
              "Actor",
              List.of(),
              List.of(new CsiOwnershipEntry("CSI-123", "owner"))));

  private record Source(JsonNode steps, JsonNode variables) {}

  /**
   * A session assigned to {@code workerId}, materialized at v1 (fence 1), whose latest append
   * delivery (the head revision) is issued and, unless {@link #acknowledge} ran, pending.
   */
  private record PendingAppend(String sessionId, String workerId, ObjectNode issued) {
    int head() {
      return issued.path("contextRevision").asInt();
    }

    /** The issued identity with another {@code contextRevision}. */
    ObjectNode identityAt(int revision) {
      return issued.deepCopy().put("contextRevision", revision);
    }
  }

  @BeforeAll
  static void database() throws Exception {
    documents =
        C.parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
    stepId = documents.path("secretReference").path("stepId").asText();
    DATABASE.start();
    var source =
        new DriverManagerDataSource(
            DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
    Flyway.configure().dataSource(source).load().migrate();
    jdbc = new JdbcTemplate(source);
    jdbc.update("INSERT INTO users(sso_id,name,email) VALUES ('r1-probe-user','fixture',?)", EMAIL);
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) "
            + "VALUES ('CSI-123','fixture','unit','LOW',?,'Development')",
        EMAIL);
    var transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
    repository = new GuidedSessionRepository(jdbc, transactions, C);
    materialization =
        new GuidedMaterializationService(
            jdbc, C, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    sessions = service();
    evidence = evidenceService();
  }

  private static GuidedSessionEvidenceService evidenceService() {
    return new GuidedSessionEvidenceService(
        repository,
        new GuidedSessionEvidenceRepository(jdbc),
        materialization,
        C,
        new GuidedRecordingProperties(null),
        new StudioExecutionProperties(
            null, null, null, null, null, null, Duration.ofDays(30), null, null, null, null, null));
  }

  @AfterAll
  static void stopDatabase() {
    DATABASE.stop();
  }

  // ---- R1-1: the probe, now the binding's positive case ----

  @Test
  void recordingAtThePreviousRevisionIsAcceptedWhileAnAppendIsPending() {
    PendingAppend pending = pendingAppend(2);
    // partial=true separates the report's own value from the default a hard-coded row would carry.
    ObjectNode body = recording(pending.identityAt(1), "rec-r1-previous").put("partial", true);
    assertPendingAppendState(pending);
    assertThat(body.path("contextRevision").asInt())
        .as("the runner never applied v2: it reports the previous revision")
        .isEqualTo(1);

    Throwable observed = attempt(pending, body, 1L);

    System.out.println(
        "R1-PROBE v(n-1)=1 while v(n)=2 PENDING -> "
            + (observed == null ? "ACCEPTED" : describe(observed)));
    assertThat(observed)
        .as(
            "R1 is reproduced when this fails with STALE_FENCE: recording-evidence at v(n-1) is"
                + " refused while an append delivery is PENDING")
        .isNull();
    assertThat(recordingRows(pending.sessionId())).isEqualTo(1);
    assertThat(
            jdbc.queryForMap(
                "SELECT recording_id,state,partial,worker_id,owner_fence,timings::text AS timings"
                    + " FROM studio_guided_session_recordings WHERE session_id=?",
                pending.sessionId()))
        .as("the stored evidence is the report's own")
        .containsEntry("recording_id", "rec-r1-previous")
        .containsEntry("state", "AVAILABLE")
        .containsEntry("partial", true)
        .containsEntry("worker_id", pending.workerId())
        .containsEntry("owner_fence", 1)
        .containsEntry("timings", "[]");
    assertThat(pendingDeliveries(pending.sessionId()))
        .as("recording evidence consumes nothing: the delivery stays PENDING")
        .isEqualTo(1);
  }

  // ---- R1-2: the control ----

  @Test
  void recordingAtTheHeadRevisionIsAcceptedWhileAnAppendIsPending() {
    PendingAppend pending = pendingAppend(2);
    ObjectNode body = recording(pending.identityAt(2), "rec-r1-head");
    assertPendingAppendState(pending);

    Throwable observed = attempt(pending, body, 1L);

    assertThat(observed).as("the fixture is sound: the head identity is accepted").isNull();
    assertThat(recordingRows(pending.sessionId())).isEqualTo(1);
    assertThat(pendingDeliveries(pending.sessionId())).isEqualTo(1);
  }

  // ---- R1-3, R1-4: exactly {n, n-1} ----

  @Test
  void twoRevisionsBehindTheHeadIsRefusedWhileAnAppendIsPending() {
    PendingAppend pending = pendingAppend(3);
    assertPendingAppendState(pending);

    Throwable observed = attempt(pending, recording(pending.identityAt(1), "rec-r1-n-2"), 1L);

    assertRefusedAndNothingWritten(observed, pending, "STALE_FENCE", 409);
  }

  @Test
  void aRevisionAheadOfTheHeadIsRefusedWhileAnAppendIsPending() {
    PendingAppend pending = pendingAppend(2);
    assertPendingAppendState(pending);

    Throwable observed = attempt(pending, recording(pending.identityAt(3), "rec-r1-n-plus-1"), 1L);

    assertRefusedAndNothingWritten(observed, pending, "STALE_FENCE", 409);
  }

  // ---- R1-5, R1-6: the other identity terms are not widened ----

  @Test
  void aForeignContextIdAtThePreviousRevisionIsRefusedWhileAnAppendIsPending() {
    PendingAppend pending = pendingAppend(2);
    ObjectNode body = recording(pending.identityAt(1), "rec-r1-foreign-context");
    body.put("contextId", "context-of-another-session");

    assertRefusedAndNothingWritten(attempt(pending, body, 1L), pending, "STALE_FENCE", 409);
  }

  @Test
  void aForeignFenceAtThePreviousRevisionIsRefusedWhileAnAppendIsPending() {
    PendingAppend pending = pendingAppend(2);
    ObjectNode previous = pending.identityAt(1);

    // Header and body both foreign, then each one alone.
    assertRefusedAndNothingWritten(
        attempt(
            pending, recording(previous.deepCopy().put("ownerFence", 2), "rec-r1-fence-both"), 2L),
        pending,
        "STALE_FENCE",
        409);
    assertRefusedAndNothingWritten(
        attempt(pending, recording(previous, "rec-r1-fence-header"), 2L),
        pending,
        "STALE_FENCE",
        409);
    assertRefusedAndNothingWritten(
        attempt(
            pending, recording(previous.deepCopy().put("ownerFence", 2), "rec-r1-fence-body"), 1L),
        pending,
        "STALE_FENCE",
        409);
  }

  // ---- R1-7: the control without a pending delivery ----

  @Test
  void withNoPendingDeliveryThePreviousRevisionIsStillRefusedAndTheHeadAccepted() {
    PendingAppend pending = pendingAppend(2);
    acknowledge(pending);
    assertThat(pendingDeliveries(pending.sessionId())).as("nothing pending").isZero();

    Throwable previous =
        attempt(pending, recording(pending.identityAt(1), "rec-r1-no-pending"), 1L);
    assertThat(describe(previous)).isEqualTo("REFUSED STALE_FENCE status=409");
    assertThat(recordingRows(pending.sessionId())).isZero();
    assertThat(commandRows(pending.sessionId())).isZero();

    Throwable head =
        attempt(pending, recording(pending.identityAt(2), "rec-r1-no-pending-head"), 1L);
    assertThat(head).as("the head identity is accepted, as before").isNull();
    assertThat(recordingRows(pending.sessionId())).isEqualTo(1);
  }

  // ---- the recording stays write-once across the two accepted revisions ----

  @Test
  void aSecondRecordingAtTheOtherAcceptedRevisionIsStillAConflict() {
    PendingAppend pending = pendingAppend(2);
    assertThat(attempt(pending, recording(pending.identityAt(1), "rec-r1-first"), 1L)).isNull();

    Throwable second = attempt(pending, recording(pending.identityAt(2), "rec-r1-second"), 1L);

    assertThat(describe(second)).isEqualTo("REFUSED IDEMPOTENCY_CONFLICT status=409");
    assertThat(recordingRows(pending.sessionId())).isEqualTo(1);
  }

  // ---- the post ----

  /** Posts as the owning worker with the given {@code X-Owner-Fence}; null when accepted. */
  private Throwable attempt(PendingAppend pending, ObjectNode body, long fenceHeader) {
    try {
      JsonNode echo =
          evidence.record(
              new GuidedInternalSecurity.Identity(pending.workerId(), "owning-worker"),
              pending.sessionId(),
              fenceHeader,
              "key-" + body.path("recordingId").asText(),
              body);
      assertThat(echo).isEqualTo(body);
      return null;
    } catch (GuidedSessionException refused) {
      return refused;
    }
  }

  private static void assertRefusedAndNothingWritten(
      Throwable observed, PendingAppend pending, String code, int status) {
    assertThat(describe(observed)).isEqualTo("REFUSED " + code + " status=" + status);
    assertThat(recordingRows(pending.sessionId())).as("no evidence row").isZero();
    assertThat(commandRows(pending.sessionId())).as("no command row").isZero();
    assertThat(pendingDeliveries(pending.sessionId())).as("the delivery is untouched").isEqualTo(1);
  }

  private static String describe(Throwable failure) {
    return failure instanceof GuidedSessionException refusal
        ? "REFUSED " + refusal.getMessage() + " status=" + refusal.status()
        : String.valueOf(failure);
  }

  /** The recordingEvidence body: the 10 identity fields, then the recording fields. */
  private static ObjectNode recording(ObjectNode identity, String recordingId) {
    ObjectNode body = identity.deepCopy();
    body.put("recordingId", recordingId).put("state", "STORED").put("partial", false);
    body.putArray("timings");
    return body;
  }

  // ---- the pending-append state (adapted from GuidedServiceTransportFaultIT) ----

  private static void assertPendingAppendState(PendingAppend pending) {
    assertThat(
            jdbc.queryForObject(
                "SELECT status||'|'||(context_metadata IS NOT NULL)||'|'||(ack IS NULL)"
                    + " FROM studio_guided_materialization_deliveries"
                    + " WHERE session_id=? AND context_revision=?",
                String.class,
                pending.sessionId(),
                pending.head()))
        .as("one unacknowledged v" + pending.head() + " delivery")
        .isEqualTo("PENDING|true|true");
    assertThat(
            jdbc.queryForObject(
                "SELECT context_revision FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                pending.sessionId()))
        .as("the head row is v" + pending.head() + " while the delivery is pending")
        .isEqualTo(pending.head());
  }

  private static int recordingRows(String sessionId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_session_recordings WHERE session_id=?",
        Integer.class,
        sessionId);
  }

  private static int commandRows(String sessionId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route=?",
        Integer.class,
        sessionId,
        GuidedSessionEvidenceService.ROUTE);
  }

  private static int pendingDeliveries(String sessionId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_materialization_deliveries"
            + " WHERE session_id=? AND status='PENDING'",
        Integer.class,
        sessionId);
  }

  /**
   * A session assigned to {@code worker-1}, materialized at v1 (fence 1), then appended up to
   * {@code head} (2 or 3): each earlier delivery is acknowledged through the real {@code
   * acknowledgeContext}, and the last one is issued and left PENDING, never acknowledged.
   */
  private PendingAppend pendingAppend(int head) {
    UUID testId = UUID.randomUUID();
    var steps = C.object().putArray("steps");
    steps.addObject().put("stepId", stepId).put("text", "Enter <secret PASS> as password.");
    var variables = C.object().putArray("variables");
    variables.addObject().put("name", "PASS").put("kind", "secretRef");
    SOURCES.put(testId, new Source(steps, variables));
    jdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by) "
            + "VALUES (?,'r1 probe fixture','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?)",
        testId,
        steps.toString(),
        variables.toString(),
        EMAIL);
    String id =
        sessions
            .start(
                user,
                UUID.randomUUID().toString(),
                C.object()
                    .put("schemaVersion", 3)
                    .put("testId", testId.toString())
                    .put("sourceRevision", "1")
                    .put("configurationRevision", "2")
                    .put("environmentId", "fixture")
                    .set("versions", documents.path("versions")))
            .path("sessionId")
            .asText();
    repository.transaction(
        () -> {
          var manifest =
              C.object()
                  .put("testId", testId.toString())
                  .put("sourceRevision", "1")
                  .put("configurationRevision", "2")
                  .put("policy", "INPUT-POLICY-01-A");
          manifest.set("sourceSteps", steps);
          manifest
              .putArray("configurationReferences")
              .addObject()
              .put("referenceId", "ref-PASS")
              .put("referenceName", "PASS")
              .put("kind", "secretRef")
              .put("stepId", stepId)
              .put("intendedSlot", "fill.value");
          new GuidedTranslationStore(jdbc, C).initialize(repository.lock(id).document(), manifest);
          return null;
        });
    assign(id, "worker-1");
    var references = C.object().putArray("references");
    // The fixture's reference names its configuration revision; ours is numeric because the context
    // acknowledgement schema pins both revisions to decimal strings.
    references.add(
        ((ObjectNode) documents.path("secretReference"))
            .deepCopy()
            .put("configurationRevision", "2"));
    sessions.materialize(controller, id, 1, "materialize", references);
    assertThat(
            jdbc.queryForObject(
                "SELECT live FROM studio_guided_materializations WHERE session_id=?",
                Boolean.class,
                id))
        .isTrue();
    String worker =
        jdbc.queryForObject(
            "SELECT document->'owner'->>'workerId' FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id);
    // L1: the issued identity is v(n); the runner that never applied it holds v(n-1), the same
    // identity with contextRevision - 1.
    ObjectNode issued = appendPendingDelivery(id);
    PendingAppend pending = new PendingAppend(id, worker, issued);
    while (pending.head() < head) {
      acknowledge(pending);
      pending = new PendingAppend(id, worker, appendPendingDelivery(id));
    }
    assertThat(pending.head()).isEqualTo(head);
    return pending;
  }

  /**
   * The runner's acknowledgement of the pending delivery, through the real {@code
   * GuidedMaterializationService.acknowledge} (the call {@code acknowledgeContext} makes, without
   * the translation-service gate this fixture does not install): the frozen context's identity, its
   * hash and the delivery id.
   */
  private void acknowledge(PendingAppend pending) {
    ObjectNode frozen = sessions.runnerContext(controller, pending.sessionId(), 1);
    String deliveryId = materialization.pendingDeliveryId(pending.sessionId());
    ObjectNode ack =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", pending.sessionId())
            .put("workerId", frozen.path("workerId").asText())
            .put("ownerFence", frozen.path("ownerFence").asInt())
            .put("scopeHash", frozen.path("scopeHash").asText())
            .put("contextId", frozen.path("contextId").asText())
            .put("contextRevision", frozen.path("contextRevision").asInt())
            .put("authoredInputsHash", frozen.path("authoredInputsHash").asText())
            .put("sourceRevision", frozen.path("sourceRevision").asText())
            .put("configurationRevision", frozen.path("configurationRevision").asText())
            .put("materializationRevision", frozen.path("materializationRevision").asInt())
            .put("contextHash", GuidedContracts.hash(frozen))
            .put("deliveryId", deliveryId);
    repository.transaction(
        () -> {
          materialization.acknowledge(repository.lock(pending.sessionId()).document(), ack);
          return null;
        });
    assertThat(pendingDeliveries(pending.sessionId())).as("acknowledged").isZero();
  }

  /**
   * The controller's assignment as {@code GuidedDispatchService.assign} performs it, with the
   * runner's answer supplied in-process. In the transport-fault IT the HTTPS relay answers {@code
   * /assign} by calling the backend's {@code claim} route as the owning worker and replying {@code
   * OWNED}; this does the same two steps without the hop. No byte leaves the process.
   */
  private void assign(String id, String workerId) {
    ObjectNode intent = sessions.prepareAssignment(controller, id, "assign", workerId);
    JsonNode claimed =
        sessions.claim(
            new GuidedInternalSecurity.Identity(workerId, "owning-worker"),
            id,
            UUID.randomUUID().toString(),
            C.object()
                .put("schemaVersion", 3)
                .put("sessionId", id)
                .put("workerId", workerId)
                .put("expectedFence", intent.path("expectedFence").asInt())
                .set("versions", documents.path("versions")));
    ObjectNode receipt =
        C.object()
            .put("schemaVersion", 3)
            .put("status", "OWNED")
            .put("ownerFence", claimed.path("owner").path("fence").asInt())
            .put("leaseExpiresAt", claimed.path("owner").path("leaseExpiresAt").asText());
    receipt.set("assignment", intent);
    sessions.acknowledgeAssignment(controller, id, receipt);
  }

  /**
   * Appends v2 through the V21 append path (continuation MATERIALIZE, then one appended input) and
   * issues its frozen context, leaving one PENDING delivery that no runner acknowledged. The
   * appended input is a copy with a fresh inputId; only the delivery state matters here.
   *
   * @return the issued (v2) identity
   */
  private ObjectNode appendPendingDelivery(String id) {
    repository.transaction(
        () -> {
          new GuidedTranslationStore(jdbc, C).continuation(id, "MATERIALIZE");
          return null;
        });
    String appended = UUID.randomUUID().toString();
    assertThat(
            jdbc.update(
                "UPDATE studio_guided_materializations m SET context_revision=m.context_revision+1,"
                    + "materialization_revision=m.materialization_revision+1,"
                    + "authored_inputs=x.inputs,authored_inputs_hash=studio_publication_hash(x.inputs)"
                    + " FROM (SELECT jsonb_set(authored_inputs,'{inputs}',(authored_inputs->'inputs')"
                    + "||jsonb_build_array(jsonb_set(authored_inputs->'inputs'->0,'{inputId}',"
                    + "to_jsonb(?::text)))) AS inputs FROM studio_guided_materializations"
                    + " WHERE session_id=?) x WHERE m.session_id=?",
                appended,
                id,
                id))
        .isEqualTo(1);
    return materialization.identity(sessions.runnerContext(controller, id, 1));
  }

  // ---- the services (adapted from GuidedServiceTransportFaultIT) ----

  private static GuidedSessionService service() {
    var service =
        new GuidedSessionService(
            repository,
            C,
            new FixtureAccess(),
            new GuidedSessionProperties(true, Map.of("maxSessionSeconds", 600)),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            Clock.systemUTC());
    service.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, C),
        new GuidedBindingStore(jdbc, C, materialization),
        new GuidedAssignmentStore(jdbc, C));
    service.installSecretAudit(new SecretAuditLifecycle(jdbc, new SecretUseAuditRecorder(jdbc)));
    // Every start needs an approved governed policy for its scope.
    ObservedPublicationFixture.installCsiBudget(service, jdbc);
    return service;
  }

  /** The trusted CSI, source and configuration boundary for the fixture tests. */
  private static final class FixtureAccess implements GuidedSessionAccess {
    @Override
    public Snapshot resolve(Authentication actor, JsonNode start) {
      require(new CsiOwnershipEvaluator().canExecute(actor, "CSI-123"), "FORBIDDEN_SCOPE", 403);
      require(
          SOURCES.containsKey(UUID.fromString(start.path("testId").asText())),
          "FORBIDDEN_SCOPE",
          403);
      ObjectNode scope = documents.path("session").path("scope").deepCopy();
      scope
          .put("principalId", "user-1")
          .put("csiId", "CSI-123")
          .put("environmentId", "fixture")
          .put("sourceRevision", "1")
          .put("configurationRevision", "2");
      scope.remove("accountRef");
      return new Snapshot(
          scope,
          C.object()
              .putArray("steps")
              .add(C.object().put("stepId", stepId).put("requiresAssertion", false)));
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {
      UUID id = UUID.fromString(session.path("testId").asText());
      var row =
          jdbc.queryForMap(
              "SELECT steps::text,variables::text FROM ui_tests WHERE id=? FOR SHARE", id);
      Source expected = SOURCES.get(id);
      require(
          C.parse((String) row.get("steps")).equals(expected.steps())
              && C.parse((String) row.get("variables")).equals(expected.variables()),
          "REVISION_CONFLICT",
          409);
    }

    @Override
    public void checkUser(Authentication actor, JsonNode session) {
      require(
          actor instanceof BffAuthenticationToken
              && ((UserIdentity) actor.getPrincipal())
                  .userId()
                  .equals(session.path("scope").path("principalId").asText())
              && new CsiOwnershipEvaluator().canExecute(actor, "CSI-123"),
          "FORBIDDEN_SCOPE",
          403);
    }

    @Override
    public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
      checkSourceCurrent(session);
      return new GuidedSourceReferenceValidator.Sources(
          "1",
          "2",
          Map.of(
              stepId,
              new GuidedSourceReferenceValidator.Source(
                  "Enter <secret PASS> as password.", List.of())),
          Map.of(
              "ref-PASS",
              new GuidedSourceReferenceValidator.ConfigurationValue(
                  null, stepId, "secretRef", session.path("scopeHash").asText(), false, "PASS")));
    }
  }
}
