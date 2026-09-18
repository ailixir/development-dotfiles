package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Reviewed variable or secret reference. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ResolvedReferenceInput(@NotNull Kind kind, @NotNull @Size(min = 1) String referenceId)
    implements ResolvedInput {

  public enum Kind {
    @JsonProperty("variableRef")
    VARIABLE_REF,
    @JsonProperty("secretRef")
    SECRET_REF
  }
}
