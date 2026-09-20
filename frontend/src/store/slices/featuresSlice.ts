import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { featuresApi, FeatureFlag, FeaturesResponse } from '@/services/api/featuresApi';
import { CheckSource } from '@/services/api/sourcesApi';

interface FeaturesState {
  sources: CheckSource[];
  features: FeatureFlag[];
  loading: boolean;
  error: string | null;
  fetched: boolean;
}

const DEFAULT_SOURCES: CheckSource[] = [
  { type: 'HTTP', enabled: true, label: 'HTTP/HTTPS Check' },
  { type: 'TCP', enabled: true, label: 'TCP Port Check' },
  { type: 'SPLUNK', enabled: true, label: 'Splunk Query' },
  { type: 'GRAFANA', enabled: true, label: 'Grafana Metrics' },
  { type: 'ITRS', enabled: true, label: 'ITRS Geneos' },
  { type: 'APPDYNAMICS', enabled: true, label: 'AppDynamics APM' },
  { type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' },
];

const DEFAULT_FEATURES: FeatureFlag[] = [
  { key: 'SCHEDULING', enabled: true, label: 'Schedule Management' },
  { key: 'REPORTS', enabled: true, label: 'Reports & Analytics' },
  { key: 'BULK_OPERATIONS', enabled: true, label: 'Bulk Operations' },
  { key: 'TEMPLATES', enabled: true, label: 'Check Templates' },
  { key: 'STUDIO', enabled: true, label: 'Checks Studio' },
  { key: 'DASHBOARD', enabled: true, label: 'Dashboard' },
];

const initialState: FeaturesState = {
  sources: [],
  features: [],
  loading: false,
  error: null,
  fetched: false,
};

export const fetchFeatures = createAsyncThunk('features/fetch', async () => {
  const response: FeaturesResponse = await featuresApi.getFeatures();
  if (!Array.isArray(response?.sources) || !Array.isArray(response?.features)
    || response.sources.some(source => !source || typeof source.type !== 'string' || typeof source.enabled !== 'boolean' || typeof source.label !== 'string')
    || response.features.some(feature => !feature || typeof feature.key !== 'string' || typeof feature.enabled !== 'boolean' || typeof feature.label !== 'string')) {
    throw new Error('Invalid feature flags response');
  }
  return response;
});

const featuresSlice = createSlice({
  name: 'features',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeatures.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFeatures.fulfilled, (state, action: PayloadAction<FeaturesResponse>) => {
        state.sources = action.payload.sources;
        state.features = action.payload.features;
        state.loading = false;
        state.fetched = true;
      })
      .addCase(fetchFeatures.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch features';
        state.fetched = true;
        if (state.sources.length === 0) {
          state.sources = DEFAULT_SOURCES;
        }
        if (state.features.length === 0) {
          state.features = DEFAULT_FEATURES;
        }
      });
  },
});

export default featuresSlice.reducer;

export const selectFeatures = (state: { features: FeaturesState }) => state.features.features;
export const selectFeatureSources = (state: { features: FeaturesState }) => state.features.sources;
export const selectFeaturesFetched = (state: { features: FeaturesState }) => state.features.fetched;

export const selectIsFeatureEnabled =
  (key: string) =>
  (state: { features: FeaturesState }): boolean => {
    const flag = state.features.features.find((f) => f.key === key);
    return flag ? flag.enabled : true;
  };

export const selectIsSourceEnabledFromFeatures =
  (type: string) =>
  (state: { features: FeaturesState }): boolean => {
    const source = state.features.sources.find((s) => s.type === type);
    return source ? source.enabled : true;
  };
