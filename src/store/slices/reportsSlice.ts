import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Report, ReportPreview, ReportFilters } from '@/types/reports.types';

interface ReportsState {
  reports: Report[];
  selectedReport: Report | null;
  preview: ReportPreview | null;
  filters: ReportFilters;
  loading: boolean;
  error: string | null;
  isGeneratingPreview: boolean;
  isSending: boolean;
}

const initialState: ReportsState = {
  reports: [],
  selectedReport: null,
  preview: null,
  filters: {},
  loading: false,
  error: null,
  isGeneratingPreview: false,
  isSending: false,
};

const reportsSlice = createSlice({
  name: 'reports',
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

    // Reports management
    setReports: (state, action: PayloadAction<Report[]>) => {
      state.reports = action.payload;
      state.loading = false;
      state.error = null;
    },
    
    addReport: (state, action: PayloadAction<Report>) => {
      state.reports.unshift(action.payload);
    },
    
    updateReport: (state, action: PayloadAction<Report>) => {
      const index = state.reports.findIndex(report => report.id === action.payload.id);
      if (index !== -1) {
        state.reports[index] = action.payload;
      }
      if (state.selectedReport?.id === action.payload.id) {
        state.selectedReport = action.payload;
      }
    },
    
    removeReport: (state, action: PayloadAction<string>) => {
      state.reports = state.reports.filter(report => report.id !== action.payload);
      if (state.selectedReport?.id === action.payload) {
        state.selectedReport = null;
      }
    },

    // Selection
    setSelectedReport: (state, action: PayloadAction<Report | null>) => {
      state.selectedReport = action.payload;
      // Clear preview when switching reports
      if (action.payload?.id !== state.selectedReport?.id) {
        state.preview = null;
      }
    },

    // Preview management
    setPreview: (state, action: PayloadAction<ReportPreview | null>) => {
      state.preview = action.payload;
      state.isGeneratingPreview = false;
    },
    
    setIsGeneratingPreview: (state, action: PayloadAction<boolean>) => {
      state.isGeneratingPreview = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },
    
    clearPreview: (state) => {
      state.preview = null;
    },

    // Sending state
    setIsSending: (state, action: PayloadAction<boolean>) => {
      state.isSending = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },

    // Filters
    setFilters: (state, action: PayloadAction<ReportFilters>) => {
      state.filters = action.payload;
    },
    
    updateFilters: (state, action: PayloadAction<Partial<ReportFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    clearFilters: (state) => {
      state.filters = {};
    },

    // Update report metadata after sending
    updateReportLastSent: (state, action: PayloadAction<{ id: string; lastSent: string; nextScheduled?: string }>) => {
      const { id, lastSent, nextScheduled } = action.payload;
      const report = state.reports.find(report => report.id === id);
      if (report) {
        report.lastSent = lastSent;
        if (nextScheduled) {
          report.nextScheduled = nextScheduled;
        }
      }
      if (state.selectedReport?.id === id) {
        state.selectedReport.lastSent = lastSent;
        if (nextScheduled && state.selectedReport) {
          state.selectedReport.nextScheduled = nextScheduled;
        }
      }
    },

    // Toggle report enabled status
    toggleReportEnabled: (state, action: PayloadAction<string>) => {
      const report = state.reports.find(report => report.id === action.payload);
      if (report) {
        report.enabled = !report.enabled;
      }
      if (state.selectedReport?.id === action.payload && state.selectedReport) {
        state.selectedReport.enabled = !state.selectedReport.enabled;
      }
    },

    // Reset state
    resetReportsState: () => initialState,
  },
});

export const {
  setLoading,
  setError,
  clearError,
  setReports,
  addReport,
  updateReport,
  removeReport,
  setSelectedReport,
  setPreview,
  setIsGeneratingPreview,
  clearPreview,
  setIsSending,
  setFilters,
  updateFilters,
  clearFilters,
  updateReportLastSent,
  toggleReportEnabled,
  resetReportsState,
} = reportsSlice.actions;

export default reportsSlice.reducer;
