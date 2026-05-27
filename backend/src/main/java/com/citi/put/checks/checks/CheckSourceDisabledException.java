package com.citi.put.checks.checks;

import com.citi.put.checks.checks.model.CheckType;
import java.util.List;

public class CheckSourceDisabledException extends RuntimeException {

  private final CheckType type;
  private final List<String> availableTypes;

  public CheckSourceDisabledException(CheckType type, List<String> availableTypes) {
    super(
        "Check type "
            + type.name()
            + " is not available. Available types: "
            + String.join(", ", availableTypes));
    this.type = type;
    this.availableTypes = availableTypes;
  }

  public CheckType getType() {
    return type;
  }

  public List<String> getAvailableTypes() {
    return availableTypes;
  }
}
