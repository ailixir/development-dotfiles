package com.citi.put.checks.studio;

import com.citi.put.checks.studio.evidence.ExecutionVideoService;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/studio/executions/{id}/video} — the protected recording (Architecture §6.3,
 * §9.1; story 10.15).
 *
 * <p>The snapshot's {@code videoPath} is this path and nothing else: §6.2 keeps object keys,
 * buckets and hosts out of every response, so a browser is handed an API path it must be authorized
 * to follow rather than a URL that is its own authority.
 *
 * <p><b>No {@code produces} on the mapping.</b> An authorization failure answers with the same JSON
 * error body the snapshot route does; a handler declaring only {@code video/webm} would make
 * content negotiation turn that {@code 403} into a {@code 500}. The merged SSE controller carries
 * the same note for the same reason. The media type is set on the success path instead.
 *
 * <p><b>Two parameters and no third.</b> The {@code id} in the path and the boolean {@code
 * download} query parameter — the frozen document declares exactly those. {@code Range} is a
 * protocol header, not a parameter, and <b>no credential is ever read from a query string</b>: a
 * request carrying {@code ?token=}, {@code ?access_token=} or {@code ?Authorization=} is served or
 * refused exactly as the same request without them, because nothing here looks at them.
 */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio")
public class ExecutionVideoController {

  private final ExecutionVideoService videoService;

  public ExecutionVideoController(ExecutionVideoService videoService) {
    this.videoService = videoService;
  }

  /**
   * Serves the recording, whole or by range.
   *
   * @param id the execution
   * @param download {@code true} to receive an attachment with an API-derived filename
   * @param range the standard {@code Range} header; a malformed one is ignored, not refused
   * @param auth the caller, from the ambient session the platform filter establishes
   * @return {@code 200} or {@code 206} with the bytes; refusals are thrown and rendered by {@code
   *     ChecksExceptionHandler}
   */
  @GetMapping("/executions/{id}/video")
  public ResponseEntity<byte[]> getExecutionVideo(
      @PathVariable UUID id,
      @RequestParam(name = "download", required = false, defaultValue = "false") boolean download,
      @RequestHeader(value = "Range", required = false) String range,
      Authentication auth) {
    return videoService.read(id, download, range, auth);
  }
}
