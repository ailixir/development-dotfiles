package com.citi.put.checks.dashboard.dto;

import java.time.Instant;

public record UpcomingItemDto(
    String checkId, String checkName, Instant nextExecution, String csiName) {}
