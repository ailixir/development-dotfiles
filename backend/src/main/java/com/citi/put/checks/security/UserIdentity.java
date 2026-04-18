package com.citi.put.checks.security;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record UserIdentity(
    @JsonProperty("user_id") String userId,
    @JsonProperty("email") String email,
    @JsonProperty("name") String name,
    @JsonProperty("department") String department,
    @JsonProperty("roles") List<String> roles,
    @JsonProperty("csi_ownership") List<CsiOwnershipEntry> csiOwnership
) {}
