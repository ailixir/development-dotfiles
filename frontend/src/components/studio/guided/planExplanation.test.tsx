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
