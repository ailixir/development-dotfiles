package com.citi.put.checks.reports.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "reports")
@SQLRestriction("deleted_at IS NULL")
public class Report {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(nullable = false)
  private String name;

  private String description;

  @Column(nullable = false, length = 50)
  private String template;

  @Column(nullable = false, length = 20)
  private String status = "draft";

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", nullable = false)
  private String sections;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", nullable = false)
  private String schedule;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(columnDefinition = "text[]", nullable = false)
  private String[] recipients;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "selected_checks", columnDefinition = "jsonb")
  private String selectedChecks;

  @Column(name = "created_by", nullable = false)
  private String createdBy;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "last_sent_at")
  private Instant lastSentAt;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  protected Report() {}

  public Report(
      String name,
      String description,
      String template,
      String sections,
      String schedule,
      String[] recipients,
      String selectedChecks,
      String createdBy) {
    this.name = name;
    this.description = description;
    this.template = template;
    this.sections = sections;
    this.schedule = schedule;
    this.recipients = recipients;
    this.selectedChecks = selectedChecks;
    this.createdBy = createdBy;
    this.createdAt = Instant.now();
    this.updatedAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getTemplate() {
    return template;
  }

  public void setTemplate(String template) {
    this.template = template;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getSections() {
    return sections;
  }

  public void setSections(String sections) {
    this.sections = sections;
  }

  public String getSchedule() {
    return schedule;
  }

  public void setSchedule(String schedule) {
    this.schedule = schedule;
  }

  public String[] getRecipients() {
    return recipients;
  }

  public void setRecipients(String[] recipients) {
    this.recipients = recipients;
  }

  public String getSelectedChecks() {
    return selectedChecks;
  }

  public void setSelectedChecks(String selectedChecks) {
    this.selectedChecks = selectedChecks;
  }

  public String getCreatedBy() {
    return createdBy;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(Instant updatedAt) {
    this.updatedAt = updatedAt;
  }

  public Instant getLastSentAt() {
    return lastSentAt;
  }

  public void setLastSentAt(Instant lastSentAt) {
    this.lastSentAt = lastSentAt;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }

  public void setDeletedAt(Instant deletedAt) {
    this.deletedAt = deletedAt;
  }
}
