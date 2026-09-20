package com.citi.put.checks.studio.context;

import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import java.util.UUID;

/** Current-state evidence coverage; predicted state is never presented as observed. */
public record EvidenceCoverage(
    UUID stepId,
    UUID evidenceId,
    Source source,
    AuthoringEvidenceReference.Completeness completeness,
    String route,
    String state) {

  public enum Source {
    SUPPLIED,
    OBSERVED,
    UNKNOWN,
    PREDICTED
  }
}
