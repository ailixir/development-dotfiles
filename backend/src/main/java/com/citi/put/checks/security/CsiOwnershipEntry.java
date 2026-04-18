package com.citi.put.checks.security;

import com.fasterxml.jackson.annotation.JsonProperty;

public record CsiOwnershipEntry(
    @JsonProperty("csi_id") String csiId,
    @JsonProperty("role") String role
) {}
