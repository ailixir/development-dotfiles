package com.citi.put.checks.studio.internal;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.UITestExecutionRepository;
import com.citi.put.checks.studio.dispatch.DispatchState;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionLogEntry;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.internal.dto.ProgressAck;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Applies a runner report, or refuses it (AC-20 – AC-27).
 *
 * <p><b>Acknowledge only after commit.</b> This method is the transaction; the controller writes
 * the response after it returns. Because the runner retries a terminal report byte-identically
 * until it is acknowledged (10.6 AC-17) and holds no durable store to replay from, an
 * acknowledgement sent before the commit loses a terminal result on a crash. The ordering is the
 * criterion, not a note.
 *
 * <p><b>One conditional statement per report.</b> Ownership, sequence and the permitted transition
 * all sit in the {@code WHERE} of the statement that applies the change; zero rows is a {@code 409}
 * and never a silent {@code 200}.
 *
 * <p><b>The one asymmetry that matters.</b> A duplicate delivery of an already-applied {@code
 * (attemptId, runnerSequence)} from the <em>exactly matching</em> identity is {@code 200} applying
 * nothing. A <em>differing</em> identity is {@code 409}. The rule is symmetric across both internal
 * routes and is named that way here on purpose: a byte-identical re-delivery is the same owner
 * obeying the retry-until-acknowledged rule this API imposed, and answering {@code 409} would write
 * a false ownership-loss line for a runner that did exactly as instructed.
 */
@Service
public class ProgressReportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(ProgressReportService.class);

  private static final TypeReference<List<StepResult>> STEP_RESULTS = new TypeReference<>() {};

  private final StudioDispatchLedgerStatements statements;
  private final UITestExecutionRepository executions;
  private final StudioService studioService;
  private final StudioExecutionProperties properties;
  private final ObjectMapper objectMapper;
  private final List<ReportCommitHook> commitHooks;
  private final Clock clock;

  /**
   * The report is applied by SQL statements, not by JPA. Anything this transaction has already
   * loaded through JPA — the history row read for the revision's ordered source — is therefore
   * stale the moment a statement lands, and Hibernate's first-level cache would hand that stale
   * copy back to the acknowledgement and to the last-run projection. Clearing the session after a
   * successful application is what makes both read the row the database actually holds.
   */
  @PersistenceContext private EntityManager entityManager;

  @Autowired
  public ProgressReportService(
      StudioDispatchLedgerStatements statements,
      UITestExecutionRepository executions,
      StudioService studioService,
      StudioExecutionProperties properties,
      ObjectMapper objectMapper,
      List<ReportCommitHook> commitHooks) {
    this(
        statements,
        executions,
        studioService,
        properties,
        objectMapper,
        commitHooks,
        Clock.systemUTC());
  }

  ProgressReportService(
      StudioDispatchLedgerStatements statements,
      UITestExecutionRepository executions,
      StudioService studioService,
      StudioExecutionProperties properties,
      ObjectMapper objectMapper,
      List<ReportCommitHook> commitHooks,
      Clock clock) {
    this.statements = statements;
    this.executions = executions;
    this.studioService = studioService;
    this.properties = properties;
    this.objectMapper = objectMapper;
    this.commitHooks = commitHooks == null ? List.of() : List.copyOf(commitHooks);
    this.clock = clock;
  }

  /**
   * A seam that runs inside the report transaction, just before it commits.
   *
   * <p>Production registers none. It exists so that AC-20's "a commit failure injected after the
   * handler's work yields a non-{@code 200}" is decidable at the HTTP boundary rather than asserted
   * by inspection, which is the difference between a tested ordering and an intended one.
   */
  public interface ReportCommitHook {

    void beforeCommit(UUID executionId);
  }

  /** Applies one report. Returns the acknowledgement the route sends after commit. */
  @Transactional
  public ProgressAck apply(UUID pathExecutionId, RunnerReport report) {
    registerCommitHooks(pathExecutionId);
    enforceBounds(report);
    requireMatchingIdentity(pathExecutionId, report);

    UITestExecution execution =
        executions
            .findByExecutionId(pathExecutionId)
            .orElseThrow(
                () ->
                    InternalCallbackException.conflict(
                        InternalCallbackCodes.EXECUTION_UNKNOWN,
                        "No execution with this id is accepting reports"));

    RunnerReportProjection.Projected projected =
        RunnerReportProjection.project(
            report,
            originalSteps(execution),
            properties.evidenceRetentionOrDefault(),
            clock.instant(),
            // Write-once and never cleared, so reading it ahead of the statement cannot be
            // contradicted by it; and a runner can only have been told to cancel after the request
            // committed (ADR-002 §29).
            statements.isCancelRequested(pathExecutionId));

    long sequence = report.runnerSequence();
    int applied = applyByKind(report, projected, sequence);

    if (applied == 1) {
      entityManager.clear();
      if (RunnerReport.FINAL.equals(report.kind())) {
        afterFinal(report, projected);
      }
      return ack(pathExecutionId, sequence, true);
    }

    // Zero rows. The verdict is already taken; what follows only names it.
    if (statements.isAlreadyApplied(
        report.executionId(),
        report.attemptId(),
        report.admissionId(),
        report.runnerInstanceId(),
        sequence)) {
      // The same owner, the same sequence, re-delivered. 200, applying nothing.
      return ack(pathExecutionId, sequence, false);
    }
    if (RunnerReport.FINAL.equals(report.kind())
        && settleEvidenceOnFinalized(report, projected, sequence) == 1) {
      entityManager.clear();
      afterFinal(report, projected);
      return ack(pathExecutionId, sequence, true);
    }
    throw refusal(pathExecutionId, report, sequence);
  }

  /** Dispatches to the one statement this report kind is applied by. */
  private int applyByKind(
      RunnerReport report, RunnerReportProjection.Projected projected, long sequence) {
    if (RunnerReport.STARTED.equals(report.kind())) {
      return applyStarted(report, projected, sequence);
    }
    if (RunnerReport.PROGRESS.equals(report.kind())) {
      return applyProgress(report, projected, sequence);
    }
    if (RunnerReport.FINAL.equals(report.kind())) {
      return applyFinal(report, projected, sequence);
    }
    return 0;
  }

  private int applyStarted(
      RunnerReport report, RunnerReportProjection.Projected projected, long sequence) {
    if (report.browserStartedAt() == null) {
      // RUNNING is written only by a committed STARTED report that carries a non-null
      // browserStartedAt and comes from the owning admission (§5.1.5, §8.2).
      throw InternalCallbackException.badRequest(
          InternalCallbackCodes.INVALID_REPORT,
          "A STARTED report must carry browserStartedAt; RUNNING is written by nothing else");
    }
    return statements.applyStarted(
        report.executionId(),
        report.attemptId(),
        report.admissionId(),
        report.runnerInstanceId(),
        sequence,
        report.browserStartedAt(),
        writeJson(projected.stepResults()),
        writeJson(projected.logs()),
        projected.logsTruncated(),
        writeJson(projected.runtime()));
  }

  private int applyProgress(
      RunnerReport report, RunnerReportProjection.Projected projected, long sequence) {
    return statements.applyProgress(
        report.executionId(),
        report.attemptId(),
        report.admissionId(),
        report.runnerInstanceId(),
        sequence,
        writeJson(projected.stepResults()),
        writeJson(projected.logs()),
        projected.logsTruncated(),
        writeJson(projected.runtime()));
  }

  private int applyFinal(
      RunnerReport report, RunnerReportProjection.Projected projected, long sequence) {
    if (projected.status() == null) {
      throw InternalCallbackException.badRequest(
          InternalCallbackCodes.INVALID_REPORT, "A FINAL report must carry an outcome");
    }
    return statements.applyFinal(
        report.executionId(),
        report.attemptId(),
        report.admissionId(),
        report.runnerInstanceId(),
        sequence,
        projected.status(),
        projected.errorCode(),
        projected.endedAt(),
        projected.durationMs(),
        writeJson(projected.stepResults()),
        writeJson(withDiagnostic(projected)),
        projected.logsTruncated(),
        writeJson(projected.runtime()),
        projected.videoKey(),
        projected.videoStatus(),
        projected.videoError(),
        projected.videoPartial(),
        projected.videoExpiresAt(),
        projected.manifestKey());
  }

  /**
   * A later {@code FINAL} that only moves the evidence disposition (AC-25).
   *
   * <p>The outcome is not in the statement's {@code SET} list, so an upload failure can never
   * overwrite a known outcome; {@code streamComplete} flips with a new revision when evidence
   * settles.
   */
  private int settleEvidenceOnFinalized(
      RunnerReport report, RunnerReportProjection.Projected projected, long sequence) {
    if (projected.videoStatus() == null) {
      return 0;
    }
    return statements.settleEvidence(
        report.executionId(),
        report.attemptId(),
        report.admissionId(),
        report.runnerInstanceId(),
        sequence,
        projected.videoKey(),
        projected.videoStatus(),
        projected.videoError(),
        projected.videoPartial(),
        projected.videoExpiresAt(),
        writeJson(withDiagnostic(projected)),
        projected.logsTruncated());
  }

  /**
   * Closes the ledger once outcome <em>and</em> evidence are both settled, and moves the last-run
   * projection forward — and only forward (AC-27).
   */
  private void afterFinal(RunnerReport report, RunnerReportProjection.Projected projected) {
    studioService.applyLastRunProjection(report.executionId());
    if (projected.videoStatus() != null
        && !VideoEvidence.PROCESSING.equals(projected.videoStatus())) {
      statements.closeFinalized(report.executionId());
    }
  }

  /**
   * The bounds §5.4 requires, all from one configuration source (AC-26).
   *
   * <p>{@code logsTruncated} and {@code payloadReduced} are both <b>persisted</b> rather than
   * dropped: they are the API's only record that the runner shed diagnostics to deliver a result it
   * could not replay.
   */
  private void enforceBounds(RunnerReport report) {
    StudioExecutionProperties.Callback bounds = properties.callbackOrDefault();
    int steps = report.steps() == null ? 0 : report.steps().size();
    if (steps > bounds.maxStepsOrDefault()) {
      throw InternalCallbackException.tooLarge(
          InternalCallbackCodes.REPORT_TOO_LARGE,
          "The report carries " + steps + " steps; the bound is " + bounds.maxStepsOrDefault());
    }
    List<com.citi.put.checks.studio.internal.dto.RunnerLogEntry> logs =
        report.logs() == null ? List.of() : report.logs();
    if (logs.size() > bounds.maxLogEntriesOrDefault()) {
      throw InternalCallbackException.tooLarge(
          InternalCallbackCodes.REPORT_TOO_LARGE,
          "The report carries "
              + logs.size()
              + " log entries; the bound is "
              + bounds.maxLogEntriesOrDefault());
    }
    for (com.citi.put.checks.studio.internal.dto.RunnerLogEntry entry : logs) {
      if (entry.message() != null
          && entry.message().length() > bounds.maxLogEntryCharsOrDefault()) {
        throw InternalCallbackException.tooLarge(
            InternalCallbackCodes.REPORT_TOO_LARGE,
            "A log entry is over the " + bounds.maxLogEntryCharsOrDefault() + " character bound");
      }
    }
  }

  private void requireMatchingIdentity(UUID pathExecutionId, RunnerReport report) {
    if (report.executionId() == null || !report.executionId().equals(pathExecutionId)) {
      throw InternalCallbackException.badRequest(
          InternalCallbackCodes.INVALID_REPORT, "The report's executionId does not match the path");
    }
    if (report.attemptId() == null
        || report.admissionId() == null
        || report.runnerInstanceId() == null
        || report.runnerInstanceId().isBlank()) {
      throw InternalCallbackException.badRequest(
          InternalCallbackCodes.INVALID_REPORT,
          "attemptId, admissionId and runnerInstanceId are all required on every report");
    }
  }

  /**
   * Classifies a zero-row verdict, and records a late report for investigation.
   *
   * <p>§5.3: a delayed report "is recorded for investigation; it cannot silently change history or
   * trigger a new run". The record is this log line and nothing else — the history row is left
   * byte-identical, and no run is dispatched.
   */
  private InternalCallbackException refusal(UUID executionId, RunnerReport report, long sequence) {
    Optional<Map<String, Object>> found = statements.find(executionId);
    if (found.isEmpty()) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.EXECUTION_UNKNOWN, "No execution with this id");
    }
    Map<String, Object> row = found.get();
    String state = String.valueOf(row.get("state"));
    Object attemptId = row.get("attempt_id");
    Object admissionId = row.get("admission_id");
    Object runnerInstanceId = row.get("runner_instance_id");
    long lastSequence = ((Number) row.getOrDefault("last_runner_sequence", 0L)).longValue();

    if (DispatchState.DONE.name().equals(state)) {
      LOGGER.warn(
          "Late Studio runner report recorded for investigation: execution={} attempt={} "
              + "admission={} runner={} kind={} sequence={} arrived after the execution settled; "
              + "history unchanged and no run dispatched",
          executionId,
          report.attemptId(),
          report.admissionId(),
          report.runnerInstanceId(),
          report.kind(),
          sequence);
      return InternalCallbackException.conflict(
          InternalCallbackCodes.EXECUTION_SETTLED,
          "This execution is already settled; the report was recorded for investigation");
    }
    if (attemptId == null || !attemptId.toString().equals(String.valueOf(report.attemptId()))) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.ATTEMPT_SUPERSEDED, "A different attempt is current");
    }
    if (admissionId == null
        || !admissionId.toString().equals(String.valueOf(report.admissionId()))
        || !String.valueOf(runnerInstanceId).equals(report.runnerInstanceId())) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.ADMISSION_OWNED,
          "This attempt is owned by a different admission identity");
    }
    if (sequence <= lastSequence) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.SEQUENCE_REGRESSED,
          "Sequence " + sequence + " is not after the applied " + lastSequence);
    }
    return InternalCallbackException.conflict(
        InternalCallbackCodes.TRANSITION_REJECTED,
        "A " + report.kind() + " report is not a transition state " + state + " permits");
  }

  private ProgressAck ack(UUID executionId, long sequence, boolean applied) {
    long revision =
        executions
            .findByExecutionId(executionId)
            .map(UITestExecution::getSnapshotRevision)
            .orElse(0L);
    return new ProgressAck(executionId, sequence, applied, revision);
  }

  /** The revision's ordered source, which acceptance already wrote one entry per step of. */
  private List<StepResult> originalSteps(UITestExecution execution) {
    String json = execution.getStepResults();
    if (json == null || json.isBlank()) {
      return List.of();
    }
    try {
      List<StepResult> parsed = objectMapper.readValue(json, STEP_RESULTS);
      return parsed == null ? List.of() : List.copyOf(parsed);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Stored step_results are not readable", e);
    }
  }

  /** An API-produced diagnostic line, which is where an unmapped runner code lives (AC-16). */
  private List<ExecutionLogEntry> withDiagnostic(RunnerReportProjection.Projected projected) {
    if (projected.diagnostic() == null) {
      return projected.logs();
    }
    List<ExecutionLogEntry> logs = new ArrayList<>(projected.logs());
    String level = ExecutionStatus.ERROR.equals(projected.status()) ? "ERROR" : "INFO";
    logs.add(new ExecutionLogEntry(projected.endedAt(), level, projected.diagnostic(), null));
    return List.copyOf(logs);
  }

  private void registerCommitHooks(UUID executionId) {
    if (commitHooks.isEmpty() || !TransactionSynchronizationManager.isSynchronizationActive()) {
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void beforeCommit(boolean readOnly) {
            commitHooks.forEach(hook -> hook.beforeCommit(executionId));
          }
        });
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Could not serialize a projected report", e);
    }
  }
}
