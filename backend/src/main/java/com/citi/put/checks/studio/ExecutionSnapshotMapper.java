package com.citi.put.checks.studio;

import com.citi.put.checks.studio.dto.ExecutionLogEntry;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.RuntimeVersions;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Renders a history row as the one execution snapshot the whole product reads (AC-3).
 *
 * <p>The same output backs {@code GET /executions/{id}}, the items of {@code GET /executions} and
 * the SSE {@code execution.snapshot} payload, so there is exactly one shape to render in the MFE
 * (Architecture §5.5).
 *
 * <p>Two adaptations happen here and nowhere else: legacy outcomes are normalized (§8.3), and
 * logical video expiry is enforced at read time because physical lifecycle deletion on the object
 * store is asynchronous (§6.2).
 */
@Component
public class ExecutionSnapshotMapper {

  private static final String VIDEO_PATH_TEMPLATE = "/api/v1/studio/executions/%s/video";

  private static final TypeReference<List<StepResult>> STEP_RESULTS =
      new TypeReference<List<StepResult>>() {};
  private static final TypeReference<List<ExecutionLogEntry>> LOG_ENTRIES =
      new TypeReference<List<ExecutionLogEntry>>() {};

  private final ObjectMapper objectMapper;
  private final Clock clock;

  @Autowired
  public ExecutionSnapshotMapper(ObjectMapper objectMapper) {
    this(objectMapper, Clock.systemUTC());
  }

  ExecutionSnapshotMapper(ObjectMapper objectMapper, Clock clock) {
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  public ExecutionSnapshotDto toSnapshot(UITestExecution execution) {
    String status = LegacyStudioAdapter.normalizeStatus(execution.getStatus());
    String errorCode =
        LegacyStudioAdapter.normalizeErrorCode(execution.getStatus(), execution.getErrorCode());
    VideoEvidence video = videoEvidence(execution, status);

    return new ExecutionSnapshotDto(
        execution.getId(),
        execution.getTestId(),
        execution.getCsiId(),
        execution.getRevisionId(),
        status,
        errorCode,
        execution.getStartedAt(),
        execution.getBrowserStartedAt(),
        execution.getEndedAt(),
        execution.getDurationMs() == null ? null : execution.getDurationMs().longValue(),
        readList(execution.getStepResults(), STEP_RESULTS, "step_results"),
        readList(execution.getLogs(), LOG_ENTRIES, "logs"),
        execution.isLogsTruncated(),
        video,
        videoPath(execution, video),
        readRuntime(execution.getRuntimeVersions()),
        execution.getSnapshotRevision(),
        streamComplete(status, video));
  }

  /**
   * Evidence state is independent of the outcome (§6.1).
   *
   * <p>A row that never recorded a state is {@code PROCESSING} while the run is live and {@code
   * UNAVAILABLE} once it is over — which is exactly what legacy history is: finished, with no
   * usable recording. An available recording whose expiry has passed reads as {@code EXPIRED}
   * regardless of whether the object store has physically removed it yet.
   */
  private VideoEvidence videoEvidence(UITestExecution execution, String status) {
    String persisted = execution.getVideoStatus();
    boolean partial = Boolean.TRUE.equals(execution.getVideoPartial());
    Instant expiresAt = execution.getVideoExpiresAt();

    if (persisted == null) {
      String derived =
          ExecutionStatus.isTerminal(status) ? VideoEvidence.UNAVAILABLE : VideoEvidence.PROCESSING;
      return new VideoEvidence(derived, execution.getVideoError(), expiresAt, partial);
    }
    if (VideoEvidence.AVAILABLE.equals(persisted)
        && expiresAt != null
        && !expiresAt.isAfter(clock.instant())) {
      return new VideoEvidence(
          VideoEvidence.EXPIRED, execution.getVideoError(), expiresAt, partial);
    }
    return new VideoEvidence(persisted, execution.getVideoError(), expiresAt, partial);
  }

  /** The browser only ever receives the protected API path, never an object storage key (§6.2). */
  private String videoPath(UITestExecution execution, VideoEvidence video) {
    if (!VideoEvidence.AVAILABLE.equals(video.status())) {
      return null;
    }
    return String.format(VIDEO_PATH_TEMPLATE, execution.getId());
  }

  /**
   * Settled means the outcome is terminal <em>and</em> the evidence disposition is known (§6.1).
   */
  private boolean streamComplete(String status, VideoEvidence video) {
    return ExecutionStatus.isTerminal(status) && !VideoEvidence.PROCESSING.equals(video.status());
  }

  private <T> List<T> readList(String json, TypeReference<List<T>> type, String field) {
    if (json == null || json.isBlank()) {
      return List.of();
    }
    try {
      List<T> parsed = objectMapper.readValue(json, type);
      return parsed == null ? List.of() : List.copyOf(parsed);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException(
          "Stored " + field + " is not readable as the snapshot contract", e);
    }
  }

  private RuntimeVersions readRuntime(String json) {
    if (json == null || json.isBlank()) {
      return RuntimeVersions.unknown();
    }
    try {
      RuntimeVersions parsed = objectMapper.readValue(json, RuntimeVersions.class);
      return parsed == null ? RuntimeVersions.unknown() : parsed;
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Stored runtime_versions is not readable", e);
    }
  }
}
