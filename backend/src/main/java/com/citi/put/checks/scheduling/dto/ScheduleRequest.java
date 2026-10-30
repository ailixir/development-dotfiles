package com.citi.put.checks.scheduling.dto;

import java.util.UUID;

/** Exactly one of {@code checkId} / {@code uiTestId} names the target. */
public record ScheduleRequest(
    UUID checkId,
    UUID uiTestId,
    String frequency,
    String cronExpression,
    String timezone,
    Boolean enabled) {}
