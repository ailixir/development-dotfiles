// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import type { ReactElement } from 'react';
import {
  startStudioTestServer,
  until,
  type RecordedRequest,
  type StreamConnection,
  type StudioTestServer,
} from '@/test/studioStreamServer';
import type { TestDto } from '@/types/studio/studioTypes';
import { mockTests } from '@/services/mocks/studio/fixtures';
import { DEV_TRANSPORT_SCENARIO } from '@/services/mocks/studio/executionScenarios';
import { uiTestEditorPath } from '@/components/studio/uiTestPaths';

/**
 * Story 10.11b — **AC-7**, **AC-8** and the surface half of **AC-13**, asserted against the real
 * page and a real server.
 *
 * This file runs in the `forks` pool (see `vitest.config.ts`) so that the jsdom document and the
 * platform `EventSource` are both available: the page is driven end to end through the production
 * transport, over a socket, and every count below is read from the server rather than from a spy.
 */

// jsdom implements no layout, so it ships no `scrollIntoView`. The onboarding coach calls it on
// mount. Stubbed here rather than in the shared setup, so no other suite's behaviour moves.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

/**
 * A test-environment interop shim, and it is worth naming precisely so nobody reads it as a
 * product concern.
 *
 * A browser has exactly one `Event` class. This process has two: jsdom's, which vitest installs on
 * `globalThis`, and Node's, which Node's own `EventSource` validates against when it dispatches
 * `open`/`error`. Constructed from the first and dispatched into the second, the call throws
 * *"The 'event' argument must be an instance of Event. Received an instance of Event"*. Restoring
 * Node's class on `globalThis` (and only there — `window.Event` is untouched, so jsdom's own
 * dispatching is unaffected) makes the two agree. Nothing here can mask a product defect: in a
 * browser the two classes are the same object and this code path does not exist.
 */
beforeAll(async () => {
  const { port1, port2 } = new MessageChannel();
  const delivered = await new Promise<{ constructor: new (type: string) => unknown }>(
    (resolve) => {
      port1.on('message', () => undefined);
      (port1 as unknown as { onmessage: (event: unknown) => void }).onmessage = (event) =>
        resolve(event as { constructor: new (type: string) => unknown });
      port2.postMessage('capture');
    },
  );
  port1.close();
  port2.close();
  const nodeEvent = Object.getPrototypeOf(delivered.constructor);
  if (typeof nodeEvent === 'function' && nodeEvent !== (globalThis as { Event?: unknown }).Event) {
    (globalThis as { Event?: unknown }).Event = nodeEvent;
  }
});

const EXECUTION_ID = '44444444-4444-4444-4444-4444444444aa';
const SECOND_EXECUTION_ID = '44444444-4444-4444-4444-4444444444ab';

const draftA: TestDto = { ...mockTests[0], readiness: 'READY' };
const draftB: TestDto = {
  ...mockTests[0],
  id: '11111111-1111-1111-1111-11111111bbbb',
  name: 'A second draft',
  // Deliberately a different length and different text from draftA's three steps, so that a
  // selection snapping from one to the other is visible on the surface rather than inferred.
  steps: ['Go to "https://example.invalid/only-step"'],
  readiness: 'READY',
};

/** What `GET /studio/tests` currently lists. Mutable, so a reload can change it mid-test. */
let listedDrafts: TestDto[] = [draftA, draftB];

let server: StudioTestServer | null = null;
let connections: StreamConnection[] = [];
let executeCount = 0;

function api(): StudioTestServer {
  if (server === null) {
    throw new Error('the test server is not running');
  }
  return server;
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
  return true;
}

async function startServer(): Promise<StudioTestServer> {
  connections = [];
  executeCount = 0;
  listedDrafts = [draftA, draftB];
  return startStudioTestServer({
    onStream: (open) => connections.push(open),
    // Reaching this at all is a defect for AC-8: a healthy stream reads no snapshot route.
    onSnapshot: () => ({ status: 200, body: DEV_TRANSPORT_SCENARIO[1] }),
    onOther: (request: RecordedRequest, res) => {
      if (request.method === 'GET' && request.path === '/api/v1/studio/tests') {
        return json(res, 200, {
          data: listedDrafts,
          page: 0,
          size: 20,
          totalElements: listedDrafts.length,
          totalPages: 1,
        });
      }
      const single = /^\/api\/v1\/studio\/tests\/([^/]+)$/.exec(request.path);
      if (request.method === 'GET' && single) {
        return json(res, 200, single[1] === draftB.id ? draftB : draftA);
      }
      const execute = /^\/api\/v1\/studio\/tests\/([^/]+)\/execute$/.exec(request.path);
      if (request.method === 'POST' && execute) {
        executeCount += 1;
        return json(res, 202, {
          executionId: execute[1] === draftB.id ? SECOND_EXECUTION_ID : EXECUTION_ID,
          status: 'PENDING',
        });
      }
      return false;
    },
  });
}

/**
 * Everything is imported after `vi.resetModules()` so the page, React, Redux and Testing Library
 * all come from one module registry and `APP_CONFIG` has already read the server's base URL.
 */
async function loadApp(baseUrl: string) {
  process.env.REACT_APP_API_BASE_URL = baseUrl;
  vi.resetModules();
  const rtl = await import('@testing-library/react');
  const React = await import('react');
  const { Provider } = await import('react-redux');
  const { MemoryRouter, Route, Routes, useNavigate } = await import('react-router-dom');
  const { store } = await import('@/store');
  const { default: ChecksStudioPage } = await import('./ChecksStudioPage');
  // The editor's route pattern comes from the shared helper; its module is read after the reset like the rest.
  const { STUDIO_EDITOR_ROUTE } = await import('@/test/renderStudioAt');
  const transport = await import('@/services/api/studioTransportWiring');

  /**
   * A handle on the router's own `navigate`, so a test can change the selected draft **without**
   * unmounting the page. That distinction is the whole of AC-13's scenario-switch clause: an
   * unmount would be closed by the unmount cleanup, and a guard that cannot tell the two apart is
   * satisfied by an implementation with no scenario-switch cleanup at all.
   */
  const nav: { go: ((to: string) => void) | null } = { go: null };
  const NavHandle = () => {
    nav.go = useNavigate();
    return null;
  };

  const renderAt = (path: string) =>
    rtl.render(
      React.createElement(
        Provider as unknown as React.FunctionComponent<{ store: unknown }>,
        { store },
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(NavHandle),
          React.createElement(
            Routes,
            null,
            React.createElement(Route, {
              path: STUDIO_EDITOR_ROUTE,
              element: React.createElement(ChecksStudioPage) as ReactElement,
            }),
          ),
        ),
      ) as ReactElement,
    );

  return { rtl, renderAt, transport, nav };
}

beforeEach(async () => {
  window.localStorage.clear();
  server = await startServer();
});

afterEach(async () => {
  await server?.close();
  server = null;
  delete process.env.REACT_APP_API_BASE_URL;
});

async function runTheTest(rtl: Awaited<ReturnType<typeof loadApp>>['rtl']) {
  const run = await rtl.screen.findByRole('button', { name: /run test/i }, { timeout: 10000 });
  await until(() => !(run as HTMLButtonElement).disabled, 'the Run control to become available');
  await rtl.act(async () => {
    run.click();
  });
}

describe('AC-7: all progress reaches the screen through one transport abstraction', () => {
  it('SCN-DEV-TRANSPORT: with an implementation that emits nothing substituted at the seam, the surface shows no progress and no execution snapshot is read', async () => {
    const { rtl, renderAt, transport } = await loadApp(api().baseUrl);

    // An implementation that emits nothing. If the component held a *second* source — a surviving
    // interval, a direct fetch, an apiClient call — progress would still appear and this test would
    // be green, which is what makes the substitution discriminating rather than decorative.
    let started = 0;
    transport.setExecutionTransportSeam({
      primary: () => ({
        kind: 'sse',
        start() {
          started += 1;
        },
        close() {},
      }),
      fallback: null,
    });

    try {
      renderAt(uiTestEditorPath(draftA.id));
      await runTheTest(rtl);

      await until(() => started === 1, 'the substituted transport to be started');
      // The dwell is longer than the 700 ms interval this story removed, **on purpose**. A shorter
      // one lets a restored poller sit inside the gap between ticks and never fire, which is wave
      // 5's standing rule — *make the mutation land inside the measurement window*. Measured: with
      // a 400 ms dwell the falsification M3 stayed green, which is how this number was chosen.
      await new Promise((resolve) => setTimeout(resolve, 1600));

      // No progress reached the surface from anywhere else.
      expect(rtl.screen.queryByText(/Browser started/i)).toBeNull();
      expect(rtl.screen.queryByText(/Navigated to the pilot application/i)).toBeNull();

      // And nothing read the execution by any other route.
      expect(api().snapshotRequests()).toHaveLength(0);
      expect(api().streamsOpened).toBe(0);
      expect(executeCount).toBe(1);
    } finally {
      transport.resetExecutionTransportSeam();
      rtl.cleanup();
    }
  }, 40000);
});

describe('AC-8: the 700 ms polling loop is gone as the primary path', () => {
  it('SCN-DEV-TRANSPORT: a full healthy run produces progress on the surface and zero GET /executions/{id} requests', async () => {
    const { rtl, renderAt, transport } = await loadApp(api().baseUrl);
    try {
      renderAt(uiTestEditorPath(draftA.id));
      await runTheTest(rtl);

      await until(() => connections.length === 1, 'the stream connection', 15000);
      for (const frame of DEV_TRANSPORT_SCENARIO.slice(1, -1)) {
        // eslint-disable-next-line no-await-in-loop
        await rtl.act(async () => {
          connections[0].write(frame, { id: frame.revision });
          await new Promise((resolve) => setTimeout(resolve, 60));
        });
      }
      // A deliberate dwell with the stream open and the run unfinished, longer than the 700 ms
      // interval this story removed. Without it the whole run fits between two ticks of a restored
      // poller and the falsification passes for the wrong reason.
      await rtl.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1600));
      });
      const last = DEV_TRANSPORT_SCENARIO[DEV_TRANSPORT_SCENARIO.length - 1];
      await rtl.act(async () => {
        connections[0].write(last, { id: last.revision });
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      // Progress really did reach the screen over the stream.
      //
      // **Widened at the epic/EPIC-10 merge, and only in arity.** On `story/10.11b` alone this line
      // was `findByText`, because the only place a log narrative reached the DOM was the Live
      // Execution Logs list. 10.11a added `ExecutionProgressView`, which renders the same snapshot's
      // step narratives beside them, so the merged surface carries the text twice — `log-line-2` and
      // the step row — and the singular query throws *"Found multiple elements"* on a run that
      // succeeded. Both nodes are fed by this stream and by nothing else, so the property is
      // unchanged: zero matches is still red, which is what this assertion exists to catch.
      const onScreen = await rtl.screen.findAllByText(/Waiting for "Welcome"/i, undefined, {
        timeout: 10000,
      });
      expect(onScreen.length).toBeGreaterThan(0);

      // The whole point: **zero** snapshot reads for a full run. Asserted on observed requests,
      // not on the absence of a timer — a timer can be renamed and a request cannot be disguised.
      expect(api().snapshotRequests()).toHaveLength(0);

      // And the stream closed itself when the server said evidence had settled.
      await until(
        () => api().streamsOpened - api().streamsClosed === 0,
        'the stream to close on streamComplete',
      );
      expect(executeCount).toBe(1);
    } finally {
      transport.resetExecutionTransportSeam();
      rtl.cleanup();
    }
  }, 40000);
});

describe('AC-13: no subscription accumulates', () => {
  it('SCN-TERMINAL-EVIDENCE-SETTLED: across three mount/unmount cycles the server’s open connection count returns to zero', async () => {
    const { rtl, renderAt } = await loadApp(api().baseUrl);
    try {
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const view = renderAt(uiTestEditorPath(draftA.id));
        // eslint-disable-next-line no-await-in-loop
        await runTheTest(rtl);
        // eslint-disable-next-line no-await-in-loop
        await until(() => connections.length === cycle + 1, `connection ${cycle + 1}`, 15000);
        // eslint-disable-next-line no-await-in-loop
        await rtl.act(async () => {
          connections[cycle].write(DEV_TRANSPORT_SCENARIO[1], {
            id: DEV_TRANSPORT_SCENARIO[1].revision,
          });
          await new Promise((resolve) => setTimeout(resolve, 60));
        });
        // Unmount **while the stream is open**.
        expect(api().streamsOpened - api().streamsClosed).toBe(1);
        view.unmount();
        // eslint-disable-next-line no-await-in-loop
        await until(
          () => api().streamsOpened - api().streamsClosed === 0,
          `the stream from cycle ${cycle + 1} to be closed at the server`,
        );
      }
      expect(api().streamsOpened).toBe(3);
      expect(api().streamsOpened - api().streamsClosed).toBe(0);
    } finally {
      rtl.cleanup();
    }
  }, 60000);

  it('SCN-TERMINAL-EVIDENCE-SETTLED: a scenario switch performed while a stream is open leaves no connection behind', async () => {
    const { rtl, renderAt, nav } = await loadApp(api().baseUrl);
    try {
      const view = renderAt(uiTestEditorPath(draftA.id));
      await runTheTest(rtl);
      await until(() => connections.length === 1, 'the stream connection', 15000);
      await rtl.act(async () => {
        connections[0].write(DEV_TRANSPORT_SCENARIO[1], {
          id: DEV_TRANSPORT_SCENARIO[1].revision,
        });
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      // The stream is open at the moment of the switch. That ordering is the whole criterion: a
      // switch performed after the stream had already finished would leave a cleanup-free
      // implementation green.
      expect(api().streamsOpened - api().streamsClosed).toBe(1);

      // The switch itself: the same page instance, a different draft. Nothing unmounts, so the
      // unmount cleanup cannot be what closes the connection.
      const before = api().streamsClosed;
      await rtl.act(async () => {
        nav.go?.(uiTestEditorPath(draftB.id));
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      await until(
        () => api().streamsOpened - api().streamsClosed === 0,
        'the pre-switch stream to be closed at the server',
      );
      expect(api().streamsClosed).toBe(before + 1);
      expect(api().streamsOpened - api().streamsClosed).toBe(0);
      // The page is still mounted: this really was a switch and not a remount.
      expect(rtl.screen.queryByRole('button', { name: /run test/i })).not.toBeNull();
      view.unmount();
    } finally {
      rtl.cleanup();
    }
  }, 60000);
});

describe('SCEN-1 (@qa gate): the route effect is a change detector, not a difference detector', () => {
  it('SCN-TERMINAL-EVIDENCE-SETTLED: a selection set while the route stands still is not snapped back, and its steps survive', async () => {
    // The state this reproduces is **exactly** the create-scenario state @qa filed: the selection
    // holds one draft that the list carries, the route holds a *different* draft that the list also
    // carries, and nothing navigated. `handleCreateNewScenario` produces it by setting
    // `selectedScenario` to the new id while the route keeps the old one; here the reload control
    // produces it by bringing the route's draft into a list that did not have it. Same predicate
    // inputs, and this one is reachable from the rendered surface — the create dialog is not:
    // `setShowNewScenarioDialog(true)` has no call site in the page.
    listedDrafts = [draftA];
    const { rtl, renderAt } = await loadApp(api().baseUrl);
    try {
      renderAt(uiTestEditorPath(draftB.id));

      // The route names draftB, but the list does not carry it, so the page settles on draftA.
      await rtl.screen.findByRole('heading', { level: 1, name: draftA.name }, { timeout: 10000 });
      await rtl.screen.findByText(`Test Steps (${draftA.steps.length})`, undefined, {
        timeout: 10000,
      });

      // The list changes beneath a route that has not moved.
      listedDrafts = [draftA, draftB];
      const reload = await rtl.screen.findByRole('button', { name: /refresh test information/i });
      await rtl.act(async () => {
        reload.click();
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      await until(
        () => api().countOf('GET', '/api/v1/studio/tests') >= 2,
        'the reload to be observed at the server',
      );
      await rtl.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });

      // Nothing snapped. The selection and the authored steps are the ones the user was looking at.
      expect(rtl.screen.queryByText(draftB.name)).toBeNull();
      expect(rtl.screen.queryByRole('heading', { level: 1, name: draftA.name })).not.toBeNull();
      expect(
        rtl.screen.queryByText(`Test Steps (${draftA.steps.length})`),
        'the step list was overwritten by the route’s draft',
      ).not.toBeNull();
      expect(rtl.screen.queryByText(`Test Steps (${draftB.steps.length})`)).toBeNull();
    } finally {
      rtl.cleanup();
    }
  }, 60000);
});
