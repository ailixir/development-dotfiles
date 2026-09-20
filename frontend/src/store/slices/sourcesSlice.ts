import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { sourcesApi, CheckSource } from '@/services/api/sourcesApi';

interface SourcesState {
  data: CheckSource[];
  loading: boolean;
  error: string | null;
  fetched: boolean;
}

const initialState: SourcesState = {
  data: [],
  loading: false,
  error: null,
  fetched: false,
};

export const fetchSources = createAsyncThunk('sources/fetch', async () => {
  const response = await sourcesApi.getSources();
  if (!Array.isArray(response?.sources) || response.sources.some(source =>
    !source || typeof source.type !== 'string' || typeof source.enabled !== 'boolean' || typeof source.label !== 'string')) {
    throw new Error('Invalid check sources response');
  }
  return response.sources;
});

const sourcesSlice = createSlice({
  name: 'sources',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSources.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSources.fulfilled, (state, action: PayloadAction<CheckSource[]>) => {
        state.data = action.payload;
        state.loading = false;
        state.fetched = true;
      })
      .addCase(fetchSources.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch sources';
        state.fetched = true;
        // Fail-open: if fetch fails, treat all types as enabled
        if (state.data.length === 0) {
          state.data = [
            { type: 'HTTP', enabled: true, label: 'HTTP/HTTPS Check' },
            { type: 'TCP', enabled: true, label: 'TCP Port Check' },
            { type: 'SPLUNK', enabled: true, label: 'Splunk Query' },
            { type: 'GRAFANA', enabled: true, label: 'Grafana Metrics' },
            { type: 'ITRS', enabled: true, label: 'ITRS Geneos' },
            { type: 'APPDYNAMICS', enabled: true, label: 'AppDynamics APM' },
            { type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' },
          ];
        }
      });
  },
});

export default sourcesSlice.reducer;

export const selectSources = (state: { sources: SourcesState }) => state.sources.data;
export const selectSourcesFetched = (state: { sources: SourcesState }) => state.sources.fetched;
export const selectIsSourceEnabled = (type: string) => (state: { sources: SourcesState }) => {
  const source = state.sources.data.find((s) => s.type === type);
  return source ? source.enabled : true; // fail-open
};
