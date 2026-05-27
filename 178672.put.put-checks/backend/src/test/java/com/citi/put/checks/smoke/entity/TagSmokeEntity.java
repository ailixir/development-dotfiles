package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tags")
public class TagSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "name", nullable = false, unique = true, length = 100)
  public String name;

  @Column(name = "category", length = 50)
  public String category;

  @Column(name = "description")
  public String description;

  @Column(name = "color", length = 7)
  public String color;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;
}
