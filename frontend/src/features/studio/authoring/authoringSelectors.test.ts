import { describe, expect, it } from 'vitest';
import { contextDraft } from './authoringFixtures';
import { emptyAuthoringState, hydrateAuthoringState } from './authoringState';
import { selectCurrentDraft, selectGlobalContext, selectOrderedSteps, selectStepById } from './authoringSelectors';

describe('Studio authoring selectors', () => {
  const state = hydrateAuthoringState(emptyAuthoringState, {
    draftId: 'draft-a', sourceRevision: 3, configurationRevision: 2, authoring: contextDraft,
  }, () => { throw new Error('v2 hydration must not allocate IDs'); });

  it('returns the selected immutable draft and ordered steps without generating IDs', () => {
    expect(selectCurrentDraft(state)).toBe(state);
    expect(selectOrderedSteps(state).map(({ id }) => id)).toEqual(contextDraft.steps.map(({ id }) => id));
    expect(Object.isFrozen(selectOrderedSteps(state))).toBe(true);
  });

  it('selects global and step context by stable identity', () => {
    expect(selectGlobalContext(state)?.entries?.[0]).toEqual({ kind: 'text', value: 'Authenticated application' });
    expect(selectStepById(state, contextDraft.steps[0].id)?.text).toBe('Login');
    expect(selectStepById(state, 'missing')).toBeUndefined();
  });
});
