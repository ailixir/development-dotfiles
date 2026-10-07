package com.citi.put.checks.scheduling;

/** Cadence time is monotonic and independent of UTC, daylight savings and cron occurrence time. */
@FunctionalInterface
public interface SchedulingTicker {
  long nanos();
}
