package com.citi.put.checks.dashboard.dto;

import java.time.Instant;

public record ActivityItemDto(
    String id, String type, String title, String description, String csiName, Instant timestamp) {}
