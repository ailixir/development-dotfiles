package com.citi.put.checks.checks;

import com.citi.put.checks.checks.entity.Check;
import java.util.Collection;
import java.util.List;
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

  @Query(
      """
      SELECT c.status, COUNT(c)
      FROM Check c
      WHERE c.csiId = :csiId
      GROUP BY c.status
      """)
  List<Object[]> countByStatusForCsi(@Param("csiId") String csiId);

  @Query(
      value =
          """
          SELECT CAST(c.id AS VARCHAR), c.name, s.next_execution_at, c.csi_name
          FROM schedules s
          JOIN checks c ON c.id = s.check_id
          WHERE s.enabled = true
            AND s.next_execution_at IS NOT NULL
            AND c.deleted_at IS NULL
            AND (:csiId IS NULL OR c.csi_id = :csiId)
          ORDER BY s.next_execution_at ASC
          """,
      nativeQuery = true)
  List<Object[]> findUpcomingChecks(@Param("csiId") String csiId, Pageable pageable);
}
