import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, useParams } from 'react-router-dom';
import sourcesSlice from '@/store/slices/sourcesSlice';
import featuresSlice, { fetchFeatures } from '@/store/slices/featuresSlice';

/**
 * STUDIO-UNIFY-001.1, task 1.21 (AC-06, AC-26; CON-09): one route test per tree.
 *
 * `App.tsx` has two route trees, the federated one under `/checks/*` and the standalone one under
 * `/*`. `ChecksLayout` mounts `PlatformSidebar` from `@put/core-components`, so the layout is a
 * passthrough here, and every lazy page is a sentinel. The editor lives at `ui-tests/:id/studio`
 * behind the STUDIO gate; `studio` and `studio/:id` no longer exist, so they land on module home
 * through the catch-all (no redirect to a ui-tests route). The removed-path list grows in stories .2
 * and .3.
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
vi.mock('@pages/StudioRunsPage', () => sentinel('studio-runs'));
vi.mock('@pages/StudioTestsPage', () => sentinel('studio-tests'));
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

  it('the Tests and Runs pages still exist at this boundary', async () => {
    renderApp(`${base}/studio/tests`);
    expect(await screen.findByTestId('page-studio-tests')).toBeInTheDocument();
  });
});
