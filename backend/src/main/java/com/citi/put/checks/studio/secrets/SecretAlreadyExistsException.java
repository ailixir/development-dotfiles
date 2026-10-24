package com.citi.put.checks.studio.secrets;

/**
 * A create-only write found a secret with this name already stored for the test.
 *
 * <p>Carries the name only. Studio does not rotate or replace a secret; the stored entry and its
 * version are left exactly as they were.
 */
public final class SecretAlreadyExistsException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public SecretAlreadyExistsException(String secretName) {
    super("A secret named '" + secretName + "' already exists for this test");
  }
}
