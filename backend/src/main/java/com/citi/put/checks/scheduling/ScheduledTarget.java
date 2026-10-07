package com.citi.put.checks.scheduling;

import java.time.Duration;

/**
 * Domain-owned due pass; neutral orchestration never chooses admission or execution policy.
 * Metadata and enabled guards must be bounded local reads, with no network/database work.
 */
public interface ScheduledTarget {
  String targetId();

  boolean enabled();

  Duration pollInterval();

  Duration initialDelay();

  void pollAndDispatch();
}
