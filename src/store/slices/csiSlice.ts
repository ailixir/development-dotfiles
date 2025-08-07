import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AsyncState } from '../../types/common/commonTypes';

interface CSIEntity {
  id: string;
  name: string;
  description: string;
  owner: string;
  environment: string;
  businessUnit: string;
  status: string;
  applications: any[];
  tags: string[];
}

interface CSIState extends AsyncState<CSIEntity[]> {
  selectedCSI: CSIEntity | null;
  businessUnits: string[];
  userPermissions: {
    allowedCSIs: string[];
    role: string;
  };
  searchResults: CSIEntity[];
}

const initialState: CSIState = {
  data: [],
  loading: 'idle',
  error: null,
  lastFetched: null,
  selectedCSI: null,
  businessUnits: [],
  userPermissions: {
    allowedCSIs: [],
    role: '',
  },
  searchResults: [],
};

export const fetchCSIs = createAsyncThunk('csi/fetchCSIs', async () => {
  // This will be replaced with actual API call
  return { data: [], total: 0 };
});

export const searchCSIs = createAsyncThunk('csi/searchCSIs', async (_query: string) => {
  // This will be replaced with actual API call
  return [];
});

const csiSlice = createSlice({
  name: 'csi',
  initialState,
  reducers: {
    setSelectedCSI: (state, action: PayloadAction<CSIEntity | null>) => {
      state.selectedCSI = action.payload;
    },
    clearSearchResults: (state) => {
      state.searchResults = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCSIs.fulfilled, (state, action) => {
        state.data = action.payload.data;
        state.loading = 'succeeded';
      })
      .addCase(searchCSIs.fulfilled, (state, action) => {
        state.searchResults = action.payload;
      });
  },
});

export const { setSelectedCSI, clearSearchResults } = csiSlice.actions;
export default csiSlice.reducer;