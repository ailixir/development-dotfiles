package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "csi_systems")
public class CsiSystemSmokeEntity {

  @Id
  @Column(name = "id", length = 20)
  public String id;

  @Column(name = "name", nullable = false)
  public String name;

  @Column(name = "description")
  public String description;

  @Column(name = "business_unit", nullable = false, length = 100)
  public String businessUnit;

  @Column(name = "criticality", nullable = false, length = 20)
  public String criticality;

  @Column(name = "owner_email", nullable = false)
  public String ownerEmail;

  @Column(name = "environment", nullable = false, length = 20)
  public String environment;

  @Column(name = "status", nullable = false, length = 20)
  public String status;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "metadata", columnDefinition = "jsonb")
  public String metadata;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  public Instant updatedAt;

  @Column(name = "deleted_at")
  public Instant deletedAt;
}
