package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import java.util.List;

/** Context that specializes the global context for one stable step. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record StepAuthoringContext(
    List<@Valid StepContextEntry> entries,
    List<@Valid AuthoringEvidenceReference> evidenceReferences) {

  public StepAuthoringContext {
    entries = entries == null ? List.of() : List.copyOf(entries);
    evidenceReferences = evidenceReferences == null ? List.of() : List.copyOf(evidenceReferences);
  }

  public static StepAuthoringContext empty() {
    return new StepAuthoringContext(List.of(), List.of());
  }
}
