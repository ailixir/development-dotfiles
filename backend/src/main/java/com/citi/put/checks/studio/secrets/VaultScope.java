package com.citi.put.checks.studio.secrets;

import java.util.UUID;

/**
 * Where one test's references live in Vault: the CSI, the environment and the test id.
 *
 * <p>Save, list, acceptance preflight and dispatch resolution all build this from the same three
 * values, taken from persisted rows and never from a request body, and render it through the one
 * path template. That is what makes a secret saved for a test the secret that test resolves.
 *
 * @param csiId the test's (or the execution's own) CSI
 * @param environment the test's environment, or the one snapshotted at acceptance
 * @param testId the test id, in canonical lowercase UUID form
 */
public record VaultScope(String csiId, String environment, String testId) {

  /**
   * The scope for a test id. Every caller holds a {@link UUID}, so every caller renders the same
   * canonical lowercase string.
   */
  public static VaultScope of(String csiId, String environment, UUID testId) {
    return new VaultScope(csiId, environment, testId == null ? null : testId.toString());
  }
}
