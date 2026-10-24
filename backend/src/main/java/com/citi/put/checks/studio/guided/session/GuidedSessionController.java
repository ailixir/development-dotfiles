package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Public BFF identity remains the platform contract; there is no public JWT resource-server. */
@RestController
@RequestMapping("/api/v1/studio/guided-sessions")
public class GuidedSessionController {
  private final GuidedSessionService service;
  private com.citi.put.checks.studio.guided.publication.GuidedPublicationResultProjector
      publication;

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  public void installPublicationProjection(
      com.citi.put.checks.studio.guided.publication.GuidedPublicationResultProjector projector) {
    publication = projector;
  }

  public GuidedSessionController(GuidedSessionService service) {
    this.service = service;
  }

  @PostMapping
  public ResponseEntity<JsonNode> start(
      Authentication user,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body) {
    JsonNode started = service.start(user, key, body);
    return ResponseEntity.accepted()
        .body(publication == null ? started : publication.started(started));
  }

  @GetMapping("/{id}")
  public JsonNode read(
      Authentication user,
      @PathVariable String id,
      jakarta.servlet.http.HttpServletRequest request) {
    if (publication != null) {
      var result = publication.read(user, request, id, false);
      if (result.isPresent()) {
        return result.get();
      }
    }
    return service.read(user, id, "session");
  }

  @GetMapping("/{id}/result")
  public ResponseEntity<JsonNode> result(
      Authentication user,
      @PathVariable String id,
      jakarta.servlet.http.HttpServletRequest request) {
    if (publication != null) {
      var projected = publication.read(user, request, id, true);
      if (projected.isPresent()) {
        JsonNode value = projected.get();
        return ResponseEntity.status(
                value.path("publication").path("status").asText().equals("PENDING") ? 202 : 200)
            .body(value);
      }
    }
    JsonNode result = service.read(user, id, "result");
    return ResponseEntity.status(
            GuidedSessionService.terminalOutcome(result.path("outcome").asText()) ? 200 : 202)
        .body(result);
  }

  @GetMapping("/{id}/clarification")
  public ResponseEntity<JsonNode> clarification(Authentication user, @PathVariable String id) {
    JsonNode result = service.read(user, id, "clarification");
    return result == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(result);
  }

  @PostMapping("/{id}/clarify")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public JsonNode clarify(
      Authentication user,
      @PathVariable String id,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body) {
    return service.clarify(user, id, key, body);
  }

  @PostMapping("/{id}/cancel")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public JsonNode cancel(
      Authentication user,
      @PathVariable String id,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body) {
    return service.cancel(user, id, key, body);
  }

  @ExceptionHandler(GuidedSessionException.class)
  public ResponseEntity<?> failure(GuidedSessionException failure) {
    var response = ResponseEntity.status(failure.status());
    if (failure.retryAfterSeconds() != null) {
      // STUDIO-OBS-014 AC-8 (AR-2 d): only the per-CSI budget refusals carry it.
      response.header("Retry-After", String.valueOf(failure.retryAfterSeconds()));
    }
    return response.body(failure.response());
  }
}
