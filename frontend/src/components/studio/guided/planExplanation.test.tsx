import type React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { GuidedResult, PublicExplanation } from '@/types/studio/studioGuidedTypes';
import { LEARNED_READY_LABEL } from '@/components/studio/run/runEnablement';
import { PlanExplanation, explanationFacts, referenceFlowLines, stepProvenance } from './PlanExplanation';

/**
 * STUDIO-OBS-008 lane L5a: "Steps as learned" (AC-6; architect P3).
 *
 * Payloads are the landed `contracts/v3/fixtures.json` `recordingResult` and
 * `publication-fixtures.json` `positive[0]`, varied field by field.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const V3 = path.join(REPO_ROOT, 'docs/specs/studio-observed-authoring/contracts/v3');
const fixtures = JSON.parse(fs.readFileSync(path.join(V3, 'fixtures.json'), 'utf8'));
const publicationFixtures = JSON.parse(fs.readFileSync(path.join(V3, 'publication-fixtures.json'), 'utf8'));

const recordingResult = (): GuidedResult => structuredClone(fixtures.documents.recordingResult) as GuidedResult;
const publishedResult = (): GuidedResult => structuredClone(publicationFixtures.positive[0].value) as GuidedResult;

const STEP = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

/** A four-step explanation with a reused prefix, a re-learned step, a learned step and two flows. */
function richExplanation(): PublicExplanation {
  return {
    sessionId: 'sample-session',
    sourceRevision: '2',
    configurationRevision: '1',
    steps: [
      { stepId: STEP(1), number: 1, completed: true, learnedFromThisRun: false, reusedFrom: { revisionId: '11111111-1111-4111-8111-111111111111', stepId: STEP(1) }, relearnedAfterDrift: false,
        actions: [{ admissionId: 'a-1', ordinal: 0, attemptOrdinal: 0, operationKind: 'read', safeLabel: 'Read reference', outcome: 'SUCCEEDED', referenceIds: ['ORDER_NUMBER'] }] },
      { stepId: STEP(2), number: 2, completed: true, learnedFromThisRun: true, reusedFrom: null, relearnedAfterDrift: true,
        actions: [{ admissionId: 'a-2', ordinal: 0, attemptOrdinal: 0, operationKind: 'fill', safeLabel: 'Fill field', outcome: 'SUCCEEDED', referenceIds: ['LOGIN_PASSWORD'] }] },
      { stepId: STEP(3), number: 3, completed: true, learnedFromThisRun: true, reusedFrom: null, relearnedAfterDrift: false,
        actions: [{ admissionId: 'a-3', ordinal: 0, attemptOrdinal: 0, operationKind: 'fill', safeLabel: 'Fill field', outcome: 'SUCCEEDED', referenceIds: ['ORDER_NUMBER'] }] },
      { stepId: STEP(4), number: 4, completed: false, learnedFromThisRun: false, reusedFrom: null, relearnedAfterDrift: false, actions: [] },
    ],
    referenceFlows: [
      { bindingId: 'ORDER_NUMBER', producerStepId: STEP(1), consumerStepId: STEP(3), argumentSlot: 'fill.value' },
      { bindingId: 'ORDER_NUMBER', producerStepId: STEP(1), consumerStepId: 'not-in-this-session', argumentSlot: 'assert.expected' },
    ],
  };
}

describe('AC-6: per step, what Studio did and where it came from', () => {
  it('titles the section "Steps as learned" and lists each step with its recorded actions (landed recordingResult)', () => {
    render(<PlanExplanation result={recordingResult()} />);
    const section = screen.getByTestId('plan-explanation');
    expect(within(section).getByRole('heading', { name: 'Steps as learned' })).toBeInTheDocument();
    expect(screen.getByTestId('plan-step-1')).toHaveTextContent('Step 1');
    expect(screen.getByTestId('plan-step-1')).toHaveTextContent('Open page');
    expect(screen.getByTestId('plan-step-2')).toHaveTextContent('Click control');
  });

  it('provenance claims are only the ones the facts prove, in AC-6 order', () => {
    const [reused, relearned, learned, unproved] = richExplanation().steps;
    expect(stepProvenance(reused)).toEqual(['Reused from a previous revision']);
    expect(stepProvenance(relearned)).toEqual(['Learned in this run', 'Re-learned after drift']);
    expect(stepProvenance(learned)).toEqual(['Learned in this run']);
    expect(stepProvenance(unproved)).toEqual([]);
  });

  it('reference IDs are shown as IDs, in code style, as text', () => {
    const result = recordingResult();
    result.explanation = richExplanation();
    result.explanation.steps[0].actions[0].referenceIds = ['<img src=x onerror=alert(1)>'];
    const { container } = render(<PlanExplanation result={result} />);
    expect(container.querySelector('img')).toBeNull();
    const ids = screen.getAllByTestId('plan-reference-id');
    expect(ids[0].tagName).toBe('CODE');
    expect(ids[0].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(ids.map((id) => id.textContent)).toContain('LOGIN_PASSWORD');
  });

  it('a step with no proved actions shows none and makes no claim', () => {
    const result = recordingResult();
    result.explanation = richExplanation();
    render(<PlanExplanation result={result} />);
    const step4 = screen.getByTestId('plan-step-4');
    expect(within(step4).queryByTestId('plan-action')).toBeNull();
    expect(step4).toHaveTextContent(/^Step 4$/u);
  });
});

describe('AC-6: reference flows, IDs never values', () => {
  it('"<binding> from step p → <operation> in step c", and a flow to an unnumbered step is left out', () => {
    expect(referenceFlowLines(richExplanation())).toEqual(['ORDER_NUMBER from step 1 → Fill field in step 3']);
  });

  it.each([
    ['selectOption.value', 'Select option'],
    ['assert.expected', 'Check expected result'],
  ] as const)('%s reads as the P3 label "%s"', (argumentSlot, label) => {
    const explanation = richExplanation();
    explanation.referenceFlows = [{ bindingId: 'B', producerStepId: STEP(1), consumerStepId: STEP(2), argumentSlot }];
    expect(referenceFlowLines(explanation)).toEqual([`B from step 1 → ${label} in step 2`]);
  });
});

describe('AC-6: published history and current readiness are separate facts', () => {
  it('a published receipt whose revision is no longer current (landed positive fixture, HEAD_CHANGED)', () => {
    const result = publishedResult();
    expect(result.currentReadiness.ready).toBe(false);
    expect(explanationFacts(result)).toEqual({
      history: 'Completed — learned from this run.',
      current: 'Steps not ready to repeat.',
    });
    render(<PlanExplanation result={result} />);
    expect(screen.getByTestId('plan-explanation-history')).toHaveTextContent('Completed — learned from this run.');
    expect(screen.getByTestId('plan-explanation-current')).toHaveTextContent('Steps not ready to repeat.');
  });

  it('a published receipt that is current, and a run that published nothing', () => {
    const current = publishedResult();
    current.currentReadiness = { revisionId: '11111111-1111-4111-8111-111111111111', ready: true, code: 'READY' };
    expect(explanationFacts(current)).toEqual({ history: 'Completed — learned from this run.', current: LEARNED_READY_LABEL });
    expect(explanationFacts(recordingResult())).toEqual({ history: null, current: 'Steps not ready to repeat.' });
  });
});

// ---------------------------------------------------------------------------------------------
// Round 067: D1 (step text, UUID ids) and D3 (relearn state), read from the page's server draft
// ---------------------------------------------------------------------------------------------

const PUBLISHED_REVISION = '11111111-1111-4111-8111-111111111111';

/** A published result over the four-step explanation, whose source revision is `sourceRevision`. */
function publishedRich(sourceRevision = '2'): GuidedResult {
  const result = publishedResult();
  result.explanation = richExplanation();
  result.explanation.sourceRevision = sourceRevision;
  return result;
}

function serverDraft(over: Partial<NonNullable<React.ComponentProps<typeof PlanExplanation>['test']>> = {}) {
  return {
    sourceRevision: 2,
    readiness: 'READY' as const,
    firstChangedStepId: null,
    confirmedRevisionId: PUBLISHED_REVISION,
    steps: [1, 2, 3, 4].map((n) => ({ id: STEP(n), text: `Authored sentence ${n}` })),
    ...over,
  };
}

describe('round 067 D1a: the authored sentence under each step', () => {
  it('(a) same sourceRevision: every step shows its sentence, and the action stays "Click control"', () => {
    const result = publishedRich();
    result.explanation.steps[2].actions[0].safeLabel = 'Click control';
    render(<PlanExplanation result={result} test={serverDraft()} />);
    const step3 = screen.getByTestId('plan-step-3');
    expect(within(step3).getByTestId('plan-step-text')).toHaveTextContent('Authored sentence 3');
    expect(within(step3).getByTestId('plan-action')).toHaveTextContent('Click control');
    expect(screen.getAllByTestId('plan-step-text')).toHaveLength(4);
  });

  it('(b) NEEDS_RELEARN at step 3 under a different sourceRevision: only the steps before it carry text', () => {
    render(
      <PlanExplanation
        result={publishedRich('2')}
        test={serverDraft({ sourceRevision: 3, readiness: 'NEEDS_RELEARN', firstChangedStepId: STEP(3) })}
      />,
    );
    expect(within(screen.getByTestId('plan-step-1')).getByTestId('plan-step-text')).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-step-2')).getByTestId('plan-step-text')).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-step-3')).queryByTestId('plan-step-text')).toBeNull();
    expect(within(screen.getByTestId('plan-step-4')).queryByTestId('plan-step-text')).toBeNull();
  });

  it('a different sourceRevision on a draft that is not the published one shows no text', () => {
    render(
      <PlanExplanation
        result={publishedRich('2')}
        test={serverDraft({ sourceRevision: 3, readiness: 'NEEDS_RELEARN', firstChangedStepId: STEP(3), confirmedRevisionId: 'other' })}
      />,
    );
    expect(screen.queryByTestId('plan-step-text')).toBeNull();
  });

  it('(c) no test: no sentence and no changed chip (unchanged output)', () => {
    render(<PlanExplanation result={publishedRich()} />);
    expect(screen.queryByTestId('plan-step-text')).toBeNull();
    expect(screen.queryByTestId('plan-step-changed')).toBeNull();
  });

  it('the sentence is an escaped text node', () => {
    const { container } = render(
      <PlanExplanation
        result={publishedRich()}
        test={serverDraft({ steps: [{ id: STEP(1), text: '<img src=x onerror=alert(1)> <secret PASS>' }] })}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('plan-step-text').textContent).toBe('<img src=x onerror=alert(1)> <secret PASS>');
  });
});

describe('round 067 D1b: server-generated UUID reference ids are left out', () => {
  it('(d) a UUID id is absent from the action, a declared name is still rendered, case-insensitively', () => {
    const result = publishedRich();
    result.explanation.steps[1].actions[0].referenceIds = [
      '3f2a9c10-7b1e-4c55-9d0a-0123456789ab',
      '3F2A9C10-7B1E-4C55-9D0A-0123456789AB',
      'LOGIN_PASSWORD',
      '3f2a9c10-7b1e-4c55-9d0a-0123456789abc',
    ];
    const { container } = render(<PlanExplanation result={result} />);
    const action = within(screen.getByTestId('plan-step-2')).getByTestId('plan-action');
    const ids = within(action).getAllByTestId('plan-reference-id').map((node) => node.textContent);
    expect(ids).toEqual(['LOGIN_PASSWORD', '3f2a9c10-7b1e-4c55-9d0a-0123456789abc']);
    expect(action.textContent).not.toMatch(/3f2a9c10-7b1e-4c55-9d0a-0123456789ab(?!c)/iu);
    expect(container.innerHTML).not.toMatch(/data-uuid|title=/u);
  });
});

describe('round 067 D3: the plan follows the server readiness after an edit', () => {
  const relearn = () => serverDraft({ sourceRevision: 3, readiness: 'NEEDS_RELEARN', firstChangedStepId: STEP(3) });

  it('NEEDS_RELEARN at step 3 with the published revision: current line, changed chip, history kept', () => {
    render(<PlanExplanation result={publishedRich()} test={relearn()} />);
    expect(screen.getByTestId('plan-explanation-current')).toHaveTextContent('Steps changed — next Run learns from step 3');
    expect(within(screen.getByTestId('plan-step-3')).getByTestId('plan-step-changed')).toHaveTextContent('Changed since this run');
    expect(screen.getAllByTestId('plan-step-changed')).toHaveLength(1);
    expect(screen.getByTestId('plan-explanation')).not.toHaveTextContent(LEARNED_READY_LABEL);
    expect(screen.getByTestId('plan-explanation-history')).toHaveTextContent('Completed — learned from this run.');
  });

  it('a different confirmedRevisionId keeps the result-based line and no chip', () => {
    render(<PlanExplanation result={publishedRich()} test={{ ...relearn(), confirmedRevisionId: 'someone-else' }} />);
    expect(screen.getByTestId('plan-explanation-current')).toHaveTextContent('Steps not ready to repeat.');
    expect(screen.queryByTestId('plan-step-changed')).toBeNull();
  });

  it('READY on the published revision reads the ready label and flags no step', () => {
    render(<PlanExplanation result={publishedRich()} test={serverDraft()} />);
    expect(screen.getByTestId('plan-explanation-current')).toHaveTextContent(LEARNED_READY_LABEL);
    expect(screen.queryByTestId('plan-step-changed')).toBeNull();
  });

  it('BASE_IDENTITY_INCOMPLETE flags no step', () => {
    render(
      <PlanExplanation
        result={publishedRich()}
        test={{ ...relearn(), readinessReason: 'BASE_IDENTITY_INCOMPLETE' }}
      />,
    );
    expect(screen.queryByTestId('plan-step-changed')).toBeNull();
  });
});
