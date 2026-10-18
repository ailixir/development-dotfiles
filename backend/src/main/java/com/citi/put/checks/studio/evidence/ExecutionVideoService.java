package com.citi.put.checks.studio.evidence;

import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.recovery.ManifestKeys;
import com.citi.put.checks.studio.recovery.ResultManifestStore;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/**
 * The service path behind {@code GET /api/v1/studio/executions/{id}/video} (Architecture §6.2,
 * §6.3, §9.1; story 10.15).
 *
 * <p>Five decisions happen here, in this order, and the order is the design:
 *
 * <ol>
 *   <li><b>Authorization, through the snapshot route's own read.</b> {@link
 *       StudioService#findExecutionById(UUID, Authentication)} is called — not re-implemented, not
 *       mirrored — so an unauthorized caller gets byte-identically what {@code GET
 *       /executions/{id}} gives it, for the same identity and the same id. A second authorization
 *       path over one resource is how a download verb ends up laxer than a play verb; there is one
 *       path and {@code ?download=true} does not branch before it.
 *   <li><b>Evidence state, as the snapshot publishes it.</b> The five states of §6.1 are derived at
 *       read time by {@code ExecutionSnapshotMapper} — including logical expiry at {@code
 *       videoExpiresAt}, which §6.2 requires the API to enforce even while physical lifecycle
 *       deletion is asynchronous. This route <b>reads that derivation</b> rather than repeating it,
 *       so the two surfaces cannot disagree about whether a recording is available.
 *   <li><b>The key, derived server-side.</b> {@link ManifestKeys#videoKey} over immutable execution
 *       identity. The persisted {@code video_key} column is <b>never read</b>: §6.2 says
 *       client-supplied keys are never trusted, and a runner-supplied string that could redirect
 *       the read is exactly the thing that rule forbids.
 *   <li><b>The size, measured from the object.</b> Every length this route states — {@code
 *       Content-Length}, and the total in {@code Content-Range} — comes from {@link
 *       VideoObjectStore#metadata}. No row column is consulted for a length, and nothing parses the
 *       container: ADR-002 §17.6 explicitly rejected probing the stored object, so the object's
 *       <em>size</em> is read and its <em>duration</em> is not.
 *   <li><b>The range, and only the range.</b> The window is resolved against the measured size and
 *       handed to the store, which produces those bytes and no others.
 * </ol>
 *
 * <p>Partiality is not consulted anywhere in this class. ADR-002 §17.3 makes it a fact about the
 * recording, published on the snapshot; it is not this route's to refuse, to repair or to
 * advertise, and two rows differing only in it produce byte-identical responses.
 */
@Service
public class ExecutionVideoService {

  /** The one media type this route produces, set on the success path and never on the mapping. */
  public static final String VIDEO_WEBM = "video/webm";

  private final StudioService studioService;
  private final StudioDispatchLedgerStatements ledger;
  private final VideoObjectServer objects;

  public ExecutionVideoService(
      StudioService studioService,
      StudioDispatchLedgerStatements ledger,
      VideoObjectServer objects) {
    this.studioService = studioService;
    this.ledger = ledger;
    this.objects = objects;
  }

  /**
   * Resolves one video request into the complete response.
   *
   * <p>The media type is set <b>here, on the success path</b>, and the mapping declares no {@code
   * produces} — the trap the merged SSE controller records having avoided, for the same reason: a
   * handler that declared only {@code video/webm} would make content negotiation turn an
   * authorization failure's JSON body into a {@code 406} rendered as a {@code 500}, and the whole
   * point of AC-19a is that a denial here is indistinguishable from a denial on the snapshot route.
   *
   * @param executionId the execution whose recording is wanted
   * @param download whether {@code ?download=true} was supplied
   * @param rangeHeader the raw {@code Range} header, or null
   * @param auth the caller
   * @return the bytes to send, with everything the response states about them
   */
  public ResponseEntity<byte[]> read(
      UUID executionId, boolean download, String rangeHeader, Authentication auth) {

    // (1) The authorization decision, taken once, by the snapshot route's own read.
    ExecutionSnapshotDto snapshot = studioService.findExecutionById(executionId, auth);

    // (2) The evidence state the snapshot publishes, not a second derivation of it.
    String state = snapshot.video().status();
    if (VideoEvidence.EXPIRED.equals(state)) {
      throw ExecutionVideoException.expired();
    }
    if (!VideoEvidence.AVAILABLE.equals(state)) {
      // PROCESSING, FAILED and UNAVAILABLE are all "there is nothing to serve", and answering the
      // same thing for all three keeps the route from narrating the run's internals.
      throw ExecutionVideoException.noEvidence();
    }

    // (3) The key, derived from immutable execution identity.
    String key = ManifestKeys.videoKey(identityOf(snapshot));

    // (4) and (5) The measured size and the range, served by the shared key-based server so the
    // guided learn-run recording (STUDIO-OBS-013) reuses this path rather than forking it.
    String filename = download ? attachmentFilename(snapshot, identityOf(snapshot)) : null;
    return objects.serve(key, filename, rangeHeader, "execution " + executionId);
  }

  private ResultManifestStore.ExecutionIdentity identityOf(ExecutionSnapshotDto snapshot) {
    Optional<Map<String, Object>> row = ledger.find(snapshot.executionId());
    Object attemptId = row.map(entry -> entry.get("attempt_id")).orElse(null);
    if (attemptId == null) {
      // No attempt was ever issued, so no runner can have written a recording for this row. The
      // store is not asked; there is nothing at any key this identity could derive.
      throw ExecutionVideoException.noEvidence();
    }
    return new ResultManifestStore.ExecutionIdentity(
        snapshot.csiId(),
        snapshot.testId(),
        snapshot.executionId(),
        UUID.fromString(attemptId.toString()));
  }

  /**
   * The attachment filename, derived by the API from immutable execution identity (§6.3).
   *
   * <p>No object key, no {@code studio/} prefix, no CSI, nothing the caller supplied and no CR/LF —
   * two UUIDs the caller already knows, in a shape a file system will accept.
   */
  private String attachmentFilename(
      ExecutionSnapshotDto snapshot, ResultManifestStore.ExecutionIdentity identity) {
    return "execution-" + snapshot.executionId() + "-attempt-" + identity.attemptId() + ".webm";
  }
}
