import { describe, it, expect } from 'vitest';
import sourcesReducer, { fetchSources, selectIsSourceEnabled, selectSources } from './sourcesSlice';

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
});
