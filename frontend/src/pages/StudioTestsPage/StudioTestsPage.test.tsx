import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { delay, http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import type { TestDto, TestReadiness } from '@/types/studio/studioTypes';
import { DELETE_ERRORS } from '@/components/studio/tests/testErrors';
import { store } from '@/store';
import StudioTestsPage from './StudioTestsPage';

/**
 * Story 10.46, Track C: the tests list pages, searches, filters and sorts on the server, keeps that
 * state in the URL, and its dialogs report refusals by status.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 10_000 } as const;
const registeredCsis = [
  { id: '178672', name: 'Payments', description: '', businessUnit: 'Operations', criticality: 'HIGH', owner: 'owner@example.com', tags: [], environment: 'Development', status: 'OPERATIONAL', createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z' },
  { id: '200001', name: 'Customer Portal', description: '', businessUnit: 'Digital', criticality: 'HIGH', owner: 'owner@example.com', tags: [], environment: 'Development', status: 'OPERATIONAL', createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z' },
];

type ListResponder = (params: URLSearchParams) => { data: TestDto[]; totalElements?: number; totalPages?: number };

let user: ReturnType<typeof userEvent.setup>;
let listRequests: URLSearchParams[];
let deleteCalls: string[];

function makeTest(id: string, overrides: Partial<TestDto> = {}): TestDto {
  return { ...readyDraft, id, name: `Test ${id}`, csiId: '178672', environment: 'Development', ...overrides };
}

/** Serves the CSI registry and `GET /studio/tests`, recording every list request's parameters. */
function serve(respond: ListResponder = () => ({ data: [makeTest('one')] })) {
  studioMockServer.use(
    http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
    http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
    http.get(`${API_BASE}/csi`, () =>
      HttpResponse.json({ data: registeredCsis, page: 0, size: 20, totalElements: registeredCsis.length, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      listRequests.push(params);
      const { data, totalElements = data.length, totalPages = Math.max(1, Math.ceil(totalElements / 10)) } = respond(params);
      return HttpResponse.json({ data, page: Number(params.get('page') ?? 0), size: 10, totalElements, totalPages });
    }),
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="location">{location.pathname}</output>
      <output data-testid="search">{location.search}</output>
    </>
  );
}

function renderPage(initialEntry = '/checks/studio/tests') {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <StudioTestsPage />
      </MemoryRouter>
    </Provider>,
  );
}

const lastRequest = () => listRequests[listRequests.length - 1];
const search = () => new URLSearchParams(screen.getByTestId('search').textContent ?? '');

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  user = userEvent.setup({ delay: null });
  listRequests = [];
  deleteCalls = [];
  store.dispatch({ type: 'dashboard/setSearchContext', payload: { csiId: null } });
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

// Each flow awaits page load, MSW round trips and MUI menus with WAIT (10s); under full-suite load
// the 5s default sat below those waits (VAL-032), so every block is bounded at 15s.
describe('Tests page — server list', { timeout: 15_000 }, () => {
  it('sends the global CSI and environment, sort and 0-based page to the server', async () => {
    store.dispatch({ type: 'dashboard/setSearchContext', payload: { csiId: '178672' } });
    store.dispatch({ type: 'dashboard/setSearchFilters', payload: { environment: 'UAT' } });
    serve();
    renderPage();

    await screen.findByRole('link', { name: 'Test one' }, WAIT);
    expect(Object.fromEntries(lastRequest())).toEqual({
      csiId: '178672',
      environment: 'UAT',
      sort: 'updatedAt,desc',
      page: '0',
      size: '25',
    });
    expect(screen.getByText('CSI: 178672')).toBeInTheDocument();
    expect(screen.getByText('Env: UAT')).toBeInTheDocument();
  });

  it('restores search, filters, sort and page from the URL and sends them', async () => {
    serve(() => ({ data: [makeTest('eleven')], totalElements: 11, totalPages: 2 }));
    renderPage('/checks/studio/tests?q=login&lastRun=FAILED&environment=Staging&sort=name,asc&page=2&size=10');

    await screen.findByRole('link', { name: 'Test eleven' }, WAIT);
    expect(Object.fromEntries(lastRequest())).toEqual({
      q: 'login',
      lastRun: 'FAILED',
      environment: 'Staging',
      sort: 'name,asc',
      page: '1',
      size: '10',
    });
    expect(screen.getByRole('textbox', { name: 'Search tests' })).toHaveValue('login');
    expect(screen.getByText('11–11 of 11')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Test/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('commits the search box to the URL and the server after the debounce', async () => {
    serve();
    renderPage();
    await screen.findByRole('link', { name: 'Test one' }, WAIT);

    await user.click(screen.getByRole('textbox', { name: 'Search tests' }));
    await user.paste('checkout');

    await waitFor(() => expect(lastRequest().get('q')).toBe('checkout'), WAIT);
    expect(search().get('q')).toBe('checkout');
  });

  it('toggles the sort from the column headers', async () => {
    serve();
    renderPage();
    await screen.findByRole('link', { name: 'Test one' }, WAIT);

    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(lastRequest().get('sort')).toBe('name,asc'), WAIT);
    expect(search().get('sort')).toBe('name,asc');

    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(lastRequest().get('sort')).toBe('name,desc'), WAIT);

    await user.click(screen.getByRole('button', { name: 'Last run' }));
    await waitFor(() => expect(lastRequest().get('sort')).toBe('lastRunAt,desc'), WAIT);
  });

  it('filters by last run and environment, then clears all filters', async () => {
    serve();
    renderPage();
    await screen.findByRole('link', { name: 'Test one' }, WAIT);

    await user.click(screen.getByRole('combobox', { name: 'Last run' }));
    await user.click(await screen.findByRole('option', { name: 'Never run' }));
    await waitFor(() => expect(lastRequest().get('lastRun')).toBe('NEVER'), WAIT);

    await user.click(screen.getByRole('combobox', { name: 'Environment' }));
    await user.click(await screen.findByRole('option', { name: 'Production' }));
    await waitFor(() => expect(lastRequest().get('environment')).toBe('Production'), WAIT);
    expect(search().get('lastRun')).toBe('NEVER');
    expect(search().get('environment')).toBe('Production');

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }));
    await waitFor(() => {
      expect(lastRequest().get('lastRun')).toBeNull();
      expect(lastRequest().get('environment')).toBeNull();
    }, WAIT);
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('ignores a slower, earlier response', async () => {
    serve();
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests`, async ({ request }) => {
        const params = new URL(request.url).searchParams;
        listRequests.push(params);
        if (params.get('lastRun') === null) {
          await delay(400);
          return HttpResponse.json({ data: [makeTest('stale')], page: 0, size: 10, totalElements: 1, totalPages: 1 });
        }
        return HttpResponse.json({ data: [makeTest('fresh')], page: 0, size: 10, totalElements: 1, totalPages: 1 });
      }),
    );
    renderPage('/checks/studio/tests?lastRun=PASSED');
    await screen.findByRole('link', { name: 'Test fresh' }, WAIT);

    // Clearing the filter starts the slow request; set it again before that one answers.
    await user.click(screen.getByRole('button', { name: 'Clear Filters' }));
    await user.click(screen.getByRole('combobox', { name: 'Last run' }));
    await user.click(await screen.findByRole('option', { name: 'Failed' }));
    await waitFor(() => expect(lastRequest().get('lastRun')).toBe('FAILED'), WAIT);
    await delay(600);
    expect(screen.getByRole('link', { name: 'Test fresh' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Test stale' })).toBeNull();
  });

  it('shows a recoverable load error', async () => {
    serve();
    studioMockServer.use(http.get(`${STUDIO_BASE}/tests`, () => HttpResponse.json({ message: 'Forbidden' }, { status: 403 })));
    renderPage();

    expect(await screen.findByRole('alert', {}, WAIT)).toHaveTextContent('Tests could not be loaded. Please try again.');
    serve();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Test one' }, WAIT)).toBeInTheDocument();
  });
});

describe('Tests page — rows', { timeout: 15_000 }, () => {
  it('links the test name to the editor and shows description, steps, system and environment', async () => {
    serve(() => ({ data: [makeTest('one', { description: 'Pays an invoice', steps: ['a', 'b', 'c'] })] }));
    renderPage();

    const link = await screen.findByRole('link', { name: 'Test one' }, WAIT);
    expect(link).toHaveAttribute('href', '/checks/ui-tests/one/studio');
    const row = screen.getByTestId('test-row-one');
    expect(within(row).getByText('Pays an invoice · 3 steps')).toBeInTheDocument();
    expect(await within(row).findByText('Payments', {}, WAIT)).toBeInTheDocument();
    expect(within(row).getByText('Development')).toBeInTheDocument();
  });

  it.each<[TestReadiness, string]>([
    ['READY', 'Learned · ready to repeat'],
    ['UNLEARNED', 'Not learned yet'],
    ['LEARNING', 'Learning'],
    ['NEEDS_RELEARN', 'Steps changed'],
  ])('labels readiness %s as "%s"', async (readiness, label) => {
    serve(() => ({ data: [makeTest('one', { readiness })] }));
    renderPage();

    expect(await screen.findByTestId('readiness-one', {}, WAIT)).toHaveTextContent(label);
  });

  it('shows the last run with label, relative time and the earlier-version note', async () => {
    const lastRunAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    serve(() => ({
      data: [
        makeTest('ran', { lastRunStatus: 'FAILED', lastRunAt }),
        makeTest('never', { lastRunStatus: null, lastRunAt: null }),
      ],
    }));
    renderPage();

    expect(await screen.findByTestId('last-run-ran', {}, WAIT)).toHaveTextContent('Failed');
    expect(screen.getByTestId('last-run-at-ran')).toHaveTextContent('2h ago');
    // MNT-002: the version note is in the last-run tooltip, not a visible line under every run.
    expect(within(screen.getByTestId('test-row-ran')).queryByText('May describe an earlier saved version')).toBeNull();
    await user.hover(screen.getByTestId('last-run-at-ran'));
    expect(await screen.findByRole('tooltip', {}, WAIT)).toHaveTextContent('May describe an earlier saved version');
    expect(screen.getByTestId('last-run-never')).toHaveTextContent('Never run');
  });

  it('opens the editor from the row menu without calling execute', async () => {
    serve();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Actions for Test one' }, WAIT));
    expect(screen.queryByRole('menuitem', { name: /Run/ })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/checks/ui-tests/one/studio');
  });
});

describe('Tests page — delete', { timeout: 15_000 }, () => {
  async function openDelete(name: string) {
    await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }, WAIT));
    // Not `getByRole('menuitem', { name })`: naming the "Open" item (an <a>) runs jsdom's
    // getComputedStyle on an anchor, which re-resolves the base URL for every CSS rule — ~1 s alone,
    // several times that under full-suite load. The menu is still found by role.
    await user.click(within(screen.getByRole('menu')).getByText('Delete'));
    return screen.getByRole('dialog');
  }

  it('confirms before deleting, then reloads', async () => {
    serve();
    studioMockServer.use(http.delete(`${STUDIO_BASE}/tests/:id`, ({ params }) => {
      deleteCalls.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }));
    renderPage();

    const dialog = await openDelete('Test one');
    expect(within(dialog).getByText('“Test one” will be removed from your tests list.')).toBeInTheDocument();
    expect(deleteCalls).toEqual([]);
    const before = listRequests.length;
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteCalls).toEqual(['one']), WAIT);
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(before), WAIT);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
  });

  it('treats 404 as already deleted', async () => {
    serve();
    studioMockServer.use(http.delete(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json({ message: 'not found' }, { status: 404 })));
    renderPage();

    const dialog = await openDelete('Test one');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    expect(screen.queryByText(DELETE_ERRORS.generic)).toBeNull();
  });

  it('keeps the dialog open with a message on 403', async () => {
    serve();
    studioMockServer.use(http.delete(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json({ message: 'no' }, { status: 403 })));
    renderPage();

    const dialog = await openDelete('Test one');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByText(DELETE_ERRORS.forbidden, {}, WAIT)).toBeInTheDocument();
  });

  it('falls back a page when deleting the last row of the last page', async () => {
    let deleted = false;
    serve((params) => {
      const page = Number(params.get('page'));
      if (page === 1) return { data: deleted ? [] : [makeTest('last')], totalElements: deleted ? 10 : 11, totalPages: deleted ? 1 : 2 };
      return { data: [makeTest('first')], totalElements: deleted ? 10 : 11, totalPages: deleted ? 1 : 2 };
    });
    studioMockServer.use(http.delete(`${STUDIO_BASE}/tests/:id`, () => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }));
    renderPage('/checks/studio/tests?page=2');

    const dialog = await openDelete('Test last');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    // Wait on the page-1 row itself, then check the accessible link once the dialog has gone, rather
    // than polling a document-wide link-name query (each poll pays the anchor style cost above).
    const row = await screen.findByTestId('test-row-first', {}, WAIT);
    expect(lastRequest().get('page')).toBe('0');
    expect(search().get('page')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    expect(within(row).getByRole('link', { name: 'Test first' })).toBeInTheDocument();
  });
});

describe('Tests page — create', { timeout: 15_000 }, () => {
  it.each<[string, TestDto[]]>([
    ['header', [makeTest('one')]],
    ['empty state', []],
  ])('sends the %s Create Test action to Create Check with the UI Test type', async (_where, data) => {
    serve(() => ({ data }));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Create Test' }, WAIT));

    expect(screen.getByTestId('location')).toHaveTextContent('/checks/create');
    expect(search().get('type')).toBe('UI_TEST');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
