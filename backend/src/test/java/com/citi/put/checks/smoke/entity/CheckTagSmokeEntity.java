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
@Table(name = "check_tags")
@IdClass(CheckTagSmokeEntity.CheckTagId.class)
public class CheckTagSmokeEntity {

  @Id
  @Column(name = "check_id")
  public UUID checkId;

  @Id
  @Column(name = "tag_id")
  public UUID tagId;

  public static class CheckTagId implements Serializable {
    public UUID checkId;
    public UUID tagId;

    public CheckTagId() {}

    public CheckTagId(UUID checkId, UUID tagId) {
      this.checkId = checkId;
      this.tagId = tagId;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) {
        return true;
      }
      if (!(o instanceof CheckTagId that)) {
        return false;
      }
      return Objects.equals(checkId, that.checkId) && Objects.equals(tagId, that.tagId);
    }

    @Override
    public int hashCode() {
      return Objects.hash(checkId, tagId);
    }
  }
}
