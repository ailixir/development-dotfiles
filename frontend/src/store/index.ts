import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import checksSlice from './slices/checksSlice';
import csiSlice from './slices/csiSlice';
import studioSlice from './slices/studioSlice';
import reportsSlice from './slices/reportsSlice';
import uiSlice from './slices/uiSlice';
import dashboardSlice from './slices/dashboardSlice';
import sourcesSlice, { fetchSources } from './slices/sourcesSlice';
import featuresSlice, { fetchFeatures } from './slices/featuresSlice';

export const store = configureStore({
  reducer: {
    checks: checksSlice,
    csi: csiSlice,
    studio: studioSlice,
    reports: reportsSlice,
    ui: uiSlice,
    dashboard: dashboardSlice,
    sources: sourcesSlice,
    features: featuresSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for serialization checks
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        // Ignore these field paths in all actions
        ignoredActionsPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        ignoredPaths: ['items.dates'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks for use throughout the application
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Lightweight persistence for dashboard preferences (Phase 3 groundwork)
const PERSIST_VERSION = 'v1';
const PINNED_KEY = `checks.pinnedCsiIds.${PERSIST_VERSION}`;
const SEARCH_CTX_KEY = `checks.searchContext.${PERSIST_VERSION}`;

async function hydrateDashboardPreferences() {
  try {
    const pinnedRaw = window.localStorage.getItem(PINNED_KEY);
    if (pinnedRaw) {
      const pinned = JSON.parse(pinnedRaw);
      if (Array.isArray(pinned)) {
        store.dispatch({ type: 'dashboard/setPinnedCsiIds', payload: pinned });
      }
    }

    const ctxRaw = window.localStorage.getItem(SEARCH_CTX_KEY);
    if (ctxRaw) {
      const ctx = JSON.parse(ctxRaw);
      if (ctx && typeof ctx === 'object' && ('csiId' in ctx)) {
        store.dispatch({ type: 'dashboard/setSearchContext', payload: { csiId: ctx.csiId } });
        // Set filters separately to respect reducer constraints
        store.dispatch({ type: 'dashboard/setSearchFilters', payload: { environment: ctx.environment ?? null, tags: ctx.tags ?? [], tagMode: ctx.tagMode ?? 'AND' } });
      }
    }
  } catch {
    // no-op
  }
}

function persistDashboardPreferences(state: RootState) {
  try {
    const pinned = state.dashboard.pinnedCsiIds;
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
    const ctx = state.dashboard.searchContext;
    window.localStorage.setItem(SEARCH_CTX_KEY, JSON.stringify(ctx));
  } catch {
    // no-op
  }
}

// Hydrate immediately in browser
if (typeof window !== 'undefined') {
  hydrateDashboardPreferences();

  // Fetch check sources at bootstrap (fail-open on error)
  store.dispatch(fetchSources());
  store.dispatch(fetchFeatures());

  let last = store.getState().dashboard;
  store.subscribe(() => {
    const current = store.getState().dashboard;
    if (current !== last) {
      last = current;
      persistDashboardPreferences(store.getState());
    }
  });
}