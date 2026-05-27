package com.citi.put.checks.checks.executors;

public class UnsupportedCheckTypeException extends RuntimeException {
  public UnsupportedCheckTypeException(String type) {
    super("No executor registered for check type: " + type);
  }
}
