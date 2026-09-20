package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import java.util.List;

/** Test-scoped context inherited by all steps. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record GlobalAuthoringContext(
    List<@Valid GlobalContextEntry> entries,
    List<@Valid AuthoringEvidenceReference> evidenceReferences) {

  public GlobalAuthoringContext {
    entries = entries == null ? List.of() : List.copyOf(entries);
    evidenceReferences = evidenceReferences == null ? List.of() : List.copyOf(evidenceReferences);
  }

  public static GlobalAuthoringContext empty() {
    return new GlobalAuthoringContext(List.of(), List.of());
  }
}
