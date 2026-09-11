package com.citi.put.checks.studio.secrets;

import java.util.Optional;

/**
 * The one seam a resolved variable or secret value comes through (§9.2, AC-9).
 *
 * <p>Everything above this interface deals in reference <em>names</em>. Everything a value could
 * come from is behind it. That is the point: there is exactly one place to look when asking "where
 * could a value have entered this process", and exactly one place for `ED-02`'s real vault to land.
 *
 * <p><b>No implementation is selected by default.</b> {@link StudioVaultConfiguration} refuses to
 * start the application when {@code studio.secrets.vault.provider} is absent or unrecognised, and
 * the fake is unreachable outside the development and test profiles. A fake vault that can be
 * reached in production is worse than no vault, and it is cheaper to make impossible than to
 * detect.
 *
 * <p>Values are {@code char[]} the whole way, so a caller can erase what it was given. A provider
 * returns a fresh array on every read and retains no reference a caller's {@code close()} could
 * fail to reach.
 */
public interface StudioVaultProvider {

  /**
   * The provider's name, as it appears in the startup line and on the health surface.
   *
   * <p>A deployment running on a fake vault says so out loud (AC-9).
   */
  String name();

  /**
   * Reads one declared reference for one CSI and environment.
   *
   * <p>The CSI and the environment are the execution's own immutable values (§8.1, §9.1 —
   * <em>"Historical access uses execution CSI, not a mutable parent lookup"</em>), so moving or
   * editing the parent draft between acceptance and dispatch changes nothing here.
   *
   * @param kind whether this is a {@code vars.get} name or a {@code vars.secret} id
   * @param csiId the execution's own CSI
   * @param environment the environment snapshotted at acceptance
   * @param referenceName the declared name
   * @return the value and its nonsecret version identifier, or empty when there is no such
   *     reference for this CSI and environment
   */
  Optional<VaultEntry> read(
      ReferenceKind kind, String csiId, String environment, String referenceName);

  /** Which of the two declaration arrays a name came from. */
  enum ReferenceKind {
    VARIABLE,
    SECRET
  }

  /**
   * One read.
   *
   * @param value a fresh array the caller owns and is expected to erase
   * @param versionIdentifier a nonsecret opaque string (§4.2). Never the value and never derived
   *     from it — a rotation of a value to itself still changes it, so it cannot be used to compare
   *     two values
   */
  record VaultEntry(char[] value, String versionIdentifier) {}
}
