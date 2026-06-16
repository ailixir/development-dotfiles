package com.citi.put.checks.checks.dto;

import com.citi.put.checks.checks.model.CheckConfiguration;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CheckRequest(
    String name,
    String description,
    String csiId,
    String environment,
    CheckConfiguration configuration,
    @Size(max = 20, message = "A check can have at most 20 tags")
        List<@Size(max = 100, message = "Tag name must be at most 100 characters") String> tags) {}
