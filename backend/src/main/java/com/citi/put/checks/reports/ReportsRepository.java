package com.citi.put.checks.reports;

import com.citi.put.checks.reports.entity.Report;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReportsRepository extends JpaRepository<Report, UUID> {

  @Query(
      """
      SELECT r FROM Report r
      WHERE (:status IS NULL OR r.status = :status)
      """)
  Page<Report> findAllFiltered(@Param("status") String status, Pageable pageable);

  @Query(
      """
      SELECT r FROM Report r
      WHERE r.status = 'ACTIVE'
        AND r.deletedAt IS NULL
        AND r.nextDeliveryAt IS NOT NULL
        AND r.nextDeliveryAt <= :now
      ORDER BY r.nextDeliveryAt ASC
      """)
  List<Report> findDueReports(@Param("now") Instant now, Pageable pageable);
}
