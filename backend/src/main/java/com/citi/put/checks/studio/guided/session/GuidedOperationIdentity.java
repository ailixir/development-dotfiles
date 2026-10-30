package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * ADR-SC-007 D2: the one definition of an operation's identity. The operation hash is {@code
 * sha256(canonical-v1({coordinate, origin, target, operation}))}, where {@code target} is null or
 * the runner-reported ResolvedTarget (locator, tier, identity) of the preparation proof. The ref,
 * document and generation of the proposal are deliberately not part of it: a replay on a later
 * generation resolves a fresh ref to the same locator and so to the same identity.
 *
 * <p>Admission, publication, the basis validator, the publication evidence repository and the
 * incremental prefix check all call this class; so does the SQL function of migration V29, which
 * builds the same document.
 */
public final class GuidedOperationIdentity {
  private GuidedOperationIdentity() {}

  /** The hashed document; a missing or JSON-null origin or target is a JSON null. */
  public static ObjectNode preimage(
      JsonNode coordinate, JsonNode origin, JsonNode target, JsonNode operation) {
    ObjectNode identity = JsonNodeFactory.instance.objectNode();
    identity.set("coordinate", coordinate);
    identity.set("origin", origin == null || origin.isMissingNode() ? NullNode.instance : origin);
    identity.set("target", target == null || target.isMissingNode() ? NullNode.instance : target);
    identity.set("operation", operation);
    return identity;
  }

  public static String hash(
      JsonNode coordinate, JsonNode origin, JsonNode target, JsonNode operation) {
    return GuidedContracts.hash(preimage(coordinate, origin, target, operation));
  }

  /**
   * The hash of an admitted proposal: its coordinate, the origin of its execution evidence, the
   * target the runner reported when it prepared the proposal, and its operation.
   */
  public static String of(JsonNode proposal, JsonNode preparationTarget) {
    return hash(
        proposal.path("coordinate"),
        proposal.path("executionEvidence").path("origin"),
        preparationTarget,
        proposal.path("operation"));
  }
}
