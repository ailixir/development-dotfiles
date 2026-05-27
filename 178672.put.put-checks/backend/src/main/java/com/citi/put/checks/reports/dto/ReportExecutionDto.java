package com.citi.put.checks.reports.dto;

import com.citi.put.checks.reports.entity.ReportExecution;
import java.time.Instant;
import java.util.UUID;

public record ReportExecutionDto(
    UUID id,
    UUID reportId,
    String status,
    Instant executedAt,
    int recipientCount,
    int checksIncluded,
    int checksFailed,
    Integer generationDurationMs,
    String emailContent,
    String errorMessage,
    Instant createdAt) {

  public static ReportExecutionDto from(ReportExecution entity) {
    return new ReportExecutionDto(
        entity.getId(),
        entity.getReportId(),
        entity.getStatus(),
        entity.getExecutedAt(),
        entity.getRecipientCount(),
        entity.getChecksIncluded(),
        entity.getChecksFailed(),
        entity.getGenerationDurationMs(),
        entity.getEmailContent(),
        entity.getErrorMessage(),
        entity.getCreatedAt());
  }
}
