package com.citi.put.checks.studio.validation;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class StepValidator {

  private static final List<String> VALID_PREFIXES =
      List.of(
          "go to",
          "navigate to",
          "search for",
          "click",
          "type",
          "wait for",
          "check that",
          "check if",
          "check url contains",
          "scroll",
          "hover",
          "select",
          "press",
          "upload");

  public Map<String, Object> validate(String step) {
    if (step == null || step.isBlank()) {
      return Map.of("isValid", false, "suggestion", "Step cannot be empty");
    }

    String normalized = step.toLowerCase().trim();
    for (String prefix : VALID_PREFIXES) {
      if (normalized.startsWith(prefix)) {
        return Map.of("isValid", true, "suggestion", "");
      }
    }

    return Map.of(
        "isValid",
        false,
        "suggestion",
        "Step must start with one of: " + String.join(", ", VALID_PREFIXES));
  }
}
