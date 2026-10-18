package com.citi.put.checks.studio.readiness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.dispatch.ExecutionReadiness;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Story 10.8 AC-22, AC-24, AC-26 — the readiness predicate, its messages and its unconditionality,
 * against a real PostgreSQL; ADR-SC-005 — one family and the readiness vocabulary.
 *
 * <p>Only an observed ({@code GUIDED_RUN}) publication is runnable, and only a guided run produces
 * one; its terms are exercised end to end by the joined publication/replay suites. This class
 * proves the family-independent terms and that nothing else is ever ready: a revision of another
 * family cannot even be stored (V15 {@code ck_observed_revision_origin}).
 *
 * <p>The lifecycle and seam tests seat on a genuine observed publication ({@link
 * ObservedPublicationFixture}) and show it is {@code READY} before the refusal under test, so each
 * refusal overrides a runnable test rather than a never-learned one. That is why this class
 * registers the trusted observed-replay configuration.
 */
@SpringBootTest
@ActiveProfiles("local")
class ExecutionReadinessTest {

  private static final List<String> STEPS =
      List.of(
          "Go to \"" + ObservedPublicationFixture.ORIGIN + "/login\"",
          "Click the \"Sign in\" button");

  @Autowired private ExecutionReadinessService readiness;
  @Autowired private StudioRepository studioRepository;
  @Autowired private java.util.Map<String, ExecutionReadiness> implementations;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  @BeforeEach
  void setUp() {
    ReadinessFixtures.seedUser(jdbc, ReadinessFixtures.OWNER);
    ReadinessFixtures.seedCsi(jdbc, ReadinessFixtures.CSI_ID);
    testId = ReadinessFixtures.seedDraft(jdbc, STEPS);
  }

  // ── ADR-SC-005: one family ────────────────────────────────────────────────

  /**
   * ADR-SC-005 D-A: a revision of another family cannot exist, so it can never be ready. The
   * database refuses an ordinary (artifact-1, non-{@code GUIDED_RUN}) revision row whatever values
   * are supplied, and the draft stays unlearned.
   */
  @Test
  void anOrdinaryConfirmedRevisionIsNeverReady() {
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "INSERT INTO ui_test_revisions (id, test_id, csi_id, source_revision,"
                        + " configuration_revision, source, source_hash, artifact, artifact_hash,"
                        + " artifact_schema_version, configuration, \"references\", provenance,"
                        + " created_by, created_at, confirmed_by, confirmed_at,"
                        + " confirmation_source, publication_kind, guided_session_id,"
                        + " learned_plan_hash, revision_digest) VALUES (?, ?, ?, 1, 1,"
                        + " CAST('[]' AS jsonb), ?,"
                        + " CAST('{\"version\":1,\"steps\":[]}' AS jsonb), ?, 1,"
                        + " CAST(? AS jsonb), CAST(? AS jsonb), CAST('{}' AS jsonb), ?, NOW(),"
                        + " ?, NOW(), 'GUIDED_RUN', 'ORDINARY', ?, ?, ?)",
                    UUID.randomUUID(),
                    testId,
                    ReadinessFixtures.CSI_ID,
                    "c".repeat(64),
                    "d".repeat(64),
                    StudioExecutionFixtures.DEFAULT_CONFIGURATION,
                    StudioExecutionFixtures.NO_REFERENCES,
                    ReadinessFixtures.OWNER,
                    ReadinessFixtures.OWNER,
                    "ordinary-" + UUID.randomUUID(),
                    "a".repeat(64),
                    "b".repeat(64)))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("ck_observed_revision_origin");

    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId))
        .isNull();
    ReadinessVerdict verdict = readiness.evaluate(testId);
    assertThat(verdict.ready()).isFalse();
    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.LEARN_REQUIRED);
    assertThat(verdict.message()).contains("not been learned yet");
    assertThat(readiness.readiness(testId)).isEqualTo(StudioReadiness.UNLEARNED);
  }

  @Test
  void anInProgressGuidedSessionIsLearningAndATerminalOneIsNot() {
    assertThat(readiness.readiness(testId)).isEqualTo(StudioReadiness.UNLEARNED);

    String active = ReadinessFixtures.learningSession(jdbc, testId, "OBSERVING");
    assertThat(readiness.readiness(testId)).isEqualTo(StudioReadiness.LEARNING);
    assertThat(readiness.evaluate(testId).code())
        .as("learning is not runnable")
        .isEqualTo(ReadinessVerdict.LEARN_REQUIRED);

    jdbc.update("DELETE FROM studio_guided_sessions WHERE session_id = ?", active);
    ReadinessFixtures.learningSession(jdbc, testId, "FAILED");
    assertThat(readiness.readiness(testId)).isEqualTo(StudioReadiness.UNLEARNED);
  }

  // ── AC-22: what is not a term of the predicate ────────────────────────────

  @Test
  void theGateOwnQueryNamesNoCompileStateColumn() {
    String query = ExecutionReadinessService.READINESS_QUERY.toLowerCase(java.util.Locale.ROOT);

    assertThat(query).doesNotContain("compile_status");
    assertThat(query).doesNotContain("compile_error");
    assertThat(query).doesNotContain("compile_diagnostics");
    assertThat(query).doesNotContain("compile_request_id");
    assertThat(query).doesNotContain("current_candidate_revision_id");
  }

  // ── AC-24: each negative case says what needs to happen ───────────────────

  @Test
  void neverConfirmedSaysSo() {
    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.LEARN_REQUIRED);
    assertThat(verdict.message()).contains("not been learned yet");
  }

  @Test
  void softDeletedAndQuarantinedAreRefusedByTheirOwnCodes() {
    new ObservedPublicationFixture(jdbc).publish(testId, List.of(), List.of());
    assertThat(readiness.evaluate(testId).ready())
        .as("control: the published test is READY")
        .isTrue();

    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);
    assertThat(readiness.evaluate(testId).code()).isEqualTo(ReadinessVerdict.TEST_DELETED);

    jdbc.update(
        "UPDATE ui_tests SET deleted_at = NULL, quarantined_at = NOW() WHERE id = ?", testId);
    assertThat(readiness.evaluate(testId).code()).isEqualTo(ReadinessVerdict.TEST_QUARANTINED);
  }

  /**
   * AC-24 names target policy selection as an execution-affecting configuration change, and records
   * 10.4's finding that {@code ConfigurationChangeClassifier} does not yet classify it.
   *
   * <p>It is recorded here as <b>not yet reachable</b>, never as passing: no target-policy field
   * exists on the frozen test contract, so nothing can change it and no test can drive the case.
   */
  @Test
  @Disabled("AC-24 — target policy selection is not yet a field on the frozen test contract")
  void targetPolicySelectionAdvancesTheConfigurationRevision() {
    throw new UnsupportedOperationException("no target policy field exists to change");
  }

  @Test
  void theClassifierStillDoesNotClassifyTargetPolicySelection() throws IOException {
    Path classifier =
        Path.of(
            "src",
            "main",
            "java",
            "com",
            "citi",
            "put",
            "checks",
            "studio",
            "authoring",
            "ConfigurationChangeClassifier.java");
    String source = Files.readString(classifier, StandardCharsets.UTF_8);

    assertThat(source)
        .as(
            "10.4 recorded this gap and 10.8 records that it is still open; if a target-policy"
                + " term is added, enable targetPolicySelectionAdvancesTheConfigurationRevision")
        .contains("Target policy selection is also an execution-affecting change");
  }

  // ── AC-26: authoritative and unconditional ────────────────────────────────

  @Test
  void requireReadyRefusesWithAConflictCarryingTheCode() {
    assertThatThrownBy(() -> readiness.requireReady(testId))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo(ReadinessVerdict.LEARN_REQUIRED);
  }

  @Test
  void noConfigurationKeyCanDisableTheGate() throws IOException {
    Path gate =
        Path.of(
            "src",
            "main",
            "java",
            "com",
            "citi",
            "put",
            "checks",
            "studio",
            "readiness",
            "ExecutionReadinessService.java");
    // Comments are stripped first: the class javadoc *names* these escapes in order to say it has
    // none of them, and a scan that could not tell documentation from code would be defeated by
    // honesty.
    String source =
        Files.readString(gate, StandardCharsets.UTF_8)
            .replaceAll("(?s)/\\*.*?\\*/", " ")
            .replaceAll("(?m)^\\s*//.*$", " ");

    for (String escape :
        List.of(
            "@ConditionalOnProperty",
            "@Profile",
            "@ConditionalOnMissingBean",
            "permitAll",
            "autoConfirm",
            "skipReadiness",
            "@Value")) {
      assertThat(source)
          .as("the gate is unconditional; %s would be a way to switch it off", escape)
          .doesNotContain(escape);
    }

    // The gate binds no configuration at all: its only constructor dependency is the database.
    assertThat(
            Stream.of(ExecutionReadinessService.class.getConstructors())
                .flatMap(constructor -> Stream.of(constructor.getParameterTypes())))
        .containsExactly(JdbcTemplate.class);
  }

  @Test
  void aClientSuppliedAlreadyConfirmedHintIsNotAnInput() {
    // Every entry point takes exactly one argument, and it identifies a draft rather than
    // describing one: a test id, or the persisted entity the acceptance transaction already
    // loaded. There is no parameter carrying a readiness claim for the gate to believe.
    assertThat(
            Stream.of(ExecutionReadinessService.class.getDeclaredMethods())
                .filter(
                    method ->
                        method.getName().equals("evaluate")
                            || method.getName().equals("requireReady")
                            || method.getName().equals("readiness"))
                .map(java.lang.reflect.Method::getParameterTypes))
        .isNotEmpty()
        .allSatisfy(
            parameters ->
                assertThat(parameters)
                    .as("the gate reads only an identified draft")
                    .hasSize(1)
                    .allMatch(type -> type == UUID.class || type == UITest.class));
  }

  /**
   * The stronger half of AC-26, made necessary by the {@link ExecutionReadiness} seam: a detached
   * entity mutated in memory so that it claims an unedited draft must not change the verdict the
   * database supports.
   */
  @Test
  void theSeamIgnoresWhatTheEntityItIsHandedClaims() {
    new ObservedPublicationFixture(jdbc).publish(testId, List.of(), List.of());
    assertThat(readiness.evaluate(testId).ready())
        .as("control: the published test is READY")
        .isTrue();
    jdbc.update(
        "UPDATE ui_tests SET source_revision = source_revision + 1,"
            + " steps = CAST('[\"Go somewhere else\"]' AS jsonb) WHERE id = ?",
        testId);

    UITest detached = studioRepository.findById(testId).orElseThrow();
    long confirmedSourceRevision =
        jdbc.queryForObject(
            "SELECT r.source_revision FROM ui_test_revisions r"
                + " JOIN ui_tests t ON t.confirmed_revision_id = r.id WHERE t.id = ?",
            Long.class,
            testId);
    detached.setSourceRevision(confirmedSourceRevision);

    ExecutionReadiness.Verdict verdict = readiness.evaluate(detached);

    assertThat(verdict.ready())
        .as("the entity now claims the draft was never edited; the database says otherwise")
        .isFalse();
    assertThat(verdict.errorCode()).isEqualTo(ReadinessVerdict.LEARN_REQUIRED);
    assertThat(verdict.message()).isEqualTo(readiness.evaluate(testId).message());
    assertThat(readiness.evaluate(testId).message())
        .contains("no longer match the text that was learned");
  }

  /**
   * AC-8a of story 10.7a and T-10.8.7 — one implementation of the seam, and it is this one.
   *
   * <p>Two beans of one interface is how an acceptance path silently keeps consulting the weaker
   * gate. That is a fact about the deployed context, not about a file, so it is asserted on the
   * context.
   */
  @Test
  void theReadinessSeamHasExactlyOneImplementationAndItIsTheRealPredicate() {
    assertThat(implementations.values())
        .as("a second ExecutionReadiness bean would make which gate runs a wiring accident")
        .hasSize(1)
        .allSatisfy(bean -> assertThat(bean).isSameAs(readiness));
  }

  // ── helpers ───────────────────────────────────────────────────────────────
}
