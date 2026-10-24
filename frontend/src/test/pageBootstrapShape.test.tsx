import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import { renderStudioAt } from '@/test/renderStudioAt';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import FeatureGate from '@/components/shared/FeatureGate';
import CheckTypeSelector from '@/components/checks/wizard/CheckTypeSelector';
import ChecksStudioPage from '@/pages/ChecksStudioPage/ChecksStudioPage';

/**
 * Story 10.33 (PROD-1), AC-4 — the page-level reproduction, written by @qa at closure-plan step 2.7.
 *
 * The real module-singleton store, the real thunks, the real `apiClient` and an in-process mock
 * server: a 200 whose body is an HTML login page arrives on one bootstrap endpoint at a time (two
 * states, the wave-8 rule), and the consumers are then mounted the way `App.tsx` mounts them —
 * `ChecksStudioPage` inside `FeatureGate featureKey="STUDIO"` — plus `CheckTypeSelector`, which
 * reads `selectSources` directly.
 *
 * Red against the pre-guard thunks: the HTML body is `fulfilled`, a slice array becomes
 * `undefined`, and mounting throws `Cannot read properties of undefined (reading 'find')` (or
 * `'length'` for `CheckTypeSelector`). Green with the guard: the slice lands on its rejected,
 * fail-open state and every consumer renders.
 *
 * Placed in `src/test/` rather than the story's `pages/ChecksStudioPage/` path because of the
 * gate's write-ownership boundary; the imports are absolute, so the subject is identical.
 */

const API_BASE = '*/api/v1';
const htmlLoginPage = '<!doctype html><html><body><form action="/login">Sign in</form></body></html>';
const html = () =>
  new HttpResponse(htmlLoginPage, { status: 200, headers: { 'Content-Type': 'text/html' } });
const wellFormedSources = () => HttpResponse.json({ sources: [] });
const wellFormedFeatures = () => HttpResponse.json({ sources: [], features: [] });

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  studioMockServer.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.close();
});

async function bootstrapWith(sources: () => Response, features: () => Response) {
  studioMockServer.use(
    http.get(`${API_BASE}/checks/sources`, sources),
    http.get(`${API_BASE}/features`, features),
  );
  return Promise.all([store.dispatch(fetchSources()), store.dispatch(fetchFeatures())]);
}

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;

/** Mounts both consumers where the app mounts the editor: on a test id's editor route. */
function renderConsumers() {
  return renderStudioAt(
    readyDraft.id,
    <>
      <CheckTypeSelector selectedType="" onSelect={() => {}} />
      <FeatureGate featureKey="STUDIO">
        <ChecksStudioPage />
      </FeatureGate>
    </>,
    { wrapper: StoreProvider },
  );
}

describe('10.33 AC-4: a malformed bootstrap body never crashes the slices’ consumers', () => {
  it('state (i): HTML on */checks/sources, well-formed */features — renders without throwing', async () => {
    const [sources, features] = await bootstrapWith(html, wellFormedFeatures);
    expect(fetchSources.rejected.match(sources)).toBe(true);
    expect(fetchFeatures.fulfilled.match(features)).toBe(true);
    expect(Array.isArray(store.getState().sources.data)).toBe(true);

    expect(() => renderConsumers()).not.toThrow();
    // Not vacuous: the gate let the page through and the wizard rendered its options.
    expect(screen.queryByText('Feature Unavailable')).toBeNull();
    expect(screen.getAllByText(/HTTP/u).length).toBeGreaterThan(0);
  });

  it('state (ii): well-formed */checks/sources, HTML on */features — renders without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const [sources, features] = await bootstrapWith(wellFormedSources, html);
    expect(fetchSources.fulfilled.match(sources)).toBe(true);
    expect(fetchFeatures.rejected.match(features)).toBe(true);
    expect(Array.isArray(store.getState().features.features)).toBe(true);
    expect(Array.isArray(store.getState().features.sources)).toBe(true);

    expect(() => renderConsumers()).not.toThrow();
    expect(screen.queryByText('Feature Unavailable')).toBeNull();
    expect(screen.getAllByText(/HTTP/u).length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
