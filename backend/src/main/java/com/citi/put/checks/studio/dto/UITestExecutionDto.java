package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.entity.UITestExecution;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
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
    List<Map<String, Object>> logs,
    List<Map<String, Object>> stepResults,
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
        parseLogs(entity.getLogs(), entity.getStartedAt()),
        parseJson(entity.getErrorDetails()),
        entity.getErrorDetails(),
        entity.getCreatedAt());
  }

  private static List<Map<String, Object>> parseJson(String value) {
    if (value == null || value.isBlank()) {
      return List.of();
    }
    try {
      return new ObjectMapper().readValue(value, new TypeReference<>() {});
    } catch (Exception ignored) {
      return List.of();
    }
  }

  private static List<Map<String, Object>> parseLogs(String value, Instant timestamp) {
    List<Map<String, Object>> parsed = parseJson(value);
    if (!parsed.isEmpty() || value == null || value.isBlank()) {
      return parsed;
    }
    return List.of(
        Map.of(
            "timestamp", timestamp.toString(),
            "type", "info",
            "message", value));
  }
}
