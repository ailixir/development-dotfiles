package com.citi.put.checks.security;

public class CoreServiceUnavailableException extends RuntimeException {

  public CoreServiceUnavailableException(String message) {
    super(message);
  }

  public CoreServiceUnavailableException(String message, Throwable cause) {
    super(message, cause);
  }
}
