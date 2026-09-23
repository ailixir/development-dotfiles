import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/compileFixtures';
import type { TestDto, TestRequest } from '@/types/studio/studioTypes';
import { store } from '@/store';
import StudioTestsPage from './StudioTestsPage';

/**
 * The tests list opens the editor; only the ready-gated Run control there may call execute.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 10_000 } as const;
const executeCalls: string[] = [];
const createCalls: TestRequest[] = [];
const registeredCsis = [
  { id: '178672', name: 'Payments', description: '', businessUnit: 'Operations', criticality: 'HIGH', owner: 'owner@example.com', tags: [], environment: 'Development', status: 'OPERATIONAL', createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z' },
  { id: '200001', name: 'Customer Portal', description: '', businessUnit: 'Digital', criticality: 'HIGH', owner: 'owner@example.com', tags: [], environment: 'Development', status: 'OPERATIONAL', createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z' },
];

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  executeCalls.length = 0;
  createCalls.length = 0;
  store.dispatch({ type: 'dashboard/setSearchContext', payload: { csiId: null } });
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

function serve(test: TestDto = readyDraft) {
  studioMockServer.use(
    http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
    http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
    http.get(`${API_BASE}/csi`, () =>
      HttpResponse.json({ data: registeredCsis, page: 0, size: 20, totalElements: registeredCsis.length, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [test], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.post(`${STUDIO_BASE}/tests`, async ({ request }) => {
      const payload = await request.json() as TestRequest;
      createCalls.push(payload);
      return HttpResponse.json({ ...test, id: '34800e75-b744-4d38-a87d-9dd50ecad84d', ...payload }, { status: 201 });
    }),
    http.post(`${STUDIO_BASE}/tests/:id/execute`, ({ params }) => {
      executeCalls.push(String(params.id));
      return HttpResponse.json(
        { executionId: '66666666-6666-6666-6666-666666666666', status: 'PENDING' },
        { status: 202 },
      );
    }),
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <LocationProbe />
        <StudioTestsPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('Tests page entry', () => {
  it('opens the editor without calling execute', async () => {
    serve();
    renderPage();

    const open = await screen.findByRole('button', {
      name: `Open ${readyDraft.name}`,
    }, WAIT);
    expect(screen.getByTestId(`last-run-${readyDraft.id}`)).toHaveTextContent('No run history');
    await userEvent.click(open);

    expect(await screen.findByTestId('location')).toHaveTextContent(`/checks/studio/${readyDraft.id}`);
    expect(executeCalls).toEqual([]);
  });

  it('labels an earlier result as history rather than the current draft outcome', async () => {
    const historical = {
      ...readyDraft,
      lastRunStatus: 'PASSED' as const,
      lastRunAt: '2026-09-20T12:00:00Z',
    };
    serve(historical);
    renderPage();

    expect(await screen.findByTestId(`last-run-${readyDraft.id}`)).toHaveTextContent(
      'Previous run: Passed',
    );
    expect(
      screen.getByText('This is run history and may describe an earlier saved version.'),
    ).toBeInTheDocument();
  });

  it('requires a registered system instead of silently sending a stale default', async () => {
    store.dispatch({ type: 'dashboard/setSearchContext', payload: { csiId: '60406' } });
    serve();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Create Test' }, WAIT));
    await userEvent.type(screen.getByRole('textbox', { name: /name/i }), 'Checkout journey');

    const create = screen.getByRole('button', { name: /^Create$/ });
    expect(create).toBeDisabled();
    expect(screen.getByText('Choose the system this test belongs to.')).toBeInTheDocument();
    expect(createCalls).toEqual([]);

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: /System \(CSI\)/i }));
    await userEvent.click(await screen.findByRole('option', { name: '178672 — Payments' }, WAIT));
    expect(create).toBeEnabled();
    await userEvent.click(create);

    await waitFor(() => expect(createCalls).toHaveLength(1), WAIT);
    expect(createCalls[0]).toMatchObject({
      name: 'Checkout journey',
      csiId: '178672',
    });
  });
});
