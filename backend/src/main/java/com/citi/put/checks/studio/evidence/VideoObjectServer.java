package com.citi.put.checks.studio.evidence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * Serves one recording at a key the API derived, whole or by range (Architecture §6.2, §6.3).
 *
 * <p>This is steps 4 and 5 of {@link ExecutionVideoService}, extracted so the guided learn-run
 * recording (STUDIO-OBS-013, ruling AR-1) is served by the same code and not by a fork. The callers
 * own steps 1 to 3: authorization through their resource's own read, the evidence state that read
 * publishes, and the key derived server-side from immutable identity. This class is never handed a
 * key from a request, and it decides nothing about authorization or evidence state.
 *
 * <ol>
 *   <li><b>The size, measured from the object.</b> {@code Content-Length} and the total in {@code
 *       Content-Range} come from {@link VideoObjectStore#metadata}. No row column is consulted for
 *       a length, and the container is not parsed (ADR-002 §17.6).
 *   <li><b>The range, and only the range.</b> The window is resolved against the measured size and
 *       handed to the store, which produces those bytes and no others.
 * </ol>
 *
 * <p>Partiality is not consulted here (ADR-002 §17.3).
 */
@Component
public class VideoObjectServer {

  private static final Logger LOGGER = LoggerFactory.getLogger(VideoObjectServer.class);

  private final VideoObjectStore store;

  public VideoObjectServer(VideoObjectStore store) {
    this.store = store;
  }

  /**
   * Resolves the bytes for one derived key into the complete response.
   *
   * @param key the object key, derived by the caller from immutable identity
   * @param filename the attachment filename for {@code ?download=true}, or null for inline
   * @param rangeHeader the raw {@code Range} header, or null
   * @param logSubject what the log line names when the store is unreachable, e.g. {@code "execution
   *     <id>"}; it never contains the key, the bucket or the endpoint
   * @return {@code 200} or {@code 206} with the bytes
   * @throws ExecutionVideoException {@code 404} when the store answered and the object is absent,
   *     {@code 416} for an unsatisfiable range, {@code 503} when the store is unreachable
   */
  public ResponseEntity<byte[]> serve(
      String key, String filename, String rangeHeader, String logSubject) {
    VideoObjectMetadata object = metadata(key, logSubject);
    long size = object.sizeBytes();

    ByteRangeRequest range = ByteRangeRequest.parse(rangeHeader, size);
    if (range.kind() == ByteRangeRequest.Kind.UNSATISFIABLE) {
      throw ExecutionVideoException.unsatisfiableRange(size);
    }
    if (range.satisfiable()) {
      byte[] bytes = readBytes(key, range.firstByte(), range.lastByte(), logSubject);
      String contentRange = "bytes " + range.firstByte() + "-" + range.lastByte() + "/" + size;
      return respond(HttpStatus.PARTIAL_CONTENT, bytes, contentRange, filename);
    }
    byte[] bytes = size == 0 ? new byte[0] : readBytes(key, 0, size - 1, logSubject);
    return respond(HttpStatus.OK, bytes, null, filename);
  }

  /**
   * The one place a response is shaped, so {@code 200} and {@code 206} cannot drift apart.
   *
   * <p>{@code Content-Length} is the number of bytes being written and {@code Content-Range}'s
   * total is the measured object size; both come from the store and neither from a row.
   */
  private static ResponseEntity<byte[]> respond(
      HttpStatus status, byte[] bytes, String contentRange, String filename) {
    ResponseEntity.BodyBuilder response =
        ResponseEntity.status(status)
            .contentType(MediaType.parseMediaType(ExecutionVideoService.VIDEO_WEBM))
            .header(HttpHeaders.ACCEPT_RANGES, "bytes")
            .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
            .contentLength(bytes.length);
    if (contentRange != null) {
      response = response.header(HttpHeaders.CONTENT_RANGE, contentRange);
    }
    if (filename != null) {
      response =
          response.header(
              HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"");
    }
    return response.body(bytes);
  }

  private VideoObjectMetadata metadata(String key, String logSubject) {
    java.util.Optional<VideoObjectMetadata> found;
    try {
      found = store.metadata(key);
    } catch (VideoObjectStoreUnavailableException e) {
      throw unreachable(logSubject);
    }
    // The store answered and the object is not there. That is an absent object, and it is the only
    // case that may be reported as "no evidence".
    return found.orElseThrow(ExecutionVideoException::noEvidence);
  }

  private byte[] readBytes(String key, long firstByte, long lastByte, String logSubject) {
    try {
      return store.read(key, firstByte, lastByte);
    } catch (VideoObjectStoreUnavailableException e) {
      throw unreachable(logSubject);
    }
  }

  private static ExecutionVideoException unreachable(String logSubject) {
    // Store exception messages and nested causes may name keys, buckets or endpoints. Keep
    // INFO+ diagnostics to the safe subject and fixed disposition; never attach the throwable.
    LOGGER.warn("Studio evidence store unreachable while serving the recording for {}", logSubject);
    return ExecutionVideoException.storeUnavailable();
  }
}
