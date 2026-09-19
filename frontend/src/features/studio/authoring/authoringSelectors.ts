import type { AuthoringStep, GlobalAuthoringContext } from '@/types/studio/studioTypes';
import type { StudioAuthoringState } from './authoringState';

export const selectCurrentDraft = (state: StudioAuthoringState): StudioAuthoringState => state;
export const selectGlobalContext = (
  state: StudioAuthoringState,
): GlobalAuthoringContext | undefined => state.globalContext;
export const selectOrderedSteps = (state: StudioAuthoringState): readonly AuthoringStep[] => state.steps;
export const selectStepById = (
  state: StudioAuthoringState,
  stepId: string,
): AuthoringStep | undefined => state.steps.find(({ id }) => id === stepId);
