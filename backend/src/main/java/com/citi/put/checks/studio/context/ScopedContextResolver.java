package com.citi.put.checks.studio.context;

import com.citi.put.checks.studio.dto.AuthoringDiagnostic;
import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.ContextProvenance;
import com.citi.put.checks.studio.dto.ContextualDefault;
import com.citi.put.checks.studio.dto.DefaultLiteralValue;
import com.citi.put.checks.studio.dto.DefaultVariableValue;
import com.citi.put.checks.studio.dto.EvidenceReference;
import com.citi.put.checks.studio.dto.LiteralInput;
import com.citi.put.checks.studio.dto.ResolvedInput;
import com.citi.put.checks.studio.dto.ResolvedLiteralInput;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.ResolvedStepReview;
import com.citi.put.checks.studio.dto.ResolvedTarget;
import com.citi.put.checks.studio.dto.SecretReference;
import com.citi.put.checks.studio.dto.TargetHint;
import com.citi.put.checks.studio.dto.VariableReference;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Deterministic explicit → step → global resolver with authoritative policy and honest evidence.
 */
public final class ScopedContextResolver {

  public ResolvedAuthoringContext resolve(
      AuthoringV2Request authoring,
      List<ExplicitStepIntent> explicitIntents,
      List<EvidenceReference> trustedEvidence,
      String csiId,
      String environment,
      ResolutionPolicy policy) {
    Map<UUID, ExplicitStepIntent> explicit = new LinkedHashMap<>();
    explicitIntents.forEach(intent -> explicit.put(intent.stepId(), intent));
    List<ResolvedStepReview> reviews = new ArrayList<>();
    List<EvidenceCoverage> coverage = new ArrayList<>();
    List<AuthoringDiagnostic> allDiagnostics = new ArrayList<>();

    for (AuthoringStep step : authoring.steps()) {
      ExplicitStepIntent intent = explicit.get(step.id());
      List<AuthoringDiagnostic> diagnostics = new ArrayList<>();
      List<ContextProvenance> provenance = new ArrayList<>();
      ResolvedInput input =
          intent != null && intent.input() != null
              ? provenance(
                  intent.input(), provenance, "input", ContextProvenance.Scope.EXPLICIT_STEP)
              : resolveInput(step, authoring, provenance, diagnostics);
      ResolvedTarget target =
          intent != null && intent.target() != null
              ? provenance(
                  intent.target(), provenance, "target", ContextProvenance.Scope.EXPLICIT_STEP)
              : resolveTarget(step, authoring, provenance, diagnostics);

      if (intent != null
          && intent.operation() != null
          && !policy.operations().contains(intent.operation().kind())) {
        diagnostics.add(
            diagnostic(step.id(), "operation", AuthoringDiagnostic.Category.UNSUPPORTED_OPERATION));
      }
      if (target != null && !policy.targetStrategies().contains(target.strategy())) {
        diagnostics.add(
            diagnostic(step.id(), "target", AuthoringDiagnostic.Category.AMBIGUOUS_TARGET));
      }
      resolveEvidence(
          step,
          authoring,
          intent,
          trustedEvidence,
          csiId,
          environment,
          coverage,
          provenance,
          diagnostics);
      allDiagnostics.addAll(diagnostics);
      reviews.add(
          new ResolvedStepReview(
              step.id(),
              intent == null ? null : intent.operation(),
              target,
              input,
              provenance,
              intent == null ? List.of() : intent.assertions(),
              diagnostics));
    }
    return new ResolvedAuthoringContext(reviews, coverage, allDiagnostics);
  }

  private static ResolvedInput resolveInput(
      AuthoringStep step,
      AuthoringV2Request authoring,
      List<ContextProvenance> provenance,
      List<AuthoringDiagnostic> diagnostics) {
    List<ResolvedInput> local = inputs(step.context().entries());
    if (distinct(local) > 1) {
      diagnostics.add(
          diagnostic(step.id(), "input", AuthoringDiagnostic.Category.CONFLICTING_VALUE));
      return null;
    }
    if (!local.isEmpty()) {
      return provenance(local.get(0), provenance, "input", ContextProvenance.Scope.STEP_CONTEXT);
    }
    List<ResolvedInput> global = inputs(authoring.globalContext().entries());
    if (distinct(global) > 1) {
      diagnostics.add(
          diagnostic(step.id(), "input", AuthoringDiagnostic.Category.CONFLICTING_VALUE));
      return null;
    }
    return global.isEmpty()
        ? null
        : provenance(global.get(0), provenance, "input", ContextProvenance.Scope.GLOBAL_CONTEXT);
  }

  private static ResolvedTarget resolveTarget(
      AuthoringStep step,
      AuthoringV2Request authoring,
      List<ContextProvenance> provenance,
      List<AuthoringDiagnostic> diagnostics) {
    List<ResolvedTarget> local = targets(step.context().entries());
    if (distinct(local) > 1) {
      diagnostics.add(
          diagnostic(step.id(), "target", AuthoringDiagnostic.Category.AMBIGUOUS_TARGET));
      return null;
    }
    if (!local.isEmpty()) {
      return provenance(local.get(0), provenance, "target", ContextProvenance.Scope.STEP_CONTEXT);
    }
    List<ResolvedTarget> global = targets(authoring.globalContext().entries());
    if (distinct(global) > 1) {
      diagnostics.add(
          diagnostic(step.id(), "target", AuthoringDiagnostic.Category.AMBIGUOUS_TARGET));
      return null;
    }
    return global.isEmpty()
        ? null
        : provenance(global.get(0), provenance, "target", ContextProvenance.Scope.GLOBAL_CONTEXT);
  }

  private static List<ResolvedInput> inputs(List<?> entries) {
    List<ResolvedInput> result = new ArrayList<>();
    for (Object entry : entries) {
      if (entry instanceof LiteralInput literal) {
        result.add(new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, literal.value()));
      } else if (entry instanceof VariableReference reference) {
        result.add(
            new ResolvedReferenceInput(
                ResolvedReferenceInput.Kind.VARIABLE_REF, reference.referenceId()));
      } else if (entry instanceof SecretReference reference) {
        result.add(
            new ResolvedReferenceInput(
                ResolvedReferenceInput.Kind.SECRET_REF, reference.referenceId()));
      } else if (entry instanceof ContextualDefault contextualDefault) {
        if (contextualDefault.value() instanceof DefaultLiteralValue literal) {
          result.add(new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, literal.value()));
        } else if (contextualDefault.value() instanceof DefaultVariableValue reference) {
          result.add(
              new ResolvedReferenceInput(
                  ResolvedReferenceInput.Kind.VARIABLE_REF, reference.referenceId()));
        }
      }
    }
    return result;
  }

  private static List<ResolvedTarget> targets(List<?> entries) {
    return entries.stream()
        .filter(TargetHint.class::isInstance)
        .map(TargetHint.class::cast)
        .map(
            hint ->
                new ResolvedTarget(
                    ResolvedTarget.Strategy.valueOf(hint.strategy().name()),
                    hint.value(),
                    hint.exact(),
                    null))
        .toList();
  }

  private static void resolveEvidence(
      AuthoringStep step,
      AuthoringV2Request authoring,
      ExplicitStepIntent intent,
      List<EvidenceReference> trusted,
      String csiId,
      String environment,
      List<EvidenceCoverage> coverage,
      List<ContextProvenance> provenance,
      List<AuthoringDiagnostic> diagnostics) {
    String route = intent == null ? null : intent.route();
    String state = intent == null ? null : intent.state();
    List<AuthoringEvidenceReference> supplied =
        new ArrayList<>(authoring.globalContext().evidenceReferences());
    supplied.addAll(step.context().evidenceReferences());
    boolean compatible = false;
    for (AuthoringEvidenceReference evidence : supplied) {
      if (!evidence.stepId().equals(step.id())) {
        continue;
      }
      if (matches(
          evidence.csiId(),
          evidence.environment(),
          evidence.route(),
          evidence.state(),
          csiId,
          environment,
          route,
          state)) {
        compatible = true;
        coverage.add(
            new EvidenceCoverage(
                step.id(),
                evidence.id(),
                EvidenceCoverage.Source.SUPPLIED,
                evidence.completeness(),
                route,
                state));
        provenance.add(
            new ContextProvenance(
                "evidence",
                ContextProvenance.Scope.EVIDENCE,
                ContextProvenance.SourceKind.SUPPLIED,
                evidence.id().toString()));
      } else {
        diagnostics.add(
            diagnostic(step.id(), "evidence", AuthoringDiagnostic.Category.INCOMPATIBLE_EVIDENCE));
      }
    }
    for (EvidenceReference evidence : trusted) {
      if (evidence.stepId().equals(step.id())
          && matches(
              evidence.csiId(),
              evidence.environment(),
              evidence.route(),
              evidence.state(),
              csiId,
              environment,
              route,
              state)) {
        compatible = true;
        coverage.add(
            new EvidenceCoverage(
                step.id(),
                evidence.id(),
                EvidenceCoverage.Source.OBSERVED,
                evidence.completeness(),
                route,
                state));
        provenance.add(
            new ContextProvenance(
                "evidence",
                ContextProvenance.Scope.EVIDENCE,
                ContextProvenance.SourceKind.OBSERVED,
                evidence.id().toString()));
      }
    }
    if (!compatible) {
      coverage.add(
          new EvidenceCoverage(
              step.id(),
              null,
              route == null || state == null
                  ? EvidenceCoverage.Source.UNKNOWN
                  : EvidenceCoverage.Source.PREDICTED,
              AuthoringEvidenceReference.Completeness.UNKNOWN,
              route,
              state));
    }
  }

  private static boolean matches(
      String evidenceCsi,
      String evidenceEnvironment,
      String evidenceRoute,
      String evidenceState,
      String csi,
      String environment,
      String route,
      String state) {
    return Objects.equals(evidenceCsi, csi)
        && Objects.equals(evidenceEnvironment, environment)
        && Objects.equals(evidenceRoute, route)
        && Objects.equals(evidenceState, state);
  }

  private static int distinct(List<?> values) {
    return (int) values.stream().distinct().count();
  }

  private static <T> T provenance(
      T value, List<ContextProvenance> provenance, String field, ContextProvenance.Scope scope) {
    provenance.add(new ContextProvenance(field, scope, ContextProvenance.SourceKind.USER, null));
    return value;
  }

  private static AuthoringDiagnostic diagnostic(
      UUID stepId, String field, AuthoringDiagnostic.Category category) {
    return new AuthoringDiagnostic(category, stepId, field, category.name());
  }
}
