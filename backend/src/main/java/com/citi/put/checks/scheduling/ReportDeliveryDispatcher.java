package com.citi.put.checks.scheduling;

import com.citi.put.checks.reports.ReportDeliveryService;
import com.citi.put.checks.reports.ReportsRepository;
import com.citi.put.checks.reports.entity.Report;
import com.citi.put.checks.reports.schedule.ReportScheduleResolver;
import com.citi.put.checks.scheduling.entity.FailedDispatch;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    name = "checks.reports.delivery-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class ReportDeliveryDispatcher {

  private static final Logger LOG = LoggerFactory.getLogger(ReportDeliveryDispatcher.class);

  private static final int AUTO_DISABLE_THRESHOLD = 5;

  private final ReportsRepository reportsRepository;
  private final ReportDeliveryService deliveryService;
  private final ReportScheduleResolver scheduleResolver;
  private final ObjectMapper objectMapper;
  private final MeterRegistry meterRegistry;
  private final FailedDispatchRepository failedDispatchRepository;
  private final int batchSize;
  private final int maxRetries;

  public ReportDeliveryDispatcher(
      ReportsRepository reportsRepository,
      ReportDeliveryService deliveryService,
      ReportScheduleResolver scheduleResolver,
      ObjectMapper objectMapper,
      MeterRegistry meterRegistry,
      FailedDispatchRepository failedDispatchRepository,
      @Value("${checks.reports.batch-size:50}") int batchSize,
      @Value("${checks.scheduling.max-retries:3}") int maxRetries) {
    this.reportsRepository = reportsRepository;
    this.deliveryService = deliveryService;
    this.scheduleResolver = scheduleResolver;
    this.objectMapper = objectMapper;
    this.meterRegistry = meterRegistry;
    this.failedDispatchRepository = failedDispatchRepository;
    this.batchSize = batchSize;
    this.maxRetries = maxRetries;
  }

  @Scheduled(
      fixedDelayString = "${checks.reports.poll-interval-ms:60000}",
      initialDelayString = "${checks.reports.initial-delay-ms:10000}")
  @SchedulerLock(name = "reportDeliveryDispatcher", lockAtMostFor = "10m", lockAtLeastFor = "1m")
  public void pollAndDeliver() {
    MDC.put("dispatcherId", "report-delivery");
    try {
      List<Report> dueReports =
          reportsRepository.findDueReports(Instant.now(), PageRequest.of(0, batchSize));

      meterRegistry.gauge("checks.reports.delivery.due_count", dueReports.size());

      LOG.debug("Report delivery dispatcher found {} due reports", dueReports.size());

      CompletableFuture<?>[] futures =
          dueReports.stream()
              .map(r -> CompletableFuture.runAsync(() -> deliverSingle(r)))
              .toArray(CompletableFuture[]::new);
      CompletableFuture.allOf(futures).join();
    } finally {
      MDC.remove("dispatcherId");
    }
  }

  private void deliverSingle(Report report) {
    String traceId = UUID.randomUUID().toString();
    MDC.put("reportId", report.getId().toString());
    MDC.put("traceId", traceId);

    try {
      deliveryService.deliver(report);
      report.setConsecutiveFailures(0);
      advanceNextDelivery(report);

      LOG.info("Delivered report '{}' (id={})", report.getName(), report.getId());
      Counter.builder("checks.reports.delivery.dispatches_total")
          .tag("outcome", "success")
          .register(meterRegistry)
          .increment();
    } catch (Exception e) {
      LOG.error(
          "Failed to deliver report '{}' (id={}): {}",
          report.getName(),
          report.getId(),
          e.getMessage(),
          e);
      report.setConsecutiveFailures(report.getConsecutiveFailures() + 1);
      advanceNextDelivery(report);

      if (report.getConsecutiveFailures() >= AUTO_DISABLE_THRESHOLD) {
        report.setStatus("error");
        report.setNextDeliveryAt(null);
        reportsRepository.save(report);
        LOG.warn(
            "report_auto_disabled reportId={} consecutiveFailures={}",
            report.getId(),
            report.getConsecutiveFailures());
      }

      try {
        failedDispatchRepository.save(
            new FailedDispatch("REPORT", report.getId(), e.getMessage(), maxRetries));
      } catch (Exception fdError) {
        LOG.error("Failed to record failed dispatch: {}", fdError.getMessage());
      }

      Counter.builder("checks.reports.delivery.dispatches_total")
          .tag("outcome", "failure")
          .register(meterRegistry)
          .increment();
    } finally {
      MDC.remove("reportId");
      MDC.remove("traceId");
    }
  }

  private void advanceNextDelivery(Report report) {
    try {
      JsonNode scheduleNode = objectMapper.readTree(report.getSchedule());
      Instant next = scheduleResolver.nextDeliveryFrom(scheduleNode, report.getNextDeliveryAt());
      report.setNextDeliveryAt(next);
      report.setUpdatedAt(Instant.now());
    } catch (JsonProcessingException e) {
      LOG.warn("Failed to parse schedule for report {}, clearing nextDeliveryAt", report.getId());
      report.setNextDeliveryAt(null);
    }
    reportsRepository.save(report);
  }
}
