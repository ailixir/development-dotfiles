package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.Map;
import java.util.UUID;

/**
 * The admission body the runner sends, closed to unknown fields (frozen contract, ADR-002 §6.2).
 *
 * <p>{@code ignoreUnknown = false} is stated rather than assumed: Spring Boot turns Jackson's
 * {@code FAIL_ON_UNKNOWN_PROPERTIES} <em>off</em> by default, so a record with no annotation would
 * silently accept a field the contract does not name — which is exactly the INT-4 failure mode, and
 * "an open schema over a wire body is not a contract".
 *
 * @param runtimeVersions deliberately open ({@code additionalProperties: true}): the recorded set
 *     is the image's business and grows with the pin. The API keeps only the §4.6 subset.
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record AdmissionRequest(
    UUID executionId,
    UUID attemptId,
    String runnerInstanceId,
    UUID admissionId,
    Map<String, Object> runtimeVersions) {}
