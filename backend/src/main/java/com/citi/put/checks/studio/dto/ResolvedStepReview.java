package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/** Readable review projection bound to one stable step identity. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ResolvedStepReview(
    @NotNull UUID stepId,
    @Valid ResolvedOperation operation,
    @Valid ResolvedTarget target,
    @Valid ResolvedInput input,
    @NotNull List<@Valid ContextProvenance> contextProvenance,
    List<String> assertions,
    @NotNull List<@Valid AuthoringDiagnostic> diagnostics) {

  public ResolvedStepReview {
    contextProvenance = contextProvenance == null ? null : List.copyOf(contextProvenance);
    assertions = assertions == null ? null : List.copyOf(assertions);
    diagnostics = diagnostics == null ? null : List.copyOf(diagnostics);
  }
}
