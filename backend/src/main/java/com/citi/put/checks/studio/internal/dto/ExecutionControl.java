package com.citi.put.checks.studio.internal.dto;

import java.util.UUID;

/**
 * The runner's control read (Studio v1 WP4, ADR-002 §29): whether the execution it is running has
 * been cancelled.
 *
 * <p>Pull-based on purpose. A cancel relayed as {@code DELETE /v1/runs/{id}} goes through the
 * runner Service and may reach a pod that does not hold the run; the pod that does hold it polls
 * this while the run is active and learns the same fact without any routing at all.
 *
 * @param executionId the execution addressed by the path
 * @param cancelRequested true once a cancel is recorded; it never returns to false
 */
public record ExecutionControl(UUID executionId, boolean cancelRequested) {}
