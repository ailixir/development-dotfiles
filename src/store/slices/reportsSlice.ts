import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AsyncState } from '../../types/common/commonTypes';
import type { ReportEntity, ReportConfiguration, ReportPreviewResponse, ReportSection } from '@/types/reports/reportTypes';
import { reportsApi } from '@/services/api/reportsApi';

interface ReportsState extends AsyncState<ReportEntity[]> {
  currentReport: ReportConfiguration;
  previewContent: string | null;
  generatingPreview: boolean;
  executionsByReportId?: Record<string, any[]>;
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
    sections: [],
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
  executionsByReportId: {},
};

// Async thunks
export const fetchReports = createAsyncThunk(
  'reports/fetchReports',
  async (params: { status?: string; page?: number; limit?: number } | undefined) => {
    const resp = await reportsApi.listReports(params);
    return resp;
  }
);

export const createReport = createAsyncThunk(
  'reports/createReport',
  async (payload: import('@/services/api/reportsApi').CreateReportPayload) => {
    const created = await reportsApi.createReport(payload);
    return created;
  }
);

export const updateReport = createAsyncThunk(
  'reports/updateReport',
  async ({ id, payload }: { id: string; payload: Partial<import('@/services/api/reportsApi').CreateReportPayload> }) => {
    const updated = await reportsApi.updateReport(id, payload);
    return updated;
  }
);

export const generatePreview = createAsyncThunk(
  'reports/generatePreview',
  async (id: string) => {
    const resp: ReportPreviewResponse = await reportsApi.previewReport(id);
    // Expose HTML for iframe rendering without changing state shape
    try {
      (window as any).__REPORT_HTML_PREVIEW__ = resp?.html;
    } catch {}
    return resp;
  }
);

export const fetchReportById = createAsyncThunk(
  'reports/fetchReportById',
  async (id: string) => {
    const resp = await reportsApi.getById(id);
    return resp;
  }
);

export const fetchReportExecutions = createAsyncThunk(
  'reports/fetchReportExecutions',
  async (id: string) => {
    const resp = await reportsApi.getExecutions(id);
    return { id, executions: resp.data } as { id: string; executions: any[] };
  }
);

export const pauseReport = createAsyncThunk(
  'reports/pauseReport',
  async (id: string) => {
    const updated = await reportsApi.pauseReport(id);
    return updated;
  }
);

export const resumeReport = createAsyncThunk(
  'reports/resumeReport',
  async (id: string) => {
    const updated = await reportsApi.resumeReport(id);
    return updated;
  }
);

export const duplicateReport = createAsyncThunk(
  'reports/duplicateReport',
  async (id: string) => {
    const copy = await reportsApi.duplicateReport(id);
    return copy;
  }
);

export const sendTestReport = createAsyncThunk(
  'reports/sendTestReport',
  async ({ id, to }: { id: string; to?: string }) => {
    const res = await reportsApi.sendTest(id, to);
    return { id, ...res } as { id: string; ok: boolean; sentAt: string };
  }
);

export const deleteReportThunk = createAsyncThunk(
  'reports/deleteReport',
  async (id: string) => {
    await reportsApi.deleteReport(id);
    return id;
  }
);

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    // Optimistic toggles for pause/resume from UI listings
    toggleReportStatusOptimistic: (state, action: PayloadAction<{ id: string; status: 'active' | 'paused' }>) => {
      const idx = state.data.findIndex((r) => r.id === action.payload.id);
      if (idx !== -1) {
        state.data[idx] = { ...state.data[idx], status: action.payload.status } as any;
      }
    },
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
    addSection: (state, action: PayloadAction<ReportSection>) => {
      const sections = state.currentReport.sections || [];
      state.currentReport.sections = [...sections, action.payload];
    },
    updateSection: (state, action: PayloadAction<ReportSection>) => {
      const sections = state.currentReport.sections || [];
      state.currentReport.sections = sections.map((s) => (s.id === action.payload.id ? action.payload : s));
    },
    removeSection: (state, action: PayloadAction<string>) => {
      const sections = state.currentReport.sections || [];
      state.currentReport.sections = sections.filter((s) => s.id !== action.payload);
    },
    reorderSections: (state, action: PayloadAction<{ from: number; to: number }>) => {
      const sections = state.currentReport.sections || [];
      const updated = [...sections];
      const [moved] = updated.splice(action.payload.from, 1);
      updated.splice(action.payload.to, 0, moved);
      state.currentReport.sections = updated;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReports.pending, (state) => {
        state.loading = 'loading';
        state.error = null;
      })
      .addCase(fetchReports.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data = action.payload.data;
        state.lastFetched = new Date().toISOString();
      })
      .addCase(fetchReports.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to load reports';
      })
      .addCase(createReport.fulfilled, (state, action) => {
        state.data.push(action.payload);
      })
      .addCase(updateReport.fulfilled, (state, action) => {
        const idx = state.data.findIndex(r => r.id === action.payload.id);
        if (idx !== -1) state.data[idx] = action.payload;
      })
      .addCase(generatePreview.pending, (state) => {
        state.generatingPreview = true;
        state.previewContent = null;
      })
      .addCase(generatePreview.fulfilled, (state, action) => {
        state.generatingPreview = false;
        state.previewContent = action.payload.preview;
      })
      .addCase(generatePreview.rejected, (state, action) => {
        state.generatingPreview = false;
        state.error = action.error.message || 'Failed to generate preview';
      })
      .addCase(fetchReportById.fulfilled, (state, action) => {
        const idx = state.data.findIndex((r) => r.id === action.payload.id);
        if (idx === -1) state.data.push(action.payload);
        // hydrate currentReport for editing flows if desired
      })
      .addCase(fetchReportExecutions.fulfilled, (state, _action) => {
        const { id, executions } = _action.payload as any;
        if (!state.executionsByReportId) state.executionsByReportId = {};
        state.executionsByReportId[id] = executions;
      })
      .addCase(pauseReport.fulfilled, (state, action) => {
        const idx = state.data.findIndex((r) => r.id === action.payload.id);
        if (idx !== -1) state.data[idx] = action.payload;
      })
      .addCase(resumeReport.fulfilled, (state, action) => {
        const idx = state.data.findIndex((r) => r.id === action.payload.id);
        if (idx !== -1) state.data[idx] = action.payload;
      })
      .addCase(duplicateReport.fulfilled, (state, action) => {
        state.data.push(action.payload);
      })
      .addCase(deleteReportThunk.fulfilled, (state, action) => {
        state.data = state.data.filter((r) => r.id !== action.payload);
      });
  }
});

export const {
  updateCurrentReport,
  resetCurrentReport,
  setPreviewContent,
  setGeneratingPreview,
  addCheckToReport,
  removeCheckFromReport,
  addSection,
  updateSection,
  removeSection,
  reorderSections,
} = reportsSlice.actions;

// Export specific action creators explicitly when needed for IDE/linter consistency
export const toggleReportStatusOptimistic = reportsSlice.actions.toggleReportStatusOptimistic;

export default reportsSlice.reducer;