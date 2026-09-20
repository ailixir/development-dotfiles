package com.citi.put.checks.studio.authoring;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Versioned routes are absent until operators explicitly enable the gated contract. */
@RestController
@Profile("!worker")
@ConditionalOnProperty(name = "studio.authoring.v2-enabled", havingValue = "true")
@RequestMapping("/api/v2/studio")
public class StudioAuthoringController {
  private final StudioAuthoringService service;

  public StudioAuthoringController(StudioAuthoringService service) {
    this.service = service;
  }

  @PostMapping("/tests")
  public ResponseEntity<AuthoringDtos.View> create(
      @Valid @RequestBody AuthoringDtos.Write body, Authentication auth) {
    AuthoringDtos.View result = service.create(body, auth);
    return ResponseEntity.created(URI.create("/api/v2/studio/tests/" + result.test().id()))
        .body(result);
  }

  @GetMapping("/tests/{id}")
  public AuthoringDtos.View get(@PathVariable UUID id, Authentication auth) {
    return service.get(id, auth);
  }

  @PutMapping("/tests/{id}")
  public AuthoringDtos.View update(
      @PathVariable UUID id, @Valid @RequestBody AuthoringDtos.Write body, Authentication auth) {
    return service.update(id, body, auth);
  }

  @PostMapping("/tests/{id}/compile")
  public ResponseEntity<AuthoringDtos.Accepted> compile(
      @PathVariable UUID id, @Valid @RequestBody AuthoringDtos.Compile body, Authentication auth) {
    return ResponseEntity.accepted().body(service.compile(id, body, auth));
  }

  @PostMapping("/tests/{id}/confirm-compile")
  public AuthoringDtos.View confirm(
      @PathVariable UUID id, @Valid @RequestBody AuthoringDtos.Confirm body, Authentication auth) {
    return service.confirm(id, body, auth);
  }

  @GetMapping("/tests/{id}/compiles/{compileRequestId}")
  public JsonNode attempt(
      @PathVariable UUID id, @PathVariable UUID compileRequestId, Authentication auth) {
    return service.attempt(id, compileRequestId, auth);
  }
}
