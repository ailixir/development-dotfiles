package com.citi.put.checks.studio.secrets;

import java.util.Optional;

/** Explicit default-off provider. Every reference is unavailable and no external call is made. */
public final class DisabledStudioVaultProvider implements StudioVaultProvider {
  public static final String NAME = "none";

  @Override
  public String name() {
    return NAME;
  }

  @Override
  public Optional<VaultEntry> read(
      ReferenceKind kind, String csiId, String environment, String referenceName) {
    return Optional.empty();
  }
}
