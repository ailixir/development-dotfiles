import { Typography, type SxProps, type Theme } from '@mui/material';
import type { GuidedLatestAttempt } from '@/types/studio/studioGuidedTypes';
import type { TestReadiness } from '@/types/studio/studioTypes';
import { formatAbsoluteTime, formatRelativeTime } from '@/utils/time';
import { stoppedStepOf } from './guidedStoppedStep';

/**
 * The "Last learning attempt failed" line (STUDIO-UNIFY-001.6 AC-04), shared by the editor's Test
 * setup summary, the detail page header and the All Checks UI-test row.
 *
 * It is shown only when all of these hold: the test is `UNLEARNED` or `NEEDS_RELEARN` (a `LEARNING`
 * or `READY` test has its own state), the test's latest terminal learning attempt exists and its
 * state is `FAILED`, and that attempt belongs to this test. A missing attempt, a loading read and a
 * failed read all arrive here as no attempt, so they render nothing and no error.
 *
 * ", at step N" is added only when the steps the attempt ran are the steps the test has now: the
 * attempt's `explanation.sourceRevision` equals the test's current `sourceRevision` (the same
 * comparison `planStepTexts` makes), and `stoppedStepOf` proves a step (task 6.1). Otherwise the
 * number could point at a different step, so it is left out.
 */

/**
 * The visible wording. Delegated to @ux-design-expert (story AC-04 names the sentence; the exact
 * words, order and punctuation are theirs to set). `{date}` and `{n}` are filled by
 * {@link lastLearningAttemptLine}.
 */
export const LAST_LEARNING_ATTEMPT_COPY = {
  failed: 'Last learning attempt failed ({date})',
  failedAtStep: 'Last learning attempt failed ({date}, at step {n})',
} as const;

/** The readiness values for which a failed attempt is worth showing. */
const SHOWN_FOR_READINESS: readonly TestReadiness[] = ['UNLEARNED', 'NEEDS_RELEARN'];

export interface LastLearningAttemptInput {
  readonly testId: string;
  readonly readiness: TestReadiness;
  /** The test's current `sourceRevision` (`TestDto.sourceRevision`, a number). */
  readonly sourceRevision: number | string;
  /** From `useLatestLearningAttempts`; `undefined` or `null` when there is none, or while loading. */
  readonly attempt: GuidedLatestAttempt | null | undefined;
}

/**
 * The note's sentence and the instant it states, or `null` when the note is hidden. Pure, so every
 * consumer and the tests read the rules from one place.
 */
export function lastLearningAttemptLine(
  input: LastLearningAttemptInput,
): { text: string; startedAt: string } | null {
  const { testId, readiness, sourceRevision, attempt } = input;
  if (!attempt || attempt.state !== 'FAILED' || attempt.testId !== testId) return null;
  if (!SHOWN_FOR_READINESS.includes(readiness)) return null;
  const date = formatRelativeTime(attempt.startedAt);
  const explanation = attempt.explanation;
  const stopped =
    explanation !== null && explanation.sourceRevision === String(sourceRevision)
      ? stoppedStepOf({ outcome: attempt.state, explanation })
      : null;
  const text =
    stopped === null
      ? LAST_LEARNING_ATTEMPT_COPY.failed.replace('{date}', date)
      : LAST_LEARNING_ATTEMPT_COPY.failedAtStep
          .replace('{date}', date)
          .replace('{n}', String(stopped.number));
  return { text, startedAt: attempt.startedAt };
}

export interface LastLearningAttemptNoteProps extends LastLearningAttemptInput {
  readonly sx?: SxProps<Theme>;
}

export function LastLearningAttemptNote({ sx, ...input }: LastLearningAttemptNoteProps) {
  const line = lastLearningAttemptLine(input);
  if (line === null) return null;
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      component="div"
      data-testid="last-learning-attempt"
      data-learning-test-id={input.testId}
      // The exact instant behind the age or date the sentence shows.
      title={formatAbsoluteTime(line.startedAt)}
      sx={{ overflowWrap: 'anywhere', ...sx }}
    >
      {line.text}
    </Typography>
  );
}

export default LastLearningAttemptNote;
