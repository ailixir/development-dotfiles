package com.citi.put.checks.templates.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "check_templates")
public class CheckTemplate {

  @Id
  @Column(length = 100)
  private String id;

  @Column(nullable = false)
  private String title;

  private String description;

  @Column(nullable = false, length = 50)
  private String type;

  @Column(nullable = false, length = 20)
  private String difficulty;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private String tags;

  @Column(name = "estimated_setup_minutes")
  private int estimatedSetupMinutes;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "default_configuration", columnDefinition = "jsonb")
  private String defaultConfiguration;

  protected CheckTemplate() {}

  public String getId() {
    return id;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getType() {
    return type;
  }

  public void setType(String type) {
    this.type = type;
  }

  public String getDifficulty() {
    return difficulty;
  }

  public void setDifficulty(String difficulty) {
    this.difficulty = difficulty;
  }

  public String getTags() {
    return tags;
  }

  public void setTags(String tags) {
    this.tags = tags;
  }

  public int getEstimatedSetupMinutes() {
    return estimatedSetupMinutes;
  }

  public void setEstimatedSetupMinutes(int estimatedSetupMinutes) {
    this.estimatedSetupMinutes = estimatedSetupMinutes;
  }

  public String getDefaultConfiguration() {
    return defaultConfiguration;
  }

  public void setDefaultConfiguration(String defaultConfiguration) {
    this.defaultConfiguration = defaultConfiguration;
  }
}
