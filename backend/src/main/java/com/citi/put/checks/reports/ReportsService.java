package com.citi.put.checks.reports;

import com.citi.put.checks.reports.dto.ReportDto;
import com.citi.put.checks.reports.dto.ReportExecutionDto;
import com.citi.put.checks.reports.dto.ReportRequest;
import com.citi.put.checks.reports.entity.Report;
import com.citi.put.checks.reports.entity.ReportExecution;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ReportsService {

  private final ReportsRepository reportsRepository;
  private final ReportExecutionRepository executionRepository;

  public ReportsService(
      ReportsRepository reportsRepository, ReportExecutionRepository executionRepository) {
    this.reportsRepository = reportsRepository;
    this.executionRepository = executionRepository;
  }

  public Page<ReportDto> list(String status, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    return reportsRepository.findAllFiltered(status, pageable).map(ReportDto::from);
  }

  @Transactional
  public ReportDto create(ReportRequest request, Authentication auth) {
    UserIdentity identity = extractIdentity(auth);
    Report report =
        new Report(
            request.name(),
            request.description(),
            request.template(),
            request.sections(),
            request.schedule(),
            request.recipients(),
            request.selectedChecks(),
            identity.email());
    report = reportsRepository.save(report);
    return ReportDto.from(report);
  }

  public ReportDto findById(UUID id) {
    Report report =
        reportsRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Report not found: " + id));
    return ReportDto.from(report);
  }

  @Transactional
  public ReportDto update(UUID id, ReportRequest request) {
    Report report =
        reportsRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Report not found: " + id));
    report.setName(request.name());
    report.setDescription(request.description());
    report.setTemplate(request.template());
    report.setSections(request.sections());
    report.setSchedule(request.schedule());
    report.setRecipients(request.recipients());
    report.setSelectedChecks(request.selectedChecks());
    report.setUpdatedAt(Instant.now());
    return ReportDto.from(report);
  }

  @Transactional
  public void softDelete(UUID id) {
    Report report =
        reportsRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Report not found: " + id));
    report.setDeletedAt(Instant.now());
  }

  @Transactional
  public ReportDto pause(UUID id) {
    Report report =
        reportsRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Report not found: " + id));
    report.setStatus("paused");
    report.setUpdatedAt(Instant.now());
    return ReportDto.from(report);
  }

  @Transactional
  public ReportDto resume(UUID id) {
    Report report =
        reportsRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Report not found: " + id));
    report.setStatus("active");
    report.setUpdatedAt(Instant.now());
    return ReportDto.from(report);
  }

  @Transactional
  public ReportDto duplicate(UUID id, Authentication auth) {
    UserIdentity identity = extractIdentity(auth);
    Report original =
        reportsRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Report not found: " + id));
    Report copy =
        new Report(
            original.getName() + " (Copy)",
            original.getDescription(),
            original.getTemplate(),
            original.getSections(),
            original.getSchedule(),
            original.getRecipients(),
            original.getSelectedChecks(),
            identity.email());
    copy.setStatus("draft");
    copy = reportsRepository.save(copy);
    return ReportDto.from(copy);
  }

  @Transactional
  public ReportExecutionDto runNow(UUID id) {
    Report report =
        reportsRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Report not found: " + id));
    int recipientCount = report.getRecipients() != null ? report.getRecipients().length : 0;
    ReportExecution execution =
        new ReportExecution(report.getId(), "success", Instant.now(), recipientCount, 0);
    execution = executionRepository.save(execution);
    return ReportExecutionDto.from(execution);
  }

  public Page<ReportExecutionDto> listExecutions(UUID reportId, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    return executionRepository.findByReportId(reportId, pageable).map(ReportExecutionDto::from);
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }
}
