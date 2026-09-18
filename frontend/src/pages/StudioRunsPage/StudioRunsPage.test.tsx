import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import { VIDEO_EVIDENCE_NARRATIVES } from '@/components/studio/evidence';
import { CANCELLED_ERROR_CODE, type ExecutionSnapshot } from '@/types/studio/studioTypes';
import { store } from '@/store';
import StudioRunsPage from './StudioRunsPage';

/**
 * Studio v1, WP5: the Runs page shows each run's evidence state as the server reports it.
 *
 * A run with no usable recording says so and mounts no media element. Only an `AVAILABLE`
 * recording gets a player, and its source is the protected `/video` route, never a stored URL.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 10_000 } as const;

const available: ExecutionSnapshot = { ...passedExecution, executionId: 'e0000000-0000-0000-0000-0000000000a1' };
available.videoPath = `/api/v1/studio/executions/${available.executionId}/video`;
const noRecording: ExecutionSnapshot = {
  ...passedExecution,
  executionId: 'e0000000-0000-0000-0000-0000000000a2',
  status: 'FAILED',
  video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false },
  videoPath: null,
};
const cancelled: ExecutionSnapshot = {
  ...passedExecution,
  executionId: 'e0000000-0000-0000-0000-0000000000a3',
  status: 'ERROR',
  errorCode: CANCELLED_ERROR_CODE,
  durationMs: null,
  video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false },
  videoPath: null,
};

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('Runs page evidence', () => {
  it('renders each evidence state, with a player only for an AVAILABLE recording', async () => {
    studioMockServer.use(
      http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
      http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
      http.get(`${STUDIO_BASE}/executions`, () =>
        HttpResponse.json({
          data: [available, noRecording, cancelled],
          page: 0,
          size: 20,
          totalElements: 3,
          totalPages: 1,
        }),
      ),
      http.get(`${STUDIO_BASE}/tests`, () =>
        HttpResponse.json({ data: [], page: 0, size: 20, totalElements: 0, totalPages: 1 }),
      ),
    );
    render(
      <Provider store={store}>
        <MemoryRouter>
          <StudioRunsPage />
        </MemoryRouter>
      </Provider>,
    );

    const withRecording = await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);
    const videos = document.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(withRecording.contains(videos[0])).toBe(true);
    expect(videos[0].getAttribute('src')).toMatch(
      new RegExp(`/api/v1/studio/executions/${available.executionId}/video$`),
    );

    const without = screen.getByTestId(`run-${noRecording.executionId}`);
    expect(within(without).getByText(VIDEO_EVIDENCE_NARRATIVES.UNAVAILABLE.title)).toBeInTheDocument();
    expect(within(without).getByTestId('run-status').textContent).toBe('Failed');

    const stopped = screen.getByTestId(`run-${cancelled.executionId}`);
    expect(within(stopped).getByTestId('run-status').textContent).toBe('Cancelled');
    expect(within(stopped).queryByRole('region', { name: VIDEO_EVIDENCE_NARRATIVES.AVAILABLE.title })).toBeNull();
  });
});
