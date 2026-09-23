package com.citi.put.checks.studio.secrets;

/**
 * Secret use as its own authorization decision (§9.2, AC-4).
 *
 * <p>§9.2's closing sentence is <em>"Secret reference names alone grant no permission"</em>, and
 * `ED-02` names <em>"real vault integration <b>with secret-use authorization</b>"</em> as a thing
 * distinct from identity. Studio execution is open to every authenticated user, but that does not
 * entitle a principal to every reference a draft names.
 *
 * <p>So this seam is consulted <b>separately</b> from execution admission. An implementation that
 * returned {@code true} merely because the principal may execute would make this a decorative
 * interface and disclose secret material to every user.
 */
public interface StudioSecretUseAuthorization {

  /**
   * Whether this principal may use this secret for this CSI and environment.
   *
   * <p>Fail-closed: an unknown principal, an unknown secret or an absent policy is {@code false}.
   * §9.1 requires absent identity to fail closed and this is the same rule one layer in.
   *
   * @param principal the accepting or dispatching principal
   * @param csiId the execution's own immutable CSI
   * @param environment the environment snapshotted at acceptance
   * @param secretId the declared {@code vars.secret} id
   * @return true only when an explicit entitlement says so
   */
  boolean mayUse(String principal, String csiId, String environment, String secretId);
}
