package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;

public interface CheckExecutor {
  CheckType supportedType();

  ExecutionOutcome execute(Check check, ExecutionContext context);
}
