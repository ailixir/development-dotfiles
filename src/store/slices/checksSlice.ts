import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Check, CheckFilters, CheckStatus } from '@/types/checks.types';

interface ChecksState {
  checks: Check[];
  selectedCheck: Check | null;
  filters: CheckFilters;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const initialState: ChecksState = {
  checks: [],
  selectedCheck: null,
  filters: {},
  loading: false,
  error: null,
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  },
};

const checksSlice = createSlice({
  name: 'checks',
  initialState,
  reducers: {
    // Loading states
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },
    
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.loading = false;
    },
    
    clearError: (state) => {
      state.error = null;
    },

    // Checks management
    setChecks: (state, action: PayloadAction<Check[]>) => {
      state.checks = action.payload;
      state.loading = false;
      state.error = null;
    },
    
    addCheck: (state, action: PayloadAction<Check>) => {
      state.checks.unshift(action.payload);
      state.pagination.total += 1;
    },
    
    updateCheck: (state, action: PayloadAction<Check>) => {
      const index = state.checks.findIndex(check => check.id === action.payload.id);
      if (index !== -1) {
        state.checks[index] = action.payload;
      }
      if (state.selectedCheck?.id === action.payload.id) {
        state.selectedCheck = action.payload;
      }
    },
    
    removeCheck: (state, action: PayloadAction<string>) => {
      state.checks = state.checks.filter(check => check.id !== action.payload);
      state.pagination.total -= 1;
      if (state.selectedCheck?.id === action.payload) {
        state.selectedCheck = null;
      }
    },
    
    updateCheckStatus: (state, action: PayloadAction<{ id: string; status: CheckStatus; lastExecuted?: string }>) => {
      const { id, status, lastExecuted } = action.payload;
      const check = state.checks.find(check => check.id === id);
      if (check) {
        check.lastStatus = status;
        if (lastExecuted) {
          check.lastExecuted = lastExecuted;
        }
      }
      if (state.selectedCheck?.id === id) {
        state.selectedCheck.lastStatus = status;
        if (lastExecuted && state.selectedCheck) {
          state.selectedCheck.lastExecuted = lastExecuted;
        }
      }
    },

    // Selection
    setSelectedCheck: (state, action: PayloadAction<Check | null>) => {
      state.selectedCheck = action.payload;
    },

    // Filters
    setFilters: (state, action: PayloadAction<CheckFilters>) => {
      state.filters = action.payload;
    },
    
    updateFilters: (state, action: PayloadAction<Partial<CheckFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    clearFilters: (state) => {
      state.filters = {};
    },

    // Pagination
    setPagination: (state, action: PayloadAction<Partial<ChecksState['pagination']>>) => {
      state.pagination = { ...state.pagination, ...action.payload };
    },

    // Reset state
    resetChecksState: () => initialState,
  },
});

export const {
  setLoading,
  setError,
  clearError,
  setChecks,
  addCheck,
  updateCheck,
  removeCheck,
  updateCheckStatus,
  setSelectedCheck,
  setFilters,
  updateFilters,
  clearFilters,
  setPagination,
  resetChecksState,
} = checksSlice.actions;

export default checksSlice.reducer;
