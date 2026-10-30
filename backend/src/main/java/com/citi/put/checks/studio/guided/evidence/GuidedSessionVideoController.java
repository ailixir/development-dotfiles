package com.citi.put.checks.studio.guided.evidence;

import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.evidence.ExecutionVideoException;
import com.citi.put.checks.studio.evidence.VideoObjectServer;
import com.citi.put.checks.studio.guided.session.GuidedSessionController;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/studio/guided-sessions/{id}/video}, operation {@code getGuidedSessionVideo}:
 * the guided learn-run recording (STUDIO-OBS-013 AC-3, ruling AR-1 "publicVideoRoute").
 *
 * <p>Refusal order, and the order is the design:
 *
 * <ol>
 *   <li><b>Authorization, through {@code readGuidedSession} itself.</b> {@link
 *       GuidedSessionController#read} is called — not re-implemented — so an unknown id and an
 *       unreadable CSI produce exactly the 403 (and the authority 503) that route produces for the
 *       same caller and id, including its publication-receipt branch. There is one authorization
 *       path over the session, and {@code ?download=true} does not branch before it.
 *   <li><b>Evidence state</b>, from the one {@link GuidedEvidenceProjection} the result routes
 *       publish: {@code EXPIRED} → 410; anything else that is not {@code AVAILABLE} → 404.
 *   <li><b>The key</b>, re-derived server-side from the session's CSI and id ({@link
 *       GuidedRecordingKeys}); the stored {@code video_key} column is never read.
 *   <li><b>Size and range</b>, by the shared {@link VideoObjectServer} that also serves execution
 *       recordings: measured size, {@code 200}/{@code 206}/{@code 416}, store failure → 503.
 * </ol>
 *
 * <p>No {@code produces} on the mapping: a refusal is JSON, the success media type is set on the
 * success path (the {@code ExecutionVideoController} note). No credential is read from the query
 * string. Refusals 404/410/416/503 are the shared {@code ExecutionVideoException} envelope.
 */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio/guided-sessions")
public class GuidedSessionVideoController {

  private final GuidedSessionController sessions;
  private final GuidedEvidenceProjection projection;
  private final GuidedSessionEvidenceRepository evidence;
  private final VideoObjectServer objects;

  public GuidedSessionVideoController(
      GuidedSessionController sessions,
      GuidedEvidenceProjection projection,
      GuidedSessionEvidenceRepository evidence,
      VideoObjectServer objects) {
    this.sessions = sessions;
    this.projection = projection;
    this.evidence = evidence;
    this.objects = objects;
  }

  /**
   * Serves the guided learn-run recording, whole or by range.
   *
   * @param id the guided session
   * @param download {@code true} for an attachment named {@code guided-session-{id}.webm}
   * @param range the standard {@code Range} header; a malformed one is ignored, not refused
   * @param user the caller, from the ambient platform session
   * @param request the servlet request, passed to {@code readGuidedSession} unchanged
   * @return {@code 200} or {@code 206} with the bytes
   */
  @GetMapping("/{id}/video")
  public ResponseEntity<byte[]> getGuidedSessionVideo(
      @PathVariable String id,
      @RequestParam(name = "download", required = false, defaultValue = "false") boolean download,
      @RequestHeader(value = "Range", required = false) String range,
      Authentication user,
      HttpServletRequest request) {

    // (1) readGuidedSession's own decision; its body is not used.
    sessions.read(user, id, request);

    // (2) A published learn's recording was discarded before upload: nothing is served even if an
    // object or a recording row exists (its proof is the replay execution). Keyed on the
    // publication receipt, not on the session state.
    if (evidence.published(id)) {
      throw ExecutionVideoException.noEvidence();
    }

    // The evidence state the result routes publish.
    String status = projection.project(id, null).status();
    if (VideoEvidence.EXPIRED.equals(status)) {
      throw ExecutionVideoException.expired();
    }
    if (!VideoEvidence.AVAILABLE.equals(status)) {
      throw ExecutionVideoException.noEvidence();
    }

    // (3) The key, re-derived from the session's immutable identity.
    GuidedRecordingKeys.Keys keys =
        evidence
            .csiId(id)
            .flatMap(csiId -> GuidedRecordingKeys.derive(csiId, id))
            .orElseThrow(ExecutionVideoException::noEvidence);

    // (4) Measured size and range. The id matched the key alphabet in (3), so the filename has no
    // quote, separator or CR/LF.
    String filename = download ? "guided-session-" + id + ".webm" : null;
    return objects.serve(keys.videoKey(), filename, range, "guided session " + id);
  }

  /** The same rendering {@code readGuidedSession} gives a {@code GuidedSessionException}. */
  @ExceptionHandler(GuidedSessionException.class)
  public ResponseEntity<?> failure(GuidedSessionException failure) {
    return ResponseEntity.status(failure.status()).body(failure.response());
  }
}
