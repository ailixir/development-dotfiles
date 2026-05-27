package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.entity.UITestExecution;
import java.time.Instant;
import java.util.UUID;

public record UITestExecutionDto(
    UUID id,
    UUID testId,
    UUID checkId,
    String status,
    Instant startedAt,
    Instant endedAt,
    int durationMs,
    String videoUrl,
    String[] screenshotUrls,
    String logs,
    String errorDetails,
    Instant createdAt) {

  public static UITestExecutionDto from(UITestExecution entity) {
    return new UITestExecutionDto(
        entity.getId(),
        entity.getTestId(),
        entity.getCheckId(),
        entity.getStatus(),
        entity.getStartedAt(),
        entity.getEndedAt(),
        entity.getDurationMs(),
        entity.getVideoUrl(),
        entity.getScreenshotUrls(),
        entity.getLogs(),
        entity.getErrorDetails(),
        entity.getCreatedAt());
  }
}
