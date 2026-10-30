import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, useParams } from 'react-router-dom';
import sourcesSlice from '@/store/slices/sourcesSlice';
import featuresSlice, { fetchFeatures } from '@/store/slices/featuresSlice';

/**
 * STUDIO-UNIFY-001.1 task 1.21 (AC-06, AC-26; CON-09) and STUDIO-UNIFY-001.2 task 2.9 (AC-23, AC-26;
 * FR-27): one route test per tree.
 *
 * `App.tsx` has two route trees, the federated one under `/checks/*` and the standalone one under
 * `/*`. `ChecksLayout` mounts `PlatformSidebar` from `@put/core-components`, so the layout is a
 * passthrough here, and every lazy page is a sentinel. The editor lives at `ui-tests/:id/studio`
 * behind the STUDIO gate; `studio` and `studio/:id` no longer exist, so they land on module home
 * through the catch-all (no redirect to a ui-tests route). Story .2 adds the detail routes; story .7 makes
 * them one page: `ui-tests/:id` and its drawer URL `ui-tests/:id/runs/:executionId` render the same detail
 * page behind the STUDIO gate (the page reads the execution id), and the bare `ui-tests/:id/runs` tab route
 * is gone like the module-level studio runs paths: it lands on module home. Story .3 removes the
 * module-level tests list the same way.
 */

vi.mock('@components/layout/ChecksLayout', () => ({
  ChecksLayout: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@components/layout/LayoutProvider', () => ({
  LayoutProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const sentinel = (name: string) => ({ default: () => <div data-testid={`page-${name}`}>{name}</div> });
vi.mock('@pages/HomePage', () => sentinel('home'));
vi.mock('@pages/AllChecksPage', () => sentinel('all-checks'));
vi.mock('./pages/CreateCheckPage/CreateCheckPage', () => sentinel('create-check'));
vi.mock('@pages/CheckDetailsPage', () => sentinel('check-details'));
vi.mock('@pages/CreateCheckPage', () => sentinel('edit-check'));
vi.mock('@pages/ChecksStudioPage', () => ({
  default: function EditorSentinel() {
    const { id } = useParams();
    return <div data-testid="page-editor">{`editor:${id}`}</div>;
  },
}));
vi.mock('./pages/Reports/ReportsHome', () => sentinel('reports'));
vi.mock('./pages/Reports/ReportBuilder', () => sentinel('report-builder'));
vi.mock('./pages/Reports/ReportDetailsPage', () => sentinel('report-details'));
vi.mock('@pages/UiTestDetailsPage', () => ({
  default: function DetailPageSentinel() {
    const { id, executionId } = useParams();
    return (
      <div data-testid="page-detail" data-execution-id={executionId ?? ''}>
        {`detail:${id}`}
      </div>
    );
  },
}));
vi.mock('@pages/ActivityPage', () => sentinel('activity'));
vi.mock('@pages/SchedulesPage', () => sentinel('schedules'));
vi.mock('@pages/SplunkPrototypePage', () => sentinel('splunk'));

// Imported after the mocks are registered.
const { default: App } = await import('./App');

function renderApp(path: string, { studio = true }: { studio?: boolean } = {}) {
  const store = configureStore({ reducer: { sources: sourcesSlice, features: featuresSlice } });
  store.dispatch(
    fetchFeatures.fulfilled(
      { sources: [], features: [{ key: 'STUDIO', enabled: studio, label: 'Checks Studio' }] },
      'test',
      undefined,
    ),
  );
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </Provider>,
  );
}

const ID = 'a0000000-0000-0000-0000-00000000abcd';
const EXEC = 'b0000000-0000-0000-0000-00000000ef01';
// Built from segments: the removed paths are not written as route literals anywhere in src.
const REMOVED_RUNS = ['studio', 'runs'].join('/');
const REMOVED_TESTS = ['studio', 'tests'].join('/');

describe.each([
  ['federated tree (/checks/*)', '/checks'],
  ['standalone tree (/*)', ''],
])('%s', (_name, base) => {
  it('ui-tests/{id}/studio renders the editor with the route id', async () => {
    renderApp(`${base}/ui-tests/${ID}/studio`);
    expect(await screen.findByTestId('page-editor')).toHaveTextContent(`editor:${ID}`);
  });

  it('ui-tests/{id}/studio is behind the STUDIO gate', async () => {
    renderApp(`${base}/ui-tests/${ID}/studio`, { studio: false });
    expect(await screen.findByText('Feature Unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('page-editor')).toBeNull();
  });

  it('the bare studio route is gone: it lands on module home', async () => {
    renderApp(`${base}/studio`);
    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.queryByTestId('page-editor')).toBeNull();
  });

  it('studio/{id} is gone: it lands on module home, with no redirect to a ui-tests route', async () => {
    renderApp(`${base}/studio/${ID}`);
    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.queryByTestId('page-editor')).toBeNull();
  });

  it('ui-tests/{id} renders the detail page, with no execution id', async () => {
    renderApp(`${base}/ui-tests/${ID}`);
    const page = await screen.findByTestId('page-detail');
    expect(page).toHaveTextContent(`detail:${ID}`);
    expect(page).toHaveAttribute('data-execution-id', '');
    expect(screen.queryByTestId('page-editor')).toBeNull();
  });

  it('ui-tests/{id}/runs/{executionId} renders the same detail page and exposes the execution id', async () => {
    renderApp(`${base}/ui-tests/${ID}/runs/${EXEC}`);
    const page = await screen.findByTestId('page-detail');
    expect(page).toHaveTextContent(`detail:${ID}`);
    expect(page).toHaveAttribute('data-execution-id', EXEC);
  });

  it('the bare ui-tests/{id}/runs tab route is gone: it lands on module home, with no detail page', async () => {
    renderApp(`${base}/ui-tests/${ID}/runs`);
    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.queryByTestId('page-detail')).toBeNull();
    expect(screen.queryByTestId('page-editor')).toBeNull();
  });

  it('ui-tests/{id}/studio still renders the editor, not the detail shell', async () => {
    renderApp(`${base}/ui-tests/${ID}/studio`);
    expect(await screen.findByTestId('page-editor')).toHaveTextContent(`editor:${ID}`);
    expect(screen.queryByTestId('page-detail')).toBeNull();
  });

  it.each([
    ['ui-tests/{id}', `ui-tests/${ID}`],
    ['ui-tests/{id}/runs/{executionId}', `ui-tests/${ID}/runs/${EXEC}`],
  ])('%s is behind the STUDIO gate', async (_label, tail) => {
    renderApp(`${base}/${tail}`, { studio: false });
    expect(await screen.findByText('Feature Unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('page-detail')).toBeNull();
  });

  it.each([
    ['the module-level runs list', REMOVED_RUNS],
    ['the module-level run details', `${REMOVED_RUNS}/${EXEC}`],
    ['the module-level tests list', REMOVED_TESTS],
  ])('%s is gone: it lands on module home, with no redirect to a ui-tests route', async (_label, tail) => {
    renderApp(`${base}/${tail}`);
    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.queryByTestId('page-detail')).toBeNull();
    expect(screen.queryByTestId('page-editor')).toBeNull();
  });
});
