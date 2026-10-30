package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationBaseRepository;
import com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-UNIFY-001.6 AC-09: the read of the caller's latest terminal learning attempt per test,
 * through the Spring beans (and one HTTP case) against PostgreSQL and the Flyway head. Every answer
 * is validated against the closed {@code latest-attempts} schema.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class GuidedLatestAttemptIT {

  @DynamicPropertySource
  static void configuration(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    // The reaper would expire the seeded live sessions under the test.
    registry.add("studio.guided-authoring.reaper-delay-ms", () -> "3600000");
  }

  private static final String CSI_ID = "60491";
  private static final String OTHER_CSI_ID = "60492";
  private static final String OWNER = "latest-owner@citi.com";
  private static final String TEAMMATE = "latest-teammate@citi.com";
  private static final String SECRET_VALUE = "Canary-s3cr3t-value-7c2d41aa";
  private static final String SECRET_INPUT = "login-password-input";
  private static final GuidedContracts C = new GuidedContracts();
  private static final Instant BASE = Instant.parse("2026-10-20T10:00:00Z");

  @Autowired private JdbcTemplate jdbc;
  @Autowired private TransactionTemplate transactions;
  @Autowired private GuidedSessionService sessions;
  @Autowired private GuidedLatestAttemptReader reader;
  @Autowired private MockMvc mvc;
  @Autowired private ObjectMapper json;

  private StudioExecutionFixtures fixtures;
  private ObservedPublicationFixture observed;
  private Authentication owner;
  private Authentication teammate;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    observed = new ObservedPublicationFixture(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(TEAMMATE);
    fixtures.seedCsi(CSI_ID, OWNER);
    fixtures.seedCsi(OTHER_CSI_ID, OWNER);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    teammate = StudioExecutionFixtures.identity(TEAMMATE, CSI_ID, "owner");
  }

  // ── what is returned ─────────────────────────────────────────────────────

  @Test
  void aTestWithNoSessionAndAnUnknownIdGiveAnEmptyAnswer() {
    UUID untouched = fixtures.seedTest("No session", CSI_ID, OWNER, List.of("Go home"));

    JsonNode body = read(owner, untouched, UUID.randomUUID());

    assertThat(body.path("schemaVersion").asInt()).isEqualTo(3);
    assertThat(body.path("attempts")).isEmpty();
  }

  @Test
  void aLiveSessionNeverAppearsUntilItIsTerminal() {
    Seeded seeded = seed("Live then failed", "Go home", "Press continue");
    for (String live :
        List.of(
            "PREPARING",
            "OBSERVING",
            "PROPOSING",
            "ACTING",
            "AWAITING_CLARIFICATION",
            "FINALIZING")) {
      state(seeded.sessionId(), live);
      assertThat(read(owner, seeded.testId()).path("attempts")).as(live).isEmpty();
    }

    state(seeded.sessionId(), "FAILED");
    setCreatedAt(seeded.sessionId(), BASE);
    assertThat(read(owner, seeded.testId()).path("attempts")).hasSize(1);

    // A newer live session does not hide the last finished attempt; it is simply not an attempt.
    String relearn = "latest-live-" + UUID.randomUUID();
    cloneSession(seeded.sessionId(), relearn, "OBSERVING", BASE.plusSeconds(60), OWNER, false);
    JsonNode attempts = read(owner, seeded.testId()).path("attempts");
    assertThat(attempts).hasSize(1);
    assertThat(attempts.get(0).path("sessionId").asText()).isEqualTo(seeded.sessionId());
  }

  @Test
  void aFailedAttemptCarriesItsStateStartErrorCodeAndTheStoppedStep() {
    Seeded seeded = seedWithActions("Failed learn", "Go home", "Press continue");
    String id = seeded.sessionId();
    // Step 1 verified; the run then stopped on step 2 (its action failed).
    String stepTwo = stepIds(id).get(1);
    replicaUpdate(
        "UPDATE studio_guided_actions SET document = document || jsonb_build_object("
            + "'state','FAILED','outcomeCode','TARGET_CHANGED') WHERE session_id=? AND step_id=?",
        id,
        stepTwo);
    state(id, "FAILED");
    progress(id, "{\"errorCode\":\"BUDGET_EXCEEDED\",\"stepIndex\":1}");

    JsonNode attempt = read(owner, seeded.testId()).path("attempts").get(0);

    assertThat(attempt.path("testId").asText()).isEqualTo(seeded.testId().toString());
    assertThat(attempt.path("sessionId").asText()).isEqualTo(id);
    assertThat(attempt.path("state").asText()).isEqualTo("FAILED");
    assertThat(attempt.path("errorCode").asText()).isEqualTo("BUDGET_EXCEEDED");
    assertThat(attempt.path("startedAt").asText())
        .as("the session document's createdAt, the only time stored")
        .isEqualTo(
            jdbc.queryForObject(
                "SELECT document->>'createdAt' FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id));
    JsonNode steps = attempt.path("explanation").path("steps");
    assertThat(steps).hasSize(2);
    assertThat(steps.get(0).path("completed").asBoolean()).isTrue();
    assertThat(steps.get(1).path("completed").asBoolean())
        .as("the unfinished step the page reads as 'stopped at step 2'")
        .isFalse();
    assertThat(steps.get(1).path("actions").get(0).path("outcome").asText()).isEqualTo("FAILED");
    assertThat(attempt.path("explanation"))
        .as("the one public explanation, as the result serves it")
        .isEqualTo(sessions.read(owner, id, "result").path("explanation"));
  }

  @Test
  void everyOtherTerminalStateIsReportedWithoutAnExplanation() {
    for (String terminal :
        List.of("SUCCEEDED", "PUBLICATION_CONFLICT", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED")) {
      Seeded seeded = seed("Terminal " + terminal, "Go home");
      state(seeded.sessionId(), terminal);

      JsonNode attempt = read(owner, seeded.testId()).path("attempts").get(0);

      assertThat(attempt.path("state").asText()).isEqualTo(terminal);
      assertThat(attempt.path("errorCode").isNull()).as(terminal).isTrue();
      assertThat(attempt.path("explanation").isNull()).as(terminal).isTrue();
    }
  }

  @Test
  void theLatestAttemptWinsAndASuccessLaterHidesTheOlderFailure() {
    Seeded seeded = seedWithActions("Latest wins", "Go home", "Press continue");
    String failed = seeded.sessionId();
    state(failed, "FAILED");
    setCreatedAt(failed, BASE);
    String succeeded = "latest-ok-" + UUID.randomUUID();
    cloneSession(failed, succeeded, "SUCCEEDED", BASE.plusSeconds(3600), OWNER, false);

    JsonNode later = read(owner, seeded.testId()).path("attempts");
    assertThat(later).hasSize(1);
    assertThat(later.get(0).path("sessionId").asText()).isEqualTo(succeeded);
    assertThat(later.get(0).path("state").asText()).isEqualTo("SUCCEEDED");
    assertThat(later.get(0).path("explanation").isNull()).isTrue();

    // A newer failure after that success is what the page must show again.
    setCreatedAt(failed, BASE.plusSeconds(7200));
    JsonNode again = read(owner, seeded.testId()).path("attempts");
    assertThat(again).hasSize(1);
    assertThat(again.get(0).path("sessionId").asText()).isEqualTo(failed);
    assertThat(again.get(0).path("state").asText()).isEqualTo("FAILED");
    assertThat(again.get(0).path("explanation").isObject()).isTrue();
  }

  @Test
  void twoTestsInOneCallKeepTheRequestOrderAndASessionlessTestIsOmitted() {
    Seeded first = seed("Two A", "Go home");
    Seeded second = seedWithActions("Two B", "Go home", "Press continue");
    UUID none = fixtures.seedTest("Two none", CSI_ID, OWNER, List.of("Go home"));
    state(first.sessionId(), "SUCCEEDED");
    state(second.sessionId(), "FAILED");

    JsonNode attempts = read(owner, second.testId(), none, first.testId(), second.testId());

    assertThat(attempts.path("attempts")).hasSize(2);
    assertThat(attempts.path("attempts").get(0).path("testId").asText())
        .isEqualTo(second.testId().toString());
    assertThat(attempts.path("attempts").get(0).path("state").asText()).isEqualTo("FAILED");
    assertThat(attempts.path("attempts").get(1).path("testId").asText())
        .isEqualTo(first.testId().toString());
    assertThat(attempts.path("attempts").get(1).path("state").asText()).isEqualTo("SUCCEEDED");
  }

  // ── who and what is omitted ──────────────────────────────────────────────

  @Test
  void anotherPrincipalsSessionIsOmittedAndNeverHidesTheCallersOwn() {
    Seeded seeded = seedWithActions("Principals", "Go home", "Press continue");
    state(seeded.sessionId(), "FAILED");
    setCreatedAt(seeded.sessionId(), BASE);

    assertThat(read(teammate, seeded.testId()).path("attempts"))
        .as("a teammate who can read the test sees none of the owner's attempts")
        .isEmpty();

    String theirs = "latest-theirs-" + UUID.randomUUID();
    cloneSession(seeded.sessionId(), theirs, "SUCCEEDED", BASE.plusSeconds(60), TEAMMATE, false);
    JsonNode mine = read(owner, seeded.testId()).path("attempts");
    assertThat(mine).hasSize(1);
    assertThat(mine.get(0).path("sessionId").asText()).isEqualTo(seeded.sessionId());
    JsonNode theirsOnly = read(teammate, seeded.testId()).path("attempts");
    assertThat(theirsOnly).hasSize(1);
    assertThat(theirsOnly.get(0).path("sessionId").asText()).isEqualTo(theirs);
  }

  @Test
  void aPrunedSessionIsOmittedAndTheOlderUnprunedOneStandsInForIt() {
    Seeded seeded = seedWithActions("Pruned", "Go home", "Press continue");
    state(seeded.sessionId(), "FAILED");
    setCreatedAt(seeded.sessionId(), BASE);
    String pruned = "latest-pruned-" + UUID.randomUUID();
    cloneSession(seeded.sessionId(), pruned, "SUCCEEDED", BASE.plusSeconds(60), OWNER, true);

    JsonNode attempts = read(owner, seeded.testId()).path("attempts");
    assertThat(attempts).hasSize(1);
    assertThat(attempts.get(0).path("sessionId").asText()).isEqualTo(seeded.sessionId());

    replicaUpdate(
        "UPDATE studio_guided_sessions SET pruned_at=now() WHERE session_id=?", seeded.sessionId());
    assertThat(read(owner, seeded.testId()).path("attempts")).isEmpty();
  }

  @Test
  void aTestTheCallerCannotReadIsOmittedWithoutARefusal() throws Exception {
    Seeded seeded = seed("Unreadable", "Go home");
    state(seeded.sessionId(), "SUCCEEDED");

    assertThat(
            read(StudioExecutionFixtures.identity(OWNER, OTHER_CSI_ID, "owner"), seeded.testId())
                .path("attempts"))
        .as("owner of another CSI")
        .isEmpty();
    assertThat(read(StudioExecutionFixtures.admin(OWNER), seeded.testId()).path("attempts"))
        .as("an administrator reads everywhere, still only their own sessions")
        .hasSize(1);

    mvc.perform(
            get("/api/v1/studio/guided-sessions/latest")
                .queryParam("testId", seeded.testId().toString())
                .header("X-User-Id", OWNER)
                .header("X-User-Email", OWNER)
                .header("X-User-Roles", "viewer")
                .header("X-User-Csi-Ownership", OTHER_CSI_ID + ":viewer"))
        .andExpect(status().isOk())
        .andExpect(
            org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.attempts")
                .isEmpty());
  }

  @Test
  void aDeletedAQuarantinedAndAnUnknownTestAreOmitted() {
    Seeded deleted = seed("Deleted", "Go home");
    Seeded quarantined = seed("Quarantined", "Go home");
    Seeded visible = seed("Visible", "Go home");
    for (Seeded seeded : List.of(deleted, quarantined, visible)) {
      state(seeded.sessionId(), "SUCCEEDED");
    }
    assertThat(
            read(owner, deleted.testId(), quarantined.testId(), visible.testId()).path("attempts"))
        .as("control: all three are answered while visible")
        .hasSize(3);

    jdbc.update("UPDATE ui_tests SET deleted_at = now() WHERE id=?", deleted.testId());
    jdbc.update("UPDATE ui_tests SET quarantined_at = now() WHERE id=?", quarantined.testId());

    JsonNode attempts =
        read(owner, deleted.testId(), quarantined.testId(), UUID.randomUUID(), visible.testId())
            .path("attempts");
    assertThat(attempts).hasSize(1);
    assertThat(attempts.get(0).path("testId").asText()).isEqualTo(visible.testId().toString());
  }

  /** A quarantined test has no CSI at all (V12): nothing to authorize against, so no answer. */
  @Test
  void aQuarantinedTestWithNoCsiIsOmittedForEveryCaller() {
    Seeded donor = seed("Donor", "Go home");
    UUID orphan = fixtures.seedTest("Orphan " + UUID.randomUUID(), CSI_ID, OWNER, List.of("Go"));
    jdbc.update("UPDATE ui_tests SET quarantined_at = now(), csi_id = NULL WHERE id=?", orphan);
    String session = "latest-orphan-" + UUID.randomUUID();
    replicaUpdate(
        "INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,"
            + "expires_at,document,progress) SELECT ?,?,principal_id,scope_hash,'SUCCEEDED',"
            + "expires_at,jsonb_set(jsonb_set(jsonb_set(document,'{sessionId}',to_jsonb(?::text)),"
            + "'{testId}',to_jsonb(?::text)),'{state}','\"SUCCEEDED\"'::jsonb),progress"
            + " FROM studio_guided_sessions WHERE session_id=?",
        session,
        orphan.toString(),
        session,
        orphan.toString(),
        donor.sessionId());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_sessions WHERE test_id=? AND principal_id=?",
                Integer.class,
                orphan.toString(),
                OWNER))
        .as("control: the owner has a terminal session on it")
        .isEqualTo(1);

    assertThat(read(owner, orphan).path("attempts")).isEmpty();
    assertThat(read(StudioExecutionFixtures.admin(OWNER), orphan).path("attempts")).isEmpty();
  }

  @Test
  void aSessionWhoseExplanationCannotBeProjectedIsOmittedAndNeverFailsTheOthers() {
    Seeded good = seedWithActions("Projectable", "Go home", "Press continue");
    Seeded broken = seed("Unprojectable", "Go home");
    state(good.sessionId(), "FAILED");
    state(broken.sessionId(), "FAILED");
    replicaUpdate(
        "UPDATE studio_guided_sessions SET document = jsonb_set(document,"
            + "'{scope,sourceRevision}','\"not-decimal\"'::jsonb) WHERE session_id=?",
        broken.sessionId());

    JsonNode attempts = read(owner, broken.testId(), good.testId()).path("attempts");

    assertThat(attempts).hasSize(1);
    assertThat(attempts.get(0).path("testId").asText()).isEqualTo(good.testId().toString());
  }

  @Test
  void aCallerThatIsNotAPlatformUserIsRefused() {
    assertThatThrownBy(
            () -> reader.read(new TestingAuthenticationToken("x", "y", "ROLE_USER"), List.of()))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refused -> {
              assertThat(refused.getMessage()).isEqualTo("FORBIDDEN_SCOPE");
              assertThat(refused.status()).isEqualTo(403);
            });
    assertThatThrownBy(() -> reader.read(null, List.of()))
        .isInstanceOf(GuidedSessionException.class);
  }

  // ── no leak, no write, no lock ───────────────────────────────────────────

  @Test
  void aPlantedSecretValueNeverReachesTheAnswer() {
    Seeded seeded = seedWithActions("Canary", "Go home", "Press continue");
    String id = seeded.sessionId();
    String stepTwo = stepIds(id).get(1);
    replicaUpdate(
        "UPDATE studio_guided_actions SET proposal = jsonb_set(proposal,'{operation}',"
            + "jsonb_build_object('kind','fill','value',jsonb_build_object('kind','secretRef',"
            + "'sourceInputId',?::text,'secretValue',?::text))) || jsonb_build_object("
            + "'target',jsonb_build_object('kind','page','documentId',?::text,'generation',0,"
            + "'locator',jsonb_build_object('kind','label','value',?::text,'exact',true))),"
            + " document = document || jsonb_build_object('plantedEvidence',?::text)"
            + " WHERE session_id=? AND step_id=?",
        SECRET_INPUT,
        SECRET_VALUE,
        SECRET_VALUE,
        SECRET_VALUE,
        SECRET_VALUE,
        id,
        stepTwo);
    replicaUpdate(
        "UPDATE studio_guided_sessions SET progress = progress || jsonb_build_object("
            + "'observation',jsonb_build_object('text',?::text)),"
            + " document = document || jsonb_build_object('plantedEvidence',?::text)"
            + " WHERE session_id=?",
        SECRET_VALUE,
        SECRET_VALUE,
        id);
    state(id, "FAILED");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND"
                    + " proposal::text LIKE '%' || ? || '%'",
                Integer.class, id, SECRET_VALUE))
        .as("control: the canary is really in the proposal the explanation reads")
        .isPositive();

    JsonNode body = read(owner, seeded.testId());

    assertThat(body.path("attempts")).hasSize(1);
    assertThat(body.toString())
        .doesNotContain(SECRET_VALUE)
        .doesNotContain("secretValue")
        .doesNotContain("plantedEvidence")
        .doesNotContain("observation");
    JsonNode action = body.path("attempts").get(0).path("explanation").path("steps").get(1);
    assertThat(action.path("actions").get(0).path("referenceIds").toString())
        .as("the declared reference id may be named, the value may not")
        .contains(SECRET_INPUT);
  }

  @Test
  void theReadIsNotBlockedByTheRowLockOfALiveWriterAndWritesNothing() throws Exception {
    Seeded seeded = seed("No lock", "Go home");
    state(seeded.sessionId(), "FAILED");
    String before = fingerprint(seeded.sessionId());
    var repository = new GuidedSessionRepository(jdbc, transactions, C);

    JsonNode body =
        transactions.execute(
            status -> {
              repository.lock(seeded.sessionId());
              // A writer holds FOR UPDATE on the very row; the read runs on another connection.
              return CompletableFuture.supplyAsync(() -> read(owner, seeded.testId()))
                  .orTimeout(20, TimeUnit.SECONDS)
                  .join();
            });

    assertThat(body.path("attempts")).hasSize(1);
    assertThat(fingerprint(seeded.sessionId())).isEqualTo(before);
  }

  // ── over HTTP ────────────────────────────────────────────────────────────

  @Test
  void overHttpTheLiteralRouteAnswersAndTheCallerIsTheBffUser() throws Exception {
    Seeded seeded = seedWithActions("Http", "Go home", "Press continue");
    state(seeded.sessionId(), "FAILED");
    progress(seeded.sessionId(), "{\"errorCode\":\"BUDGET_EXCEEDED\"}");

    String answer =
        mvc.perform(
                get("/api/v1/studio/guided-sessions/latest")
                    .queryParam("testId", seeded.testId().toString(), UUID.randomUUID().toString())
                    .header("X-User-Id", OWNER)
                    .header("X-User-Email", OWNER)
                    .header("X-User-Roles", "viewer")
                    .header("X-User-Csi-Ownership", CSI_ID + ":viewer"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();

    JsonNode body = json.readTree(answer);
    C.validate("v3/latest-attempts", body);
    assertThat(body.path("attempts")).hasSize(1);
    assertThat(body.path("attempts").get(0).path("sessionId").asText())
        .isEqualTo(seeded.sessionId());
    assertThat(body.path("attempts").get(0).path("errorCode").asText())
        .isEqualTo("BUDGET_EXCEEDED");
    assertThat(body.path("attempts").get(0).fieldNames())
        .toIterable()
        .containsExactlyInAnyOrder(
            "testId", "sessionId", "state", "startedAt", "errorCode", "explanation");

    mvc.perform(
            get("/api/v1/studio/guided-sessions/latest")
                .queryParam("testId", "not-a-uuid")
                .header("X-User-Id", OWNER))
        .andExpect(status().isBadRequest());
  }

  // ── seeding and reads ────────────────────────────────────────────────────

  private record Seeded(UUID testId, String sessionId) {}

  /** A PREPARING session over a fresh draft of the owner, as a real start leaves it. */
  private Seeded seed(String name, String... steps) {
    UUID testId = fixtures.seedTest(name + " " + UUID.randomUUID(), CSI_ID, OWNER, List.of(steps));
    return new Seeded(testId, observed.learnWithoutPublishing(testId));
  }

  /** A session whose actions the evidence fixture recorded: every step reads as completed. */
  private Seeded seedWithActions(String name, String... steps) {
    UUID testId = fixtures.seedTest(name + " " + UUID.randomUUID(), CSI_ID, OWNER, List.of(steps));
    String id = observed.learnWithoutPublishing(testId);
    var repository = new GuidedSessionRepository(jdbc, transactions, C);
    transactions.executeWithoutResult(
        status -> {
          var current = repository.lock(id);
          current.document().put("state", "OBSERVING");
          current
              .document()
              .putObject("owner")
              .put("workerId", "fixture-worker")
              .put("fence", 1)
              .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
          repository.save(current);
        });
    var base = new GuidedPublicationBaseRepository(jdbc, C).find(id).orElseThrow();
    GuidedPublicationEvidenceFixture.completeExistingSession(jdbc, transactions, id, base);
    return new Seeded(testId, id);
  }

  private JsonNode read(Authentication caller, UUID... testIds) {
    return read(caller, List.of(testIds));
  }

  private JsonNode read(Authentication caller, List<UUID> testIds) {
    JsonNode body = reader.read(caller, testIds);
    C.validate("v3/latest-attempts", body);
    return body;
  }

  private void state(String id, String state) {
    replicaUpdate(
        "UPDATE studio_guided_sessions SET state=?, document=jsonb_set(document,'{state}',"
            + "to_jsonb(?::text)) WHERE session_id=?",
        state,
        state,
        id);
  }

  private void progress(String id, String fragment) {
    replicaUpdate(
        "UPDATE studio_guided_sessions SET progress = progress || ?::jsonb WHERE session_id=?",
        fragment,
        id);
  }

  private void setCreatedAt(String id, Instant createdAt) {
    replicaUpdate(
        "UPDATE studio_guided_sessions SET document = jsonb_set(document,'{createdAt}',"
            + "to_jsonb(?::text)) WHERE session_id=?",
        createdAt.toString(),
        id);
  }

  /** A second session of the same test, with its own id, state, start time and principal. */
  private void cloneSession(
      String from, String id, String state, Instant createdAt, String principal, boolean pruned) {
    replicaUpdate(
        "INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,"
            + "expires_at,document,progress,pruned_at) SELECT ?,test_id,?,scope_hash,?,expires_at,"
            + "jsonb_set(jsonb_set(jsonb_set(jsonb_set(document,'{sessionId}',to_jsonb(?::text)),"
            + "'{state}',to_jsonb(?::text)),'{createdAt}',to_jsonb(?::text)),"
            + "'{scope,principalId}',to_jsonb(?::text)),progress,"
            + (pruned ? "now()" : "NULL")
            + " FROM studio_guided_sessions WHERE session_id=?",
        id,
        principal,
        state,
        id,
        state,
        createdAt.toString(),
        principal,
        from);
  }

  /** Rewrites durable rows as the owner role would never: triggers off, any row count. */
  private void replicaUpdate(String sql, Object... args) {
    transactions.executeWithoutResult(
        status -> {
          jdbc.execute("SET LOCAL session_replication_role = 'replica'");
          assertThat(jdbc.update(sql, args)).isPositive();
        });
  }

  private String fingerprint(String id) {
    return jdbc.queryForObject(
        "SELECT md5(state || document::text || progress::text || coalesce(pruned_at::text,''))"
            + " FROM studio_guided_sessions WHERE session_id=?",
        String.class,
        id);
  }

  private List<String> stepIds(String id) {
    return jdbc.queryForList(
        "SELECT e->>'stepId' FROM studio_guided_sessions s,"
            + " jsonb_array_elements(s.document->'sourceSteps') WITH ORDINALITY t(e,ord)"
            + " WHERE s.session_id=? ORDER BY ord",
        String.class,
        id);
  }
}
