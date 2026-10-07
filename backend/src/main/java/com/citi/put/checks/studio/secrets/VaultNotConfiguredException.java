package com.citi.put.checks.studio.secrets;

/**
 * No Vault is connected in this deployment (provider {@code none}).
 *
 * <p>Deliberately <b>not</b> a {@link VaultProviderUnavailableException}: "not configured", "Vault
 * is down" and "no such secret" are three different answers, and the handlers keep them apart.
 * Nothing falls back to another store.
 */
public final class VaultNotConfiguredException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public VaultNotConfiguredException() {
    super("No Studio vault provider is connected in this deployment");
  }
}
