package com.citi.put.checks.studio.authoring;

import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.ContextualDefault;
import com.citi.put.checks.studio.dto.DefaultVariableValue;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.VariableReference;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Pure construction and verification of the complete immutable authoring revision identity. */
public final class AuthoringRevisionIdentity {

  private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();
  private static final int MAX_STEPS = 100;
  private static final int MAX_COLLECTION = 500;
  private static final java.util.regex.Pattern HASH =
      java.util.regex.Pattern.compile("^[a-f0-9]{64}$");

  private AuthoringRevisionIdentity() {}

  public static AuthoringRevisionInputs create(
      AuthoringV2Request authoring, Map<String, String> plainValues) {
    String globalHash = hashJson(authoring.globalContext());
    List<AuthoringRevisionInputs.StepContextHash> stepContexts = stepContexts(authoring);
    List<AuthoringRevisionInputs.NonsecretReferenceHash> nonsecret =
        nonsecret(authoring, plainValues);
    List<AuthoringRevisionInputs.SelectedEvidenceHash> evidence = evidence(authoring);
    return new AuthoringRevisionInputs(
        contextDigest(authoring, globalHash, stepContexts, nonsecret, evidence),
        globalHash,
        stepContexts,
        nonsecret,
        evidence);
  }

  public static boolean valid(AuthoringV2Request authoring, AuthoringRevisionInputs identity) {
    if (authoring == null
        || identity == null
        || !hash(identity.contextDigest())
        || !hash(identity.globalContext())
        || identity.stepContexts() == null
        || identity.nonsecretReferencedValues() == null
        || identity.selectedEvidenceReferences() == null
        || authoring.steps() == null
        || authoring.steps().size() > MAX_STEPS
        || identity.stepContexts().size() > MAX_STEPS
        || identity.nonsecretReferencedValues().size() > MAX_COLLECTION
        || identity.selectedEvidenceReferences().size() > MAX_COLLECTION) {
      return false;
    }
    List<AuthoringRevisionInputs.StepContextHash> expectedSteps = stepContexts(authoring);
    if (!expectedSteps.equals(identity.stepContexts())) {
      return false;
    }
    List<String> referenceIds = referencedIds(authoring);
    if (referenceIds.size() != identity.nonsecretReferencedValues().size()) {
      return false;
    }
    Set<String> uniqueReferences = new java.util.HashSet<>();
    for (int index = 0; index < referenceIds.size(); index++) {
      AuthoringRevisionInputs.NonsecretReferenceHash item =
          identity.nonsecretReferencedValues().get(index);
      if (item == null
          || !referenceIds.get(index).equals(item.referenceId())
          || item.referenceId().isBlank()
          || !uniqueReferences.add(item.referenceId())
          || !hash(item.valueHash())) {
        return false;
      }
    }
    if (!evidence(authoring).equals(identity.selectedEvidenceReferences())) {
      return false;
    }
    Set<UUID> evidenceIds = new java.util.HashSet<>();
    for (AuthoringRevisionInputs.SelectedEvidenceHash item :
        identity.selectedEvidenceReferences()) {
      if (item == null
          || item.id() == null
          || !evidenceIds.add(item.id())
          || item.revision() < 1
          || !hash(item.hash())) {
        return false;
      }
    }
    String globalHash = hashJson(authoring.globalContext());
    return globalHash.equals(identity.globalContext())
        && contextDigest(
                authoring,
                globalHash,
                identity.stepContexts(),
                identity.nonsecretReferencedValues(),
                identity.selectedEvidenceReferences())
            .equals(identity.contextDigest());
  }

  private static List<AuthoringRevisionInputs.StepContextHash> stepContexts(
      AuthoringV2Request authoring) {
    if (authoring.steps() == null || authoring.steps().size() > MAX_STEPS) {
      throw new IllegalArgumentException("authoring step identity exceeds its bound");
    }
    List<AuthoringRevisionInputs.StepContextHash> result = new ArrayList<>();
    Set<UUID> ids = new java.util.HashSet<>();
    for (AuthoringStep step : authoring.steps()) {
      if (step == null || step.id() == null || !ids.add(step.id()) || step.context() == null) {
        throw new IllegalArgumentException("authoring step identity is invalid");
      }
      result.add(new AuthoringRevisionInputs.StepContextHash(step.id(), hashJson(step.context())));
    }
    return List.copyOf(result);
  }

  private static List<AuthoringRevisionInputs.NonsecretReferenceHash> nonsecret(
      AuthoringV2Request authoring, Map<String, String> values) {
    List<String> ids = referencedIds(authoring);
    List<AuthoringRevisionInputs.NonsecretReferenceHash> result = new ArrayList<>();
    for (String id : ids) {
      result.add(new AuthoringRevisionInputs.NonsecretReferenceHash(id, hashJson(values.get(id))));
    }
    return List.copyOf(result);
  }

  private static List<String> referencedIds(AuthoringV2Request authoring) {
    LinkedHashMap<String, Boolean> ids = new LinkedHashMap<>();
    collectReferences(authoring.globalContext().entries(), ids);
    for (AuthoringStep step : authoring.steps()) {
      collectReferences(step.context().entries(), ids);
    }
    if (ids.size() > MAX_COLLECTION) {
      throw new IllegalArgumentException("nonsecret reference identity exceeds its bound");
    }
    return List.copyOf(ids.keySet());
  }

  private static void collectReferences(List<?> entries, Map<String, Boolean> ids) {
    for (Object entry : entries) {
      if (entry instanceof VariableReference reference) {
        ids.putIfAbsent(reference.referenceId(), Boolean.TRUE);
      } else if (entry instanceof ContextualDefault contextualDefault
          && contextualDefault.value() instanceof DefaultVariableValue reference) {
        ids.putIfAbsent(reference.referenceId(), Boolean.TRUE);
      }
    }
  }

  private static List<AuthoringRevisionInputs.SelectedEvidenceHash> evidence(
      AuthoringV2Request authoring) {
    LinkedHashMap<UUID, AuthoringRevisionInputs.SelectedEvidenceHash> selected =
        new LinkedHashMap<>();
    collectEvidence(authoring.globalContext(), selected);
    for (AuthoringStep step : authoring.steps()) {
      collectEvidence(step.context(), selected);
    }
    if (selected.size() > MAX_COLLECTION) {
      throw new IllegalArgumentException("evidence identity exceeds its bound");
    }
    return List.copyOf(selected.values());
  }

  private static void collectEvidence(
      GlobalAuthoringContext context,
      Map<UUID, AuthoringRevisionInputs.SelectedEvidenceHash> selected) {
    collectEvidence(context.evidenceReferences(), selected);
  }

  private static void collectEvidence(
      StepAuthoringContext context,
      Map<UUID, AuthoringRevisionInputs.SelectedEvidenceHash> selected) {
    collectEvidence(context.evidenceReferences(), selected);
  }

  private static void collectEvidence(
      List<AuthoringEvidenceReference> references,
      Map<UUID, AuthoringRevisionInputs.SelectedEvidenceHash> selected) {
    for (AuthoringEvidenceReference reference : references) {
      if (reference == null || reference.id() == null) {
        throw new IllegalArgumentException("evidence identity is invalid");
      }
      AuthoringRevisionInputs.SelectedEvidenceHash item =
          new AuthoringRevisionInputs.SelectedEvidenceHash(
              reference.id(), reference.revision(), reference.hash());
      AuthoringRevisionInputs.SelectedEvidenceHash previous =
          selected.putIfAbsent(reference.id(), item);
      if (previous != null && !previous.equals(item)) {
        throw new IllegalArgumentException("duplicate evidence identity differs");
      }
    }
  }

  private static String contextDigest(
      AuthoringV2Request authoring,
      String globalHash,
      List<AuthoringRevisionInputs.StepContextHash> stepContexts,
      List<AuthoringRevisionInputs.NonsecretReferenceHash> nonsecret,
      List<AuthoringRevisionInputs.SelectedEvidenceHash> evidence) {
    Map<String, Object> material = new LinkedHashMap<>();
    material.put(
        "orderedSteps",
        authoring.steps().stream().map(step -> List.of(step.id(), step.text())).toList());
    material.put("globalContext", globalHash);
    material.put("stepContexts", stepContexts);
    material.put("nonsecretReferencedValues", nonsecret);
    material.put("selectedEvidenceReferences", evidence);
    return hashJson(material);
  }

  private static boolean hash(String value) {
    return value != null && HASH.matcher(value).matches();
  }

  private static String hashJson(Object value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of()
          .formatHex(
              digest.digest(MAPPER.writeValueAsString(value).getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is unavailable", exception);
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException("authoring identity cannot be serialized", exception);
    }
  }
}
