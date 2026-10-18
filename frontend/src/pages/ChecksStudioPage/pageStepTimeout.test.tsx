import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import { resetExecutionTransportSeam } from '@/services/api/studioTransportWiring';
import {
  DEFAULT_STEP_TIMEOUT_SECONDS,
  defaultConfiguration,
  type TestDto,
  type TestUpdateRequest,
} from '@/types/studio/studioTypes';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import { setExecuting } from '@/store/slices/studioSlice';
import ChecksStudioPage from './ChecksStudioPage';

/**
 * The per-step budget (`configuration.timeoutSeconds`) is not authored: the Studio shows no
 * control for it, and every save (`PUT /tests/{id}`) sends the default, normalising any value an
 * older draft stored. This supersedes the VAL-017 control.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 10_000 } as const;
const TEST_TIMEOUT_MS = 40_000;

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

function serveDraft(initial: TestDto) {
  const state = { current: initial };
  const bodies: TestUpdateRequest[] = [];
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [state.current], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(state.current))),
    http.put(`${STUDIO_BASE}/tests/:id`, async ({ request }) => {
      const body = (await request.json()) as TestUpdateRequest;
      bodies.push(body);
      // The server owns the revision; the mock stands in for it.
      state.current = {
        ...state.current,
        configuration: body.configuration,
        configurationRevision: (state.current.configurationRevision ?? 0) + 1,
      };
      return HttpResponse.json(state.current);
    }),
  );
  return { state, bodies };
}

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChecksStudioPage />
      </MemoryRouter>
    </Provider>,
  );
}

const withTimeout = (timeoutSeconds: number): TestDto => ({
  ...readyDraft,
  configuration: { ...readyDraft.configuration, timeoutSeconds },
});

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  studioMockServer.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  window.localStorage.clear();
  studioMockServer.use(...bootstrapHandlers);
  store.dispatch(setExecuting(false));
  store.dispatch(
    fetchSources.fulfilled([{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }], 'test', undefined),
  );
  store.dispatch(
    fetchFeatures.fulfilled(
      { sources: [], features: [{ key: 'STUDIO', enabled: true, label: 'Checks Studio' }] },
      'test',
      undefined,
    ),
  );
});
afterEach(() => {
  resetExecutionTransportSeam();
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.close();
});

async function saveAndCapture(bodies: TestUpdateRequest[]) {
  await screen.findByRole('button', { name: 'Run Test' }, WAIT);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(bodies).toHaveLength(1), WAIT);
  return bodies[0];
}

describe('step timeout is always the default', () => {
  it('renders no step timeout control', async () => {
    serveDraft(withTimeout(12));
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    expect(screen.queryByLabelText(/step timeout/i)).toBeNull();
    expect(screen.queryByText(/step timeout/i)).toBeNull();
    expect(screen.queryByText('How long each step may wait for the page before failing.')).toBeNull();
    expect(screen.getByTestId('studio-save-state')).toHaveTextContent('Saved');
  }, TEST_TIMEOUT_MS);

  it('a new test is created with, and saved with, 30 seconds', async () => {
    // The Tests page creates a draft with `defaultConfiguration()`; this is that payload's value.
    expect(DEFAULT_STEP_TIMEOUT_SECONDS).toBe(30);
    expect(defaultConfiguration().timeoutSeconds).toBe(30);

    const { bodies } = serveDraft({ ...readyDraft, configuration: defaultConfiguration() });
    renderPage();
    const body = await saveAndCapture(bodies);
    expect(body.configuration.timeoutSeconds).toBe(30);
  }, TEST_TIMEOUT_MS);

  it('a loaded test with a stored 12 is saved with 30', async () => {
    const { bodies } = serveDraft(withTimeout(12));
    renderPage();
    const body = await saveAndCapture(bodies);
    expect(body.configuration.timeoutSeconds).toBe(30);
    expect(body.configurationRevision).toBe(readyDraft.configurationRevision);
  }, TEST_TIMEOUT_MS);
});
