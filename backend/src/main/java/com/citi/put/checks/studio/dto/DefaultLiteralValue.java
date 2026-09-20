package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;

/** Exact nonsecret contextual default. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record DefaultLiteralValue(@NotNull String value) implements DefaultValue {}
