package com.citi.put.checks.studio.dto;

import java.util.UUID;

/**
 * The frozen {@code CompileAccepted} body of {@code POST /tests/{id}/compile} (Story 10.8 AC-1;
 * Architecture §8.3).
 *
 * <p><b>{@code 202} means the attempt was started, not that it will succeed.</b> The identity
 * carried here is the one {@code CompileStateService.beginCompile} persisted, together with the two
 * draft revisions the attempt was begun for — so a client can tell a later result apart from the
 * one it asked for. Every bounded refusal downstream (pool saturation, the gateway bulkhead, the
 * per-attempt budget) surfaces asynchronously as {@code compileStatus: STALE} carrying a {@code
 * compileError}, never as a status code on this response.
 *
 * <p>The component names are asserted against the frozen schema by {@code StudioContractTest}, so
 * renaming a field in either place fails the build.
 *
 * @param compileRequestId the persisted compile request identity
 * @param compileStatus the state the draft was moved to — {@code COMPILING}
 * @param sourceRevision the draft source revision the attempt was begun for
 * @param configurationRevision the draft configuration revision the attempt was begun for
 */
public record CompileAcceptedDto(
    UUID compileRequestId, String compileStatus, long sourceRevision, long configurationRevision) {}
