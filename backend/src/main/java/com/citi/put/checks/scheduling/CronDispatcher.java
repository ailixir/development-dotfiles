package com.citi.put.checks.scheduling;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.execution.ExecutionPersistenceService;
import com.citi.put.checks.checks.executors.CheckExecutorDispatcher;
import com.citi.put.checks.checks.executors.ExecutionContext;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.config.CheckSourceProperties;
import com.citi.put.checks.scheduling.entity.FailedDispatch;
import com.citi.put.checks.scheduling.entity.Schedule;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(
    name = "checks.scheduling.dispatcher-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class CronDispatcher implements SmartLifecycle, ScheduledTarget {

  private static final Logger LOG = LoggerFactory.getLogger(CronDispatcher.class);

  private final ScheduleRepository scheduleRepository;
  private final CheckRepository checkRepository;
  private final CheckExecutorDispatcher executorDispatcher;
  private final ExecutionPersistenceService persistenceService;
  private final CheckSourceProperties sourceProperties;
  private final AsyncTaskExecutor checkExecutor;
  private final AsyncTaskExecutor dispatchExecutor;
  private final PlatformTransactionManager txManager;
  private final MeterRegistry meterRegistry;
  private final FailedDispatchRepository failedDispatchRepository;
  private final int batchSize;
  private final int maxRetries;
  private final int maxConcurrency;
  private final int shutdownTimeoutSec;

  private final AtomicInteger inFlightCount = new AtomicInteger(0);
  private final AtomicInteger dueGauge = new AtomicInteger(0);
  private volatile boolean running = true;
  private CronRecurrence recurrence = new CronRecurrence();
  private ScheduledUiTestLauncher uiTestLauncher;

  @Value("${checks.scheduling.poll-interval-ms:10000}")
  private String pollIntervalMs = "10000";

  @Value("${checks.scheduling.initial-delay-ms:5000}")
  private String initialDelayMs = "5000";

  @Autowired
  public void initializeRecurrence(CronRecurrence value) {
    recurrence = value;
  }

  @Autowired(required = false)
  public void initializeUiTestLauncher(ScheduledUiTestLauncher value) {
    uiTestLauncher = value;
  }

  @Override
  public String targetId() {
    return "checks";
  }

  @Override
  public boolean enabled() {
    return running;
  }

  @Override
  public Duration pollInterval() {
    return SchedulingDelays.positive(pollIntervalMs);
  }

  @Override
  public Duration initialDelay() {
    Duration delay = SchedulingDelays.parse(initialDelayMs);
    return delay.isNegative() ? Duration.ZERO : delay;
  }

  public CronDispatcher(
      ScheduleRepository scheduleRepository,
      CheckRepository checkRepository,
      CheckExecutorDispatcher executorDispatcher,
      ExecutionPersistenceService persistenceService,
      CheckSourceProperties sourceProperties,
      @Qualifier("checkExecutor") AsyncTaskExecutor checkExecutor,
      @Qualifier("dispatchExecutor") AsyncTaskExecutor dispatchExecutor,
      PlatformTransactionManager txManager,
      MeterRegistry meterRegistry,
      FailedDispatchRepository failedDispatchRepository,
      @Value("${checks.scheduling.batch-size:500}") int batchSize,
      @Value("${checks.scheduling.max-retries:3}") int maxRetries,
      @Value("${checks.executor.max-concurrency:250}") int maxConcurrency,
      @Value("${checks.scheduling.shutdown-timeout-sec:30}") int shutdownTimeoutSec) {
    this.scheduleRepository = scheduleRepository;
    this.checkRepository = checkRepository;
    this.executorDispatcher = executorDispatcher;
    this.persistenceService = persistenceService;
    this.sourceProperties = sourceProperties;
    this.checkExecutor = checkExecutor;
    this.dispatchExecutor = dispatchExecutor;
    this.txManager = txManager;
    this.meterRegistry = meterRegistry;
    this.failedDispatchRepository = failedDispatchRepository;
    this.batchSize = batchSize;
    this.maxRetries = maxRetries;
    this.maxConcurrency = maxConcurrency;
    this.shutdownTimeoutSec = shutdownTimeoutSec;

    meterRegistry.gauge("checks.dispatch.in_flight_count", inFlightCount, AtomicInteger::get);
    meterRegistry.gauge("checks.scheduled.due_count", dueGauge, AtomicInteger::get);
  }

  @Override
  public void start() {
    running = true;
  }

  @Override
  public void stop() {
    running = false;
    long deadline = System.currentTimeMillis() + (shutdownTimeoutSec * 1000L);
    while (inFlightCount.get() > 0 && System.currentTimeMillis() < deadline) {
      try {
        Thread.sleep(200);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        break;
      }
    }
    int remaining = inFlightCount.get();
    if (remaining > 0) {
      LOG.warn("shutdown_timeout inFlight={}", remaining);
    } else {
      LOG.info("CronDispatcher drained all in-flight executions");
    }
  }

  @Override
  public boolean isRunning() {
    return running;
  }

  @Override
  public int getPhase() {
    return Integer.MAX_VALUE - 100;
  }

  @SchedulerLock(name = "cronDispatcher", lockAtMostFor = "2m", lockAtLeastFor = "10s")
  public void pollAndDispatch() {
    if (!running) {
      return;
    }
    int globalBudget = maxConcurrency - inFlightCount.get();
    if (globalBudget <= 0) {
      LOG.debug(
          "dispatch_skipped reason=backpressure inFlight={} maxConcurrency={}",
          inFlightCount.get(),
          maxConcurrency);
      Counter.builder("checks.dispatch.polls_skipped_total")
          .tag("reason", "backpressure")
          .register(meterRegistry)
          .increment();
      return;
    }

    MDC.put("schedulerId", "cron-dispatcher");
    try {
      Map<CheckType, Integer> typeBudgets = executorDispatcher.availablePermitsSnapshot();
      Instant now = Instant.now();
      List<Schedule> toDispatch = new ArrayList<>();

      for (CheckType type : CheckType.values()) {
        if (!sourceProperties.isEnabled(type)) {
          continue;
        }
        // A UI test has no check executor and so no permits: its capacity is the Studio quota,
        // enforced when the launcher admits the run.
        if (type == CheckType.UI_TEST && uiTestLauncher == null) {
          continue;
        }
        int typeAvailable =
            type == CheckType.UI_TEST ? Integer.MAX_VALUE : typeBudgets.getOrDefault(type, 0);
        int remaining = Math.min(typeAvailable, globalBudget - toDispatch.size());
        if (remaining <= 0) {
          continue;
        }
        int fetchLimit = Math.min(remaining, batchSize - toDispatch.size());
        if (fetchLimit <= 0) {
          break;
        }
        List<Schedule> dueForType =
            scheduleRepository.findDueByType(now, type.name(), PageRequest.of(0, fetchLimit));
        toDispatch.addAll(dueForType);
      }

      dueGauge.set(toDispatch.size());
      LOG.debug("Cron dispatcher fetched {} due schedules (capacity-gated)", toDispatch.size());

      Timer.Sample sample = Timer.start(meterRegistry);

      CompletableFuture<?>[] futures =
          toDispatch.stream()
              .map(s -> CompletableFuture.runAsync(() -> dispatchSingle(s), dispatchExecutor))
              .toArray(CompletableFuture[]::new);
      CompletableFuture.allOf(futures).join();

      sample.stop(
          Timer.builder("checks.scheduled.batch_dispatch_duration")
              .description("Wall-clock time for dispatch transactions (not execution)")
              .register(meterRegistry));
    } finally {
      MDC.remove("schedulerId");
    }
  }

  private void dispatchSingle(Schedule schedule) {
    String traceId = UUID.randomUUID().toString();
    MDC.put("scheduleId", schedule.getId().toString());
    if (schedule.getUiTestId() != null) {
      MDC.put("uiTestId", schedule.getUiTestId().toString());
    } else {
      MDC.put("checkId", schedule.getCheckId().toString());
    }
    MDC.put("traceId", traceId);

    try {
      TransactionTemplate tx = new TransactionTemplate(txManager);
      if (schedule.getUiTestId() != null) {
        tx.executeWithoutResult(status -> dispatchUiTest(schedule));
        return;
      }
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
            advanceNextExecution(managed);

            TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                  @Override
                  public void afterCommit() {
                    inFlightCount.incrementAndGet();
                    try {
                      checkExecutor.execute(() -> executeAsync(check, executionId, traceId));
                    } catch (Exception e) {
                      inFlightCount.decrementAndGet();
                      LOG.error(
                          "Failed to submit async execution for check {}: {}",
                          check.getId(),
                          e.getMessage());
                    }
                  }
                });

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
      MDC.remove("uiTestId");
      MDC.remove("traceId");
    }
  }

  /**
   * One due slot of a UI test's schedule: advance the schedule and hand the slot to the launcher in
   * the same transaction. A run is accepted, put back when the Studio quota is full, or spent
   * without a run; none of it uses executor permits, ordinary retry or {@code failed_dispatches}.
   */
  private void dispatchUiTest(Schedule schedule) {
    Schedule managed = scheduleRepository.findById(schedule.getId()).orElse(null);
    if (managed == null) {
      return;
    }
    Instant scheduledAt = managed.getNextExecutionAt();
    advanceNextExecution(managed);
    var result = uiTestLauncher.launch(managed.getUiTestId(), managed.getId(), scheduledAt);
    if (result.outcome() == ScheduledUiTestLauncher.Outcome.THROTTLED) {
      managed.setNextExecutionAt(Instant.now().plusSeconds(5));
      managed.setUpdatedAt(Instant.now());
    }
    Counter.builder("checks.scheduled.ui_test_slots_total")
        .tag("outcome", result.outcome().name())
        .tag("code", result.code())
        .register(meterRegistry)
        .increment();
    if (result.outcome() == ScheduledUiTestLauncher.Outcome.SKIPPED) {
      LOG.warn(
          "Skipped scheduled UI test slot uiTestId={} code={}",
          managed.getUiTestId(),
          result.code());
    } else {
      LOG.info(
          "Scheduled UI test slot uiTestId={} outcome={}", managed.getUiTestId(), result.outcome());
    }
  }

  private void executeAsync(Check check, UUID executionId, String traceId) {
    Instant startedAt = Instant.now();
    try {
      ExecutionContext ctx = ExecutionContext.of(executionId, traceId);
      ExecutionOutcome outcome = executorDispatcher.dispatch(check, ctx);

      if (outcome instanceof ExecutionOutcome.Throttled t) {
        revertSchedule(check.getId());
        Counter.builder("checks.dispatch.throttle_reverted_total")
            .tag("check_type", t.checkType().name())
            .register(meterRegistry)
            .increment();
        LOG.info(
            "throttle_reverted checkId={} type={} — schedule returned to queue",
            check.getId(),
            t.checkType().name());
        return;
      }

      Instant endedAt = Instant.now();
      persistenceService.persistResult(executionId, check, outcome, startedAt, endedAt);
    } catch (Exception e) {
      LOG.error("Scheduled execution failed for check {}: {}", check.getId(), e.getMessage(), e);
      Instant endedAt = Instant.now();
      ExecutionOutcome failure =
          new ExecutionOutcome.Failure(
              java.time.Duration.between(startedAt, endedAt),
              "Internal error: " + e.getMessage(),
              null);
      try {
        persistenceService.persistResult(executionId, check, failure, startedAt, endedAt);
      } catch (Exception persistError) {
        LOG.error("Failed to persist error result: {}", persistError.getMessage());
      }
      try {
        failedDispatchRepository.save(
            new FailedDispatch("CHECK", check.getId(), e.getMessage(), maxRetries));
      } catch (Exception fdError) {
        LOG.error("Failed to record failed dispatch: {}", fdError.getMessage());
      }
    } finally {
      inFlightCount.decrementAndGet();
    }
  }

  private void revertSchedule(UUID checkId) {
    try {
      new TransactionTemplate(txManager)
          .executeWithoutResult(
              status ->
                  scheduleRepository
                      .findByCheckId(checkId)
                      .ifPresent(
                          schedule -> {
                            schedule.setNextExecutionAt(Instant.now().plusSeconds(5));
                            schedule.setUpdatedAt(Instant.now());
                            scheduleRepository.save(schedule);
                          }));
    } catch (Exception e) {
      LOG.error("Failed to revert schedule for check {}: {}", checkId, e.getMessage());
    }
  }

  // Preserve ordinary stored-base advancement and Spring's actual instant-sequence DST policy.
  private void advanceNextExecution(Schedule schedule) {
    if (schedule.getCronExpression() == null) {
      return;
    }
    Instant base =
        schedule.getNextExecutionAt() != null ? schedule.getNextExecutionAt() : Instant.now();
    var next =
        recurrence.next(
            schedule.getCronExpression(),
            recurrence.zone(schedule.getTimezone(), CronRecurrence.ZonePolicy.ANY_ZONE_ID),
            base);
    schedule.setNextExecutionAt(next != null ? next.scheduledAt() : null);
  }

  public int getInFlightCount() {
    return inFlightCount.get();
  }
}
