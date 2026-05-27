package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "sso_id", nullable = false, unique = true)
  public String ssoId;

  @Column(name = "name", nullable = false)
  public String name;

  @Column(name = "email", nullable = false, unique = true)
  public String email;

  @Column(name = "department")
  public String department;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "last_login")
  public Instant lastLogin;

  @Column(name = "is_active", nullable = false)
  public Boolean isActive;
}
