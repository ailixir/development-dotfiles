package com.citi.put.checks.studio.context;

import com.citi.put.checks.studio.dto.ResolvedInput;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedTarget;
import java.util.List;
import java.util.UUID;

/** Explicit typed intent extracted independently from one source-step boundary. */
public record ExplicitStepIntent(
    UUID stepId,
    ResolvedOperation operation,
    ResolvedTarget target,
    ResolvedInput input,
    List<String> assertions,
    String route,
    String state,
    List<ResolvedOperation.Kind> requestedSequence) {

  public ExplicitStepIntent {
    assertions = assertions == null ? List.of() : List.copyOf(assertions);
    requestedSequence =
        requestedSequence == null
            ? operation == null ? List.of() : List.of(operation.kind())
            : List.copyOf(requestedSequence);
  }

  public ExplicitStepIntent(
      UUID stepId,
      ResolvedOperation operation,
      ResolvedTarget target,
      ResolvedInput input,
      List<String> assertions,
      String route,
      String state) {
    this(stepId, operation, target, input, assertions, route, state, null);
  }
}
