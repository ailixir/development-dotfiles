import { describe, expect, it } from 'vitest';
import { contextDraft, legacyDraft } from './authoringFixtures';
import { hydrateAuthoringState, emptyAuthoringState } from './authoringState';
import {
  addStepCommand,
  bindCommand,
  copyStepCommand,
  reduceAuthoring,
  type AuthoringCommand,
} from './authoringReducer';

const ids = (...values: string[]) => {
  let index = 0;
  return () => values[index++];
};

const bind = (state: ReturnType<typeof hydrateAuthoringState>) => bindCommand(state);

describe('Studio authoring reducer', () => {
  it('hydrates legacy text exactly and allocates IDs only at the boundary', () => {
    const state = hydrateAuthoringState(
      emptyAuthoringState,
      { draftId: 'draft-a', sourceRevision: 1, configurationRevision: 1, authoring: legacyDraft },
      ids(
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000202',
      ),
    );
    expect(state.steps).toEqual([
      { id: '00000000-0000-4000-8000-000000000201', text: '  Open Café ☕  ' },
      { id: '00000000-0000-4000-8000-000000000202', text: 'Type "A\\B"\nnext line' },
    ]);
    expect(state.dirty).toEqual({ source: false, context: false });
  });

  it('add/edit/reorder retain identity and preserve exact text', () => {
    let state = hydrated();
    const newId = '00000000-0000-4000-8000-000000000203';
    state = reduceAuthoring(state, addStepCommand(state, '  新規\nstep  ', ids(newId), 1));
    state = reduceAuthoring(state, { ...bind(state), type: 'editStep', stepId: newId, text: '' });
    state = reduceAuthoring(state, { ...bind(state), type: 'reorderStep', stepId: newId, toIndex: 0 });
    expect(state.steps[0]).toEqual({ id: newId, text: '' });
    expect(state.dirty.source).toBe(true);
  });

  it('copy creates a fresh identity and rebinds copied evidence', () => {
    let state = hydratedWithEvidence();
    const copiedId = '00000000-0000-4000-8000-000000000204';
    state = reduceAuthoring(state, copyStepCommand(state, contextDraft.steps[0].id, ids(copiedId)));
    expect(state.steps[1].id).toBe(copiedId);
    expect(state.steps[1].context?.evidenceReferences?.[0].stepId).toBe(copiedId);
    expect(state.steps[0].context?.evidenceReferences?.[0].stepId).toBe(contextDraft.steps[0].id);
  });

  it('delete clears only the selected step and its global evidence', () => {
    let state = hydratedWithEvidence();
    state = reduceAuthoring(state, { ...bind(state), type: 'selectStep', stepId: contextDraft.steps[0].id });
    state = reduceAuthoring(state, { ...bind(state), type: 'deleteStep', stepId: contextDraft.steps[0].id });
    expect(state.selectedStepId).toBeNull();
    expect(state.steps.map(({ id }) => id)).toEqual([contextDraft.steps[1].id]);
    expect(state.globalContext?.evidenceReferences).toEqual([]);
  });

  it('context changes do not mutate source and reverting restores clean state', () => {
    const original = hydrated();
    let state = reduceAuthoring(original, {
      ...bind(original), type: 'setStepContext', stepId: contextDraft.steps[1].id,
      context: { entries: [{ kind: 'text', value: 'protected' }] },
    });
    expect(state.dirty).toEqual({ source: false, context: true });
    state = reduceAuthoring(state, {
      ...bind(state), type: 'setStepContext', stepId: contextDraft.steps[1].id,
      context: contextDraft.steps[1].context,
    });
    expect(state.dirty).toEqual({ source: false, context: false });
  });

  it('keeps global, local and sibling context isolated', () => {
    let state = hydrated();
    state = reduceAuthoring(state, {
      ...bind(state), type: 'setGlobalContext',
      context: { entries: [{ kind: 'text', value: 'new global' }] },
    });
    state = reduceAuthoring(state, {
      ...bind(state), type: 'setStepContext', stepId: contextDraft.steps[1].id,
      context: { entries: [{ kind: 'literal', value: '  exact  ' }] },
    });
    expect(state.globalContext?.entries?.[0]).toEqual({ kind: 'text', value: 'new global' });
    expect(state.steps[0].context).toEqual(contextDraft.steps[0].context);
    expect(state.steps[1].context?.entries?.[0]).toEqual({ kind: 'literal', value: '  exact  ' });
  });

  it('copy then delete original retains copied context under its fresh ID', () => {
    let state = hydratedWithEvidence();
    const copiedId = '00000000-0000-4000-8000-000000000205';
    state = reduceAuthoring(state, copyStepCommand(state, contextDraft.steps[0].id, ids(copiedId)));
    state = reduceAuthoring(state, { ...bind(state), type: 'deleteStep', stepId: contextDraft.steps[0].id });
    expect(state.steps.find(({ id }) => id === copiedId)?.context?.evidenceReferences?.[0].stepId).toBe(copiedId);
  });

  it('rejects duplicate, missing and mixed identities during hydration', () => {
    const duplicate = structuredClone(contextDraft);
    duplicate.steps[1].id = duplicate.steps[0].id;
    expect(() => hydrateAuthoringState(emptyAuthoringState, {
      draftId: 'duplicate', sourceRevision: 1, configurationRevision: 1, authoring: duplicate,
    }, ids())).toThrow(/Duplicate/);

    const missing = structuredClone(contextDraft) as unknown as { authoringSchemaVersion: 2; steps: Array<{ id?: string; text: string }> };
    delete missing.steps[0].id;
    expect(() => hydrateAuthoringState(emptyAuthoringState, {
      draftId: 'missing', sourceRevision: 1, configurationRevision: 1,
      authoring: missing as never,
    }, ids())).toThrow(/required/);

    const mixed = { authoringSchemaVersion: 2, steps: ['legacy', contextDraft.steps[0]] };
    expect(() => hydrateAuthoringState(emptyAuthoringState, {
      draftId: 'mixed', sourceRevision: 1, configurationRevision: 1,
      authoring: mixed as never,
    }, ids())).toThrow();
  });

  it('source edits become clean again when reverted exactly', () => {
    const original = hydrated();
    let state = reduceAuthoring(original, {
      ...bind(original), type: 'editStep', stepId: contextDraft.steps[0].id, text: 'changed',
    });
    expect(state.dirty.source).toBe(true);
    state = reduceAuthoring(state, {
      ...bind(state), type: 'editStep', stepId: contextDraft.steps[0].id,
      text: contextDraft.steps[0].text,
    });
    expect(state.dirty.source).toBe(false);
  });

  it('keeps context clean for source-only add, reorder, copy and delete', () => {
    const plainDraft = {
      authoringSchemaVersion: 2 as const,
      steps: [
        { id: '00000000-0000-4000-8000-000000000211', text: 'one' },
        { id: '00000000-0000-4000-8000-000000000212', text: 'two' },
      ],
    };
    let state = hydrateAuthoringState(emptyAuthoringState, {
      draftId: 'plain', sourceRevision: 1, configurationRevision: 1, authoring: plainDraft,
    }, ids());
    state = reduceAuthoring(state, addStepCommand(
      state, 'three', ids('00000000-0000-4000-8000-000000000213'),
    ));
    expect(state.dirty).toEqual({ source: true, context: false });
    state = reduceAuthoring(state, {
      ...bind(state), type: 'reorderStep',
      stepId: '00000000-0000-4000-8000-000000000213', toIndex: 0,
    });
    expect(state.dirty.context).toBe(false);
    state = reduceAuthoring(state, copyStepCommand(
      state,
      '00000000-0000-4000-8000-000000000212',
      ids('00000000-0000-4000-8000-000000000214'),
    ));
    expect(state.dirty.context).toBe(false);
    state = reduceAuthoring(state, {
      ...bind(state), type: 'deleteStep', stepId: '00000000-0000-4000-8000-000000000211',
    });
    expect(state.dirty.context).toBe(false);
  });

  it('marks both dimensions when copying or deleting context-bearing steps', () => {
    let copied = hydratedWithEvidence();
    copied = reduceAuthoring(copied, copyStepCommand(
      copied,
      contextDraft.steps[0].id,
      ids('00000000-0000-4000-8000-000000000215'),
    ));
    expect(copied.dirty).toEqual({ source: true, context: true });

    let deleted = hydratedWithEvidence();
    deleted = reduceAuthoring(deleted, {
      ...bind(deleted), type: 'deleteStep', stepId: contextDraft.steps[0].id,
    });
    expect(deleted.dirty).toEqual({ source: true, context: true });
  });

  it('ignores stale actions even after selecting A, B, then A again', () => {
    const firstA = hydrated();
    const stale = { ...bind(firstA), type: 'editStep', stepId: contextDraft.steps[0].id, text: 'stale' } as AuthoringCommand;
    const b = hydrateAuthoringState(firstA, {
      draftId: 'draft-b', sourceRevision: 1, configurationRevision: 1, authoring: contextDraft,
    }, ids());
    const secondA = hydrateAuthoringState(b, {
      draftId: 'draft-a', sourceRevision: 2, configurationRevision: 1, authoring: contextDraft,
    }, ids());
    expect(reduceAuthoring(secondA, stale)).toBe(secondA);
  });

  it('detaches and freezes hydrated input', () => {
    const input = structuredClone(contextDraft);
    const state = hydrateAuthoringState(emptyAuthoringState, {
      draftId: 'draft-a', sourceRevision: 1, configurationRevision: 1, authoring: input,
    }, ids());
    input.steps[0].text = 'mutated outside';
    expect(state.steps[0].text).toBe('Login');
    expect(Object.isFrozen(state.steps[0])).toBe(true);
  });
});

function hydrated() {
  return hydrateAuthoringState(emptyAuthoringState, {
    draftId: 'draft-a', sourceRevision: 1, configurationRevision: 1, authoring: contextDraft,
  }, ids());
}

function hydratedWithEvidence() {
  const draft = structuredClone(contextDraft);
  const stepId = draft.steps[0].id;
  const evidence = {
    id: '10000000-0000-4000-8000-000000000101', revision: 1, source: 'supplied' as const,
    csiId: '60406', environment: 'Production', route: '/login', state: 'anonymous-login', stepId,
    capturedAt: '2026-09-18T12:00:00Z', completeness: 'partial' as const,
    hash: 'a'.repeat(64),
  };
  draft.steps[0].context = { ...(draft.steps[0].context ?? {}), evidenceReferences: [evidence] };
  draft.globalContext = { ...(draft.globalContext ?? {}), evidenceReferences: [evidence] };
  return hydrateAuthoringState(emptyAuthoringState, {
    draftId: 'draft-a', sourceRevision: 1, configurationRevision: 1, authoring: draft,
  }, ids());
}
