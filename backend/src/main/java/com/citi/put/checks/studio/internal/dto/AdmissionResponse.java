package com.citi.put.checks.studio.internal.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Internal value type of the admission CAS; no wire contract.
 *
 * <p>The result {@code AdmissionCasService.claimObserved} reads to build the immutable observed
 * admission receipt ({@code v3/replay-job#/definitions/AdmissionReceipt}), which is what the runner
 * receives. The legacy route that returned this record on the wire, and its OpenAPI schema, were
 * deleted in STUDIO-OBS-014 (inherited obligation P1).
 *
 * <p>{@code state} is the ledger's dispatch state, never an outcome. {@code startDeadlineAt} and
 * {@code runDeadlineAt} are the deadlines this CAS assigned.
 */
public record AdmissionResponse(
    UUID executionId,
    UUID attemptId,
    UUID admissionId,
    String state,
    Instant startDeadlineAt,
    Instant runDeadlineAt) {}
