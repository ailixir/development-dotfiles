package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

/** Reviewed exact literal input. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ResolvedLiteralInput(@NotNull Kind kind, @NotNull String value)
    implements ResolvedInput {

  public enum Kind {
    @JsonProperty("literal")
    LITERAL
  }
}
