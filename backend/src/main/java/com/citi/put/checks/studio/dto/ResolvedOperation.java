package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

/** Reviewed operation kind. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ResolvedOperation(@NotNull Kind kind) {

  public enum Kind {
    @JsonProperty("navigate")
    NAVIGATE,
    @JsonProperty("click")
    CLICK,
    @JsonProperty("fill")
    FILL,
    @JsonProperty("press")
    PRESS,
    @JsonProperty("select")
    SELECT,
    @JsonProperty("check")
    CHECK,
    @JsonProperty("assert")
    ASSERT
  }
}
