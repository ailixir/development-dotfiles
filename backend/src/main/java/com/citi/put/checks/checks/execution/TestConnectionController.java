package com.citi.put.checks.checks.execution;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.executors.CheckExecutorDispatcher;
import com.citi.put.checks.checks.executors.ExecutionContext;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import com.citi.put.checks.checks.model.CheckConfiguration;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!worker")
@RequestMapping("/api/v1/checks")
public class TestConnectionController {

  private static final Logger LOG = LoggerFactory.getLogger(TestConnectionController.class);

  private final CheckExecutorDispatcher dispatcher;

  public TestConnectionController(CheckExecutorDispatcher dispatcher) {
    this.dispatcher = dispatcher;
  }

  @PostMapping("/test-connection")
  public ResponseEntity<Map<String, Object>> testConnection(
      @Valid @RequestBody CheckConfiguration configuration, Authentication auth) {

    String userName = auth != null ? auth.getName() : "anonymous";
    LOG.info("test-connection type={} user={}", configuration.type(), userName);

    Check probe =
        new Check(
            "__test-connection",
            configuration.type(),
            "Ad-hoc connectivity test",
            "__probe",
            "__probe",
            configuration,
            null,
            userName);

    ExecutionContext ctx = ExecutionContext.of(UUID.randomUUID(), "");

    try {
      ExecutionOutcome outcome = dispatcher.dispatch(probe, ctx);
      return ResponseEntity.ok(mapOutcome(outcome));
    } catch (Exception e) {
      LOG.warn("test-connection failed type={}: {}", configuration.type(), e.getMessage());
      return ResponseEntity.badRequest()
          .body(
              Map.of(
                  "status",
                  "ERROR",
                  "error",
                  e.getMessage() != null ? e.getMessage() : "Unknown error"));
    }
  }

  private Map<String, Object> mapOutcome(ExecutionOutcome outcome) {
    return switch (outcome) {
      case ExecutionOutcome.Success s ->
          Map.of(
              "status",
              "SUCCESS",
              "durationMs",
              s.duration().toMillis(),
              "output",
              s.output() != null ? s.output() : "");
      case ExecutionOutcome.Failure f ->
          Map.of(
              "status",
              "FAILURE",
              "durationMs",
              f.duration().toMillis(),
              "error",
              f.errorMessage() != null ? f.errorMessage() : "Check failed");
      case ExecutionOutcome.Timeout t ->
          Map.of(
              "status", "TIMEOUT",
              "durationMs", t.duration().toMillis(),
              "error", "Connection timed out");
      case ExecutionOutcome.Warning w ->
          Map.of(
              "status",
              "WARNING",
              "durationMs",
              w.duration().toMillis(),
              "output",
              w.message() != null ? w.message() : "");
      case ExecutionOutcome.Throttled th ->
          Map.of(
              "status",
              "THROTTLED",
              "durationMs",
              0L,
              "error",
              "Executor throttled for " + th.checkType().name() + " — try again shortly");
    };
  }
}
