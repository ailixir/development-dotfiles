package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * The runner's terminal verdict. Null on {@code STARTED} and {@code PROGRESS}.
 *
 * <p>{@code errorCode} is an open string and is <b>never copied into</b> {@code
 * ui_test_executions.error_code} (AC-16): every value {@code ExecutionErrorCode} enumerates is
 * assigned by the API's dispatcher or reapers, and a component that cannot observe a condition must
 * not be able to publish the verdict for it.
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record RunOutcome(String result, String errorCode, String errorMessage) {

  public static final String PASSED = "PASSED";
  public static final String FAILED = "FAILED";
  public static final String ERROR = "ERROR";
}
