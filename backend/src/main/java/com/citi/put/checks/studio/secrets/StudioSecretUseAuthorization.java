package com.citi.put.checks.studio.secrets;

/**
 * Secret use as its own authorization decision (§9.2, AC-4).
 *
 * <p>§9.2's closing sentence is <em>"Secret reference names alone grant no permission"</em>, and
 * `ED-02` names <em>"real vault integration <b>with secret-use authorization</b>"</em> as a thing
 * distinct from identity. §9.1 gives owners and authorized administrators execute; it does not say
 * that executing a draft entitles a principal to every reference the draft names.
 *
 * <p>So this seam is consulted <b>separately</b> from {@code CsiOwnershipEvaluator} and the
 * acceptance path consults both. An implementation that answered {@code canExecute(auth, csiId)}
 * here would collapse the two decisions back into one and is the mutation AC-4 names; an
 * implementation that returned {@code true} unconditionally would make this a decorative interface
 * and is the other. Both must turn the same named test red, and both are recorded.
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
