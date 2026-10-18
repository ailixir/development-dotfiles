package com.citi.put.checks.studio.internal.dto;

import java.util.Map;
import java.util.UUID;

/**
 * Internal value type of the admission CAS; no wire contract.
 *
 * <p>{@code AdmissionCasService.claimObserved} builds it from the validated v3 observed admission
 * request ({@code v3/replay-job#/definitions/AdmissionRequest}) and passes it to the CAS. The
 * legacy {@code POST /internal/studio/executions/{id}/admission} route that once read this record
 * from the wire, and its OpenAPI schema, were deleted in STUDIO-OBS-014 (inherited obligation P1).
 *
 * @param runtimeVersions carried for the CAS's shape only; the observed path passes an empty map
 */
public record AdmissionRequest(
    UUID executionId,
    UUID attemptId,
    String runnerInstanceId,
    UUID admissionId,
    Map<String, Object> runtimeVersions) {}
