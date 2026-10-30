package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.dispatch.DispatchAuthorization;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.publication.GuidedPlanPublisher;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationBaseRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationEvidenceRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationProperties;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationRepository;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.guided.publication.ObservedReplayProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Real PostgreSQL, intentionally no disabledWithoutDocker skip: concurrency evidence is mandatory.
 */
class GuidedSessionIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");
  private static JdbcTemplate jdbc;
  private static JsonNode fixtures;
  private static JsonNode documents;

  /** The fixture session's frozen source steps, as a real start freezes them: UUIDs. */
  private static final String STEP_1 = "00000000-0000-4000-8000-0000000000a1";

  private static final String STEP_2 = "00000000-0000-4000-8000-0000000000a2";
  private final GuidedContracts contracts = new GuidedContracts();
  private final MutableClock clock = new MutableClock();
  private final TestAccess access = new TestAccess();
  private GuidedSessionRepository repository;

  /**
   * The fixture's deployment-wide cap on live learning sessions: generous unless a test lowers it.
   */
  private int deploymentCap = 1000;

  private GuidedSessionService service;
  private GuidedMaterializationService materialization;
  private GuidedAssignmentStore assignments;
  private final Map<String, ObjectNode> frozenCallbackIdentities =
      new java.util.concurrent.ConcurrentHashMap<>();
  private final Authentication user = user("user-1", "owner");
  private final Authentication worker =
      new GuidedInternalSecurity.Identity("worker-1", "owning-worker");
  private final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");

  @BeforeAll
  static void database() throws Exception {
    POSTGRES.start();
    // STUDIO-OBS-012A: contracts/v3 is the only generation. The canonical vector is the v3 one;
    // the IT's own base documents (already v3-shaped) live with the test.
    fixtures =
        new ObjectMapper()
            .readTree(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")));
    try (var in =
        GuidedSessionIT.class.getResourceAsStream("/studio/guided/session-it-documents.json")) {
      documents = new ObjectMapper().readTree(in).path("documents");
    }
  }

  private static Flyway flyway(String target) {
    return Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration")
        .target(target)
        .load();
  }

  @AfterAll
  static void close() {
    POSTGRES.stop();
  }

  @BeforeEach
  void setup(org.junit.jupiter.api.TestInfo testInfo) {
    admissionSubject =
        ADMISSION_SUBJECTS.contains(testInfo.getTestMethod().orElseThrow().getName());
    clarificationSubject =
        CLARIFICATION_SUBJECTS.contains(testInfo.getTestMethod().orElseThrow().getName());
    // Isolated real databases preserve the append-only audit trigger. No privileged trigger
    // bypass or TRUNCATE CASCADE is used to reset protected production tables.
    String database = "session_" + UUID.randomUUID().toString().replace("-", "");
    var admin =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    new JdbcTemplate(admin).execute("CREATE DATABASE " + database);
    var source =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl().replace(POSTGRES.getDatabaseName(), database),
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    jdbc = new JdbcTemplate(source);
    // V13 is the last area before the guided-session migration V14 (STUDIO-OBS-012A re-baseline).
    Flyway.configure().dataSource(source).target("13").load().migrate();
    jdbc.execute(
        "CREATE TABLE guided_migration_sentinel(id integer PRIMARY KEY, value text NOT NULL)");
    jdbc.execute("INSERT INTO guided_migration_sentinel VALUES (1,'legacy')");
    // STUDIO-OBS-014 S3: the governed policy and per-CSI budget tables are V19; migrate to head.
    Flyway.configure().dataSource(source).target("29").load().migrate();
    repository =
        new GuidedSessionRepository(
            jdbc,
            new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())),
            contracts);
    sourceFixture();
    service = newService(new GuidedSessionProperties(true, Map.of()));
  }

  @Test
  void migrationPreservesExistingDataAndFreshInstallWorks() {
    assertThat(
            jdbc.queryForObject(
                "SELECT value FROM guided_migration_sentinel WHERE id=1", String.class))
        .isEqualTo("legacy");
    jdbc.execute("CREATE DATABASE guided_fresh");
    String url =
        POSTGRES.getJdbcUrl().substring(0, POSTGRES.getJdbcUrl().lastIndexOf('/') + 1)
            + "guided_fresh";
    Flyway fresh =
        Flyway.configure()
            .dataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword())
            .locations("classpath:db/migration")
            // Fresh install of the whole re-baselined chain: core V1–V11 and Studio V12–V18.
            .target("18")
            .load();
    assertThat(fresh.migrate().migrationsExecuted).isEqualTo(18);
    assertThat(fresh.validateWithResult().validationSuccessful).isTrue();
  }

  @Test
  void canonicalUnicodeParityAndClosedSchema() {
    JsonNode vector = fixtures.path("canonicalVector");
    assertThat(GuidedContracts.hash(contracts.parse(vector.path("json").asText())))
        .isEqualTo(vector.path("sha256").asText());
    ObjectNode bad = start();
    bad.put("principalId", "intruder");
    assertThatThrownBy(() -> service.start(user, "key", bad)).hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> GuidedContracts.canonical(contracts.object().put("x", "\ud800")))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void concurrentIdenticalStartsAndChangedDigestAreDurable() throws Exception {
    var results =
        race(
            () -> service.start(user, "not-a-uuid", start()),
            () -> service.start(user, "not-a-uuid", start()));
    assertThat(results.get(0).path("sessionId")).isEqualTo(results.get(1).path("sessionId"));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_sessions", Integer.class))
        .isEqualTo(1);
    ObjectNode changed = start();
    changed.put("environmentId", "other");
    assertThatThrownBy(() -> service.start(user, "not-a-uuid", changed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    GuidedSessionService restarted = newService(new GuidedSessionProperties(true, Map.of()));
    assertThat(restarted.start(user, "not-a-uuid", start()).path("sessionId"))
        .isEqualTo(results.getFirst().path("sessionId"));
  }

  @Test
  void concurrentConflictingStartsHaveOneWinner() throws Exception {
    // Same principal and test; the second start names the test's first step as its first learned
    // step (the same selection, spelled out), so both are valid starts with different digests.
    ObjectNode changed = start();
    changed.put("firstLearnStepId", STEP_1);
    // GS-T-S2: both requests are valid starts before they compete for one idempotency key.
    assertThat(service.start(user, "control-orders", start()).path("state").asText())
        .isEqualTo("PREPARING");
    assertThat(service.start(user, "control-other", changed).path("state").asText())
        .isEqualTo("PREPARING");
    var results =
        race(
            () -> attempt(() -> service.start(user, "same", start())),
            () -> attempt(() -> service.start(user, "same", changed)));
    assertThat(
            results.stream()
                .filter(n -> n.path("code").asText().equals("IDEMPOTENCY_CONFLICT"))
                .count())
        .isEqualTo(1);
    assertThat(results.stream().filter(n -> n.path("state").asText().equals("PREPARING")).count())
        .isEqualTo(1);
  }

  @Test
  void theDeploymentCapRefusesTheNextStartRetryableAndWritesNothing() {
    // STUDIO-FLEX-001: the (N+1)th live learning session of the deployment is refused 429
    // LEARNING_CAPACITY_EXHAUSTED with a Retry-After, before any row or charge is written.
    deploymentCap = 2;
    // The budget counts live sessions on the database clock, so the fixture clock must be real.
    clock.now = Instant.now();
    service = newService(new GuidedSessionProperties(true, Map.of()));
    String first = service.start(user, "cap-1", start()).path("sessionId").asText();
    assertThat(service.start(user, "cap-2", start()).path("state").asText()).isEqualTo("PREPARING");

    int sessionsBefore = rows("studio_guided_sessions");
    int commandsBefore = rows("studio_guided_commands");
    int daysBefore = rows("studio_guided_csi_token_days");
    assertThatThrownBy(() -> service.start(user, "cap-3", start()))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("BUDGET_EXCEEDED");
              assertThat(refusal.status()).isEqualTo(429);
              assertThat(refusal.messageCode()).isEqualTo("LEARNING_CAPACITY_EXHAUSTED");
              assertThat(refusal.retryable()).isTrue();
              assertThat(refusal.retryAfterSeconds()).isBetween(1, 600);
            });
    assertThat(rows("studio_guided_sessions")).as("no session row").isEqualTo(sessionsBefore);
    assertThat(rows("studio_guided_commands")).as("no start command").isEqualTo(commandsBefore);
    assertThat(rows("studio_guided_csi_token_days")).as("no charge").isEqualTo(daysBefore);

    // A slot frees when a session ends.
    service.cancel(user, first, "cancel", cancel());
    assertThat(service.start(user, "cap-3", start()).path("state").asText()).isEqualTo("PREPARING");
  }

  private int rows(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  @Test
  void duplicateAdmissionAndConcurrentConsumptionNeverRedispatch() throws Exception {
    String id = observing();
    JsonNode proposal = proposal(id);
    service.observe(worker, id, 1, "observe", observation(id, 1));
    var admitted =
        race(
            () -> admit(controller, id, 1, "admit", proposal),
            () -> admit(controller, id, 1, "admit", proposal));
    assertThat(admitted.getFirst()).isEqualTo(admitted.getLast());
    JsonNode advance = advance(id, admitted.getFirst());
    var consumed =
        race(
            () -> consume(controller, id, 1, "advance", advance),
            () -> consume(controller, id, 1, "advance-2", advance));
    assertThat(consumed).allSatisfy(n -> assertThat(n.path("dispatchCount").asInt()).isEqualTo(1));
    assertThat(repository.actions(id)).hasSize(1);
    assertThat(service.read(user, id, "session").path("counters").path("actions").asInt())
        .isEqualTo(1);
  }

  /**
   * ADR-SC-007 D2/D15: the target the runner reports on a preparation proof must agree with the
   * fact the gates admitted. A disagreement is refused EVIDENCE_MISMATCH before the preparation is
   * stored, so nothing can be admitted on it; the matching report is then accepted.
   */
  @Test
  void storePreparationRefusesEvidenceMismatchBeforeAdmission() {
    String id = observing();
    JsonNode proposal = proposal(id);
    service.observe(worker, id, 1, "observe", observation(id, 1));
    JsonNode association = planner(id).reserve(id, "admit", proposal);
    JsonNode reserved = association.path("proposal");
    String issuedKey = association.path("admissionKey").asText();
    ObjectNode base = materialization.identity(context(id));
    base.putNull("pressInheritance")
        .put("preparationId", UUID.randomUUID().toString())
        .put("requestDigest", GuidedContracts.hash(reserved))
        .put("evidenceHash", reserved.path("evidenceHash").asText())
        .put("authoredInputsHash", reserved.path("authoredInputsHash").asText())
        .put("expiresAt", clock.now.plusSeconds(20).toString());
    var oneBad = new java.util.LinkedHashMap<String, JsonNode>();
    oneBad.put(
        "role differs",
        com.citi.put.checks.studio.support.ObservationFixtures.resolvedTarget(
            "order-reference", "button", "Order number"));
    oneBad.put(
        "name differs",
        com.citi.put.checks.studio.support.ObservationFixtures.resolvedTarget(
            "order-reference", "text", "Another name"));
    oneBad.put("a node action with no reported target", contracts.parse("null"));
    int storedBefore = rows("studio_guided_preparations");
    for (var bad : oneBad.entrySet()) {
      ObjectNode proof = base.deepCopy();
      proof.set("target", bad.getValue());
      assertThatThrownBy(() -> service.storePreparation(controller, id, 1, reserved, proof))
          .as(bad.getKey())
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              refusal -> {
                assertThat(refusal.getMessage()).isEqualTo("EVIDENCE_MISMATCH");
                assertThat(refusal.status()).isEqualTo(422);
              });
    }
    assertThat(rows("studio_guided_preparations")).isEqualTo(storedBefore);
    assertThat(repository.actions(id)).isEmpty();
    assertThatThrownBy(
            () ->
                service.admit(
                    controller, id, 1, issuedKey, reserved, base.path("preparationId").asText()))
        .isInstanceOf(GuidedSessionException.class);
    assertThat(repository.actions(id)).isEmpty();
    // The runner's report for the same element is stored and admitted.
    ObjectNode proof = base.deepCopy();
    proof.set("target", proofTarget(reserved));
    service.storePreparation(controller, id, 1, reserved, proof);
    assertThat(rows("studio_guided_preparations")).isEqualTo(storedBefore + 1);
    assertThat(
            service
                .admit(controller, id, 1, issuedKey, reserved, base.path("preparationId").asText())
                .path("admission")
                .isObject())
        .isTrue();
    assertThat(repository.actions(id)).hasSize(1);
  }

  @Test
  void conflictingAdmissionAndUniqueCoordinatesFail() {
    String id = observing();
    JsonNode proposal = proposal(id);
    service.observe(worker, id, 1, "observe", observation(id, 1));
    admit(controller, id, 1, "admit", proposal);
    ObjectNode changed = proposal.deepCopy();
    changed.putObject("operation").put("kind", "hover");
    assertThatThrownBy(() -> admit(controller, id, 1, "admit", changed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    ObjectNode row = repository.actions(id).getFirst().deepCopy();
    row.withObject("/admission").put("admissionId", UUID.randomUUID().toString());
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      repository.insertAction(row, proposal);
                      return null;
                    }))
        .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
  }

  @Test
  void rollbackBeforeDispatchLeavesNoAdmissionAndNoBudgetCharge() {
    String id = observing();
    service.observe(worker, id, 1, "observe", observation(id, 1));
    planner(id).reserve(id, "admit", proposal(id));
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      admit(controller, id, 1, "admit", proposal(id));
                      throw new IllegalStateException("rollback");
                    }))
        .hasMessage("rollback");
    assertThat(repository.actions(id)).isEmpty();
    assertThat(service.read(user, id, "session").path("counters").path("actions").asInt()).isZero();
    assertThat(admit(controller, id, 1, "admit", proposal(id)).path("state").asText())
        .isEqualTo("ADMITTED");
  }

  @Test
  void accessIsolationRechecksPrincipalCsiAccountAndScope() {
    String id = observing();
    assertThatThrownBy(() -> service.read(user("other", "owner"), id, "session"))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(() -> service.read(user("user-1", "viewer"), id, "session"))
        .hasMessage("FORBIDDEN_SCOPE");
    ObjectNode bad = observation(id, 1);
    bad.put("scopeHash", "0".repeat(64));
    assertThatThrownBy(() -> service.observe(worker, id, 1, "observe", bad))
        .hasMessage("FORBIDDEN_SCOPE");
  }

  @Test
  void workerSubjectFenceAndLeaseAreIndependent() {
    String id = observing();
    Authentication intruder = new GuidedInternalSecurity.Identity("worker-other", "owning-worker");
    assertThatThrownBy(() -> service.observe(intruder, id, 1, "observe", observation(id, 1)))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(() -> service.observe(worker, id, 0, "observe", observation(id, 1)))
        .hasMessage("STALE_FENCE");
    clock.now = clock.now.plusSeconds(31);
    assertThatThrownBy(() -> service.observe(worker, id, 1, "observe", observation(id, 1)))
        .hasMessage("STALE_FENCE");
    access.recoverable = true;
    assertThatThrownBy(() -> service.claim(intruder, id, "claim2", claim(id, "worker-other", 1)))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(() -> service.claim(worker, id, "expired-owner", claim(id, "worker-1", 1)))
        .hasMessage("STALE_FENCE");
    assertThat(
            repository.transaction(
                () -> repository.lock(id).document().path("owner").path("fence").asInt()))
        .isEqualTo(1);
    assertThatThrownBy(() -> service.observe(worker, id, 1, "old", observation(id, 1)))
        .hasMessage("STALE_FENCE");
  }

  @Test
  void takeoverAfterEffectsOrLostAcknowledgmentStopsUnknown() {
    String id = observing();
    JsonNode dispatched = dispatch(id);
    clock.now = clock.now.plusSeconds(31);
    assertThatThrownBy(
            () ->
                service.claim(
                    new GuidedInternalSecurity.Identity("worker-other", "owning-worker"),
                    id,
                    "takeover",
                    claim(id, "worker-other", 1)))
        .hasMessage("FORBIDDEN_SCOPE");
    stoppedWorker(id);
    assertThat(service.read(user, id, "result").path("outcome").asText())
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThat(repository.actions(id).getFirst().path("state").asText())
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> reportOutcome(worker, id, 1, "late", outcome(dispatched)))
        .hasMessage("STALE_FENCE");
  }

  @Test
  void lostAckNeverRetriesAndDelayedCallbackCannotRevive() {
    String id = observing();
    JsonNode dispatched = dispatch(id);
    service.lostAcknowledgment(id);
    assertThatThrownBy(() -> consume(controller, id, 1, "retry", advance(id, dispatched)))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> reportOutcome(worker, id, 1, "late", outcome(dispatched)))
        .hasMessage("UNKNOWN_OUTCOME");
    JsonNode result = service.read(user, id, "result");
    assertThat(result.path("mode").asText()).isEqualTo("guided");
    assertThat(result.path("replayVerified").asBoolean()).isFalse();
    assertThat(result.path("currentReadiness").path("revisionId").isNull()).isTrue();
    assertThat(result.path("currentReadiness").path("ready").asBoolean()).isFalse();
  }

  @Test
  void cancelRevokesUnconsumedAndRetainsUncertainConsumedEvidence() {
    String id = observing();
    service.observe(worker, id, 1, "observe", observation(id, 1));
    admit(controller, id, 1, "admit", proposal(id));
    service.cancel(user, id, "cancel", cancel());
    assertThat(repository.actions(id).getFirst().path("state").asText()).isEqualTo("REVOKED");
    assertThatThrownBy(
            () ->
                consume(
                    controller, id, 1, "advance", advance(id, repository.actions(id).getFirst())))
        .hasMessage("CANCELLED");
    String next = observing();
    JsonNode dispatched = dispatch(next);
    service.cancel(user, next, "cancel", cancel());
    assertThat(repository.actions(next).getFirst().path("state").asText())
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> reportOutcome(worker, next, 1, "late", outcome(dispatched)))
        .hasMessage("CANCELLED");
  }

  @Test
  void expiryCannotBeExtendedAndTrustedReaperRevokes() {
    String id = observing();
    String deadline = service.read(user, id, "session").path("expiresAt").asText();
    clock.now = clock.now.plusSeconds(20);
    JsonNode renewed = service.claim(worker, id, "renew", claim(id, "worker-1", 1));
    assertThat(renewed.path("expiresAt").asText()).isEqualTo(deadline);
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_guided_sessions SET expires_at=expires_at+interval '1 second'"
                        + " WHERE session_id=?",
                    id))
        .hasMessageContaining("immutable");
    clock.now = Instant.parse(deadline);
    service.expire();
    assertThat(service.read(user, id, "result").path("outcome").asText()).isEqualTo("EXPIRED");
    assertThatThrownBy(() -> service.claim(worker, id, "again", claim(id, "worker-1", 2)))
        .hasMessage("EXPIRED");
  }

  @Test
  void entireSessionBudgetsAreReservedAndMissingUsageIsConservative() {
    service =
        newService(
            new GuidedSessionProperties(
                true,
                Map.of(
                    "maxModelInputTokensTotal",
                    10,
                    "maxModelOutputTokensTotal",
                    10,
                    "maxModelProposals",
                    2)));
    String id = observing();
    service.reserveModel(controller, id, 1, "reserve", 8, 8);
    service.settleModel(controller, id, 1, "settle", "reserve", null, null);
    assertThatThrownBy(() -> service.reserveModel(controller, id, 1, "overflow", 3, 3))
        .hasMessage("BUDGET_EXCEEDED");
    assertThat(service.read(user, id, "session").path("counters").path("modelInputTokens").asInt())
        .isEqualTo(8);
    clock.now = clock.now.plusSeconds(10);
    service.claim(worker, id, "renew", claim(id, "worker-1", 1));
    assertThat(service.read(user, id, "session").path("counters").path("modelInputTokens").asInt())
        .isEqualTo(8);
  }

  @Test
  void observationBudgetAndGenerationAreSharedAcrossActions() {
    service = newService(new GuidedSessionProperties(true, Map.of("maxObservations", 1)));
    String id = observing();
    JsonNode dispatched = dispatch(id);
    reportOutcome(worker, id, 1, "result", outcome(dispatched));
    assertThatThrownBy(() -> service.observe(worker, id, 1, "old", observation(id, 1)))
        .hasMessage("STALE_GENERATION");
    assertThatThrownBy(() -> service.observe(worker, id, 1, "over", observation(id, 2)))
        .hasMessage("BUDGET_EXCEEDED");
  }

  @Test
  void outcomeCannotRewriteAdmissionAndIdenticalDeliveryIsIdempotent() {
    String id = observing();
    JsonNode dispatched = dispatch(id);
    ObjectNode report = outcome(dispatched);
    ObjectNode changed = report.deepCopy();
    changed.withObject("/ledger").put("operationHash", "0".repeat(64));
    assertThatThrownBy(() -> reportOutcome(worker, id, 1, "tamper", changed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    JsonNode result = reportOutcome(worker, id, 1, "result", report);
    contracts.validate("session", result);
    assertThat(reportOutcome(worker, id, 1, "result", report)).isEqualTo(result);
    assertThat(reportOutcome(worker, id, 1, "different-delivery", report).path("state").asText())
        .isEqualTo("OBSERVING");
  }

  @Test
  void noStateCanPublishWithoutExactVerifier() {
    String id = observing();
    ObjectNode request = finalizeRequest(id);
    assertThatThrownBy(() -> publish(id, "finalize", request)).hasMessage("PUBLICATION_CONFLICT");
    service.cancel(user, id, "cancel", cancel());
    assertThatThrownBy(() -> publish(id, "again", request)).hasMessage("PUBLICATION_CONFLICT");
    assertThat(service.read(user, id, "result").path("outcome").asText()).isEqualTo("CANCELLED");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_sessions WHERE finalization_identity IS NOT"
                    + " NULL",
                Integer.class))
        .isZero();
  }

  @Test
  void sourceChangesRejectInternalTransitionsAndUnavailableAccountsFailClosed() {
    String id = observing();
    access.current = false;
    assertThatThrownBy(() -> service.observe(worker, id, 1, "observe", observation(id, 1)))
        .hasMessage("REVISION_CONFLICT");
    access.current = true;
    access.granted = false;
    assertThatThrownBy(() -> service.start(user, "another", start())).hasMessage("FORBIDDEN_SCOPE");
    access.granted = true;
    ObjectNode obsolete = start().put("accountRef", "account-1");
    assertThatThrownBy(() -> service.start(user, "obsolete-account", obsolete))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void clarificationIsBoundToGenerationChoiceAndOriginalDeadline() {
    String id = observing();
    service.observe(worker, id, 1, "observe", observation(id, 1));
    ObjectNode question = fixture("clarification");
    question
        .put("sessionId", id)
        .put("scopeHash", scope(id))
        .put("expiresAt", clock.now.plusSeconds(60).toString());
    askObservedQuestion(id, question);
    ObjectNode answer =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("clarificationId", "question-1")
            .put("choiceId", "choice-1")
            .put("generation", 0);
    assertThatThrownBy(() -> service.clarify(user, id, "answer", answer))
        .hasMessage("STALE_GENERATION");
    answer.put("generation", 1);
    assertThat(service.clarify(user, id, "answer", answer).path("state").asText())
        .isEqualTo("OBSERVING");
  }

  @Test
  void successfulLedgerStillCannotPublishWithoutExactPlanVerifier() {
    String id = observing();
    reportOutcome(worker, id, 1, "outcome1", outcome(dispatch(id)));
    service.completeStep(controller, id, 1, "step1", contracts.object().put("stepId", STEP_1));
    ObjectNode observation = observation(id, 2);
    service.observe(worker, id, 1, "observation2", observation);
    ObjectNode action = proposal(id);
    refreshProposal(action, id, 2);
    action.withObject("/target").put("generation", 2);
    action.withObject("/coordinate").put("stepId", STEP_2);
    action
        .putObject("operation")
        .put("kind", "assert")
        .put("predicate", "visible")
        .putNull("expected");
    JsonNode admitted = admit(controller, id, 1, "admit2", action);
    JsonNode dispatched = consume(controller, id, 1, "advance2", advance(id, admitted));
    ObjectNode report = outcome(dispatched);
    assertThatThrownBy(() -> reportOutcome(worker, id, 1, "outcome2", report))
        .hasMessage("INVALID_CONTRACT");
    report.withObject("/ledger").put("assertionPassed", true);
    reportOutcome(worker, id, 1, "outcome2", report);
    assertThat(
            service
                .completeStep(controller, id, 1, "step2", contracts.object().put("stepId", STEP_2))
                .path("state")
                .asText())
        .isEqualTo("FINALIZING");
    assertThatThrownBy(() -> publish(id, "finalize", finalizeRequest(id)))
        .hasMessage("MISSING_SOURCE");
    assertThat(service.read(user, id, "session").path("state").asText()).isEqualTo("FINALIZING");
    assertThat(
            service
                .claim(worker, id, "renew-finalizing", claim(id, "worker-1", 1))
                .path("state")
                .asText())
        .isEqualTo("FINALIZING");

    access.current = false;
    assertThatThrownBy(() -> service.reserveModel(controller, id, 1, "source-conflict", 1, 1))
        .hasMessage("REVISION_CONFLICT");
    assertThatThrownBy(() -> publish(id, "source-finalize", finalizeRequest(id)))
        .hasMessage("MISSING_SOURCE");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_publications WHERE session_id=?",
                Integer.class,
                id))
        .isZero();

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_sessions WHERE finalization_identity IS NOT"
                    + " NULL",
                Integer.class))
        .isZero();
  }

  @Test
  void actionBudgetAndFalseAssertionReportsFailClosed() {
    service = newService(new GuidedSessionProperties(true, Map.of("maxActions", 1)));
    String id = observing();
    JsonNode dispatched = dispatch(id);
    ObjectNode dishonest = outcome(dispatched);
    dishonest.withObject("/ledger").put("assertionPassed", true);
    assertThatThrownBy(() -> reportOutcome(worker, id, 1, "dishonest", dishonest))
        .hasMessage("INVALID_CONTRACT");
    reportOutcome(worker, id, 1, "outcome", outcome(dispatched));
    ObjectNode observed = observation(id, 2);
    service.observe(worker, id, 1, "observation2", observed);
    ObjectNode next = proposal(id);
    refreshProposal(next, id, 2);
    next.withObject("/target").put("generation", 2);
    next.withObject("/coordinate").put("ordinal", 1);
    assertThatThrownBy(() -> admit(controller, id, 1, "admit2", next))
        .hasMessage("BUDGET_EXCEEDED");
  }

  @Test
  void gatewayOverrunIsDurablyChargedAndStopsFurtherWork() {
    service = newService(new GuidedSessionProperties(true, Map.of("maxModelInputTokensTotal", 10)));
    String id = observing();
    service.reserveModel(controller, id, 1, "reserve", 8, 8);
    service.settleModel(controller, id, 1, "settle", "reserve", 11, 8);
    JsonNode result = service.read(user, id, "result");
    assertThat(result.path("outcome").asText()).isEqualTo("FAILED");
    assertThat(result.path("errorCode").asText()).isEqualTo("BUDGET_EXCEEDED");
    assertThat(service.read(user, id, "session").path("counters").path("modelInputTokens").asInt())
        .isEqualTo(11);
    assertThatThrownBy(() -> publish(id, "finalize", finalizeRequest(id)))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void evidenceReferencesAreScopedAndDoNotClaimReplay() {
    String id = observing();
    service.recordEvidence(worker, id, 1, "evidence", "video-1", "evidence-store-1");
    assertThatThrownBy(
            () ->
                service.recordEvidence(
                    worker, id, 1, "raw", "video-2", "https://secret@example.test"))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> repository.evidence(id, "0".repeat(64), "foreign", "ref"))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    service.cancel(user, id, "cancel", cancel());
    JsonNode result = service.read(user, id, "result");
    assertThat(result.path("evidence").path("ref").asText()).isEqualTo(id);
    assertThat(
            jdbc.queryForObject(
                "SELECT evidence_ref FROM studio_guided_evidence WHERE session_id=?",
                String.class,
                id))
        .isEqualTo("evidence-store-1");
    assertThat(result.path("replayVerified").asBoolean()).isFalse();
  }

  @Test
  void acceptedSelectionSurvivesRestartAndKeepsSafeScopedMapping() {
    String id = pendingClarification();
    ObjectNode answer = clarificationAnswer();
    service.clarify(user, id, "answer", answer);
    JsonNode stored = service.clarificationSelection(controller, id, 1, "question-1");
    assertThat(stored.path("choiceId").asText()).isEqualTo("choice-1");
    // ADR-SC-007: an answer keeps a choice id and a binding, never an element id or a locator.
    assertThat(stored.has("nodeId")).isFalse();
    assertThat(stored.has("locator")).isFalse();
    assertThat(stored.path("bindingId").isNull()).isTrue();
    assertThat(stored.path("scopeHash").asText()).isEqualTo(scope(id));
    assertThat(stored.path("sourceRevision").asText()).isEqualTo("1");
    assertThat(stored.path("configurationRevision").asText()).isEqualTo("1");
    assertThat(stored.path("coordinate")).isEqualTo(fixture("clarification").path("coordinate"));
    assertThat(stored.path("documentId").asText()).isEqualTo("document-1");
    assertThat(stored.path("generation").asInt()).isEqualTo(1);
    assertThat(stored.toString()).doesNotContain("safeLabel", "Order reference", "value");
    service = newService(new GuidedSessionProperties(true, Map.of()));
    clock.now = clock.now.plusSeconds(1);
    service.clarify(user, id, "answer", answer);
    assertThat(service.clarificationSelection(controller, id, 1, "question-1")).isEqualTo(stored);
    ObjectNode conflict = answer.deepCopy();
    conflict.put("choiceId", "another");
    assertThatThrownBy(() -> service.clarify(user, id, "answer", conflict))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    service.observe(worker, id, 1, "fresh", observation(id, 2));
    assertThat(service.clarificationSelection(controller, id, 1, "question-1")).isEqualTo(stored);
    ObjectNode repeated = fixture("clarification");
    repeated
        .put("sessionId", id)
        .put("scopeHash", scope(id))
        .put("generation", 2)
        .put("expiresAt", clock.now.plusSeconds(30).toString());
    assertThatThrownBy(() -> service.clarification(controller, id, 1, "reuse-question", repeated))
        .hasMessage("IDEMPOTENCY_CONFLICT");
  }

  @Test
  void selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState() {
    String id = pendingClarification();
    service.clarify(user, id, "answer", clarificationAnswer());
    assertThatThrownBy(() -> service.clarificationSelection(user, id, 1, "question-1"))
        .hasMessage("UNAUTHENTICATED");
    assertThatThrownBy(() -> service.clarificationSelection(worker, id, 1, "question-1"))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(() -> service.clarificationSelection(controller, id, 0, "question-1"))
        .hasMessage("STALE_FENCE");
    access.current = false;
    assertThatThrownBy(() -> service.clarificationSelection(controller, id, 1, "question-1"))
        .hasMessage("REVISION_CONFLICT");
    access.current = true;
    assertThatThrownBy(() -> service.clarificationSelection(controller, id, 1, "missing"))
        .hasMessage("MISSING_SOURCE");
    service.cancel(user, id, "cancel", cancel());
    assertThatThrownBy(() -> service.clarificationSelection(controller, id, 1, "question-1"))
        .hasMessage("CANCELLED");
  }

  @Test
  void clarificationSelectionAndPauseChangeRollBackTogether() {
    String id = pendingClarification();
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      service.clarify(user, id, "answer", clarificationAnswer());
                      throw new IllegalStateException("rollback-answer");
                    }))
        .hasMessage("rollback-answer");
    assertThat(service.read(user, id, "session").path("state").asText())
        .isEqualTo("AWAITING_CLARIFICATION");
    assertThatThrownBy(() -> service.clarificationSelection(controller, id, 1, "question-1"))
        .hasMessage("MISSING_SOURCE");
    service.clarify(user, id, "answer", clarificationAnswer());
    assertThat(
            service
                .clarificationSelection(controller, id, 1, "question-1")
                .path("choiceId")
                .asText())
        .isEqualTo("choice-1");
  }

  @Test
  void renewalAndRecoverableTakeoverPreserveClarificationUntilActualAnswer() {
    String id = pendingClarification();
    JsonNode deadline = service.read(user, id, "session").path("expiresAt");
    clock.now = clock.now.plusSeconds(10);
    JsonNode renewed = service.claim(worker, id, "renew", claim(id, "worker-1", 1));
    assertThat(renewed.path("state").asText()).isEqualTo("AWAITING_CLARIFICATION");
    assertThat(renewed.path("owner").path("fence").asInt()).isEqualTo(1);
    assertThat(renewed.path("expiresAt")).isEqualTo(deadline);
    assertThatThrownBy(() -> service.observe(worker, id, 1, "bypass", observation(id, 2)))
        .hasMessage("STALE_GENERATION");
    clock.now = clock.now.plusSeconds(31);
    access.recoverable = true;
    Authentication nextOwner = new GuidedInternalSecurity.Identity("worker-next", "owning-worker");
    assertThatThrownBy(() -> service.claim(nextOwner, id, "takeover", claim(id, "worker-next", 1)))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThat(service.read(user, id, "session").path("state").asText())
        .isEqualTo("AWAITING_CLARIFICATION");
    service.clarify(user, id, "answer", clarificationAnswer());
    assertThat(service.read(user, id, "session").path("state").asText()).isEqualTo("OBSERVING");
    assertThatThrownBy(() -> service.clarificationSelection(controller, id, 1, "question-1"))
        .hasMessage("STALE_FENCE");
    assertThatThrownBy(() -> service.observe(worker, id, 1, "stale-owner", observation(id, 2)))
        .hasMessage("STALE_FENCE");
    assertThatThrownBy(() -> service.observe(nextOwner, id, 1, "replacement", observation(id, 2)))
        .hasMessage("STALE_FENCE");
  }

  @Test
  void protectedAuthAndFinalizingStatesSurviveRenewalAndUndispatchedRecovery() {
    ObjectNode obsolete = fixture("session").put("state", "AWAITING_AUTH");
    assertThatThrownBy(() -> contracts.validate("session", obsolete))
        .hasMessage("INVALID_CONTRACT");
    for (String state : List.of("FINALIZING")) {
      String id = observing();
      // Downstream auth/finalization transitions are represented here only to exercise maintenance.
      repository.transaction(
          () -> {
            var session = repository.lock(id);
            session.document().put("state", state);
            repository.save(session);
            return null;
          });
      assertThat(
              service.claim(worker, id, "renew", claim(id, "worker-1", 1)).path("state").asText())
          .isEqualTo(state);
      assertThatThrownBy(() -> service.observe(worker, id, 1, "bypass", observation(id, 1)))
          .hasMessage("STALE_GENERATION");
      clock.now = clock.now.plusSeconds(31);
      access.recoverable = true;
      Authentication nextOwner = new GuidedInternalSecurity.Identity("next-owner", "owning-worker");
      assertThatThrownBy(() -> service.claim(nextOwner, id, "recover", claim(id, "next-owner", 1)))
          .hasMessage("FORBIDDEN_SCOPE");
      assertThat(service.read(user, id, "session").path("state").asText()).isEqualTo(state);
      assertThatThrownBy(() -> service.observe(nextOwner, id, 1, "bypass", observation(id, 1)))
          .hasMessage("STALE_FENCE");
    }
  }

  @Test
  void atomicRenewalPreservesExactProgressAndCommittedCommandSnapshot() {
    String id = observing();
    service.observe(worker, id, 1, "before-atomic-renew", observation(id, 1));
    JsonNode beforeProgress = persistedProgress(id);
    JsonNode before = repository.transaction(() -> repository.lock(id).document().deepCopy());
    clock.now = clock.now.plusSeconds(5);
    JsonNode renewed = service.claim(worker, id, "atomic-renew", claim(id, "worker-1", 1));
    assertThat(persistedProgress(id)).isEqualTo(beforeProgress);
    assertThat(renewed.path("owner").path("fence")).isEqualTo(before.path("owner").path("fence"));
    assertThat(renewed.path("expiresAt")).isEqualTo(before.path("expiresAt"));
    assertThat(renewed.path("counters")).isEqualTo(before.path("counters"));
    JsonNode command =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT response::text FROM studio_guided_commands WHERE namespace=? AND"
                    + " route='claim' AND idempotency_key=?",
                String.class,
                id,
                "atomic-renew"));
    assertThat(command).isEqualTo(renewed);
    assertThat(persistedDocument(id)).isEqualTo(renewed);
    ((ObjectNode) renewed).withObject("/owner").put("workerId", "caller-mutated-copy");
    assertThat(persistedDocument(id).path("owner").path("workerId").asText()).isEqualTo("worker-1");
  }

  @Test
  void atomicRenewalUniqueCommandConflictRollsBackOwnerUpdate() {
    String id = observing();
    ObjectNode request = claim(id, "worker-1", 1);
    service.claim(worker, id, "conflicting-renew", request);
    JsonNode before = repository.transaction(() -> repository.lock(id).document().deepCopy());
    JsonNode beforeProgress = persistedProgress(id);
    clock.now = clock.now.plusSeconds(5);
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      var session = repository.lock(id);
                      session
                          .document()
                          .withObject("/owner")
                          .put("leaseExpiresAt", clock.now.plusSeconds(30).toString());
                      repository.saveRenewalAndCommand(
                          session, "conflicting-renew", GuidedContracts.hash(request));
                      return null;
                    }))
        .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
    assertThat(persistedDocument(id)).isEqualTo(before);
    assertThat(persistedProgress(id)).isEqualTo(beforeProgress);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands"
                    + " WHERE namespace=? AND route='claim' AND idempotency_key=?",
                Integer.class,
                id,
                "conflicting-renew"))
        .isEqualTo(1);
    assertThat(
            contracts.parse(
                jdbc.queryForObject(
                    "SELECT response::text FROM studio_guided_commands"
                        + " WHERE namespace=? AND route='claim' AND idempotency_key=?",
                    String.class,
                    id,
                    "conflicting-renew")))
        .isEqualTo(before);
  }

  @Test
  void atomicRenewalExternalCallerRollbackLeavesNoLeaseOrCommandCommit() {
    String id = observing();
    JsonNode before = repository.transaction(() -> repository.lock(id).document().deepCopy());
    JsonNode beforeProgress = persistedProgress(id);
    clock.now = clock.now.plusSeconds(5);
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      JsonNode renewed =
                          service.claim(
                              worker, id, "outer-rollback-renew", claim(id, "worker-1", 1));
                      assertThat(renewed.path("owner").path("leaseExpiresAt"))
                          .isNotEqualTo(before.path("owner").path("leaseExpiresAt"));
                      assertThat(
                              jdbc.queryForObject(
                                  "SELECT count(*) FROM studio_guided_commands WHERE namespace=?"
                                      + " AND route='claim' AND idempotency_key=?",
                                  Integer.class,
                                  id,
                                  "outer-rollback-renew"))
                          .isEqualTo(1);
                      throw new IllegalStateException("Controlled outer renewal rollback");
                    }))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Controlled outer renewal rollback");
    assertThat(persistedDocument(id)).isEqualTo(before);
    assertThat(persistedProgress(id)).isEqualTo(beforeProgress);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands"
                    + " WHERE namespace=? AND route='claim' AND idempotency_key=?",
                Integer.class,
                id,
                "outer-rollback-renew"))
        .isZero();
  }

  @Test
  void atomicRenewalRejectsInvalidSchemaAndMissingRowWithoutCommand() {
    String id = observing();
    JsonNode before = repository.transaction(() -> repository.lock(id).document().deepCopy());
    JsonNode beforeProgress = persistedProgress(id);
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      var session = repository.lock(id);
                      session.document().put("unexpectedRenewalField", true);
                      repository.saveRenewalAndCommand(
                          session,
                          "invalid-schema-renew",
                          GuidedContracts.hash(claim(id, "worker-1", 1)));
                      return null;
                    }))
        .hasMessage("INVALID_CONTRACT");
    assertThat(persistedDocument(id)).isEqualTo(before);
    assertThat(persistedProgress(id)).isEqualTo(beforeProgress);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands"
                    + " WHERE namespace=? AND route='claim' AND idempotency_key=?",
                Integer.class,
                id,
                "invalid-schema-renew"))
        .isZero();
    String absent = UUID.randomUUID().toString();
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      var original = repository.lock(id);
                      ObjectNode missing = original.document().deepCopy().put("sessionId", absent);
                      repository.saveRenewalAndCommand(
                          new GuidedSessionRepository.Session(missing, original.progress()),
                          "missing-owner-renew",
                          GuidedContracts.hash(claim(absent, "worker-1", 1)));
                      return null;
                    }))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=?",
                Integer.class,
                absent))
        .isZero();
    assertThat(persistedDocument(id)).isEqualTo(before);
  }

  private JsonNode persistedDocument(String id) {
    return repository.transaction(() -> repository.lock(id).document().deepCopy());
  }

  private JsonNode persistedProgress(String id) {
    return contracts.parse(
        jdbc.queryForObject(
            "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  @Test
  void liveOwnerRenewalPreservesAdmittedAndDispatchedActions() {
    String id = observing();
    service.observe(worker, id, 1, "observe", observation(id, 1));
    JsonNode admitted = admit(controller, id, 1, "admit", proposal(id));
    JsonNode renewed = service.claim(worker, id, "renew", claim(id, "worker-1", 1));
    assertThat(renewed.path("state").asText()).isEqualTo("ACTING");
    assertThat(repository.actions(id).getFirst().path("state").asText()).isEqualTo("ADMITTED");
    JsonNode dispatched = consume(controller, id, 1, "advance", advance(id, admitted));
    service.claim(worker, id, "renew2", claim(id, "worker-1", 1));
    assertThat(repository.actions(id).getFirst().path("state").asText()).isEqualTo("DISPATCHING");
    reportOutcome(worker, id, 1, "outcome", outcome(dispatched));
    assertThat(repository.actions(id).getFirst().path("dispatchCount").asInt()).isEqualTo(1);
  }

  @Test
  void takeoverCannotReopenFinalizingAfterExecutedEffects() {
    String id = observing();
    reportOutcome(worker, id, 1, "outcome", outcome(dispatch(id)));
    // A completed-work fixture: only ownership maintenance is under test here.
    repository.transaction(
        () -> {
          var session = repository.lock(id);
          session.document().put("state", "FINALIZING");
          repository.save(session);
          return null;
        });
    assertThat(service.claim(worker, id, "renew", claim(id, "worker-1", 1)).path("state").asText())
        .isEqualTo("FINALIZING");
    clock.now = clock.now.plusSeconds(31);
    access.recoverable = true;
    Authentication nextOwner = new GuidedInternalSecurity.Identity("next-owner", "owning-worker");
    assertThatThrownBy(() -> service.claim(nextOwner, id, "takeover", claim(id, "next-owner", 1)))
        .hasMessage("FORBIDDEN_SCOPE");
    stoppedWorker(id);
    assertThat(service.read(user, id, "result").path("outcome").asText()).isEqualTo("FAILED");
    assertThat(repository.actions(id).getFirst().path("state").asText()).isEqualTo("SUCCEEDED");
    assertThatThrownBy(() -> service.observe(nextOwner, id, 2, "bypass", observation(id, 2)))
        .isInstanceOf(GuidedSessionException.class);
  }

  private void verifyFreshContextQueries(JdbcTemplate observed, String id) {
    org.mockito.Mockito.verify(observed)
        .query(
            org.mockito.ArgumentMatchers.eq(
                "SELECT * FROM studio_guided_materializations WHERE session_id=?"),
            org.mockito.ArgumentMatchers.<org.springframework.jdbc.core.RowMapper<ObjectNode>>any(),
            org.mockito.ArgumentMatchers.eq(id));
    for (String table :
        List.of(
            "studio_guided_allocations",
            "studio_guided_producers",
            "studio_guided_consumer_edges")) {
      org.mockito.Mockito.verify(observed)
          .queryForList(
              org.mockito.ArgumentMatchers.eq(
                  "SELECT document::text FROM "
                      + table
                      + " WHERE session_id=? ORDER BY document::text"),
              org.mockito.ArgumentMatchers.eq(String.class),
              org.mockito.ArgumentMatchers.eq(id));
    }
  }

  @Test
  void sameCallbackContextSuccessStillReadsAllRowsAndDefaultsStayStrict() {
    String id = observing();
    GuidedContracts checked = org.mockito.Mockito.spy(new GuidedContracts());
    JdbcTemplate queried = org.mockito.Mockito.spy(jdbc);
    var selected =
        new GuidedMaterializationService(
            queried, checked, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    repository.transaction(
        () -> {
          ObjectNode session = repository.lock(id).document();
          var proof = selected.verifyAndCapture(session, frozenCallbackIdentities.get(id));
          assertThat(proof).isNotNull();
          org.mockito.Mockito.clearInvocations(queried, checked);
          ObjectNode fresh = selected.context(session, proof);
          assertThat(fresh.path("sessionId").asText()).isEqualTo(id);
          verifyFreshContextQueries(queried, id);
          org.mockito.Mockito.verify(checked, org.mockito.Mockito.never())
              .validate(
                  org.mockito.ArgumentMatchers.eq("v3/runner-context"),
                  org.mockito.ArgumentMatchers.any());
          selected.context(session);
          org.mockito.Mockito.verify(checked)
              .validate(
                  org.mockito.ArgumentMatchers.eq("v3/runner-context"),
                  org.mockito.ArgumentMatchers.any());
          selected.verify(session, frozenCallbackIdentities.get(id));
          org.mockito.Mockito.verify(checked, org.mockito.Mockito.times(2))
              .validate(
                  org.mockito.ArgumentMatchers.eq("v3/runner-context"),
                  org.mockito.ArgumentMatchers.any());
          return null;
        });
  }

  @Test
  void completeContextLeaseArraysRepresentationRevisionAndForeignProofFallBack() {
    String id = observing();
    GuidedContracts checked = org.mockito.Mockito.spy(new GuidedContracts());
    var selected =
        new GuidedMaterializationService(
            jdbc, checked, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    repository.transaction(
        () -> {
          ObjectNode session = repository.lock(id).document();
          var proof = selected.verifyAndCapture(session, frozenCallbackIdentities.get(id));
          assertThat(proof).isNotNull();
          ObjectNode renewed = session.deepCopy();
          String lease =
              Instant.parse(session.path("owner").path("leaseExpiresAt").asText())
                  .plusMillis(1)
                  .toString();
          renewed.withObject("/owner").put("leaseExpiresAt", lease);
          ObjectNode arrays = session.deepCopy();
          arrays.withArray("sourceSteps").addObject().put("stepId", "additional-step");
          // Representation-only change of a context-carried object. STUDIO-OBS-012A: versions is
          // the one-key {contract:3}, so the reorder moves the first limits member instead.
          ObjectNode reordered = session.deepCopy();
          ObjectNode limits = (ObjectNode) reordered.path("limits");
          String first = limits.fieldNames().next();
          JsonNode moved = limits.remove(first);
          limits.set(first, moved);
          for (ObjectNode changed : List.of(renewed, arrays, reordered)) {
            org.mockito.Mockito.clearInvocations(checked);
            ObjectNode fresh = selected.context(changed, proof);
            assertThat(fresh.path("sessionId").asText()).isEqualTo(id);
            org.mockito.Mockito.verify(checked)
                .validate(
                    org.mockito.ArgumentMatchers.eq("v3/runner-context"),
                    org.mockito.ArgumentMatchers.any());
          }
          var foreign =
              new GuidedMaterializationService(
                      jdbc, checked, com.citi.put.checks.studio.support.TestDomains.FIXTURES)
                  .verifyAndCapture(session, frozenCallbackIdentities.get(id));
          org.mockito.Mockito.clearInvocations(checked);
          selected.context(session, foreign);
          selected.context(session, null);
          org.mockito.Mockito.verify(checked, org.mockito.Mockito.times(2))
              .validate(
                  org.mockito.ArgumentMatchers.eq("v3/runner-context"),
                  org.mockito.ArgumentMatchers.any());
          int initialRevision = selected.context(session).path("materializationRevision").asInt();
          selected.bump(id); // Actual monotone materialization revision, guarded in PostgreSQL.
          org.mockito.Mockito.clearInvocations(checked);
          assertThat(selected.context(session, proof).path("materializationRevision").asInt())
              .isEqualTo(initialRevision + 1);
          org.mockito.Mockito.verify(checked)
              .validate(
                  org.mockito.ArgumentMatchers.eq("v3/runner-context"),
                  org.mockito.ArgumentMatchers.any());
          return null;
        });
  }

  @Test
  void contextProofCannotSkipFirstIdentityCanonicalOrFreshLiveRefusal() {
    String id = observing();
    GuidedContracts checked = org.mockito.Mockito.spy(new GuidedContracts());
    var selected =
        new GuidedMaterializationService(
            jdbc, checked, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    repository.transaction(
        () -> {
          ObjectNode session = repository.lock(id).document();
          ObjectNode wrongIdentity =
              frozenCallbackIdentities.get(id).deepCopy().put("contextRevision", 2);
          assertThatThrownBy(() -> selected.verifyAndCapture(session, wrongIdentity))
              .hasMessage("STALE_FENCE");
          ObjectNode wrongSchema = session.deepCopy();
          wrongSchema.withObject("/owner").put("leaseExpiresAt", "fixed-invalid-time");
          assertThatThrownBy(
                  () -> selected.verifyAndCapture(wrongSchema, frozenCallbackIdentities.get(id)))
              .hasMessage("INVALID_CONTRACT");
          var proof = selected.verifyAndCapture(session, frozenCallbackIdentities.get(id));
          assertThat(proof).isNotNull();
          ObjectNode nonfinite = session.deepCopy();
          nonfinite.withObject("/limits").put("maxObservationBytes", Double.NaN);
          org.mockito.Mockito.clearInvocations(checked);
          assertThatThrownBy(() -> selected.context(nonfinite, proof))
              .hasMessage("INVALID_CONTRACT");
          org.mockito.Mockito.verify(checked, org.mockito.Mockito.never())
              .validate(
                  org.mockito.ArgumentMatchers.eq("v3/runner-context"),
                  org.mockito.ArgumentMatchers.any());
          selected.stop(id); // Same actual row becomes nonlive; old proof cannot authorize it.
          assertThatThrownBy(() -> selected.context(session, proof)).hasMessage("STALE_FENCE");
          return null;
        });
  }

  @Test
  void observeV2ReusesOnlySecondSchemaAndUnavailableCaptureDefaults() {
    String id = observing();
    GuidedContracts checked = org.mockito.Mockito.spy(new GuidedContracts());
    var selected =
        new GuidedMaterializationService(
            jdbc, checked, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    var localService =
        new GuidedSessionService(
            repository,
            contracts,
            sourceAccess(),
            new GuidedSessionProperties(true, Map.of()),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            clock);
    installTranslation(localService, jdbc, contracts);
    localService.installBridge(
        selected,
        new GuidedPreparationStore(jdbc, contracts),
        new GuidedBindingStore(jdbc, contracts, selected),
        assignments);
    JsonNode observed =
        localService.observeV2(worker, id, 1, "same-context", observationEnvelope(id, 1));
    assertThat(observed.path("state").asText()).isEqualTo("PROPOSING");
    org.mockito.Mockito.verify(checked)
        .validate(
            org.mockito.ArgumentMatchers.eq("v3/runner-context"),
            org.mockito.ArgumentMatchers.any());
    repository.transaction(
        () -> {
          ObjectNode session = repository.lock(id).document();
          ObjectNode customSession = session.deepCopy();
          ObjectNode customVersions =
              new ObjectNode(com.fasterxml.jackson.databind.node.JsonNodeFactory.instance) {};
          customVersions.setAll((ObjectNode) customSession.path("versions"));
          customSession.set("versions", customVersions);
          assertThat(selected.verifyAndCapture(customSession, frozenCallbackIdentities.get(id)))
              .isNull();
          RuntimeException unavailable = new IllegalStateException("fixed-capture-unavailable");
          org.mockito.Mockito.doThrow(unavailable)
              .when(checked)
              .parse(org.mockito.ArgumentMatchers.contains("\"materializationRevision\":"));
          var absent = selected.verifyAndCapture(session, frozenCallbackIdentities.get(id));
          assertThat(absent).isNull();
          selected.context(session, absent);
          Error fatal = new AssertionError("fixed-capture-fatal");
          org.mockito.Mockito.doThrow(fatal)
              .when(checked)
              .parse(org.mockito.ArgumentMatchers.contains("\"materializationRevision\":"));
          assertThatThrownBy(
                  () -> selected.verifyAndCapture(session, frozenCallbackIdentities.get(id)))
              .isSameAs(fatal);
          return null;
        });
  }

  private GuidedSessionService observationValidationService(GuidedContracts validationContracts) {
    var selected =
        new GuidedSessionService(
            repository,
            validationContracts,
            sourceAccess(),
            new GuidedSessionProperties(true, Map.of()),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            clock);
    installTranslation(selected, jdbc, contracts);
    selected.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, contracts),
        new GuidedBindingStore(jdbc, contracts, materialization),
        assignments);
    return selected;
  }

  private ObjectNode observationEnvelope(String id, int generation) {
    ObjectNode envelope = frozenCallbackIdentities.get(id).deepCopy();
    envelope.set("observation", observation(id, generation));
    return envelope;
  }

  @Test
  void preparedObservationOwnsTheWholeEnvelopeBeforeCallerMutation() {
    String id = observing();
    ObjectNode supplied = observationEnvelope(id, 1);
    String expectedHash = GuidedContracts.hash(supplied.path("observation"));
    GuidedContracts controlled = org.mockito.Mockito.spy(new GuidedContracts());
    org.mockito.Mockito.doAnswer(
            invocation -> {
              assertThat(
                      org.springframework.transaction.support.TransactionSynchronizationManager
                          .isActualTransactionActive())
                  .isFalse();
              supplied.put("workerId", "foreign-worker");
              ((ObjectNode) supplied.path("observation")).put("generation", 77);
              return invocation.callRealMethod();
            })
        .when(controlled)
        .validate(
            org.mockito.ArgumentMatchers.eq("observation"), org.mockito.ArgumentMatchers.any());
    var selected = observationValidationService(controlled);
    JsonNode result = selected.observeV2(worker, id, 1, "owned-observation", supplied);
    assertThat(result.path("state").asText()).isEqualTo("PROPOSING");
    repository.transaction(
        () -> {
          var stored = repository.lock(id);
          assertThat(stored.progress().path("generation").asInt()).isEqualTo(1);
          assertThat(stored.progress().path("observationHash").asText().equals(expectedHash))
              .isTrue();
          return null;
        });
    org.mockito.Mockito.verify(controlled)
        .validate(
            org.mockito.ArgumentMatchers.eq("observation"), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void preparedObservationFailureKeepsOwnerMaterializationRefreshAndDuplicatePriority() {
    String id = observing();
    String initialState =
        repository.transaction(() -> repository.lock(id).document().path("state").asText());
    ObjectNode request = observationEnvelope(id, 1);
    GuidedContracts controlled = org.mockito.Mockito.spy(new GuidedContracts());
    org.mockito.Mockito.doThrow(new GuidedSessionException("INVALID_CONTRACT", 422))
        .when(controlled)
        .validate(
            org.mockito.ArgumentMatchers.eq("observation"), org.mockito.ArgumentMatchers.any());
    var selected = observationValidationService(controlled);
    assertThatThrownBy(() -> selected.observeV2(worker, id, 2, "wrong-owner", request))
        .hasMessage("STALE_FENCE");
    ObjectNode wrongContext = request.deepCopy().put("contextRevision", 2);
    assertThatThrownBy(() -> selected.observeV2(worker, id, 1, "wrong-context", wrongContext))
        .hasMessage("STALE_FENCE");
    assertThatThrownBy(() -> selected.observeV2(worker, id, 1, "oref-unmatched", request))
        .hasMessage("STALE_GENERATION");
    assertThatThrownBy(() -> selected.observeV2(worker, id, 1, "typed-observation", request))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> {
              assertThat(failure.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(failure.status()).isEqualTo(422);
              assertThat(failure.getCause()).isNull();
            });
    String stateAfterFailures =
        repository.transaction(() -> repository.lock(id).document().path("state").asText());
    assertThat(stateAfterFailures).isEqualTo(initialState);
    // Original public/default observe commits the real first observation and command.
    service.observe(worker, id, 1, "duplicate-observation", observation(id, 1));
    JsonNode duplicate = selected.observeV2(worker, id, 1, "duplicate-observation", request);
    assertThat(duplicate.path("state").asText()).isEqualTo("PROPOSING");
    int duplicateGeneration =
        repository.transaction(() -> repository.lock(id).progress().path("generation").asInt());
    assertThat(duplicateGeneration).isEqualTo(1);
  }

  @Test
  void unsupportedObservationEnvelopeUsesOriginalLockedValidation() {
    String id = observing();
    ObjectNode request =
        new ObjectNode(com.fasterxml.jackson.databind.node.JsonNodeFactory.instance) {};
    request.setAll(observationEnvelope(id, 1));
    GuidedContracts controlled = org.mockito.Mockito.spy(new GuidedContracts());
    org.mockito.Mockito.doAnswer(
            invocation -> {
              assertThat(
                      org.springframework.transaction.support.TransactionSynchronizationManager
                          .isActualTransactionActive())
                  .isTrue();
              return invocation.callRealMethod();
            })
        .when(controlled)
        .validate(
            org.mockito.ArgumentMatchers.eq("observation"), org.mockito.ArgumentMatchers.any());
    var selected = observationValidationService(controlled);
    assertThat(
            selected
                .observeV2(worker, id, 1, "unsupported-envelope", request)
                .path("state")
                .asText())
        .isEqualTo("PROPOSING");
    org.mockito.Mockito.verify(controlled)
        .validate(
            org.mockito.ArgumentMatchers.eq("observation"), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void unavailableObservationPreparationFallsBackAndFatalRemainsEarly() {
    String id = observing();
    ObjectNode request = observationEnvelope(id, 1);
    GuidedContracts controlled = org.mockito.Mockito.spy(new GuidedContracts());
    RuntimeException unavailable = new IllegalStateException("fixed-preparation-unavailable");
    org.mockito.Mockito.doThrow(unavailable)
        .doCallRealMethod()
        .when(controlled)
        .validate(
            org.mockito.ArgumentMatchers.eq("observation"), org.mockito.ArgumentMatchers.any());
    var selected = observationValidationService(controlled);
    assertThat(
            selected
                .observeV2(worker, id, 1, "fallback-observation", request)
                .path("state")
                .asText())
        .isEqualTo("PROPOSING");
    org.mockito.Mockito.verify(controlled, org.mockito.Mockito.times(2))
        .validate(
            org.mockito.ArgumentMatchers.eq("observation"), org.mockito.ArgumentMatchers.any());
    Error fatal = new AssertionError("fixed-preparation-fatal");
    org.mockito.Mockito.doThrow(fatal)
        .when(controlled)
        .validate(
            org.mockito.ArgumentMatchers.eq("observation"), org.mockito.ArgumentMatchers.any());
    assertThatThrownBy(() -> selected.observeV2(worker, id, 1, "fatal-observation", request))
        .isSameAs(fatal);
    int retainedGeneration =
        repository.transaction(() -> repository.lock(id).progress().path("generation").asInt());
    assertThat(retainedGeneration).isEqualTo(1);
  }

  @Test
  void outcomeSaveProofPreservesRealRollbackFreshFenceAndIdempotentWrite() {
    String id = observing();
    JsonNode dispatched = dispatch(id);
    ObjectNode envelope = outcome(dispatched);
    ObjectNode report = (ObjectNode) envelope.path("ledger");
    GuidedContracts checked = org.mockito.Mockito.spy(new GuidedContracts());
    var selectedRepository =
        org.mockito.Mockito.spy(
            new GuidedSessionRepository(
                jdbc,
                new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())),
                checked));
    var prepared = new GuidedActionLedger(checked).prepareReport(report);
    assertThat(prepared).isNotNull();
    assertThatThrownBy(
            () ->
                selectedRepository.transaction(
                    () -> {
                      selectedRepository.lock(id);
                      selectedRepository.saveAction(report, prepared);
                      jdbc.queryForObject("SELECT 1 / 0", Integer.class);
                      return null;
                    }))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    assertThat(repository.actions(id).getFirst()).isEqualTo(dispatched);

    var selectedService =
        new GuidedSessionService(
            selectedRepository,
            checked,
            sourceAccess(),
            new GuidedSessionProperties(true, Map.of()),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            clock);
    installTranslation(selectedService, jdbc, contracts);
    selectedService.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, contracts),
        new GuidedBindingStore(jdbc, contracts, materialization),
        assignments);
    assertThatThrownBy(
            () -> selectedService.outcomeV2(worker, id, 2, "wrong-proof-fence", envelope))
        .hasMessage("STALE_FENCE");
    assertThat(repository.actions(id).getFirst()).isEqualTo(dispatched);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND"
                    + " route='outcomes-v2'",
                Integer.class,
                id))
        .isZero();

    org.mockito.Mockito.clearInvocations(checked, selectedRepository);
    JsonNode accepted = selectedService.outcomeV2(worker, id, 1, "proof-winner", envelope);
    assertThat(accepted.path("state").asText()).isEqualTo("OBSERVING");
    assertThat(repository.actions(id).getFirst()).isEqualTo(report);
    org.mockito.Mockito.verify(checked)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.verify(selectedRepository, org.mockito.Mockito.never())
        .saveAction(org.mockito.ArgumentMatchers.any(ObjectNode.class));
    assertThat(selectedService.outcomeV2(worker, id, 1, "proof-winner", envelope))
        .isEqualTo(accepted);
    assertThat(repository.actions(id).getFirst()).isEqualTo(report);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND"
                    + " route='outcomes-v2'",
                Integer.class,
                id))
        .isEqualTo(1);
  }

  private GuidedSessionService newService(GuidedSessionProperties properties) {
    var result =
        new GuidedSessionService(
            repository,
            contracts,
            sourceAccess(),
            properties,
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            clock);
    installTranslation(result, jdbc, contracts);
    // STUDIO-OBS-008 P2/P3: the real presentation projector, as the production composition wires.
    result.installPresentation(new GuidedPublicPresentationProjector(jdbc, contracts));
    materialization =
        new GuidedMaterializationService(
            jdbc, contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    assignments = new GuidedAssignmentStore(jdbc, contracts);
    result.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, contracts),
        new GuidedBindingStore(jdbc, contracts, materialization),
        assignments);
    // STUDIO-OBS-014 AC-8: every start passes the per-CSI budget.
    installFixtureCsiBudget(result);
    // STUDIO-OBS-013/014 S3b: the production recording projection, as GuidedEvidenceConfiguration
    // installs it; the NONE default's null video is invalid v3/result after C2b by design.
    result.installEvidence(
        new com.citi.put.checks.studio.guided.evidence.RecordedGuidedEvidenceProjection(
            new com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceRepository(jdbc),
            new com.citi.put.checks.studio.guided.evidence.GuidedRecordingProperties(null),
            false,
            contracts));
    return result;
  }

  /** The fixture's per-CSI limits: generous, because the raced starts share one CSI. */
  private void installFixtureCsiBudget(GuidedSessionService result) {
    result.installCsiBudget(
        new GuidedCsiBudget(
            jdbc, new GuidedCsiBudgetProperties(1000, 5242880, 640000), deploymentCap));
  }

  private ObjectNode versions() {
    return (ObjectNode) contracts.parse("{\"contract\":3}");
  }

  private ObjectNode context(String id) {
    return repository.transaction(() -> materialization.context(repository.lock(id).document()));
  }

  private void refreshProposal(ObjectNode proposal, String id, int generation) {
    ObjectNode observation = observation(id, generation);
    ObjectNode context = context(id);
    ObjectNode evidence =
        contracts
            .object()
            .put("kind", "observedDocument")
            .put("sessionId", id)
            .put("contextId", context.path("contextId").asText())
            .put("documentId", "document-1")
            .put("generation", generation)
            .put("origin", "https://orders.example.test")
            .put("observationHash", GuidedContracts.hash(observation));
    proposal.remove("observationHash");
    proposal
        .put("generation", generation)
        .put("evidenceHash", GuidedContracts.hash(evidence))
        .put("authoredInputsHash", context.path("authoredInputsHash").asText())
        .put("contextRevision", 1);
    proposal.set("executionEvidence", evidence);
    proposal.withObject("/target").put("generation", generation);
  }

  // This PostgreSQL service test supplies a trusted runner preparation at the existing
  // authenticated
  // transport seam; it does not claim browser/DOM or HTTP transport proof (covered by joined ITs).
  private JsonNode admit(Authentication actor, String id, long fence, String key, JsonNode probe) {
    JsonNode session = repository.transaction(() -> repository.lock(id).document().deepCopy());
    if (session.path("counters").path("actions").asInt()
        >= session.path("limits").path("maxActions").asInt()) {
      return refusedAdmission(actor, id, fence, key, probe);
    }
    JsonNode association = planner(id).reserve(id, key, probe);
    JsonNode proposal = association.path("proposal");
    String issuedKey = association.path("admissionKey").asText();
    JsonNode existing = service.existingAdmission(actor, id, fence, issuedKey, proposal);
    if (existing != null) {
      return existing;
    }
    ObjectNode proof = materialization.identity(context(id));
    proof
        .putNull("pressInheritance")
        .put("preparationId", UUID.randomUUID().toString())
        .put("requestDigest", GuidedContracts.hash(proposal))
        .put("evidenceHash", proposal.path("evidenceHash").asText())
        .put("authoredInputsHash", proposal.path("authoredInputsHash").asText())
        .put("expiresAt", clock.now.plusSeconds(20).toString());
    proof.set("target", proofTarget(proposal));
    service.storePreparation(actor, id, fence, proposal, proof);
    return service.admit(
        actor, id, fence, issuedKey, proposal, proof.path("preparationId").asText());
  }

  private JsonNode refusedAdmission(
      Authentication actor, String id, long fence, String key, JsonNode proposal) {
    JsonNode existing = service.existingAdmission(actor, id, fence, key, proposal);
    if (existing != null) {
      return existing;
    }
    ObjectNode proof = materialization.identity(context(id));
    proof
        .putNull("pressInheritance")
        .put("preparationId", UUID.randomUUID().toString())
        .put("requestDigest", GuidedContracts.hash(proposal))
        .put("evidenceHash", proposal.path("evidenceHash").asText())
        .put("authoredInputsHash", proposal.path("authoredInputsHash").asText())
        .put("expiresAt", clock.now.plusSeconds(20).toString());
    proof.set("target", proofTarget(proposal));
    service.storePreparation(actor, id, fence, proposal, proof);
    return service.admit(actor, id, fence, key, proposal, proof.path("preparationId").asText());
  }

  private JsonNode consume(
      Authentication actor, String id, long fence, String key, JsonNode request) {
    GuidedSessionService.Consumption result = service.consume(actor, id, fence, key, request);
    if (result instanceof GuidedSessionService.WonConsumption won) {
      return won.ledger();
    }
    return ((GuidedSessionService.AlreadyConsumed) result).ledger();
  }

  private JsonNode reportOutcome(
      Authentication actor, String id, long fence, String key, JsonNode report) {
    return service.outcomeV2(actor, id, fence, key, report);
  }

  private void stoppedWorker(String id) {
    ObjectNode request =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("kind", "assignment")
            .put("reason", "LEASE_LOST");
    request.set("assignment", assignments.find(id));
    service.assignmentLifecycle(worker, id, "lost-worker", request);
  }

  private String pendingClarification() {
    String id = observing();
    service.observe(worker, id, 1, "observe", observation(id, 1));
    ObjectNode question = fixture("clarification");
    question
        .put("sessionId", id)
        .put("scopeHash", scope(id))
        .put("expiresAt", clock.now.plusSeconds(60).toString());
    askObservedQuestion(id, question);
    return id;
  }

  /** Core question fixture: real plan and committed observation, deliberately no capture. */
  private void askObservedQuestion(String id, JsonNode question) {
    service.translationTransaction(
        controller,
        id,
        1,
        current -> {
          JsonNode document = current.document();
          JsonNode observed = current.progress().path("observation");
          JsonNode coordinate = question.path("coordinate");
          JsonNode step =
              document.path("sourceSteps").get(current.progress().path("stepIndex").asInt());
          long ordinal =
              repository.actions(id).stream()
                  .filter(
                      action ->
                          action
                              .path("coordinate")
                              .path("stepId")
                              .equals(coordinate.path("stepId")))
                  .count();
          if (!clarificationSubject
              || !document.path("state").asText().equals("PROPOSING")
              || !question.path("phase").asText().equals("observed")
              || !question.path("sessionId").equals(document.path("sessionId"))
              || !question.path("scopeHash").equals(document.path("scopeHash"))
              || !question.path("documentId").equals(observed.path("documentId"))
              || !question.path("generation").equals(observed.path("generation"))
              || step == null
              || !step.path("stepId").equals(coordinate.path("stepId"))
              || ordinal != coordinate.path("ordinal").asLong()) {
            throw new AssertionError("clarification current observed coordinate prerequisite");
          }
          var store =
              new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(
                  jdbc, contracts);
          JsonNode plan = store.state(id).path("plan");
          JsonNode obligation = null;
          for (JsonNode item : plan.path("obligations")) {
            if (item.path("stepId").equals(coordinate.path("stepId"))
                && item.path("occurrence").equals(coordinate.path("ordinal"))) {
              if (obligation != null) {
                throw new AssertionError("duplicate clarification obligation");
              }
              obligation = item;
            }
          }
          if (obligation == null) {
            throw new AssertionError("missing real clarification obligation");
          }
          new com.citi.put.checks.studio.guided.translation.GuidedProposalValidator(contracts)
              .remaining(plan, obligation.path("obligationId").asText());
          var meanings = new ObjectMapper().createArrayNode();
          for (JsonNode choice : question.path("choices")) {
            // ADR-SC-007: a choice names one ref of the observation the question is asked on; the
            // fixture's single offered element is e2 ("Order reference"), and it is the only fact
            // with that {role, name, evidence}, so it can be offered.
            String ref = "e2";
            JsonNode fact = observed.path("facts").path(ref);
            if (!fact.isObject()
                || !fact.path("name").equals(choice.path("safeLabel"))
                || !fact.path("role").equals(choice.path("role"))
                || !choice.path("region").isNull()
                || !choice.path("labelSource").asText().equals("PAGE")
                || !choice.path("bindingId").isNull()) {
              throw new AssertionError("clarification committed fact prerequisite");
            }
            var selection =
                com.citi.put.checks.studio.guided.translation.GuidedGates.selectionOf(fact);
            if (!com.citi.put.checks.studio.guided.translation.GuidedGates.matchingRefs(
                    observed.path("facts"), selection)
                .equals(List.of(ref))) {
              throw new AssertionError("clarification unique committed selection prerequisite");
            }
            ObjectNode meaning = contracts.object();
            meaning.set("obligationId", obligation.path("obligationId"));
            meaning.put("ref", ref);
            meaning.set("bindingId", choice.path("bindingId"));
            contracts.validate(
                "v3/replay-validation#/definitions/ObservedQuestionMeaning", meaning);
            ObjectNode mapping = meanings.addObject();
            mapping.set("choiceId", choice.path("choiceId"));
            mapping.set("meaning", meaning);
            mapping
                .putObject("selection")
                .put("role", selection.role())
                .put("name", selection.name())
                .put("evidence", selection.evidence());
          }
          service.translationQuestion(controller, id, 1, "ask", question, meanings);
          return null;
        });
  }

  private ObjectNode clarificationAnswer() {
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("clarificationId", "question-1")
        .put("choiceId", "choice-1")
        .put("generation", 1);
  }

  private ObjectNode fixture(String name) {
    ObjectNode value = documents.path(name).deepCopy();
    value.put("schemaVersion", 3);
    if (name.equals("observation")) {
      value.withObject("/coverage").put("passwordControls", 0);
    }
    if (name.equals("clarification")) {
      value.put("phase", "observed");
    }
    if (name.equals("session")) {
      value.withObject("/scope").remove("accountRef");
      value.remove("authConnection");
      value.set("versions", versions());
    }
    return value;
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

  private ObjectNode claim(String id, String workerId, int fence) {
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("sessionId", id)
        .put("workerId", workerId)
        .put("expectedFence", fence)
        .set("versions", versions());
  }

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
    if (admissionSubject || clarificationSubject) {
      planner(id).bootstrap(id);
    } else {
      service.materialize(controller, id, 1, "materialize", new ObjectMapper().createArrayNode());
    }
    frozenCallbackIdentities.put(id, materialization.identity(context(id)));
    return id;
  }

  private String scope(String id) {
    return repository.transaction(() -> repository.lock(id).document().path("scopeHash").asText());
  }

  private ObjectNode observation(String id, int generation) {
    ObjectNode o = fixture("observation");
    o.put("sessionId", id).put("scopeHash", scope(id)).put("generation", generation);
    if (clarificationSubject) {
      // The clarification fixture offers "Order reference": one more shown element (e2) whose
      // {role, name, evidence} no other fact shares.
      o.put("outline", o.path("outline").asText() + "\n  - textbox \"Order reference\" [e2]");
      ObjectNode fact = o.withObject("/facts").putObject("e2");
      fact.put("role", "textbox")
          .put("name", "Order reference")
          .put("editable", true)
          .put("evidence", "Order reference");
      fact.putArray("evidenceSegments")
          .addObject()
          .put("field", "name")
          .put("start", 0)
          .put("end", 15);
      o.withObject("/projection")
          .put("totalNodes", 3)
          .put("shownNodes", 3)
          .put("outlineBytes", o.path("outline").asText().getBytes(StandardCharsets.UTF_8).length);
    }
    return o;
  }

  private ObjectNode proposal(String id) {
    ObjectNode p = fixture("action");
    p.put("sessionId", id).put("scopeHash", scope(id));
    // This suite tests lifecycle, budgets and immutable admission; a click has no runtime-value
    // producer side effects. Read/binding semantics retain their joined bridge suite coverage.
    p.putObject("operation").put("kind", "click");
    refreshProposal(p, id, 1);
    return p;
  }

  private ObjectNode advance(String id, JsonNode admission) {
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("sessionId", id)
        .put("ownerFence", 1)
        .put("admissionId", admission.path("admission").path("admissionId").asText())
        .put("operationHash", admission.path("operationHash").asText());
  }

  private JsonNode dispatch(String id) {
    service.observe(worker, id, 1, "observe", observation(id, 1));
    JsonNode a = admit(controller, id, 1, "admit", proposal(id));
    return consume(controller, id, 1, "advance", advance(id, a));
  }

  private ObjectNode outcome(JsonNode dispatched) {
    ObjectNode report = dispatched.deepCopy();
    report.put("state", "SUCCEEDED").put("outcomeCode", "OK");
    ObjectNode body =
        frozenCallbackIdentities.get(dispatched.path("sessionId").asText()).deepCopy();
    body.set("ledger", report);
    body.putNull("availability");
    return body;
  }

  private ObjectNode cancel() {
    return contracts.object().put("schemaVersion", 3).put("reason", "userRequested");
  }

  private ObjectNode finalizeRequest(String id) {
    // Publication is driven by current immutable base evidence, never caller-provided hashes.
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("expectedSourceRevision", "1")
        .put("expectedConfigurationRevision", "1");
  }

  private JsonNode publish(String id, String key, JsonNode request) {
    var validator = org.mockito.Mockito.mock(HttpRunnerDispatchClient.class);
    var publisher =
        new GuidedPlanPublisher(
            repository,
            service,
            new GuidedPublicationBaseRepository(jdbc, contracts),
            new GuidedPublicationEvidenceRepository(jdbc, contracts),
            new GuidedPublicationRepository(jdbc, contracts),
            contracts,
            org.mockito.Mockito.mock(ObservedReplayPins.class),
            validator,
            org.mockito.Mockito.mock(DispatchAuthorization.class),
            access,
            new GuidedPublicationProperties(true, 3, 15000, 5000, 8388608),
            new ObservedReplayProperties(true, 30000, 1048576, 4194304, 2097152, "[]", 1280, 720),
            org.mockito.Mockito.mock(
                com.citi.put.checks.studio.guided.publication.PublicationProofLauncher.class),
            clock);
    try {
      return publisher
          .finalizeForUser(
              user, new org.springframework.mock.web.MockHttpServletRequest(), id, key, request)
          .document();
    } finally {
      // No state, successful ledger, caller digest or missing source can invoke validation.
      org.mockito.Mockito.verifyNoInteractions(validator);
    }
  }

  private JsonNode attempt(Callable<JsonNode> action) throws Exception {
    try {
      return action.call();
    } catch (GuidedSessionException e) {
      return contracts.object().put("code", e.getMessage());
    }
  }

  private List<JsonNode> race(Callable<JsonNode> first, Callable<JsonNode> second)
      throws Exception {
    var ready = new CountDownLatch(2);
    var go = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var a =
          pool.submit(
              () -> {
                ready.countDown();
                go.await();
                return first.call();
              });
      var b =
          pool.submit(
              () -> {
                ready.countDown();
                go.await();
                return second.call();
              });
      ready.await();
      go.countDown();
      return List.of(a.get(), b.get());
    }
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

  private final class TestAccess implements GuidedSessionAccess, GuidedSessionService.StepVerifier {
    @Override
    public boolean complete(JsonNode session, JsonNode completion, List<ObjectNode> actions) {
      return true;
    }

    private boolean granted = true, current = true, recoverable = false;

    @Override
    public Snapshot resolve(Authentication principal, JsonNode start) {
      GuidedSessionException.require(granted, "FORBIDDEN_SCOPE", 403);
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
    public void checkSourceCurrent(JsonNode session) {
      GuidedSessionException.require(current, "REVISION_CONFLICT", 409);
    }

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
      return recoverable;
    }

    @Override
    public String authorizeAction(JsonNode session, JsonNode proposal) {
      return "a".repeat(64);
    }
  }

  private static final java.util.Set<String> ADMISSION_SUBJECTS =
      java.util.Set.of(
          "duplicateAdmissionAndConcurrentConsumptionNeverRedispatch",
          "conflictingAdmissionAndUniqueCoordinatesFail",
          "storePreparationRefusesEvidenceMismatchBeforeAdmission",
          "rollbackBeforeDispatchLeavesNoAdmissionAndNoBudgetCharge",
          "takeoverAfterEffectsOrLostAcknowledgmentStopsUnknown",
          "lostAckNeverRetriesAndDelayedCallbackCannotRevive",
          "cancelRevokesUnconsumedAndRetainsUncertainConsumedEvidence",
          "observationBudgetAndGenerationAreSharedAcrossActions",
          "outcomeCannotRewriteAdmissionAndIdenticalDeliveryIsIdempotent",
          "successfulLedgerStillCannotPublishWithoutExactPlanVerifier",
          "actionBudgetAndFalseAssertionReportsFailClosed",
          "liveOwnerRenewalPreservesAdmittedAndDispatchedActions",
          "takeoverCannotReopenFinalizingAfterExecutedEffects",
          "outcomeSaveProofPreservesRealRollbackFreshFenceAndIdempotentWrite");

  private static final UUID SOURCE_TEST = UUID.fromString("00000000-0000-4000-8000-0000000000b1");
  private final Map<String, PlanningPath> planningPaths =
      new java.util.concurrent.ConcurrentHashMap<>();
  private boolean admissionSubject;
  private boolean clarificationSubject;

  private static final java.util.Set<String> CLARIFICATION_SUBJECTS =
      java.util.Set.of(
          "clarificationIsBoundToGenerationChoiceAndOriginalDeadline",
          "acceptedSelectionSurvivesRestartAndKeepsSafeScopedMapping",
          "selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState",
          "clarificationSelectionAndPauseChangeRollBackTogether",
          "renewalAndRecoverableTakeoverPreserveClarificationUntilActualAnswer");

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
                new com.citi.put.checks.studio.guided.translation.GuidedStepVerifier(store),
                new CsiOwnershipEvaluator(),
                com.citi.put.checks.studio.support.TestDomains.FIXTURES,
                org.mockito.Mockito.mock(
                    com.citi.put.checks.studio.dispatch.StudioReferenceResolver.class)));
    org.mockito.Mockito.doAnswer(
            call -> {
              controls.resolve(call.getArgument(0), call.getArgument(1));
              return call.callRealMethod();
            })
        .when(access)
        .resolve(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
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
                String kind = secret != null ? "fill" : stepId.endsWith("a2") ? "assert" : "click";
                var obligation =
                    obligations
                        .addObject()
                        .put("stepId", stepId)
                        .put("occurrence", 0)
                        .put("operationKind", kind)
                        .put("targetIntent", secret == null ? "Order number" : "Password")
                        .putNull("scopeIntent")
                        .putNull("needId");
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
                if (kind.equals("assert")) {
                  obligation.put("predicate", "visible");
                } else {
                  obligation.putNull("predicate");
                }
              }
            } else if (request.kind()
                == com.citi.put.checks.studio.guided.translation.GuidedModelRequest.Kind
                    .NEXT_ACTION) {
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
              var action = contracts.object();
              ObjectNode target = probe.path("target").deepCopy();
              target.remove(List.of("documentId", "generation"));
              action.set("target", target);
              action.set("operation", probe.path("operation").deepCopy());
              response
                  .put("status", "ACTION")
                  .put("obligationId", chosen.path("obligationId").asText())
                  .putNull("question");
              response.set("action", action);
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

  /**
   * The ResolvedTarget the runner reports on a preparation proof (ADR-SC-007): for a node action it
   * is the locator it derived for the picked ref and the {role, name} identity of that element,
   * which the backend cross-checks against the fact the ref names; null for any other target.
   */
  private static JsonNode proofTarget(JsonNode proposal) {
    return proposal.path("target").path("kind").asText().equals("node")
        ? com.citi.put.checks.studio.support.ObservationFixtures.resolvedTarget(
            "order-reference", "text", "Order number")
        : com.fasterxml.jackson.databind.node.NullNode.instance;
  }
}
