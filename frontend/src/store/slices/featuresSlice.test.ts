import { configureStore } from '@reduxjs/toolkit';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { featuresApi, type FeaturesResponse } from '@/services/api/featuresApi';
import featuresReducer, {
  fetchFeatures,
  selectFeatures,
  selectFeatureSources,
  selectIsFeatureEnabled,
  selectIsSourceEnabledFromFeatures,
} from './featuresSlice';

afterEach(()=>{ vi.restoreAllMocks(); });
describe('feature response validation',()=>{
  it.each([{}, {sources:[],features:[null]}, {sources:null,features:[]}])('rejects malformed successful bodies without corrupting state: %j',async(body)=>{
    vi.spyOn(featuresApi,'getFeatures').mockResolvedValueOnce(body as unknown as FeaturesResponse);
    const store=configureStore({reducer:{features:featuresReducer}});
    const result=await store.dispatch(fetchFeatures());
    expect(fetchFeatures.rejected.match(result)).toBe(true);
    expect(store.getState().features.error).toBe('Invalid feature flags response');
    expect(selectIsFeatureEnabled('STUDIO')(store.getState())).toBe(true);
    expect(store.getState().features.features).not.toHaveLength(0);
  });
  it('retains a previously disabled flag when a later response is malformed',async()=>{
    const store=configureStore({reducer:{features:featuresReducer}});
    store.dispatch(fetchFeatures.fulfilled({sources:[],features:[{key:'STUDIO',enabled:false,label:'Studio'}]},'known'));
    vi.spyOn(featuresApi,'getFeatures').mockResolvedValueOnce({} as FeaturesResponse);
    await store.dispatch(fetchFeatures());
    expect(selectIsFeatureEnabled('STUDIO')(store.getState())).toBe(false);
  });
});

/**
 * Story 10.33 (PROD-1), AC-2 / AC-3 / AC-4 — written by @qa at closure-plan step 2.7.
 *
 * The real `fetchFeatures()` thunk runs against a real HTTP response through `apiClient`/axios.
 * Red against the pre-guard thunk (`return response;` only): every malformed case below is
 * `fulfilled`, and `state.features.sources`/`state.features.features` are left `undefined`.
 */
const featuresServer = setupServer();
const htmlLoginPage = '<!doctype html><html><body><form action="/login">Sign in</form></body></html>';
const respondWith = (resolver: () => Response) => featuresServer.use(http.get('*/features', resolver));
/** The exact state the existing `.rejected` branch produces for a network failure on a fresh slice. */
const rejectedState = (message: string) =>
  featuresReducer(undefined, fetchFeatures.rejected(new Error(message), ''));

describe('10.33 — fetchFeatures refuses a malformed 200 body (dispatching the real thunk over HTTP)', () => {
  beforeAll(() => {
    featuresServer.listen({ onUnhandledRequest: 'error' });
  });
  afterEach(() => featuresServer.resetHandlers());
  afterAll(() => featuresServer.close());

  it.each([
    ['an HTML login page', () => new HttpResponse(htmlLoginPage, { status: 200, headers: { 'Content-Type': 'text/html' } })],
    ['an empty body', () => new HttpResponse('', { status: 200 })],
    ['{}', () => HttpResponse.json({})],
    ['[]', () => HttpResponse.json([])],
    ["{ sources: 'not-an-array', features: [] }", () => HttpResponse.json({ sources: 'not-an-array', features: [] })],
    ["{ sources: [], features: 'not-an-array' }", () => HttpResponse.json({ sources: [], features: 'not-an-array' })],
    ['{ sources: [] } (features missing)', () => HttpResponse.json({ sources: [] })],
  ])('AC-2/AC-3: %s ends on the rejected fail-open state, never fulfilled', async (_label, resolver) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith(resolver);
    const store = configureStore({ reducer: { features: featuresReducer } });
    const result = await store.dispatch(fetchFeatures());

    expect(fetchFeatures.rejected.match(result)).toBe(true);
    const state = store.getState().features;
    expect(state.error).toEqual(expect.any(String));
    expect(state.error).not.toBe('');
    // AC-3: identical to what the rejected branch already produces (DEFAULT_SOURCES/DEFAULT_FEATURES).
    expect(state).toEqual(rejectedState(state.error!));
    expect(state.features.map((f) => f.key)).toContain('STUDIO');
    expect(state.sources.map((s) => s.type)).toContain('UI_TEST');
    // AC-4: the selectors FeatureGate (and the source-from-features path) read through stay non-empty arrays.
    for (const selected of [selectFeatures(store.getState()), selectFeatureSources(store.getState())]) {
      expect(Array.isArray(selected)).toBe(true);
      expect(selected.length).toBeGreaterThan(0);
    }
    expect(() => selectIsFeatureEnabled('STUDIO')(store.getState())).not.toThrow();
    expect(() => selectIsSourceEnabledFromFeatures('UI_TEST')(store.getState())).not.toThrow();
  });

  it('AC-2: an undefined response is refused the same way', async () => {
    vi.spyOn(featuresApi, 'getFeatures').mockResolvedValueOnce(undefined as unknown as FeaturesResponse);
    const store = configureStore({ reducer: { features: featuresReducer } });
    const result = await store.dispatch(fetchFeatures());
    expect(fetchFeatures.rejected.match(result)).toBe(true);
    expect(store.getState().features.features.length).toBeGreaterThan(0);
  });

  it('CONTROL: a well-formed { sources: [], features: [] } is still stored via fulfilled, unchanged', async () => {
    respondWith(() => HttpResponse.json({ sources: [], features: [] }));
    const store = configureStore({ reducer: { features: featuresReducer } });
    const result = await store.dispatch(fetchFeatures());
    expect(fetchFeatures.fulfilled.match(result)).toBe(true);
    expect(store.getState().features).toEqual({ sources: [], features: [], loading: false, error: null, fetched: true });
  });

  it('CONTROL: a well-formed non-empty body is still stored via fulfilled, unchanged', async () => {
    const body = {
      sources: [{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }],
      features: [{ key: 'STUDIO', enabled: false, label: 'Checks Studio' }],
    };
    respondWith(() => HttpResponse.json(body));
    const store = configureStore({ reducer: { features: featuresReducer } });
    const result = await store.dispatch(fetchFeatures());
    expect(fetchFeatures.fulfilled.match(result)).toBe(true);
    expect(store.getState().features.sources).toEqual(body.sources);
    expect(store.getState().features.features).toEqual(body.features);
    expect(selectIsFeatureEnabled('STUDIO')(store.getState())).toBe(false);
  });

  it('CONTROL: a 404 still rejects and fails open, unchanged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith(() => new HttpResponse(null, { status: 404 }));
    const store = configureStore({ reducer: { features: featuresReducer } });
    const result = await store.dispatch(fetchFeatures());
    expect(fetchFeatures.rejected.match(result)).toBe(true);
    expect(store.getState().features.error).toMatch(/404/u);
    expect(store.getState().features.features.map((f) => f.key)).toContain('STUDIO');
  });
});
