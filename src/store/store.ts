import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

import checksReducer from './slices/checksSlice';
import studioReducer from './slices/studioSlice';
import reportsReducer from './slices/reportsSlice';

// Configure the store
export const store = configureStore({
  reducer: {
    checks: checksReducer,
    studio: studioReducer,
    reports: reportsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        ignoredPaths: ['register'],
      },
    }),
  devTools: process.env.NODE_ENV === 'development',
});

// Export types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
