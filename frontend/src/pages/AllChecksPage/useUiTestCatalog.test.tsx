import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import sourcesReducer, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresReducer, { fetchFeatures } from '@/store/slices/featuresSlice';
import type { CheckSource } from '@/services/api/sourcesApi';
import type { FeatureFlag, FeaturesResponse } from '@/services/api/featuresApi';
import studioApi from '@/services/api/studioApi';
import type { TestDto, TestPage } from '@/types/studio/studioTypes';
import { UI_TEST_CATALOG_SIZE, useUiTestCatalog, type UiTestCatalogQuery } from './useUiTestCatalog';

vi.mock('@/services/api/studioApi', () => ({
  default: { listTests: vi.fn() },
}));

const listTests = vi.mocked(studioApi.listTests);

const testDto = (id: string): TestDto => ({ id, name: `Test ${id}` }) as TestDto;

const pageOf = (ids: string[], totalElements = ids.length): TestPage => ({
  data: ids.map(testDto),
  page: 0,
  size: UI_TEST_CATALOG_SIZE,
  totalElements,
  totalPages: 1,
});

interface Deferred {
  resolve: (page: TestPage) => void;
  reject: (failure: unknown) => void;
  signal: AbortSignal | undefined;
}

/** Makes every listTests call wait, and lets the test settle each one by hand. */
function holdRequests(): Deferred[] {
  const held: Deferred[] = [];
  listTests.mockImplementation(
    (_params, options) =>
      new Promise<TestPage>((resolve, reject) => {
        held.push({ resolve, reject, signal: options?.signal });
      }),
  );
  return held;
}

const source = (type: string, enabled: boolean): CheckSource => ({ type, enabled, label: type });
const feature = (key: string, enabled: boolean): FeatureFlag => ({ key, enabled, label: key });

function setup(initial: UiTestCatalogQuery = {}) {
  const store = configureStore({ reducer: { sources: sourcesReducer, features: featuresReducer } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const view = renderHook((query: UiTestCatalogQuery) => useUiTestCatalog(query), {
    wrapper,
    initialProps: initial,
  });
  const answerSources = (sources: CheckSource[]) =>
    act(() => { store.dispatch(fetchSources.fulfilled(sources, '')); });
  const answerFeatures = (features: FeatureFlag[]) => {
    const response: FeaturesResponse = { sources: [], features };
    act(() => { store.dispatch(fetchFeatures.fulfilled(response, '')); });
  };
  const makeAvailable = () => {
    answerSources([source('UI_TEST', true)]);
    answerFeatures([feature('STUDIO', true)]);
  };
  return { ...view, answerSources, answerFeatures, makeAvailable };
}

const settle = async (action: () => void) => {
  await act(async () => {
    action();
    await Promise.resolve();
  });
};

describe('useUiTestCatalog', () => {
  beforeEach(() => {
    listTests.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends nothing while availability is 'pending'", () => {
    const { result, answerSources } = setup({ csiId: 'CSI-1' });
    answerSources([source('UI_TEST', true)]);

    expect(listTests).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ tests: [], totalElements: 0, loading: false, error: null });
  });

  it("sends nothing when availability is 'off', whichever side switched it off", () => {
    const sourceOff = setup();
    sourceOff.answerSources([source('UI_TEST', false)]);
    sourceOff.answerFeatures([feature('STUDIO', true)]);

    const featureOff = setup();
    featureOff.answerSources([source('UI_TEST', true)]);
    featureOff.answerFeatures([feature('STUDIO', false)]);

    expect(listTests).not.toHaveBeenCalled();
    expect(sourceOff.result.current).toMatchObject({ tests: [], totalElements: 0, loading: false, error: null });
    expect(featureOff.result.current).toMatchObject({ tests: [], totalElements: 0, loading: false, error: null });
  });

  it('requests the server filters, the updatedAt sort and the 100-row page once it is on', async () => {
    listTests.mockResolvedValue(pageOf(['a', 'b'], 2));
    const { result, makeAvailable } = setup({ csiId: 'CSI-1', environment: 'staging', q: 'login' });

    await act(async () => { makeAvailable(); });

    expect(listTests).toHaveBeenCalledTimes(1);
    expect(listTests).toHaveBeenCalledWith(
      { csiId: 'CSI-1', environment: 'staging', q: 'login', sort: 'updatedAt,desc', size: 100 },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.tests.map((test) => test.id)).toEqual(['a', 'b']);
    expect(result.current).toMatchObject({ totalElements: 2, loading: false, error: null });
  });

  it('leaves blank filters out of the request', async () => {
    listTests.mockResolvedValue(pageOf([]));
    const { makeAvailable } = setup({ csiId: null, environment: '  ', q: '   ' });

    await act(async () => { makeAvailable(); });

    expect(listTests).toHaveBeenCalledWith(
      { csiId: undefined, environment: undefined, q: undefined, sort: 'updatedAt,desc', size: 100 },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('is loading until the first answer, never reporting an empty catalog first', async () => {
    const held = holdRequests();
    const { result, makeAvailable } = setup();

    await act(async () => { makeAvailable(); });
    expect(result.current).toMatchObject({ tests: [], loading: true, error: null });

    await settle(() => held[0].resolve(pageOf(['a'])));
    expect(result.current).toMatchObject({ loading: false });
    expect(result.current.tests).toHaveLength(1);
  });

  it('reports the server total when it is above the page', async () => {
    listTests.mockResolvedValue(pageOf(['a'], 150));
    const { result, makeAvailable } = setup();

    await act(async () => { makeAvailable(); });

    expect(result.current.totalElements).toBe(150);
    expect(result.current.tests).toHaveLength(1);
  });

  it('debounces the search text into one request per settled change', async () => {
    listTests.mockResolvedValue(pageOf([]));
    const { rerender, makeAvailable } = setup({ q: '' });
    await act(async () => { makeAvailable(); });
    expect(listTests).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    rerender({ q: 'l' });
    rerender({ q: 'lo' });
    rerender({ q: 'log' });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(listTests).toHaveBeenCalledTimes(1);

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(listTests).toHaveBeenCalledTimes(2);
    expect(listTests).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'log' }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('sends a system change at once and aborts the request it supersedes', async () => {
    const held = holdRequests();
    const { rerender, makeAvailable } = setup({ csiId: 'CSI-1' });
    await act(async () => { makeAvailable(); });
    expect(held).toHaveLength(1);
    expect(held[0].signal?.aborted).toBe(false);

    rerender({ csiId: 'CSI-2' });

    expect(held).toHaveLength(2);
    expect(held[0].signal?.aborted).toBe(true);
    expect(held[1].signal?.aborted).toBe(false);
    expect(listTests).toHaveBeenLastCalledWith(
      expect.objectContaining({ csiId: 'CSI-2' }),
      { signal: held[1].signal },
    );
  });

  it('ignores the answer of a superseded request', async () => {
    const held = holdRequests();
    const { result, rerender, makeAvailable } = setup({ csiId: 'CSI-1' });
    await act(async () => { makeAvailable(); });
    rerender({ csiId: 'CSI-2' });

    await settle(() => held[1].resolve(pageOf(['new'], 1)));
    await settle(() => held[0].resolve(pageOf(['old'], 1)));

    expect(result.current.tests.map((test) => test.id)).toEqual(['new']);
  });

  it('aborts the in-flight request on unmount', async () => {
    const held = holdRequests();
    const { unmount, makeAvailable } = setup();
    await act(async () => { makeAvailable(); });

    unmount();

    expect(held[0].signal?.aborted).toBe(true);
  });

  it('sets the error, drops the rows and retries with the same request', async () => {
    listTests.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(pageOf(['a'], 1));
    const { result, makeAvailable } = setup({ csiId: 'CSI-1' });

    await act(async () => { makeAvailable(); });
    expect(result.current).toMatchObject({ tests: [], totalElements: 0, loading: false });
    expect(result.current.error).toBe('UI tests could not be loaded');

    await act(async () => { result.current.retry(); });

    expect(listTests).toHaveBeenCalledTimes(2);
    expect(listTests.mock.calls[1][0]).toEqual(listTests.mock.calls[0][0]);
    expect(result.current.error).toBeNull();
    expect(result.current.tests.map((test) => test.id)).toEqual(['a']);
  });

  it('does not report an error for an aborted request', async () => {
    const held = holdRequests();
    const { result, rerender, makeAvailable } = setup({ csiId: 'CSI-1' });
    await act(async () => { makeAvailable(); });
    rerender({ csiId: 'CSI-2' });

    await settle(() => held[0].reject(new Error('canceled')));

    expect(result.current.error).toBeNull();
  });

  it("stops requesting and hides the rows when sources arrive switched off after being 'on'", async () => {
    listTests.mockResolvedValue(pageOf(['a'], 1));
    const { result, makeAvailable, answerSources } = setup();
    await act(async () => { makeAvailable(); });
    expect(result.current.tests).toHaveLength(1);

    answerSources([source('UI_TEST', false)]);

    expect(result.current).toMatchObject({ tests: [], totalElements: 0, loading: false, error: null });
    expect(listTests).toHaveBeenCalledTimes(1);
  });
});
