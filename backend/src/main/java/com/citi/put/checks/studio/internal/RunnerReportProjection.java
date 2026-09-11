package com.citi.put.checks.studio.internal;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionLogEntry;
import com.citi.put.checks.studio.dto.RuntimeVersions;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The {@code RunnerReport → ExecutionSnapshot} projection (AC-24, AC-25, ADR-002 §INT-4).
 *
 * <p>The report is not the snapshot. They are different surfaces with different producers: one
 * carries the runner's vocabulary, the runner's clock and the runner's knowledge; the other is what
 * the API publishes after translating it. The mapping table on {@code RunnerReport} in the frozen
 * contract is the specification and each of its rows is implemented here.
 *
 * <p>Three rules bind the whole projection, each stated because each is a silent failure otherwise
 * (ADR-002 §11.7, binding):
 *
 * <ol>
 *   <li><b>The API applies no calibration and adds no origin.</b> Readings arrive already on the
 *       recording timeline. {@code offsetMs = round(startedAtMs)} and nothing more. In particular
 *       the API must <em>never</em> re-base readings against the lowest, first or earliest reading
 *       it has seen: that plausible-looking "fix" would have concealed the §11.1 two-origin defect
 *       rather than surfaced it, and {@code StepResult.offsetMs} now forbids it in the contract.
 *   <li><b>{@code 0} is a position, not a missing value.</b> Every check below is an explicit
 *       {@code != null}. A null-coalescing or truthiness-based projection would drop the
 *       browser-start line — the one entry that anchors the timeline.
 *   <li><b>The API rounds once, at persistence.</b> The wire is fractional by §4.3; {@code
 *       offsetMs} and {@code durationMs} are {@code int64} on the public snapshot. No intermediate
 *       rounding, and no second rounding on read.
 * </ol>
 *
 * <p>This class is correct by contract today and correct <em>in fact</em> when story 10.12 lands
 * the injected run clock. Until then a real runner still emits process-origin readings and these
 * derived instants will be absurd. That is the correct behaviour: the defect is upstream and
 * visible, and compensating for it here would install a second, undocumented calibration in the
 * component ADR-002 §11 just ruled must hold none, and it would outlive its cause by years.
 */
public final class RunnerReportProjection {

  /** §8.2's per-step vocabulary. {@code PASSED}/{@code FAILED} belong to the run, not to a step. */
  private static final Set<String> STEP_STATUSES =
      Set.of(
          StepResult.PENDING,
          StepResult.RUNNING,
          StepResult.PASS,
          StepResult.FAIL,
          StepResult.SKIPPED);

  /** The contract's own text, from example {@code SnapshotErrorTimeout}, {@code stepResults[1]}. */
  public static final String TIMED_OUT_STEP_MESSAGE = "Total browser runtime deadline reached";

  /** The runner's levels. {@code DEBUG} has no runner producer and appears only on API lines. */
  private static final Set<String> RUNNER_LEVELS = Set.of("info", "warn", "error");

  /** The two states in which no playable object exists, so partiality has no meaning (§17.3). */
  private static final Set<String> EVIDENCE_WITHOUT_AN_OBJECT =
      Set.of(RunnerEvidence.FAILED, RunnerEvidence.UNAVAILABLE);

  private static final Set<String> EVIDENCE_STATES =
      Set.of(
          RunnerEvidence.PENDING,
          RunnerEvidence.STORED,
          RunnerEvidence.FAILED,
          RunnerEvidence.UNAVAILABLE);

  private RunnerReportProjection() {}

  /** Everything one report projects onto the history row. */
  public record Projected(
      List<StepResult> stepResults,
      List<ExecutionLogEntry> logs,
      boolean logsTruncated,
      RuntimeVersions runtime,
      String status,
      String errorCode,
      String diagnostic,
      Instant endedAt,
      Integer durationMs,
      String videoKey,
      String videoStatus,
      String videoError,
      Boolean videoPartial,
      Instant videoExpiresAt,
      String manifestKey) {}

  /**
   * Projects one report.
   *
   * @param original the confirmed revision's ordered source, one entry per original step. The
   *     runner reports only the steps it touched; the gaps are filled {@code PENDING} from here,
   *     because the persisted result must carry one entry per original step (§4.4, §8.2) and {@code
   *     originalText} comes from the revision and is never echoed by the runner
   */
  public static Projected project(
      RunnerReport report, List<StepResult> original, Duration evidenceRetention, Instant now) {
    validate(report);

    List<StepResult> stepResults = projectSteps(report, original, terminalErrorCode(report));
    List<ExecutionLogEntry> logs = projectLogs(report);
    RuntimeVersions runtime = projectRuntime(report.runtimeVersions());

    String status = null;
    String errorCode = null;
    String diagnostic = null;
    Instant endedAt = null;
    Integer durationMs = null;
    if (report.outcome() != null) {
      status = RunnerOutcomeCodes.statusFor(report.outcome().result());
      errorCode =
          RunnerOutcomeCodes.errorCodeFor(report.outcome().result(), report.outcome().errorCode());
      diagnostic = diagnostic(report);
      endedAt = report.reportedAt();
      durationMs = browserDurationMs(report);
    }

    String videoKey = null;
    String videoStatus = null;
    String videoError = null;
    Boolean videoPartial = null;
    Instant videoExpiresAt = null;
    String manifestKey = null;
    if (report.evidence() != null) {
      videoKey = report.evidence().videoKey();
      videoStatus = projectEvidenceState(report.evidence().state());
      // The reported value, never a constant (O-13, ADR-002 §17.5). Absent means false — which is
      // defence in depth rather than the only protection, because the merged runner declares
      // `partial` non-optionally and "absent" is unreachable from it.
      videoPartial = Boolean.TRUE.equals(report.evidence().partial());
      manifestKey = report.evidence().manifestKey();
      if (VideoEvidence.AVAILABLE.equals(videoStatus)) {
        // AVAILABLE and EXPIRED are the API's judgment against retention, never the runner's:
        // it holds no Get and no List permission and can observe neither (§6.1, §6.2).
        videoExpiresAt = now.plus(evidenceRetention);
      }
      if (VideoEvidence.FAILED.equals(videoStatus)) {
        videoError = "The runner reported that evidence could not be stored";
      }
    }

    return new Projected(
        stepResults,
        logs,
        Boolean.TRUE.equals(report.logsTruncated()),
        runtime,
        status,
        errorCode,
        diagnostic,
        endedAt,
        durationMs,
        videoKey,
        videoStatus,
        videoError,
        videoPartial,
        videoExpiresAt,
        manifestKey);
  }

  /**
   * Shape validation. Everything here is a {@code 400} rather than a silent coercion, because a
   * silent coercion is a divergence nobody ever finds.
   */
  private static void validate(RunnerReport report) {
    if (report.kind() == null
        || !Set.of(RunnerReport.STARTED, RunnerReport.PROGRESS, RunnerReport.FINAL)
            .contains(report.kind())) {
      throw new StudioValidationException(
          "INVALID_REPORT", "Unknown report kind: " + report.kind());
    }
    if (report.runnerSequence() == null || report.runnerSequence() < 1) {
      throw new StudioValidationException(
          "INVALID_REPORT", "runnerSequence must be present and at least 1");
    }
    if (report.reportedAt() == null) {
      throw new StudioValidationException("INVALID_REPORT", "reportedAt is required");
    }

    boolean hasOrigin = report.browserStartedAt() != null;
    for (RunnerStepState step : steps(report)) {
      if (step.stepIndex() == null || step.stepIndex() < 0) {
        throw new StudioValidationException("INVALID_REPORT", "A step carries no stepIndex");
      }
      if (step.status() == null || !STEP_STATUSES.contains(step.status())) {
        throw new StudioValidationException(
            "INVALID_REPORT",
            "Step status '"
                + step.status()
                + "' is not the §8.2 per-step vocabulary PENDING|RUNNING|PASS|FAIL|SKIPPED");
      }
      if (!hasOrigin && (step.startedAtMs() != null || step.finishedAtMs() != null)) {
        throw new StudioValidationException(
            "INVALID_REPORT",
            "A report with browserStartedAt: null carries no reading; step "
                + step.stepIndex()
                + " carries one");
      }
    }
    for (RunnerLogEntry log : logs(report)) {
      if (log.level() == null || !RUNNER_LEVELS.contains(log.level())) {
        throw new StudioValidationException(
            "INVALID_REPORT", "Log level '" + log.level() + "' is not info|warn|error");
      }
      if (!hasOrigin && log.atMs() != null) {
        throw new StudioValidationException(
            "INVALID_REPORT",
            "A report with browserStartedAt: null carries no reading; a log entry carries one");
      }
    }
    if (report.outcome() != null) {
      String result = report.outcome().result();
      if (!Set.of("PASSED", "FAILED", "ERROR").contains(result)) {
        throw new StudioValidationException("INVALID_REPORT", "Unknown outcome result: " + result);
      }
    }
    if (report.evidence() != null && !EVIDENCE_STATES.contains(report.evidence().state())) {
      throw new StudioValidationException(
          "INVALID_REPORT", "Unknown evidence state: " + report.evidence().state());
    }
    if (report.evidence() != null
        && Boolean.TRUE.equals(report.evidence().partial())
        && EVIDENCE_WITHOUT_AN_OBJECT.contains(report.evidence().state())) {
      // ADR-002 §17.3: partiality is meaningful only where a playable object exists, so it is
      // false with FAILED and UNAVAILABLE "because a recording that does not exist is not a
      // partial one". A runner sending this combination has a bug in its stop observation, and
      // quietly forcing the value to false would hide it in the one component this story exists
      // to make honest.
      throw new StudioValidationException(
          "INVALID_REPORT",
          "evidence.partial is true with state "
              + report.evidence().state()
              + "; a recording that does not exist is not a partial one");
    }
  }

  /**
   * One entry per original step (§8.2). {@code originalText} comes from the revision; the runner
   * never resends it and this method never invents one.
   */
  private static List<StepResult> projectSteps(
      RunnerReport report, List<StepResult> original, String terminalErrorCode) {
    Map<Integer, RunnerStepState> reported = new HashMap<>();
    for (RunnerStepState step : steps(report)) {
      reported.put(step.stepIndex(), step);
    }
    List<StepResult> projected = new ArrayList<>(original.size());
    for (int index = 0; index < original.size(); index++) {
      StepResult base = original.get(index);
      RunnerStepState step = reported.get(index);
      if (step == null) {
        projected.add(StepResult.pending(index, base.originalText()));
        continue;
      }
      projected.add(
          new StepResult(
              index,
              base.originalText(),
              step.status(),
              // No calibration, no origin, no re-basing: round the reading and persist it.
              round(step.startedAtMs()),
              round(step.durationMs()),
              timedOutStepMessage(step, terminalErrorCode)));
    }
    // A runner that reported a step index the revision does not have is a divergence, not a step.
    for (Integer index : reported.keySet()) {
      if (index >= original.size()) {
        throw new StudioValidationException(
            "INVALID_REPORT",
            "Step index "
                + index
                + " is outside the confirmed revision's "
                + original.size()
                + " steps");
      }
    }
    return List.copyOf(projected);
  }

  /**
   * The message for a step the total-runtime deadline caught mid-flight (ADR-002 §18.1, O-13).
   *
   * <p>Until this existed {@code projectSteps} copied {@code failure} verbatim, so the contract's
   * {@code SnapshotErrorTimeout} example was aspirational and nothing produced it. The runner
   * cannot supply the message: the kill happens in the parent, the step's own reporter is inside a
   * process that is being stopped, and the step never reports a terminus at all.
   *
   * <p>The predicate is <b>exclusive</b> and §18.1 states it as one: the API "may write that
   * message only where it can name the cause — a terminal {@code errorCode} of {@code TIMEOUT} and
   * a step still {@code RUNNING} — and must invent nothing for any other code or status". So:
   *
   * <ul>
   *   <li>any other terminal code, {@code RUNNING} step or not — nothing is written;
   *   <li>{@code TIMEOUT} with no {@code RUNNING} step — nothing is written;
   *   <li>a step whose runner-supplied {@code failure} is already non-null — never overwritten,
   *       because the runner observed something and the API did not.
   * </ul>
   */
  private static String timedOutStepMessage(RunnerStepState step, String terminalErrorCode) {
    if (step.failure() != null) {
      return step.failure();
    }
    if (!ExecutionErrorCode.TIMEOUT.equals(terminalErrorCode)) {
      return null;
    }
    if (!StepResult.RUNNING.equals(step.status())) {
      return null;
    }
    return TIMED_OUT_STEP_MESSAGE;
  }

  /**
   * The terminal {@code error_code} this report projects to, or null.
   *
   * <p>Read through {@link RunnerOutcomeCodes} rather than from {@code outcome.errorCode}, so the
   * predicate is the <b>API's</b> verdict and not a string the runner chose. A runner naming a
   * reaper-assigned code obtains neither the code nor the message.
   */
  private static String terminalErrorCode(RunnerReport report) {
    if (report.outcome() == null) {
      return null;
    }
    return RunnerOutcomeCodes.errorCodeFor(report.outcome().result(), report.outcome().errorCode());
  }

  /**
   * {@code logs[].atMs → logs[].at}, derived as {@code browserStartedAt + atMs} and by nothing
   * else.
   *
   * <p>{@code atMs = 0} is the browser start and yields exactly {@code browserStartedAt}. {@code
   * atMs = null} yields {@code at = null} and is never rendered as the epoch and never as the
   * browser start. Where {@code browserStartedAt} is itself null there is no input to the
   * derivation, and validation has already refused any report that carried a reading anyway.
   */
  private static List<ExecutionLogEntry> projectLogs(RunnerReport report) {
    Instant origin = report.browserStartedAt();
    List<ExecutionLogEntry> projected = new ArrayList<>();
    for (RunnerLogEntry entry : logs(report)) {
      Instant at = null;
      if (entry.atMs() != null && origin != null) {
        at = origin.plusMillis(Math.round(entry.atMs()));
      }
      projected.add(
          new ExecutionLogEntry(at, entry.level().toUpperCase(Locale.ROOT), entry.message(), null));
    }
    return List.copyOf(projected);
  }

  /** {@code runtimeVersions} (open) onto the §4.6 subset the execution keeps. */
  private static RuntimeVersions projectRuntime(Map<String, Object> reported) {
    if (reported == null || reported.isEmpty()) {
      return RuntimeVersions.unknown();
    }
    return new RuntimeVersions(
        text(reported, "playwright"),
        text(reported, "chromium"),
        text(reported, "validator", "validatorSchema"),
        text(reported, "executor"),
        text(reported, "image"));
  }

  /** {@code evidence.state → video.status} (§6.1). {@code EXPIRED} is never reported. */
  private static String projectEvidenceState(String state) {
    return switch (state) {
      case RunnerEvidence.PENDING -> VideoEvidence.PROCESSING;
      case RunnerEvidence.STORED -> VideoEvidence.AVAILABLE;
      case RunnerEvidence.FAILED -> VideoEvidence.FAILED;
      case RunnerEvidence.UNAVAILABLE -> VideoEvidence.UNAVAILABLE;
      default ->
          throw new StudioValidationException("INVALID_REPORT", "Unknown evidence state: " + state);
    };
  }

  /**
   * Browser execution time only; queue time is a separate budget (§8.2). Null until the browser
   * actually started, because there is no origin to measure from.
   */
  private static Integer browserDurationMs(RunnerReport report) {
    if (report.browserStartedAt() == null || report.reportedAt() == null) {
      return null;
    }
    long millis = Duration.between(report.browserStartedAt(), report.reportedAt()).toMillis();
    return millis < 0 ? null : (int) Math.min(millis, Integer.MAX_VALUE);
  }

  /**
   * The bounded diagnostic text. An unmapped runner code is recorded here and never in {@code
   * error_code} (AC-16) — including, and especially, one that spells a code the API reserves.
   */
  private static String diagnostic(RunnerReport report) {
    StringBuilder text = new StringBuilder();
    if (report.outcome().errorCode() != null && !report.outcome().errorCode().isBlank()) {
      text.append("runnerErrorCode=").append(report.outcome().errorCode());
    }
    if (report.outcome().errorMessage() != null && !report.outcome().errorMessage().isBlank()) {
      if (text.length() > 0) {
        text.append(' ');
      }
      text.append(report.outcome().errorMessage());
    }
    if (text.length() == 0) {
      return null;
    }
    return text.length() > 2000 ? text.substring(0, 2000) : text.toString();
  }

  private static List<RunnerStepState> steps(RunnerReport report) {
    return report.steps() == null ? List.of() : report.steps();
  }

  private static List<RunnerLogEntry> logs(RunnerReport report) {
    return report.logs() == null ? List.of() : report.logs();
  }

  /**
   * The one rounding, at persistence. {@code null} stays {@code null}; {@code 0.0} stays {@code 0}.
   */
  private static Long round(Double value) {
    return value == null ? null : Math.round(value);
  }

  private static String text(Map<String, Object> source, String... keys) {
    for (String key : keys) {
      Object value = source.get(key);
      if (value != null) {
        return String.valueOf(value);
      }
    }
    return null;
  }
}
