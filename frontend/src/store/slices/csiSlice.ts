import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CSI, CSIMetrics, CSIHealthSummary, CSIFilters } from '../../types/csi/csiTypes';
import { AsyncState } from '../../types/common/commonTypes';

import { csiApi } from '@/services/api/csiApi';
import { tagsApi } from '@/services/api/tagsApi';

interface TagState {
  selected: string[];
  available: string[];
  loading: boolean;
  error: string | null;
  filterMode: 'AND' | 'OR';
}

interface CSIState extends AsyncState<CSI[]> {
  selectedCSI: string | null; // CSI ID
  metrics: Record<string, CSIMetrics>;
  healthSummaries: CSIHealthSummary[];
  filters: CSIFilters;
  tags: TagState;
  metricsLoading: boolean;
  metricsError: string | null;
  lastMetricsUpdate: string | null;
}

const initialState: CSIState = {
  data: [],
  loading: 'idle',
  error: null,
  lastFetched: null,
  selectedCSI: null,
  metrics: {},
  healthSummaries: [],
  filters: {
    searchQuery: ''
  },
  tags: {
    selected: [],
    available: [],
    loading: false,
    error: null,
    filterMode: 'AND'
  },
  metricsLoading: false,
  metricsError: null,
  lastMetricsUpdate: null
};

// Async thunks for CSI operations
export const fetchCSIs = createAsyncThunk(
  'csi/fetchCSIs',
  async (filters?: CSIFilters) => {
    const params: any = {
      search: filters?.searchQuery,
      businessUnit: filters?.businessUnit,
      environment: filters?.environment,
      status: filters?.status,
    };
    return await csiApi.listCsis(params);
  }
);

export const fetchCSIMetrics = createAsyncThunk(
  'csi/fetchCSIMetrics',
  async (csiIds?: string[]) => {
    // For prototype, re-use `/csi/:id/health` to compose metrics as needed.
    // If ids provided, fetch each; else return empty (not essential for Home).
    const ids = csiIds || [];
    const results: Record<string, CSIMetrics> = {} as any;
    await Promise.all(
      ids.map(async (id) => {
        try {
          const health = await csiApi.getCsiHealth(id);
          results[id] = {
            csiId: id,
            totalChecks: health.totalChecks,
            passingChecks: health.passingChecks,
            failingChecks: health.failingChecks,
            warningChecks: health.warningChecks,
            overallHealth: 0,
            lastUpdated: new Date().toISOString(),
            criticalAlertsCount: 0,
            avgResponseTime: 0,
            uptime: 0,
            totalExecutions: 0,
            successRate: 0,
          };
        } catch { /* Optional CSI metadata enrichment must not discard the successful base response. */ }
      })
    );
    return { data: results, lastUpdated: new Date().toISOString() };
  }
);

export const fetchCSIHealthSummaries = createAsyncThunk(
  'csi/fetchCSIHealthSummaries',
  async () => {
    // Not essential for Home; keep stub empty
    return { data: [], timestamp: new Date().toISOString() } as any;
  }
);

export const fetchCSIById = createAsyncThunk(
  'csi/fetchCSIById',
  async (csiId: string) => {
    return await csiApi.getCsiById(csiId);
  }
);

// New async thunk for fetching tags
export const fetchTags = createAsyncThunk(
  'csi/fetchTags',
  async (params?: { csiId?: string }) => {
    const response = await tagsApi.getTags(params?.csiId);
    return response.data;
  }
);

const csiSlice = createSlice({
  name: 'csi',
  initialState,
  reducers: {
    setSelectedCSI: (state, action: PayloadAction<string | null>) => {
      state.selectedCSI = action.payload;
      // Clear selected tags when CSI changes
      if (state.selectedCSI !== action.payload) {
        state.tags.selected = [];
      }
    },
    
    setSelectedTags: (state, action: PayloadAction<string[]>) => {
      state.tags.selected = action.payload;
    },
    
    setTagFilterMode: (state, action: PayloadAction<'AND' | 'OR'>) => {
      state.tags.filterMode = action.payload;
    },
    
    updateFilters: (state, action: PayloadAction<Partial<CSIFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    clearFilters: (state) => {
      state.filters = initialState.filters;
      state.selectedCSI = null;
      state.tags.selected = [];
    },
    
    clearTagFilters: (state) => {
      state.tags.selected = [];
    },
    
    clearError: (state) => {
      state.error = null;
      state.metricsError = null;
      state.tags.error = null;
    },
    
    updateCSIMetrics: (state, action: PayloadAction<{ csiId: string; metrics: Partial<CSIMetrics> }>) => {
      const { csiId, metrics } = action.payload;
      if (state.metrics[csiId]) {
        state.metrics[csiId] = { ...state.metrics[csiId], ...metrics };
      }
    },
    
    refreshMetrics: (state) => {
      state.lastMetricsUpdate = new Date().toISOString();
    }
  },
  
  extraReducers: (builder) => {
    builder
      // fetchCSIs
      .addCase(fetchCSIs.pending, (state) => {
        state.loading = 'loading';
        state.error = null;
      })
      .addCase(fetchCSIs.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data = action.payload.data;
        state.lastFetched = new Date().toISOString();
        
        // Auto-select first CSI if none selected and force selection is enabled
        if (!state.selectedCSI && action.payload.data.length > 0) {
          state.selectedCSI = action.payload.data[0].id;
        }
      })
      .addCase(fetchCSIs.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to fetch CSIs';
      })
      
      // fetchCSIMetrics
      .addCase(fetchCSIMetrics.pending, (state) => {
        state.metricsLoading = true;
        state.metricsError = null;
      })
      .addCase(fetchCSIMetrics.fulfilled, (state, action) => {
        state.metricsLoading = false;
        state.metrics = { ...state.metrics, ...action.payload.data };
        state.lastMetricsUpdate = action.payload.lastUpdated;
      })
      .addCase(fetchCSIMetrics.rejected, (state, action) => {
        state.metricsLoading = false;
        state.metricsError = action.error.message || 'Failed to fetch CSI metrics';
      })
      
      // fetchCSIHealthSummaries
      .addCase(fetchCSIHealthSummaries.fulfilled, (state, action) => {
        state.healthSummaries = action.payload.data;
      })
      
      // fetchCSIById
      .addCase(fetchCSIById.fulfilled, (state, action) => {
        const existingIndex = state.data.findIndex(csi => csi.id === action.payload.id);
        if (existingIndex >= 0) {
          state.data[existingIndex] = action.payload;
        } else {
          state.data.push(action.payload);
        }
      })
      
      // fetchTags
      .addCase(fetchTags.pending, (state) => {
        state.tags.loading = true;
        state.tags.error = null;
      })
      .addCase(fetchTags.fulfilled, (state, action) => {
        state.tags.loading = false;
        state.tags.available = action.payload;
      })
      .addCase(fetchTags.rejected, (state, action) => {
        state.tags.loading = false;
        state.tags.error = action.error.message || 'Failed to fetch tags';
      });
  },
});

export const {
  setSelectedCSI,
  setSelectedTags,
  setTagFilterMode,
  updateFilters,
  clearFilters,
  clearTagFilters,
  clearError,
  updateCSIMetrics,
  refreshMetrics
} = csiSlice.actions;

export default csiSlice.reducer;