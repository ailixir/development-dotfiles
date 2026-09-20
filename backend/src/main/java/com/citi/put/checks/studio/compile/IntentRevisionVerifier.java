package com.citi.put.checks.studio.compile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Pure semantic verification of one immutable authoring-v2 candidate revision. */
public final class IntentRevisionVerifier {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private IntentRevisionVerifier() {}

  public static boolean verify(
      String source,
      String authoring,
      String authoringRevisionInputs,
      String csiId,
      String configuration,
      String savedExpectedIntent,
      String intentDerivationVersion,
      String provenance) {
    if (authoring == null) {
      return true;
    }
    if (savedExpectedIntent == null
        || intentDerivationVersion == null
        || !provenanceMatches(provenance, intentDerivationVersion)) {
      return false;
    }
    try {
      VersionedIntentDeriver.Derivation derived =
          new VersionedIntentDeriver()
              .deriveRevision(
                  intentDerivationVersion,
                  source,
                  authoring,
                  authoringRevisionInputs,
                  csiId,
                  configuration);
      return derived.blockingDiagnostics().isEmpty()
          && derived.expectedIntent() != null
          && ArtifactCanonicalizer.canonicalize(savedExpectedIntent)
              .equals(derived.expectedIntent());
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
