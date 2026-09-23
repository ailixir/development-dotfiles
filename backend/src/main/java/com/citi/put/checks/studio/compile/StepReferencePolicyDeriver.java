package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.ContextualDefault;
import com.citi.put.checks.studio.dto.DefaultVariableValue;
import com.citi.put.checks.studio.dto.GlobalContextEntry;
import com.citi.put.checks.studio.dto.SecretReference;
import com.citi.put.checks.studio.dto.StepContextEntry;
import com.citi.put.checks.studio.dto.VariableReference;
import com.citi.put.checks.studio.validation.VariableReferenceValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Collection;
import java.util.Set;
import java.util.TreeSet;

/**
 * Derives the per-step structural reference policy from saved authoring-v2 data (ADR-SC-003).
 *
 * <p>Nothing here reads English. For each step:
 *
 * <ul>
 *   <li>{@code required} is the {@code <var NAME>} / {@code <secret ID>} tokens in the step text
 *       plus the step context's {@code variableRef} / {@code secretRef} entries;
 *   <li>{@code allowed} is {@code required} plus every variable that a global or step contextual
 *       default refers to.
 * </ul>
 *
 * <p>Names are sorted and de-duplicated, so the canonical document is stable and the readiness
 * re-derivation can compare it byte for byte.
 */
final class StepReferencePolicyDeriver {

  static final int POLICY_VERSION = 2;
  private static final ObjectMapper MAPPER = new ObjectMapper();

  String derive(AuthoringV2Request authoring) {
    Set<String> globalDefaults = new TreeSet<>();
    for (GlobalContextEntry entry : authoring.globalContext().entries()) {
      if (entry instanceof ContextualDefault contextual
          && contextual.value() instanceof DefaultVariableValue variable) {
        globalDefaults.add(variable.referenceId());
      }
    }

    ObjectNode document = MAPPER.createObjectNode();
    document.put("version", POLICY_VERSION);
    ArrayNode steps = document.putArray("steps");
    for (int index = 0; index < authoring.steps().size(); index++) {
      AuthoringStep step = authoring.steps().get(index);
      Set<String> requiredVariables =
          new TreeSet<>(VariableReferenceValidator.variableTokens(step.text()));
      Set<String> requiredSecrets =
          new TreeSet<>(VariableReferenceValidator.secretTokens(step.text()));
      Set<String> allowedVariables = new TreeSet<>(globalDefaults);
      for (StepContextEntry entry : step.context().entries()) {
        if (entry instanceof VariableReference variable) {
          requiredVariables.add(variable.referenceId());
        } else if (entry instanceof SecretReference secret) {
          requiredSecrets.add(secret.referenceId());
        } else if (entry instanceof ContextualDefault contextual
            && contextual.value() instanceof DefaultVariableValue variable) {
          allowedVariables.add(variable.referenceId());
        }
      }
      allowedVariables.addAll(requiredVariables);

      ObjectNode output = steps.addObject();
      output.put("stepIndex", index);
      references(output.putObject("required"), requiredVariables, requiredSecrets);
      references(output.putObject("allowed"), allowedVariables, requiredSecrets);
    }
    return ArtifactCanonicalizer.canonicalize(document.toString());
  }

  private static void references(
      ObjectNode node, Collection<String> variables, Collection<String> secrets) {
    ArrayNode variableNames = node.putArray("variables");
    variables.forEach(variableNames::add);
    ArrayNode secretNames = node.putArray("secrets");
    secrets.forEach(secretNames::add);
  }
}
