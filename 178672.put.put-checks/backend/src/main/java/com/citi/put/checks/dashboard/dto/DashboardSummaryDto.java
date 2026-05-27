package com.citi.put.checks.dashboard.dto;

import java.time.Instant;

public record DashboardSummaryDto(
    String overallStatus, DashboardCounts counts, Instant lastUpdated) {

  public record DashboardCounts(int passing, int failing, int warning, int muted) {}
}
