package com.citi.put.checks.studio.guided.publication;

import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** BFF-authenticated continuation of the original Run, with fresh Core at the actual commit. */
@RestController
@Profile("!worker")
@RequestMapping("/api/v3/studio/guided-sessions")
public class GuidedPublicationController {
  private final GuidedPlanPublisher publisher;

  public GuidedPublicationController(GuidedPlanPublisher publisher) {
    this.publisher = publisher;
  }

  @PostMapping("/{id}/finalize")
  public JsonNode finalizeForUser(
      Authentication caller,
      HttpServletRequest request,
      @PathVariable String id,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body) {
    return publisher
        .finalizeForUser(caller, request, id, key, body)
        .document()
        .path("publicReceipt");
  }

  @ExceptionHandler(GuidedSessionException.class)
  public ResponseEntity<?> failure(GuidedSessionException failure) {
    return ResponseEntity.status(failure.status()).body(failure.response());
  }
}
