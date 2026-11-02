package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dispatch.DispatchOutcome;
import com.citi.put.checks.studio.dispatch.RecordingRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * The real promotion trigger (ADR-SC-008 D5): a FINAL runner report goes through {@link
 * ProgressReportService#apply}, whose {@code afterFinal} promotes a passing proof, leaves a
 * diagnostic Run and a failing proof alone, and keeps the draft's last run for confirmed runs only.
 * If the promotion hook were not wired, the first test would fail.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class ProofReportIT {

  private static final String CSI_ID = "60483";
  private static final String OWNER = "proof-report-owner@citi.com";
  private static final String RUNNER = "studio-runner-0";
  private static final GuidedContracts C = new GuidedContracts();
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  @TestConfiguration
  static class FakeRunner {
    @Bean
    @Primary
    RecordingRunnerDispatchClient recordingRunnerDispatchClient() {
      return new RecordingRunnerDispatchClient();
    }
  }

  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private ProgressReportService progressService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private JdbcTemplate jdbc;

  @Autowired
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observedReplay;

  private Authentication owner;
  private UUID testId;
  private UUID revisionId;

  /** A test whose only revision is recorded (candidate) and not confirmed. */
  @BeforeEach
  void setUp() {
    runner.reset();
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    var runnable =
        fixtures.seedRunnableTest(
            "Proof report draft", CSI_ID, OWNER, List.of("Go to the home page"));
    testId = runnable.testId();
    revisionId = runnable.revisionId();
    jdbc.update(
        "UPDATE ui_tests SET candidate_revision_id=confirmed_revision_id, confirmed_revision_id=NULL"
            + " WHERE id=?",
        testId);
  }

  @Test
  void aDiagnosticRunOfARecordedTestNeverPromotesNorSetsTheLastRun() {
    UUID execution =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    ExecutionSnapshotDto accepted = studioService.findExecutionById(execution, owner);
    assertThat(accepted.diagnostic()).as("labelled diagnostic").isTrue();
    assertThat(accepted.triggerSource()).isEqualTo("MANUAL");
    assertThat(accepted.revisionId()).as("it runs the recorded candidate").isEqualTo(revisionId);

    runToFinal(execution, "PASSED", "PASS", true);

    assertThat(pointer("confirmed_revision_id")).as("a diagnostic run never confirms").isNull();
    assertThat(pointer("candidate_revision_id")).isEqualTo(revisionId);
    assertThat(lastRunStatus()).as("and leaves the last run alone").isNull();
    assertThat(studioService.findExecutionById(execution, owner).status()).isEqualTo("PASSED");
  }

  @Test
  void aPassingProofReportPromotesAndSetsTheLastRunAfterThePromotion() {
    UUID execution =
        studioService
            .verifyRecorded(
                testId,
                owner,
                UUID.randomUUID().toString(),
                ObservedPublicationFixture.request(owner))
            .executionId();
    assertThat(studioService.findExecutionById(execution, owner).triggerSource())
        .isEqualTo("AFTER_LEARN");

    runToFinal(execution, "PASSED", "PASS", true);

    assertThat(pointer("confirmed_revision_id")).isEqualTo(revisionId);
    assertThat(pointer("candidate_revision_id")).isNull();
    assertThat(lastRunStatus())
        .as("the last run is projected after the promotion, and the promotion survives it")
        .isEqualTo("PASSED");
  }

  @Test
  void aFailingProofReportPromotesNothingAndSetsTheLastRunToFailed() {
    UUID execution =
        studioService
            .verifyRecorded(
                testId,
                owner,
                UUID.randomUUID().toString(),
                ObservedPublicationFixture.request(owner))
            .executionId();

    runToFinal(execution, "FAILED", "FAIL", true);

    assertThat(pointer("confirmed_revision_id")).isNull();
    assertThat(pointer("candidate_revision_id")).isEqualTo(revisionId);
    assertThat(lastRunStatus())
        .as("a failed proof is the test's last run, so the test reads as failing (SC008-FIX-40)")
        .isEqualTo("FAILED");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private UUID pointer(String column) {
    return jdbc.queryForObject(
        "SELECT " + column + " FROM ui_tests WHERE id=?", UUID.class, testId);
  }

  private String lastRunStatus() {
    return jdbc.queryForObject(
        "SELECT last_run_status FROM ui_tests WHERE id=?", String.class, testId);
  }

  /** Dispatch, admit, STARTED, then a FINAL carrying the E5 receipt of every step. */
  private void runToFinal(UUID execution, String outcome, String stepStatus, boolean goodHash) {
    runner.willAnswer(DispatchOutcome.accepted());
    dispatcher.dispatch(execution);
    UUID attemptId =
        UUID.fromString(statements.find(execution).orElseThrow().get("attempt_id").toString());
    UUID admissionId = UUID.randomUUID();
    ObservedPublicationFixture.admitObserved(
        observedReplay, admissionService, execution, RUNNER, admissionId);
    progressService.apply(
        execution,
        report(execution, RunnerReport.STARTED, attemptId, admissionId, 1, List.of(), null));
    progressService.apply(
        execution,
        report(
            execution,
            RunnerReport.FINAL,
            attemptId,
            admissionId,
            2,
            steps(stepStatus, goodHash),
            new RunOutcome(outcome, null, null, null)));
  }

  private List<RunnerStepState> steps(String status, boolean goodHash) {
    JsonNode planned =
        C.parse(
                jdbc.queryForObject(
                    "SELECT artifact::text FROM ui_test_revisions WHERE id=?",
                    String.class,
                    revisionId))
            .path("steps");
    java.util.ArrayList<RunnerStepState> out = new java.util.ArrayList<>();
    for (int index = 0; index < planned.size(); index++) {
      ObjectNode receipt = MAPPER.createObjectNode();
      if ("PASS".equals(status)) {
        receipt.putNull("closedCode");
      } else {
        receipt.put("closedCode", "ASSERTION_FAILED");
      }
      receipt
          .put(
              "stepHash",
              goodHash
                  ? GuidedContracts.hash(
                      planned.get(index).path("operations").path(0).path("operation"))
                  : "f".repeat(64))
          .put("fenceCrossed", true)
          .put("effectsTruncated", false)
          .put("offscreen", false)
          .putArray("effects");
      out.add(
          new RunnerStepState(
              index,
              status,
              0.0,
              100.0,
              100.0,
              "PASS".equals(status) ? null : "The step failed",
              receipt));
    }
    return out;
  }

  private RunnerReport report(
      UUID execution,
      String kind,
      UUID attemptId,
      UUID admissionId,
      long sequence,
      List<RunnerStepState> steps,
      RunOutcome outcome) {
    return new RunnerReport(
        execution,
        attemptId,
        admissionId,
        RUNNER,
        kind,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        steps,
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of(),
        outcome,
        outcome == null
            ? null
            : new RunnerEvidence(
                "studio/video.webm", "studio/manifest.result.json", RunnerEvidence.FAILED, false),
        null,
        Map.of());
  }
}
