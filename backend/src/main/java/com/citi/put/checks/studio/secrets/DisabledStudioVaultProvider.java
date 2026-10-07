package com.citi.put.checks.studio.secrets;

import java.util.List;
import java.util.Optional;

/**
 * Explicit default-off provider. Every reference is unavailable and no external call is made.
 *
 * <p>A read answers "absent", which acceptance reports as an unknown reference. Saving or listing
 * secrets is refused with {@link VaultNotConfiguredException}: there is no other store to fall back
 * to.
 */
public final class DisabledStudioVaultProvider implements StudioVaultProvider {
  public static final String NAME = "none";

  @Override
  public String name() {
    return NAME;
  }

  @Override
  public Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String referenceName) {
    return Optional.empty();
  }

  @Override
  public String create(VaultScope scope, String name, char[] value, List<String> origins) {
    throw new VaultNotConfiguredException();
  }

  @Override
  public List<String> listSecretNames(VaultScope scope) {
    throw new VaultNotConfiguredException();
  }
}
