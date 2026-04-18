package com.citi.put.checks.users.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(name = "sso_id", nullable = false, unique = true)
  private String ssoId;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false, unique = true)
  private String email;

  private String department;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "last_login")
  private Instant lastLogin;

  @Column(name = "is_active", nullable = false)
  private boolean active = true;

  protected User() {}

  public User(String ssoId, String name, String email, String department) {
    this.ssoId = ssoId;
    this.name = name;
    this.email = email;
    this.department = department;
    this.createdAt = Instant.now();
    this.lastLogin = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public String getSsoId() {
    return ssoId;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getDepartment() {
    return department;
  }

  public void setDepartment(String department) {
    this.department = department;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getLastLogin() {
    return lastLogin;
  }

  public void setLastLogin(Instant lastLogin) {
    this.lastLogin = lastLogin;
  }

  public boolean isActive() {
    return active;
  }

  public void setActive(boolean active) {
    this.active = active;
  }
}
