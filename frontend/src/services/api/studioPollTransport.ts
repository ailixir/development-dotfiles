import studioApi from './studioApi';
import type {
  TransportHost,
  TransportImplementation,
} from './studioExecutionTransport';

/**
 * Story 10.11b — the bounded GET fallback, as a **first-class transport** rather than a `catch`
 * block inside the streaming one.
 *
 * `ED-06`'s gate note requires that *"a demonstrated gateway incompatibility uses GET fallback
 * without changing the execution contract"*, and Studio architecture §5.5 designates
 * `GET /executions/{id}` as SSE's recovery and fallback path carrying the same payload. So this
 * implements the same {@link TransportImplementation} interface as the streaming one, is selected
 * through the same seam, and inherits the ordering and close rules from the shared layer rather
 * than restating them — which is what AC-16 re-runs the ordering and lifecycle assertions through
 * this path to prove.
 *
 * It reads through `studioApi.getExecution`, the **ordinary authorized GET client**. Not a second
 * HTTP path: a second path is a second set of credentials, interceptors and failure semantics.
 */

function statusOf(error: unknown): number | null {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === 'number' ? status : null;
}

export function createPollTransport(host: TransportHost): TransportImplementation {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let inFlight = false;
  let consecutiveFailures = 0;
  let startedAt = 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const stop = () => {
    stopped = true;
    clearTimer();
  };

  const schedule = () => {
    if (stopped || host.isClosed()) {
      return;
    }
    if (Date.now() - startedAt >= host.bounds.pollTotalBoundMs) {
      // The stated total bound. A fallback that polls forever is the defect this replaces.
      host.exhausted();
      return;
    }
    clearTimer();
    timer = setTimeout(read, host.bounds.pollIntervalMs);
  };

  const read = async () => {
    if (stopped || host.isClosed() || inFlight) {
      return;
    }
    inFlight = true;
    try {
      const snapshot = await studioApi.getExecution(host.executionId);
      if (stopped || host.isClosed()) {
        return;
      }
      consecutiveFailures = 0;
      host.deliver(snapshot);
      if (host.isClosed()) {
        // The shared layer closed us on `streamComplete`. Nothing further is read.
        return;
      }
      host.phase('live');
      schedule();
    } catch (error) {
      if (stopped || host.isClosed()) {
        return;
      }
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        // §5.5: *"Never fall back around a 401/403."* The denial can arrive here, during the
        // fallback, as easily as before it — and this is the branch in which a client otherwise
        // keeps hammering a route it has already been told it may not read.
        host.denied(status);
        return;
      }
      consecutiveFailures += 1;
      if (consecutiveFailures >= host.bounds.pollFailureBound) {
        host.exhausted();
        return;
      }
      host.phase('reconnecting');
      schedule();
    } finally {
      inFlight = false;
    }
  };

  return {
    kind: 'poll',
    start() {
      startedAt = Date.now();
      host.phase('connecting');
      void read();
    },
    close: stop,
  };
}
