package com.citi.put.checks.scheduling.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "schedules")
public class Schedule {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(name = "check_id", unique = true)
  private UUID checkId;

  @Column(name = "ui_test_id", unique = true)
  private UUID uiTestId;

  @Column(nullable = false, length = 50)
  private String frequency;

  @Column(name = "cron_expression", length = 100)
  private String cronExpression;

  @Column(nullable = false, length = 50)
  private String timezone = "UTC";

  @Column(nullable = false)
  private boolean enabled = true;

  @Column(name = "days_of_week", columnDefinition = "integer[]")
  @JdbcTypeCode(SqlTypes.ARRAY)
  private int[] daysOfWeek;

  @Column(name = "time_of_day")
  private LocalTime timeOfDay;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private String metadata;

  @Column(name = "check_type", nullable = false, length = 20)
  private String checkType;

  @Column(name = "next_execution_at")
  private Instant nextExecutionAt;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected Schedule() {}

  public Schedule(
      UUID checkId,
      String frequency,
      String cronExpression,
      String timezone,
      boolean enabled,
      Instant nextExecutionAt) {
    this.checkId = checkId;
    this.frequency = frequency;
    this.cronExpression = cronExpression;
    this.timezone = timezone;
    this.enabled = enabled;
    this.nextExecutionAt = nextExecutionAt;
    this.createdAt = Instant.now();
    this.updatedAt = Instant.now();
  }

  public Schedule(
      UUID checkId,
      String checkType,
      String frequency,
      String cronExpression,
      String timezone,
      boolean enabled,
      Instant nextExecutionAt) {
    this(checkId, frequency, cronExpression, timezone, enabled, nextExecutionAt);
    this.checkType = checkType;
  }

  /** A schedule whose target is a UI test (a row in {@code ui_tests}, not in {@code checks}). */
  public static Schedule forUiTest(
      UUID uiTestId,
      String frequency,
      String cronExpression,
      String timezone,
      boolean enabled,
      Instant nextExecutionAt) {
    Schedule schedule =
        new Schedule(
            null, "UI_TEST", frequency, cronExpression, timezone, enabled, nextExecutionAt);
    schedule.uiTestId = uiTestId;
    return schedule;
  }

  public UUID getId() {
    return id;
  }

  public UUID getCheckId() {
    return checkId;
  }

  public UUID getUiTestId() {
    return uiTestId;
  }

  public String getFrequency() {
    return frequency;
  }

  public void setFrequency(String frequency) {
    this.frequency = frequency;
  }

  public String getCronExpression() {
    return cronExpression;
  }

  public void setCronExpression(String cronExpression) {
    this.cronExpression = cronExpression;
  }

  public String getTimezone() {
    return timezone;
  }

  public void setTimezone(String timezone) {
    this.timezone = timezone;
  }

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public int[] getDaysOfWeek() {
    return daysOfWeek;
  }

  public void setDaysOfWeek(int[] daysOfWeek) {
    this.daysOfWeek = daysOfWeek;
  }

  public LocalTime getTimeOfDay() {
    return timeOfDay;
  }

  public void setTimeOfDay(LocalTime timeOfDay) {
    this.timeOfDay = timeOfDay;
  }

  public String getMetadata() {
    return metadata;
  }

  public void setMetadata(String metadata) {
    this.metadata = metadata;
  }

  public String getCheckType() {
    return checkType;
  }

  public void setCheckType(String checkType) {
    this.checkType = checkType;
  }

  public Instant getNextExecutionAt() {
    return nextExecutionAt;
  }

  public void setNextExecutionAt(Instant nextExecutionAt) {
    this.nextExecutionAt = nextExecutionAt;
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
}
