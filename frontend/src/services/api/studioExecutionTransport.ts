import type { ExecutionSnapshot } from '@/types/studio/studioTypes';

/**
 * Story 10.11b — the one transport abstraction every execution snapshot reaches the screen through.
 *
 * The SSE assessment is explicit about where this lives: *"Put subscription creation/cleanup and
 * authentication handling in the API service layer; the component should not create unmanaged
 * network connections."* So the component asks this module for a subscription and gets snapshots;
 * it never opens a socket, never holds a timer, and never reads `GET /executions/{id}` itself.
 *
 * **What lives here rather than in an implementation, and why.** Revision ordering (AC-10) and the
 * close rule (AC-13) are properties of *the subscription*, not of SSE. Studio architecture §5.5
 * designates `GET /executions/{id}` as SSE's own recovery and fallback path and states both carry
 * the same payload, so an ordering rule written inside the `EventSource` implementation would be
 * silently absent the moment the fallback is selected — which is exactly what AC-16 re-runs the
 * ordering and lifecycle assertions through the fallback to catch.
 */

export type TransportKind = 'sse' | 'poll';

export type TransportPhase =
  /** A connection is being established, and nothing has been delivered on it yet. */
  | 'connecting'
  /** A connection is established and delivering. */
  | 'live'
  /** The connection dropped and a bounded number of further attempts remain. */
  | 'reconnecting'
  /** The streaming budget is spent; the bounded GET fallback is taking over. */
  | 'falling-back'
  /** The subscription is finished and will make no further request of any kind. */
  | 'closed';

/**
 * Why a subscription finished. `stream-complete` is the ordinary end of a run; everything else is
 * a condition the surface has to say out loud.
 */
export type TransportClosedReason =
  | 'stream-complete'
  | 'caller'
  | 'access-denied'
  | 'exhausted';

export interface TransportStatus {
  readonly kind: TransportKind;
  readonly phase: TransportPhase;
  /**
   * The accessible name for this phase. AC-11(i): it must be distinguishable from every
   * `ExecutionStatus` narrative, because a dropped connection is not a failed test.
   */
  readonly label: string;
}

export interface TransportAccessDenial {
  /** 401 or 403, as the route answered it. */
  readonly status: number;
}

/**
 * Phase wording. Deliberately about the *connection*, never about the run: no member of
 * `ExecutionStatus` (`PENDING` / `RUNNING` / `PASSED` / `FAILED` / `ERROR`) appears in any of them,
 * which `studioTransport.node.test.ts` asserts rather than assumes.
 */
export const TRANSPORT_PHASE_LABELS: Readonly<Record<TransportPhase, string>> = Object.freeze({
  connecting: 'Connecting to the live progress feed',
  live: 'Live progress feed connected',
  reconnecting: 'Live progress feed interrupted — reconnecting',
  'falling-back': 'Live progress feed unavailable — retrieving progress periodically',
  closed: 'Live progress feed closed',
});

export interface ExecutionSubscriptionHandlers {
  /** A snapshot that survived the ordering rule. Older and duplicate revisions never arrive here. */
  onSnapshot?(snapshot: ExecutionSnapshot): void;
  onStatus?(status: TransportStatus): void;
  /** A `401`/`403`. Nothing is retried after this, on any path. */
  onAccessDenied?(denial: TransportAccessDenial): void;
  onClosed?(reason: TransportClosedReason): void;
}

/**
 * Every bound this subscription obeys, in one place and with a name. The defaults are the product
 * numbers; tests scale them, which is the only reason they are parameters at all.
 */
export interface TransportBounds {
  /** How long to wait before re-opening a stream that dropped. */
  readonly reconnectDelayMs: number;
  /**
   * The **named bound** AC-12 requires: how many consecutive failed stream attempts are made before
   * the bounded GET fallback takes over. A connection that delivered a snapshot resets the count,
   * so a deliberate bounded server-side close (DA-3) is a normal reconnect and not an error.
   */
  readonly reconnectAttemptBound: number;
  /** The fallback's stated cadence. */
  readonly pollIntervalMs: number;
  /** The fallback's stated total bound. After this it gives up rather than polling forever. */
  readonly pollTotalBoundMs: number;
  /** Consecutive fallback read failures tolerated before giving up. Never applies to 401/403. */
  readonly pollFailureBound: number;
}

export const DEFAULT_TRANSPORT_BOUNDS: TransportBounds = Object.freeze({
  reconnectDelayMs: 1000,
  reconnectAttemptBound: 3,
  pollIntervalMs: 1000,
  pollTotalBoundMs: 120000,
  pollFailureBound: 3,
});

/**
 * What an implementation is handed. It reports; it does not decide. Ordering, the close rule and
 * the escalation to the fallback are the shared layer's, which is what makes both implementations
 * obey the same rules by construction.
 */
export interface TransportHost {
  readonly executionId: string;
  readonly bounds: TransportBounds;
  /** Hand over a payload as received. The shared layer parses, orders and closes. */
  deliver(payload: unknown): void;
  /** Report a phase change; the shared layer attaches the label. */
  phase(phase: TransportPhase): void;
  /** A `401`/`403`. Stops everything, permanently, on every path. */
  denied(status: number): void;
  /** This implementation has spent its budget. The shared layer decides what happens next. */
  exhausted(): void;
  /** The highest revision applied so far, or null if nothing has been applied. */
  lastRevision(): number | null;
  /** True once the subscription is finished; implementations use it to stop cleanly. */
  isClosed(): boolean;
}

export interface TransportImplementation {
  readonly kind: TransportKind;
  start(): void;
  close(): void;
}

export type TransportImplementationFactory = (host: TransportHost) => TransportImplementation;

export interface ExecutionSubscription {
  close(): void;
}

/**
 * The seam. AC-7 substitutes an implementation that emits nothing here; AC-16 promotes the fallback
 * to primary here. Both are the same seam, which is the point: the fallback is a first-class
 * transport selected through the abstraction, not a `catch` block inside the streaming one.
 */
export interface ExecutionTransportSeam {
  readonly primary: TransportImplementationFactory;
  readonly fallback: TransportImplementationFactory | null;
}

let defaultSeam: ExecutionTransportSeam | null = null;
let seam: ExecutionTransportSeam | null = null;

/**
 * Wired once at module init by `studioTransportWiring.ts`. Keeping the default out of this file is
 * what stops the abstraction importing its own implementations at run time.
 */
export function installDefaultExecutionTransportSeam(next: ExecutionTransportSeam): void {
  defaultSeam = next;
  if (seam === null) {
    seam = next;
  }
}

export function setExecutionTransportSeam(next: Partial<ExecutionTransportSeam>): void {
  const base = seam ?? defaultSeam;
  if (base === null) {
    throw new Error('studioExecutionTransport: no default seam installed');
  }
  seam = {
    primary: next.primary ?? base.primary,
    fallback: next.fallback === undefined ? base.fallback : next.fallback,
  };
}

export function resetExecutionTransportSeam(): void {
  seam = defaultSeam;
}

export function getExecutionTransportSeam(): ExecutionTransportSeam {
  const current = seam ?? defaultSeam;
  if (current === null) {
    throw new Error('studioExecutionTransport: no default seam installed');
  }
  return current;
}

/** The smallest check that a payload is a snapshot we can order: a numeric `revision`. */
function readRevision(payload: unknown): number | null {
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  const revision = (payload as { revision?: unknown }).revision;
  return typeof revision === 'number' && Number.isFinite(revision) ? revision : null;
}

/**
 * Subscribe to one execution's progress.
 *
 * The returned handle is the only way to stop it, and calling `close()` twice is harmless — which
 * matters because React will call it from a cleanup that may run after the stream already finished.
 */
export function subscribeToExecution(
  executionId: string,
  handlers: ExecutionSubscriptionHandlers,
  options?: { bounds?: Partial<TransportBounds>; seam?: Partial<ExecutionTransportSeam> },
): ExecutionSubscription {
  const configured = getExecutionTransportSeam();
  const active: ExecutionTransportSeam = {
    primary: options?.seam?.primary ?? configured.primary,
    fallback:
      options?.seam?.fallback === undefined ? configured.fallback : options.seam.fallback,
  };
  const bounds: TransportBounds = { ...DEFAULT_TRANSPORT_BOUNDS, ...(options?.bounds ?? {}) };

  let closed = false;
  let lastRevision: number | null = null;
  let implementation: TransportImplementation | null = null;
  let usingFallback = false;

  const finish = (reason: TransportClosedReason) => {
    if (closed) {
      return;
    }
    closed = true;
    const current = implementation;
    implementation = null;
    current?.close();
    handlers.onStatus?.({
      kind: current?.kind ?? (usingFallback ? 'poll' : 'sse'),
      phase: 'closed',
      label: TRANSPORT_PHASE_LABELS.closed,
    });
    handlers.onClosed?.(reason);
  };

  const host: TransportHost = {
    executionId,
    bounds,
    lastRevision: () => lastRevision,
    isClosed: () => closed,
    phase(phase) {
      if (closed) {
        return;
      }
      handlers.onStatus?.({
        kind: implementation?.kind ?? 'sse',
        phase,
        label: TRANSPORT_PHASE_LABELS[phase],
      });
    },
    deliver(payload) {
      if (closed) {
        return;
      }
      const revision = readRevision(payload);
      if (revision === null) {
        return;
      }
      // §5.5: "The MFE replaces current state, ignores older revisions." A duplicate is an older
      // revision by the same rule — `<=`, not `<`.
      if (lastRevision !== null && revision <= lastRevision) {
        return;
      }
      lastRevision = revision;
      const snapshot = payload as ExecutionSnapshot;
      handlers.onSnapshot?.(snapshot);
      // §5.5: close on `streamComplete`, *after evidence is settled* — which is what the server
      // says by setting the flag. A terminal `status` alone closes nothing: §5.4 row 5 keeps the
      // stream open while evidence is still `PROCESSING`, and evidence failure settles it too.
      if (snapshot.streamComplete === true) {
        finish('stream-complete');
      }
    },
    denied(status) {
      if (closed) {
        return;
      }
      handlers.onAccessDenied?.({ status });
      finish('access-denied');
    },
    exhausted() {
      if (closed) {
        return;
      }
      if (!usingFallback && active.fallback !== null) {
        // Never around a 401/403 — that path reaches `denied` and finishes there instead.
        usingFallback = true;
        const previous = implementation;
        implementation = null;
        previous?.close();
        handlers.onStatus?.({
          kind: 'poll',
          phase: 'falling-back',
          label: TRANSPORT_PHASE_LABELS['falling-back'],
        });
        implementation = active.fallback(host);
        implementation.start();
        return;
      }
      finish('exhausted');
    },
  };

  implementation = active.primary(host);
  implementation.start();

  return {
    close() {
      finish('caller');
    },
  };
}
