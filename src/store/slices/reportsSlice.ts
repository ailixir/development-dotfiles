import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AsyncState } from '../../types/common/commonTypes';

interface ReportEntity {
  id: string;
  name: string;
  description: string;
  selectedChecks: string[];
  schedule: any;
  recipients: string[];
  template: string;
  status: 'active' | 'paused' | 'draft';
}

interface ReportConfiguration {
  name: string;
  description: string;
  selectedChecks: string[];
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string;
    timezone: string;
    enabled: boolean;
  };
  recipients: string[];
  template: 'standard' | 'executive' | 'detailed';
}

interface ReportsState extends AsyncState<ReportEntity[]> {
  currentReport: ReportConfiguration;
  previewContent: string | null;
  generatingPreview: boolean;
}

const initialState: ReportsState = {
  data: [],
  loading: 'idle',
  error: null,
  lastFetched: null,
  currentReport: {
    name: '',
    description: '',
    selectedChecks: [],
    schedule: {
      frequency: 'daily',
      time: '09:00',
      timezone: 'EST',
      enabled: true,
    },
    recipients: [],
    template: 'standard',
  },
  previewContent: null,
  generatingPreview: false,
};

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    updateCurrentReport: (state, action: PayloadAction<Partial<ReportConfiguration>>) => {
      state.currentReport = { ...state.currentReport, ...action.payload };
    },
    
    resetCurrentReport: (state) => {
      state.currentReport = initialState.currentReport;
    },
    
    setPreviewContent: (state, action: PayloadAction<string | null>) => {
      state.previewContent = action.payload;
    },
    
    setGeneratingPreview: (state, action: PayloadAction<boolean>) => {
      state.generatingPreview = action.payload;
    },
    
    addCheckToReport: (state, action: PayloadAction<string>) => {
      if (!state.currentReport.selectedChecks.includes(action.payload)) {
        state.currentReport.selectedChecks.push(action.payload);
      }
    },
    
    removeCheckFromReport: (state, action: PayloadAction<string>) => {
      state.currentReport.selectedChecks = state.currentReport.selectedChecks.filter(
        id => id !== action.payload
      );
    },
  },
});

export const {
  updateCurrentReport,
  resetCurrentReport,
  setPreviewContent,
  setGeneratingPreview,
  addCheckToReport,
  removeCheckFromReport,
} = reportsSlice.actions;

export default reportsSlice.reducer;