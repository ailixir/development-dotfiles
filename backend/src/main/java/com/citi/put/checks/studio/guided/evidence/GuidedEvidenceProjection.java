package com.citi.put.checks.studio.guided.evidence;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Objects;

/**
 * The guided learn-run recording as the v3 {@code result} publishes it (STUDIO-OBS-013, ruling AR-1
 * R1/R2): {@code evidence.video} and {@code actionTimings}.
 *
 * <p>Both result builders (the session service's own {@code result()} and the publication
 * projector) ask this one seam, so the two surfaces cannot disagree about the recording. The
 * learned-from-execution evidence published here is the guided run's own recording; it is never
 * replay-verified evidence and never sets {@code replayVerified}.
 *
 * <p>Implementations are called with the session row already locked by the caller and may read the
 * database; they never write and never call out.
 */
@FunctionalInterface
public interface GuidedEvidenceProjection {

  /**
   * Today's literals: {@code video null} and {@code actionTimings []}. This is the default until a
   * recording-aware projection is installed; after the S3 contract tightening a {@code null} video
   * is invalid, so a result built with this default fails {@code v3/result} validation, which is
   * the proof that the projection is wired.
   */
  GuidedEvidenceProjection NONE =
      (sessionId, state) ->
          new Projection(NullNode.getInstance(), JsonNodeFactory.instance.arrayNode());

  /**
   * Projects the recording evidence of one session.
   *
   * @param sessionId the session
   * @param state the session state the caller holds under its row lock, or null to read it
   * @return the {@code evidence.video} value and the {@code actionTimings} array
   */
  Projection project(String sessionId, String state);

  /**
   * One projection. {@code video} is a {@code VideoEvidence} object ({@code status, error,
   * expiresAt, partial}) or JSON null; {@code actionTimings} is the public, sorted list.
   */
  record Projection(JsonNode video, ArrayNode actionTimings) {
    public Projection {
      Objects.requireNonNull(video);
      Objects.requireNonNull(actionTimings);
    }

    /** The {@code evidence.video} status, or null when the video is JSON null. */
    public String status() {
      return video.isObject() ? video.path("status").asText() : null;
    }

    /**
     * Writes {@code actionTimings} and {@code evidence {kind guidedLedger, ref, video}} into a v3
     * result under construction. {@code evidence.ref} stays the guided ledger reference, the
     * session id.
     */
    public void writeTo(ObjectNode result, String sessionId) {
      result.set("actionTimings", actionTimings.deepCopy());
      result
          .putObject("evidence")
          .put("kind", "guidedLedger")
          .put("ref", sessionId)
          .set("video", video.deepCopy());
    }
  }
}
