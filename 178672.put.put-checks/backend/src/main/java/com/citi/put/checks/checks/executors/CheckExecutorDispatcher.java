package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.config.CheckSourceProperties;
import com.citi.put.checks.config.SourceConcurrencyProperties;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class CheckExecutorDispatcher {

  private static final Logger LOG = LoggerFactory.getLogger(CheckExecutorDispatcher.class);

  private final Map<CheckType, CheckExecutor> executors;
  private final CheckSourceProperties sourceProperties;
  private final Map<CheckType, Semaphore> sourceSemaphores;

  public CheckExecutorDispatcher(
      List<CheckExecutor> executorList,
      CheckSourceProperties sourceProperties,
      SourceConcurrencyProperties concurrencyProps,
      MeterRegistry meterRegistry) {
    this.executors =
        executorList.stream()
            .collect(Collectors.toMap(CheckExecutor::supportedType, Function.identity()));
    this.sourceProperties = sourceProperties;

    EnumMap<CheckType, Semaphore> sems = new EnumMap<>(CheckType.class);
    for (CheckType type : CheckType.values()) {
      int limit = concurrencyProps.limitFor(type);
      Semaphore sem = new Semaphore(limit);
      sems.put(type, sem);
      meterRegistry.gauge(
          "checks.executor.source_permits_available",
          Tags.of("check_type", type.name()),
          sem,
          Semaphore::availablePermits);
    }
    this.sourceSemaphores = Map.copyOf(sems);
  }

  @EventListener(ApplicationReadyEvent.class)
  public void logRegisteredExecutors() {
    LOG.info(
        "CheckExecutorDispatcher: registered executors for types {}",
        executors.keySet().stream().map(Enum::name).sorted().collect(Collectors.joining(", ")));
    LOG.info(
        "CheckExecutorDispatcher: enabled sources {}",
        sourceProperties.enabledTypeNames().stream().sorted().collect(Collectors.joining(", ")));
    sourceSemaphores.forEach(
        (type, sem) ->
            LOG.info(
                "CheckExecutorDispatcher: source cap {}={}", type.name(), sem.availablePermits()));
  }

  public ExecutionOutcome dispatch(Check check, ExecutionContext context) {
    CheckType type = CheckType.valueOf(check.getType());
    if (!sourceProperties.isEnabled(type)) {
      throw new CheckSourceDisabledException(type);
    }
    CheckExecutor executor = executors.get(type);
    if (executor == null) {
      throw new UnsupportedCheckTypeException(check.getType());
    }

    Semaphore sourceSem = sourceSemaphores.get(type);
    if (!sourceSem.tryAcquire()) {
      LOG.warn("source_throttled type={} available=0", type.name());
      return new ExecutionOutcome.Throttled(type);
    }
    try {
      return executor.execute(check, context);
    } finally {
      sourceSem.release();
    }
  }

  public Map<CheckType, Integer> availablePermitsSnapshot() {
    EnumMap<CheckType, Integer> snapshot = new EnumMap<>(CheckType.class);
    for (var entry : sourceSemaphores.entrySet()) {
      snapshot.put(entry.getKey(), entry.getValue().availablePermits());
    }
    return Collections.unmodifiableMap(snapshot);
  }
}
