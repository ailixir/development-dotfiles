package com.citi.put.checks.studio.readiness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.compile.CompilePins;
import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.dispatch.ExecutionReadiness;
import com.citi.put.checks.studio.entity.UITest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.8 AC-22, AC-24, AC-25, AC-26 — the readiness predicate, its messages and its
 * unconditionality, against a real PostgreSQL.
 */
@SpringBootTest
@ActiveProfiles("local")
class ExecutionReadinessTest {

  private static final List<String> STEPS =
      List.of("Go to \"https://example.com/login\"", "Click the \"Sign in\" button");

  @Autowired private ExecutionReadinessService readiness;
  @Autowired private CompileStateService states;
  @Autowired private StudioRepository studioRepository;
  @Autowired private java.util.Map<String, ExecutionReadiness> implementations;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    ReadinessFixtures.seedUser(jdbc, ReadinessFixtures.OWNER);
    ReadinessFixtures.seedCsi(jdbc, ReadinessFixtures.CSI_ID);
    testId = ReadinessFixtures.seedDraft(jdbc, STEPS);
  }

  // ── AC-22: the predicate, and what is not a term of it ────────────────────

  @Test
  void aConfirmedUneditedDraftIsReady() {
    UUID revisionId = ReadinessFixtures.confirm(states, jdbc, testId, STEPS);

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.ready()).isTrue();
    assertThat(verdict.revisionId()).isEqualTo(revisionId);
    assertThat(verdict.code()).isNull();
  }

  /**
   * The mutation experiment AC-22 asks for. Everything is held fixed and {@code compile_status} is
   * driven through all five states; the verdict must not move. A gate that read the column would
   * flip on four of the five.
   */
  @Test
  void noValueOfCompileStatusChangesTheVerdict() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);

    for (CompileState state : CompileState.values()) {
      forceCompileStatus(state);

      ReadinessVerdict verdict = readiness.evaluate(testId);

      assertThat(verdict.ready())
          .as(
              "compile_status = %s changed the readiness verdict; AC-22 states the predicate"
                  + " exactly and compile_status is not one of its terms",
              state)
          .isTrue();
    }
  }

  @Test
  void noValueOfCompileStatusMakesAnUnconfirmedDraftReady() {
    for (CompileState state : CompileState.values()) {
      forceCompileStatus(state);

      assertThat(readiness.evaluate(testId).ready())
          .as("compile_status = %s made a never-confirmed draft runnable", state)
          .isFalse();
    }
  }

  @Test
  void theGateOwnQueryNamesNoCompileStateColumn() {
    String query = ExecutionReadinessService.READINESS_QUERY.toLowerCase(java.util.Locale.ROOT);

    assertThat(query).doesNotContain("compile_status");
    assertThat(query).doesNotContain("compile_error");
    assertThat(query).doesNotContain("compile_diagnostics");
    assertThat(query).doesNotContain("compile_request_id");
    assertThat(query).doesNotContain("current_candidate_revision_id");
  }

  /**
   * AC-22 term 5 — the belt-and-braces term, and the reason it is not redundant.
   *
   * <p>A revision-counter bug is simulated directly: the draft's text is changed without advancing
   * {@code source_revision}. Terms 1 to 4 all still pass. Only the re-hash catches it, which is why
   * it must not be dropped as an optimisation.
   */
  @Test
  void editedTextUnderAnUnmovedCounterIsCaughtOnlyByTheReHash() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);
    assertThat(readiness.evaluate(testId).ready()).isTrue();

    jdbc.update(
        "UPDATE ui_tests SET steps = CAST(? AS jsonb) WHERE id = ?",
        "[\"Go to \\\"https://evil.example.com/\\\"\", \"Click the \\\"Sign in\\\" button\"]",
        testId);

    assertThat(revisionPairStillMatches())
        .as("the counters must still agree, or this test is not exercising term 5")
        .isTrue();

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.ready()).isFalse();
    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.COMPILE_REQUIRED);
    assertThat(verdict.message()).contains("revision counter did not move");
  }

  @Test
  void aTamperedArtifactIsCaughtByItsOwnHash() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);

    // The write-once trigger protects ui_test_revisions from ordinary CRUD; this simulates a hash
    // that no longer describes its artifact, however it got that way.
    jdbc.update(
        "UPDATE ui_tests SET confirmed_revision_id = confirmed_revision_id WHERE id = ?", testId);
    jdbc.update("ALTER TABLE ui_test_revisions DISABLE TRIGGER trg_ui_test_revisions_write_once");
    try {
      jdbc.update(
          "UPDATE ui_test_revisions SET artifact = CAST(? AS jsonb) WHERE id ="
              + " (SELECT confirmed_revision_id FROM ui_tests WHERE id = ?)",
          "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"Go home\","
              + "\"code\":\"await page.goto('https://evil.example.com/');\"}]}",
          testId);
    } finally {
      jdbc.update("ALTER TABLE ui_test_revisions ENABLE TRIGGER trg_ui_test_revisions_write_once");
    }

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.ready()).isFalse();
    assertThat(verdict.message()).contains("does not match its recorded hash");
  }

  // ── AC-24: one test per negative case, each saying what needs confirmation ─

  @Test
  void neverConfirmedSaysSo() {
    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.COMPILE_REQUIRED);
    assertThat(verdict.message()).contains("never been confirmed");
  }

  @Test
  void aCandidateNobodyConfirmedSaysThatItIsWaiting() {
    CompileRequest request = states.beginCompile(testId);
    states.publishCandidate(
        testId,
        request,
        ReadinessFixtures.candidate(
            STEPS,
            request.configurationRevision(),
            ReadinessFixtures.provenance(CompilePins.SYNTAX_REFERENCE_VERSION, "1.0.0"),
            CompilePins.SUPPORTED_ARTIFACT_VERSION));

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.COMPILE_REQUIRED);
    assertThat(verdict.message())
        .as("the message must say what needs to happen, not merely that something is wrong")
        .contains("nobody has confirmed yet");
  }

  @Test
  void sourceEditedSinceConfirmationSaysWhichRevisionsDisagree() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);
    jdbc.update(
        "UPDATE ui_tests SET source_revision = source_revision + 1,"
            + " steps = CAST('[\"Go somewhere else\"]' AS jsonb) WHERE id = ?",
        testId);

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.COMPILE_REQUIRED);
    assertThat(verdict.message()).contains("steps of this test were edited after it was confirmed");
  }

  @Test
  void configurationEditedSinceConfirmationNamesTheFieldsThatCount() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);
    jdbc.update(
        "UPDATE ui_tests SET configuration_revision = configuration_revision + 1 WHERE id = ?",
        testId);

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.COMPILE_REQUIRED);
    assertThat(verdict.message())
        .contains("environment, variables, viewport, timeout, browser or wait strategy");
  }

  @Test
  void aNameOrDescriptionOnlyEditIsNotANegativeCase() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);

    jdbc.update(
        "UPDATE ui_tests SET name = 'Renamed', description = 'A new description',"
            + " updated_at = ? WHERE id = ?",
        Timestamp.from(Instant.now()),
        testId);

    assertThat(readiness.evaluate(testId).ready())
        .as("name and description advance no revision and must never invalidate a confirmation")
        .isTrue();
  }

  @Test
  void softDeletedAndQuarantinedAreRefusedByTheirOwnCodes() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);

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
   * Adding the field is a contract change, which is @architect's under ADR-002 §12. When the field
   * lands, this test is enabled and the classifier gains the term.
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
            "compile",
            "ConfigurationChangeClassifier.java");
    String source = Files.readString(classifier, StandardCharsets.UTF_8);

    assertThat(source)
        .as(
            "10.4 recorded this gap and 10.8 records that it is still open; if a target-policy"
                + " term is added, enable targetPolicySelectionAdvancesTheConfigurationRevision")
        .contains("Target policy selection is also an execution-affecting change");
  }

  // ── AC-25: runtime compatibility, exact-match terms only ──────────────────

  @Test
  void anOlderValidatorSchemaVersionIsRefusedAndTheRevisionIsPreserved() {
    UUID revisionId =
        ReadinessFixtures.confirm(
            states,
            jdbc,
            testId,
            STEPS,
            ReadinessFixtures.provenance(CompilePins.SYNTAX_REFERENCE_VERSION, "0.9.0"),
            CompilePins.SUPPORTED_ARTIFACT_VERSION);

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.RUNTIME_INCOMPATIBLE);
    assertThat(verdict.message())
        .as("the message must name the differing field and both values")
        .contains("validatorSchemaVersion recorded 0.9.0")
        .contains("this runtime runs 1.0.0");
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_revisions WHERE id = ?", Integer.class, revisionId))
        .as("a blocked revision is preserved for history, never deleted or reinterpreted (§4.6)")
        .isEqualTo(1);
  }

  @Test
  void anOlderSyntaxReferenceVersionIsRefused() {
    ReadinessFixtures.confirm(
        states,
        jdbc,
        testId,
        STEPS,
        ReadinessFixtures.provenance("0.9.0", "1.0.0"),
        CompilePins.SUPPORTED_ARTIFACT_VERSION);

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.RUNTIME_INCOMPATIBLE);
    assertThat(verdict.message()).contains("syntaxReferenceVersion recorded 0.9.0");
  }

  @Test
  void anArtifactSchemaVersionOtherThanThePinIsRefused() {
    ReadinessFixtures.confirm(
        states,
        jdbc,
        testId,
        STEPS,
        ReadinessFixtures.provenance(CompilePins.SYNTAX_REFERENCE_VERSION, "1.0.0"),
        2);

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.RUNTIME_INCOMPATIBLE);
    assertThat(verdict.message()).contains("artifact schema version 2");
  }

  /**
   * The division of labour AC-25 fixes: the ranged Playwright and executor terms are the runner's,
   * because there is one compatibility rule and re-implementing its range in Java is how two rules
   * are created. The backend must not refuse on them.
   */
  @Test
  void theBackendDoesNotCompareTheRangedPlaywrightOrExecutorTerms() {
    String provenance =
        ReadinessFixtures.provenance(CompilePins.SYNTAX_REFERENCE_VERSION, "1.0.0")
            .replace("\"executorVersion\":\"1.0.0\"", "\"executorVersion\":\"0.1.0\"")
            .replace("\"playwrightVersion\":\"1.63.0\"", "\"playwrightVersion\":\"1.40.0\"");
    ReadinessFixtures.confirm(
        states, jdbc, testId, STEPS, provenance, CompilePins.SUPPORTED_ARTIFACT_VERSION);

    assertThat(readiness.evaluate(testId).ready())
        .as(
            "the runner's isCompatible owns these and revalidates before any browser launch;"
                + " a second implementation here is the drift ArtifactSchemaDriftTest exists to"
                + " prevent")
        .isTrue();
  }

  // ── AC-26: authoritative and unconditional ────────────────────────────────

  @Test
  void requireReadyRefusesWithAConflictCarryingTheCode() {
    assertThatThrownBy(() -> readiness.requireReady(testId))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo(ReadinessVerdict.COMPILE_REQUIRED);
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

    // The only configuration it binds is the runtime pin, whose fields are version strings.
    assertThat(
            Stream.of(RuntimePinProperties.class.getRecordComponents())
                .map(component -> component.getType().getSimpleName()))
        .as("a boolean on the pin would be a switch")
        .containsOnly("int", "String");
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
                            || method.getName().equals("requireReady"))
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
   * The stronger half of AC-26, made necessary by the {@link ExecutionReadiness} seam.
   *
   * <p>The interface story 10.7a declared hands the gate the {@code UITest} the acceptance
   * transaction already loaded. A signature check alone no longer settles the criterion: an entity
   * <em>is</em> a description of a draft, and an implementation that read its terms from the object
   * it was handed would believe whatever that object said. This drives exactly that attack — a
   * detached entity mutated in memory so that every term it carries would pass — and asserts the
   * verdict is the one the database supports, not the one the argument claims.
   */
  @Test
  void theSeamIgnoresWhatTheEntityItIsHandedClaims() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);
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
    assertThat(verdict.errorCode()).isEqualTo(ReadinessVerdict.COMPILE_REQUIRED);
    assertThat(verdict.message())
        .isEqualTo(readiness.evaluate(testId).message())
        .contains("steps of this test were edited after it was confirmed");
  }

  @Test
  void theSeamAndTheIdentifiedFormAgreeOnAReadyDraft() {
    ReadinessFixtures.confirm(states, jdbc, testId, STEPS);

    ExecutionReadiness.Verdict throughTheSeam =
        readiness.evaluate(studioRepository.findById(testId).orElseThrow());

    assertThat(throughTheSeam.ready()).isTrue();
    assertThat(throughTheSeam.errorCode()).isNull();
    assertThat(readiness.evaluate(testId).ready()).isTrue();
  }

  /**
   * AC-8a of story 10.7a and T-10.8.7 — one implementation of the seam, and it is this one.
   *
   * <p>10.7a shipped a provisional implementation so its acceptance transaction could be written
   * before this predicate existed. Two beans of one interface is how an acceptance path silently
   * keeps consulting the weaker gate, so the provisional one was deleted rather than left beside
   * this one. That is a fact about the deployed context, not about a file, so it is asserted on the
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

  private void forceCompileStatus(CompileState state) {
    jdbc.update("UPDATE ui_tests SET compile_status = ? WHERE id = ?", state.name(), testId);
  }

  private boolean revisionPairStillMatches() {
    Integer matching =
        jdbc.queryForObject(
            """
            SELECT COUNT(*) FROM ui_tests t
              JOIN ui_test_revisions r ON r.id = t.confirmed_revision_id
             WHERE t.id = ?
               AND r.source_revision = t.source_revision
               AND r.configuration_revision = t.configuration_revision
            """,
            Integer.class,
            testId);
    return matching != null && matching == 1;
  }
}
