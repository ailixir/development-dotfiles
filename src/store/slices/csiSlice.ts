import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CSI, CSIMetrics, CSIHealthSummary, CSIFilters } from '../../types/csi/csiTypes';
import { AsyncState } from '../../types/common/commonTypes';

// Mock API calls - in real implementation these would call actual APIs
import { mockCSIs, mockCSIMetrics, mockCSIHealthSummaries } from '../../data/mockCSIData';

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

// New async thunk for fetching tags
export const fetchTags = createAsyncThunk(
  'csi/fetchTags',
  async (params?: { csiId?: string }) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Import checks data to extract tags
    const { mockChecks } = await import('../../services/mocks/mockData/checksData');
    const { mockCSIs } = await import('../../data/mockCSIData');
    
    let allTags = new Set<string>();
    
    if (params?.csiId) {
      // Get tags from checks associated with the selected CSI
      const csiChecks = mockChecks.filter(check => check.csiId === params.csiId);
      csiChecks.forEach(check => {
        check.tags.forEach(tag => allTags.add(tag));
      });
      
      // Also get tags from the CSI itself
      const csi = mockCSIs.find(c => c.id === params.csiId);
      if (csi) {
        csi.tags.forEach(tag => allTags.add(tag));
      }
    } else {
      // Get all available tags from all checks and CSIs
      mockChecks.forEach(check => {
        check.tags.forEach(tag => allTags.add(tag));
      });
      mockCSIs.forEach(csi => {
        csi.tags.forEach(tag => allTags.add(tag));
      });
    }
    
    return Array.from(allTags).sort();
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