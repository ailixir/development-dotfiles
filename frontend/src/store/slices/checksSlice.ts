import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CheckEntity, CreateCheckRequest, CheckFilters, ExecutionResult } from '../../types/checks/checkTypes';
import { AsyncState } from '../../types/common/commonTypes';
import { checksApi } from '@services/api/checksApi';

interface ChecksState extends AsyncState<CheckEntity[]> {
  selectedCheck: CheckEntity | null;
  filters: CheckFilters;
  totalCount: number;
  currentPage: number;
  executionResults: Record<string, ExecutionResult>;
  executingChecks: string[];
  upcomingExecutions: Array<{ checkId: string; checkName: string; nextExecution: string; csiName: string }>;
  schedulingChecks: string[];
}

const initialState: ChecksState = {
  data: [],
  loading: 'idle',
  error: null,
  lastFetched: null,
  selectedCheck: null,
  filters: {
    csiId: null,
    status: null,
    type: null,
    searchQuery: '',
    tags: [],
  },
  totalCount: 0,
  currentPage: 1,
  executionResults: {},
  executingChecks: [],
  upcomingExecutions: [],
  schedulingChecks: [],
};

// Async thunks
export const fetchChecks = createAsyncThunk(
  'checks/fetchChecks',
  async (params: { page?: number; limit?: number; filters?: Partial<CheckFilters> }) => {
    const response = await checksApi.getChecks(params);
    return response;
  }
);

export const fetchCheckById = createAsyncThunk(
  'checks/fetchCheckById',
  async (id: string) => {
    const response = await checksApi.getCheckById(id);
    return response;
  }
);

export const createCheck = createAsyncThunk(
  'checks/createCheck',
  async (checkData: CreateCheckRequest) => {
    const response = await checksApi.createCheck(checkData);
    return response;
  }
);

export const executeCheck = createAsyncThunk(
  'checks/executeCheck',
  async (id: string) => {
    const response = await checksApi.executeCheck(id);
    return { checkId: id, result: response };
  }
);

export const deleteCheck = createAsyncThunk(
  'checks/deleteCheck',
  async (id: string) => {
    await checksApi.deleteCheck(id);
    return id;
  }
);

export const updateCheckSchedule = createAsyncThunk(
  'checks/updateCheckSchedule',
  async ({ id, schedule }: { id: string; schedule: { enabled: boolean; frequency?: string; cron?: string } }) => {
    const response = await checksApi.updateCheckSchedule(id, schedule);
    return response;
  }
);

export const pauseCheck = createAsyncThunk(
  'checks/pauseCheck',
  async (id: string) => {
    const response = await checksApi.pauseCheck(id);
    return response;
  }
);

export const resumeCheck = createAsyncThunk(
  'checks/resumeCheck',
  async (id: string) => {
    const response = await checksApi.resumeCheck(id);
    return response;
  }
);

export const fetchUpcomingExecutions = createAsyncThunk(
  'checks/fetchUpcomingExecutions',
  async (limit: number = 20) => {
    const response = await checksApi.getUpcomingExecutions(limit);
    return response;
  }
);

const checksSlice = createSlice({
  name: 'checks',
  initialState,
  reducers: {
    setSelectedCheck: (state, action: PayloadAction<CheckEntity | null>) => {
      state.selectedCheck = action.payload;
    },
    
    updateFilters: (state, action: PayloadAction<Partial<CheckFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
      state.currentPage = 1; // Reset to first page when filters change
    },
    
    clearFilters: (state) => {
      state.filters = initialState.filters;
      state.currentPage = 1;
    },
    
    clearError: (state) => {
      state.error = null;
    },
    
    setCurrentPage: (state, action: PayloadAction<number>) => {
      state.currentPage = action.payload;
    },
    
    updateCheckStatus: (state, action: PayloadAction<{ id: string; status: any }>) => {
      const check = state.data.find(c => c.id === action.payload.id);
      if (check) {
        check.status = action.payload.status;
        check.lastExecution = new Date().toISOString();
      }
    },
    
    clearExecutionResults: (state) => {
      state.executionResults = {};
    },
  },
  
  extraReducers: (builder) => {
    builder
      // fetchChecks
      .addCase(fetchChecks.pending, (state) => {
        state.loading = 'loading';
        state.error = null;
      })
      .addCase(fetchChecks.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data = action.payload.data;
        state.totalCount = action.payload.total || 0;
        state.lastFetched = new Date().toISOString();
      })
      .addCase(fetchChecks.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to fetch checks';
      })
      
      // fetchCheckById
      .addCase(fetchCheckById.pending, (state) => {
        state.loading = 'loading';
      })
      .addCase(fetchCheckById.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.selectedCheck = action.payload;
        const idx = state.data.findIndex(c => c.id === action.payload.id);
        if (idx === -1) {
          state.data.push(action.payload);
        } else {
          state.data[idx] = action.payload;
        }
      })
      .addCase(fetchCheckById.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to fetch check';
      })
      
      // createCheck
      .addCase(createCheck.pending, (state) => {
        state.loading = 'loading';
        state.error = null;
      })
      .addCase(createCheck.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data.push(action.payload);
        state.totalCount += 1;
      })
      .addCase(createCheck.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to create check';
      })
      
      // executeCheck
      .addCase(executeCheck.pending, (state, action) => {
        const checkId = action.meta.arg;
        if (!state.executingChecks.includes(checkId)) {
          state.executingChecks.push(checkId);
        }
      })
      .addCase(executeCheck.fulfilled, (state, action) => {
        const { checkId, result } = action.payload;
        state.executingChecks = state.executingChecks.filter(id => id !== checkId);
        state.executionResults[checkId] = result;
        
        // Update check status based on execution result
        const check = state.data.find(c => c.id === checkId);
        if (check) {
          check.status = result.status === 'SUCCESS' ? 'PASSING' : 
                        result.status === 'WARNING' ? 'WARNING' : 'FAILING';
          check.lastExecution = result.endTime;
        }
      })
      .addCase(executeCheck.rejected, (state, action) => {
        const checkId = action.meta.arg;
        state.executingChecks = state.executingChecks.filter(id => id !== checkId);
        state.error = action.error.message || 'Failed to execute check';
      })
      
      // deleteCheck
      .addCase(deleteCheck.pending, (state) => {
        state.loading = 'loading';
      })
      .addCase(deleteCheck.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data = state.data.filter(check => check.id !== action.payload);
        state.totalCount -= 1;
        
        // Clear selected check if it was deleted
        if (state.selectedCheck?.id === action.payload) {
          state.selectedCheck = null;
        }
      })
      .addCase(deleteCheck.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to delete check';
      })
      
      // updateCheckSchedule
      .addCase(updateCheckSchedule.pending, (state, action) => {
        const checkId = action.meta.arg.id;
        if (!state.schedulingChecks.includes(checkId)) {
          state.schedulingChecks.push(checkId);
        }
      })
      .addCase(updateCheckSchedule.fulfilled, (state, action) => {
        const updatedCheck = action.payload;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== updatedCheck.id);
        
        // Update check in data array
        const checkIndex = state.data.findIndex(c => c.id === updatedCheck.id);
        if (checkIndex !== -1) {
          state.data[checkIndex] = updatedCheck;
        }
        
        // Update selected check if it's the same
        if (state.selectedCheck?.id === updatedCheck.id) {
          state.selectedCheck = updatedCheck;
        }
      })
      .addCase(updateCheckSchedule.rejected, (state, action) => {
        const checkId = action.meta.arg.id;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== checkId);
        state.error = action.error.message || 'Failed to update schedule';
      })
      
      // pauseCheck
      .addCase(pauseCheck.pending, (state, action) => {
        const checkId = action.meta.arg;
        if (!state.schedulingChecks.includes(checkId)) {
          state.schedulingChecks.push(checkId);
        }
      })
      .addCase(pauseCheck.fulfilled, (state, action) => {
        const updatedCheck = action.payload;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== updatedCheck.id);
        
        const checkIndex = state.data.findIndex(c => c.id === updatedCheck.id);
        if (checkIndex !== -1) {
          state.data[checkIndex] = updatedCheck;
        }
      })
      .addCase(pauseCheck.rejected, (state, action) => {
        const checkId = action.meta.arg;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== checkId);
        state.error = action.error.message || 'Failed to pause check';
      })
      
      // resumeCheck
      .addCase(resumeCheck.pending, (state, action) => {
        const checkId = action.meta.arg;
        if (!state.schedulingChecks.includes(checkId)) {
          state.schedulingChecks.push(checkId);
        }
      })
      .addCase(resumeCheck.fulfilled, (state, action) => {
        const updatedCheck = action.payload;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== updatedCheck.id);
        
        const checkIndex = state.data.findIndex(c => c.id === updatedCheck.id);
        if (checkIndex !== -1) {
          state.data[checkIndex] = updatedCheck;
        }
      })
      .addCase(resumeCheck.rejected, (state, action) => {
        const checkId = action.meta.arg;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== checkId);
        state.error = action.error.message || 'Failed to resume check';
      })
      
      // fetchUpcomingExecutions
      .addCase(fetchUpcomingExecutions.fulfilled, (state, action) => {
        state.upcomingExecutions = action.payload.data;
      })
      .addCase(fetchUpcomingExecutions.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch upcoming executions';
      });
  },
});

export const {
  setSelectedCheck,
  updateFilters,
  clearFilters,
  clearError,
  setCurrentPage,
  updateCheckStatus,
  clearExecutionResults,
} = checksSlice.actions;

export default checksSlice.reducer;