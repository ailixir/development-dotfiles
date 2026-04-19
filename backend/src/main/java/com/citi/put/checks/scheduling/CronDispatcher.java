package com.citi.put.checks.scheduling;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.execution.ExecutionPersistenceService;
import com.citi.put.checks.checks.executors.CheckExecutorDispatcher;
import com.citi.put.checks.checks.executors.ExecutionContext;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import com.citi.put.checks.scheduling.entity.Schedule;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(
    name = "checks.scheduling.dispatcher-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class CronDispatcher {

  private static final Logger LOG = LoggerFactory.getLogger(CronDispatcher.class);
  private static final int BATCH_SIZE = 100;

  private final ScheduleRepository scheduleRepository;
  private final CheckRepository checkRepository;
  private final CheckExecutorDispatcher executorDispatcher;
  private final ExecutionPersistenceService persistenceService;
  private final AsyncTaskExecutor checkExecutor;
  private final PlatformTransactionManager txManager;
  private final MeterRegistry meterRegistry;

  public CronDispatcher(
      ScheduleRepository scheduleRepository,
      CheckRepository checkRepository,
      CheckExecutorDispatcher executorDispatcher,
      ExecutionPersistenceService persistenceService,
      @Qualifier("checkExecutor") AsyncTaskExecutor checkExecutor,
      PlatformTransactionManager txManager,
      MeterRegistry meterRegistry) {
    this.scheduleRepository = scheduleRepository;
    this.checkRepository = checkRepository;
    this.executorDispatcher = executorDispatcher;
    this.persistenceService = persistenceService;
    this.checkExecutor = checkExecutor;
    this.txManager = txManager;
    this.meterRegistry = meterRegistry;
  }

  @Scheduled(fixedDelayString = "${checks.scheduling.poll-interval-ms:30000}")
  public void pollAndDispatch() {
    MDC.put("schedulerId", "cron-dispatcher");
    try {
      List<Schedule> dueSchedules =
          scheduleRepository.findDueSchedules(Instant.now(), PageRequest.of(0, BATCH_SIZE));

      meterRegistry.gauge("checks.scheduled.due_count", dueSchedules.size());

      LOG.debug("Cron dispatcher found {} due schedules", dueSchedules.size());

      for (Schedule schedule : dueSchedules) {
        dispatchSingle(schedule);
      }
    } finally {
      MDC.remove("schedulerId");
    }
  }

  private void dispatchSingle(Schedule schedule) {
    String traceId = UUID.randomUUID().toString();
    MDC.put("scheduleId", schedule.getId().toString());
    MDC.put("checkId", schedule.getCheckId().toString());
    MDC.put("traceId", traceId);

    try {
      TransactionTemplate tx = new TransactionTemplate(txManager);
      tx.execute(
          status -> {
            Schedule managed = scheduleRepository.findById(schedule.getId()).orElse(null);
            if (managed == null) {
              return null;
            }
            Check check = checkRepository.findById(managed.getCheckId()).orElse(null);
            if (check == null) {
              LOG.warn(
                  "Schedule {} references missing check {}, skipping",
                  managed.getId(),
                  managed.getCheckId());
              return null;
            }

            UUID executionId = UUID.randomUUID();
            checkExecutor.execute(() -> executeAsync(check, executionId, traceId));

            advanceNextExecution(managed);

            LOG.info(
                "Dispatched scheduled check checkId={} executionId={}", check.getId(), executionId);
            Counter.builder("checks.scheduled.dispatches_total")
                .tag("outcome", "success")
                .register(meterRegistry)
                .increment();
            return null;
          });
    } catch (Exception e) {
      LOG.error("Failed to dispatch schedule {}: {}", schedule.getId(), e.getMessage(), e);
      Counter.builder("checks.scheduled.dispatches_total")
          .tag("outcome", "failure")
          .register(meterRegistry)
          .increment();
    } finally {
      MDC.remove("scheduleId");
      MDC.remove("checkId");
      MDC.remove("traceId");
    }
  }

  private void executeAsync(Check check, UUID executionId, String traceId) {
    Instant startedAt = Instant.now();
    try {
      ExecutionContext ctx = ExecutionContext.of(executionId, traceId);
      ExecutionOutcome outcome = executorDispatcher.dispatch(check, ctx);
      Instant endedAt = Instant.now();
      persistenceService.persistResult(check, outcome, startedAt, endedAt);
    } catch (Exception e) {
      LOG.error("Scheduled execution failed for check {}: {}", check.getId(), e.getMessage(), e);
      Instant endedAt = Instant.now();
      ExecutionOutcome failure =
          new ExecutionOutcome.Failure(
              java.time.Duration.between(startedAt, endedAt),
              "Internal error: " + e.getMessage(),
              null);
      try {
        persistenceService.persistResult(check, failure, startedAt, endedAt);
      } catch (Exception persistError) {
        LOG.error("Failed to persist error result: {}", persistError.getMessage());
      }
    }
  }

  private void advanceNextExecution(Schedule schedule) {
    if (schedule.getCronExpression() == null) {
      return;
    }
    CronExpression expr = CronExpression.parse(schedule.getCronExpression());
    ZonedDateTime now = ZonedDateTime.now(ZoneId.of(schedule.getTimezone()));
    ZonedDateTime next = expr.next(now);
    schedule.setNextExecutionAt(next != null ? next.toInstant() : null);
  }
}
