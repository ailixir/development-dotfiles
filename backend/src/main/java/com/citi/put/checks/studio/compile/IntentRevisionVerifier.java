package com.citi.put.checks.studio.compile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Pure semantic verification of one immutable authoring-v2 candidate revision.
 *
 * <p>The saved reference policy must equal the policy re-derived, under the saved derivation
 * version, from the revision's own immutable authoring inputs (ADR-SC-003). Any mismatch, including
 * a revision persisted under a retired derivation version, is reported as unverifiable so callers
 * take their recompile path.
 */
public final class IntentRevisionVerifier {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private IntentRevisionVerifier() {}

  public static boolean verify(
      String source,
      String authoring,
      String authoringRevisionInputs,
      String savedReferencePolicy,
      String intentDerivationVersion,
      String provenance) {
    if (authoring == null) {
      return true;
    }
    if (savedReferencePolicy == null
        || intentDerivationVersion == null
        || !provenanceMatches(provenance, intentDerivationVersion)) {
      return false;
    }
    try {
      VersionedIntentDeriver.Derivation derived =
          new VersionedIntentDeriver()
              .derive(intentDerivationVersion, source, authoring, authoringRevisionInputs);
      return ArtifactCanonicalizer.canonicalize(savedReferencePolicy)
          .equals(derived.referencePolicy());
    } catch (RuntimeException exception) {
      return false;
    }
  }

  private static boolean provenanceMatches(String provenance, String version) {
    try {
      JsonNode node = MAPPER.readTree(provenance);
      return node.isObject() && version.equals(node.path("intentDerivationVersion").asText(null));
    } catch (Exception exception) {
      return false;
    }
  }
}
