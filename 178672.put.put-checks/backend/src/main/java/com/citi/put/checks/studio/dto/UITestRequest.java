package com.citi.put.checks.studio.dto;

public record UITestRequest(
    String name,
    String description,
    String csiId,
    String steps,
    String variables,
    String browser,
    int viewportWidth,
    int viewportHeight,
    int timeoutSeconds,
    String waitStrategy,
    String environment) {}
