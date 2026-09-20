package com.citi.put.checks.studio.sse;

import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.security.core.Authentication;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** One open stream: its emitter, the identity captured at open, and its coalesced pending state. */
public final class StreamSubscription {

  private final UUID executionId;
  private final String principal;
  private final Authentication capturedIdentity;
  private final SseEmitter emitter;
  private final Instant openedAt;

  /**
   * The <b>coalesced</b> pending snapshot (AC-35). Overwriting rather than queueing is the point: a
   * reader N revisions behind receives the <em>current</em> snapshot, not N of them, because every
   * snapshot is full current state and the older ones say nothing the newest does not.
   */
  private final AtomicReference<ExecutionSnapshotDto> pending = new AtomicReference<>();

  /** True while a send task for this subscription is in flight, so at most one ever is. */
  private final AtomicBoolean sending = new AtomicBoolean(false);

  private volatile long lastSentRevision = -1L;
  private volatile Instant lastAuthorizedAt;

  /** Last time anything was written to the socket — a snapshot or a comment heartbeat. */
  private volatile Instant lastActivityAt;

  public StreamSubscription(
      UUID executionId,
      String principal,
      Authentication capturedIdentity,
      SseEmitter emitter,
      Instant openedAt) {
    this.executionId = executionId;
    this.principal = principal;
    this.capturedIdentity = capturedIdentity;
    this.emitter = emitter;
    this.openedAt = openedAt;
    this.lastAuthorizedAt = openedAt;
    this.lastActivityAt = openedAt;
  }

  public UUID executionId() {
    return executionId;
  }

  public String principal() {
    return principal;
  }

  public Authentication capturedIdentity() {
    return capturedIdentity;
  }

  public SseEmitter emitter() {
    return emitter;
  }

  public Instant openedAt() {
    return openedAt;
  }

  public AtomicReference<ExecutionSnapshotDto> pending() {
    return pending;
  }

  public AtomicBoolean sending() {
    return sending;
  }

  public long lastSentRevision() {
    return lastSentRevision;
  }

  public void recordSent(long revision) {
    this.lastSentRevision = revision;
  }

  public Instant lastAuthorizedAt() {
    return lastAuthorizedAt;
  }

  public void recordAuthorized(Instant at) {
    this.lastAuthorizedAt = at;
  }

  public Instant lastActivityAt() {
    return lastActivityAt;
  }

  public void recordActivity(Instant at) {
    this.lastActivityAt = at;
  }
}
