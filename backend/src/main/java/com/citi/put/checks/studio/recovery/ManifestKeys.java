package com.citi.put.checks.studio.recovery;

/**
 * The deterministic manifest key (§6.2, AC-31).
 *
 * <p>Every component is immutable from the moment acceptance commits, which is the whole property:
 * the key a run's manifest is written under is computable by the API at any later time, from a row
 * it already holds, without asking anybody and without listing anything. That is what lets recovery
 * read the <b>real</b> outcome after a delivery is lost.
 *
 * <p>The shape matches the frozen contract's {@code RunnerEvidence} example exactly, so the runner
 * and the API derive the same string from the same identity rather than agreeing by convention.
 */
public final class ManifestKeys {

  private ManifestKeys() {}

  /** {@code studio/{csiId}/{testId}/{executionId}/{attemptId}.result.json}. */
  public static String manifestKey(ResultManifestStore.ExecutionIdentity identity) {
    return prefix(identity) + ".result.json";
  }

  /** {@code studio/{csiId}/{testId}/{executionId}/{attemptId}.webm}. */
  public static String videoKey(ResultManifestStore.ExecutionIdentity identity) {
    return prefix(identity) + ".webm";
  }

  private static String prefix(ResultManifestStore.ExecutionIdentity identity) {
    return "studio/"
        + identity.csiId()
        + "/"
        + identity.testId()
        + "/"
        + identity.executionId()
        + "/"
        + identity.attemptId();
  }
}
