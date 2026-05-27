package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.model.CheckType;
import java.time.Duration;

public sealed interface ExecutionOutcome {
  Duration duration();

  record Success(Duration duration, String output) implements ExecutionOutcome {}

  record Failure(Duration duration, String errorMessage, String deepLinkUrl)
      implements ExecutionOutcome {}

  record Warning(Duration duration, String message) implements ExecutionOutcome {}

  record Timeout(Duration duration) implements ExecutionOutcome {}

  record Throttled(Duration duration, CheckType checkType) implements ExecutionOutcome {
    public Throttled(CheckType checkType) {
      this(Duration.ZERO, checkType);
    }
  }
}
