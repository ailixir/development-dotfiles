import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { 
  UITest, 
  TestExecution, 
  TestStep, 
  TestStatus,
  VideoPlayerState 
} from '@/types/studio.types';

interface StudioSliceState {
  currentTest: UITest | null;
  isEditing: boolean;
  isExecuting: boolean;
  executionId: string | null;
  currentStep: number | null;
  execution: TestExecution | null;
  videoPlayer: VideoPlayerState;
  tests: UITest[];
  loading: boolean;
  error: string | null;
}

const initialVideoPlayerState: VideoPlayerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  playbackRate: 1,
  selectedStep: null,
};

const initialState: StudioSliceState = {
  currentTest: null,
  isEditing: false,
  isExecuting: false,
  executionId: null,
  currentStep: null,
  execution: null,
  videoPlayer: initialVideoPlayerState,
  tests: [],
  loading: false,
  error: null,
};

const studioSlice = createSlice({
  name: 'studio',
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

    // Test management
    setCurrentTest: (state, action: PayloadAction<UITest | null>) => {
      state.currentTest = action.payload;
      state.isEditing = false;
      state.execution = null;
      state.videoPlayer = initialVideoPlayerState;
    },
    
    setTests: (state, action: PayloadAction<UITest[]>) => {
      state.tests = action.payload;
    },
    
    addTest: (state, action: PayloadAction<UITest>) => {
      state.tests.unshift(action.payload);
    },
    
    updateTest: (state, action: PayloadAction<UITest>) => {
      const index = state.tests.findIndex(test => test.id === action.payload.id);
      if (index !== -1) {
        state.tests[index] = action.payload;
      }
      if (state.currentTest?.id === action.payload.id) {
        state.currentTest = action.payload;
      }
    },
    
    removeTest: (state, action: PayloadAction<string>) => {
      state.tests = state.tests.filter(test => test.id !== action.payload);
      if (state.currentTest?.id === action.payload) {
        state.currentTest = null;
      }
    },

    // Editing state
    setIsEditing: (state, action: PayloadAction<boolean>) => {
      state.isEditing = action.payload;
    },
    
    updateTestSteps: (state, action: PayloadAction<TestStep[]>) => {
      if (state.currentTest) {
        state.currentTest.steps = action.payload;
      }
    },
    
    addTestStep: (state, action: PayloadAction<TestStep>) => {
      if (state.currentTest) {
        state.currentTest.steps.push(action.payload);
      }
    },
    
    updateTestStep: (state, action: PayloadAction<{ index: number; step: TestStep }>) => {
      if (state.currentTest) {
        state.currentTest.steps[action.payload.index] = action.payload.step;
      }
    },
    
    removeTestStep: (state, action: PayloadAction<number>) => {
      if (state.currentTest) {
        state.currentTest.steps.splice(action.payload, 1);
        // Update order for remaining steps
        state.currentTest.steps.forEach((step, index) => {
          step.order = index + 1;
        });
      }
    },

    // Execution state
    setIsExecuting: (state, action: PayloadAction<boolean>) => {
      state.isExecuting = action.payload;
      if (!action.payload) {
        state.executionId = null;
        state.currentStep = null;
      }
    },
    
    setExecutionId: (state, action: PayloadAction<string | null>) => {
      state.executionId = action.payload;
    },
    
    setCurrentStep: (state, action: PayloadAction<number | null>) => {
      state.currentStep = action.payload;
    },
    
    setExecution: (state, action: PayloadAction<TestExecution | null>) => {
      state.execution = action.payload;
      if (action.payload) {
        state.isExecuting = action.payload.status === 'running';
      }
    },
    
    updateExecutionStatus: (state, action: PayloadAction<TestStatus>) => {
      if (state.execution) {
        state.execution.status = action.payload;
        state.isExecuting = action.payload === 'running';
      }
    },

    // Video player state
    setVideoPlayerState: (state, action: PayloadAction<Partial<VideoPlayerState>>) => {
      state.videoPlayer = { ...state.videoPlayer, ...action.payload };
    },
    
    playVideo: (state) => {
      state.videoPlayer.isPlaying = true;
    },
    
    pauseVideo: (state) => {
      state.videoPlayer.isPlaying = false;
    },
    
    seekVideo: (state, action: PayloadAction<number>) => {
      state.videoPlayer.currentTime = action.payload;
    },
    
    setVideoVolume: (state, action: PayloadAction<number>) => {
      state.videoPlayer.volume = Math.max(0, Math.min(1, action.payload));
    },
    
    setPlaybackRate: (state, action: PayloadAction<number>) => {
      state.videoPlayer.playbackRate = action.payload;
    },
    
    selectVideoStep: (state, action: PayloadAction<number | null>) => {
      state.videoPlayer.selectedStep = action.payload;
    },

    // Reset state
    resetStudioState: () => initialState,
    
    resetCurrentExecution: (state) => {
      state.execution = null;
      state.isExecuting = false;
      state.executionId = null;
      state.currentStep = null;
      state.videoPlayer = initialVideoPlayerState;
    },
  },
});

export const {
  setLoading,
  setError,
  clearError,
  setCurrentTest,
  setTests,
  addTest,
  updateTest,
  removeTest,
  setIsEditing,
  updateTestSteps,
  addTestStep,
  updateTestStep,
  removeTestStep,
  setIsExecuting,
  setExecutionId,
  setCurrentStep,
  setExecution,
  updateExecutionStatus,
  setVideoPlayerState,
  playVideo,
  pauseVideo,
  seekVideo,
  setVideoVolume,
  setPlaybackRate,
  selectVideoStep,
  resetStudioState,
  resetCurrentExecution,
} = studioSlice.actions;

export default studioSlice.reducer;
