package com.citi.put.checks.studio.sse;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * {@code GET /api/v1/studio/executions/{id}/events} — the SSE snapshot stream (AC-32, AC-34,
 * AC-37a).
 *
 * <p>Authorization happens on the request thread, through exactly the same path {@code GET
 * /executions/{id}} uses, so an unauthorized or forbidden request to this route answers with the
 * <b>same status and code the GET snapshot route would</b>. That is the server half of the client's
 * "never fall back around a {@code 401}/{@code 403}" rule (story 10.11 owns the client half): a
 * client can only distinguish denied access from terminal completion and from a transient
 * disconnect if the server makes them distinguishable.
 *
 * <p>The identity is then <b>captured</b> for the async writer. {@code
 * BffSessionAuthenticationFilter} clears {@code SecurityContextHolder} in a {@code finally} block,
 * so a writer reading it later reads nothing.
 *
 * <p>{@code Last-Event-ID} is accepted and used <b>only to identify the reconnect</b>. Every
 * connection — first or thousandth — is answered with a full current snapshot and never a replay,
 * so a value ahead of, behind, equal to, absent from or malformed relative to the current revision
 * all produce the same thing. That is sound because a snapshot is full current state; replaying
 * would be both more work and less correct.
 *
 * <p>No credential appears in the URL or in any query parameter: this route takes none.
 */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio")
public class ExecutionEventsController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExecutionEventsController.class);

  private final StudioService studioService;
  private final WatchedExecutionRegistry registry;
  private final StudioExecutionProperties properties;

  public ExecutionEventsController(
      StudioService studioService,
      WatchedExecutionRegistry registry,
      StudioExecutionProperties properties) {
    this.studioService = studioService;
    this.registry = registry;
    this.properties = properties;
  }

  // No `produces` on the mapping: an authorization failure answers with the same JSON error body
  // the GET snapshot route does, and a handler that declared only text/event-stream would make
  // content negotiation turn that 403 into a 500 — which is exactly the distinction AC-37a needs
  // the client to be able to draw. The success path sets the media type explicitly instead.
  @GetMapping("/executions/{id}/events")
  public ResponseEntity<SseEmitter> streamExecution(
      @PathVariable UUID id,
      @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId,
      Authentication auth) {

    // Authorized against the execution's immutable CSI, before anything is opened, and by the same
    // code path the GET snapshot route uses — which is what makes the two statuses identical.
    ExecutionSnapshotDto current = studioService.findExecutionById(id, auth);

    SseEmitter emitter = new SseEmitter(properties.sseOrDefault().lifetimeOrDefault().toMillis());
    StreamSubscription subscription =
        new StreamSubscription(id, principalOf(auth), auth, emitter, Instant.now());

    // All five release paths, each dropping the execution from the watched set when it was the
    // last viewer and each returning sender capacity (AC-35).
    emitter.onTimeout(() -> release(subscription, "timeout"));
    emitter.onCompletion(() -> release(subscription, "completion"));
    emitter.onError(error -> release(subscription, "error"));

    registry.register(subscription);

    try {
      // Initial delivery is a full current snapshot, exactly as every reconnect is.
      emitter.send(
          SseEmitter.event()
              .id(Long.toString(current.revision()))
              .name("execution.snapshot")
              .data(current, MediaType.APPLICATION_JSON));
      subscription.recordSent(current.revision());
      subscription.recordActivity(Instant.now());
      if (lastEventId != null && !lastEventId.isBlank()) {
        LOGGER.debug(
            "Studio SSE reconnect for execution {} identified by Last-Event-ID '{}'; answered with "
                + "the current snapshot at revision {}",
            id,
            lastEventId,
            current.revision());
      }
      if (current.streamComplete()) {
        emitter.complete();
      }
    } catch (IOException e) {
      release(subscription, "initial send");
      emitter.completeWithError(e);
    }

    HttpHeaders headers = new HttpHeaders();
    // §5.5: an intermediary that caches or buffers this is an intermediary that breaks it.
    headers.setCacheControl("no-store");
    headers.set("X-Accel-Buffering", "no");
    headers.setContentType(MediaType.TEXT_EVENT_STREAM);
    return new ResponseEntity<>(emitter, headers, org.springframework.http.HttpStatus.OK);
  }

  /**
   * One release path, reached five ways: timeout, client disconnect, error, completion and
   * application shutdown (the pool is daemon and the emitters complete with the context).
   */
  private void release(StreamSubscription subscription, String path) {
    if (registry.release(subscription)) {
      LOGGER.debug(
          "Studio SSE subscription for execution {} released on {}",
          subscription.executionId(),
          path);
    }
  }

  private static String principalOf(Authentication auth) {
    return auth == null ? "anonymous" : String.valueOf(auth.getName());
  }
}
