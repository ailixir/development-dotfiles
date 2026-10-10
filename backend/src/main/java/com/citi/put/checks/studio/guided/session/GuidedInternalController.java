package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({
  "/internal/v1/studio/guided-sessions/{id}",
  "/internal/v2/studio/guided-sessions/{id}"
})
public class GuidedInternalController {
  private final GuidedSessionService service;

  @org.springframework.beans.factory.annotation.Autowired
  private org.springframework.beans.factory.ObjectProvider<
          com.citi.put.checks.studio.guided.bridge.GuidedDispatchService>
      dispatch;

  public GuidedInternalController(GuidedSessionService service) {
    this.service = service;
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping("/claim")
  public JsonNode claim(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body,
      jakarta.servlet.http.HttpServletRequest request) {
    routeVersion(request, body);
    return service.claim(caller, id, key, body);
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping("/observations")
  public JsonNode observations(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body,
      jakarta.servlet.http.HttpServletRequest request) {
    routeVersion(request, body);
    return body.path("schemaVersion").asInt() == 2
        ? service.observeV2(caller, id, fence, key, body)
        : service.observe(caller, id, fence, key, body);
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping("/admissions")
  public JsonNode admissions(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body,
      jakarta.servlet.http.HttpServletRequest request) {
    routeVersion(request, body);
    if (body.path("schemaVersion").asInt() == 2) {
      var bridge = dispatch.getIfAvailable();
      GuidedSessionException.require(bridge != null, "RUNTIME_INCOMPATIBLE", 409);
      return bridge.prepareAndAdmit(caller, id, fence, key, body);
    }
    return service.admit(caller, id, fence, key, body);
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping("/advance")
  public JsonNode advance(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body,
      jakarta.servlet.http.HttpServletRequest request) {
    routeVersion(request, body);
    if (body.path("schemaVersion").asInt() == 2) {
      var bridge = dispatch.getIfAvailable();
      GuidedSessionException.require(bridge != null, "RUNTIME_INCOMPATIBLE", 409);
      return bridge.dispatch(caller, id, fence, key, body);
    }
    return service.advance(caller, id, fence, key, body);
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping("/outcomes")
  public JsonNode outcomes(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body,
      jakarta.servlet.http.HttpServletRequest request) {
    routeVersion(request, body);
    return body.path("schemaVersion").asInt() == 2
        ? service.outcomeV2(caller, id, fence, key, body)
        : service.outcome(caller, id, fence, key, body);
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping("/finalize")
  public JsonNode finalizeSession(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body,
      jakarta.servlet.http.HttpServletRequest request) {
    routeVersion(request, body);
    GuidedSessionException.require(
        body.path("schemaVersion").asInt() != 2, "RUNTIME_INCOMPATIBLE", 409);
    return service.finalizeSession(caller, id, fence, key, body);
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping("/bootstrap-evidence")
  public JsonNode bootstrap(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader("X-Owner-Fence") long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body,
      jakarta.servlet.http.HttpServletRequest request) {
    routeVersion(request, body);
    return service.bootstrap(caller, id, fence, key, body);
  }

  @ResponseStatus(HttpStatus.ACCEPTED)
  @PostMapping("/lifecycle")
  public JsonNode lifecycle(
      Authentication caller,
      @PathVariable String id,
      @RequestHeader(value = "X-Owner-Fence", required = false) Long fence,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody JsonNode body,
      jakarta.servlet.http.HttpServletRequest request) {
    routeVersion(request, body);
    if (body.path("kind").asText().equals("assignment")) {
      GuidedSessionException.require(fence == null, "INVALID_CONTRACT", 422);
      return service.assignmentLifecycle(caller, id, key, body);
    }
    GuidedSessionException.require(fence != null, "INVALID_CONTRACT", 422);
    return service.lifecycle(caller, id, fence, key, body);
  }

  private static void routeVersion(jakarta.servlet.http.HttpServletRequest request, JsonNode body) {
    GuidedSessionException.require(
        request.getRequestURI().startsWith("/internal/v2/")
            == (body.path("schemaVersion").asInt() == 2),
        "RUNTIME_INCOMPATIBLE",
        409);
  }

  @ExceptionHandler(RuntimeException.class)
  public ResponseEntity<?> unexpected(
      RuntimeException ignored, jakarta.servlet.http.HttpServletRequest request) {
    return failure(new GuidedSessionException("UNKNOWN_OUTCOME", 409), request);
  }

  @ExceptionHandler(GuidedSessionException.class)
  public ResponseEntity<?> failure(
      GuidedSessionException failure, jakarta.servlet.http.HttpServletRequest request) {
    var response = new java.util.HashMap<String, Object>(failure.response());
    if (request.getRequestURI().startsWith("/internal/v2/")) {
      response.put("schemaVersion", 2);
    }
    return ResponseEntity.status(failure.status()).body(response);
  }
}
