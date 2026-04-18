package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "csi_tags")
@IdClass(CsiTagSmokeEntity.CsiTagId.class)
public class CsiTagSmokeEntity {

  @Id
  @Column(name = "csi_id", length = 20)
  public String csiId;

  @Id
  @Column(name = "tag_id")
  public UUID tagId;

  public static class CsiTagId implements Serializable {
    public String csiId;
    public UUID tagId;

    public CsiTagId() {}

    public CsiTagId(String csiId, UUID tagId) {
      this.csiId = csiId;
      this.tagId = tagId;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) return true;
      if (!(o instanceof CsiTagId that)) return false;
      return Objects.equals(csiId, that.csiId) && Objects.equals(tagId, that.tagId);
    }

    @Override
    public int hashCode() {
      return Objects.hash(csiId, tagId);
    }
  }
}
