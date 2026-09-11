package com.citi.put.checks.studio.recovery;

import java.time.Instant;

/**
 * The terminal result manifest the runner writes to object storage before it reports (§5.3).
 *
 * <p>It exists so that a lost delivery is not a lost result: the API derives the key from immutable
 * execution identity, reads it at that known key, and gets the <b>real</b> outcome in place of an
 * ambiguous timeout.
 *
 * @param outcome the §8.2 status the runner recorded
 * @param errorCode the runner's own code, which is recorded and never copied into {@code
 *     error_code} — the same rule that governs a delivered report (AC-16)
 */
public record ResultManifest(
    String outcome,
    String errorCode,
    String errorMessage,
    Instant browserStartedAt,
    Instant endedAt,
    String videoKey,
    String evidenceState) {}
