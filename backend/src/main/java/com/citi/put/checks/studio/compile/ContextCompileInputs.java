package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.entity.UITest;
import java.util.List;
import java.util.UUID;

/** Saved v2 context identity carried beside the legacy compiler snapshot. */
public record ContextCompileInputs(
    UUID testId,
    long sourceRevision,
    long configurationRevision,
    List<UUID> orderedStepIds,
    String contextDigest,
    List<AuthoringRevisionInputs.SelectedEvidenceHash> selectedEvidence,
    ContextPromptSection promptSection,
    String referencePolicy) {

  public ContextCompileInputs {
    orderedStepIds = List.copyOf(orderedStepIds);
    selectedEvidence = List.copyOf(selectedEvidence);
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
                test.getAuthoringRevisionInputs());
    return new ContextCompileInputs(
        test.getId(),
        test.getSourceRevision(),
        test.getConfigurationRevision(),
        derived.authoring().steps().stream().map(step -> step.id()).toList(),
        derived.identity().contextDigest(),
        derived.identity().selectedEvidenceReferences(),
        ContextPromptSection.from(derived.authoring()),
        derived.referencePolicy());
  }

  public boolean matches(CompileRequest request) {
    return sourceRevision == request.sourceRevision()
        && configurationRevision == request.configurationRevision();
  }
}
