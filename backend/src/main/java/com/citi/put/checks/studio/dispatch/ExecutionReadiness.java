package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.entity.UITest;

/**
 * The readiness gate acceptance consults, and the only one it consults (AC-8a).
 *
 * <p>The shape of this seam is fixed by @po so that stories 10.7 and 10.8 cannot produce two of it.
 * Story 10.7a declared this interface and supplied a provisional implementation; story 10.8
 * supplied {@code com.citi.put.checks.studio.readiness.ExecutionReadinessService} as the full
 * implementation of this same interface and <b>deleted the provisional one</b>, which is why no
 * implementation of this interface lives in this package any more. Neither story introduced a
 * second type, and the acceptance path is wired to this interface and never to a concrete class —
 * so 10.8 replaced one implementation rather than hunting a condition scattered across the
 * acceptance path.
 *
 * <p>{@link Verdict} already carries both refusals §4.6 names, so 10.8 widens the predicate without
 * widening the type.
 */
public interface ExecutionReadiness {

  /** Why an execution may not be accepted, or {@link Verdict#accepted()} when it may. */
  record Verdict(boolean ready, String errorCode, String message) {

    /** {@code 409 LEARN_REQUIRED} (ADR-SC-005, defaults "Readiness vocabulary"). */
    public static final String LEARN_REQUIRED = "LEARN_REQUIRED";

    /** {@code 409 RUNTIME_INCOMPATIBLE} (§4.6, §8.3). */
    public static final String RUNTIME_INCOMPATIBLE = "RUNTIME_INCOMPATIBLE";

    public static Verdict accepted() {
      return new Verdict(true, null, null);
    }

    public static Verdict learnRequired(String message) {
      return new Verdict(false, LEARN_REQUIRED, message);
    }

    public static Verdict runtimeIncompatible(String message) {
      return new Verdict(false, RUNTIME_INCOMPATIBLE, message);
    }
  }

  /** Decides whether this draft may be executed now. Never throws for an unready draft. */
  Verdict evaluate(UITest test);
}
