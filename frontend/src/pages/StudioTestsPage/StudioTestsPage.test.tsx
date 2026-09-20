import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/compileFixtures';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import {
  createPollTransport,
  resetExecutionTransportSeam,
  setExecutionTransportSeam,
} from '@/services/api/studioTransportWiring';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { store } from '@/store';
import StudioTestsPage from './StudioTestsPage';

/**
 * Studio v1, WP5: a run started from the Tests page ends on the backend's own terminal set.
 *
 * The page used to wait for `COMPLETED`/`FAILED`/`TIMEOUT` and give up after 6.5 s with no outcome.
 * The backend reports `PASSED`, so a passing run was never resolved. Here the run is followed
 * through the shared transport and ends on `PASSED`.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 10_000 } as const;
const TEST_TIMEOUT_MS = 30_000;
const EXECUTION_ID = '66666666-6666-6666-6666-666666666666';

const running: ExecutionSnapshot = {
  ...passedExecution,
  executionId: EXECUTION_ID,
  testId: readyDraft.id,
  status: 'RUNNING',
  endedAt: null,
  durationMs: null,
  revision: 1,
  streamComplete: false,
};
const passed: ExecutionSnapshot = {
  ...passedExecution,
  executionId: EXECUTION_ID,
  testId: readyDraft.id,
  revision: 2,
  streamComplete: true,
};

const executeCalls: string[] = [];

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  executeCalls.length = 0;
  setExecutionTransportSeam({ primary: createPollTransport, fallback: null });
});
afterEach(() => {
  resetExecutionTransportSeam();
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

function serve(reads: ExecutionSnapshot[]) {
  let read = 0;
  studioMockServer.use(
    http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
    http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [readyDraft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.post(`${STUDIO_BASE}/tests/:id/execute`, ({ params }) => {
      executeCalls.push(String(params.id));
      return HttpResponse.json({ executionId: EXECUTION_ID, status: 'PENDING' }, { status: 202 });
    }),
    http.get(`${STUDIO_BASE}/executions/:id`, () => {
      const snapshot = reads[Math.min(read, reads.length - 1)];
      read += 1;
      return HttpResponse.json(snapshot);
    }),
  );
}

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <StudioTestsPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('Tests page run', () => {
  it('resolves on a terminal PASSED snapshot and shows it as the last run', async () => {
    serve([running, passed]);
    renderPage();

    const run = await screen.findByRole('button', { name: `Run ${readyDraft.name}` }, WAIT);
    expect(screen.getByTestId(`last-run-${readyDraft.id}`).textContent).toBe('Never run');
    await userEvent.click(run);

    await screen.findByText(`${readyDraft.name}: Passed`, {}, WAIT);
    expect(screen.getByTestId(`last-run-${readyDraft.id}`).textContent).toBe('Last run: Passed');
    await waitFor(() => expect(run).not.toBeDisabled(), WAIT);
    expect(executeCalls).toEqual([readyDraft.id]);
  }, TEST_TIMEOUT_MS);

  it('does not treat a non-terminal status as the end of the run', async () => {
    // Only RUNNING is ever served, so the run must still be in progress after several reads.
    serve([running]);
    renderPage();

    const run = await screen.findByRole('button', { name: `Run ${readyDraft.name}` }, WAIT);
    await userEvent.click(run);
    await waitFor(() => expect(run).toBeDisabled(), WAIT);
    await new Promise((resolve) => setTimeout(resolve, 2_500));

    expect(run).toBeDisabled();
    expect(screen.getByTestId(`last-run-${readyDraft.id}`).textContent).toBe('Never run');
    expect(screen.queryByText(new RegExp(`^${readyDraft.name}: `))).toBeNull();
  }, TEST_TIMEOUT_MS);
});
