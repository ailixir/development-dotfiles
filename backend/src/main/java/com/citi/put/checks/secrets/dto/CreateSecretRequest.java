package com.citi.put.checks.secrets.dto;

import java.time.Instant;

public record CreateSecretRequest(String label, String scope, String value, Instant expiresAt) {}
