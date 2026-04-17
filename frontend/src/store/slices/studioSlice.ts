import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { TestIR } from '@/types/studio/studioTypes';

interface StudioState {
  testSteps: string[];
  isExecuting: boolean;
  executionLogs: Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    stepIndex?: number;
  }>;
  stepResults: Array<{
    stepIndex: number;
    status: 'pending' | 'running' | 'pass' | 'fail';
    message?: string;
    timestamp: string;
  }>;
  videoUrl: string | null;
  currentStep: number;
  testConfiguration: {
    browser: 'chrome' | 'firefox' | 'safari' | 'edge';
    viewport: { width: number; height: number };
    timeout: number;
    waitStrategy: 'none' | 'networkidle' | 'domcontentloaded';
  };
  testIR: TestIR | null;
  generatedCode: string;
  autoSyncCode: boolean;
}

const initialState: StudioState = {
  testSteps: [],
  isExecuting: false,
  executionLogs: [],
  stepResults: [],
  videoUrl: null,
  currentStep: -1,
  testConfiguration: {
    browser: 'chrome',
    viewport: { width: 1920, height: 1080 },
    timeout: 30000,
    waitStrategy: 'networkidle',
  },
  testIR: null,
  generatedCode: '',
  autoSyncCode: true,
};

const studioSlice = createSlice({
  name: 'studio',
  initialState,
  reducers: {
    updateTestSteps: (state, action: PayloadAction<string[]>) => {
      state.testSteps = action.payload;
      // Reset results when steps change
      state.stepResults = [];
      state.videoUrl = null;
      state.currentStep = -1;
    },

    setExecuting: (state, action: PayloadAction<boolean>) => {
      state.isExecuting = action.payload;
      if (action.payload) {
        // Clear previous results when starting execution
        state.executionLogs = [];
        state.stepResults = state.testSteps.map((_, index) => ({
          stepIndex: index,
          status: 'pending',
          timestamp: new Date().toISOString(),
        }));
        state.currentStep = 0;
      }
    },

    addExecutionLog: (state, action: PayloadAction<StudioState['executionLogs'][0]>) => {
      state.executionLogs.push(action.payload);
    },

    setExecutionLogs: (state, action: PayloadAction<StudioState['executionLogs']>) => {
      state.executionLogs = action.payload;
    },

    updateStepResult: (
      state,
      action: PayloadAction<{ stepIndex: number; status: 'pending' | 'running' | 'pass' | 'fail'; message?: string }>
    ) => {
      const stepResult = state.stepResults.find((r) => r.stepIndex === action.payload.stepIndex);
      if (stepResult) {
        stepResult.status = action.payload.status;
        stepResult.message = action.payload.message;
        stepResult.timestamp = new Date().toISOString();
      }
    },

    setAllStepResults: (
      state,
      action: PayloadAction<Array<{ stepIndex: number; status: 'pending' | 'running' | 'pass' | 'fail'; message?: string }>>
    ) => {
      // Replace or upsert per provided entries
      const indexByStep: Record<number, number> = {};
      state.stepResults.forEach((r, i) => { indexByStep[r.stepIndex] = i; });
      for (const entry of action.payload) {
        const i = indexByStep[entry.stepIndex];
        if (i !== undefined) {
          state.stepResults[i].status = entry.status;
          state.stepResults[i].message = entry.message;
          state.stepResults[i].timestamp = new Date().toISOString();
        } else {
          state.stepResults.push({
            stepIndex: entry.stepIndex,
            status: entry.status,
            message: entry.message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    },

    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },

    setVideoUrl: (state, action: PayloadAction<string | null>) => {
      state.videoUrl = action.payload;
    },

    updateConfiguration: (state, action: PayloadAction<Partial<StudioState['testConfiguration']>>) => {
      state.testConfiguration = { ...state.testConfiguration, ...action.payload };
    },

    setTestIR: (state, action: PayloadAction<TestIR | null>) => {
      state.testIR = action.payload;
    },

    setGeneratedCode: (state, action: PayloadAction<string>) => {
      state.generatedCode = action.payload;
    },

    setAutoSyncCode: (state, action: PayloadAction<boolean>) => {
      state.autoSyncCode = action.payload;
    },

    resetStudio: (state) => {
      state.testSteps = [];
      state.isExecuting = false;
      state.executionLogs = [];
      state.stepResults = [];
      state.videoUrl = null;
      state.currentStep = -1;
      state.testIR = null;
      state.generatedCode = '';
      state.autoSyncCode = true;
    },

    clearLogs: (state) => {
      state.executionLogs = [];
    },
  },
});

export const {
  updateTestSteps,
  setExecuting,
  addExecutionLog,
  setExecutionLogs,
  updateStepResult,
  setAllStepResults,
  setCurrentStep,
  setVideoUrl,
  updateConfiguration,
  setTestIR,
  setGeneratedCode,
  setAutoSyncCode,
  resetStudio,
  clearLogs,
} = studioSlice.actions;

export default studioSlice.reducer;


