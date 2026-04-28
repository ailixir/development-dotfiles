package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITest;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StudioRepository extends JpaRepository<UITest, UUID> {

  @Query(
      """
      SELECT t FROM UITest t
      WHERE (:csiId IS NULL OR t.csiId = :csiId)
      """)
  Page<UITest> findAllFiltered(@Param("csiId") String csiId, Pageable pageable);
}
