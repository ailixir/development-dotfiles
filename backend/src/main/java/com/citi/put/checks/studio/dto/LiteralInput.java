package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;

/** Exact step input. Empty and whitespace-only values are intentionally valid. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record LiteralInput(@NotNull String value) implements StepContextEntry {}
