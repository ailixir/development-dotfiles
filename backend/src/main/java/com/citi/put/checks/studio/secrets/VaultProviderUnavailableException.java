package com.citi.put.checks.studio.secrets;

/** Vault answered incorrectly or could not be reached; never confused with an absent reference. */
public final class VaultProviderUnavailableException extends RuntimeException {
  public VaultProviderUnavailableException(String message) {
    super(message);
  }

  public VaultProviderUnavailableException(String message, Throwable cause) {
    super(message, cause);
  }
}
