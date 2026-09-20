package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Safe unresolved authoring diagnostic. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record AuthoringDiagnostic(
    @NotNull Category category, UUID stepId, String field, @NotNull String message) {

  public enum Category {
    @JsonProperty("missingContext")
    MISSING_CONTEXT,
    @JsonProperty("conflictingValue")
    CONFLICTING_VALUE,
    @JsonProperty("ambiguousTarget")
    AMBIGUOUS_TARGET,
    @JsonProperty("incompatibleEvidence")
    INCOMPATIBLE_EVIDENCE,
    @JsonProperty("staleEvidence")
    STALE_EVIDENCE,
    @JsonProperty("literalMismatch")
    LITERAL_MISMATCH,
    @JsonProperty("unsupportedOperation")
    UNSUPPORTED_OPERATION
  }
}
