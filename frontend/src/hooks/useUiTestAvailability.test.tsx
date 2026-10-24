import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import sourcesReducer, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresReducer, { fetchFeatures } from '@/store/slices/featuresSlice';
import type { CheckSource } from '@/services/api/sourcesApi';
import type { FeatureFlag, FeaturesResponse } from '@/services/api/featuresApi';
import { useUiTestAvailability } from './useUiTestAvailability';

function setup() {
  const store = configureStore({ reducer: { sources: sourcesReducer, features: featuresReducer } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useUiTestAvailability(), { wrapper });
  return { store, result };
}

const source = (type: string, enabled: boolean): CheckSource => ({ type, enabled, label: type });
const feature = (key: string, enabled: boolean): FeatureFlag => ({ key, enabled, label: key });

type Store = ReturnType<typeof setup>['store'];

const answerSources = (store: Store, sources: CheckSource[]) =>
  act(() => { store.dispatch(fetchSources.fulfilled(sources, '')); });

const answerFeatures = (store: Store, features: FeatureFlag[]) => {
  const response: FeaturesResponse = { sources: [], features };
  act(() => { store.dispatch(fetchFeatures.fulfilled(response, '')); });
};

describe('useUiTestAvailability', () => {
  it("is 'pending' before anything is fetched", () => {
    const { result } = setup();
    expect(result.current).toBe('pending');
  });

  it("stays 'pending' until both sources and features are fetched", () => {
    const { store, result } = setup();
    answerSources(store, [source('UI_TEST', true)]);
    expect(result.current).toBe('pending');

    answerFeatures(store, [feature('STUDIO', true)]);
    expect(result.current).toBe('on');
  });

  it("stays 'pending' when only features have been fetched", () => {
    const { store, result } = setup();
    answerFeatures(store, [feature('STUDIO', true)]);
    expect(result.current).toBe('pending');
  });

  it("is 'on' when the UI_TEST source and the STUDIO feature are enabled", () => {
    const { store, result } = setup();
    answerSources(store, [source('HTTP', true), source('UI_TEST', true)]);
    answerFeatures(store, [feature('SCHEDULING', true), feature('STUDIO', true)]);
    expect(result.current).toBe('on');
  });

  it("is 'on' for empty sources and features lists (fail-open)", () => {
    const { store, result } = setup();
    answerSources(store, []);
    answerFeatures(store, []);
    expect(result.current).toBe('on');
  });

  it("is 'on' when the entries are missing from non-empty lists (fail-open)", () => {
    const { store, result } = setup();
    answerSources(store, [source('HTTP', true)]);
    answerFeatures(store, [feature('REPORTS', true)]);
    expect(result.current).toBe('on');
  });

  it("is 'off' when the UI_TEST source is disabled", () => {
    const { store, result } = setup();
    answerSources(store, [source('UI_TEST', false)]);
    answerFeatures(store, [feature('STUDIO', true)]);
    expect(result.current).toBe('off');
  });

  it("is 'off' when the STUDIO feature is disabled", () => {
    const { store, result } = setup();
    answerSources(store, [source('UI_TEST', true)]);
    answerFeatures(store, [feature('STUDIO', false)]);
    expect(result.current).toBe('off');
  });

  it("moves from 'on' to 'off' when a late fetch disables UI tests", () => {
    const { store, result } = setup();
    answerSources(store, []);
    answerFeatures(store, [feature('STUDIO', true)]);
    expect(result.current).toBe('on');

    answerSources(store, [source('UI_TEST', false)]);
    expect(result.current).toBe('off');
  });

  it("ends 'pending' when the fetches fail, and then applies fail-open", () => {
    const { store, result } = setup();
    act(() => { store.dispatch(fetchSources.rejected(new Error('down'), '')); });
    expect(result.current).toBe('pending');

    act(() => { store.dispatch(fetchFeatures.rejected(new Error('down'), '')); });
    expect(result.current).toBe('on');
  });
});
