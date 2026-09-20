package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;

/** Plain, non-executable authoring context. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ContextText(@NotNull String value) implements GlobalContextEntry, StepContextEntry {}
