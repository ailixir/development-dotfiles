import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import {
  DEFAULT_TEST_SORT,
  TEST_LAST_RUN_FILTERS,
  isTestSort,
  type TestLastRunFilter,
  type TestSort,
} from '@/types/studio/studioTypes';
import { useUrlListState, type UrlListState } from './useUrlListState';

type Filters = { lastRun: '' | TestLastRunFilter; environment: string };
type State = UrlListState<Filters, TestSort>;

let state: State;

function Harness() {
  state = useUrlListState<Filters, TestSort>({
    filters: {
      lastRun: { defaultValue: '', values: ['', ...TEST_LAST_RUN_FILTERS] },
      environment: { defaultValue: '' },
    },
    defaultSort: DEFAULT_TEST_SORT,
    isSort: isTestSort,
  });
  return null;
}

function setup(initial = '/list') {
  const router = createMemoryRouter([{ path: '/list', element: <Harness /> }], {
    initialEntries: [initial],
  });
  render(<RouterProvider router={router} />);
  const search = () => new URLSearchParams(router.state.location.search);
  return { router, search };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useUrlListState', () => {
  it('reads typed defaults from an empty URL', () => {
    setup();
    expect(state.query).toBe('');
    expect(state.debouncedQuery).toBe('');
    expect(state.filters).toEqual({ lastRun: '', environment: '' });
    expect(state.sort).toBe('updatedAt,desc');
    expect(state.sortField).toBe('updatedAt');
    expect(state.sortDirection).toBe('desc');
    expect(state.page).toBe(1);
    expect(state.hasActiveFilters).toBe(false);
  });

  it('reads state from the URL and ignores invalid values', () => {
    setup('/list?q=login&lastRun=FAILED&environment=Production&sort=name,asc&page=3');
    expect(state.query).toBe('login');
    expect(state.filters).toEqual({ lastRun: 'FAILED', environment: 'Production' });
    expect(state.sort).toBe('name,asc');
    expect(state.page).toBe(3);
    expect(state.hasActiveFilters).toBe(true);
  });

  it('falls back to defaults for unknown sort, filter value and page', () => {
    setup('/list?lastRun=BOGUS&sort=id,asc&page=-2');
    expect(state.filters.lastRun).toBe('');
    expect(state.sort).toBe(DEFAULT_TEST_SORT);
    expect(state.page).toBe(1);
  });

  it('debounces q by 300 ms, replaces history, trims and resets the page', () => {
    const { router, search } = setup('/list?page=2');
    act(() => state.setQuery('  log'));
    expect(state.query).toBe('  log');
    expect(search().get('q')).toBeNull();

    act(() => { vi.advanceTimersByTime(200); });
    act(() => state.setQuery('  login '));
    act(() => { vi.advanceTimersByTime(299); });
    expect(search().get('q')).toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(search().get('q')).toBe('login');
    expect(search().get('page')).toBeNull();
    expect(state.debouncedQuery).toBe('login');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('clearing the search removes q from the URL', () => {
    const { search } = setup('/list?q=login');
    act(() => state.setQuery(''));
    act(() => { vi.advanceTimersByTime(300); });
    expect(search().has('q')).toBe(false);
  });

  it('pushes filter changes, resets the page and omits defaults', () => {
    const { router, search } = setup('/list?page=4');
    act(() => state.setFilter('lastRun', 'NEVER'));
    expect(search().get('lastRun')).toBe('NEVER');
    expect(search().get('page')).toBeNull();
    expect(router.state.historyAction).toBe('PUSH');

    act(() => state.setFilter('lastRun', ''));
    expect(search().has('lastRun')).toBe(false);
  });

  it('pushes page changes and omits page 1', () => {
    const { router, search } = setup();
    act(() => state.setPage(3));
    expect(search().get('page')).toBe('3');
    expect(router.state.historyAction).toBe('PUSH');
    act(() => state.setPage(1));
    expect(search().has('page')).toBe(false);
  });

  it('toggles sort: same field flips, new field takes its first direction', () => {
    const { search } = setup('/list?page=2');
    act(() => state.toggleSort('name'));
    expect(search().get('sort')).toBe('name,asc');
    expect(search().has('page')).toBe(false);
    act(() => state.toggleSort('name'));
    expect(search().get('sort')).toBe('name,desc');
    act(() => state.toggleSort('lastRunAt', 'desc'));
    expect(search().get('sort')).toBe('lastRunAt,desc');
    act(() => state.setSort(DEFAULT_TEST_SORT));
    expect(search().has('sort')).toBe(false);
  });

  it('back navigation restores the previous state, including the search box', () => {
    const { router } = setup('/list?q=login');
    act(() => state.setFilter('lastRun', 'FAILED'));
    act(() => state.clearAll());
    expect(state.query).toBe('');
    expect(state.hasActiveFilters).toBe(false);

    act(() => { void router.navigate(-1); });
    expect(state.filters.lastRun).toBe('FAILED');
    expect(state.query).toBe('login');
  });

  it('clearAll keeps the sort and parameters it does not own', () => {
    const { search } = setup('/list?q=x&lastRun=PASSED&environment=UAT&sort=name,asc&page=2&run=abc');
    act(() => state.clearAll());
    expect(search().toString()).toBe('sort=name%2Casc&run=abc');
  });

  it('a pending search keeps a sort or filter changed while it was debouncing', () => {
    const { search } = setup();
    act(() => state.setQuery('smoke'));
    act(() => state.toggleSort('lastRunAt', 'desc'));
    act(() => state.setFilter('lastRun', 'FAILED'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(search().get('q')).toBe('smoke');
    expect(search().get('sort')).toBe('lastRunAt,desc');
    expect(search().get('lastRun')).toBe('FAILED');
  });

  it('a pending search does not fire after clearAll', () => {
    const { search } = setup();
    act(() => state.setQuery('abc'));
    act(() => state.clearAll());
    act(() => { vi.advanceTimersByTime(500); });
    expect(search().has('q')).toBe(false);
  });
});
