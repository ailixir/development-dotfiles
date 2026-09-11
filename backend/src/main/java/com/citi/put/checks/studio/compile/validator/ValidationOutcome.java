package com.citi.put.checks.studio.compile.validator;

import java.util.List;

/**
 * The result of the single {@code POST /v1/validate} call one compile attempt is allowed (Story
 * 10.8, AC-12a, AC-13).
 *
 * <p>Three outcomes, and the distinction between the last two is the point of this type:
 *
 * <ul>
 *   <li><b>unavailable</b> — timeout, transport loss or {@code 5xx}. The validator never answered,
 *       so there is no verdict to act on. This is a compile <em>failure</em>: {@code STALE},
 *       retryable, never a guessed verdict and never a second call.
 *   <li><b>rejected</b> ({@code available && !ok}) — the validator answered {@code 200 {ok:false}}.
 *       That is a <em>verdict</em>, not a transport failure; the contract is explicit that a
 *       rejected artifact is still a {@code 200}. It becomes {@code NEEDS_REVISION} with per-step
 *       diagnostics, never a {@code compile_error} and never a retry.
 *   <li><b>accepted</b> — the candidate may be published for confirmation.
 * </ul>
 *
 * @param available the validator produced a verdict
 * @param ok the verdict, meaningful only when {@code available}
 * @param validatorSchemaVersion the pinned validator schema version, recorded on provenance
 * @param diagnostics artifact-level diagnostics, belonging to no single step
 * @param steps one entry per artifact step, index aligned
 * @param failureReason bounded reason the validator was unavailable; never response content
 */
public record ValidationOutcome(
    boolean available,
    boolean ok,
    String validatorSchemaVersion,
    List<RunnerDiagnostic> diagnostics,
    List<StepVerdict> steps,
    String failureReason) {

  /**
   * One step's verdict.
   *
   * @param stepIndex index into the ordered source
   * @param ok whether this step validated
   * @param diagnostics this step's rejections
   */
  public record StepVerdict(int stepIndex, boolean ok, List<RunnerDiagnostic> diagnostics) {}

  /**
   * A verdict was produced.
   *
   * @param ok the verdict
   * @param validatorSchemaVersion version reported by the runner
   * @param diagnostics artifact-level diagnostics
   * @param steps per-step verdicts
   * @return the outcome
   */
  public static ValidationOutcome verdict(
      boolean ok,
      String validatorSchemaVersion,
      List<RunnerDiagnostic> diagnostics,
      List<StepVerdict> steps) {
    return new ValidationOutcome(
        true, ok, validatorSchemaVersion, List.copyOf(diagnostics), List.copyOf(steps), null);
  }

  /**
   * No verdict was produced.
   *
   * @param reason bounded description of what went wrong on the wire
   * @return the outcome
   */
  public static ValidationOutcome unavailable(String reason) {
    return new ValidationOutcome(false, false, null, List.of(), List.of(), reason);
  }
}
