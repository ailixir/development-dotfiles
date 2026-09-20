package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Opaque secret reference; no resolved secret is carried by this contract. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record SecretReference(@NotNull @Size(min = 1) String referenceId)
    implements StepContextEntry {}
