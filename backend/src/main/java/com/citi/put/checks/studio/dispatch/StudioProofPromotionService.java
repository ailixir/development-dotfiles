package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.guided.examples.StepExampleRecorder;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Turns the model-free proof of a recorded revision into per-step receipts and, when every step
 * passed, into the confirmed revision (ADR-SC-008 D5, FR-9).
 *
 * <p>Runs inside the report transaction that finalizes the proof execution, so the receipts, the
 * promotion and the execution outcome commit together. Promotion is one compare-and-set UPDATE on
 * the draft row: it succeeds only while the proven revision is still the candidate, so a late,
 * stale, superseded or edited proof changes nothing, a duplicate callback finds the candidate
 * already cleared and counts once, and two concurrent callbacks serialize on the row lock. Only an
 * {@code AFTER_LEARN} execution is ever considered; manual and scheduled runs never reach it.
 *
 * <p>The schedule swap is the pointer itself: a schedule names its test, not a revision (V24).
 */
@Component
public class StudioProofPromotionService {
  static final String PROOF_TRIGGER = "AFTER_LEARN";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  /** What the proof of the candidate says about its verification, for the draft projection. */
  public record Verification(String state, UUID firstUnverifiedStepId) {
    public static final String PENDING = "PENDING";
    public static final String FAILED = "FAILED";
    public static final String INCOMPLETE = "INCOMPLETE";
  }

  private final JdbcTemplate jdbc;
  private final StepExampleRecorder examples;

  public StudioProofPromotionService(JdbcTemplate jdbc, StepExampleRecorder examples) {
    this.jdbc = jdbc;
    this.examples = examples;
  }

  /**
   * Whether a finished execution must leave the draft's last run alone: a diagnostic run, and a
   * proof that did not promote (it ran a revision that is not the confirmed one).
   *
   * @param executionId the execution
   * @param promoted whether {@link #onFinal} promoted its revision
   */
  public boolean excludesLastRun(UUID executionId, boolean promoted) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT diagnostic, trigger_source FROM ui_test_executions WHERE id = ?", executionId);
    if (rows.isEmpty()) {
      return false;
    }
    return Boolean.TRUE.equals(rows.get(0).get("diagnostic"))
        || (PROOF_TRIGGER.equals(rows.get(0).get("trigger_source")) && !promoted);
  }

  /**
   * Records the proof's receipts and promotes the candidate when the proof passed in full.
   *
   * @param executionId the execution whose FINAL report was just applied
   * @return whether this call promoted the candidate
   */
  public boolean onFinal(UUID executionId) {
    List<Map<String, Object>> executions =
        jdbc.queryForList(
            "SELECT ui_test_id, revision_id, status, trigger_source, step_results::text AS steps"
                + " FROM ui_test_executions WHERE id = ?",
            executionId);
    if (executions.isEmpty() || !PROOF_TRIGGER.equals(executions.get(0).get("trigger_source"))) {
      return false;
    }
    Map<String, Object> execution = executions.get(0);
    UUID testId = (UUID) execution.get("ui_test_id");
    UUID revisionId = (UUID) execution.get("revision_id");

    List<Map<String, Object>> tests =
        jdbc.queryForList(
            "SELECT candidate_revision_id, source_revision, configuration_revision FROM ui_tests"
                + " WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
            testId);
    if (tests.isEmpty() || !revisionId.equals(tests.get(0).get("candidate_revision_id"))) {
      return false; // late, stale or superseded
    }
    List<Map<String, Object>> revisions =
        jdbc.queryForList(
            "SELECT artifact::text AS artifact, source_revision, configuration_revision"
                + " FROM ui_test_revisions WHERE id = ? AND test_id = ?",
            revisionId,
            testId);
    if (revisions.isEmpty()
        || !revisions.get(0).get("source_revision").equals(tests.get(0).get("source_revision"))
        || !revisions
            .get(0)
            .get("configuration_revision")
            .equals(tests.get(0).get("configuration_revision"))) {
      return false; // the draft was edited after this revision was recorded
    }

    JsonNode steps;
    JsonNode planned;
    try {
      steps = MAPPER.readTree(String.valueOf(execution.get("steps")));
      planned = MAPPER.readTree(String.valueOf(revisions.get(0).get("artifact"))).path("steps");
    } catch (JsonProcessingException unreadable) {
      return false;
    }
    if (!steps.isArray() || !planned.isArray() || steps.size() != planned.size()) {
      return false;
    }

    boolean allPassed = true;
    List<Object[]> rows = new ArrayList<>();
    for (int index = 0; index < planned.size(); index++) {
      JsonNode step = steps.get(index);
      JsonNode receipt = step.path("receipt");
      JsonNode operation = planned.get(index).path("operations").path(0).path("operation");
      String expectedHash = operation.isObject() ? GuidedContracts.hash(operation) : "";
      boolean hashMatches =
          receipt.isObject()
              && !expectedHash.isEmpty()
              && expectedHash.equals(receipt.path("stepHash").asText());
      String status;
      if (!hashMatches) {
        status = "NOT_RUN";
      } else if ("PASS".equals(step.path("status").asText())
          && receipt.path("closedCode").isNull()) {
        status = "PASSED";
      } else if ("FAIL".equals(step.path("status").asText())) {
        status = "FAILED";
      } else {
        status = "NOT_RUN";
      }
      allPassed &= "PASSED".equals(status);
      rows.add(
          new Object[] {
            revisionId,
            index,
            executionId,
            status,
            hashMatches ? expectedHash : null,
            receipt.isObject() ? receipt.toString() : null
          });
    }

    jdbc.update("DELETE FROM studio_step_receipts WHERE revision_id = ?", revisionId);
    for (Object[] row : rows) {
      jdbc.update(
          "INSERT INTO studio_step_receipts (revision_id, step_ordinal, proof_execution_id,"
              + " status, step_hash, receipt) VALUES (?,?,?,?,?,?::jsonb)",
          row);
    }
    // Examples come only from PASSED receipts and only once this transaction has committed.
    examples.recordProvenAfterCommit(revisionId);
    if (!allPassed || !"PASSED".equals(execution.get("status"))) {
      return false;
    }
    return jdbc.update(
            "UPDATE ui_tests SET confirmed_revision_id = candidate_revision_id,"
                + " candidate_revision_id = NULL WHERE id = ? AND candidate_revision_id = ?",
            testId,
            revisionId)
        == 1;
  }

  /**
   * The verification of a recorded candidate, derived on every read from its latest proof execution
   * and its receipts. {@code PENDING} while the proof runs; {@code FAILED} after a failed step;
   * {@code INCOMPLETE} for everything else, including a proof that passed but did not promote
   * (missing or tampered receipts), so the author is always offered an action.
   *
   * @param testId the test
   * @param candidateId its recorded revision
   * @return the state and the first step without a PASSED receipt
   */
  public Verification verification(UUID testId, UUID candidateId) {
    List<Map<String, Object>> proofs =
        jdbc.queryForList(
            "SELECT status FROM ui_test_executions WHERE ui_test_id = ? AND revision_id = ?"
                + " AND trigger_source = ? ORDER BY started_at DESC LIMIT 1",
            testId,
            candidateId,
            PROOF_TRIGGER);
    String state = Verification.INCOMPLETE;
    if (!proofs.isEmpty()) {
      Object status = proofs.get(0).get("status");
      if ("PENDING".equals(status) || "RUNNING".equals(status)) {
        state = Verification.PENDING;
      } else if ("FAILED".equals(status)) {
        state = Verification.FAILED;
      }
    }
    List<String> stepIds = stepIds(candidateId);
    java.util.Set<Integer> passed = new java.util.HashSet<>();
    for (Map<String, Object> receipt :
        jdbc.queryForList(
            "SELECT step_ordinal FROM studio_step_receipts WHERE revision_id = ? AND status ="
                + " 'PASSED'",
            candidateId)) {
      passed.add(((Number) receipt.get("step_ordinal")).intValue());
    }
    UUID first = null;
    for (int index = 0; index < stepIds.size() && first == null; index++) {
      if (!passed.contains(index)) {
        first = UUID.fromString(stepIds.get(index));
      }
    }
    if (first == null && !stepIds.isEmpty()) {
      first = UUID.fromString(stepIds.get(0));
    }
    return new Verification(state, first);
  }

  private List<String> stepIds(UUID revisionId) {
    String artifact =
        jdbc.queryForObject(
            "SELECT artifact::text FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
    List<String> ids = new ArrayList<>();
    try {
      for (JsonNode step : MAPPER.readTree(artifact).path("steps")) {
        ids.add(step.path("stepId").asText());
      }
    } catch (JsonProcessingException unreadable) {
      return List.of();
    }
    return ids;
  }
}
