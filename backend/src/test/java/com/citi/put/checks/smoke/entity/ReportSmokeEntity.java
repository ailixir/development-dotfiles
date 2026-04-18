package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "reports")
public class ReportSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "name", nullable = false)
  public String name;

  @Column(name = "description")
  public String description;

  @Column(name = "template", nullable = false, length = 50)
  public String template;

  @Column(name = "status", nullable = false, length = 20)
  public String status;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "schedule", nullable = false, columnDefinition = "jsonb")
  public String schedule;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "recipients", nullable = false, columnDefinition = "text[]")
  public String[] recipients;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "sections", nullable = false, columnDefinition = "jsonb")
  public String sections;

  @Column(name = "created_by", nullable = false)
  public String createdBy;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  public Instant updatedAt;

  @Column(name = "last_sent_at")
  public Instant lastSentAt;

  @Column(name = "deleted_at")
  public Instant deletedAt;
}
