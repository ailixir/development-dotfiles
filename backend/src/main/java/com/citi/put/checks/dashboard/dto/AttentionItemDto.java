package com.citi.put.checks.dashboard.dto;

import java.time.Instant;

public record AttentionItemDto(
    String id,
    String name,
    String csiId,
    String csiName,
    String status,
    Instant since,
    String reason) {}
