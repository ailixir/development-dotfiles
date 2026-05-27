package com.citi.put.checks.scheduling.dto;

import java.util.UUID;

public record ScheduleRequest(
    UUID checkId, String frequency, String cronExpression, String timezone, Boolean enabled) {}
