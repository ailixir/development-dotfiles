import { Box, Paper, Typography } from '@mui/material';
import type {
  GuidedActionOutcome,
  GuidedResult,
  PublicSession,
} from '@/types/studio/studioGuidedTypes';
import { isGuidedTerminalState } from '@/types/studio/studioGuidedTypes';
import { CANCELLED_NARRATIVE, guidedCopy } from './guidedNarratives';
import { guidedCompletionView } from './GuidedCompletion';
import { loginNoticeSentences } from './LoginRequiredNotice';

/**
 * The Logs tab while a guided (learning) session is on screen (STUDIO-UNIFY-001.6 AC-03; N1, D3).
 *
 * There is no log stream for learning: the public contract has no `logs` on a session. What it does
 * hold is `session.counters` on every poll and, after the end, `result.explanation.steps[].actions[]`
 * (`safeLabel`, `outcome`, no timestamps). So this shows exactly that and invents nothing:
 *
 *  - **In progress** (and a terminal session whose result has not been read yet): one sentence that
 *    says there is no live log and where progress is, plus one line from the latest poll's counters.
 *  - **Terminal with a result**: one line per action of the explanation, in step order, then a
 *    closing line "Learning ended: {the outcome sentence}". The outcome sentence is the first line of
 *    the same view the Proof tab's alert shows (`guidedCompletionView`), so the two cannot disagree.
 *    A result whose explanation proves no action has only the closing line.
 *
 * No line has a time: the data has none, so the lines carry no timestamp column.
 */

/**
 * The visible wording. Delegated to @ux-design-expert (story AC-03 and D1 fix the line shapes; the
 * exact words are theirs to set). Plural forms follow the counts.
 */
export const GUIDED_LEARNING_LOG_COPY = {
  noLiveLog: 'Learning has no live log. Progress is on the Proof tab.',
  /** "Studio has looked at the page 3 times and tried 2 actions so far." */
  counters: (observations: number, actions: number): string =>
    `Studio has looked at the page ${observations} ${observations === 1 ? 'time' : 'times'} and tried ${actions} ${actions === 1 ? 'action' : 'actions'} so far.`,
  /** "Step 2: Click — done" */
  action: (stepNumber: number, label: string, outcome: string): string =>
    `Step ${stepNumber}: ${label} — ${outcome}`,
  ended: (sentence: string): string => `Learning ended: ${sentence}`,
} as const;

/**
 * An action's `outcome` in the words of a log line: `SUCCEEDED` is done, `FAILED` is failed,
 * `UNKNOWN_OUTCOME` is outcome unknown, and an action that was admitted or dispatching but has no
 * result, or was revoked, did not run to an end.
 */
export const GUIDED_ACTION_OUTCOME_WORDS: Readonly<Record<GuidedActionOutcome, string>> = {
  SUCCEEDED: 'done',
  FAILED: 'failed',
  UNKNOWN_OUTCOME: 'outcome unknown',
  ADMITTED: 'not run',
  DISPATCHING: 'not run',
  REVOKED: 'not run',
};

/** The first sentence of how the session ended, from the view the Proof tab's alert is built from. */
function endedSentence(result: GuidedResult, firstLearnStepId: string | null): string | null {
  const view = guidedCompletionView(result, firstLearnStepId);
  if (view === null) return null;
  if (view.kind === 'cancelled') return CANCELLED_NARRATIVE.title;
  // The step number is the editor's to resolve; the log names the outcome without it.
  if (view.kind === 'login') return loginNoticeSentences(view.notice, null)[0] ?? null;
  const line = view.lines[0];
  return line === undefined ? null : firstSentence(line);
}

/**
 * Only the first sentence: the rest of an alert line can point at the alert's own layout ("the reason
 * … is shown below"), which the Logs tab does not have.
 */
function firstSentence(line: string): string {
  const end = line.indexOf('. ');
  return end === -1 ? line : line.slice(0, end + 1);
}

/** The log's lines, in order. Pure, so each branch is asserted without rendering. */
export function guidedLearningLogLines(session: PublicSession, result: GuidedResult | null): string[] {
  if (!isGuidedTerminalState(session.state) || result === null) {
    return [
      GUIDED_LEARNING_LOG_COPY.noLiveLog,
      GUIDED_LEARNING_LOG_COPY.counters(session.counters.observations, session.counters.actions),
    ];
  }
  const lines: string[] = [];
  const steps = [...result.explanation.steps].sort((a, b) => a.number - b.number);
  for (const step of steps) {
    const actions = [...step.actions].sort(
      (a, b) => a.ordinal - b.ordinal || a.attemptOrdinal - b.attemptOrdinal,
    );
    for (const action of actions) {
      lines.push(
        GUIDED_LEARNING_LOG_COPY.action(step.number, guidedCopy('actionRan'), GUIDED_ACTION_OUTCOME_WORDS[action.outcome]),
      );
    }
  }
  const sentence = endedSentence(result, session.firstLearnStepId ?? null);
  if (sentence !== null) lines.push(GUIDED_LEARNING_LOG_COPY.ended(sentence));
  return lines;
}

export interface GuidedLearningLogProps {
  /** The latest poll of the session the page follows. */
  readonly session: PublicSession;
  /** The result, once the session has ended and it has been read. */
  readonly result: GuidedResult | null;
}

export function GuidedLearningLog({ session, result }: GuidedLearningLogProps) {
  const lines = guidedLearningLogLines(session, result);
  return (
    <Paper
      variant="outlined"
      data-testid="guided-learning-log"
      sx={{
        // A fixed floor only while empty; a log with lines is as tall as they are, so two stacked logs
        // are not two 360 px black blocks.
        minHeight: lines.length === 0 ? 360 : undefined,
        maxHeight: 520,
        overflow: 'auto',
        bgcolor: 'grey.900',
        color: 'white',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        p: 1.5,
      }}
    >
      {lines.map((line, index) => (
        <Box
          key={`${index}-${line}`}
          data-testid="guided-learning-log-line"
          sx={{ mb: 0.75, overflowWrap: 'anywhere' }}
        >
          <Typography component="span" sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
            {line}
          </Typography>
        </Box>
      ))}
    </Paper>
  );
}

export default GuidedLearningLog;
