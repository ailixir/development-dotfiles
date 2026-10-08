import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
    status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL';
    message?: string;
    timestamp: string;
  }>;
  currentStep: number;
}

const initialState: StudioState = {
  testSteps: [],
  isExecuting: false,
  executionLogs: [],
  stepResults: [],
  currentStep: -1,
};

const studioSlice = createSlice({
  name: 'studio',
  initialState,
  reducers: {
    setExecuting: (state, action: PayloadAction<boolean>) => {
      state.isExecuting = action.payload;
      if (action.payload) {
        // Clear previous results when starting execution
        state.executionLogs = [];
        state.stepResults = state.testSteps.map((_, index) => ({
          stepIndex: index,
          status: 'PENDING',
          timestamp: new Date().toISOString(),
        }));
        state.currentStep = -1;
      }
    },

    setExecutionLogs: (state, action: PayloadAction<StudioState['executionLogs']>) => {
      state.executionLogs = action.payload;
    },

    setAllStepResults: (
      state,
      action: PayloadAction<Array<{ stepIndex: number; status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL'; message?: string }>>
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

    clearLogs: (state) => {
      state.executionLogs = [];
    },
  },
});

export const {
  setExecuting,
  setExecutionLogs,
  setAllStepResults,
  setCurrentStep,
  clearLogs,
} = studioSlice.actions;

export default studioSlice.reducer;

