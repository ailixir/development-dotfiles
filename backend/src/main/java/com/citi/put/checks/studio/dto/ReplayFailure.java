package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Set;

/**
 * The one named cause of a replay that stopped at a learned step (STUDIO-OBS-008 T0 ruling A1).
 *
 * <p>Derived by the API from the runner's terminal report and nothing else; see {@code
 * RunnerReportProjection}. It is value-free by construction: a closed code, the confirmed
 * revision's stable step ID, its 0-based position, and for {@link #LOGIN_REQUIRED} one boolean. It
 * never carries page text, URLs, selectors, observation data, diagnostic text or any secret or
 * variable value.
 *
 * <p>{@code components.schemas.ReplayFailure} in {@code docs/specs/studio/openapi.yaml} declares
 * the same set. A client never derives this from {@code stepResults[].message}, {@code logs} or
 * {@code status}.
 *
 * @param code {@link #LOGIN_REQUIRED} or {@link #TARGET_DRIFT}
 * @param stepId the stable authoring step ID of the confirmed revision that ran
 * @param stepIndex 0-based position of that step, in the {@code StepResult.stepIndex} space; {@code
 *     stepResults[stepIndex].status} is {@code FAIL}
 * @param loginStepsPresent present exactly when {@code code} is {@link #LOGIN_REQUIRED}: an earlier
 *     step of the run filled a secret
 */
public record ReplayFailure(
    String code,
    String stepId,
    int stepIndex,
    @JsonInclude(JsonInclude.Include.NON_NULL) Boolean loginStepsPresent) {

  public static final String LOGIN_REQUIRED = "LOGIN_REQUIRED";
  public static final String TARGET_DRIFT = "TARGET_DRIFT";

  private static final Set<String> VALUES = Set.of(LOGIN_REQUIRED, TARGET_DRIFT);

  /** The contract's own bound for {@code stepId}. */
  private static final int MAX_STEP_ID_LENGTH = 256;

  public ReplayFailure {
    if (code == null || !VALUES.contains(code)) {
      throw new IllegalArgumentException("Unknown replay failure code");
    }
    if (stepId == null || stepId.isEmpty() || stepId.length() > MAX_STEP_ID_LENGTH) {
      throw new IllegalArgumentException("Invalid replay failure step id");
    }
    if (stepIndex < 0) {
      throw new IllegalArgumentException("Invalid replay failure step index");
    }
    // The schema's if/then/else: the boolean exists exactly when the code is LOGIN_REQUIRED.
    if (LOGIN_REQUIRED.equals(code) != (loginStepsPresent != null)) {
      throw new IllegalArgumentException("Invalid replay failure login flag");
    }
  }

  /**
   * The login cause: the step that hit a sign-in wall, and whether earlier steps filled a secret.
   */
  public static ReplayFailure loginRequired(
      String stepId, int stepIndex, boolean loginStepsPresent) {
    return new ReplayFailure(LOGIN_REQUIRED, stepId, stepIndex, loginStepsPresent);
  }

  /** The drift cause: the learned target no longer matches the page. Carries no login flag. */
  public static ReplayFailure targetDrift(String stepId, int stepIndex) {
    return new ReplayFailure(TARGET_DRIFT, stepId, stepIndex, null);
  }

  /** The whole {@code code} enumeration. Read this; never copy it. */
  public static Set<String> values() {
    return VALUES;
  }
}
