package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationBaseRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationResultProjector;
import com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-008 P2 and P3: the public {@code progress} and {@code explanation}, through the Spring
 * beans against the real schema and the Flyway head.
 *
 * <p>Every outbound validation site is reached by a case here:
 *
 * <ul>
 *   <li>{@code GuidedSessionService.view} ({@code PublicSession.progress}): {@link
 *       #activeCoordinateUsesFrozenSourceAndDurableProgress}
 *   <li>{@code GuidedSessionService.result} (result progress and explanation): {@link
 *       #anUnpublishedResultCarriesBothProjections}
 *   <li>{@code GuidedPublicationResultProjector.view} (session-view with its nested result): {@link
 *       #aPublishedSessionExplainsItselfAndTheSessionViewCarriesTheSameResult}
 *   <li>{@code GuidedPublicationResultProjector.result} (receipt-backed result): the same case, and
 *       {@link #failedExplanationNeverBorrowsCurrentHead}
 * </ul>
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class GuidedPublicPresentationIT {

  @DynamicPropertySource
  static void configuration(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    // The reaper would expire the seeded live sessions under the test.
    registry.add("studio.guided-authoring.reaper-delay-ms", () -> "3600000");
  }

  private static final String CSI_ID = "60491";
  private static final String SECRET_VALUE = "Canary-s3cr3t-value-5e1f09b7";
  private static final String SECRET_INPUT = "login-password-input";
  private static final String OWNER = "presentation-owner@citi.com";
  private static final GuidedContracts C = new GuidedContracts();
  private static final Set<String> LABELS =
      Set.of(
          "Open page",
          "Click control",
          "Fill field",
          "Press key",
          "Check control",
          "Uncheck control",
          "Move over control",
          "Select option",
          "Read reference",
          "Check expected result");

  @Autowired private JdbcTemplate jdbc;
  @Autowired private TransactionTemplate transactions;
  @Autowired private GuidedSessionService sessions;
  @Autowired private GuidedPublicationResultProjector projector;

  private StudioExecutionFixtures fixtures;
  private ObservedPublicationFixture observed;
  private Authentication owner;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    observed = new ObservedPublicationFixture(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
  }

  // ── P2: the active coordinate ────────────────────────────────────────────

  @Test
  void activeCoordinateUsesFrozenSourceAndDurableProgress() {
    String id = live("Go home", "Press continue", "Check the page");
    List<String> frozen = stepIds(id);
    String firstSentence = manifestText(id, 0);

    JsonNode first = sessions.read(owner, id, "session").path("progress");
    assertThat(first.path("stepCount").asInt()).isEqualTo(3);
    assertThat(first.path("activeStep").path("number").asInt()).isEqualTo(1);
    assertThat(first.path("activeStep").path("stepId").asText()).isEqualTo(frozen.get(0));
    assertThat(first.path("activeStep").path("text").asText())
        .as("the authored sentence of this session's manifest")
        .isEqualTo(firstSentence)
        .isEqualTo("Go home");

    progress(id, "{\"stepIndex\":2}");
    JsonNode third = sessions.read(owner, id, "session").path("progress");
    assertThat(third.path("activeStep").path("number").asInt())
        .as("the durable index moves the step, nothing else does")
        .isEqualTo(3);
    assertThat(third.path("activeStep").path("stepId").asText()).isEqualTo(frozen.get(2));

    // A reordered current draft never changes a running session's source order.
    jdbc.update(
        "UPDATE ui_tests SET authoring = jsonb_set(authoring,'{steps}',(SELECT"
            + " jsonb_agg(e ORDER BY ord DESC) FROM jsonb_array_elements(authoring->'steps')"
            + " WITH ORDINALITY t(e,ord))) WHERE id=?",
        UUID.fromString(testOf(id)));
    assertThat(sessions.read(owner, id, "session").path("progress")).isEqualTo(third);

    // A clarification asked on the same step agrees with the active coordinate.
    state(id, "AWAITING_CLARIFICATION");
    progress(id, "{\"clarification\":{\"coordinate\":{\"stepId\":\"" + frozen.get(2) + "\"}}}");
    assertThat(sessions.read(owner, id, "session").path("progress").path("activeStep").isObject())
        .isTrue();
    // ... and a disagreement is an integrity refusal, never a client guess.
    progress(id, "{\"clarification\":{\"coordinate\":{\"stepId\":\"" + frozen.get(1) + "\"}}}");
    assertThatThrownBy(() -> sessions.read(owner, id, "session"))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    progress(id, "{\"clarification\":null}");

    // FINALIZING and every terminal state have no active step.
    for (String state :
        List.of("FINALIZING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED", "UNKNOWN_OUTCOME")) {
      state(id, state);
      assertThat(sessions.read(owner, id, "session").path("progress").path("activeStep").isNull())
          .as(state)
          .isTrue();
    }

    // An unavailable or invalid coordinate fails closed: never clamped to the last step.
    state(id, "OBSERVING");
    for (String index : List.of("3", "99", "-1")) {
      progress(id, "{\"stepIndex\":" + index + "}");
      JsonNode view = sessions.read(owner, id, "session").path("progress");
      assertThat(view.path("stepCount").asInt()).isEqualTo(3);
      assertThat(view.path("activeStep").isNull()).as("stepIndex " + index).isTrue();
    }
  }

  // ── P3 on a session that never published: result site of the service ─────

  @Test
  void anUnpublishedResultCarriesBothProjections() {
    String id = live("Go home", "Press continue");
    state(id, "FAILED");
    progress(id, "{\"stepIndex\":0}");

    JsonNode viaService = sessions.read(owner, id, "result");
    JsonNode viaProjector = projector.read(owner, request(), id, true).orElseThrow();

    for (JsonNode result : List.of(viaService, viaProjector)) {
      assertThat(result.path("progress").path("stepCount").asInt()).isEqualTo(2);
      assertThat(result.path("progress").path("activeStep").isNull()).isTrue();
      JsonNode explanation = result.path("explanation");
      assertThat(explanation.path("sessionId").asText()).isEqualTo(id);
      assertThat(explanation.path("steps")).hasSize(2);
      explanation
          .path("steps")
          .forEach(
              step -> {
                assertThat(step.path("completed").asBoolean()).isFalse();
                assertThat(step.path("learnedFromThisRun").asBoolean()).isFalse();
                assertThat(step.path("reusedFrom").isNull()).isTrue();
                assertThat(step.path("relearnedAfterDrift").asBoolean()).isFalse();
                assertThat(step.path("actions")).isEmpty();
              });
      assertThat(explanation.path("referenceFlows")).isEmpty();
    }
    assertThat(viaProjector.path("explanation")).isEqualTo(viaService.path("explanation"));
    assertThat(viaProjector.path("progress")).isEqualTo(viaService.path("progress"));
  }

  // ── P3 on a published session: receipt-backed sites ──────────────────────

  @Test
  void aPublishedSessionExplainsItselfAndTheSessionViewCarriesTheSameResult() {
    UUID testId =
        fixtures
            .seedRunnableTest("Published", CSI_ID, OWNER, List.of("Go home", "Press continue"))
            .testId();
    String id = sessionOf(observed.publish(testId, List.of(), List.of()));

    JsonNode result = projector.read(owner, request(), id, true).orElseThrow();
    JsonNode view = projector.read(owner, request(), id, false).orElseThrow();

    assertThat(view.path("result")).isEqualTo(result);
    assertThat(view.path("session").path("progress")).isEqualTo(result.path("progress"));
    assertThat(result.path("progress").path("activeStep").isNull())
        .as("terminal or finalizing")
        .isTrue();
    JsonNode steps = result.path("explanation").path("steps");
    assertThat(steps).hasSize(2);
    for (JsonNode step : steps) {
      assertThat(step.path("completed").asBoolean()).isTrue();
      assertThat(step.path("learnedFromThisRun").asBoolean()).isTrue();
      assertThat(step.path("reusedFrom").isNull()).isTrue();
      assertThat(step.path("relearnedAfterDrift").asBoolean()).isFalse();
      assertThat(step.path("actions")).isNotEmpty();
      for (JsonNode action : step.path("actions")) {
        assertThat(LABELS).contains(action.path("safeLabel").asText());
        assertThat(action.path("outcome").asText()).isEqualTo("SUCCEEDED");
        assertThat(action.path("attemptOrdinal").asInt()).isZero();
      }
    }
    assertThat(steps.get(0).path("actions").get(0).path("operationKind").asText())
        .isEqualTo("navigate");
    assertThat(steps.get(0).path("actions").get(0).path("safeLabel").asText())
        .isEqualTo("Open page");
    assertThat(steps.get(0).path("actions").get(0).path("referenceIds")).isNotEmpty();
    assertThat(steps.get(1).path("actions").get(0).path("operationKind").asText())
        .isEqualTo("press");
    assertThat(steps.get(1).path("actions").get(0).path("safeLabel").asText())
        .isEqualTo("Press key");
    assertThat(result.path("publication").path("status").asText()).isEqualTo("PUBLISHED");
  }

  // ── P3: failed and conflicted runs ───────────────────────────────────────

  @Test
  void failedExplanationNeverBorrowsCurrentHead() {
    UUID testId =
        fixtures.seedTest("Failed with facts", CSI_ID, OWNER, List.of("Go home", "Press continue"));
    String failed = liveWithActions(testId);
    state(failed, "FAILED");
    progress(failed, "{\"stepIndex\":1}");
    JsonNode before = sessions.read(owner, failed, "result");

    JsonNode steps = before.path("explanation").path("steps");
    assertThat(steps.get(0).path("completed").asBoolean())
        .as("step 0 is below the durable index and all its actions succeeded")
        .isTrue();
    assertThat(steps.get(1).path("completed").asBoolean())
        .as("its actions are recorded SUCCEEDED, but no verified step index covers it")
        .isFalse();
    assertThat(steps.get(1).path("learnedFromThisRun").asBoolean()).isFalse();
    assertThat(steps.get(0).path("actions")).isNotEmpty();
    assertThat(before.path("publication").path("status").asText()).isEqualTo("REFUSED");

    // A newer, unrelated confirmed head for the same test changes nothing about this run.
    observed.publish(testId, List.of(), List.of());
    JsonNode after = sessions.read(owner, failed, "result");
    assertThat(after.path("explanation")).isEqualTo(before.path("explanation"));
    assertThat(after.path("progress")).isEqualTo(before.path("progress"));
    assertThat(projector.read(owner, request(), failed, true).orElseThrow().path("explanation"))
        .isEqualTo(before.path("explanation"));
  }

  // ── closed projection ────────────────────────────────────────────────────

  @Test
  void closedProjectionRejectsPrivateMaterial() {
    UUID testId =
        fixtures
            .seedRunnableTest("Closed", CSI_ID, OWNER, List.of("Go home", "Press continue"))
            .testId();
    String id = sessionOf(observed.publish(testId, List.of(), List.of()));

    JsonNode result = projector.read(owner, request(), id, true).orElseThrow();

    String text = result.path("explanation").toString();
    assertThat(text)
        .as("a destination, an origin or a locator is never part of an explanation")
        .doesNotContain(ObservedPublicationFixture.ORIGIN)
        .doesNotContain("studio-fixture.example.test")
        .doesNotContain("http")
        .doesNotContain("locator")
        .doesNotContain("nodeId");
    assertThat(keys(result.path("explanation")))
        .containsExactlyInAnyOrder(
            "sessionId", "sourceRevision", "configurationRevision", "steps", "referenceFlows");
    for (JsonNode step : result.path("explanation").path("steps")) {
      assertThat(keys(step))
          .containsExactlyInAnyOrder(
              "stepId",
              "number",
              "completed",
              "learnedFromThisRun",
              "reusedFrom",
              "relearnedAfterDrift",
              "actions");
      for (JsonNode action : step.path("actions")) {
        assertThat(keys(action))
            .containsExactlyInAnyOrder(
                "admissionId",
                "ordinal",
                "attemptOrdinal",
                "operationKind",
                "safeLabel",
                "outcome",
                "referenceIds");
      }
    }
    assertThat(keys(result.path("progress"))).containsExactlyInAnyOrder("stepCount", "activeStep");
  }

  /**
   * A planted secret value must never appear in any public projection. The value is written into
   * every durable place a careless projector could copy from: an action's proposal (a hostile extra
   * operation field and a locator value), the ledger document, the session progress, and the source
   * manifest. A control proves each plant is really there; then the live session view, the result
   * and the session-view with its nested result are all scanned. The declared reference id (the
   * only thing that may be named) must be present.
   */
  @Test
  void aPlantedSecretValueNeverReachesAnyPublicProjection() {
    UUID testId =
        fixtures
            .seedRunnableTest("Canary", CSI_ID, OWNER, List.of("Go home", "Press continue"))
            .testId();
    String id = sessionOf(observed.publish(testId, List.of(), List.of()));
    String stepTwo = stepIds(id).get(1);
    // The second step's action becomes a secret fill that also carries the value in a hostile
    // field.
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
            + "'observation',jsonb_build_object('text',?::text)) WHERE session_id=?",
        SECRET_VALUE,
        id);
    replicaUpdate(
        "UPDATE studio_guided_source_manifests SET manifest = manifest || jsonb_build_object("
            + "'plantedSecretValue',?::text) WHERE session_id=?",
        SECRET_VALUE,
        id);

    assertThat(plantedIn("studio_guided_actions", "proposal::text", id))
        .as("control: the canary really is in the proposal the projector reads")
        .isPositive();
    assertThat(plantedIn("studio_guided_actions", "document::text", id)).isPositive();
    assertThat(plantedIn("studio_guided_sessions", "progress::text", id)).isPositive();
    assertThat(plantedIn("studio_guided_source_manifests", "manifest::text", id)).isPositive();

    JsonNode result = projector.read(owner, request(), id, true).orElseThrow();
    JsonNode view = projector.read(owner, request(), id, false).orElseThrow();
    for (JsonNode projection : List.of(result, view)) {
      assertThat(projection.toString())
          .doesNotContain(SECRET_VALUE)
          .doesNotContain("secretValue")
          .doesNotContain("plantedEvidence");
    }
    JsonNode action = result.path("explanation").path("steps").get(1).path("actions").get(0);
    assertThat(action.path("operationKind").asText()).isEqualTo("fill");
    assertThat(action.path("safeLabel").asText()).isEqualTo("Fill field");
    assertThat(action.path("referenceIds").toString())
        .as("the declared reference id is named, the value is not")
        .contains(SECRET_INPUT);

    // The live view of a running session built from the same tables is closed too.
    String live = live("Go home", "Press continue");
    replicaUpdate(
        "UPDATE studio_guided_sessions SET progress = progress || jsonb_build_object("
            + "'observation',jsonb_build_object('text',?::text)) WHERE session_id=?",
        SECRET_VALUE,
        live);
    assertThat(sessions.read(owner, live, "session").toString()).doesNotContain(SECRET_VALUE);
  }

  // ── P3: attempts keep their own admission ────────────────────────────────

  /**
   * Attempt 0 (the replaced, no-invocation action) and attempt 1 (the real action) of one semantic
   * coordinate keep distinct admission ids, exact coordinates and their own outcome. The
   * explanation never merges them by (step, ordinal), never invents a timing, and an unexcluded
   * failed attempt keeps its step from being called complete. The client joins {@code
   * actionTimings} to these actions by the exact admission id and coordinate; this is the backend
   * half of that join.
   */
  @Test
  void actionTimingUsesExactAttemptAdmission() {
    UUID testId =
        fixtures.seedTest("Attempts", CSI_ID, OWNER, List.of("Go home", "Press continue"));
    String id = liveWithActions(testId);
    String first = stepIds(id).get(0);
    String attemptZero =
        jdbc.queryForObject(
            "SELECT admission_id FROM studio_guided_actions WHERE session_id=? AND step_id=?"
                + " AND ordinal=0 AND attempt_ordinal=0",
            String.class,
            id,
            first);
    String attemptOne = attemptZero + "-attempt-1";
    replicaUpdate(
        "INSERT INTO studio_guided_actions(admission_id,session_id,step_id,ordinal,"
            + "attempt_ordinal,document,proposal) SELECT ?,session_id,step_id,ordinal,1,"
            + "jsonb_set(jsonb_set(document,'{admission,admissionId}',to_jsonb(?::text)),"
            + "'{attemptOrdinal}','1'::jsonb),proposal FROM studio_guided_actions WHERE"
            + " session_id=? AND step_id=? AND ordinal=0 AND attempt_ordinal=0",
        attemptOne,
        attemptOne,
        id,
        first);
    // Attempt 0 is the target-changed attempt that the replacement superseded.
    replicaUpdate(
        "UPDATE studio_guided_actions SET document = document || jsonb_build_object("
            + "'state','FAILED','outcomeCode','TARGET_CHANGED') WHERE admission_id=?",
        attemptZero);
    state(id, "FAILED");
    progress(id, "{\"stepIndex\":2}");

    JsonNode result = sessions.read(owner, id, "result");
    JsonNode actions = result.path("explanation").path("steps").get(0).path("actions");

    assertThat(actions)
        .as("ordinal 0 twice (two attempts), then the untouched ordinal 1")
        .hasSize(3);
    assertThat(actions.get(2).path("ordinal").asInt()).isEqualTo(1);
    assertThat(actions.get(2).path("attemptOrdinal").asInt()).isZero();
    assertThat(actions.get(0).path("admissionId").asText()).isEqualTo(attemptZero);
    assertThat(actions.get(0).path("attemptOrdinal").asInt()).isZero();
    assertThat(actions.get(0).path("outcome").asText()).isEqualTo("FAILED");
    assertThat(actions.get(1).path("admissionId").asText()).isEqualTo(attemptOne);
    assertThat(actions.get(1).path("attemptOrdinal").asInt()).isEqualTo(1);
    assertThat(actions.get(1).path("outcome").asText()).isEqualTo("SUCCEEDED");
    assertThat(actions.get(0).path("ordinal").asInt())
        .isEqualTo(actions.get(1).path("ordinal").asInt());
    assertThat(actions.get(0).path("admissionId").asText())
        .as("the replacement is a different admission, never a merge")
        .isNotEqualTo(actions.get(1).path("admissionId").asText());
    assertThat(result.path("explanation").path("steps").get(0).path("completed").asBoolean())
        .as("a failed attempt that is not an excluded drift receipt is not completion")
        .isFalse();
    assertThat(result.path("actionTimings"))
        .as("no recording was seeded, so no timing exists and none is invented")
        .isEmpty();
    for (JsonNode action : actions) {
      assertThat(keys(action)).doesNotContain("offsetMs", "startedAtMs", "durationMs");
    }
  }

  // ── P3: a conflicted run ─────────────────────────────────────────────────

  @Test
  void conflictExplanationNeverBorrowsCurrentHead() {
    UUID testId =
        fixtures.seedTest("Conflicted", CSI_ID, OWNER, List.of("Go home", "Press continue"));
    String conflicted = liveWithActions(testId);
    state(conflicted, "PUBLICATION_CONFLICT");
    progress(conflicted, "{\"stepIndex\":2}");

    JsonNode before = sessions.read(owner, conflicted, "result");

    assertThat(before.path("outcome").asText()).isEqualTo("PUBLICATION_CONFLICT");
    assertThat(before.path("publication").path("status").asText()).isEqualTo("CONFLICT");
    assertThat(before.path("publication").path("receipt").isNull()).isTrue();
    assertThat(before.path("currentReadiness").path("code").asText()).isEqualTo("NOT_PUBLISHED");
    assertThat(before.path("progress").path("activeStep").isNull()).isTrue();
    for (JsonNode step : before.path("explanation").path("steps")) {
      assertThat(step.path("completed").asBoolean())
          .as("all steps verified before the conflict")
          .isTrue();
      assertThat(step.path("learnedFromThisRun").asBoolean()).isTrue();
      assertThat(step.path("reusedFrom").isNull()).isTrue();
      assertThat(step.path("actions")).isNotEmpty();
    }

    // A newer confirmed head for the same test is what the conflict was about; it is not borrowed.
    observed.publish(testId, List.of(), List.of());
    JsonNode after = sessions.read(owner, conflicted, "result");
    assertThat(after.path("explanation")).isEqualTo(before.path("explanation"));
    assertThat(after.path("progress")).isEqualTo(before.path("progress"));
    assertThat(after.path("publication")).isEqualTo(before.path("publication"));
    assertThat(projector.read(owner, request(), conflicted, true).orElseThrow().path("explanation"))
        .isEqualTo(before.path("explanation"));
  }

  // ── P3: the receipt after the session has expired ────────────────────────

  /**
   * A published result is read on the receipt's authority, not the session's: after the session has
   * expired it is still served to its original principal, on a fresh Core read of that principal's
   * current CSI access, never the stored identity and never the worker lease. It claims a historic
   * publication and no replay verification.
   */
  @Test
  void receiptAfterExpiryRetainsFreshReadAuthority() {
    UUID testId =
        fixtures
            .seedRunnableTest(
                "Expired receipt", CSI_ID, OWNER, List.of("Go home", "Press continue"))
            .testId();
    String id = sessionOf(observed.publish(testId, List.of(), List.of()));
    replicaUpdate(
        "UPDATE studio_guided_sessions SET expires_at = clock_timestamp() - interval '2 days',"
            + " document=jsonb_set(document,'{expiresAt}',to_jsonb(to_char((clock_timestamp() -"
            + " interval '2 days') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')))"
            + " WHERE session_id=?",
        id);

    JsonNode result = projector.read(owner, request(), id, true).orElseThrow();
    JsonNode view = projector.read(owner, request(), id, false).orElseThrow();

    assertThat(result.path("publication").path("status").asText()).isEqualTo("PUBLISHED");
    assertThat(result.path("publication").path("receipt").isObject()).isTrue();
    assertThat(result.path("replayVerified").asBoolean()).isFalse();
    assertThat(result.path("currentReadiness").path("ready").isBoolean())
        .as("a historic PUBLISHED is a separate fact from current readiness")
        .isTrue();
    assertThat(view.path("result")).isEqualTo(result);
    assertThat(result.path("explanation").path("steps")).hasSize(2);

    // Another principal, even one with CSI access, is refused: the receipt belongs to its original
    // principal.
    Authentication other =
        StudioExecutionFixtures.identity("someone-else@citi.com", CSI_ID, "owner");
    assertThatThrownBy(
            () -> projector.read(other, ObservedPublicationFixture.request(other), id, true))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("FORBIDDEN_SCOPE");
    // The same principal whose fresh Core identity names a different principal is refused.
    Authentication stolen =
        StudioExecutionFixtures.identity("someone-else@citi.com", CSI_ID, "owner");
    assertThatThrownBy(
            () -> projector.read(owner, ObservedPublicationFixture.request(stolen), id, true))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("FORBIDDEN_SCOPE");
    // The same principal whose CURRENT access no longer covers the CSI is refused: the read asks
    // Core now, it does not trust the access the session was learned under.
    Authentication revoked = StudioExecutionFixtures.identity(OWNER, "60499", "owner");
    assertThatThrownBy(
            () -> projector.read(owner, ObservedPublicationFixture.request(revoked), id, true))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("FORBIDDEN_SCOPE");
  }

  // ── P3: out-of-contract sessions fail closed (architect w1-confirmations section 6, option b) ──

  /**
   * A frozen scope revision that is not a decimal string cannot be described by the explanation.
   * The read refuses with 422; nothing is substituted, and the session view (whose progress is
   * unchanged) still reads.
   */
  @Test
  void aNonDecimalScopeRevisionIsRefusedNotPlaceholdered() {
    for (String field : List.of("sourceRevision", "configurationRevision")) {
      String id = live("Go home", "Press continue");
      state(id, "FAILED");
      replicaUpdate(
          "UPDATE studio_guided_sessions SET document = jsonb_set(document,'{scope,"
              + field
              + "}',to_jsonb('source-1'::text)) WHERE session_id=?",
          id);

      assertThatThrownBy(() -> sessions.read(owner, id, "result"))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              refused -> {
                assertThat(refused.getMessage()).isEqualTo("INVALID_CONTRACT");
                assertThat(refused.status()).isEqualTo(422);
              });
      assertThat(sessions.read(owner, id, "session").path("progress").path("stepCount").asInt())
          .as(field + ": progress is unchanged")
          .isEqualTo(2);
    }
  }

  @Test
  void aStepIdThatIsNotAUuidIsRefusedNotDropped() {
    String id = live("Go home", "Press continue");
    state(id, "FAILED");
    replicaUpdate(
        "UPDATE studio_guided_sessions SET document = jsonb_set(document,'{sourceSteps,0,stepId}',"
            + "to_jsonb('step-1'::text)) WHERE session_id=?",
        id);

    assertThatThrownBy(() -> sessions.read(owner, id, "result"))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refused -> {
              assertThat(refused.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(refused.status()).isEqualTo(422);
            });
    // progress stays allowed: an unnameable active step is activeStep null, not a refusal.
    state(id, "OBSERVING");
    JsonNode progress = sessions.read(owner, id, "session").path("progress");
    assertThat(progress.path("stepCount").asInt()).isEqualTo(2);
    assertThat(progress.path("activeStep").isNull()).isTrue();
  }

  @Test
  void moreThanOneHundredStepsAreRefusedNotTruncated() {
    String id = live("Go home", "Press continue");
    state(id, "FAILED");
    replicaUpdate(
        "UPDATE studio_guided_sessions SET document = jsonb_set(document,'{sourceSteps}',"
            + "(SELECT jsonb_agg(jsonb_build_object('stepId',gen_random_uuid()::text,"
            + "'requiresAssertion',false)) FROM generate_series(1,101))) WHERE session_id=?",
        id);

    assertThatThrownBy(() -> sessions.read(owner, id, "result"))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refused -> {
              assertThat(refused.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(refused.status()).isEqualTo(422);
            });
  }

  /** A service composed without durable facts must fail the result contract, not satisfy it. */
  @Test
  void aProjectorWithoutFactsRefusesTheExplanationButNotTheProgress() {
    String id = live("Go home", "Press continue");
    state(id, "FAILED");
    var unwired = GuidedPublicPresentationProjector.withoutFacts(C);
    var repository = new GuidedSessionRepository(jdbc, transactions, C);

    transactions.executeWithoutResult(
        status -> {
          var current = repository.lock(id);
          assertThatThrownBy(() -> unwired.explanation(current))
              .isInstanceOfSatisfying(
                  GuidedSessionException.class,
                  refused -> {
                    assertThat(refused.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
                    assertThat(refused.status()).isEqualTo(409);
                  });
          JsonNode progress = unwired.progress(current);
          assertThat(progress.path("stepCount").asInt()).isEqualTo(2);
          assertThat(progress.path("activeStep").isNull()).isTrue();
        });
  }

  // ── seeding ──────────────────────────────────────────────────────────────

  /** A live PREPARING session over a draft with these steps, with the public view fields set. */
  private String live(String... sentences) {
    UUID testId =
        fixtures
            .seedRunnableTest(
                "Presentation " + UUID.randomUUID(), CSI_ID, OWNER, List.of(sentences))
            .testId();
    String id = observed.learnWithoutPublishing(testId);
    // The fixture's synthetic session omits the public-view fields a real start writes.
    asReplica(
        "UPDATE studio_guided_sessions SET document = document || jsonb_build_object("
            + "'schemaVersion',3,'counters',jsonb_build_object('actions',0,'observations',0,"
            + "'modelProposals',0,'modelInputTokens',0,'modelOutputTokens',0,"
            + "'sanitizedEvidenceBytes',0)) WHERE session_id=?",
        id);
    return id;
  }

  /** A session whose actions the evidence fixture recorded, as {@code publish} does before it. */
  private String liveWithActions(UUID testId) {
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
    asReplica(
        "UPDATE studio_guided_sessions SET document = document || jsonb_build_object("
            + "'schemaVersion',3,'counters',jsonb_build_object('actions',0,'observations',0,"
            + "'modelProposals',0,'modelInputTokens',0,'modelOutputTokens',0,"
            + "'sanitizedEvidenceBytes',0)) WHERE session_id=?",
        id);
    return id;
  }

  private void state(String id, String state) {
    asReplica(
        "UPDATE studio_guided_sessions SET state=?, document=jsonb_set(document,'{state}',"
            + "to_jsonb(?::text)) WHERE session_id=?",
        state,
        state,
        id);
  }

  private void progress(String id, String fragment) {
    asReplica(
        "UPDATE studio_guided_sessions SET progress = progress || ?::jsonb WHERE session_id=?",
        fragment,
        id);
  }

  /** Rewrites durable rows as the owner role would never: triggers off, any row count. */
  private void replicaUpdate(String sql, Object... args) {
    transactions.executeWithoutResult(
        status -> {
          jdbc.execute("SET LOCAL session_replication_role = 'replica'");
          assertThat(jdbc.update(sql, args)).isPositive();
        });
  }

  private int plantedIn(String table, String column, String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM "
            + table
            + " WHERE session_id=? AND "
            + column
            + " LIKE '%' || ? || '%'",
        Integer.class,
        id,
        SECRET_VALUE);
  }

  private void asReplica(String sql, Object... args) {
    transactions.executeWithoutResult(
        status -> {
          jdbc.execute("SET LOCAL session_replication_role = 'replica'");
          assertThat(jdbc.update(sql, args)).isEqualTo(1);
        });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  private List<String> stepIds(String id) {
    return new ArrayList<>(
        jdbc.queryForList(
            "SELECT e->>'stepId' FROM studio_guided_sessions s,"
                + " jsonb_array_elements(s.document->'sourceSteps') WITH ORDINALITY t(e,ord)"
                + " WHERE s.session_id=? ORDER BY ord",
            String.class,
            id));
  }

  private String manifestText(String id, int index) {
    return jdbc.queryForObject(
        "SELECT manifest->'sourceSteps'->(?::int)->>'text' FROM studio_guided_source_manifests"
            + " WHERE session_id=?",
        String.class,
        index,
        id);
  }

  private String testOf(String id) {
    return jdbc.queryForObject(
        "SELECT test_id::text FROM studio_guided_sessions WHERE session_id=?", String.class, id);
  }

  private String sessionOf(UUID revision) {
    return jdbc.queryForObject(
        "SELECT session_id FROM studio_guided_publications WHERE revision_id=?",
        String.class,
        revision);
  }

  private org.springframework.mock.web.MockHttpServletRequest request() {
    return ObservedPublicationFixture.request(owner);
  }

  private static Set<String> keys(JsonNode node) {
    Set<String> names = new TreeSet<>();
    node.fieldNames().forEachRemaining(names::add);
    return names;
  }
}
