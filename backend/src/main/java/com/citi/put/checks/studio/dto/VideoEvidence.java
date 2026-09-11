package com.citi.put.checks.studio.dto;

import java.time.Instant;

/**
 * Evidence state, deliberately independent of the check outcome (Architecture §6.1).
 *
 * <p>An upload failure never overwrites a known assertion outcome. {@code UNAVAILABLE} covers runs
 * with no usable recording; {@code FAILED} covers evidence production or upload failures.
 */
public record VideoEvidence(String status, String error, Instant expiresAt, boolean partial) {

  public static final String PROCESSING = "PROCESSING";
  public static final String AVAILABLE = "AVAILABLE";
  public static final String FAILED = "FAILED";
  public static final String UNAVAILABLE = "UNAVAILABLE";
  public static final String EXPIRED = "EXPIRED";

  public static VideoEvidence unavailable() {
    return new VideoEvidence(UNAVAILABLE, null, null, false);
  }
}
