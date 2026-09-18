package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A nonsecret fallback that explicit step intent may override. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ContextualDefault(
    @NotNull @Size(min = 1) String name, @NotNull @Valid DefaultValue value)
    implements GlobalContextEntry, StepContextEntry {}
