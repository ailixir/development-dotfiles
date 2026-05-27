package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "schedules")
public class ScheduleSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "check_id", nullable = false)
  public UUID checkId;

  @Column(name = "frequency", nullable = false, length = 50)
  public String frequency;

  @Column(name = "cron_expression", length = 100)
  public String cronExpression;

  @Column(name = "timezone", nullable = false, length = 50)
  public String timezone;

  @Column(name = "enabled", nullable = false)
  public Boolean enabled;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "days_of_week", columnDefinition = "integer[]")
  public Integer[] daysOfWeek;

  @Column(name = "time_of_day")
  public LocalTime timeOfDay;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "metadata", columnDefinition = "jsonb")
  public String metadata;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  public Instant updatedAt;
}
