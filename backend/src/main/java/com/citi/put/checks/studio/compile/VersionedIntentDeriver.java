package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Pure, bounded and version-selected immutable authoring-to-reference-policy derivation.
 *
 * <p>Version {@code 2} derives the structural reference policy of ADR-SC-003. Revisions persisted
 * under version {@code 1} (the retired English-derived expected intent) are no longer derivable and
 * therefore fall into the ordinary recompile path.
 */
public final class VersionedIntentDeriver {

  public static final String CURRENT_VERSION = "2";
  private static final int MAX_INPUT_BYTES = 256 * 1024;
  private static final int MAX_STEPS = 100;
  private static final int MAX_COLLECTION = 500;
  private static final int MAX_NODES = 5000;
  private static final ObjectMapper MAPPER = strictMapper();

  public Derivation derive(
      String version, String sourceJson, String authoringJson, String revisionInputsJson) {
    if (!CURRENT_VERSION.equals(version)) {
      throw new DerivationException("Unsupported reference policy derivation version");
    }
    requireBounded(sourceJson, "source");
    requireBounded(authoringJson, "authoring");
    requireBounded(revisionInputsJson, "authoring revision inputs");
    try {
      List<String> source = MAPPER.readValue(sourceJson, new TypeReference<List<String>>() {});
      AuthoringV2Request authoring = MAPPER.readValue(authoringJson, AuthoringV2Request.class);
      AuthoringRevisionInputs identity =
          MAPPER.readValue(revisionInputsJson, AuthoringRevisionInputs.class);
      requireTreeBounds(MAPPER.readTree(authoringJson));
      requireTreeBounds(MAPPER.readTree(revisionInputsJson));
      if (!AuthoringRevisionIdentity.valid(authoring, identity)) {
        throw new DerivationException("Immutable authoring revision identity is invalid");
      }
      if (source.size() > MAX_STEPS || authoring.steps().size() != source.size()) {
        throw new DerivationException("Authoring and source step counts do not match");
      }
      for (int index = 0; index < source.size(); index++) {
        if (!source.get(index).equals(authoring.steps().get(index).text())) {
          throw new DerivationException("Authoring and source text do not match");
        }
      }
      return new Derivation(
          List.copyOf(source),
          authoring,
          identity,
          new StepReferencePolicyDeriver().derive(authoring));
    } catch (DerivationException exception) {
      throw exception;
    } catch (Exception exception) {
      throw new DerivationException("Immutable authoring inputs are invalid", exception);
    }
  }

  private static ObjectMapper strictMapper() {
    JsonFactory factory =
        JsonFactory.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .streamReadConstraints(
                StreamReadConstraints.builder()
                    .maxDocumentLength(MAX_INPUT_BYTES)
                    .maxNestingDepth(64)
                    .maxStringLength(65_536)
                    .build())
            .build();
    return JsonMapper.builder(factory)
        .findAndAddModules()
        .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
        .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .build();
  }

  private static void requireBounded(String input, String name) {
    if (input == null || input.getBytes(StandardCharsets.UTF_8).length > MAX_INPUT_BYTES) {
      throw new DerivationException(name + " exceeds the derivation input bound");
    }
  }

  private static void requireTreeBounds(JsonNode root) {
    int nodes = countNodes(root);
    if (nodes > MAX_NODES) {
      throw new DerivationException("Authoring collections exceed the derivation bound");
    }
  }

  private static int countNodes(JsonNode node) {
    if (node.isArray() && node.size() > MAX_COLLECTION) {
      throw new DerivationException("Authoring collection exceeds the derivation bound");
    }
    int count = 1;
    for (JsonNode child : node) {
      count = Math.addExact(count, countNodes(child));
    }
    return count;
  }

  /**
   * @param referencePolicy canonical {@link StepReferencePolicyDeriver} document
   */
  public record Derivation(
      List<String> source,
      AuthoringV2Request authoring,
      AuthoringRevisionInputs identity,
      String referencePolicy) {}

  public static final class DerivationException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    DerivationException(String message) {
      super(message);
    }

    DerivationException(String message, Throwable cause) {
      super(message, cause);
    }
  }
}
