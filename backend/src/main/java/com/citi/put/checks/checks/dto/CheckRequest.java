package com.citi.put.checks.checks.dto;

import com.citi.put.checks.checks.model.CheckConfiguration;

public record CheckRequest(
    String name,
    String description,
    String csiId,
    String environment,
    CheckConfiguration configuration) {}
