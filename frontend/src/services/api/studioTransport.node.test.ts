// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startStudioTestServer,
  until,
  type StreamConnection,
  type StudioTestServer,
} from '@/test/studioStreamServer';
import type { ExecutionSnapshot, ExecutionStatus } from '@/types/studio/studioTypes';
import {
  REVISION_ORDERING_SEQUENCE,
  REVISION_ORDERING_SEQUENCE_FLATTENED,
  TERMINAL_EVIDENCE_FAILED,
  TERMINAL_EVIDENCE_PROCESSING,
  TERMINAL_EVIDENCE_SETTLED,
  DEV_TRANSPORT_SCENARIO,
} from '@/services/mocks/studio/executionScenarios';

/**
 * Story 10.11b — the transport's behavioural rules, every one of them asserted against a **real**
 * `node:http` server: revision ordering (AC-10), reconnect (AC-11), the bounded reconnect / bounded
 * GET fallback and the `401`/`403` stop including mid-fallback (AC-12), the stream lifecycle and
 * connection accounting (AC-13), and the fallback promoted to primary (AC-16).
 *
 * Connections are counted at the server — opened minus closed — and never by asserting that a
 * cleanup callback was invoked. A cleanup callback that runs while the socket stays open is exactly
 * the defect AC-13 exists to catch.
 */

const EXECUTION_ID = '44444444-4444-4444-4444-4444444444aa';

/** Scaled bounds. The product numbers live in `DEFAULT_TRANSPORT_BOUNDS`. */
const FAST = {
  reconnectDelayMs: 20,
  reconnectAttemptBound: 3,
  pollIntervalMs: 20,
  pollTotalBoundMs: 5000,
  pollFailureBound: 3,
};

let server: StudioTestServer | null = null;

/** The running server, or a loud failure. Keeps every assertion below narrowing-free. */
function api(): StudioTestServer {
  if (server === null) {
    throw new Error('the test server is not running');
  }
  return server;
}

afterEach(async () => {
  await server?.close();
  server = null;
  delete process.env.REACT_APP_API_BASE_URL;
});

async function loadTransport(baseUrl: string) {
  process.env.REACT_APP_API_BASE_URL = baseUrl;
  vi.resetModules();
  return import('./studioTransportWiring');
}

/** The surface: the last snapshot the subscription actually handed over, and nothing else. */
function surfaceOf(applied: ExecutionSnapshot[]): ExecutionSnapshot | null {
  return applied.length === 0 ? null : applied[applied.length - 1];
}

describe('AC-10: state is replaced by monotonic snapshot revision', () => {
  it('SCN-REVISION-OUT-OF-ORDER: an older revision and a duplicate are ignored, and the surface ends on rev 7', async () => {
    let connection: StreamConnection | null = null;
    server = await startStudioTestServer({ onStream: (open) => (connection = open) });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);

    const applied: ExecutionSnapshot[] = [];
    const subscription = subscribeToExecution(
      EXECUTION_ID,
      { onSnapshot: (snapshot) => applied.push(snapshot) },
      { bounds: FAST },
    );

    try {
      await until(() => connection !== null, 'the stream connection');
      const open = connection as unknown as StreamConnection;
      for (const frame of REVISION_ORDERING_SEQUENCE) {
        open.write(frame, { id: frame.revision });
      }
      // The two frames that should survive are rev 5 and rev 7; rev 6 and the repeat of 7 must not.
      await until(() => applied.length >= 2, 'rev 5 and rev 7 to be applied');
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(applied.map((snapshot) => snapshot.revision)).toEqual([5, 7]);

      const seven = REVISION_ORDERING_SEQUENCE[1];
      const surface = surfaceOf(applied);
      expect(surface).not.toBeNull();
      // Field by field on the surface, not on a store.
      expect(surface?.revision).toBe(seven.revision);
      expect(surface?.status).toBe(seven.status);
      expect(surface?.stepResults).toEqual(seven.stepResults);
      expect(surface?.logs).toEqual(seven.logs);
      expect(surface).toEqual(seven);
    } finally {
      subscription.close();
    }
  });

  it('SCN-REVISION-FLATTENED: the negative control — the flattened fixture cannot detect a missing ordering rule, which is why the real one is not flat', () => {
    // Apply every frame blindly, as a client with no ordering rule would.
    const withoutRule = (frames: readonly ExecutionSnapshot[]) => frames[frames.length - 1];
    const lastOfOrdered = REVISION_ORDERING_SEQUENCE[1];

    // The real sequence: applying rev 6 blindly changes the screen, so the guard has something to
    // catch. (Rev 7 is re-sent last, so what makes the sequence discriminating is that rev 6's
    // content differs at all — it is the frame a missing rule would let through.)
    expect(REVISION_ORDERING_SEQUENCE[2].stepResults).not.toEqual(lastOfOrdered.stepResults);
    expect(REVISION_ORDERING_SEQUENCE[2].logs).not.toEqual(lastOfOrdered.logs);

    // The flattened sequence: rev 6 is indistinguishable from rev 7, so a client with no ordering
    // rule at all ends on the right screen and an ordering test over it is vacuous.
    expect(REVISION_ORDERING_SEQUENCE_FLATTENED[2].stepResults).toEqual(lastOfOrdered.stepResults);
    expect(REVISION_ORDERING_SEQUENCE_FLATTENED[2].logs).toEqual(lastOfOrdered.logs);
    expect(withoutRule(REVISION_ORDERING_SEQUENCE_FLATTENED)).toEqual(
      withoutRule(REVISION_ORDERING_SEQUENCE),
    );
  });
});

describe('AC-11: a reconnect restores current state and is labelled as transport', () => {
  it('SCN-RECONNECT-RESTORES: the drop is labelled as transport, the execution status is unchanged, the current snapshot replaces state, and nothing is re-executed', async () => {
    const running = DEV_TRANSPORT_SCENARIO[2];
    const afterReconnect = DEV_TRANSPORT_SCENARIO[3];
    const connections: StreamConnection[] = [];
    server = await startStudioTestServer({
      onStream: (open) => connections.push(open),
      // The probe that diagnoses the drop: the current snapshot, unchanged.
      onSnapshot: () => ({ status: 200, body: running }),
    });
    const { subscribeToExecution, TRANSPORT_PHASE_LABELS } = await loadTransport(api().baseUrl);

    const applied: ExecutionSnapshot[] = [];
    const phases: string[] = [];
    const labels: string[] = [];
    const subscription = subscribeToExecution(
      EXECUTION_ID,
      {
        onSnapshot: (snapshot) => applied.push(snapshot),
        onStatus: (status) => {
          phases.push(status.phase);
          labels.push(status.label);
        },
      },
      { bounds: FAST },
    );

    try {
      await until(() => connections.length === 1, 'the first connection');
      connections[0].write(running, { id: running.revision });
      await until(() => applied.length === 1, 'the first frame');
      const statusBeforeDrop = surfaceOf(applied)?.status;

      connections[0].destroy();

      await until(() => connections.length === 2, 'a second connection after the drop');

      // (i) The drop is labelled as transport, and the label is distinguishable from every
      // ExecutionStatus narrative — a dropped connection is not a failed test.
      expect(phases).toContain('reconnecting');
      const reconnecting = TRANSPORT_PHASE_LABELS.reconnecting;
      const executionStatuses: ExecutionStatus[] = [
        'PENDING',
        'RUNNING',
        'PASSED',
        'FAILED',
        'ERROR',
      ];
      for (const status of executionStatuses) {
        expect(reconnecting.toUpperCase()).not.toBe(status);
        expect(
          new RegExp(`\\b${status}\\b`, 'i').test(reconnecting),
          `the reconnecting label must not read as ${status}`,
        ).toBe(false);
      }
      expect(labels).toContain(reconnecting);

      // (ii) The rendered execution status did not move across the drop.
      expect(surfaceOf(applied)?.status).toBe(statusBeforeDrop);
      expect(applied.map((snapshot) => snapshot.revision)).toEqual([running.revision]);

      // (iii) On reconnect the full current snapshot replaces state. The client asked for no
      // replay: §5.5 promises current-state recovery, not a lossless event transcript.
      connections[1].write(afterReconnect, { id: afterReconnect.revision });
      await until(() => applied.length === 2, 'the restored snapshot');
      expect(surfaceOf(applied)).toEqual(afterReconnect);

      // (iv) Across the whole drop/reconnect cycle, nothing was dispatched or cancelled.
      expect(api().countOf('POST', '/execute')).toBe(0);
      expect(api().countOf('POST', '/cancel')).toBe(0);
      expect(api().countOf('DELETE', '/studio/executions')).toBe(0);
      expect(
        api().requests.filter((request) => request.method !== 'GET'),
        'the transport made a non-GET request',
      ).toEqual([]);
    } finally {
      subscription.close();
    }
  });
});

describe('AC-12: bounded reconnect, bounded GET fallback, and never around a 401/403', () => {
  it('SCN-DENY-401-STREAM: a 401 stops everything and nothing further is requested', async () => {
    server = await startStudioTestServer({
      refuseStream: () => 401,
      onSnapshot: () => ({ status: 401, body: { error: 'UNAUTHORIZED', message: 'no session' } }),
    });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);

    const denials: number[] = [];
    const closed: string[] = [];
    const subscription = subscribeToExecution(
      EXECUTION_ID,
      {
        onAccessDenied: ({ status }) => denials.push(status),
        onClosed: (reason) => closed.push(reason),
      },
      { bounds: FAST },
    );

    try {
      await until(() => denials.length === 1, 'the access denial');
      expect(denials).toEqual([401]);
      expect(closed).toEqual(['access-denied']);

      // The denial stopped it **there**, not eventually. Without this the test is satisfied by a
      // client that spends its whole reconnect bound, falls back, and is denied by the fallback —
      // which is the other guard's job and leaves this one asserting nothing. Measured: the
      // falsification M6 left this test green until these two lines were added.
      expect(api().streamRequests().length, 'the reconnect bound was spent on a denial').toBe(1);
      expect(api().snapshotRequests().length, 'the client fell back around a 401').toBe(1);

      const countAtDenial = api().requests.length;
      await new Promise((resolve) => setTimeout(resolve, FAST.reconnectDelayMs * 10));
      expect(
        api().requests.length,
        'requests continued after the route said the browser may not read it',
      ).toBe(countAtDenial);
    } finally {
      subscription.close();
    }
  });

  it('SCN-DENY-403-STREAM: a 403 on the events route stops everything', async () => {
    server = await startStudioTestServer({
      refuseStream: () => 403,
      onSnapshot: () => ({ status: 403, body: { error: 'FORBIDDEN', message: 'wrong CSI' } }),
    });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);

    const denials: number[] = [];
    const closed: string[] = [];
    const subscription = subscribeToExecution(
      EXECUTION_ID,
      {
        onAccessDenied: ({ status }) => denials.push(status),
        onClosed: (reason) => closed.push(reason),
      },
      { bounds: FAST },
    );

    try {
      await until(() => denials.length === 1, 'the access denial');
      expect(denials).toEqual([403]);
      expect(closed).toEqual(['access-denied']);
      const countAtDenial = api().requests.length;
      await new Promise((resolve) => setTimeout(resolve, FAST.reconnectDelayMs * 10));
      expect(api().requests.length).toBe(countAtDenial);
      // The bound was never spent: a denial is not a transient failure and does not fall back.
      expect(api().streamRequests().length).toBe(1);
    } finally {
      subscription.close();
    }
  });

  it('SCN-DENY-403-PROBE: a dropped stream whose diagnosing GET answers 403 stops everything', async () => {
    const connections: StreamConnection[] = [];
    server = await startStudioTestServer({
      onStream: (open) => connections.push(open),
      onSnapshot: () => ({ status: 403, body: { error: 'FORBIDDEN', message: 'wrong CSI' } }),
    });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);

    const denials: number[] = [];
    const subscription = subscribeToExecution(
      EXECUTION_ID,
      { onAccessDenied: ({ status }) => denials.push(status) },
      { bounds: FAST },
    );

    try {
      await until(() => connections.length === 1, 'the stream connection');
      connections[0].destroy();
      await until(() => denials.length === 1, 'the access denial');
      expect(denials).toEqual([403]);

      const countAtDenial = api().requests.length;
      await new Promise((resolve) => setTimeout(resolve, FAST.reconnectDelayMs * 10));
      expect(api().requests.length).toBe(countAtDenial);
      expect(api().streamsOpened).toBe(1);
    } finally {
      subscription.close();
    }
  });

  it('SCN-DENY-401-MID-FALLBACK: a transient failure engages the bounded fallback, and the fallback’s own GET answering 401 stops the polling', async () => {
    const running = DEV_TRANSPORT_SCENARIO[2];
    let snapshotStatus = 200;
    server = await startStudioTestServer({
      // The gateway refuses the event stream outright — ED-06's own fallback scenario.
      refuseStream: () => 502,
      onSnapshot: () =>
        snapshotStatus === 200
          ? { status: 200, body: running }
          : { status: 401, body: { error: 'UNAUTHORIZED', message: 'session expired' } },
    });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);

    const phases: string[] = [];
    const denials: number[] = [];
    const closed: string[] = [];
    const subscription = subscribeToExecution(
      EXECUTION_ID,
      {
        onStatus: (status) => phases.push(`${status.kind}:${status.phase}`),
        onAccessDenied: ({ status }) => denials.push(status),
        onClosed: (reason) => closed.push(reason),
      },
      { bounds: FAST },
    );

    try {
      // A **named bound** of stream attempts, then the fallback.
      await until(() => phases.includes('poll:falling-back'), 'the fallback to engage');
      expect(api().streamRequests().length).toBe(FAST.reconnectAttemptBound);

      await until(
        () => api().snapshotRequests().length >= 2,
        'the fallback to be polling at its stated cadence',
      );

      // Now the denial arrives **during** the fallback. A guard covering only the pre-fallback
      // denial and a guard covering only the transient path leave exactly this branch uncovered.
      snapshotStatus = 401;
      await until(() => denials.length === 1, 'the mid-fallback denial');
      expect(denials).toEqual([401]);
      expect(closed).toEqual(['access-denied']);

      const countAtDenial = api().requests.length;
      await new Promise((resolve) => setTimeout(resolve, FAST.pollIntervalMs * 15));
      expect(
        api().requests.length,
        'the fallback kept polling a route it had been told it may not read',
      ).toBe(countAtDenial);
    } finally {
      subscription.close();
    }
  }, 20000);

  it('SCN-DENY-401-MID-FALLBACK: the probe that distinguishes the three cases is the ordinary authorized GET client', async () => {
    const running = DEV_TRANSPORT_SCENARIO[2];
    server = await startStudioTestServer({
      refuseStream: () => 502,
      onSnapshot: () => ({ status: 200, body: running }),
    });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);
    const subscription = subscribeToExecution(EXECUTION_ID, {}, { bounds: FAST });
    try {
      await until(() => api().snapshotRequests().length >= 1, 'the diagnosing GET');
      const [probe] = api().snapshotRequests();
      // The same route, the same client, one HTTP path — not a second one with its own credentials.
      expect(probe.path).toBe(`/api/v1/studio/executions/${EXECUTION_ID}`);
      expect(probe.method).toBe('GET');
    } finally {
      subscription.close();
    }
  }, 20000);
});

describe('AC-13: the stream closes on streamComplete, and no subscription accumulates', () => {
  it('SCN-TERMINAL-EVIDENCE-PROCESSING: a terminal outcome whose evidence is still PROCESSING leaves the connection open', async () => {
    let connection: StreamConnection | null = null;
    server = await startStudioTestServer({ onStream: (open) => (connection = open) });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);

    const applied: ExecutionSnapshot[] = [];
    const closed: string[] = [];
    const subscription = subscribeToExecution(
      EXECUTION_ID,
      { onSnapshot: (snapshot) => applied.push(snapshot), onClosed: (reason) => closed.push(reason) },
      { bounds: FAST },
    );

    try {
      await until(() => connection !== null, 'the stream connection');
      const open = connection as unknown as StreamConnection;
      open.write(TERMINAL_EVIDENCE_PROCESSING, { id: TERMINAL_EVIDENCE_PROCESSING.revision });
      await until(() => applied.length === 1, 'the terminal frame');

      expect(surfaceOf(applied)?.status).toBe('FAILED');
      expect(surfaceOf(applied)?.video.status).toBe('PROCESSING');

      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(closed, 'a terminal status alone must not close the stream').toEqual([]);
      expect(open.finished).toBe(false);
      expect(api().streamsOpened - api().streamsClosed).toBe(1);

      // Evidence settles; only now does the stream close, and the last frame is rendered first.
      open.write(TERMINAL_EVIDENCE_SETTLED, { id: TERMINAL_EVIDENCE_SETTLED.revision });
      await until(() => applied.length === 2, 'the settled frame');
      expect(surfaceOf(applied)?.video.status).toBe('AVAILABLE');
      await until(() => closed.length === 1, 'the stream to close');
      expect(closed).toEqual(['stream-complete']);
      await until(() => api().streamsOpened - api().streamsClosed === 0, 'the socket to close');
    } finally {
      subscription.close();
    }
  });

  it('SCN-TERMINAL-EVIDENCE-FAILED: evidence failure settles the stream too, without touching the check outcome', async () => {
    let connection: StreamConnection | null = null;
    server = await startStudioTestServer({ onStream: (open) => (connection = open) });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);

    const applied: ExecutionSnapshot[] = [];
    const closed: string[] = [];
    const subscription = subscribeToExecution(
      EXECUTION_ID,
      { onSnapshot: (snapshot) => applied.push(snapshot), onClosed: (reason) => closed.push(reason) },
      { bounds: FAST },
    );

    try {
      await until(() => connection !== null, 'the stream connection');
      const open = connection as unknown as StreamConnection;
      open.write(TERMINAL_EVIDENCE_PROCESSING, { id: TERMINAL_EVIDENCE_PROCESSING.revision });
      await until(() => applied.length === 1, 'the terminal frame');
      open.write(TERMINAL_EVIDENCE_FAILED, { id: TERMINAL_EVIDENCE_FAILED.revision });
      await until(() => applied.length === 2, 'the evidence-failure frame');

      const surface = surfaceOf(applied);
      expect(surface?.video.status).toBe('FAILED');
      expect(surface?.video.error).toBe('The recording could not be uploaded');
      // The outcome is what it was. Evidence failing is not the check failing.
      expect(surface?.status).toBe(TERMINAL_EVIDENCE_PROCESSING.status);
      expect(surface).toEqual(TERMINAL_EVIDENCE_FAILED);

      await until(() => closed.length === 1, 'the stream to close');
      expect(closed).toEqual(['stream-complete']);
      await until(() => api().streamsOpened - api().streamsClosed === 0, 'the socket to close');
    } finally {
      subscription.close();
    }
  });

  it('SCN-TERMINAL-EVIDENCE-SETTLED: across repeated subscribe/close cycles the open connection count returns to zero', async () => {
    const connections: StreamConnection[] = [];
    server = await startStudioTestServer({ onStream: (open) => connections.push(open) });
    const { subscribeToExecution } = await loadTransport(api().baseUrl);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const applied: ExecutionSnapshot[] = [];
      const subscription = subscribeToExecution(
        EXECUTION_ID,
        { onSnapshot: (snapshot) => applied.push(snapshot) },
        { bounds: FAST },
      );
      // eslint-disable-next-line no-await-in-loop
      await until(() => connections.length === cycle + 1, `connection ${cycle + 1}`);
      connections[cycle].write(DEV_TRANSPORT_SCENARIO[2], { id: DEV_TRANSPORT_SCENARIO[2].revision });
      // eslint-disable-next-line no-await-in-loop
      await until(() => applied.length === 1, `frame on connection ${cycle + 1}`);
      subscription.close();
      // eslint-disable-next-line no-await-in-loop
      await until(
        () => api().streamsOpened === cycle + 1 && api().streamsClosed === cycle + 1,
        `connection ${cycle + 1} to be closed at the server`,
      );
    }

    expect(api().streamsOpened).toBe(3);
    expect(api().streamsOpened - api().streamsClosed).toBe(0);
  });
});

describe('AC-16: the GET fallback is a first-class transport selected through the seam', () => {
  it('SCN-FALLBACK-AS-PRIMARY: with the fallback as primary, revision ordering, the no-re-execute rule and the close rule all hold unchanged', async () => {
    let index = 0;
    const sequence: ExecutionSnapshot[] = [
      ...REVISION_ORDERING_SEQUENCE,
      TERMINAL_EVIDENCE_SETTLED,
    ];
    server = await startStudioTestServer({
      onSnapshot: () => {
        const body = sequence[Math.min(index, sequence.length - 1)];
        index += 1;
        return { status: 200, body };
      },
    });
    const wiring = await loadTransport(api().baseUrl);
    const { createPollTransport } = await import('./studioPollTransport');

    const applied: ExecutionSnapshot[] = [];
    const closed: string[] = [];
    const kinds: string[] = [];
    const subscription = wiring.subscribeToExecution(
      EXECUTION_ID,
      {
        onSnapshot: (snapshot) => applied.push(snapshot),
        onStatus: (status) => kinds.push(status.kind),
        onClosed: (reason) => closed.push(reason),
      },
      { bounds: FAST, seam: { primary: createPollTransport, fallback: null } },
    );

    try {
      await until(() => closed.length === 1, 'the fallback to close on streamComplete');

      // It really was the fallback, selected through the abstraction's own seam.
      expect(kinds).toContain('poll');
      expect(api().streamsOpened, 'no event stream was opened at all').toBe(0);

      // AC-10's rule, unchanged, through a transport that never touches the SSE implementation.
      expect(applied.map((snapshot) => snapshot.revision)).toEqual([5, 7, 12]);
      expect(applied[1]).toEqual(REVISION_ORDERING_SEQUENCE[1]);

      // AC-13's rule, unchanged.
      expect(closed).toEqual(['stream-complete']);
      const countAtClose = api().requests.length;
      await new Promise((resolve) => setTimeout(resolve, FAST.pollIntervalMs * 10));
      expect(api().requests.length, 'the fallback kept reading after streamComplete').toBe(
        countAtClose,
      );

      // AC-11's rule, unchanged: the transport dispatches nothing, ever.
      expect(api().requests.filter((request) => request.method !== 'GET')).toEqual([]);
    } finally {
      subscription.close();
    }
  }, 20000);
});
