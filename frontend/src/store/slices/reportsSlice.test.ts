import { describe, it, expect } from 'vitest';
import reportsReducer, {
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
  toggleReportStatusOptimistic,
  fetchReports,
  createReport,
  updateReport,
  generatePreview,
  deleteReportThunk,
  pauseReport,
  resumeReport,
  duplicateReport,
} from './reportsSlice';
import type { ReportEntity, ReportSection } from '@/types/reports/reportTypes';

const initialState = reportsReducer(undefined as any, { type: '@@INIT' } as any);

const sampleReport: ReportEntity = {
  id: 'r-1',
  name: 'Daily Status',
  description: 'Checks overview',
  template: 'standard',
  status: 'ACTIVE',
  schedule: { frequency: 'daily', time: '09:00', timezone: 'EST', enabled: true },
  recipients: ['ops@citi.com'],
  selectedChecks: [],
  createdBy: 'user@citi.com',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('reportsSlice — initial state', () => {
  it('returns default state', () => {
    expect(initialState.loading).toBe('idle');
    expect(Array.isArray(initialState.data)).toBe(true);
    expect(initialState.data).toHaveLength(0);
    expect(initialState.previewContent).toBeNull();
    expect(initialState.generatingPreview).toBe(false);
    expect(initialState.currentReport.name).toBe('');
    expect(initialState.currentReport.template).toBe('standard');
  });
});

describe('reportsSlice — sync reducers', () => {
  it('updateCurrentReport merges partial updates', () => {
    const state = reportsReducer(initialState, updateCurrentReport({ name: 'Updated' }));
    expect(state.currentReport.name).toBe('Updated');
    expect(state.currentReport.template).toBe('standard');
  });

  it('resetCurrentReport clears to defaults', () => {
    const modified = reportsReducer(initialState, updateCurrentReport({ name: 'Modified' }));
    const reset = reportsReducer(modified, resetCurrentReport());
    expect(reset.currentReport.name).toBe('');
  });

  it('setPreviewContent stores content', () => {
    const state = reportsReducer(initialState, setPreviewContent('<html>preview</html>'));
    expect(state.previewContent).toBe('<html>preview</html>');
  });

  it('setGeneratingPreview toggles flag', () => {
    const state = reportsReducer(initialState, setGeneratingPreview(true));
    expect(state.generatingPreview).toBe(true);
  });

  it('addCheckToReport appends unique check', () => {
    let state = reportsReducer(initialState, addCheckToReport('check-1'));
    expect(state.currentReport.selectedChecks).toEqual(['check-1']);
    state = reportsReducer(state, addCheckToReport('check-1'));
    expect(state.currentReport.selectedChecks).toEqual(['check-1']);
    state = reportsReducer(state, addCheckToReport('check-2'));
    expect(state.currentReport.selectedChecks).toEqual(['check-1', 'check-2']);
  });

  it('removeCheckFromReport removes check', () => {
    let state = reportsReducer(initialState, addCheckToReport('check-1'));
    state = reportsReducer(state, addCheckToReport('check-2'));
    state = reportsReducer(state, removeCheckFromReport('check-1'));
    expect(state.currentReport.selectedChecks).toEqual(['check-2']);
  });

  it('toggleReportStatusOptimistic updates status in data', () => {
    const withData = {
      ...initialState,
      data: [sampleReport],
    };
    const state = reportsReducer(
      withData,
      toggleReportStatusOptimistic({ id: 'r-1', status: 'PAUSED' }),
    );
    expect((state.data[0] as any).status).toBe('PAUSED');
  });
});

describe('reportsSlice — section management', () => {
  const section1: ReportSection = { id: 's1', title: 'Critical', kind: 'manual', checkIds: [] };
  const section2: ReportSection = { id: 's2', title: 'Warnings', kind: 'manual', checkIds: [] };

  it('addSection appends a section', () => {
    const state = reportsReducer(initialState, addSection(section1));
    expect(state.currentReport.sections).toHaveLength(1);
    expect(state.currentReport.sections![0].title).toBe('Critical');
  });

  it('updateSection replaces matching section', () => {
    let state = reportsReducer(initialState, addSection(section1));
    state = reportsReducer(
      state,
      updateSection({ ...section1, title: 'Updated Critical' }),
    );
    expect(state.currentReport.sections![0].title).toBe('Updated Critical');
  });

  it('removeSection removes by id', () => {
    let state = reportsReducer(initialState, addSection(section1));
    state = reportsReducer(state, addSection(section2));
    state = reportsReducer(state, removeSection('s1'));
    expect(state.currentReport.sections).toHaveLength(1);
    expect(state.currentReport.sections![0].id).toBe('s2');
  });

  it('reorderSections moves section from index to index', () => {
    let state = reportsReducer(initialState, addSection(section1));
    state = reportsReducer(state, addSection(section2));
    state = reportsReducer(state, reorderSections({ from: 0, to: 1 }));
    expect(state.currentReport.sections![0].id).toBe('s2');
    expect(state.currentReport.sections![1].id).toBe('s1');
  });
});

describe('reportsSlice — async thunk reducers', () => {
  it('fetchReports.pending sets loading', () => {
    const state = reportsReducer(initialState, fetchReports.pending('', undefined));
    expect(state.loading).toBe('loading');
    expect(state.error).toBeNull();
  });

  it('fetchReports.fulfilled stores data', () => {
    const payload = { data: [sampleReport], total: 1 } as any;
    const state = reportsReducer(initialState, fetchReports.fulfilled(payload, '', undefined));
    expect(state.loading).toBe('succeeded');
    expect(state.data).toHaveLength(1);
    expect(state.lastFetched).toBeTruthy();
  });

  it('fetchReports.rejected stores error', () => {
    const state = reportsReducer(
      initialState,
      fetchReports.rejected(new Error('Network error'), '', undefined),
    );
    expect(state.loading).toBe('failed');
    expect(state.error).toBe('Network error');
  });

  it('createReport.fulfilled appends to data', () => {
    const state = reportsReducer(initialState, createReport.fulfilled(sampleReport, '', {} as any));
    expect(state.data).toHaveLength(1);
  });

  it('updateReport.fulfilled replaces in data', () => {
    const withData = { ...initialState, data: [sampleReport] };
    const updated = { ...sampleReport, name: 'Updated Name' };
    const state = reportsReducer(
      withData,
      updateReport.fulfilled(updated, '', { id: 'r-1', payload: {} } as any),
    );
    expect(state.data[0].name).toBe('Updated Name');
  });

  it('generatePreview sets and clears generating flag', () => {
    const pending = reportsReducer(initialState, generatePreview.pending('', 'r-1'));
    expect(pending.generatingPreview).toBe(true);
    expect(pending.previewContent).toBeNull();

    const fulfilled = reportsReducer(
      pending,
      generatePreview.fulfilled(
        { preview: 'text', html: '<html>', generatedAt: '2026-01-01' },
        '',
        'r-1',
      ),
    );
    expect(fulfilled.generatingPreview).toBe(false);
    expect(fulfilled.previewContent).toBe('text');
  });

  it('deleteReportThunk.fulfilled removes from data', () => {
    const withData = { ...initialState, data: [sampleReport] };
    const state = reportsReducer(withData, deleteReportThunk.fulfilled('r-1', '', 'r-1'));
    expect(state.data).toHaveLength(0);
  });

  it('pauseReport.fulfilled updates status', () => {
    const withData = { ...initialState, data: [sampleReport] };
    const paused = { ...sampleReport, status: 'PAUSED' as const };
    const state = reportsReducer(withData, pauseReport.fulfilled(paused, '', 'r-1'));
    expect(state.data[0].status).toBe('PAUSED');
  });

  it('resumeReport.fulfilled updates status', () => {
    const withData = { ...initialState, data: [{ ...sampleReport, status: 'PAUSED' as const }] };
    const resumed = { ...sampleReport, status: 'ACTIVE' as const };
    const state = reportsReducer(withData, resumeReport.fulfilled(resumed, '', 'r-1'));
    expect(state.data[0].status).toBe('ACTIVE');
  });

  it('duplicateReport.fulfilled appends copy', () => {
    const withData = { ...initialState, data: [sampleReport] };
    const copy = { ...sampleReport, id: 'r-2', name: 'Daily Status (Copy)', status: 'DRAFT' as const };
    const state = reportsReducer(withData, duplicateReport.fulfilled(copy, '', 'r-1'));
    expect(state.data).toHaveLength(2);
    expect(state.data[1].name).toBe('Daily Status (Copy)');
  });
});
