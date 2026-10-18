package com.citi.put.checks.studio.readiness;

import java.util.UUID;

/**
 * The answer the execute path consults before any dispatch effect (Story 10.8, AC-22, AC-24, AC-25;
 * ADR-SC-005).
 *
 * @param ready whether this test may execute
 * @param code {@code null} when ready; otherwise {@code LEARN_REQUIRED}, {@code
 *     RUNTIME_INCOMPATIBLE}, {@code TEST_DELETED} or {@code TEST_QUARANTINED}
 * @param message what needs to happen, in the author's terms — never merely "not ready"
 * @param revisionId the revision that would run, present only when ready
 */
public record ReadinessVerdict(boolean ready, String code, String message, UUID revisionId) {

  /** No published learned revision matches the draft; the author must Run to learn it. */
  public static final String LEARN_REQUIRED = "LEARN_REQUIRED";

  /** A published revision this runtime cannot verify for model-free replay. */
  public static final String RUNTIME_INCOMPATIBLE = "RUNTIME_INCOMPATIBLE";

  /** Soft-deleted, refused by its own existing code. */
  public static final String TEST_DELETED = "TEST_DELETED";

  /** Quarantined pending CSI resolution, refused by its own existing code. */
  public static final String TEST_QUARANTINED = "TEST_QUARANTINED";

  /**
   * Ready to execute.
   *
   * @param revisionId the confirmed revision that would run
   * @return the verdict
   */
  public static ReadinessVerdict ready(UUID revisionId) {
    return new ReadinessVerdict(true, null, null, revisionId);
  }

  /**
   * Refused, with a code and an actionable message.
   *
   * @param code the stable machine-readable code
   * @param message what needs to happen
   * @return the verdict
   */
  public static ReadinessVerdict refused(String code, String message) {
    return new ReadinessVerdict(false, code, message, null);
  }
}
