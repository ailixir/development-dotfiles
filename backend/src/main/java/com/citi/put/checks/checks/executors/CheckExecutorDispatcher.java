package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import java.util.List;
import java.util.Map;
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

  public CheckExecutorDispatcher(List<CheckExecutor> executorList) {
    this.executors =
        executorList.stream()
            .collect(Collectors.toMap(CheckExecutor::supportedType, Function.identity()));
  }

  @EventListener(ApplicationReadyEvent.class)
  public void logRegisteredExecutors() {
    LOG.info(
        "CheckExecutorDispatcher: registered executors for types {}",
        executors.keySet().stream().map(Enum::name).sorted().collect(Collectors.joining(", ")));
  }

  public ExecutionOutcome dispatch(Check check, ExecutionContext context) {
    CheckType type = CheckType.valueOf(check.getType());
    CheckExecutor executor = executors.get(type);
    if (executor == null) {
      throw new UnsupportedCheckTypeException(check.getType());
    }
    return executor.execute(check, context);
  }
}
