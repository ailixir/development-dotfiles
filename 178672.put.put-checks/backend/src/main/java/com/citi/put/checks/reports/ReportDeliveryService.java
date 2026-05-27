package com.citi.put.checks.reports;

import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.reports.dto.ReportExecutionDto;
import com.citi.put.checks.reports.entity.Report;
import com.citi.put.checks.reports.entity.ReportExecution;
import com.citi.put.checks.reports.mail.ReportMailSender;
import com.citi.put.checks.reports.mail.SendResult;
import com.citi.put.checks.reports.render.ReportRenderer;
import com.citi.put.checks.reports.render.ResolvedSection;
import com.citi.put.checks.reports.section.ReportSection;
import com.citi.put.checks.reports.section.SectionResolver;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportDeliveryService {

  private static final Logger LOG = LoggerFactory.getLogger(ReportDeliveryService.class);

  private final SectionResolver sectionResolver;
  private final ReportRenderer reportRenderer;
  private final ReportExecutionRepository executionRepository;
  private final Optional<ReportMailSender> mailSender;

  public ReportDeliveryService(
      SectionResolver sectionResolver,
      ReportRenderer reportRenderer,
      ReportExecutionRepository executionRepository,
      Optional<ReportMailSender> mailSender) {
    this.sectionResolver = sectionResolver;
    this.reportRenderer = reportRenderer;
    this.executionRepository = executionRepository;
    this.mailSender = mailSender;
  }

  @Transactional
  public ReportExecutionDto deliver(Report report) {
    return deliver(report, report.getRecipients());
  }

  @Transactional
  public ReportExecutionDto deliver(Report report, String[] recipients) {
    long start = System.currentTimeMillis();
    String html;
    int totalChecks;
    int failedChecks;

    try {
      List<ResolvedSection> resolved = resolveSections(report);
      totalChecks = resolved.stream().mapToInt(s -> s.checks().size()).sum();
      failedChecks =
          (int)
              resolved.stream()
                  .flatMap(s -> s.checks().stream())
                  .filter(c -> "FAILING".equals(c.status()))
                  .count();
      html = reportRenderer.render(report, resolved);
    } catch (Exception e) {
      LOG.error(
          "Failed to render report '{}' (id={}): {}",
          report.getName(),
          report.getId(),
          e.getMessage());
      return persistExecution(
          report,
          "FAILED",
          0,
          0,
          0,
          (int) (System.currentTimeMillis() - start),
          null,
          e.getMessage());
    }

    int recipientCount = recipients != null ? recipients.length : 0;

    if (mailSender.isEmpty()) {
      LOG.warn("SMTP not configured — report '{}' rendered but not emailed", report.getName());
      report.setLastSentAt(Instant.now());
      report.setUpdatedAt(Instant.now());
      return persistExecution(
          report,
          "SUCCESS",
          recipientCount,
          totalChecks,
          failedChecks,
          (int) (System.currentTimeMillis() - start),
          html,
          null);
    }

    SendResult sendResult = mailSender.get().send(report.getName(), html, recipients);
    int duration = (int) (System.currentTimeMillis() - start);

    String status;
    String errorMessage = null;
    if (sendResult.allSucceeded()) {
      status = "SUCCESS";
    } else if (sendResult.allFailed()) {
      status = "FAILED";
      errorMessage = "All recipients failed: " + String.join(", ", sendResult.failedRecipients());
    } else {
      status = "PARTIAL";
      errorMessage = "Failed recipients: " + String.join(", ", sendResult.failedRecipients());
    }

    report.setLastSentAt(Instant.now());
    report.setUpdatedAt(Instant.now());

    return persistExecution(
        report, status, recipientCount, totalChecks, failedChecks, duration, html, errorMessage);
  }

  private ReportExecutionDto persistExecution(
      Report report,
      String status,
      int recipientCount,
      int totalChecks,
      int failedChecks,
      int durationMs,
      String html,
      String errorMessage) {
    ReportExecution execution =
        new ReportExecution(report.getId(), status, Instant.now(), recipientCount, totalChecks);
    execution.setChecksFailed(failedChecks);
    execution.setGenerationDurationMs(durationMs);
    execution.setEmailContent(html);
    execution.setErrorMessage(errorMessage);
    execution = executionRepository.save(execution);
    return ReportExecutionDto.from(execution);
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
}
