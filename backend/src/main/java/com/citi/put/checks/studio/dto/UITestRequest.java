package com.citi.put.checks.studio.dto;

/**
 * Create/update payload for a Studio draft.
 *
 * <p>{@code csiId} is accepted on create only and must reference a registered CSI; on update it may
 * be omitted or repeated, but a different value is rejected with {@code 409 CSI_IMMUTABLE}
 * (Architecture §9.1).
 *
 * <p>{@code sourceRevision} and {@code configurationRevision} are required on update and carry the
 * optimistic-concurrency check: a mismatch is rejected with {@code 409 STALE_REVISION} and no field
 * changes (Architecture §4.2). They are ignored on create, which always starts at revision 1.
 */
public record UITestRequest(
    String name,
    String description,
    String csiId,
    String steps,
    String variables,
    String browser,
    int viewportWidth,
    int viewportHeight,
    int timeoutSeconds,
    String waitStrategy,
    String environment,
    Long sourceRevision,
    Long configurationRevision) {}
