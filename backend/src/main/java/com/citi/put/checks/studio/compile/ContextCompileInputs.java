package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.dto.AuthoringDiagnostic;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.ResolvedStepReview;
import com.citi.put.checks.studio.entity.UITest;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Saved v2 context identity carried beside the legacy compiler snapshot. */
public record ContextCompileInputs(
    UUID testId,
    long sourceRevision,
    long configurationRevision,
    List<UUID> orderedStepIds,
    String contextDigest,
    List<AuthoringRevisionInputs.SelectedEvidenceHash> selectedEvidence,
    List<ResolvedStepReview> resolvedIntent,
    Map<UUID, List<com.citi.put.checks.studio.dto.ResolvedOperation.Kind>> requestedSequences,
    Map<UUID, String> targetScopes,
    List<AuthoringDiagnostic> blockingDiagnostics,
    ContextPromptSection promptSection,
    String expectedIntent) {

  public ContextCompileInputs {
    orderedStepIds = List.copyOf(orderedStepIds);
    selectedEvidence = List.copyOf(selectedEvidence);
    resolvedIntent = List.copyOf(resolvedIntent);
    requestedSequences = Map.copyOf(requestedSequences);
    targetScopes = Map.copyOf(targetScopes);
    blockingDiagnostics = List.copyOf(blockingDiagnostics);
  }

  public static ContextCompileInputs from(UITest test) {
    if (test.getAuthoring() == null || test.getAuthoringRevisionInputs() == null) {
      return null;
    }
    VersionedIntentDeriver.Derivation derived =
        new VersionedIntentDeriver()
            .derive(
                VersionedIntentDeriver.CURRENT_VERSION,
                test.getSteps(),
                test.getAuthoring(),
                test.getAuthoringRevisionInputs(),
                test.getCsiId(),
                test.getEnvironment());
    return new ContextCompileInputs(
        test.getId(),
        test.getSourceRevision(),
        test.getConfigurationRevision(),
        derived.authoring().steps().stream().map(step -> step.id()).toList(),
        derived.identity().contextDigest(),
        derived.identity().selectedEvidenceReferences(),
        derived.resolvedIntent(),
        derived.requestedSequences(),
        derived.targetScopes(),
        derived.blockingDiagnostics(),
        ContextPromptSection.from(derived.authoring()),
        derived.expectedIntent());
  }

  public boolean matches(CompileRequest request) {
    return sourceRevision == request.sourceRevision()
        && configurationRevision == request.configurationRevision();
  }

  public boolean blocked() {
    return !blockingDiagnostics.isEmpty();
  }
}
