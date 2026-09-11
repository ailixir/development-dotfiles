package com.citi.put.checks.studio.dispatch;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The one seam through which a declared variable or secret reference becomes a value (§5.1.1,
 * §5.1.3, §9.2).
 *
 * <p>Two operations, deliberately separated, because §5.1.1 and §5.1.3 place them at different
 * points in the lifecycle and the separation is the security property:
 *
 * <ul>
 *   <li>{@link #preflight} runs at <b>acceptance</b> and resolves nothing that outlives the call.
 *       It checks that the declared names are references this CSI, environment and principal are
 *       permitted to use. An unknown or unpermitted reference is a {@code 400} naming the reference
 *       and never its value.
 *   <li>{@link #resolve} runs at <b>dispatch</b>, immediately before the send, and nowhere else.
 *       The values it returns are ephemeral: they are never written to the ledger, the history row,
 *       a log line, a retry buffer, a manifest or an SSE payload, and they are cleared on every
 *       exit path including the error path — which is what {@link Resolved} being {@link
 *       AutoCloseable} is for.
 * </ul>
 *
 * <p><b>Typed, since story 10.17.</b> Both operations take the revision's {@link
 * ReferenceDeclarations} rather than a flat list, because a secret and a variable are different
 * decisions: a secret's use is authorized separately (§9.2, <em>"Secret reference names alone grant
 * no permission"</em>) and the two resolved maps the contract declares cannot be filled from one
 * undifferentiated set.
 *
 * <p>Real vault integration and real per-principal entitlement are {@code ED-02} and story 10.18.
 * What ships here is the seam, a fake provider confined to development profiles, and the canaries
 * that prove values do not leak.
 */
public interface StudioReferenceResolver {

  /**
   * Names only, at acceptance. Retains nothing.
   *
   * @throws UnknownReferenceException when a name is unknown to this CSI/environment
   * @throws SecretUseNotAuthorizedException when the principal may not use a declared secret
   */
  void preflight(
      String csiId, String environment, String principal, ReferenceDeclarations declarations);

  /**
   * Values, at dispatch only.
   *
   * @throws ReferenceUnavailableException for a reference that has vanished since acceptance
   * @throws SecretUseRevokedException when entitlement was withdrawn since acceptance
   */
  Resolved resolve(
      String csiId, String environment, String principal, ReferenceDeclarations declarations);

  /** A declared reference this CSI may not use, or that does not exist. Never carries a value. */
  class UnknownReferenceException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String referenceName;

    public UnknownReferenceException(String referenceName) {
      super("Reference '" + referenceName + "' is not a reference this CSI may use");
      this.referenceName = referenceName;
    }

    public String getReferenceName() {
      return referenceName;
    }
  }

  /**
   * The principal is not entitled to use this secret, observed at <b>acceptance</b> (AC-4).
   *
   * <p>Separate from {@link UnknownReferenceException} because the two are different facts and a
   * refusal that conflated them would tell an unentitled caller whether the secret exists.
   * Deliberately carries the same wording for that reason; only the type differs, and the type is
   * not on the wire.
   */
  class SecretUseNotAuthorizedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String referenceName;

    public SecretUseNotAuthorizedException(String referenceName) {
      super("Reference '" + referenceName + "' is not a reference this CSI may use");
      this.referenceName = referenceName;
    }

    public String getReferenceName() {
      return referenceName;
    }
  }

  /**
   * Entitlement to a declared secret was withdrawn between acceptance and <b>dispatch</b> (AC-7a).
   *
   * <p>ADR-002 §15.2's axis: this is <em>a fact about the principal</em>, so the dispatcher closes
   * it {@code AUTHORIZATION_REVOKED}. A vanished reference is a fact about the draft and its
   * environment and is {@link ReferenceUnavailableException} instead. Both mean the send never
   * happened.
   */
  class SecretUseRevokedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String referenceName;

    public SecretUseRevokedException(String referenceName) {
      super("Use of reference '" + referenceName + "' is no longer authorized at dispatch");
      this.referenceName = referenceName;
    }

    public String getReferenceName() {
      return referenceName;
    }
  }

  /** A reference that existed at preflight and does not exist at dispatch (AC-7a). */
  class ReferenceUnavailableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String referenceName;

    public ReferenceUnavailableException(String referenceName) {
      super("Reference '" + referenceName + "' is no longer available at dispatch");
      this.referenceName = referenceName;
    }

    public String getReferenceName() {
      return referenceName;
    }
  }

  /**
   * Resolved values, held as {@code char[]} so that {@link #close()} can actually erase them rather
   * than leaving an interned {@link String} on the heap until a collection it cannot force.
   *
   * <p>Two maps, because the contract declares two and because only one of them is a secret. Both
   * are erased by {@link #close()}: §9.2's <em>"Never persist them in jobs, retry queues, manifests
   * or diagnostics"</em> governs <em>resolved values</em>, and a variable is author-supplied free
   * text the system knows nothing about. The runner scrubs both for the same reason (@po ruling on
   * Open Question 2, 2026-09-11).
   *
   * <p><b>The residual, stated rather than implied (AC-15).</b> The moment these arrays are
   * serialized into a JSON body the platform creates {@link String}s that no code can erase. The
   * decidable property — and the only one claimed — is that nothing in this process retains a
   * <em>path</em> to the values once {@link #close()} has run. The serializer's transient buffers
   * are the named residual.
   */
  final class Resolved implements AutoCloseable {

    private final Map<String, char[]> variables;
    private final Map<String, char[]> secrets;
    private final Map<String, String> secretVersions;

    public Resolved(
        Map<String, char[]> variables,
        Map<String, char[]> secrets,
        Map<String, String> secretVersions) {
      this.variables = new LinkedHashMap<>(variables);
      this.secrets = new LinkedHashMap<>(secrets);
      this.secretVersions = new LinkedHashMap<>(secretVersions);
    }

    public Map<String, char[]> variables() {
      return Map.copyOf(variables);
    }

    public Map<String, char[]> secrets() {
      return Map.copyOf(secrets);
    }

    /**
     * The nonsecret opaque version identifier each resolved secret was read at (§4.2, AC-8).
     *
     * <p>Supplied by the provider. Never the value, never a hash of the value, and never anything a
     * caller could use to compare two values: rotating a value <em>to itself</em> still changes the
     * identifier, which is what stops it becoming an oracle.
     */
    public Map<String, String> secretVersions() {
      return Map.copyOf(secretVersions);
    }

    public boolean isEmpty() {
      return variables.isEmpty() && secrets.isEmpty();
    }

    @Override
    public void close() {
      variables.values().forEach(value -> Arrays.fill(value, '\0'));
      secrets.values().forEach(value -> Arrays.fill(value, '\0'));
      variables.clear();
      secrets.clear();
      secretVersions.clear();
    }
  }
}
