import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CSI, CSIMetrics, CSIHealthSummary, CSIFilters } from '@types/csi/csiTypes';
import { AsyncState } from '@types/common/commonTypes';

// Mock API calls - in real implementation these would call actual APIs
import { mockCSIs, mockCSIMetrics, mockCSIHealthSummaries } from '../../data/mockCSIData';

interface CSIState extends AsyncState<CSI[]> {
  selectedCSI: string | null; // CSI ID
  metrics: Record<string, CSIMetrics>;
  healthSummaries: CSIHealthSummary[];
  filters: CSIFilters;
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
  metricsLoading: false,
  metricsError: null,
  lastMetricsUpdate: null
};

// Async thunks for CSI operations
export const fetchCSIs = createAsyncThunk(
  'csi/fetchCSIs',
  async (filters?: CSIFilters) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    let filteredCSIs = [...mockCSIs];
    
    if (filters?.businessUnit) {
      filteredCSIs = filteredCSIs.filter(csi => csi.businessUnit === filters.businessUnit);
    }
    
    if (filters?.criticality) {
      filteredCSIs = filteredCSIs.filter(csi => csi.criticality === filters.criticality);
    }
    
    if (filters?.environment) {
      filteredCSIs = filteredCSIs.filter(csi => csi.environment === filters.environment);
    }
    
    if (filters?.status) {
      filteredCSIs = filteredCSIs.filter(csi => csi.status === filters.status);
    }
    
    if (filters?.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filteredCSIs = filteredCSIs.filter(csi => 
        csi.id.toLowerCase().includes(query) ||
        csi.name.toLowerCase().includes(query) ||
        csi.description.toLowerCase().includes(query) ||
        csi.businessUnit.toLowerCase().includes(query)
      );
    }
    
    return {
      data: filteredCSIs,
      total: filteredCSIs.length
    };
  }
);

export const fetchCSIMetrics = createAsyncThunk(
  'csi/fetchCSIMetrics',
  async (csiIds?: string[]) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (csiIds && csiIds.length > 0) {
      const filteredMetrics: Record<string, CSIMetrics> = {};
      csiIds.forEach(id => {
        if (mockCSIMetrics[id]) {
          filteredMetrics[id] = mockCSIMetrics[id];
        }
      });
      return {
        data: filteredMetrics,
        lastUpdated: new Date().toISOString()
      };
    }
    
    return {
      data: mockCSIMetrics,
      lastUpdated: new Date().toISOString()
    };
  }
);

export const fetchCSIHealthSummaries = createAsyncThunk(
  'csi/fetchCSIHealthSummaries',
  async () => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 400));
    
    return {
      data: mockCSIHealthSummaries,
      timestamp: new Date().toISOString()
    };
  }
);

export const fetchCSIById = createAsyncThunk(
  'csi/fetchCSIById',
  async (csiId: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const csi = mockCSIs.find(c => c.id === csiId);
    if (!csi) {
      throw new Error(`CSI with ID ${csiId} not found`);
    }
    
    return csi;
  }
);

const csiSlice = createSlice({
  name: 'csi',
  initialState,
  reducers: {
    setSelectedCSI: (state, action: PayloadAction<string | null>) => {
      state.selectedCSI = action.payload;
    },
    
    updateFilters: (state, action: PayloadAction<Partial<CSIFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    clearFilters: (state) => {
      state.filters = initialState.filters;
    },
    
    clearError: (state) => {
      state.error = null;
      state.metricsError = null;
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
      });
  },
});

export const {
  setSelectedCSI,
  updateFilters,
  clearFilters,
  clearError,
  updateCSIMetrics,
  refreshMetrics
} = csiSlice.actions;

export default csiSlice.reducer;