import { dashboardApi } from '@/services/api/dashboardApi';
import { AsyncState } from '@/types/common/commonTypes';
import type {
  ActivityItem,
  AttentionItem,
  DashboardSummary,
  ReportSnapshotItem,
  SearchResultItem,
} from '@/types/dashboard/dashboardTypes';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';

interface DashboardState {
  summary: AsyncState<DashboardSummary | null>;
  attention: AsyncState<AttentionItem[]>;
  activity: AsyncState<ActivityItem[]>;
  upcoming: AsyncState<any[]>;
  reports: AsyncState<ReportSnapshotItem[]>;
  search: AsyncState<SearchResultItem[]>;
  pinnedCsiIds: string[];
  searchContext: {
    csiId: string | null;
    environment: string | null;
    tags: string[];
    tagMode: 'AND' | 'OR';
  };
}

const createAsyncState = <T,>(data: T): AsyncState<T> => ({
  data,
  loading: 'idle',
  error: null,
  lastFetched: null,
});

const initialState: DashboardState = {
  summary: createAsyncState<DashboardSummary | null>(null),
  attention: createAsyncState<AttentionItem[]>([]),
  activity: createAsyncState<ActivityItem[]>([]),
  upcoming: createAsyncState<any[]>([]),
  reports: createAsyncState<ReportSnapshotItem[]>([]),
  search: createAsyncState<SearchResultItem[]>([]),
  pinnedCsiIds: [],
  searchContext: { csiId: null, environment: null, tags: [], tagMode: 'AND' },
};

export const fetchDashboardSummary = createAsyncThunk(
  'dashboard/fetchSummary',
  async (_, { getState }) => {
    const state = getState() as any;
    const csiId = state.dashboard.searchContext.csiId;
    return await dashboardApi.getDashboardSummary({ csiId });
  }
);

export const fetchAttention = createAsyncThunk(
  'dashboard/fetchAttention',
  async (params: { limit?: number; csiId?: string | null } | undefined, { getState }) => {
    const state = getState() as any;
    const csiId = params?.csiId ?? state.dashboard.searchContext.csiId;
    return await dashboardApi.getAttention({ ...params, csiId });
  }
);

export const fetchActivity = createAsyncThunk(
  'dashboard/fetchActivity',
  async (params: { scope?: 'ALL' | 'MINE'; hours?: number; csiId?: string | null } | undefined, { getState }) => {
    const state = getState() as any;
    const csiId = params?.csiId ?? state.dashboard.searchContext.csiId;
    return await dashboardApi.getActivity({ ...params, csiId });
  }
);

export const fetchUpcomingSchedules = createAsyncThunk(
  'dashboard/fetchUpcomingSchedules',
  async (params: { limit?: number; csiId?: string | null } | undefined, { getState }) => {
    const state = getState() as any;
    const csiId = params?.csiId ?? state.dashboard.searchContext.csiId;
    return await dashboardApi.getUpcomingSchedules({ ...params, csiId });
  }
);

export const fetchReportsSnapshot = createAsyncThunk(
  'dashboard/fetchReportsSnapshot',
  async (params: { limit?: number; csiId?: string | null } | undefined, { getState }) => {
    const state = getState() as any;
    const csiId = params?.csiId ?? state.dashboard.searchContext.csiId;
    return await dashboardApi.getReportsSnapshot({ ...params, csiId });
  }
);

export const searchAll = createAsyncThunk(
  'dashboard/searchAll',
  async (
    args: { query: string; context?: { csiId?: string | null } }
  ) => {
    return await dashboardApi.searchAll(args.query, args.context);
  }
);

export const acknowledgeCheck = createAsyncThunk(
  'dashboard/acknowledgeCheck',
  async (id: string) => {
    return await dashboardApi.acknowledgeCheck(id);
  }
);

export const assignCheck = createAsyncThunk(
  'dashboard/assignCheck',
  async ({ id, userId }: { id: string; userId: string }) => {
    return await dashboardApi.assignCheck(id, userId);
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setPinnedCsiIds: (state, action: PayloadAction<string[]>) => {
      state.pinnedCsiIds = action.payload;
    },
    pinCsi: (state, action: PayloadAction<string>) => {
      if (!state.pinnedCsiIds.includes(action.payload)) {
        state.pinnedCsiIds.push(action.payload);
      }
    },
    unpinCsi: (state, action: PayloadAction<string>) => {
      state.pinnedCsiIds = state.pinnedCsiIds.filter((id) => id !== action.payload);
    },
    optimisticallyRemoveAttentionItem: (state, action: PayloadAction<string>) => {
      state.attention.data = state.attention.data.filter((i) => i.id !== action.payload);
    },
    restoreAttentionItem: (state, action: PayloadAction<AttentionItem>) => {
      const exists = state.attention.data.some((i) => i.id === action.payload.id);
      if (!exists) {
        state.attention.data.unshift(action.payload);
      }
    },
    setSearchContext: (
      state,
      action: PayloadAction<{ csiId: string | null }>
    ) => {
      state.searchContext = {
        csiId: action.payload.csiId,
        environment: null,
        tags: [],
        tagMode: 'AND',
      };
    },
    clearSearchContext: (state) => {
      state.searchContext = { csiId: null, environment: null, tags: [], tagMode: 'AND' };
    },
    setSearchFilters: (
      state,
      action: PayloadAction<{
        environment?: string | null;
        tags?: string[];
        tagMode?: 'AND' | 'OR';
      }>
    ) => {
      state.searchContext.environment =
        action.payload.environment === undefined ? state.searchContext.environment : (action.payload.environment || null);
      state.searchContext.tags = action.payload.tags !== undefined ? action.payload.tags : state.searchContext.tags;
      state.searchContext.tagMode = action.payload.tagMode || state.searchContext.tagMode;
    },
    clearSearchFilters: (state) => {
      state.searchContext.environment = null;
      state.searchContext.tags = [];
      state.searchContext.tagMode = 'AND';
    },
  },
  extraReducers: (builder) => {
    builder
      // summary
      .addCase(fetchDashboardSummary.pending, (state) => {
        state.summary.loading = 'loading';
        state.summary.error = null;
      })
      .addCase(fetchDashboardSummary.fulfilled, (state, action) => {
        state.summary.loading = 'succeeded';
        state.summary.data = action.payload;
        state.summary.lastFetched = new Date().toISOString();
      })
      .addCase(fetchDashboardSummary.rejected, (state, action) => {
        state.summary.loading = 'failed';
        state.summary.error = action.error.message || 'Failed to load summary';
      })
      // attention
      .addCase(fetchAttention.pending, (state) => {
        state.attention.loading = 'loading';
        state.attention.error = null;
      })
      .addCase(fetchAttention.fulfilled, (state, action) => {
        state.attention.loading = 'succeeded';
        state.attention.data = Array.isArray(action.payload?.data) ? action.payload.data : [];
        state.attention.lastFetched = new Date().toISOString();
      })
      .addCase(fetchAttention.rejected, (state, action) => {
        state.attention.loading = 'failed';
        state.attention.error = action.error.message || 'Failed to load attention items';
      })
      // activity
      .addCase(fetchActivity.pending, (state) => {
        state.activity.loading = 'loading';
        state.activity.error = null;
      })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        state.activity.loading = 'succeeded';
        state.activity.data = Array.isArray(action.payload?.data) ? action.payload.data : [];
        state.activity.lastFetched = new Date().toISOString();
      })
      .addCase(fetchActivity.rejected, (state, action) => {
        state.activity.loading = 'failed';
        state.activity.error = action.error.message || 'Failed to load activity';
      })
      // upcoming
      .addCase(fetchUpcomingSchedules.pending, (state) => {
        state.upcoming.loading = 'loading';
        state.upcoming.error = null;
      })
      .addCase(fetchUpcomingSchedules.fulfilled, (state, action) => {
        state.upcoming.loading = 'succeeded';
        state.upcoming.data = Array.isArray(action.payload?.data) ? action.payload.data : [];
        state.upcoming.lastFetched = new Date().toISOString();
      })
      .addCase(fetchUpcomingSchedules.rejected, (state, action) => {
        state.upcoming.loading = 'failed';
        state.upcoming.error = action.error.message || 'Failed to load upcoming schedules';
      })
      // reports
      .addCase(fetchReportsSnapshot.pending, (state) => {
        state.reports.loading = 'loading';
        state.reports.error = null;
      })
      .addCase(fetchReportsSnapshot.fulfilled, (state, action) => {
        state.reports.loading = 'succeeded';
        state.reports.data = Array.isArray(action.payload?.data) ? action.payload.data : [];
        state.reports.lastFetched = new Date().toISOString();
      })
      .addCase(fetchReportsSnapshot.rejected, (state, action) => {
        state.reports.loading = 'failed';
        state.reports.error = action.error.message || 'Failed to load reports snapshot';
      })
      // search
      .addCase(searchAll.pending, (state) => {
        state.search.loading = 'loading';
        state.search.error = null;
      })
      .addCase(searchAll.fulfilled, (state, action) => {
        state.search.loading = 'succeeded';
        state.search.data = action.payload.data;
        state.search.lastFetched = new Date().toISOString();
      })
      .addCase(searchAll.rejected, (state, action) => {
        state.search.loading = 'failed';
        state.search.error = action.error.message || 'Search failed';
      })
      // acknowledge/assign optimistic updates
      .addCase(acknowledgeCheck.fulfilled, (state, action) => {
        // remove item from attention if acknowledged; mock returns id
        const id = action.meta.arg;
        state.attention.data = state.attention.data.filter((i) => i.id !== id);
      })
      .addCase(assignCheck.fulfilled, (_state) => {
        // no-op for now; UI may show toast
      });
  },
});

export const { setPinnedCsiIds, pinCsi, unpinCsi, optimisticallyRemoveAttentionItem, restoreAttentionItem, setSearchContext, clearSearchContext, setSearchFilters, clearSearchFilters } = dashboardSlice.actions;
export default dashboardSlice.reducer;

