import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { sourcesApi, type CheckSourcesResponse } from '@/services/api/sourcesApi';
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

/**
 * Story 10.33 (PROD-1), AC-1 / AC-3 / AC-4 — written by @qa at closure-plan step 2.7.
 *
 * The real `fetchSources()` thunk runs against a real HTTP response through `apiClient`/axios, so
 * a non-JSON 200 reaches the thunk the way it would in production (axios hands back the raw text;
 * it does not throw). Red against the pre-guard thunk (`return response.sources;` only): every
 * malformed case below is `fulfilled` with `undefined` and `state.sources.data` is left `undefined`.
 */
const sourcesServer = setupServer();
const htmlLoginPage = '<!doctype html><html><body><form action="/login">Sign in</form></body></html>';
const respondWith = (resolver: () => Response) => sourcesServer.use(http.get('*/checks/sources', resolver));
/** The exact state the existing `.rejected` branch produces for a network failure on a fresh slice. */
const rejectedState = (message: string) =>
  sourcesReducer(undefined, fetchSources.rejected(new Error(message), ''));

describe('10.33 — fetchSources refuses a malformed 200 body (dispatching the real thunk over HTTP)', () => {
  beforeAll(() => {
    sourcesServer.listen({ onUnhandledRequest: 'error' });
    // apiClient logs every failed request; the 404 control's line is expected noise here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => sourcesServer.resetHandlers());
  afterAll(() => {
    sourcesServer.close();
    vi.restoreAllMocks();
  });

  it.each([
    ['an HTML login page', () => new HttpResponse(htmlLoginPage, { status: 200, headers: { 'Content-Type': 'text/html' } })],
    ['an empty body', () => new HttpResponse('', { status: 200 })],
    ['{}', () => HttpResponse.json({})],
    ['[]', () => HttpResponse.json([])],
    ["{ sources: 'not-an-array' }", () => HttpResponse.json({ sources: 'not-an-array' })],
  ])('AC-1/AC-3: %s ends on the rejected fail-open state, never fulfilled', async (_label, resolver) => {
    respondWith(resolver);
    const store = configureStore({ reducer: { sources: sourcesReducer } });
    const result = await store.dispatch(fetchSources());

    expect(fetchSources.rejected.match(result)).toBe(true);
    const state = store.getState().sources;
    expect(state.error).toEqual(expect.any(String));
    expect(state.error).not.toBe('');
    // AC-3: identical to what the rejected branch already produces (7-item fail-open list).
    expect(state).toEqual(rejectedState(state.error!));
    expect(state.data).toHaveLength(7);
    // AC-4: the selector CheckTypeSelector/AllChecksPage read through stays a non-empty array.
    expect(Array.isArray(selectSources(store.getState()))).toBe(true);
    expect(selectSources(store.getState()).length).toBeGreaterThan(0);
    expect(() => selectIsSourceEnabled('UI_TEST')(store.getState())).not.toThrow();
  });

  it('AC-1: an undefined response is refused the same way', async () => {
    const spy = vi.spyOn(sourcesApi, 'getSources').mockResolvedValueOnce(undefined as unknown as CheckSourcesResponse);
    try {
      const store = configureStore({ reducer: { sources: sourcesReducer } });
      const result = await store.dispatch(fetchSources());
      expect(fetchSources.rejected.match(result)).toBe(true);
      expect(store.getState().sources.data).toHaveLength(7);
    } finally {
      spy.mockRestore();
    }
  });

  it('CONTROL: a well-formed { sources: [] } is still stored via fulfilled, unchanged', async () => {
    respondWith(() => HttpResponse.json({ sources: [] }));
    const store = configureStore({ reducer: { sources: sourcesReducer } });
    const result = await store.dispatch(fetchSources());
    expect(fetchSources.fulfilled.match(result)).toBe(true);
    expect(store.getState().sources).toEqual({ data: [], loading: false, error: null, fetched: true });
  });

  it('CONTROL: a well-formed non-empty body is still stored via fulfilled, unchanged', async () => {
    const sources = [
      { type: 'HTTP', enabled: true, label: 'HTTP/HTTPS Check' },
      { type: 'UI_TEST', enabled: false, label: 'UI Test (Checks Studio)' },
    ];
    respondWith(() => HttpResponse.json({ sources }));
    const store = configureStore({ reducer: { sources: sourcesReducer } });
    const result = await store.dispatch(fetchSources());
    expect(fetchSources.fulfilled.match(result)).toBe(true);
    expect(store.getState().sources.data).toEqual(sources);
    expect(selectIsSourceEnabled('UI_TEST')(store.getState())).toBe(false);
  });

  it('CONTROL: a 404 still rejects and fails open, unchanged', async () => {
    respondWith(() => new HttpResponse(null, { status: 404 }));
    const store = configureStore({ reducer: { sources: sourcesReducer } });
    const result = await store.dispatch(fetchSources());
    expect(fetchSources.rejected.match(result)).toBe(true);
    expect(store.getState().sources.error).toMatch(/404/u);
    expect(store.getState().sources.data).toHaveLength(7);
  });
});
