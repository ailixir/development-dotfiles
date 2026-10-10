package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.security.core.Authentication;

/**
 * Trusted integration boundary. Implementations lock the authoritative source/configuration and
 * recheck current CSI/account grants (including internal calls), not a caller's claims. The account
 * adapter must establish a real connection; absent support is AUTH_CONNECTION_REQUIRED, never a
 * synthetic connected account. OBS-007 supplies the handoff implementation.
 */
public interface GuidedSessionAccess {
  record Snapshot(ObjectNode scope, JsonNode sourceSteps, ObjectNode authConnection) {}

  Snapshot resolve(Authentication principal, JsonNode start);

  void checkCurrent(JsonNode session);

  /** Lock the source/configuration row in the calling transaction and compare frozen revisions. */
  void checkSourceCurrent(JsonNode session);

  void checkUser(Authentication principal, JsonNode session);

  /** A live context proof must come from the runner registry, not the claim request. */
  default boolean recoverableContext(String sessionId, String workerId) {
    return false;
  }

  /** Approved immutable source/configuration boundary, never model-supplied classification. */
  default com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator.Sources sources(
      JsonNode session) {
    throw new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
  }

  /** Called only with a persisted authenticated preparation, never a caller assertion. */
  default String authorizeAction(JsonNode session, JsonNode proposal, JsonNode preparation) {
    var identity = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
    identity.set("scopeHash", session.path("scopeHash"));
    identity.set("preparation", preparation);
    identity.put("requestDigest", GuidedContracts.hash(proposal));
    return GuidedContracts.hash(identity);
  }

  /** OBS-004 supplies the trusted policy/DOM-correspondence admission verifier. */
  default String authorizeAction(JsonNode session, JsonNode proposal) {
    throw new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
  }
}
