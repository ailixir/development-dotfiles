import type {
  AuthoringStep,
  GlobalAuthoringContext,
  StepAuthoringContext,
} from '@/types/studio/studioTypes';
import {
  clone,
  rebindStepContext,
  type AuthoringStepIdFactory,
  type StudioAuthoringState,
  withDerivedDirtyState,
} from './authoringState';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BoundCommand {
  draftId: string;
  selectionGeneration: number;
}

export type AuthoringCommand =
  | (BoundCommand & { type: 'addStep'; step: AuthoringStep; at?: number })
  | (BoundCommand & { type: 'editStep'; stepId: string; text: string })
  | (BoundCommand & { type: 'reorderStep'; stepId: string; toIndex: number })
  | (BoundCommand & { type: 'copyStep'; stepId: string; copiedStepId: string })
  | (BoundCommand & { type: 'deleteStep'; stepId: string })
  | (BoundCommand & { type: 'setGlobalContext'; context?: GlobalAuthoringContext })
  | (BoundCommand & { type: 'setStepContext'; stepId: string; context?: StepAuthoringContext })
  | (BoundCommand & { type: 'selectStep'; stepId: string | null });

export function bindCommand(
  state: StudioAuthoringState,
): BoundCommand {
  if (!state.selectedDraftId) throw new Error('No Studio draft is selected');
  return {
    draftId: state.selectedDraftId,
    selectionGeneration: state.selectionGeneration,
  };
}

export function addStepCommand(
  state: StudioAuthoringState,
  text: string,
  idFactory: AuthoringStepIdFactory,
  at?: number,
): AuthoringCommand {
  const id = freshId(idFactory);
  return { ...bindCommand(state), type: 'addStep', step: { id, text }, at };
}

export function copyStepCommand(
  state: StudioAuthoringState,
  stepId: string,
  idFactory: AuthoringStepIdFactory,
): AuthoringCommand {
  return { ...bindCommand(state), type: 'copyStep', stepId, copiedStepId: freshId(idFactory) };
}

function freshId(idFactory: AuthoringStepIdFactory): string {
  const id = idFactory();
  if (!UUID.test(id)) throw new Error('The authoring step ID factory must return a UUID');
  return id;
}

export function reduceAuthoring(
  state: StudioAuthoringState,
  command: AuthoringCommand,
): StudioAuthoringState {
  if (
    command.draftId !== state.selectedDraftId ||
    command.selectionGeneration !== state.selectionGeneration
  ) {
    return state;
  }

  let steps = state.steps.map(clone);
  let globalContext = state.globalContext ? clone(state.globalContext) : undefined;
  let selectedStepId = state.selectedStepId;

  switch (command.type) {
    case 'addStep': {
      if (steps.some(({ id }) => id === command.step.id)) {
        throw new Error(`Duplicate authoring step ID: ${command.step.id}`);
      }
      const at = command.at === undefined ? steps.length : Math.max(0, Math.min(command.at, steps.length));
      steps.splice(at, 0, clone(command.step));
      break;
    }
    case 'editStep':
      steps = replaceStep(steps, command.stepId, (step) => ({ ...step, text: command.text }));
      break;
    case 'reorderStep': {
      const from = requireStepIndex(steps, command.stepId);
      const [step] = steps.splice(from, 1);
      steps.splice(Math.max(0, Math.min(command.toIndex, steps.length)), 0, step);
      break;
    }
    case 'copyStep': {
      if (steps.some(({ id }) => id === command.copiedStepId)) {
        throw new Error(`Duplicate authoring step ID: ${command.copiedStepId}`);
      }
      const from = requireStepIndex(steps, command.stepId);
      const source = steps[from];
      steps.splice(from + 1, 0, {
        id: command.copiedStepId,
        text: source.text,
        context: rebindStepContext(source.context, command.copiedStepId),
      });
      break;
    }
    case 'deleteStep': {
      const index = requireStepIndex(steps, command.stepId);
      steps.splice(index, 1);
      if (selectedStepId === command.stepId) selectedStepId = null;
      if (globalContext?.evidenceReferences) {
        globalContext.evidenceReferences = globalContext.evidenceReferences.filter(
          ({ stepId }) => stepId !== command.stepId,
        );
      }
      break;
    }
    case 'setGlobalContext':
      globalContext = command.context ? clone(command.context) : undefined;
      break;
    case 'setStepContext':
      steps = replaceStep(steps, command.stepId, (step) => ({
        ...step,
        context: command.context ? clone(command.context) : undefined,
      }));
      break;
    case 'selectStep':
      if (command.stepId !== null) requireStepIndex(steps, command.stepId);
      selectedStepId = command.stepId;
      break;
  }

  return withDerivedDirtyState({
    ...state,
    globalContext,
    steps,
    selectedStepId,
  });
}

function requireStepIndex(steps: readonly AuthoringStep[], stepId: string): number {
  const index = steps.findIndex(({ id }) => id === stepId);
  if (index < 0) throw new Error(`Unknown authoring step ID: ${stepId}`);
  return index;
}

function replaceStep(
  steps: AuthoringStep[],
  stepId: string,
  update: (step: AuthoringStep) => AuthoringStep,
): AuthoringStep[] {
  const index = requireStepIndex(steps, stepId);
  steps[index] = update(steps[index]);
  return steps;
}
