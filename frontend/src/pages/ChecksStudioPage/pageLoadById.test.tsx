import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { readyDraft, unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import type { TestDto } from '@/types/studio/studioTypes';
import { renderStudioAt, type StudioNavHandle } from '@/test/renderStudioAt';
import { uiTestEditorPath } from '@/components/studio/uiTestPaths';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import ChecksStudioPage from './ChecksStudioPage';
import { TEST_NOT_AVAILABLE_MESSAGE } from '@/components/studio/StudioUnavailable';

/**
 * STUDIO-UNIFY-001.1, task 1.11 (AC-06, AC-07): the editor is always the test the URL names.
 *
 * The list is one page (`GET /studio/tests` has no params, so the server default is 20), so a test
 * can exist and not be on it. The editor reads `GET /studio/tests/{id}` for the route id on load and
 * on a route change, a later list reload keeps it selected, and there is no "first test of the list"
 * fallback. Everything that counts is counted at the mock server.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 10_000 } as const;
const TEST_TIMEOUT_MS = 40_000;

/** The test the URL names. It is not on the list's first page. */
const target: TestDto = {
  ...readyDraft,
  id: 'b0000000-0000-0000-0000-00000000f001',
  name: 'Beyond page one',
  steps: ['Go to "https://example.invalid/beyond"', 'Click "Beyond"'],
};
/** What the list serves first: the test the old `list[0]` fallback would have opened. */
const firstOfList: TestDto = {
  ...unlearnedDraft,
  id: 'b0000000-0000-0000-0000-00000000f002',
  name: 'First of the list',
  steps: ['Go to "https://example.invalid/first"'],
};
/** A second test beyond page one, for the route-change case. */
const second: TestDto = {
  ...readyDraft,
  id: 'b0000000-0000-0000-0000-00000000f003',
  name: 'Also beyond page one',
  steps: ['Go to "https://example.invalid/second"', 'Click "Second"', 'Check that the URL contains "second"'],
};
const FORBIDDEN_ID = 'b0000000-0000-0000-0000-00000000f0ff';
const MALFORMED_ID = 'not-a-uuid';

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

const observed: { method: string; path: string }[] = [];
function record({ request }: { request: Request }) {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
}
const studioRequests = () => observed.filter((entry) => entry.path.includes('/studio'));
const reads = (id: string) =>
  observed.filter((entry) => entry.method === 'GET' && entry.path.endsWith(`/studio/tests/${id}`));
const listReads = () => observed.filter((entry) => entry.method === 'GET' && entry.path.endsWith('/studio/tests'));
const runStarts = () =>
  observed.filter(
    (entry) =>
      entry.method === 'POST' && (entry.path.endsWith('/execute') || entry.path.endsWith('/guided-sessions')),
  );

/** The list serves only `firstOfList`; the single read answers by id. */
function serve() {
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [firstOfList], page: 0, size: 20, totalElements: 21, totalPages: 2 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, ({ params }) => {
      const id = String(params.id);
      if (id === FORBIDDEN_ID) {
        return HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'No access to this CSI' }, { status: 403 });
      }
      if (id === MALFORMED_ID) {
        return HttpResponse.json({ error: 'INVALID_ID', message: 'Malformed id' }, { status: 400 });
      }
      const found = [target, second, firstOfList].find((candidate) => candidate.id === id);
      return found
        ? HttpResponse.json(fixtureDetail(found))
        : HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'Unknown' }, { status: 403 });
    }),
  );
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  // Availability must be 'on' for the editor to mount; the shared store is settled explicitly.
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
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;

const heading = (name: string) => screen.findByRole('heading', { level: 1, name }, WAIT);

describe('AC-06: a test that is not on the first page of the list is opened by id', () => {
  it('on load, reads GET /tests/{id} and shows that test, never the first test of the list', async () => {
    serve();
    renderStudioAt(target.id, <ChecksStudioPage />, { wrapper: StoreProvider });

    await heading(target.name);
    await screen.findByText(`Test Steps (${target.steps.length})`, {}, WAIT);
    expect(screen.getByRole('textbox', { name: 'Step 1' })).toHaveValue(target.steps[0]);
    expect(screen.queryByText(firstOfList.name)).toBeNull();
    expect(reads(target.id).length).toBeGreaterThan(0);
    expect(reads(firstOfList.id)).toHaveLength(0);
    // The editor sent nothing that starts a run.
    expect(runStarts()).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it('on a route change to another id the list does not carry, reads that id and shows it', async () => {
    serve();
    const nav: StudioNavHandle = { go: null };
    renderStudioAt(target.id, <ChecksStudioPage />, { wrapper: StoreProvider, navHandle: nav });
    await heading(target.name);

    await act(async () => {
      nav.go?.(uiTestEditorPath(second.id));
    });

    await heading(second.name);
    await screen.findByText(`Test Steps (${second.steps.length})`, {}, WAIT);
    expect(screen.getByRole('textbox', { name: 'Step 3' })).toHaveValue(second.steps[2]);
    expect(screen.queryByText(target.name)).toBeNull();
    expect(screen.queryByText(firstOfList.name)).toBeNull();
    expect(reads(second.id).length).toBeGreaterThan(0);
    expect(runStarts()).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it('a later list reload keeps the route test selected, with its steps', async () => {
    serve();
    renderStudioAt(target.id, <ChecksStudioPage />, { wrapper: StoreProvider });
    await heading(target.name);
    await screen.findByText(`Test Steps (${target.steps.length})`, {}, WAIT);
    await waitFor(() => expect(listReads().length).toBeGreaterThan(0), WAIT);
    const before = listReads().length;

    await userEvent.click(await screen.findByRole('button', { name: 'Refresh test information' }, WAIT));
    await waitFor(() => expect(listReads().length).toBe(before + 1), WAIT);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh test information' })).not.toBeDisabled(), WAIT);

    // The reloaded page of the list does not carry the test, and it stays the one on screen.
    expect(screen.getByRole('heading', { level: 1, name: target.name })).toBeInTheDocument();
    expect(screen.getByText(`Test Steps (${target.steps.length})`)).toBeInTheDocument();
    expect(screen.queryByText(firstOfList.name)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('mounted without a route id, selects nothing, sends no Studio request and offers no run', async () => {
    serve();
    render(
      <MemoryRouter>
        <ChecksStudioPage />
      </MemoryRouter>,
      { wrapper: StoreProvider },
    );

    await screen.findByText('No test selected.', {}, WAIT);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText(firstOfList.name)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Checks Studio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Test' })).toBeDisabled();
    expect(studioRequests()).toEqual([]);
  }, TEST_TIMEOUT_MS);
});

describe('AC-07: a test the caller cannot read shows one message and loads no other test', () => {
  it.each([
    ['403 STUDIO_FORBIDDEN', FORBIDDEN_ID],
    ['400 for a malformed id', MALFORMED_ID],
  ])('on load, a %s shows the message and selects nothing', async (_label, id) => {
    serve();
    renderStudioAt(id, <ChecksStudioPage />, { wrapper: StoreProvider });

    expect(await screen.findByText(TEST_NOT_AVAILABLE_MESSAGE, {}, WAIT)).toBeInTheDocument();
    expect(TEST_NOT_AVAILABLE_MESSAGE).toBe("This UI test doesn't exist or you don't have access");
    await new Promise((resolve) => setTimeout(resolve, 100));
    // No other test: the first of the list is neither read nor shown, and nothing can run.
    expect(screen.queryByText(firstOfList.name)).toBeNull();
    expect(reads(firstOfList.id)).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1, name: 'Checks Studio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Test' })).toBeDisabled();
    expect(runStarts()).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it('on a route change to an unreadable id, drops the previous test and shows the message', async () => {
    serve();
    const nav: StudioNavHandle = { go: null };
    renderStudioAt(target.id, <ChecksStudioPage />, { wrapper: StoreProvider, navHandle: nav });
    await heading(target.name);

    await act(async () => {
      nav.go?.(uiTestEditorPath(FORBIDDEN_ID));
    });

    expect(await screen.findByText(TEST_NOT_AVAILABLE_MESSAGE, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(target.name)).toBeNull();
    expect(screen.queryByText(`Test Steps (${target.steps.length})`)).toBeNull();
    expect(screen.getByRole('button', { name: 'Run Test' })).toBeDisabled();
    expect(runStarts()).toEqual([]);
  }, TEST_TIMEOUT_MS);
});
