package com.citi.put.checks.reports;

import com.citi.put.checks.reports.entity.ReportExecution;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReportExecutionRepository extends JpaRepository<ReportExecution, UUID> {

  Page<ReportExecution> findByReportId(UUID reportId, Pageable pageable);
}
