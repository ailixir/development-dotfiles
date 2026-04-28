package com.citi.put.checks.reports.dto;

import com.citi.put.checks.reports.entity.Report;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public record ReportDto(
    UUID id,
    String name,
    String description,
    String template,
    String status,
    Object sections,
    Object schedule,
    String[] recipients,
    List<String> selectedChecks,
    String createdBy,
    Instant createdAt,
    Instant updatedAt,
    Instant lastSentAt) {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  public static ReportDto from(Report entity) {
    return new ReportDto(
        entity.getId(),
        entity.getName(),
        entity.getDescription(),
        entity.getTemplate(),
        entity.getStatus(),
        parseJson(entity.getSections()),
        parseJson(entity.getSchedule()),
        entity.getRecipients(),
        parseJsonList(entity.getSelectedChecks()),
        entity.getCreatedBy(),
        entity.getCreatedAt(),
        entity.getUpdatedAt(),
        entity.getLastSentAt());
  }

  private static Object parseJson(String raw) {
    if (raw == null || raw.isBlank()) return null;
    try {
      return MAPPER.readValue(raw, Object.class);
    } catch (JsonProcessingException e) {
      return raw;
    }
  }

  @SuppressWarnings("unchecked")
  private static List<String> parseJsonList(String raw) {
    if (raw == null || raw.isBlank()) return Collections.emptyList();
    try {
      return MAPPER.readValue(raw, List.class);
    } catch (JsonProcessingException e) {
      return Collections.emptyList();
    }
  }
}
