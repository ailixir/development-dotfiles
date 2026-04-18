package com.citi.put.checks.checks;

import com.citi.put.checks.checks.entity.Check;
import java.util.Collection;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CheckRepository extends JpaRepository<Check, UUID> {

  @Query(
      """
      SELECT c FROM Check c
      WHERE (:csiId IS NULL OR c.csiId = :csiId)
        AND (:type IS NULL OR c.type = :type)
        AND (:status IS NULL OR c.status = :status)
        AND (:environment IS NULL OR c.environment = :environment)
        AND (:createdBy IS NULL OR c.createdBy = :createdBy)
        AND (:search IS NULL OR LOWER(c.name) LIKE :search
             OR (c.description IS NOT NULL AND LOWER(c.description) LIKE :search))
      """)
  Page<Check> findAllFiltered(
      @Param("csiId") String csiId,
      @Param("type") String type,
      @Param("status") String status,
      @Param("environment") String environment,
      @Param("createdBy") String createdBy,
      @Param("search") String search,
      Pageable pageable);

  @Query(
      """
      SELECT c FROM Check c
      WHERE c.csiId IN :ownedCsiIds
        AND (:csiId IS NULL OR c.csiId = :csiId)
        AND (:type IS NULL OR c.type = :type)
        AND (:status IS NULL OR c.status = :status)
        AND (:environment IS NULL OR c.environment = :environment)
        AND (:createdBy IS NULL OR c.createdBy = :createdBy)
        AND (:search IS NULL OR LOWER(c.name) LIKE :search
             OR (c.description IS NOT NULL AND LOWER(c.description) LIKE :search))
      """)
  Page<Check> findAllVisibleToFiltered(
      @Param("ownedCsiIds") Collection<String> ownedCsiIds,
      @Param("csiId") String csiId,
      @Param("type") String type,
      @Param("status") String status,
      @Param("environment") String environment,
      @Param("createdBy") String createdBy,
      @Param("search") String search,
      Pageable pageable);
}
