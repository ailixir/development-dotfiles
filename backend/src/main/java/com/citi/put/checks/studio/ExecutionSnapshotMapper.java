package com.citi.put.checks.studio;

import com.citi.put.checks.studio.dto.ExecutionLogEntry;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.ReplayFailure;
import com.citi.put.checks.studio.dto.RuntimeVersions;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.evidence.VideoStoreProperties;
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
 * <p>One adaptation happens here and nowhere else: logical video expiry is enforced at read time
 * because physical lifecycle deletion on the object store is asynchronous (§6.2). Status and error
 * code are read as stored; V13 holds the canonical vocabulary in a CHECK.
 */
@Component
public class ExecutionSnapshotMapper {

  private static final String VIDEO_PATH_TEMPLATE = "/api/v1/studio/executions/%s/video";

  private static final TypeReference<List<StepResult>> STEP_RESULTS =
      new TypeReference<List<StepResult>>() {};
  private static final TypeReference<List<ExecutionLogEntry>> LOG_ENTRIES =
      new TypeReference<List<ExecutionLogEntry>>() {};

  /**
   * {@code video.error} for a recording the runner stored where this API cannot read it. Shown
   * verbatim by the MFE for {@code UNAVAILABLE}.
   */
  public static final String NO_RECORDING_STORE =
      "Recording unavailable: this deployment has no recording store the API can read.";

  private final ObjectMapper objectMapper;
  private final Clock clock;
  private final boolean servesRecordings;

  @Autowired
  public ExecutionSnapshotMapper(ObjectMapper objectMapper, VideoStoreProperties videoStore) {
    this(objectMapper, Clock.systemUTC(), videoStore.servesRecordings());
  }

  ExecutionSnapshotMapper(ObjectMapper objectMapper, Clock clock) {
    this(objectMapper, clock, true);
  }

  ExecutionSnapshotMapper(ObjectMapper objectMapper, Clock clock, boolean servesRecordings) {
    this.objectMapper = objectMapper;
    this.clock = clock;
    this.servesRecordings = servesRecordings;
  }

  /**
   * The snapshot without {@code testName}: the mapper reads one history row and nothing else. The
   * list and single-read routes label it with {@link ExecutionSnapshotDto#withTestName}.
   */
  public ExecutionSnapshotDto toSnapshot(UITestExecution execution) {
    String status = execution.getStatus();
    String errorCode = execution.getErrorCode();
    VideoEvidence video = videoEvidence(execution, status);

    return new ExecutionSnapshotDto(
        execution.getId(),
        execution.getTestId(),
        null,
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
        streamComplete(status, video),
        execution.getTriggerSource(),
        execution.getScheduleId(),
        execution.getScheduledAt(),
        replayFailure(execution),
        execution.isDiagnostic());
  }

  /**
   * The persisted replay cause as the snapshot's {@code replayFailure} (STUDIO-OBS-008 T0 ruling
   * A1), or null when the API named none.
   *
   * <p>Read as stored and never re-derived: the cause was decided once, from the terminal report,
   * in the same statement as the status. Rows the table CHECK admits are the only shapes that can
   * arrive; a code without its coordinates is corruption and is refused rather than published.
   */
  private static ReplayFailure replayFailure(UITestExecution execution) {
    String code = execution.getReplayFailureCode();
    if (code == null) {
      return null;
    }
    String stepId = execution.getReplayFailureStepId();
    Integer stepIndex = execution.getReplayFailureStepIndex();
    if (stepId == null || stepIndex == null) {
      throw new IllegalStateException("Stored replay_failure is not readable as the contract");
    }
    try {
      return new ReplayFailure(
          code, stepId, stepIndex, execution.getReplayFailureLoginStepsPresent());
    } catch (IllegalArgumentException e) {
      throw new IllegalStateException("Stored replay_failure is not readable as the contract", e);
    }
  }

  /**
   * Evidence state is independent of the outcome (§6.1).
   *
   * <p>A row that never recorded a state is {@code PROCESSING} while the run is live and {@code
   * UNAVAILABLE} once it is over — which is exactly what legacy history is: finished, with no
   * usable recording. An available recording whose expiry has passed reads as {@code EXPIRED}
   * regardless of whether the object store has physically removed it yet.
   *
   * <p>An available recording this API has no store to read from is {@code UNAVAILABLE}: the runner
   * did record it, but no request for it can succeed, and a player for a route that can only answer
   * 404 is the dishonest state (Studio v1 gaps). The persisted row is not changed, so the recording
   * becomes servable the moment a real store is configured.
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
    if (VideoEvidence.AVAILABLE.equals(persisted) && !servesRecordings) {
      return new VideoEvidence(VideoEvidence.UNAVAILABLE, NO_RECORDING_STORE, null, false);
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
