import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  GuidedClarification,
  GuidedResult,
  GuidedSessionView,
} from '@/types/studio/studioGuidedTypes';

interface StudioState {
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
  /**
   * Guided sessions (STUDIO-OBS-008 AC-2). The test ID to the session ID the page is following.
   * Readiness is never derived here: it is read from `getTest` and the result.
   */
  guidedSessionByTestId: Record<string, string>;
  guidedSessionViewById: Record<string, GuidedSessionView>;
  guidedResultById: Record<string, GuidedResult>;
  /** `null` is "read, none pending"; an absent key is "not read yet". */
  guidedClarificationById: Record<string, GuidedClarification | null>;
  /**
   * The step numbers whose clarification the author answered during this session (SC008-FIX-24).
   * Frontend-only memory: the public session data does not say which steps needed an answer.
   */
  guidedAnsweredStepsById: Record<string, number[]>;
}

const initialState: StudioState = {
  isExecuting: false,
  executionLogs: [],
  stepResults: [],
  currentStep: -1,
  guidedSessionByTestId: {},
  guidedSessionViewById: {},
  guidedResultById: {},
  guidedClarificationById: {},
  guidedAnsweredStepsById: {},
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
        // The Redux `testSteps` field was never written (cleanup inventory CLN-14), so this was
        // always an empty list; the page keeps its own steps and per-step results.
        state.stepResults = [];
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

    setGuidedSession: (state, action: PayloadAction<{ testId: string; sessionId: string }>) => {
      state.guidedSessionByTestId[action.payload.testId] = action.payload.sessionId;
    },

    setGuidedSessionView: (state, action: PayloadAction<GuidedSessionView>) => {
      state.guidedSessionViewById[action.payload.session.sessionId] = action.payload;
    },

    setGuidedResult: (state, action: PayloadAction<GuidedResult>) => {
      state.guidedResultById[action.payload.sessionId] = action.payload;
    },

    setGuidedClarification: (
      state,
      action: PayloadAction<{ sessionId: string; clarification: GuidedClarification | null }>,
    ) => {
      state.guidedClarificationById[action.payload.sessionId] = action.payload.clarification;
    },

    recordGuidedAnsweredStep: (state, action: PayloadAction<{ sessionId: string; stepNumber: number }>) => {
      const { sessionId, stepNumber } = action.payload;
      const answered = state.guidedAnsweredStepsById[sessionId] ?? [];
      if (!answered.includes(stepNumber)) {
        state.guidedAnsweredStepsById[sessionId] = [...answered, stepNumber].sort((a, b) => a - b);
      }
    },

    /** Forgets the session a test was following, with its view, result and question. */
    clearGuidedSession: (state, action: PayloadAction<{ testId: string }>) => {
      const sessionId = state.guidedSessionByTestId[action.payload.testId];
      delete state.guidedSessionByTestId[action.payload.testId];
      if (sessionId !== undefined) {
        delete state.guidedSessionViewById[sessionId];
        delete state.guidedResultById[sessionId];
        delete state.guidedClarificationById[sessionId];
        delete state.guidedAnsweredStepsById[sessionId];
      }
    },
  },
});

export const {
  setExecuting,
  setExecutionLogs,
  setAllStepResults,
  setCurrentStep,
  clearLogs,
  setGuidedSession,
  setGuidedSessionView,
  setGuidedResult,
  setGuidedClarification,
  recordGuidedAnsweredStep,
  clearGuidedSession,
} = studioSlice.actions;

export default studioSlice.reducer;

