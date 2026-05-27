package com.citi.put.checks.dashboard.dto;

import java.time.Instant;

public record ReportSnapshotDto(
    String id, String name, Instant nextScheduledAt, String lastStatus) {}
