package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
  private final GuidedContracts contracts = new GuidedContracts();
  private final MutableClock clock = new MutableClock();
  private final TestAccess access = new TestAccess();
  private GuidedSessionRepository repository;
  private GuidedSessionService service;
  private final Authentication user = user("user-1", "owner");
  private final Authentication worker =
      new GuidedInternalSecurity.Identity("worker-1", "owning-worker");
  private final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");

  @BeforeAll
  static void database() throws Exception {
    POSTGRES.start();
    flyway("29").migrate();
    var ds =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    jdbc = new JdbcTemplate(ds);
    jdbc.execute(
        "CREATE TABLE guided_migration_sentinel(id integer PRIMARY KEY, value text NOT NULL)");
    jdbc.execute("INSERT INTO guided_migration_sentinel VALUES (1,'legacy')");
    flyway("30").migrate();
    flyway("31").migrate();
    fixtures =
        new ObjectMapper()
            .readTree(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/fixtures.json")));
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
  void setup() {
    jdbc.execute(
        "TRUNCATE"
            + " studio_guided_evidence,studio_guided_commands,studio_guided_actions,studio_guided_sessions"
            + " CASCADE");
    repository =
        new GuidedSessionRepository(
            jdbc,
            new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())),
            contracts);
    service =
        new GuidedSessionService(
            repository, contracts, access, new GuidedSessionProperties(true, Map.of()), clock);
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
            // This foundation test stops at V31; OBS-005 tests current fresh install and V32
            // upgrade.
            .target("31")
            .load();
    assertThat(fresh.migrate().migrationsExecuted).isEqualTo(30);
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
    changed.put("accountRef", "other");
    assertThatThrownBy(() -> service.start(user, "not-a-uuid", changed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    GuidedSessionService restarted =
        new GuidedSessionService(
            repository, contracts, access, new GuidedSessionProperties(true, Map.of()), clock);
    assertThat(restarted.start(user, "not-a-uuid", start()).path("sessionId"))
        .isEqualTo(results.getFirst().path("sessionId"));
  }

  @Test
  void concurrentConflictingStartsHaveOneWinner() throws Exception {
    ObjectNode changed = start();
    changed.put("environmentId", "other");
    var results =
        race(
            () -> attempt(() -> service.start(user, "same", start())),
            () -> attempt(() -> service.start(user, "same", changed)));
    assertThat(
            results.stream()
                .filter(n -> n.path("code").asText().equals("IDEMPOTENCY_CONFLICT"))
                .count())
        .isEqualTo(1);
  }

  @Test
  void duplicateAdmissionAndConcurrentConsumptionNeverRedispatch() throws Exception {
    String id = observing();
    JsonNode proposal = proposal(id);
    service.observe(worker, id, 1, "observe", observation(id, 1));
    var admitted =
        race(
            () -> service.admit(controller, id, 1, "admit", proposal),
            () -> service.admit(controller, id, 1, "admit", proposal));
    assertThat(admitted.getFirst()).isEqualTo(admitted.getLast());
    JsonNode advance = advance(id, admitted.getFirst());
    var consumed =
        race(
            () -> service.advance(controller, id, 1, "advance", advance),
            () -> service.advance(controller, id, 1, "advance-2", advance));
    assertThat(consumed).allSatisfy(n -> assertThat(n.path("dispatchCount").asInt()).isEqualTo(1));
    assertThat(repository.actions(id)).hasSize(1);
    assertThat(service.read(user, id, "session").path("counters").path("actions").asInt())
        .isEqualTo(1);
  }

  @Test
  void conflictingAdmissionAndUniqueCoordinatesFail() {
    String id = observing();
    JsonNode proposal = proposal(id);
    service.observe(worker, id, 1, "observe", observation(id, 1));
    service.admit(controller, id, 1, "admit", proposal);
    ObjectNode changed = proposal.deepCopy();
    changed.putObject("operation").put("kind", "hover");
    assertThatThrownBy(() -> service.admit(controller, id, 1, "admit", changed))
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
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      service.admit(controller, id, 1, "admit", proposal(id));
                      throw new IllegalStateException("rollback");
                    }))
        .hasMessage("rollback");
    assertThat(repository.actions(id)).isEmpty();
    assertThat(service.read(user, id, "session").path("counters").path("actions").asInt()).isZero();
    assertThat(service.admit(controller, id, 1, "admit", proposal(id)).path("state").asText())
        .isEqualTo("ADMITTED");
  }

  @Test
  void accessIsolationRechecksPrincipalCsiAccountAndScope() {
    String id = observing();
    assertThatThrownBy(() -> service.read(user("other", "owner"), id, "session"))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(() -> service.read(user("user-1", "viewer"), id, "session"))
        .hasMessage("FORBIDDEN_SCOPE");
    access.granted = false;
    assertThatThrownBy(() -> service.observe(worker, id, 1, "observe", observation(id, 1)))
        .hasMessage("FORBIDDEN_SCOPE");
    access.granted = true;
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
    JsonNode claimed = service.claim(intruder, id, "claim2", claim(id, "worker-other", 1));
    assertThat(claimed.path("owner").path("fence").asInt()).isEqualTo(2);
    assertThat(claimed.path("expiresAt"))
        .isEqualTo(repository.transaction(() -> repository.lock(id).document().path("expiresAt")));
    assertThatThrownBy(() -> service.observe(worker, id, 1, "old", observation(id, 1)))
        .hasMessage("STALE_FENCE");
  }

  @Test
  void takeoverAfterEffectsOrLostAcknowledgmentStopsUnknown() {
    String id = observing();
    JsonNode dispatched = dispatch(id);
    clock.now = clock.now.plusSeconds(31);
    JsonNode claimed =
        service.claim(
            new GuidedInternalSecurity.Identity("worker-other", "owning-worker"),
            id,
            "takeover",
            claim(id, "worker-other", 1));
    assertThat(claimed.path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
    assertThat(repository.actions(id).getFirst().path("state").asText())
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> service.outcome(worker, id, 1, "late", outcome(dispatched)))
        .hasMessage("STALE_FENCE");
  }

  @Test
  void lostAckNeverRetriesAndDelayedCallbackCannotRevive() {
    String id = observing();
    JsonNode dispatched = dispatch(id);
    service.lostAcknowledgment(id);
    assertThatThrownBy(() -> service.advance(controller, id, 1, "retry", advance(id, dispatched)))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> service.outcome(worker, id, 1, "late", outcome(dispatched)))
        .hasMessage("UNKNOWN_OUTCOME");
    JsonNode result = service.read(user, id, "result");
    assertThat(result.path("mode").asText()).isEqualTo("guided");
    assertThat(result.path("replayVerified").asBoolean()).isFalse();
    assertThat(result.path("readyRevisionId").isNull()).isTrue();
  }

  @Test
  void cancelRevokesUnconsumedAndRetainsUncertainConsumedEvidence() {
    String id = observing();
    service.observe(worker, id, 1, "observe", observation(id, 1));
    service.admit(controller, id, 1, "admit", proposal(id));
    service.cancel(user, id, "cancel", cancel());
    assertThat(repository.actions(id).getFirst().path("state").asText()).isEqualTo("REVOKED");
    assertThatThrownBy(
            () ->
                service.advance(
                    controller, id, 1, "advance", advance(id, repository.actions(id).getFirst())))
        .hasMessage("CANCELLED");
    String next = observing();
    JsonNode dispatched = dispatch(next);
    service.cancel(user, next, "cancel", cancel());
    assertThat(repository.actions(next).getFirst().path("state").asText())
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> service.outcome(worker, next, 1, "late", outcome(dispatched)))
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
        new GuidedSessionService(
            repository,
            contracts,
            access,
            new GuidedSessionProperties(
                true,
                Map.of(
                    "maxModelInputTokensTotal",
                    10,
                    "maxModelOutputTokensTotal",
                    10,
                    "maxModelProposals",
                    2)),
            clock);
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
    service =
        new GuidedSessionService(
            repository,
            contracts,
            access,
            new GuidedSessionProperties(true, Map.of("maxObservations", 1)),
            clock);
    String id = observing();
    JsonNode dispatched = dispatch(id);
    service.outcome(worker, id, 1, "result", outcome(dispatched));
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
    assertThatThrownBy(() -> service.outcome(worker, id, 1, "tamper", changed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    JsonNode result = service.outcome(worker, id, 1, "result", report);
    contracts.validate("session", result);
    assertThat(service.outcome(worker, id, 1, "result", report)).isEqualTo(result);
    assertThat(service.outcome(worker, id, 1, "different-delivery", report).path("state").asText())
        .isEqualTo("OBSERVING");
  }

  @Test
  void noStateCanPublishWithoutExactVerifier() {
    String id = observing();
    ObjectNode request = finalizeRequest(id);
    assertThatThrownBy(() -> service.finalizeSession(controller, id, 1, "finalize", request))
        .hasMessage("PUBLICATION_CONFLICT");
    service.cancel(user, id, "cancel", cancel());
    assertThatThrownBy(() -> service.finalizeSession(controller, id, 1, "again", request))
        .hasMessage("CANCELLED");
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
    access.connected = false;
    assertThatThrownBy(() -> service.start(user, "another", start()))
        .hasMessage("AUTH_CONNECTION_REQUIRED");
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
    service.clarification(controller, id, 1, "ask", question);
    ObjectNode answer =
        contracts
            .object()
            .put("schemaVersion", 1)
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
    service.outcome(worker, id, 1, "outcome1", outcome(dispatch(id)));
    service.completeStep(controller, id, 1, "step1", contracts.object().put("stepId", "step-1"));
    ObjectNode observation = observation(id, 2);
    service.observe(worker, id, 1, "observation2", observation);
    ObjectNode action = proposal(id);
    action.put("generation", 2).put("observationHash", GuidedContracts.hash(observation));
    action.withObject("/target").put("generation", 2);
    action.withObject("/coordinate").put("stepId", "step-2");
    action
        .putObject("operation")
        .put("kind", "assert")
        .put("predicate", "visible")
        .putNull("expected");
    JsonNode admitted = service.admit(controller, id, 1, "admit2", action);
    JsonNode dispatched = service.advance(controller, id, 1, "advance2", advance(id, admitted));
    ObjectNode report = outcome(dispatched);
    assertThatThrownBy(() -> service.outcome(worker, id, 1, "outcome2", report))
        .hasMessage("INVALID_CONTRACT");
    report.withObject("/ledger").put("assertionPassed", true);
    service.outcome(worker, id, 1, "outcome2", report);
    assertThat(
            service
                .completeStep(
                    controller, id, 1, "step2", contracts.object().put("stepId", "step-2"))
                .path("state")
                .asText())
        .isEqualTo("FINALIZING");
    assertThatThrownBy(
            () -> service.finalizeSession(controller, id, 1, "finalize", finalizeRequest(id)))
        .hasMessage("RUNTIME_INCOMPATIBLE");
    assertThat(service.read(user, id, "session").path("state").asText()).isEqualTo("FINALIZING");
    assertThat(
            service
                .claim(worker, id, "renew-finalizing", claim(id, "worker-1", 1))
                .path("state")
                .asText())
        .isEqualTo("FINALIZING");

    access.current = false;
    assertThat(
            service
                .finalizeSession(controller, id, 1, "source-conflict", finalizeRequest(id))
                .path("outcome")
                .asText())
        .isEqualTo("PUBLICATION_CONFLICT");
    assertThat(service.read(user, id, "result").path("readyRevisionId").isNull()).isTrue();

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_sessions WHERE finalization_identity IS NOT"
                    + " NULL",
                Integer.class))
        .isZero();
  }

  @Test
  void actionBudgetAndFalseAssertionReportsFailClosed() {
    service =
        new GuidedSessionService(
            repository,
            contracts,
            access,
            new GuidedSessionProperties(true, Map.of("maxActions", 1)),
            clock);
    String id = observing();
    JsonNode dispatched = dispatch(id);
    ObjectNode dishonest = outcome(dispatched);
    dishonest.withObject("/ledger").put("assertionPassed", true);
    assertThatThrownBy(() -> service.outcome(worker, id, 1, "dishonest", dishonest))
        .hasMessage("INVALID_CONTRACT");
    service.outcome(worker, id, 1, "outcome", outcome(dispatched));
    ObjectNode observed = observation(id, 2);
    service.observe(worker, id, 1, "observation2", observed);
    ObjectNode next = proposal(id);
    next.put("generation", 2).put("observationHash", GuidedContracts.hash(observed));
    next.withObject("/target").put("generation", 2);
    next.withObject("/coordinate").put("ordinal", 1);
    assertThatThrownBy(() -> service.admit(controller, id, 1, "admit2", next))
        .hasMessage("BUDGET_EXCEEDED");
  }

  @Test
  void gatewayOverrunIsDurablyChargedAndStopsFurtherWork() {
    service =
        new GuidedSessionService(
            repository,
            contracts,
            access,
            new GuidedSessionProperties(true, Map.of("maxModelInputTokensTotal", 10)),
            clock);
    String id = observing();
    service.reserveModel(controller, id, 1, "reserve", 8, 8);
    service.settleModel(controller, id, 1, "settle", "reserve", 11, 8);
    JsonNode result = service.read(user, id, "result");
    assertThat(result.path("outcome").asText()).isEqualTo("FAILED");
    assertThat(result.path("errorCode").asText()).isEqualTo("BUDGET_EXCEEDED");
    assertThat(service.read(user, id, "session").path("counters").path("modelInputTokens").asInt())
        .isEqualTo(11);
    assertThatThrownBy(
            () -> service.finalizeSession(controller, id, 1, "finalize", finalizeRequest(id)))
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
    assertThat(result.path("evidenceRef").asText()).isEqualTo("evidence-store-1");
    assertThat(result.path("replayVerified").asBoolean()).isFalse();
  }

  @Test
  void acceptedSelectionSurvivesRestartAndKeepsSafeScopedMapping() {
    String id = pendingClarification();
    ObjectNode answer = clarificationAnswer();
    service.clarify(user, id, "answer", answer);
    JsonNode stored = service.clarificationSelection(controller, id, 1, "question-1");
    assertThat(stored.path("choiceId").asText()).isEqualTo("choice-1");
    assertThat(stored.path("nodeId").asText()).isEqualTo("node-1");
    assertThat(stored.path("bindingId").isNull()).isTrue();
    assertThat(stored.path("scopeHash").asText()).isEqualTo(scope(id));
    assertThat(stored.path("sourceRevision").asText()).isEqualTo("source-1");
    assertThat(stored.path("configurationRevision").asText()).isEqualTo("config-1");
    assertThat(stored.path("coordinate")).isEqualTo(fixture("clarification").path("coordinate"));
    assertThat(stored.path("documentId").asText()).isEqualTo("document-1");
    assertThat(stored.path("generation").asInt()).isEqualTo(1);
    assertThat(stored.toString()).doesNotContain("safeLabel", "Order reference", "value");
    service =
        new GuidedSessionService(
            repository, contracts, access, new GuidedSessionProperties(true, Map.of()), clock);
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
    access.granted = false;
    assertThatThrownBy(() -> service.clarificationSelection(controller, id, 1, "question-1"))
        .hasMessage("FORBIDDEN_SCOPE");
    access.granted = true;
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
    JsonNode acquired = service.claim(nextOwner, id, "takeover", claim(id, "worker-next", 1));
    assertThat(acquired.path("state").asText()).isEqualTo("AWAITING_CLARIFICATION");
    assertThat(acquired.path("owner").path("fence").asInt()).isEqualTo(2);
    assertThatThrownBy(() -> service.observe(nextOwner, id, 2, "bypass2", observation(id, 2)))
        .hasMessage("STALE_GENERATION");
    service.clarify(user, id, "answer", clarificationAnswer());
    assertThat(
            service
                .clarificationSelection(controller, id, 2, "question-1")
                .path("choiceId")
                .asText())
        .isEqualTo("choice-1");
    assertThatThrownBy(() -> service.observe(worker, id, 1, "stale-owner", observation(id, 2)))
        .hasMessage("STALE_FENCE");
    service.observe(nextOwner, id, 2, "fresh", observation(id, 2));
  }

  @Test
  void protectedAuthAndFinalizingStatesSurviveRenewalAndUndispatchedRecovery() {
    for (String state : List.of("AWAITING_AUTH", "FINALIZING")) {
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
      JsonNode acquired = service.claim(nextOwner, id, "recover", claim(id, "next-owner", 1));
      assertThat(acquired.path("state").asText()).isEqualTo(state);
      assertThat(acquired.path("owner").path("fence").asInt()).isEqualTo(2);
      assertThatThrownBy(() -> service.observe(nextOwner, id, 2, "bypass", observation(id, 1)))
          .hasMessage("STALE_GENERATION");
    }
  }

  @Test
  void liveOwnerRenewalPreservesAdmittedAndDispatchedActions() {
    String id = observing();
    service.observe(worker, id, 1, "observe", observation(id, 1));
    JsonNode admitted = service.admit(controller, id, 1, "admit", proposal(id));
    JsonNode renewed = service.claim(worker, id, "renew", claim(id, "worker-1", 1));
    assertThat(renewed.path("state").asText()).isEqualTo("ACTING");
    assertThat(repository.actions(id).getFirst().path("state").asText()).isEqualTo("ADMITTED");
    JsonNode dispatched = service.advance(controller, id, 1, "advance", advance(id, admitted));
    service.claim(worker, id, "renew2", claim(id, "worker-1", 1));
    assertThat(repository.actions(id).getFirst().path("state").asText()).isEqualTo("DISPATCHING");
    service.outcome(worker, id, 1, "outcome", outcome(dispatched));
    assertThat(repository.actions(id).getFirst().path("dispatchCount").asInt()).isEqualTo(1);
  }

  @Test
  void takeoverCannotReopenFinalizingAfterExecutedEffects() {
    String id = observing();
    service.outcome(worker, id, 1, "outcome", outcome(dispatch(id)));
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
    assertThat(
            service
                .claim(nextOwner, id, "takeover", claim(id, "next-owner", 1))
                .path("state")
                .asText())
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> service.observe(nextOwner, id, 2, "bypass", observation(id, 2)))
        .isInstanceOf(GuidedSessionException.class);
  }

  private String pendingClarification() {
    String id = observing();
    service.observe(worker, id, 1, "observe", observation(id, 1));
    ObjectNode question = fixture("clarification");
    question
        .put("sessionId", id)
        .put("scopeHash", scope(id))
        .put("expiresAt", clock.now.plusSeconds(60).toString());
    service.clarification(controller, id, 1, "ask", question);
    return id;
  }

  private ObjectNode clarificationAnswer() {
    return contracts
        .object()
        .put("schemaVersion", 1)
        .put("clarificationId", "question-1")
        .put("choiceId", "choice-1")
        .put("generation", 1);
  }

  private ObjectNode fixture(String name) {
    return fixtures.path("documents").path(name).deepCopy();
  }

  private ObjectNode start() {
    return contracts
        .object()
        .put("schemaVersion", 1)
        .put("testId", "test-1")
        .put("sourceRevision", "source-1")
        .put("configurationRevision", "config-1")
        .put("environmentId", "fixture")
        .put("applicationId", "orders")
        .put("accountRef", "account-1");
  }

  private ObjectNode claim(String id, String workerId, int fence) {
    return contracts
        .object()
        .put("schemaVersion", 1)
        .put("sessionId", id)
        .put("workerId", workerId)
        .put("expectedFence", fence);
  }

  private String observing() {
    String id =
        service.start(user, UUID.randomUUID().toString(), start()).path("sessionId").asText();
    service.claim(worker, id, "claim", claim(id, "worker-1", 0));
    return id;
  }

  private String scope(String id) {
    return repository.transaction(() -> repository.lock(id).document().path("scopeHash").asText());
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
    p.put("sessionId", id)
        .put("scopeHash", scope(id))
        .put("observationHash", GuidedContracts.hash(observation(id, 1)));
    return p;
  }

  private ObjectNode advance(String id, JsonNode admission) {
    return contracts
        .object()
        .put("schemaVersion", 1)
        .put("sessionId", id)
        .put("ownerFence", 1)
        .put("admissionId", admission.path("admission").path("admissionId").asText())
        .put("operationHash", admission.path("operationHash").asText());
  }

  private JsonNode dispatch(String id) {
    service.observe(worker, id, 1, "observe", observation(id, 1));
    JsonNode a = service.admit(controller, id, 1, "admit", proposal(id));
    return service.advance(controller, id, 1, "advance", advance(id, a));
  }

  private ObjectNode outcome(JsonNode dispatched) {
    ObjectNode report = dispatched.deepCopy();
    report.put("state", "SUCCEEDED").put("outcomeCode", "OK");
    ObjectNode body = contracts.object().put("schemaVersion", 1);
    body.set("ledger", report);
    return body;
  }

  private ObjectNode cancel() {
    return contracts.object().put("schemaVersion", 1).put("reason", "userRequested");
  }

  private ObjectNode finalizeRequest(String id) {
    return contracts
        .object()
        .put("schemaVersion", 1)
        .put("sessionId", id)
        .put("ownerFence", 1)
        .put("expectedSourceRevision", "source-1")
        .put("expectedConfigurationRevision", "config-1")
        .put("learnedPlanHash", "0".repeat(64))
        .put("artifactHash", "0".repeat(64))
        .put("admissionProvenanceHash", "0".repeat(64));
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

    private boolean granted = true, current = true, connected = true, recoverable = false;

    @Override
    public Snapshot resolve(Authentication principal, JsonNode start) {
      ObjectNode session = fixture("session"), scope = (ObjectNode) session.path("scope");
      for (String field : List.of("environmentId", "applicationId", "accountRef")) {
        scope.set(field, start.path(field));
      }
      ObjectNode connection = (ObjectNode) session.path("authConnection");
      if (!connected) {
        connection.put("mode", "unavailable").putNull("connectionId");
      }
      return new Snapshot(scope, session.path("sourceSteps"), connection);
    }

    @Override
    public void checkCurrent(JsonNode session) {
      GuidedSessionException.require(granted, "FORBIDDEN_SCOPE", 403);
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
}
