package com.citi.put.checks.csi;

import com.citi.put.checks.csi.entity.CsiSystem;
import java.util.Collection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CsiRepository extends JpaRepository<CsiSystem, String> {

  @Query(
      """
      SELECT c FROM CsiSystem c
      WHERE (c.id IN :ownedCsiIds
             OR CAST(c.metadata AS string) LIKE '%"visibility":"public"%')
      """)
  Page<CsiSystem> findAllVisibleTo(
      @Param("ownedCsiIds") Collection<String> ownedCsiIds, Pageable pageable);

  @Query(
      """
      SELECT c FROM CsiSystem c
      WHERE (c.id IN :ownedCsiIds
             OR CAST(c.metadata AS string) LIKE '%"visibility":"public"%')
        AND (:businessUnit IS NULL OR c.businessUnit = :businessUnit)
        AND (:criticality IS NULL OR c.criticality = :criticality)
        AND (:environment IS NULL OR c.environment = :environment)
        AND (:status IS NULL OR c.status = :status)
        AND (:search IS NULL OR (LOWER(c.name) LIKE :search
             OR (c.description IS NOT NULL AND LOWER(c.description) LIKE :search)))
      """)
  Page<CsiSystem> findAllVisibleToFiltered(
      @Param("ownedCsiIds") Collection<String> ownedCsiIds,
      @Param("businessUnit") String businessUnit,
      @Param("criticality") String criticality,
      @Param("environment") String environment,
      @Param("status") String status,
      @Param("search") String search,
      Pageable pageable);

  @Query(
      """
      SELECT c FROM CsiSystem c
      WHERE (:businessUnit IS NULL OR c.businessUnit = :businessUnit)
        AND (:criticality IS NULL OR c.criticality = :criticality)
        AND (:environment IS NULL OR c.environment = :environment)
        AND (:status IS NULL OR c.status = :status)
        AND (:search IS NULL OR (LOWER(c.name) LIKE :search
             OR (c.description IS NOT NULL AND LOWER(c.description) LIKE :search)))
      """)
  Page<CsiSystem> findAllFiltered(
      @Param("businessUnit") String businessUnit,
      @Param("criticality") String criticality,
      @Param("environment") String environment,
      @Param("status") String status,
      @Param("search") String search,
      Pageable pageable);
}
