package com.citi.put.checks.studio.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The single execution payload (Architecture §5.5, AC-3).
 *
 * <p>{@code GET /executions/{id}}, the items of {@code GET /executions} and the SSE {@code
 * execution.snapshot} event all carry exactly this shape, so the MFE renders one type regardless of
 * transport.
 *
 * @param acceptedAt immutable acceptance instant; also the history partition key ({@code
 *     ui_test_executions.started_at})
 * @param startedAt browser start ({@code browser_started_at}); null until a runner start report is
 *     committed
 * @param durationMs browser execution time only; queue time is a separate budget
 * @param videoPath protected API path, never an object storage key
 * @param revision monotonic API snapshot revision; also the SSE event id
 * @param streamComplete true once outcome and evidence disposition are both settled
 */
public record ExecutionSnapshotDto(
    UUID executionId,
    UUID testId,
    String csiId,
    UUID revisionId,
    String status,
    String errorCode,
    Instant acceptedAt,
    Instant startedAt,
    Instant endedAt,
    Long durationMs,
    List<StepResult> stepResults,
    List<ExecutionLogEntry> logs,
    boolean logsTruncated,
    VideoEvidence video,
    String videoPath,
    RuntimeVersions runtime,
    long revision,
    boolean streamComplete) {}
