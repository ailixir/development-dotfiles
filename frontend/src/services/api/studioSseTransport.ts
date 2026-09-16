import { APP_CONFIG } from '@utils/constants/appConfig';
import studioApi from './studioApi';
import type {
  TransportHost,
  TransportImplementation,
} from './studioExecutionTransport';

/**
 * Story 10.11b — the `EventSource` implementation of the execution transport.
 *
 * **Why native `EventSource` and not a header-capable client.** SPK-02 rules it in advance:
 * *"10.11 chooses native `EventSource` versus a header-capable client; if the spike is still open
 * when 10.11 is drafted, 10.11 builds the transport abstraction plus `EventSource` and the GET
 * fallback, and defers the header client."* SPK-02 is OPEN. So there is exactly one auth mode here,
 * it is ambient, and no header is attached anywhere — see {@link SSE_AUTH_MODES}.
 */

/**
 * The auth seam. One mode, one implementation.
 *
 * A bearer-capable mode is the obvious thing to add here the first time staging refuses a cookie,
 * and that is precisely why the seam is a named registry rather than an `if`: a second entry is a
 * visible edit to a production symbol that a named test fails on, instead of a module-local branch
 * on an environment flag that an export scan cannot see.
 *
 * `EventSource` cannot carry a request header at all (HTML SSE specification), so an
 * `EventSourceInit` is the whole of what a mode can contribute. If the platform turns out to
 * require a header, the answer is not another entry here — it is the header-capable client SPK-02
 * defers, behind this same seam.
 */
export interface SseAuthMode {
  readonly id: string;
  readonly init: EventSourceInit;
}

export const AMBIENT_SESSION_AUTH_MODE: SseAuthMode = Object.freeze({
  id: 'ambient-session-credentials',
  init: Object.freeze({ withCredentials: true }),
});

/** Exactly one. AC-15(a)'s falsification adds a second and expects the named test to go red. */
export const SSE_AUTH_MODES: readonly SseAuthMode[] = Object.freeze([AMBIENT_SESSION_AUTH_MODE]);

export function resolveSseAuthMode(): SseAuthMode {
  if (SSE_AUTH_MODES.length !== 1) {
    throw new Error(
      `studioSseTransport: SPK-02 defers the second auth mode; ${SSE_AUTH_MODES.length} are registered`,
    );
  }
  return SSE_AUTH_MODES[0];
}

/**
 * The subscription URL, from the one runtime configuration source the app already has.
 *
 * `APP_CONFIG.apiBaseUrl` resolves `window.__CHECKS_CONFIG__?.apiBaseUrl` first and build-time env
 * second, which is what lets the same bundle serve two production hosts. Nothing here reads
 * `window.location.origin`: the MFE and the API are deployed on **different** hosts
 * (`values-prod.yaml`), so the page's own origin is not the API's.
 *
 * No query string is composed at all. §5.5: *"No credential query parameters."*
 */
export function studioExecutionEventsUrl(executionId: string): string {
  const base = APP_CONFIG.apiBaseUrl.replace(/\/+$/, '');
  return `${base}/studio/executions/${encodeURIComponent(executionId)}/events`;
}

/**
 * The one place an `EventSource` is constructed.
 *
 * It is a named function rather than an inline `new` so that AC-9's falsification has somewhere to
 * land: replacing this body with a reader that awaits the whole response body before parsing is
 * what turns the incremental-delivery test red.
 */
export function createStudioEventSource(url: string, init: EventSourceInit): EventSource {
  const Impl = (globalThis as { EventSource?: typeof EventSource }).EventSource;
  if (typeof Impl !== 'function') {
    throw new Error(
      'studioSseTransport: this runtime provides no EventSource. ' +
        'In a browser it is a platform global; under test see vitest.config.ts and story 10.11b.',
    );
  }
  return new Impl(url, init);
}

/** The event name the API emits (§5.5). `message` is accepted too, for a server that omits it. */
export const SNAPSHOT_EVENT_NAME = 'execution.snapshot';

function statusOf(error: unknown): number | null {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === 'number' ? status : null;
}

export function createSseTransport(host: TransportHost): TransportImplementation {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failedAttempts = 0;
  let deliveredOnThisConnection = false;
  let stopped = false;
  let probing = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const dropSource = () => {
    if (source !== null) {
      source.onopen = null;
      source.onerror = null;
      source.close();
      source = null;
    }
  };

  const stop = () => {
    stopped = true;
    clearTimer();
    dropSource();
  };

  const onPayload = (data: string) => {
    if (stopped || host.isClosed()) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      // A frame we cannot parse is not a reason to tear the stream down; the next one repairs it,
      // because every frame is a whole current snapshot rather than a delta (§5.5 item 4).
      return;
    }
    deliveredOnThisConnection = true;
    // A connection that delivered is a working connection. Resetting here — rather than on `open` —
    // is what makes DA-3's deliberate bounded close a *normal* reconnect instead of an error that
    // consumes the budget, without also forgiving a socket that opens and immediately dies.
    failedAttempts = 0;
    host.deliver(parsed);
  };

  const connect = () => {
    if (stopped || host.isClosed()) {
      return;
    }
    deliveredOnThisConnection = false;
    host.phase(failedAttempts === 0 ? 'connecting' : 'reconnecting');
    const mode = resolveSseAuthMode();
    let opened: EventSource;
    try {
      opened = createStudioEventSource(studioExecutionEventsUrl(host.executionId), mode.init);
    } catch {
      failedAttempts += 1;
      scheduleRetryOrEscalate();
      return;
    }
    source = opened;
    opened.onopen = () => {
      if (!stopped && !host.isClosed()) {
        host.phase('live');
      }
    };
    const handler = (event: MessageEvent) => onPayload(String(event.data));
    opened.addEventListener(SNAPSHOT_EVENT_NAME, handler as EventListener);
    opened.addEventListener('message', handler as EventListener);
    opened.onerror = () => {
      if (stopped || host.isClosed() || source !== opened) {
        return;
      }
      dropSource();
      void diagnose();
    };
  };

  const scheduleRetryOrEscalate = () => {
    if (stopped || host.isClosed()) {
      return;
    }
    if (failedAttempts >= host.bounds.reconnectAttemptBound) {
      host.exhausted();
      return;
    }
    host.phase('reconnecting');
    clearTimer();
    timer = setTimeout(connect, host.bounds.reconnectDelayMs);
  };

  /**
   * The SSE assessment's own instruction: *"On native EventSource errors, use the normal GET
   * endpoint to distinguish auth failure, terminal completion, and transient disconnection."*
   *
   * It is deliberately the **ordinary authorized GET client** — the same `studioApi.getExecution`
   * the rest of the app uses — and not a second HTTP path, because a second path is a second set of
   * credentials, interceptors and failure semantics to keep in step.
   */
  const diagnose = async () => {
    if (probing || stopped || host.isClosed()) {
      return;
    }
    probing = true;
    try {
      const snapshot = await studioApi.getExecution(host.executionId);
      if (stopped || host.isClosed()) {
        return;
      }
      // Restores current state on the spot; the shared layer drops it if it is not newer.
      host.deliver(snapshot);
      if (host.isClosed()) {
        return;
      }
      if (!deliveredOnThisConnection) {
        failedAttempts += 1;
      }
      scheduleRetryOrEscalate();
    } catch (error) {
      if (stopped || host.isClosed()) {
        return;
      }
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        // Never fall back around a 401/403 (§5.5). Nothing is retried, on any path.
        host.denied(status);
        return;
      }
      failedAttempts += 1;
      scheduleRetryOrEscalate();
    } finally {
      probing = false;
    }
  };

  return {
    kind: 'sse',
    start: connect,
    close: stop,
  };
}
