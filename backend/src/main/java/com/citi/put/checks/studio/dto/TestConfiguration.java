package com.citi.put.checks.studio.dto;

/** Nonsecret execution configuration; the sole supported engine is chromium. */
public record TestConfiguration(
    String browser, Viewport viewport, Integer timeoutSeconds, String waitStrategy) {

  public static final String CANONICAL_BROWSER = "chromium";
  public static final int DEFAULT_TIMEOUT_SECONDS = 30;

  /** Contract bounds for the per-step {@code timeoutSeconds} ({@code minimum: 1, maximum: 120}). */
  public static final int MIN_TIMEOUT_SECONDS = 1;

  public static final int MAX_TIMEOUT_SECONDS = 120;
  public static final String DEFAULT_WAIT_STRATEGY = "networkidle";

  public static TestConfiguration defaults() {
    return new TestConfiguration(
        CANONICAL_BROWSER, Viewport.defaults(), DEFAULT_TIMEOUT_SECONDS, DEFAULT_WAIT_STRATEGY);
  }
}
