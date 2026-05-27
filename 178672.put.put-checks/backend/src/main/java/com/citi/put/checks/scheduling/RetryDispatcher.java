package com.citi.put.checks.scheduling;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.execution.ExecutionPersistenceService;
import com.citi.put.checks.checks.executors.CheckExecutorDispatcher;
import com.citi.put.checks.checks.executors.ExecutionContext;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import com.citi.put.checks.reports.ReportDeliveryService;
import com.citi.put.checks.reports.ReportsRepository;
import com.citi.put.checks.reports.entity.Report;
import com.citi.put.checks.scheduling.entity.FailedDispatch;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(
    name = "checks.scheduling.retry-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class RetryDispatcher {

  private static final Logger LOG = LoggerFactory.getLogger(RetryDispatcher.class);

  private final FailedDispatchRepository failedDispatchRepository;
  private final CheckRepository checkRepository;
  private final CheckExecutorDispatcher executorDispatcher;
  private final ExecutionPersistenceService persistenceService;
  private final ReportsRepository reportsRepository;
  private final ReportDeliveryService deliveryService;
  private final MeterRegistry meterRegistry;
  private final int batchSize;

  public RetryDispatcher(
      FailedDispatchRepository failedDispatchRepository,
      CheckRepository checkRepository,
      CheckExecutorDispatcher executorDispatcher,
      ExecutionPersistenceService persistenceService,
      ReportsRepository reportsRepository,
      ReportDeliveryService deliveryService,
      MeterRegistry meterRegistry,
      @Value("${checks.scheduling.retry-batch-size:50}") int batchSize) {
    this.failedDispatchRepository = failedDispatchRepository;
    this.checkRepository = checkRepository;
    this.executorDispatcher = executorDispatcher;
    this.persistenceService = persistenceService;
    this.reportsRepository = reportsRepository;
    this.deliveryService = deliveryService;
    this.meterRegistry = meterRegistry;
    this.batchSize = batchSize;
  }

  @Scheduled(
      fixedDelayString = "${checks.scheduling.retry-poll-interval-ms:15000}",
      initialDelayString = "${checks.scheduling.retry-initial-delay-ms:20000}")
  @SchedulerLock(name = "retryDispatcher", lockAtMostFor = "2m", lockAtLeastFor = "10s")
  public void pollAndRetry() {
    MDC.put("dispatcherId", "retry-dispatcher");
    try {
      retryType("CHECK");
      retryType("REPORT");
      updatePendingGauges();
    } finally {
      MDC.remove("dispatcherId");
    }
  }

  private void retryType(String type) {
    List<FailedDispatch> dueRetries =
        failedDispatchRepository.findDueRetries(type, Instant.now(), PageRequest.of(0, batchSize));

    for (FailedDispatch fd : dueRetries) {
      retrySingle(fd);
    }
  }

  @Transactional
  void retrySingle(FailedDispatch fd) {
    MDC.put("retryId", fd.getId().toString());
    MDC.put("referenceId", fd.getReferenceId().toString());
    try {
      boolean success =
          "CHECK".equals(fd.getDispatchType())
              ? retryCheck(fd.getReferenceId())
              : retryReport(fd.getReferenceId());

      if (success) {
        failedDispatchRepository.delete(fd);
        incrementCounter(fd.getDispatchType(), "success");
        LOG.info(
            "retry_succeeded type={} referenceId={}", fd.getDispatchType(), fd.getReferenceId());
      } else {
        fd.incrementRetry("Retry returned failure outcome");
        failedDispatchRepository.save(fd);
        handlePostRetry(fd);
      }
    } catch (Exception e) {
      fd.incrementRetry(e.getMessage());
      failedDispatchRepository.save(fd);
      handlePostRetry(fd);
      LOG.warn(
          "retry_failed type={} referenceId={} attempt={} error={}",
          fd.getDispatchType(),
          fd.getReferenceId(),
          fd.getRetryCount(),
          e.getMessage());
    } finally {
      MDC.remove("retryId");
      MDC.remove("referenceId");
    }
  }

  private void handlePostRetry(FailedDispatch fd) {
    if (fd.isExhausted()) {
      incrementCounter(fd.getDispatchType(), "dead_lettered");
      LOG.warn(
          "dispatch_dead_lettered type={} referenceId={} retries={}",
          fd.getDispatchType(),
          fd.getReferenceId(),
          fd.getRetryCount());
    } else {
      incrementCounter(fd.getDispatchType(), "failure");
    }
  }

  private boolean retryCheck(UUID checkId) {
    Check check = checkRepository.findById(checkId).orElse(null);
    if (check == null) {
      LOG.warn("Retry: check {} not found, treating as permanent failure", checkId);
      return false;
    }

    Instant startedAt = Instant.now();
    UUID executionId = UUID.randomUUID();
    ExecutionContext ctx = ExecutionContext.of(executionId, UUID.randomUUID().toString());
    ExecutionOutcome outcome = executorDispatcher.dispatch(check, ctx);

    if (outcome instanceof ExecutionOutcome.Throttled) {
      LOG.info("Retry throttled for check {}, will retry next cycle", checkId);
      return false;
    }

    Instant endedAt = Instant.now();
    persistenceService.persistResult(executionId, check, outcome, startedAt, endedAt);

    return outcome instanceof ExecutionOutcome.Success
        || outcome instanceof ExecutionOutcome.Warning;
  }

  private boolean retryReport(UUID reportId) {
    Report report = reportsRepository.findById(reportId).orElse(null);
    if (report == null) {
      LOG.warn("Retry: report {} not found, treating as permanent failure", reportId);
      return false;
    }
    deliveryService.deliver(report);
    return true;
  }

  private void incrementCounter(String type, String outcome) {
    Counter.builder("checks.retry.attempts_total")
        .tag("type", type)
        .tag("outcome", outcome)
        .register(meterRegistry)
        .increment();
  }

  private void updatePendingGauges() {
    meterRegistry.gauge(
        "checks.retry.pending_count",
        List.of(io.micrometer.core.instrument.Tag.of("type", "CHECK")),
        failedDispatchRepository,
        repo -> repo.countPending("CHECK"));
    meterRegistry.gauge(
        "checks.retry.pending_count",
        List.of(io.micrometer.core.instrument.Tag.of("type", "REPORT")),
        failedDispatchRepository,
        repo -> repo.countPending("REPORT"));
  }
}
