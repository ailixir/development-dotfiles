package com.citi.put.checks.checks.dto;

import java.time.Instant;

public record UpcomingCheckDto(
    String checkId, String checkName, Instant nextExecution, String csiName) {}
