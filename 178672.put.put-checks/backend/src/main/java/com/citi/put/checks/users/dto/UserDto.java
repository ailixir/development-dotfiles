package com.citi.put.checks.users.dto;

import com.citi.put.checks.users.entity.User;
import java.time.Instant;
import java.util.UUID;

public record UserDto(
    UUID id,
    String ssoId,
    String name,
    String email,
    String department,
    Instant createdAt,
    Instant lastLogin,
    boolean active) {

  public static UserDto from(User user) {
    return new UserDto(
        user.getId(),
        user.getSsoId(),
        user.getName(),
        user.getEmail(),
        user.getDepartment(),
        user.getCreatedAt(),
        user.getLastLogin(),
        user.isActive());
  }
}
