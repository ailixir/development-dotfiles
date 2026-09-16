package com.citi.put.checks.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The three ways {@code BffSessionAuthenticationFilter} can produce an identity the platform never
 * vouched for — story 10.18b AC-19a, external dependency {@code ED-02}.
 *
 * <p><strong>All three default to {@code false}, and that is the criterion.</strong> Architecture
 * §9.1: "The trusted gateway must strip/replace identity headers and prevent direct-backend
 * impersonation; absent identity fails closed." A configuration key whose default is "open" is a
 * bypass with a longer name.
 *
 * <p><strong>There are three, not one.</strong> Every record in this epic — the manifest's {@code
 * ED-02} description, the run log's wave-1 baseline entry — has described {@code ED-02} as a single
 * hardcoded flag. It is not, and the distinction decides whether closing it achieves anything:
 * {@code resolveIdentity} reads the client-supplied {@code X-User-Id} header and returns <em>before
 * it ever reaches</em> the Core-service bypass. Closing {@link #coreService()} alone closes nothing
 * for a caller that can reach the pod and send a header.
 *
 * <p><strong>Why these are properties and not deletions.</strong> @po ruled at wave-6 validation
 * that removing the bypass as a code path is out of story scope, on @qa's rule: <em>close when the
 * bypass is removable without moving a responsibility to a module that should not hold it;
 * otherwise watch, and point the watcher at the production symbol.</em> Deleting the Core-service
 * bypass moves identity resolution onto {@code CoreServiceClient}, and the filter's own comment
 * records why that is unavailable — "while the target platform does not provide Core services". So
 * the code path survives, default-closed, and watched: {@code BffSessionBypassClosureTest} drives
 * the production filter under both values of each property and fails if any of them stops
 * discriminating.
 *
 * @param coreService when true, a request with no session cookie is authenticated as the hardcoded
 *     {@code CORE_SERVICE_BYPASS_IDENTITY}, which carries {@code checks-admin} and {@code
 *     platform-admin}. This is the flag {@code ED-02} names.
 * @param identityHeaders when true, {@code X-User-Id} and its siblings are taken off the request
 *     and become the caller's identity, roles and CSI ownership included. Architecture §9.1 assigns
 *     stripping these to a trusted gateway <em>that this repository does not contain</em>, so with
 *     this false the application refuses a direct caller its own identity instead of trusting it.
 * @param csiRead when true, {@code applyTemporaryCsiReadBypass} appends {@code checks-admin} to any
 *     identity making a {@code GET} under {@code /api/v1/csi}.
 */
@ConfigurationProperties(prefix = "checks.security.bypass")
public record IdentityBypassProperties(
    @DefaultValue("false") boolean coreService,
    @DefaultValue("false") boolean identityHeaders,
    @DefaultValue("false") boolean csiRead) {

  /** The default-closed instance, for the call sites that construct the filter directly. */
  public static IdentityBypassProperties closed() {
    return new IdentityBypassProperties(false, false, false);
  }
}
