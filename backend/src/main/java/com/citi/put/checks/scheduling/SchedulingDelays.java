package com.citi.put.checks.scheduling;

import java.time.Duration;

/** Existing Spring scheduled-string compatibility: numeric milliseconds and ISO-8601 durations. */
public final class SchedulingDelays {
  private SchedulingDelays() {}

  public static Duration parse(String value) {
    String text = value.strip();
    return text.toUpperCase(java.util.Locale.ROOT).contains("P")
        ? Duration.parse(text)
        : Duration.ofMillis(Long.parseLong(text));
  }

  public static Duration positive(String value) {
    Duration duration = parse(value);
    if (duration.isZero() || duration.isNegative()) {
      throw new IllegalArgumentException("Poll interval must be positive");
    }
    return duration;
  }
}
