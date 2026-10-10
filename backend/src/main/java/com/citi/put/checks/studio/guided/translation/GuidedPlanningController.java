package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Controller service identity only; raw-byte advice and existing mTLS/JWT chain both apply. */
@RestController
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
    name = "studio.guided-authoring.translation.enabled",
    havingValue = "true")
@RequestMapping("/internal/v2/studio/guided-sessions/{id}")
public final class GuidedPlanningController {
  private final GuidedTranslationService service;

  public GuidedPlanningController(GuidedTranslationService service) {
    this.service = service;
  }

  @PostMapping("/plans")
  public ResponseEntity<JsonNode> plan(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode command) {
    return ResponseEntity.accepted()
        .header("Cache-Control", "no-store")
        .body(service.plan(caller, id, fence, key, command));
  }

  @PostMapping("/proposals")
  public ResponseEntity<JsonNode> proposal(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode command) {
    return ResponseEntity.accepted()
        .header("Cache-Control", "no-store")
        .body(service.advance(caller, id, fence, key, command));
  }

  @PostMapping("/dependency-admissions")
  public ResponseEntity<JsonNode> dependencies(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode command) {
    return ResponseEntity.accepted()
        .header("Cache-Control", "no-store")
        .body(service.replan(caller, id, fence, key, command));
  }

  @PostMapping("/planning-context")
  public ResponseEntity<JsonNode> context(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode command) {
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .body(service.context(caller, id, fence, command));
  }

  @ExceptionHandler(GuidedSessionException.class)
  public ResponseEntity<?> failure(GuidedSessionException exception) {
    return ResponseEntity.status(exception.status())
        .header("Cache-Control", "no-store")
        .body(java.util.Map.of("schemaVersion", 2, "code", exception.getMessage()));
  }
}
