// @vitest-environment node
import { DEV_TRANSPORT_SCENARIO } from '@/services/mocks/studio/executionScenarios';
import {
  startStudioTestServer,
  until,
  type StreamConnection,
  type StudioTestServer,
} from '@/test/studioStreamServer';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Story 10.11b — **AC-9**, the criterion the SSE assessment wrote in advance:
 *
 * > *"two timed snapshots must reach the browser separately before response closure"* … *"a
 * > buffered mock-controller response does not prove SSE delivery."*
 *
 * So this file has no mock in it. A real `node:http` server writes a real chunked
 * `text/event-stream`; the client is the **production** transport module, not a re-implementation
 * of its parser; and the second frame is written only after the first has been *observed on the
 * client*, because a frame written before the client connects is delivered to a fully buffering
 * client too — wave 5's standing rule, *make the mutation land inside the measurement window*.
 *
 * **Environment, measured rather than assumed (*Open questions* 1, DA-11).** jsdom 23.2.0 provides
 * no `EventSource`; Node v23.10.0 provides none by default either, but ships the platform one
 * behind `--experimental-eventsource`, which `vitest.config.ts` passes to this pool. The guard
 * below asserts the global's **presence on `globalThis`** — not `typeof` on a name this file could
 * itself shadow — and it **fails**; it never skips. A skip here would be a deferral whose gate
 * nobody can move, which is the one thing this story's own deferral rule forbids.
 */

const EXECUTION_ID = '44444444-4444-4444-4444-4444444444aa';

describe('AC-9 preconditions: the runtime this harness needs', () => {
  it('SCN-STREAM-TWO-FRAMES precondition: the platform provides a global EventSource', () => {
    expect(
      Object.prototype.hasOwnProperty.call(globalThis, 'EventSource') ||
        'EventSource' in globalThis,
      'this runtime provides no global EventSource; see vitest.config.ts and story 10.11b',
    ).toBe(true);
    expect(typeof (globalThis as { EventSource?: unknown }).EventSource).toBe('function');
  });

  it('records the Node major actually used, as a measurement', () => {
    // Not an assertion about which Node is correct — @po asked for the number to be recorded
    // because the repository declares no `engines` field and carries no CI workflow.
    expect(process.version).toMatch(/^v\d+\./);
  });
});

async function loadTransport(baseUrl: string) {
  process.env.REACT_APP_API_BASE_URL = baseUrl;
  vi.resetModules();
  return import('./studioTransportWiring');
}

let server: StudioTestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
  delete process.env.REACT_APP_API_BASE_URL;
});

describe('AC-9: two snapshots reach the surface as two separate updates, before the response closes', () => {
  it('SCN-STREAM-TWO-FRAMES: frame 1 is surfaced while the response is still open, and frame 2 is written only after that', async () => {
    let connection: StreamConnection | null = null;
    server = await startStudioTestServer({
      onStream: (open) => {
        connection = open;
      },
    });

    const { subscribeToExecution } = await loadTransport(server.baseUrl);

    const surfaced: ExecutionSnapshot[] = [];
    /** The server-side truth at the instant the client surfaced each frame. */
    const openWhenSurfaced: boolean[] = [];
    /** The observation/write interleaving, recorded from the two sides as it happens. */
    const order: string[] = [];

    const subscription = subscribeToExecution(EXECUTION_ID, {
      onSnapshot: (snapshot) => {
        surfaced.push(snapshot);
        openWhenSurfaced.push(connection !== null && !connection.finished);
        order.push(`surfaced:${snapshot.revision}`);
      },
    });

    try {
      await until(() => connection !== null, 'the stream connection to be accepted');
      const open = connection as unknown as StreamConnection;

      order.push('wrote:1');
      open.write(DEV_TRANSPORT_SCENARIO[1], { id: DEV_TRANSPORT_SCENARIO[1].revision });

      // The measurement window. Frame 2 does not exist on the wire until frame 1 has been seen.
      await until(() => surfaced.length === 1, 'frame 1 to be surfaced by the production transport');

      expect(open.finished, 'the response must still be open when frame 1 is surfaced').toBe(false);

      order.push('wrote:2');
      open.write(DEV_TRANSPORT_SCENARIO[2], { id: DEV_TRANSPORT_SCENARIO[2].revision });

      await until(() => surfaced.length === 2, 'frame 2 to be surfaced as a second update');

      expect(open.finished, 'the response must still be open when frame 2 is surfaced').toBe(false);

      // Two separate updates, not one batch.
      expect(surfaced.map((s) => s.revision)).toEqual([
        DEV_TRANSPORT_SCENARIO[1].revision,
        DEV_TRANSPORT_SCENARIO[2].revision,
      ]);
      expect(surfaced[0]).not.toEqual(surfaced[1]);
      expect(openWhenSurfaced, 'both frames surfaced before the response closed').toEqual([
        true,
        true,
      ]);

      // The ordering guard. Frame 2's *write* must come after frame 1's *observation*, so a
      // buffering client cannot satisfy this test by receiving both at the end.
      expect(order).toEqual(['wrote:1', 'surfaced:2', 'wrote:2', 'surfaced:3']);
      expect(order.indexOf('wrote:2')).toBeGreaterThan(order.indexOf('surfaced:2'));

      open.end();
      await until(() => open.finished, 'the response to end');
    } finally {
      subscription.close();
    }
  });

  it('SCN-STREAM-TWO-FRAMES: the run is watched over exactly one connection while it is healthy', async () => {
    let connection: StreamConnection | null = null;
    server = await startStudioTestServer({
      onStream: (open) => {
        connection = open;
      },
    });
    const { subscribeToExecution } = await loadTransport(server.baseUrl);
    const surfaced: ExecutionSnapshot[] = [];
    const subscription = subscribeToExecution(EXECUTION_ID, {
      onSnapshot: (snapshot) => surfaced.push(snapshot),
    });
    try {
      await until(() => connection !== null, 'the stream connection');
      const open = connection as unknown as StreamConnection;
      for (const frame of DEV_TRANSPORT_SCENARIO.slice(0, 4)) {
        open.write(frame, { id: frame.revision });
        // eslint-disable-next-line no-await-in-loop
        await until(() => surfaced.some((s) => s.revision === frame.revision), `frame ${frame.revision}`);
      }
      expect(server.streamsOpened).toBe(1);
      // AC-8's property at the transport level: a healthy stream reads no snapshot route at all.
      expect(server.snapshotRequests()).toHaveLength(0);
    } finally {
      subscription.close();
    }
  });
});

describe('AC-14(i) and AC-20(a): the request line, observed at the server', () => {
  it('SCN-TWO-CONFIGURED-BASES: the subscription URL comes from the configured API base, for two different bases, and carries no credential', async () => {
    const seen: string[] = [];

    for (let round = 0; round < 2; round += 1) {
      let connection: StreamConnection | null = null;
      // eslint-disable-next-line no-await-in-loop
      const current = await startStudioTestServer({
        onStream: (open) => {
          connection = open;
        },
      });
      server = current;
      // eslint-disable-next-line no-await-in-loop
      const { subscribeToExecution } = await loadTransport(current.baseUrl);
      const subscription = subscribeToExecution(EXECUTION_ID, {});
      try {
        // eslint-disable-next-line no-await-in-loop
        await until(() => connection !== null, 'the stream connection');
        const [request] = current.streamRequests();
        expect(request).toBeDefined();
        expect(request.path).toBe(`/api/v1/studio/executions/${EXECUTION_ID}/events`);

        // No credential in the URL. §5.5: *"No credential query parameters."*
        expect(request.query, 'the request line carries a query string').toBe('');
        expect(request.url).not.toMatch(/token|key|session|ticket|auth|credential|jwt|bearer/i);

        // And no header-borne credential either: SPK-02 defers the header client, so the only
        // credential this transport may carry is the ambient one.
        expect(request.headers.authorization).toBeUndefined();
        expect(request.headers['x-api-key']).toBeUndefined();

        // It is an event stream the client asked for, on a real connection.
        expect(String(request.headers.accept ?? '')).toContain('text/event-stream');

        seen.push(current.origin);
      } finally {
        subscription.close();
        // eslint-disable-next-line no-await-in-loop
        await current.close();
        server = null;
      }
    }

    // Two genuinely different configured bases were exercised; nothing was assumed about the
    // page's own origin, which in production is a different host from the API's.
    expect(seen[0]).not.toBe(seen[1]);
  });
});

describe('AC-15(a): one auth mode, one implementation, and no header client', () => {
  it('SCN-STREAM-TWO-FRAMES: SSE_AUTH_MODES is the only implementation of the auth seam, and it attaches no header', async () => {
    let connection: StreamConnection | null = null;
    server = await startStudioTestServer({
      onStream: (open) => {
        connection = open;
      },
    });
    const wiring = await loadTransport(server.baseUrl);
    const sse = await import('./studioSseTransport');

    // The production symbol the name refers to. Adding a second mode fails here.
    expect(sse.SSE_AUTH_MODES).toHaveLength(1);
    expect(sse.resolveSseAuthMode().id).toBe('ambient-session-credentials');
    expect(sse.resolveSseAuthMode().init).toEqual({ withCredentials: true });
    // Ambient means ambient: the mode contributes no header of any kind, because `EventSource`
    // cannot carry one and SPK-02 defers the client that could.
    expect(Object.keys(sse.resolveSseAuthMode().init)).toEqual(['withCredentials']);

    const subscription = wiring.subscribeToExecution(EXECUTION_ID, {});
    try {
      await until(() => connection !== null, 'the stream connection');
      const [request] = server.streamRequests();
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers['proxy-authorization']).toBeUndefined();
    } finally {
      subscription.close();
    }
  });
});

describe('AC-14(ii): the shared Axios per-request timeout does not govern the stream', () => {
  it('SCN-IDLE-SURVIVES-CLIENT-TIMEOUT: a stream idle for longer than the shared client timeout still delivers a later snapshot, on the same connection', async () => {
    let connection: StreamConnection | null = null;
    server = await startStudioTestServer({
      onStream: (open) => {
        connection = open;
      },
      onSnapshot: () => ({ status: 500, body: { error: 'UNEXPECTED', message: 'no probe expected' } }),
    });

    const { subscribeToExecution } = await loadTransport(server.baseUrl);
    const { default: apiClient } = await import('./apiClient');

    // The scale. **This is not 30 seconds and the criterion says so**: what it proves is that the
    // transport does not abort on *an* idle gap longer than the shared client's own per-request
    // ceiling. The ceiling that actually matters is the ingress's, which is ED-06's and is
    // recorded as blocked, not approximated here.
    const clientTimeoutMs = 120;
    apiClient.setTimeout(clientTimeoutMs);

    const surfaced: ExecutionSnapshot[] = [];
    const subscription = subscribeToExecution(EXECUTION_ID, {
      onSnapshot: (snapshot) => surfaced.push(snapshot),
    });

    try {
      await until(() => connection !== null, 'the stream connection');
      const open = connection as unknown as StreamConnection;
      open.write(DEV_TRANSPORT_SCENARIO[1], { id: DEV_TRANSPORT_SCENARIO[1].revision });
      await until(() => surfaced.length === 1, 'the first frame');

      const idleStartedAt = Date.now();
      const idleForMs = clientTimeoutMs * 4;
      while (Date.now() - idleStartedAt < idleForMs) {
        open.comment('heartbeat');
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, clientTimeoutMs / 3));
      }
      expect(Date.now() - idleStartedAt).toBeGreaterThan(clientTimeoutMs);

      open.write(DEV_TRANSPORT_SCENARIO[2], { id: DEV_TRANSPORT_SCENARIO[2].revision });
      await until(() => surfaced.length === 2, 'a snapshot after the idle gap');

      // The same connection survived; nothing reconnected and nothing fell back, which is what
      // distinguishes "the timeout did not govern it" from "it recovered afterwards".
      expect(server.streamsOpened).toBe(1);
      expect(server.snapshotRequests()).toHaveLength(0);
      expect(open.finished).toBe(false);
    } finally {
      subscription.close();
      apiClient.setTimeout(30000);
    }
  }, 20000);
});
