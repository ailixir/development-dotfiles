package com.citi.put.checks.studio.context;

import com.citi.put.checks.studio.dto.AuthoringDiagnostic;
import java.util.List;

/** Deterministic supported-English parse result; unsupported or ambiguous text is blocking. */
public record IntentParseResult(
    List<ExplicitStepIntent> intents, List<AuthoringDiagnostic> diagnostics) {

  public IntentParseResult {
    intents = List.copyOf(intents);
    diagnostics = List.copyOf(diagnostics);
  }

  public boolean blocked() {
    return !diagnostics.isEmpty();
  }
}
