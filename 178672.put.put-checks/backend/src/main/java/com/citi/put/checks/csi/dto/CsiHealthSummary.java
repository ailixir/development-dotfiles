package com.citi.put.checks.csi.dto;

import java.time.Instant;

public record CsiHealthSummary(
    String csiId,
    int totalChecks,
    int passingChecks,
    int failingChecks,
    int warningChecks,
    String overallStatus,
    Instant lastUpdated) {}
