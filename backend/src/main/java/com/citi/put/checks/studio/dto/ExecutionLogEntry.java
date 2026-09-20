package com.citi.put.checks.studio.dto;

import java.time.Instant;

/**
 * One entry of the bounded, redacted retained log buffer (Architecture §5.3, §5.5).
 *
 * <p>The buffer is capped; {@code logsTruncated} on the snapshot says when the cap was reached.
 */
public record ExecutionLogEntry(Instant at, String level, String message, Integer stepIndex) {}
