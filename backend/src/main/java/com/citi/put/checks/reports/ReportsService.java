package com.citi.put.checks.reports;

import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.reports.dto.ReportDto;
import com.citi.put.checks.reports.dto.ReportExecutionDto;
import com.citi.put.checks.reports.dto.ReportRequest;
import com.citi.put.checks.reports.entity.Report;
import com.citi.put.checks.reports.render.ReportRenderer;
import com.citi.put.checks.reports.render.ResolvedSection;
import com.citi.put.checks.reports.schedule.ReportScheduleResolver;
import com.citi.put.checks.reports.section.ReportSection;
import com.citi.put.checks.reports.section.SectionResolver;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

  private static final Logger LOG = LoggerFactory.getLogger(ReportsService.class);

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final ReportsRepository reportsRepository;
  private final ReportExecutionRepository executionRepository;
  private final SectionResolver sectionResolver;
  private final ReportRenderer reportRenderer;
  private final ReportScheduleResolver scheduleResolver;
  private final ReportDeliveryService deliveryService;

  public ReportsService(
      ReportsRepository reportsRepository,
      ReportExecutionRepository executionRepository,
      SectionResolver sectionResolver,
      ReportRenderer reportRenderer,
      ReportScheduleResolver scheduleResolver,
      ReportDeliveryService deliveryService) {
    this.reportsRepository = reportsRepository;
    this.executionRepository = executionRepository;
    this.sectionResolver = sectionResolver;
    this.reportRenderer = reportRenderer;
    this.scheduleResolver = scheduleResolver;
    this.deliveryService = deliveryService;
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
            toJsonString(request.sections()),
            toJsonString(request.schedule()),
            request.recipients(),
            toJsonString(request.selectedChecks()),
            identity.email());
    // draft reports don't get scheduled — nextDeliveryAt stays null
    report = reportsRepository.save(report);
    return ReportDto.from(report);
  }

  public ReportDto findById(UUID id) {
    return ReportDto.from(findEntity(id));
  }

  @Transactional
  public ReportDto update(UUID id, ReportRequest request) {
    Report report = findEntity(id);
    report.setName(request.name());
    report.setDescription(request.description());
    report.setTemplate(request.template());
    report.setSections(toJsonString(request.sections()));
    report.setSchedule(toJsonString(request.schedule()));
    report.setRecipients(request.recipients());
    report.setSelectedChecks(toJsonString(request.selectedChecks()));
    report.setUpdatedAt(Instant.now());
    report.setNextDeliveryAt(
        "ACTIVE".equals(report.getStatus()) ? resolveNextDelivery(request.schedule()) : null);
    return ReportDto.from(report);
  }

  @Transactional
  public void softDelete(UUID id) {
    Report report = findEntity(id);
    report.setDeletedAt(Instant.now());
    report.setNextDeliveryAt(null);
  }

  @Transactional
  public ReportDto pause(UUID id) {
    Report report = findEntity(id);
    report.setStatus("PAUSED");
    report.setUpdatedAt(Instant.now());
    report.setNextDeliveryAt(null);
    return ReportDto.from(report);
  }

  @Transactional
  public ReportDto resume(UUID id) {
    Report report = findEntity(id);
    report.setStatus("ACTIVE");
    report.setUpdatedAt(Instant.now());
    report.setNextDeliveryAt(resolveNextDeliveryFromRaw(report.getSchedule()));
    return ReportDto.from(report);
  }

  @Transactional
  public ReportDto duplicate(UUID id, Authentication auth) {
    UserIdentity identity = extractIdentity(auth);
    Report original = findEntity(id);
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
    copy.setStatus("DRAFT");
    copy.setNextDeliveryAt(null);
    copy = reportsRepository.save(copy);
    return ReportDto.from(copy);
  }

  public String renderPreview(UUID id) {
    Report report = findEntity(id);
    List<ResolvedSection> resolved = resolveSections(report);
    return reportRenderer.render(report, resolved);
  }

  @Transactional
  public ReportExecutionDto runNow(UUID id) {
    Report report = findEntity(id);
    return deliveryService.deliver(report);
  }

  public Page<ReportExecutionDto> listExecutions(UUID reportId, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    return executionRepository.findByReportId(reportId, pageable).map(ReportExecutionDto::from);
  }

  @Transactional
  public ReportExecutionDto sendTest(UUID id, String recipientOverride) {
    Report report = findEntity(id);
    String[] recipients =
        (recipientOverride != null && !recipientOverride.isBlank())
            ? new String[] {recipientOverride}
            : report.getRecipients();
    return deliveryService.deliver(report, recipients);
  }

  private Instant resolveNextDelivery(JsonNode scheduleNode) {
    if (scheduleNode == null || scheduleNode.isNull()) {
      return null;
    }
    return scheduleResolver.nextDelivery(scheduleNode);
  }

  private Instant resolveNextDeliveryFromRaw(String scheduleJson) {
    if (scheduleJson == null || scheduleJson.isBlank()) {
      return null;
    }
    try {
      JsonNode node = MAPPER.readTree(scheduleJson);
      return scheduleResolver.nextDelivery(node);
    } catch (JsonProcessingException e) {
      LOG.warn("Failed to parse schedule JSON for nextDeliveryAt resolution: {}", e.getMessage());
      return null;
    }
  }

  private String toJsonString(JsonNode node) {
    return node != null ? node.toString() : null;
  }

  private Report findEntity(UUID id) {
    return reportsRepository.findById(id).orElseThrow(() -> new ReportNotFoundException(id));
  }

  private List<ResolvedSection> resolveSections(Report report) {
    List<ReportSection> sections = sectionResolver.parseSections(report.getSections());
    return sections.stream()
        .map(
            s -> {
              List<CheckDto> checks = sectionResolver.resolve(s);
              return new ResolvedSection(s.title(), checks);
            })
        .toList();
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }
}
