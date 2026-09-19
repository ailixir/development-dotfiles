package com.citi.put.checks.studio.context;

import com.citi.put.checks.studio.dto.AuthoringDiagnostic;
import com.citi.put.checks.studio.dto.ResolvedStepReview;
import java.util.List;

/**
 * Pure resolver result. Blocking diagnostics are explicit and cannot be replaced by explanation.
 */
public record ResolvedAuthoringContext(
    List<ResolvedStepReview> steps,
    List<EvidenceCoverage> evidenceCoverage,
    List<AuthoringDiagnostic> diagnostics) {

  public ResolvedAuthoringContext {
    steps = List.copyOf(steps);
    evidenceCoverage = List.copyOf(evidenceCoverage);
    diagnostics = List.copyOf(diagnostics);
  }

  public boolean blocked() {
    return !diagnostics.isEmpty();
  }
}
