package com.citi.put.checks.checks.execution;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.executors.CheckExecutorDispatcher;
import com.citi.put.checks.checks.executors.ExecutionContext;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import java.net.URI;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/checks")
public class CheckExecuteController {

  private static final Logger LOG = LoggerFactory.getLogger(CheckExecuteController.class);

  private final CheckRepository checkRepository;
  private final CheckExecutorDispatcher dispatcher;
  private final ExecutionPersistenceService persistenceService;
  private final ExecutionResultRepository resultRepository;
  private final AsyncTaskExecutor checkExecutor;
  private final CsiOwnershipEvaluator ownershipEvaluator;

  public CheckExecuteController(
      CheckRepository checkRepository,
      CheckExecutorDispatcher dispatcher,
      ExecutionPersistenceService persistenceService,
      ExecutionResultRepository resultRepository,
      @Qualifier("checkExecutor") AsyncTaskExecutor checkExecutor,
      CsiOwnershipEvaluator ownershipEvaluator) {
    this.checkRepository = checkRepository;
    this.dispatcher = dispatcher;
    this.persistenceService = persistenceService;
    this.resultRepository = resultRepository;
    this.checkExecutor = checkExecutor;
    this.ownershipEvaluator = ownershipEvaluator;
  }

  @PostMapping("/{checkId}/execute")
  public ResponseEntity<Map<String, Object>> execute(
      @PathVariable UUID checkId, Authentication auth) {
    Check check =
        checkRepository
            .findById(checkId)
            .orElseThrow(() -> new IllegalArgumentException("Check not found: " + checkId));

    if (!ownershipEvaluator.canExecute(auth, check.getCsiId())) {
      throw new AccessDeniedException("No execute access to CSI " + check.getCsiId());
    }

    UUID executionId = UUID.randomUUID();
    String traceId = MDC.get("traceId");

    try {
      checkExecutor.execute(() -> executeAsync(check, executionId, traceId));
    } catch (RejectedExecutionException e) {
      HttpHeaders headers = new HttpHeaders();
      headers.set("Retry-After", "2");
      return new ResponseEntity<>(
          Map.of("error", "Executor saturated, retry later"),
          headers,
          HttpStatus.SERVICE_UNAVAILABLE);
    }

    LOG.info(
        "Dispatched execution executionId={} checkId={} checkType={}",
        executionId,
        checkId,
        check.getType());

    URI location = URI.create("/api/v1/checks/" + checkId + "/executions/" + executionId);
    return ResponseEntity.accepted()
        .location(location)
        .body(Map.of("executionId", executionId.toString(), "status", "PENDING"));
  }

  private void executeAsync(Check check, UUID executionId, String traceId) {
    Instant startedAt = Instant.now();
    try {
      ExecutionContext ctx = ExecutionContext.of(executionId, traceId != null ? traceId : "");
      ExecutionOutcome outcome = dispatcher.dispatch(check, ctx);
      Instant endedAt = Instant.now();
      persistenceService.persistResult(check, outcome, startedAt, endedAt);
    } catch (Exception e) {
      LOG.error("Execution failed for check {}: {}", check.getId(), e.getMessage(), e);
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
}
