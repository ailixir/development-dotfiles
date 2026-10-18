package com.citi.put.checks.studio.guided.evidence;

import com.citi.put.checks.studio.ExecutionSnapshotMapper;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Set;

/**
 * The recording-aware {@link GuidedEvidenceProjection}: ruling AR-1 R1's projection table, judged
 * on the database clock (R6).
 *
 * <table>
 *   <caption>V20 row and session → evidence.video</caption>
 *   <tr><th>row</th><th>condition</th><th>status</th><th>timings</th></tr>
 *   <tr><td>absent</td><td>session not terminal</td><td>PROCESSING</td><td>[]</td></tr>
 *   <tr><td>absent</td><td>terminal, DB clock &lt; expires_at + grace</td><td>PROCESSING</td>
 *       <td>[]</td></tr>
 *   <tr><td>absent</td><td>terminal, deadline passed</td><td>UNAVAILABLE</td><td>[]</td></tr>
 *   <tr><td>AVAILABLE</td><td>no readable store</td><td>UNAVAILABLE + NO_RECORDING_STORE</td>
 *       <td>[]</td></tr>
 *   <tr><td>AVAILABLE</td><td>expires_at &lt;= DB clock</td><td>EXPIRED</td><td>[]</td></tr>
 *   <tr><td>AVAILABLE</td><td>otherwise</td><td>AVAILABLE</td><td>row.timings</td></tr>
 *   <tr><td>FAILED</td><td></td><td>FAILED + fixed text</td><td>[]</td></tr>
 *   <tr><td>UNAVAILABLE</td><td></td><td>UNAVAILABLE</td><td>[]</td></tr>
 * </table>
 *
 * <p>The rows are evaluated in that order, so a deployment with no readable store reports {@code
 * UNAVAILABLE} even for an expired recording. Error texts are API-authored; the runner never
 * supplies text. No key, bucket or endpoint is part of any output.
 */
public class RecordedGuidedEvidenceProjection implements GuidedEvidenceProjection {

  /** The fixed {@code error} for a recording the runner reported it could not store. */
  public static final String FAILED_TEXT =
      "The runner reported that the recording could not be stored";

  private static final Set<String> TERMINAL =
      Set.of(
          "SUCCEEDED", "PUBLICATION_CONFLICT", "FAILED", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED");

  private final GuidedSessionEvidenceRepository repository;
  private final GuidedRecordingProperties properties;
  private final boolean servesRecordings;
  private final GuidedContracts contracts;

  public RecordedGuidedEvidenceProjection(
      GuidedSessionEvidenceRepository repository,
      GuidedRecordingProperties properties,
      boolean servesRecordings,
      GuidedContracts contracts) {
    this.repository = repository;
    this.properties = properties;
    this.servesRecordings = servesRecordings;
    this.contracts = contracts;
  }

  @Override
  public Projection project(String sessionId, String state) {
    var snapshot =
        repository
            .snapshot(sessionId, properties.settleGraceSeconds())
            .orElseThrow(() -> new GuidedSessionException("FORBIDDEN_SCOPE", 403));
    String sessionState = state == null ? snapshot.sessionState() : state;
    if (!snapshot.recorded()) {
      boolean waiting = !TERMINAL.contains(sessionState) || snapshot.withinWindow();
      return empty(waiting ? VideoEvidence.PROCESSING : VideoEvidence.UNAVAILABLE, null);
    }
    switch (snapshot.recordingState()) {
      case VideoEvidence.AVAILABLE -> {
        if (!servesRecordings) {
          return empty(VideoEvidence.UNAVAILABLE, ExecutionSnapshotMapper.NO_RECORDING_STORE);
        }
        ObjectNode video =
            video(
                snapshot.expired() ? VideoEvidence.EXPIRED : VideoEvidence.AVAILABLE,
                null,
                snapshot.expiresAt().toString(),
                snapshot.partial());
        if (snapshot.expired()) {
          return new Projection(video, JsonNodeFactory.instance.arrayNode());
        }
        JsonNode timings = contracts.parse(snapshot.timings());
        GuidedSessionException.require(timings.isArray(), "RUNTIME_INCOMPATIBLE", 409);
        return new Projection(video, (ArrayNode) timings);
      }
      case VideoEvidence.FAILED -> {
        return empty(VideoEvidence.FAILED, FAILED_TEXT);
      }
      case VideoEvidence.UNAVAILABLE -> {
        return empty(VideoEvidence.UNAVAILABLE, null);
      }
      default -> throw new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
    }
  }

  private static Projection empty(String status, String error) {
    return new Projection(video(status, error, null, false), JsonNodeFactory.instance.arrayNode());
  }

  private static ObjectNode video(String status, String error, String expiresAt, boolean partial) {
    ObjectNode video = JsonNodeFactory.instance.objectNode().put("status", status);
    if (error == null) {
      video.putNull("error");
    } else {
      video.put("error", error);
    }
    if (expiresAt == null) {
      video.putNull("expiresAt");
    } else {
      video.put("expiresAt", expiresAt);
    }
    return video.put("partial", partial);
  }
}
