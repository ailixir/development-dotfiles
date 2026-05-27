package com.citi.put.checks.reports.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ReportRequest(
    @NotBlank @Size(max = 255) String name,
    @Size(max = 2000) String description,
    @NotBlank @Size(max = 50) String template,
    @NotNull JsonNode sections,
    @NotNull JsonNode schedule,
    @NotEmpty String[] recipients,
    JsonNode selectedChecks) {}
