import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import { createScriptedTransport } from '@/services/mocks/studio/executionScenarios';
import { resetExecutionTransportSeam, setExecutionTransportSeam } from '@/services/api/studioTransportWiring';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { RUN_NOT_FOUND_MESSAGE, RunDetailsDrawer } from './RunDetailsDrawer';

/**
 * The drawer can be bound to one test (`expectedTestId`): a list row, a read or a live snapshot that
 * belongs to another test shows the not-found state and none of that run's content.
 */

const STUDIO_BASE = '*/api/v1/studio';
const WAIT = { timeout: 10_000 } as const;
const OWN_TEST = passedExecution.testId;
const OTHER_TEST = 'f0000000-0000-0000-0000-00000000dead';

// The transport only passes snapshots whose video path is the subscribed run's own.
const videoPathOf = (executionId: string) => `/api/v1/studio/executions/${executionId}/video`;

const run = (executionId: string, overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot => ({
  ...passedExecution,
  executionId,
  testName: 'Checkout journey',
  ...overrides,
});

function serveRead(read: (id: string) => ExecutionSnapshot | undefined) {
  const reads: string[] = [];
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/executions/:id`, ({ params }) => {
      const id = String(params.id);
      reads.push(id);
      const result = read(id);
      return HttpResponse.json(result ?? { message: 'Not found' }, { status: result ? 200 : 404 });
    }),
  );
  return reads;
}

function renderDrawer(
  executionId: string,
  pageRuns: ExecutionSnapshot[],
  props: { expectedTestId?: string; onSnapshot?: (snapshot: ExecutionSnapshot) => void } = {},
) {
  return render(
    <MemoryRouter>
      <RunDetailsDrawer
        executionId={executionId}
        pageRuns={pageRuns}
        onClose={() => undefined}
        onNavigateRun={() => undefined}
        onCopyLink={() => undefined}
        testHref={(testId) => `/checks/ui-tests/${testId}/studio`}
        {...props}
      />
    </MemoryRouter>,
  );
}

const drawer = () => within(screen.getByTestId('run-details'));

function expectNoRunContent() {
  expect(screen.queryByTestId('run-details-title')).toBeNull();
  expect(screen.queryByTestId('step-text-0')).toBeNull();
  expect(screen.queryByTestId('video-evidence-player')).toBeNull();
  expect(screen.queryByRole('button', { name: /logs/i })).toBeNull();
  expect(screen.queryByTestId('run-details-status')).toBeNull();
}

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
  resetExecutionTransportSeam();
});
afterAll(() => studioMockServer.close());

describe('RunDetailsDrawer expectedTestId', { timeout: 20_000 }, () => {
  it('renders a list row of the expected test and makes no read', async () => {
    const own = run('e0000000-0000-0000-0000-000000000001');
    const reads = serveRead(() => undefined);
    renderDrawer(own.executionId, [own], { expectedTestId: OWN_TEST });

    expect(await screen.findByTestId('run-details-title')).toHaveTextContent('Checkout journey');
    expect(drawer().getByTestId('step-text-0')).toBeInTheDocument();
    expect(reads).toEqual([]);
  });

  it.each([
    ['AFTER_LEARN', 'After learning'],
    ['MANUAL', 'Manual'],
    ['SCHEDULED', 'Scheduled'],
  ] as const)('labels the origin of a %s run "%s"', async (triggerSource, label) => {
    const own = run('e0000000-0000-0000-0000-0000000000a1', { triggerSource });
    serveRead(() => undefined);
    renderDrawer(own.executionId, [own], { expectedTestId: OWN_TEST });

    expect(await screen.findByTestId('run-details-title')).toBeInTheDocument();
    expect(drawer().getByText(`Origin: ${label}`)).toBeInTheDocument();
  });

  it('shows not-found, and none of the run, when the list row belongs to another test', async () => {
    const foreign = run('e0000000-0000-0000-0000-000000000002', { testId: OTHER_TEST });
    const reads = serveRead(() => undefined);
    renderDrawer(foreign.executionId, [foreign], { expectedTestId: OWN_TEST });

    const notFound = await screen.findByTestId('run-details-not-found');
    expect(notFound).toHaveTextContent(RUN_NOT_FOUND_MESSAGE);
    expectNoRunContent();
    expect(screen.queryByTestId('run-details-loading')).toBeNull();
    expect(reads).toEqual([]);
  });

  it('shows not-found, and none of the run, when the read answers a run of another test', async () => {
    const foreign = run('e0000000-0000-0000-0000-000000000003', { testId: OTHER_TEST });
    const reads = serveRead((id) => (id === foreign.executionId ? foreign : undefined));
    renderDrawer(foreign.executionId, [], { expectedTestId: OWN_TEST });

    expect(await screen.findByTestId('run-details-not-found', {}, WAIT)).toHaveTextContent(RUN_NOT_FOUND_MESSAGE);
    expectNoRunContent();
    expect(reads).toEqual([foreign.executionId]);
  });

  it('renders an off-page read of the expected test', async () => {
    const own = run('e0000000-0000-0000-0000-000000000004', { testName: 'Archived journey' });
    serveRead((id) => (id === own.executionId ? own : undefined));
    renderDrawer(own.executionId, [], { expectedTestId: OWN_TEST });

    await waitFor(() => expect(drawer().getByTestId('run-details-title')).toHaveTextContent('Archived journey'), WAIT);
    expect(screen.queryByTestId('run-details-not-found')).toBeNull();
  });

  it('switches to not-found and keeps the snapshot out of the list when a live snapshot belongs to another test', async () => {
    const moving = run('e0000000-0000-0000-0000-000000000005', { status: 'RUNNING', durationMs: null, endedAt: null, revision: 3, streamComplete: false });
    const foreignLive = { ...passedExecution, executionId: moving.executionId, testId: OTHER_TEST, videoPath: videoPathOf(moving.executionId), revision: 9, streamComplete: true };
    setExecutionTransportSeam({ primary: createScriptedTransport([foreignLive], 30), fallback: null });
    const onSnapshot = vi.fn();
    renderDrawer(moving.executionId, [moving], { expectedTestId: OWN_TEST, onSnapshot });

    // First paint is the list row of the expected test.
    expect(screen.getByTestId('run-details-title')).toBeInTheDocument();
    expect(await screen.findByTestId('run-details-not-found', {}, WAIT)).toBeInTheDocument();
    expectNoRunContent();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('keeps following a live run of the expected test and forwards its snapshots', async () => {
    const moving = run('e0000000-0000-0000-0000-000000000006', { status: 'RUNNING', durationMs: null, endedAt: null, revision: 3, streamComplete: false });
    const finished = { ...passedExecution, executionId: moving.executionId, videoPath: videoPathOf(moving.executionId), revision: 9, streamComplete: true };
    setExecutionTransportSeam({ primary: createScriptedTransport([finished], 30), fallback: null });
    const onSnapshot = vi.fn();
    renderDrawer(moving.executionId, [moving], { expectedTestId: OWN_TEST, onSnapshot });

    await waitFor(() => expect(drawer().getByTestId('run-details-status')).toHaveTextContent('Passed'), WAIT);
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ revision: 9 }));
    expect(screen.queryByTestId('run-details-not-found')).toBeNull();
  });

  it('is unbound when no expected test id is given', async () => {
    const foreign = run('e0000000-0000-0000-0000-000000000007', { testId: OTHER_TEST });
    renderDrawer(foreign.executionId, [foreign]);

    expect(await screen.findByTestId('run-details-title')).toHaveTextContent('Checkout journey');
    expect(screen.queryByTestId('run-details-not-found')).toBeNull();
  });
});

describe('RunDetailsDrawer logs (STUDIO-UNIFY-001.6 AC-08)', { timeout: 20_000 }, () => {
  it('counts steps from 1 and gives the untimed closing line the run end time', async () => {
    const own = run('e0000000-0000-0000-0000-000000000008', {
      endedAt: '2026-09-14T10:00:40Z',
      logs: [
        { at: '2026-09-14T10:00:01Z', level: 'INFO', message: 'step 0 started: Go to the page', stepIndex: 0 },
        { at: '2026-09-14T10:00:02Z', level: 'INFO', message: 'step 1 passed', stepIndex: 1 },
        { at: null, level: 'INFO', message: 'run PASSED', stepIndex: null },
      ],
    });
    serveRead(() => undefined);
    renderDrawer(own.executionId, [own], { expectedTestId: OWN_TEST });

    drawer().getByRole('button', { name: 'Show logs (3)' }).click();

    const first = await screen.findByTestId('run-log-line-0');
    expect(first).toHaveTextContent('step 1 started: Go to the page');
    expect(first).not.toHaveTextContent('step 0');
    expect(screen.getByTestId('run-log-line-1')).toHaveTextContent('step 2 passed');
    const closing = screen.getByTestId('run-log-line-2');
    expect(closing).toHaveTextContent('10:00:40.000');
    expect(closing).toHaveTextContent('run PASSED');
  });
});
