package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Opaque reference to a nonsecret value. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record VariableReference(@NotNull @Size(min = 1) String referenceId)
    implements StepContextEntry {}
