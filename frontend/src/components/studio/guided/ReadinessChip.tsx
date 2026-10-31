import { Chip } from '@mui/material';
import type { TestDetailDto } from '@/types/studio/studioTypes';
import { READY_CHIP_LABEL, guidedCopy, stepNumberIn } from './guidedNarratives';

/**
 * The readiness chip (STUDIO-OBS-008 AC-3, D-4), read from `GET /tests/{id}` as served and never
 * derived on the client (ADR-SC-005 "Readiness vocabulary").
 *
 *  - `READY`: the existing "Learned · ready to repeat" label, reused from `runEnablement.ts`.
 *  - `NEEDS_RELEARN`: "Steps changed — next Run learns from step k", k being the position of the
 *    server's `firstChangedStepId` in the current draft. If that ID is not in the draft, the clause
 *    naming k is dropped rather than guessed.
 *  - `NEEDS_RELEARN` with `readinessReason: BASE_IDENTITY_INCOMPLETE` (D-4): saved learning cannot
 *    be reused, and the next Run learns from step 1. The wording never says the author changed
 *    steps, because they may not have.
 *  - `UNLEARNED` and `LEARNING` have no chip: the empty state and the live Run status speak for them.
 *
 * The label wraps instead of overflowing, so the chip fits a narrow viewport (AC-8 a).
 */

export function readinessChipLabel(
  test: Pick<TestDetailDto, 'readiness' | 'firstChangedStepId' | 'readinessReason' | 'verification'>,
  draftStepIds: readonly string[],
): string | null {
  if (test.readiness === 'READY') {
    return READY_CHIP_LABEL;
  }
  if (test.readiness === 'RECORDED') {
    const n = stepNumberIn(draftStepIds, test.verification?.firstUnverifiedStepId);
    return n === null ? guidedCopy('recordedNotVerifiedNoStep') : guidedCopy('recordedNotVerified', { n });
  }
  if (test.readiness !== 'NEEDS_RELEARN') {
    return null;
  }
  if (test.readinessReason === 'BASE_IDENTITY_INCOMPLETE') {
    return guidedCopy('baseIdentityIncomplete');
  }
  const k = stepNumberIn(draftStepIds, test.firstChangedStepId);
  return k === null ? guidedCopy('needsRelearnNoBoundary') : guidedCopy('needsRelearn', { k });
}

export interface ReadinessChipProps {
  readonly test: Pick<TestDetailDto, 'readiness' | 'firstChangedStepId' | 'readinessReason' | 'verification'>;
  /** The current draft's stable step IDs, in order. */
  readonly draftStepIds: readonly string[];
}

export function ReadinessChip({ test, draftStepIds }: ReadinessChipProps) {
  const label = readinessChipLabel(test, draftStepIds);
  if (label === null) {
    return null;
  }
  return (
    <Chip
      size="small"
      variant="outlined"
      color={test.readiness === 'READY' ? 'success' : 'warning'}
      label={label}
      data-testid="guided-readiness-chip"
      data-readiness={test.readiness}
      sx={{
        height: 'auto',
        maxWidth: '100%',
        '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', py: 0.25 },
      }}
    />
  );
}

export default ReadinessChip;
