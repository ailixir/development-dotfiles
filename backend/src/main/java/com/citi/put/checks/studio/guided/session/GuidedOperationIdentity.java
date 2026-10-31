package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * The one definition of a step's identity. The operation hash is {@code
 * sha256(canonical-v1({coordinate, origin, operation}))}: where the step sits, the origin of its
 * execution evidence, and the step record (code, captures, uses, sourceHash). The ref, document and
 * generation of the proposal are deliberately not part of it: a replay on a later generation
 * resolves the same code to the same identity.
 *
 * <p>Admission, publication, the basis validator, the publication evidence repository and the
 * incremental prefix check all call this class; so does the SQL function that builds the same
 * document.
 */
public final class GuidedOperationIdentity {
  private GuidedOperationIdentity() {}

  /** The hashed document; a missing or JSON-null origin is a JSON null. */
  public static ObjectNode preimage(JsonNode coordinate, JsonNode origin, JsonNode operation) {
    ObjectNode identity = JsonNodeFactory.instance.objectNode();
    identity.set("coordinate", coordinate);
    identity.set("origin", origin == null || origin.isMissingNode() ? NullNode.instance : origin);
    identity.set("operation", operation);
    return identity;
  }

  public static String hash(JsonNode coordinate, JsonNode origin, JsonNode operation) {
    return GuidedContracts.hash(preimage(coordinate, origin, operation));
  }

  /** The hash of an admitted proposal: its coordinate, the evidence origin and its operation. */
  public static String of(JsonNode proposal) {
    return hash(
        proposal.path("coordinate"),
        proposal.path("executionEvidence").path("origin"),
        proposal.path("operation"));
  }
}
