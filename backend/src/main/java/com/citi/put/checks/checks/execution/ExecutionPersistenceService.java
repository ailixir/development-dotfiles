package com.citi.put.checks.checks.execution;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.execution.entity.ExecutionResult;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExecutionPersistenceService {

  private final ExecutionResultRepository resultRepository;

  public ExecutionPersistenceService(ExecutionResultRepository resultRepository) {
    this.resultRepository = resultRepository;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public ExecutionResult persistResult(
      Check check, ExecutionOutcome outcome, Instant startedAt, Instant endedAt) {
    String status = mapStatus(outcome);
    String output = outcome instanceof ExecutionOutcome.Success s ? s.output() : null;
    String errorMessage = outcome instanceof ExecutionOutcome.Failure f ? f.errorMessage() : null;

    if (outcome instanceof ExecutionOutcome.Warning w) {
      errorMessage = w.message();
    }

    ExecutionResult result =
        new ExecutionResult(
            check.getId(),
            status,
            startedAt,
            endedAt,
            (int) outcome.duration().toMillis(),
            output,
            errorMessage);

    return resultRepository.save(result);
  }

  private String mapStatus(ExecutionOutcome outcome) {
    return switch (outcome) {
      case ExecutionOutcome.Success s -> "SUCCESS";
      case ExecutionOutcome.Failure f -> "FAILURE";
      case ExecutionOutcome.Warning w -> "WARNING";
      case ExecutionOutcome.Timeout t -> "TIMEOUT";
    };
  }
}
