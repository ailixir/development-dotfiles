import { describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { sourcesApi, type CheckSourcesResponse } from '@/services/api/sourcesApi';
import sourcesReducer, { fetchSources, selectIsSourceEnabled } from './sourcesSlice';

describe('sourcesSlice', () => {
  it('should return initial state', () => {
    const state = sourcesReducer(undefined as any, { type: '@@INIT' } as any);
    expect(state.data).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.fetched).toBe(false);
  });

  it('should handle fetchSources.pending', () => {
    const state = sourcesReducer(undefined as any, fetchSources.pending(''));
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it('should handle fetchSources.fulfilled', () => {
    const sources = [
      { type: 'HTTP', enabled: true, label: 'HTTP/HTTPS Check' },
      { type: 'TCP', enabled: true, label: 'TCP Port Check' },
      { type: 'SPLUNK', enabled: false, label: 'Splunk Query' },
    ];
    const state = sourcesReducer(
      undefined as any,
      fetchSources.fulfilled(sources, '')
    );
    expect(state.data).toEqual(sources);
    expect(state.loading).toBe(false);
    expect(state.fetched).toBe(true);
  });

  it('should fail-open on fetchSources.rejected with fallback data', () => {
    const state = sourcesReducer(
      undefined as any,
      fetchSources.rejected(new Error('Network error'), '')
    );
    expect(state.loading).toBe(false);
    expect(state.fetched).toBe(true);
    expect(state.data.length).toBe(7);
    expect(state.data.every((s: any) => s.enabled)).toBe(true);
  });

  it('selectIsSourceEnabled returns true for enabled type', () => {
    const state = {
      sources: {
        data: [
          { type: 'HTTP', enabled: true, label: 'HTTP' },
          { type: 'SPLUNK', enabled: false, label: 'Splunk' },
        ],
        loading: false,
        error: null,
        fetched: true,
      },
    };
    expect(selectIsSourceEnabled('HTTP')(state)).toBe(true);
    expect(selectIsSourceEnabled('SPLUNK')(state)).toBe(false);
  });

  it('selectIsSourceEnabled returns true (fail-open) when sources not yet loaded', () => {
    const state = {
      sources: {
        data: [],
        loading: false,
        error: null,
        fetched: false,
      },
    };
    expect(selectIsSourceEnabled('SPLUNK')(state)).toBe(true);
  });
  it('rejects malformed successful API bodies through the existing failure path', async () => {
    const spy = vi.spyOn(sourcesApi, 'getSources').mockResolvedValueOnce({} as CheckSourcesResponse);
    try {
      const store = configureStore({reducer:{sources:sourcesReducer}});
      const result = await store.dispatch(fetchSources());
      expect(fetchSources.rejected.match(result)).toBe(true);
      expect(store.getState().sources.error).toBe('Invalid check sources response');
      expect(selectIsSourceEnabled('UI_TEST')(store.getState())).toBe(true);
      expect(store.getState().sources.data).toHaveLength(7);
    } finally { spy.mockRestore(); }
  });

});
