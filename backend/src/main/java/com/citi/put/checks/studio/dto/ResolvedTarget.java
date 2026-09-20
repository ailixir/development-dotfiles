package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Reviewed target and optional supporting evidence identity. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ResolvedTarget(
    @NotNull Strategy strategy, @NotNull String value, Boolean exact, UUID evidenceReferenceId) {

  public enum Strategy {
    @JsonProperty("role")
    ROLE,
    @JsonProperty("label")
    LABEL,
    @JsonProperty("testId")
    TEST_ID,
    @JsonProperty("text")
    TEXT,
    @JsonProperty("url")
    URL
  }
}
