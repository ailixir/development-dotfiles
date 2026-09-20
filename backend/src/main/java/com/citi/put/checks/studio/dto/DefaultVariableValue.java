package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Reference-backed nonsecret contextual default. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record DefaultVariableValue(@NotNull @Size(min = 1) String referenceId)
    implements DefaultValue {}
