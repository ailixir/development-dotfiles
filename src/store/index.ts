import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import checksSlice from './slices/checksSlice';
import csiSlice from './slices/csiSlice';
import studioSlice from './slices/studioSlice';
import reportsSlice from './slices/reportsSlice';
import uiSlice from './slices/uiSlice';
import dashboardSlice from './slices/dashboardSlice';

export const store = configureStore({
  reducer: {
    checks: checksSlice,
    csi: csiSlice,
    studio: studioSlice,
    reports: reportsSlice,
    ui: uiSlice,
    dashboard: dashboardSlice,
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