package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Field-level explanation of how reviewed intent was resolved. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ContextProvenance(
    @NotNull @Size(min = 1) String field,
    @NotNull Scope scope,
    @NotNull SourceKind sourceKind,
    String sourceId) {

  public enum Scope {
    @JsonProperty("explicitStep")
    EXPLICIT_STEP,
    @JsonProperty("stepContext")
    STEP_CONTEXT,
    @JsonProperty("globalContext")
    GLOBAL_CONTEXT,
    @JsonProperty("policy")
    POLICY,
    @JsonProperty("evidence")
    EVIDENCE
  }

  public enum SourceKind {
    @JsonProperty("user")
    USER,
    @JsonProperty("supplied")
    SUPPLIED,
    @JsonProperty("observed")
    OBSERVED,
    @JsonProperty("policy")
    POLICY
  }
}
