import { Box, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import type { TestDetailDto } from '@/types/studio/studioTypes';
import type {
  GuidedArgumentSlot,
  GuidedResult,
  PublicExplanation,
  PublicExplanationStep,
} from '@/types/studio/studioGuidedTypes';
import { READY_CHIP_LABEL, guidedCopy, type GuidedCopyKey } from './guidedNarratives';
import { readinessChipLabel } from './ReadinessChip';

/**
 * "Steps as learned" (STUDIO-OBS-008 AC-6; architect P3): a read-only account of what this session
 * did, in place of the removed Code tab.
 *
 *  - **Everything comes from the result's own `explanation`**, never from the test's current head.
 *    Per step: what Studio did (the controlled `safeLabel` of each recorded operation), whether the
 *    step was learned in this run, reused from a previous revision, or re-learned after drift. A
 *    step the retained facts do not prove carries no claim and no actions.
 *  - **IDs, never values.** `referenceIds` and reference-flow `bindingId`s are declared IDs; they are
 *    shown as text in code style and never interpreted as markup. Server-generated UUID ids are left
 *    out (round 067 amendment to P3). The authored sentence is shown only as a caption under the step
 *    (round 067 D1a), never as a value source (P2).
 *  - **Reference flows** read "<binding> from step 2 → Fill field in step 4", numbered by the
 *    explanation's own steps. A flow whose producer or consumer step it does not number is left out,
 *    never linked by guess.
 *  - **History and current readiness are two facts** (AC-6). "Completed — learned from this run."
 *    comes from the learned receipt (`publication.status: PUBLISHED`), and the current-readiness line
 *    from `currentReadiness.ready`. Neither implies the other.
 */

const SLOT_COPY: Record<GuidedArgumentSlot, GuidedCopyKey> = {
  'fill.value': 'slotFill',
  'selectOption.value': 'slotSelectOption',
  'assert.expected': 'slotAssertExpected',
};

/** The provenance claims a step's retained facts prove, in AC-6 order. */
export function stepProvenance(step: PublicExplanationStep): string[] {
  const claims: string[] = [];
  if (step.learnedFromThisRun) claims.push(guidedCopy('learnedInThisRun'));
  if (step.reusedFrom !== null) claims.push(guidedCopy('reusedFromPreviousRevision'));
  if (step.relearnedAfterDrift) claims.push(guidedCopy('relearnedAfterDrift'));
  return claims;
}

/** One sentence per reference flow both of whose steps the explanation numbers. */
export function referenceFlowLines(explanation: PublicExplanation): string[] {
  const numberOf = new Map(explanation.steps.map((step) => [step.stepId, step.number]));
  const lines: string[] = [];
  for (const flow of explanation.referenceFlows) {
    const producer = numberOf.get(flow.producerStepId);
    const consumer = numberOf.get(flow.consumerStepId);
    if (producer === undefined || consumer === undefined) continue;
    lines.push(
      guidedCopy('referenceFlow', {
        binding: flow.bindingId,
        producer,
        slot: guidedCopy(SLOT_COPY[flow.argumentSlot]),
        consumer,
      }),
    );
  }
  return lines;
}

/** The two separate facts: published history (or none), and readiness now. */
export function explanationFacts(
  result: Pick<GuidedResult, 'publication' | 'currentReadiness'>,
): { readonly history: string | null; readonly current: string } {
  return {
    history: result.publication.status === 'PUBLISHED' ? guidedCopy('completedLearned') : null,
    current: result.currentReadiness.ready ? READY_CHIP_LABEL : guidedCopy('notReadyNow'),
  };
}

/** The server's own view of the test, read from `GET`/`PUT /tests/{id}` (never the unsaved editor). */
export type PlanTest = Pick<
  TestDetailDto,
  'sourceRevision' | 'steps' | 'readiness' | 'readinessReason' | 'firstChangedStepId' | 'confirmedRevisionId'
>;

type PlanResult = Pick<GuidedResult, 'explanation' | 'publication' | 'currentReadiness'>;

/** Round 067 D3: the test's readiness speaks for "now" only when it describes the revision this run published. */
function testDescribesThisRun(result: PlanResult, test: PlanTest | null | undefined): test is PlanTest {
  return (
    test !== null &&
    test !== undefined &&
    result.publication.status === 'PUBLISHED' &&
    result.publication.receipt.revisionId === test.confirmedRevisionId &&
    (test.readiness === 'READY' || test.readiness === 'NEEDS_RELEARN')
  );
}

/** Round 067 D3: the current-readiness line, from the fresh test read where it applies. */
export function currentReadinessLine(result: PlanResult, test?: PlanTest | null): string {
  if (testDescribesThisRun(result, test)) {
    const label = readinessChipLabel(
      test,
      test.steps.map((step) => step.id),
    );
    if (label !== null) return label;
  }
  return explanationFacts(result).current;
}

/** Round 067 D3: the stable ID of the step changed since this run, or null. */
export function changedStepIdOf(result: PlanResult, test?: PlanTest | null): string | null {
  if (!testDescribesThisRun(result, test)) return null;
  if (test.readiness !== 'NEEDS_RELEARN' || test.readinessReason === 'BASE_IDENTITY_INCOMPLETE') return null;
  return test.firstChangedStepId;
}

/**
 * Round 067 D1a: the authored sentence per step, only where it provably equals what the run used.
 * Same `sourceRevision`: all steps. Otherwise, for the revision this run published and a
 * NEEDS_RELEARN draft: the steps before `firstChangedStepId`, which are unchanged by definition.
 */
export function planStepTexts(result: PlanResult, test?: PlanTest | null): ReadonlyMap<string, string> {
  const texts = new Map<string, string>();
  if (test === null || test === undefined) return texts;
  let eligible: PlanTest['steps'] = [];
  if (String(test.sourceRevision) === result.explanation.sourceRevision) {
    eligible = test.steps;
  } else if (
    result.publication.status === 'PUBLISHED' &&
    result.publication.receipt.revisionId === test.confirmedRevisionId &&
    test.readiness === 'NEEDS_RELEARN' &&
    test.firstChangedStepId !== null
  ) {
    const boundary = test.steps.findIndex((step) => step.id === test.firstChangedStepId);
    if (boundary >= 0) eligible = test.steps.slice(0, boundary);
  }
  for (const step of eligible) {
    if (step.text.trim() !== '') texts.set(step.id, step.text);
  }
  return texts;
}

/** Round 067 D1b (architect P3 amendment): server-generated input UUIDs are not shown. */
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ID_SX = {
  fontFamily: 'monospace',
  px: 0.5,
  borderRadius: 0.5,
  bgcolor: 'action.hover',
  overflowWrap: 'anywhere',
} as const;

export interface PlanExplanationProps {
  readonly result: PlanResult;
  /** The page's server draft. Absent: the plan reads from the result alone. */
  readonly test?: PlanTest | null;
}

export function PlanExplanation({ result, test = null }: PlanExplanationProps) {
  const { explanation } = result;
  const facts = { ...explanationFacts(result), current: currentReadinessLine(result, test) };
  const stepTexts = planStepTexts(result, test);
  const changedStepId = changedStepIdOf(result, test);
  const flows = referenceFlowLines(explanation);
  const steps = [...explanation.steps].sort((a, b) => a.number - b.number);

  return (
    <Paper variant="outlined" component="section" data-testid="plan-explanation" sx={{ p: 2, minWidth: 0 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" component="h3">
          {guidedCopy('planTitle')}
        </Typography>
        <Stack spacing={0.25} data-testid="plan-explanation-facts">
          {facts.history !== null && (
            <Typography variant="body2" data-testid="plan-explanation-history">
              {facts.history}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" data-testid="plan-explanation-current">
            {facts.current}
          </Typography>
        </Stack>
        <Divider />
        <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {steps.map((step) => {
            const claims = stepProvenance(step);
            return (
              <Box component="li" key={step.stepId} data-testid={`plan-step-${step.number}`} sx={{ minWidth: 0 }}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {guidedCopy('stepHeading', { N: step.number })}
                    </Typography>
                    {claims.map((claim) => (
                      <Chip key={claim} size="small" variant="outlined" label={claim} />
                    ))}
                    {changedStepId === step.stepId && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="warning"
                        label={guidedCopy('changedSinceThisRun')}
                        data-testid="plan-step-changed"
                      />
                    )}
                  </Stack>
                  {stepTexts.has(step.stepId) && (
                    <Typography variant="body2" data-testid="plan-step-text" sx={{ overflowWrap: 'anywhere' }}>
                      {stepTexts.get(step.stepId)}
                    </Typography>
                  )}
                  {step.actions.length > 0 && (
                    <Stack component="ul" spacing={0.5} sx={{ pl: 2, m: 0 }}>
                      {step.actions.map((action) => (
                        <Box
                          component="li"
                          key={`${action.admissionId}:${action.ordinal}:${action.attemptOrdinal}`}
                          data-testid="plan-action"
                          sx={{ minWidth: 0 }}
                        >
                          <Typography variant="body2" component="span">
                            {action.safeLabel}
                          </Typography>
                          {action.referenceIds.filter((id) => !UUID_ID.test(id)).map((id) => (
                            <Box key={id} component="code" data-testid="plan-reference-id" sx={{ ...ID_SX, ml: 1 }}>
                              {id}
                            </Box>
                          ))}
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
        {flows.length > 0 && (
          <Stack spacing={0.5} data-testid="plan-reference-flows">
            {flows.map((line) => (
              <Typography key={line} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {line}
              </Typography>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

export default PlanExplanation;
