package com.citi.put.checks.reports;

import com.citi.put.checks.reports.entity.Report;
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
}
