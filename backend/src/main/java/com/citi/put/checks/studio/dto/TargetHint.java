package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A non-authoritative locator hint. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record TargetHint(
    @NotNull Strategy strategy, @NotNull @Size(min = 1) String value, String scope, Boolean exact)
    implements GlobalContextEntry, StepContextEntry {

  public enum Strategy {
    @JsonProperty("role")
    ROLE,
    @JsonProperty("label")
    LABEL,
    @JsonProperty("testId")
    TEST_ID,
    @JsonProperty("text")
    TEXT
  }
}
