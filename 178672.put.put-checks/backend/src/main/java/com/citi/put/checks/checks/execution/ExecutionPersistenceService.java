package com.citi.put.checks.checks.execution;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.execution.entity.ExecutionResult;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExecutionPersistenceService {

  private final ExecutionResultRepository resultRepository;
  private final CheckRepository checkRepository;

  public ExecutionPersistenceService(
      ExecutionResultRepository resultRepository, CheckRepository checkRepository) {
    this.resultRepository = resultRepository;
    this.checkRepository = checkRepository;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public ExecutionResult persistResult(
      UUID executionId, Check check, ExecutionOutcome outcome, Instant startedAt, Instant endedAt) {
    String status = mapStatus(outcome);
    String output = outcome instanceof ExecutionOutcome.Success s ? s.output() : null;
    String errorMessage = outcome instanceof ExecutionOutcome.Failure f ? f.errorMessage() : null;

    if (outcome instanceof ExecutionOutcome.Warning w) {
      errorMessage = w.message();
    }

    ExecutionResult result =
        new ExecutionResult(
            executionId,
            check.getId(),
            status,
            startedAt,
            endedAt,
            (int) Math.min(outcome.duration().toMillis(), Integer.MAX_VALUE),
            output,
            errorMessage);

    ExecutionResult saved = resultRepository.save(result);

    checkRepository
        .findById(check.getId())
        .ifPresent(
            c -> {
              c.setStatus(mapCheckStatus(outcome));
              c.setLastExecutionAt(endedAt);
              c.setUpdatedAt(endedAt);
              checkRepository.save(c);
            });

    return saved;
  }

  private String mapStatus(ExecutionOutcome outcome) {
    return switch (outcome) {
      case ExecutionOutcome.Success s -> "SUCCESS";
      case ExecutionOutcome.Failure f -> "FAILURE";
      case ExecutionOutcome.Warning w -> "WARNING";
      case ExecutionOutcome.Timeout t -> "TIMEOUT";
      case ExecutionOutcome.Throttled t ->
          throw new IllegalArgumentException("Throttled outcomes must not be persisted");
    };
  }

  private String mapCheckStatus(ExecutionOutcome outcome) {
    return switch (outcome) {
      case ExecutionOutcome.Success s -> "PASSING";
      case ExecutionOutcome.Warning w -> "WARNING";
      case ExecutionOutcome.Failure f -> "FAILING";
      case ExecutionOutcome.Timeout t -> "FAILING";
      case ExecutionOutcome.Throttled t ->
          throw new IllegalArgumentException("Throttled outcomes must not be persisted");
    };
  }
}
