import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import checksReducer from '@/store/slices/checksSlice';
import csiReducer from '@/store/slices/csiSlice';
import dashboardReducer from '@/store/slices/dashboardSlice';
import sourcesReducer, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresReducer, { fetchFeatures } from '@/store/slices/featuresSlice';
import type { CheckSource } from '@/services/api/sourcesApi';
import type { FeatureFlag, FeaturesResponse } from '@/services/api/featuresApi';
import CommandPalette from './CommandPalette';
import DashboardPage from '@/pages/DashboardPage/DashboardPage';

// The Dashboard loads checks and upcoming executions on mount; these tests are about the entry points
// only, so the loads are replaced by plain actions and no request is sent.
vi.mock('@store/slices/checksSlice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@store/slices/checksSlice')>();
  return {
    ...actual,
    fetchChecks: () => ({ type: 'test/fetchChecks' }),
    fetchUpcomingExecutions: () => ({ type: 'test/fetchUpcomingExecutions' }),
  };
});

const source = (type: string, enabled: boolean): CheckSource => ({ type, enabled, label: type });
const feature = (key: string, enabled: boolean): FeatureFlag => ({ key, enabled, label: key });

type Availability = 'pending' | 'on' | 'off';

function makeStore(availability: Availability) {
  const store = configureStore({
    reducer: {
      checks: checksReducer,
      csi: csiReducer,
      dashboard: dashboardReducer,
      sources: sourcesReducer,
      features: featuresReducer,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  if (availability !== 'pending') {
    const on = availability === 'on';
    const response: FeaturesResponse = { sources: [], features: [feature('STUDIO', on)] };
    store.dispatch(fetchSources.fulfilled([source('UI_TEST', on)], ''));
    store.dispatch(fetchFeatures.fulfilled(response, ''));
  }
  return store;
}

const Location: React.FC = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
};

function renderWith(availability: Availability, ui: React.ReactElement) {
  const store = makeStore(availability);
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/start']}>
        <Routes>
          <Route path="*" element={<>{ui}<Location /></>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

afterEach(cleanup);

describe('command palette UI tests entry', () => {
  const palette = () => <CommandPalette open onClose={() => undefined} />;

  it("opens /checks/all?type=UI_TEST when availability is 'on'", async () => {
    renderWith('on', palette());
    await userEvent.click(screen.getByText('UI tests'));
    expect(screen.getByTestId('location')).toHaveTextContent('/checks/all?type=UI_TEST');
  });

  it.each<Availability>(['pending', 'off'])("is absent when availability is '%s'", (availability) => {
    renderWith(availability, palette());
    expect(screen.queryByText('UI tests')).not.toBeInTheDocument();
    expect(screen.getByText('All Checks')).toBeInTheDocument();
  });

  it("appears once a 'pending' availability resolves to 'on'", () => {
    const store = renderWith('pending', palette());
    expect(screen.queryByText('UI tests')).not.toBeInTheDocument();
    act(() => {
      store.dispatch(fetchSources.fulfilled([source('UI_TEST', true)], ''));
      store.dispatch(fetchFeatures.fulfilled({ sources: [], features: [feature('STUDIO', true)] }, ''));
    });
    expect(screen.getByText('UI tests')).toBeInTheDocument();
  });
});

describe('dashboard Open UI tests quick action', () => {
  const name = /open ui tests/i;

  it("opens /checks/all?type=UI_TEST when availability is 'on'", async () => {
    renderWith('on', <DashboardPage />);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByTestId('location')).toHaveTextContent('/checks/all?type=UI_TEST');
  });

  it.each<Availability>(['pending', 'off'])("is absent when availability is '%s'", (availability) => {
    renderWith(availability, <DashboardPage />);
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new check/i })).toBeInTheDocument();
  });
});
