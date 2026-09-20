import type {
  AuthoringStep,
  AuthoringV2Request,
  GlobalAuthoringContext,
  LegacyAuthoringRequest,
  StepAuthoringContext,
} from '@/types/studio/studioTypes';
import { adaptLegacyStudioAuthoring } from '@/types/studio/legacyStudioAuthoringAdapter';

export interface AuthoringDirtyState {
  readonly source: boolean;
  readonly context: boolean;
}

export interface StudioAuthoringState {
  readonly selectedDraftId: string | null;
  readonly selectionGeneration: number;
  readonly sourceRevision: number | null;
  readonly configurationRevision: number | null;
  readonly globalContext?: GlobalAuthoringContext;
  readonly steps: readonly AuthoringStep[];
  readonly selectedStepId: string | null;
  readonly dirty: AuthoringDirtyState;
  readonly savedSourceProjection: string;
  readonly savedContextProjection: string;
}

export interface HydrateAuthoringInput {
  draftId: string;
  sourceRevision: number | null;
  configurationRevision: number | null;
  authoring: LegacyAuthoringRequest | AuthoringV2Request;
  selectedStepId?: string | null;
}

export type AuthoringStepIdFactory = () => string;

export const emptyAuthoringState: StudioAuthoringState = deepFreeze({
  selectedDraftId: null,
  selectionGeneration: 0,
  sourceRevision: null,
  configurationRevision: null,
  steps: [],
  selectedStepId: null,
  dirty: { source: false, context: false },
  savedSourceProjection: '[]',
  savedContextProjection: '{"steps":[]}',
});

export function hydrateAuthoringState(
  previous: StudioAuthoringState,
  input: HydrateAuthoringInput,
  idFactory: AuthoringStepIdFactory,
): StudioAuthoringState {
  const v2 = 'authoringSchemaVersion' in input.authoring
    ? clone(input.authoring)
    : adaptLegacyStudioAuthoring(input.authoring, idFactory);
  assertUniqueStepIds(v2.steps);
  const source = sourceProjection(v2.steps);
  const context = contextProjection(v2.globalContext, v2.steps);
  const selectedStepId = input.selectedStepId ?? null;
  if (selectedStepId !== null && !v2.steps.some(({ id }) => id === selectedStepId)) {
    throw new Error(`Selected step ${selectedStepId} does not belong to draft ${input.draftId}`);
  }
  return deepFreeze({
    selectedDraftId: input.draftId,
    selectionGeneration: previous.selectionGeneration + 1,
    sourceRevision: input.sourceRevision,
    configurationRevision: input.configurationRevision,
    globalContext: v2.globalContext,
    steps: v2.steps,
    selectedStepId,
    dirty: { source: false, context: false },
    savedSourceProjection: source,
    savedContextProjection: context,
  });
}

export function sourceProjection(steps: readonly AuthoringStep[]): string {
  return JSON.stringify(steps.map(({ id, text }) => ({ id, text })));
}

export function contextProjection(
  globalContext: GlobalAuthoringContext | undefined,
  steps: readonly AuthoringStep[],
): string {
  return JSON.stringify({
    globalContext: globalContext ?? null,
    steps: steps
      .filter(({ context }) => context !== undefined)
      .map(({ id, context }) => ({ id, context }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
}

export function withDerivedDirtyState(
  state: Omit<StudioAuthoringState, 'dirty'>,
): StudioAuthoringState {
  return deepFreeze({
    ...state,
    dirty: {
      source: sourceProjection(state.steps) !== state.savedSourceProjection,
      context:
        contextProjection(state.globalContext, state.steps) !== state.savedContextProjection,
    },
  });
}

export function rebindStepContext(
  context: StepAuthoringContext | undefined,
  copiedStepId: string,
): StepAuthoringContext | undefined {
  if (!context) return undefined;
  return clone({
    ...context,
    evidenceReferences: context.evidenceReferences?.map((evidence) => ({
      ...evidence,
      stepId: copiedStepId,
    })),
  });
}

export function assertUniqueStepIds(steps: readonly AuthoringStep[]): void {
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.id) throw new Error('Authoring step ID is required');
    if (ids.has(step.id)) throw new Error(`Duplicate authoring step ID: ${step.id}`);
    ids.add(step.id);
  }
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
