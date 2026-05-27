package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.model.CheckType;

public class CheckSourceDisabledException extends RuntimeException {

  private final CheckType type;

  public CheckSourceDisabledException(CheckType type) {
    super("Check type " + type.name() + " is currently disabled");
    this.type = type;
  }

  public CheckType getType() {
    return type;
  }
}
