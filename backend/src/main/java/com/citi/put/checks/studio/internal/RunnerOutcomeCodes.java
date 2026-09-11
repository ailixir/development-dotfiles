package com.citi.put.checks.studio.internal;

import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The explicit runner-outcome to API-vocabulary table (AC-16).
 *
 * <p><b>The API never copies a runner-supplied {@code outcome.errorCode} into {@code
 * ui_test_executions.error_code}.</b> ADR-002 §6.1 leaves that field an open string precisely
 * because every value {@link ExecutionErrorCode} enumerates is assigned by the API's dispatcher or
 * reapers, and the contract's mapping table records the two sets as disjoint. A pass-through would
 * let a component that cannot observe a condition publish the verdict for it — a {@code
 * START_TIMEOUT} the reaper never decided.
 *
 * <p>Exactly one mapping is fixed by a source today: §8.2's parent-enforced total timeout becomes
 * {@code ERROR / TIMEOUT}. Story 10.12 owns the rest (ADR-002 O-5). Until then an unmapped runner
 * code persists as {@code ERROR} with the raw code in the bounded diagnostic text and never in
 * {@code error_code}.
 */
public final class RunnerOutcomeCodes {

  /** The one runner-observable code §8.2 fixes. Nothing else is mapped, deliberately. */
  private static final Map<String, String> RUNNER_CODE_TO_API_CODE =
      Map.of("TIMEOUT", ExecutionErrorCode.TIMEOUT);

  /**
   * Codes the API assigns and a runner must never be able to obtain. Read from the enumeration
   * rather than copied, so a future addition cannot be missed here.
   */
  private static final Set<String> API_ASSIGNED = ExecutionErrorCode.values();

  private RunnerOutcomeCodes() {}

  /**
   * {@code outcome.result} onto the §8.2 status vocabulary. {@code PENDING}/{@code RUNNING} stay
   * API-owned.
   */
  public static String statusFor(String result) {
    return switch (result) {
      case RunOutcome.PASSED -> ExecutionStatus.PASSED;
      case RunOutcome.FAILED -> ExecutionStatus.FAILED;
      case RunOutcome.ERROR -> ExecutionStatus.ERROR;
      default -> throw new IllegalArgumentException("Unknown runner outcome result: " + result);
    };
  }

  /**
   * The API {@code error_code} for a runner outcome, or null.
   *
   * <p>Null for every unmapped value, including one that happens to spell an API-assigned code. A
   * runner cannot obtain a reaper's verdict by naming it.
   */
  public static String errorCodeFor(String result, String runnerErrorCode) {
    if (!ExecutionStatus.ERROR.equals(statusFor(result)) || runnerErrorCode == null) {
      return null;
    }
    String normalized = runnerErrorCode.toUpperCase(Locale.ROOT);
    return RUNNER_CODE_TO_API_CODE.get(normalized);
  }

  /** True when a runner emitted a code the API reserves for itself — recorded, never applied. */
  public static boolean isApiAssigned(String runnerErrorCode) {
    return runnerErrorCode != null
        && API_ASSIGNED.contains(runnerErrorCode.toUpperCase(Locale.ROOT));
  }
}
