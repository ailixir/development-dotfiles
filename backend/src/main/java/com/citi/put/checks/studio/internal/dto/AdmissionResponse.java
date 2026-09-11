package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.util.UUID;

/**
 * The admission acknowledgement (ADR-002 O-4 closes here).
 *
 * <p>The contract left this body open only because closing a schema against an <em>imagined</em>
 * producer is how the INT-4 divergence happened. This story is the producer, so every field is now
 * named and the schema is {@code additionalProperties: false}.
 *
 * <p>{@code state} is the ledger's dispatch state, never an outcome. {@code startDeadlineAt} and
 * {@code runDeadlineAt} are the deadlines this CAS assigned, echoed so the runner can see the
 * budget it was admitted under; they are not a second source of truth and the runner does not
 * enforce them.
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record AdmissionResponse(
    UUID executionId,
    UUID attemptId,
    UUID admissionId,
    String state,
    Instant startDeadlineAt,
    Instant runDeadlineAt) {}
