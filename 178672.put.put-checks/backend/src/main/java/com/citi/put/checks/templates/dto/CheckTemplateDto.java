package com.citi.put.checks.templates.dto;

import com.citi.put.checks.templates.entity.CheckTemplate;

public record CheckTemplateDto(
    String id,
    String title,
    String description,
    String type,
    String difficulty,
    String tags,
    int estimatedSetupMinutes,
    String defaultConfiguration) {

  public static CheckTemplateDto from(CheckTemplate entity) {
    return new CheckTemplateDto(
        entity.getId(),
        entity.getTitle(),
        entity.getDescription(),
        entity.getType(),
        entity.getDifficulty(),
        entity.getTags(),
        entity.getEstimatedSetupMinutes(),
        entity.getDefaultConfiguration());
  }
}
