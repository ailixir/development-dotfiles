package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.UUID;

/**
 * The progress acknowledgement (ADR-002 O-4 closes here).
 *
 * <p>It is sent <b>only after commit</b> (AC-20). The runner retries a terminal report
 * byte-identically until it is acknowledged and holds no durable store to replay from, so an
 * acknowledgement that preceded the commit would lose a terminal result on a crash.
 *
 * @param applied false for a duplicate delivery of an already-applied {@code (attemptId,
 *     runnerSequence)}, which is answered {@code 200} applying nothing (AC-21)
 * @param revision the API's own snapshot revision after the report — never {@code runnerSequence}
 * @param cancelRequested true when a cancel is recorded for the execution (Studio v1 WP4, ADR-002
 *     §29). The runner that owns the run reads it here, whichever pod it is, so a cancel never
 *     depends on the relayed {@code DELETE} reaching the right pod
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record ProgressAck(
    UUID executionId,
    long runnerSequence,
    boolean applied,
    long revision,
    boolean cancelRequested) {}
