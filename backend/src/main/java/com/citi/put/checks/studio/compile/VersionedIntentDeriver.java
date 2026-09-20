package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.context.ExplicitStepIntent;
import com.citi.put.checks.studio.context.IntentParseResult;
import com.citi.put.checks.studio.context.ResolutionPolicy;
import com.citi.put.checks.studio.context.ResolvedAuthoringContext;
import com.citi.put.checks.studio.context.ScopedContextResolver;
import com.citi.put.checks.studio.context.SupportedEnglishIntentParser;
import com.citi.put.checks.studio.dto.AuthoringDiagnostic;
import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedStepReview;
import com.citi.put.checks.studio.dto.TargetHint;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Pure, bounded and version-selected immutable authoring-to-expected-intent derivation. */
public final class VersionedIntentDeriver {

  public static final String CURRENT_VERSION = "1.0.0";
  private static final int MAX_INPUT_BYTES = 256 * 1024;
  private static final int MAX_STEPS = 100;
  private static final int MAX_COLLECTION = 500;
  private static final int MAX_NODES = 5000;
  private static final ObjectMapper MAPPER = strictMapper();

  public Derivation derive(
      String version,
      String sourceJson,
      String authoringJson,
      String revisionInputsJson,
      String csiId,
      String environment) {
    if (!CURRENT_VERSION.equals(version)) {
      throw new DerivationException("Unsupported intent derivation version");
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
      IntentParseResult parsed = new SupportedEnglishIntentParser().parse(authoring.steps());
      List<ExplicitStepIntent> scoped = withSavedScope(authoring, parsed.intents());
      ResolvedAuthoringContext resolved =
          new ScopedContextResolver()
              .resolve(
                  authoring,
                  scoped,
                  List.of(),
                  csiId,
                  environment,
                  ResolutionPolicy.compilerLanguage());
      Map<UUID, List<ResolvedOperation.Kind>> sequences = new LinkedHashMap<>();
      scoped.forEach(intent -> sequences.put(intent.stepId(), intent.requestedSequence()));
      Map<UUID, String> scopes = targetScopes(authoring);
      List<AuthoringDiagnostic> blocking = new ArrayList<>(parsed.diagnostics());
      blocking.addAll(resolved.diagnostics());
      String expected =
          blocking.isEmpty()
              ? new ExpectedIntentAssembler().assemble(resolved.steps(), sequences, scopes)
              : null;
      return new Derivation(
          List.copyOf(source),
          authoring,
          identity,
          resolved.steps(),
          Map.copyOf(sequences),
          Map.copyOf(scopes),
          List.copyOf(blocking),
          expected);
    } catch (DerivationException exception) {
      throw exception;
    } catch (Exception exception) {
      throw new DerivationException("Immutable authoring inputs are invalid", exception);
    }
  }

  public Derivation deriveRevision(
      String version,
      String sourceJson,
      String authoringJson,
      String revisionInputsJson,
      String csiId,
      String configurationJson) {
    requireBounded(configurationJson, "configuration");
    try {
      JsonNode configuration = MAPPER.readTree(configurationJson);
      if (!configuration.isObject() || !configuration.path("environment").isTextual()) {
        throw new DerivationException("Immutable revision environment is invalid");
      }
      return derive(
          version,
          sourceJson,
          authoringJson,
          revisionInputsJson,
          csiId,
          configuration.path("environment").textValue());
    } catch (DerivationException exception) {
      throw exception;
    } catch (Exception exception) {
      throw new DerivationException("Immutable revision configuration is invalid", exception);
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

  private static Map<UUID, String> targetScopes(AuthoringV2Request authoring) {
    Map<UUID, String> scopes = new LinkedHashMap<>();
    authoring
        .steps()
        .forEach(
            step ->
                step.context().entries().stream()
                    .filter(TargetHint.class::isInstance)
                    .map(TargetHint.class::cast)
                    .filter(hint -> hint.scope() != null && !hint.scope().isBlank())
                    .findFirst()
                    .ifPresent(hint -> scopes.put(step.id(), hint.scope())));
    return scopes;
  }

  private static List<ExplicitStepIntent> withSavedScope(
      AuthoringV2Request authoring, List<ExplicitStepIntent> intents) {
    Map<UUID, AuthoringStep> steps = new LinkedHashMap<>();
    authoring.steps().forEach(step -> steps.put(step.id(), step));
    return intents.stream()
        .map(
            intent -> {
              AuthoringStep step = steps.get(intent.stepId());
              List<AuthoringEvidenceReference> evidence = new ArrayList<>();
              evidence.addAll(authoring.globalContext().evidenceReferences());
              if (step != null) {
                evidence.addAll(step.context().evidenceReferences());
              }
              AuthoringEvidenceReference scope =
                  evidence.stream()
                      .filter(item -> item.stepId().equals(intent.stepId()))
                      .findFirst()
                      .orElse(null);
              return scope == null
                  ? intent
                  : new ExplicitStepIntent(
                      intent.stepId(),
                      intent.operation(),
                      intent.target(),
                      intent.input(),
                      intent.assertions(),
                      scope.route(),
                      scope.state(),
                      intent.requestedSequence());
            })
        .toList();
  }

  public record Derivation(
      List<String> source,
      AuthoringV2Request authoring,
      AuthoringRevisionInputs identity,
      List<ResolvedStepReview> resolvedIntent,
      Map<UUID, List<ResolvedOperation.Kind>> requestedSequences,
      Map<UUID, String> targetScopes,
      List<AuthoringDiagnostic> blockingDiagnostics,
      String expectedIntent) {}

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
