package com.citi.put.checks.studio.guided.evidence;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /internal/v2/studio/guided-sessions/{id}/recording-evidence} (STUDIO-OBS-013, AR-1
 * R3).
 *
 * <p>Mounted under the guided internal prefix, so {@code GuidedInternalSecurity}'s chain (service
 * JWT + mutual TLS) authenticates every request before this controller is reached. The body is read
 * raw and bounded here and parsed by the guided strict wire reader (no fractional or {@code -0}
 * lexemes, no duplicate names), the same reader the other bridge routes use. Refusals use the same
 * data-free v3 envelope as {@code GuidedInternalController}.
 */
@RestController
@Profile("!worker")
@RequestMapping("/internal/v2/studio/guided-sessions/{id}")
public class GuidedSessionEvidenceInternalController {

  /** The same raw bound the guided body advice applies to bridge routes. */
  static final int MAX_BODY_BYTES = 1048576;

  private final GuidedSessionEvidenceService service;
  private final GuidedContracts contracts;

  public GuidedSessionEvidenceInternalController(
      GuidedSessionEvidenceService service, GuidedContracts contracts) {
    this.service = service;
    this.contracts = contracts;
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping(GuidedSessionEvidenceService.ROUTE_PATH)
  public JsonNode recordingEvidence(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader(value = "X-Owner-Fence", required = false) Long fence,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      HttpServletRequest request)
      throws IOException {
    return service.record(caller, id, fence, key, body(request));
  }

  private JsonNode body(HttpServletRequest request) throws IOException {
    String contentType = request.getContentType();
    if (contentType != null) {
      MediaType type;
      try {
        type = MediaType.parseMediaType(contentType);
      } catch (RuntimeException invalid) {
        throw new GuidedSessionException("INVALID_CONTRACT", 422);
      }
      GuidedSessionException.require(
          type.getCharset() == null || type.getCharset().equals(StandardCharsets.UTF_8),
          "INVALID_CONTRACT",
          422);
    }
    byte[] bytes = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
    GuidedSessionException.require(bytes.length <= MAX_BODY_BYTES, "INVALID_CONTRACT", 422);
    return contracts.parseWire(bytes);
  }

  @ExceptionHandler(RuntimeException.class)
  public ResponseEntity<?> unexpected(RuntimeException ignored) {
    return failure(new GuidedSessionException("UNKNOWN_OUTCOME", 409));
  }

  @ExceptionHandler(GuidedSessionException.class)
  public ResponseEntity<?> failure(GuidedSessionException failure) {
    var response = new java.util.HashMap<String, Object>(failure.response());
    response.put("schemaVersion", 3);
    return ResponseEntity.status(failure.status()).body(response);
  }
}
