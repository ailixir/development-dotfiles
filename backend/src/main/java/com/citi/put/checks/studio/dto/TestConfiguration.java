package com.citi.put.checks.studio.dto;

/**
 * Execution-affecting, nonsecret configuration of a draft (Architecture §8.3).
 *
 * <p>{@code browser} is canonically {@code chromium}. The legacy value {@code chrome} names the
 * same engine and is normalized by {@link LegacyStudioAdapter}; any other engine is rejected at the
 * controller boundary with {@code 400 INVALID_CONFIGURATION}.
 */
public record TestConfiguration(
    String browser, Viewport viewport, Integer timeoutSeconds, String waitStrategy) {

  public static final String CANONICAL_BROWSER = "chromium";
  public static final String LEGACY_CHROME = "chrome";
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
