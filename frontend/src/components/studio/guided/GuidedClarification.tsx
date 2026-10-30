import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';
import type { Theme } from '@mui/material';
import type {
  GuidedActiveStep,
  GuidedChoice,
  GuidedClarification as GuidedClarificationQuestion,
} from '@/types/studio/studioGuidedTypes';
import { parseInstant } from '@/utils/time';
import { guidedCopy } from './guidedNarratives';

/**
 * The one pending question of a guided Run (STUDIO-OBS-008 AC-3; inherited OBS-014 item b; T0
 * ruling A3).
 *
 *  - **Disambiguation** ("Step N says: '<step text>'. Which one did you mean?"): a radio group of the
 *    server's safe labels, then "None of these — I'll edit step N" last. N and the step text are the
 *    session's `progress.activeStep`, which the server guarantees matches the question's coordinate
 *    (P2). If the two disagree, or the step is not named, no question is shown: a prompt without its
 *    step would be worded from nothing.
 *  - **"None of these" never answers.** The contract has no "none" choice (plan B6), so it calls
 *    `onNoneOfThese(stepId)` and the page cancels the session, then moves focus to step N (A3).
 *    Nothing here fabricates a `choiceId`.
 *  - **Page-derived labels are untrusted text** (AC-3; ADR-SC-006 keeps this as a security rule).
 *    A `labelSource: PAGE` label is rendered as a text node inside `<bdi>` (so its characters cannot
 *    reorder the surrounding sentence), in a dashed, tinted box, marked "Page-derived", with its role
 *    and region shown. `AUTHORED` and `SAVED_INPUT` labels are never decorated as page-derived.
 *  - **Expiry warnings are visible text** at 60 s and 20 s, measured from the question's own
 *    `expiresAt`, never from when this component mounted.
 *  - No focus-on-entry, keyboard handling beyond MUI's defaults, or live region: descoped by the
 *    user, 2026-10-17 (ADR-SC-006).
 */

/**
 * The warning for the time left (AC-3: at 60 s and at 20 s before `expiresAt`), or `null` before the
 * 60 s mark and after expiry. Exported so the thresholds can be asserted without a clock.
 */
export function expiryWarning(expiresAt: string, nowMs: number): string | null {
  const expires = parseInstant(expiresAt);
  if (expires === null) return null;
  const remainingMs = expires.getTime() - nowMs;
  if (remainingMs <= 0) return null;
  if (remainingMs <= 20_000) return guidedCopy('expiresIn20');
  if (remainingMs <= 60_000) return guidedCopy('expiresIn60');
  return null;
}

/** Re-renders once a second while mounted, so the warnings follow the clock. */
function useNowMs(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(handle);
  }, []);
  return now;
}

/** One choice's label. Only `PAGE` is decorated, and it is always text. */
export function ChoiceLabel({ choice }: { readonly choice: GuidedChoice }) {
  if (choice.labelSource !== 'PAGE') {
    return (
      <Typography
        component="span"
        variant="body2"
        data-label-source={choice.labelSource}
        sx={{ overflowWrap: 'anywhere' }}
      >
        {choice.safeLabel}
      </Typography>
    );
  }
  return (
    <Stack component="span" spacing={0.5} data-label-source="PAGE" sx={{ display: 'flex', py: 0.5, minWidth: 0 }}>
      <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Box
          component="bdi"
          data-testid="page-derived-label"
          sx={{
            px: 0.75,
            py: 0.25,
            border: '1px dashed',
            borderColor: 'warning.main',
            borderRadius: 0.5,
            bgcolor: 'action.hover',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {choice.safeLabel}
        </Box>
        <Chip size="small" variant="outlined" color="warning" label={guidedCopy('pageDerived')} />
      </Box>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        <bdi>{guidedCopy('pageRole', { role: choice.role })}</bdi>
        {choice.region !== null && (
          <>
            {' · '}
            <bdi>{guidedCopy('pageRegion', { region: choice.region })}</bdi>
          </>
        )}
      </Typography>
    </Stack>
  );
}

export interface GuidedClarificationProps {
  readonly clarification: GuidedClarificationQuestion;
  /** The session's `progress.activeStep`: the step the question is about. */
  readonly step: GuidedActiveStep | null;
  /** Answer with a server `choiceId`. */
  readonly onAnswer: (choiceId: string) => void;
  /** "None of these — I'll edit step N". The page cancels, then focuses. */
  readonly onNoneOfThese: (stepId: string) => void;
  /** True while an answer or cancel is in flight. */
  readonly disabled?: boolean;
}

const NONE_VALUE = 'none';

export function GuidedClarification({
  clarification,
  step,
  onAnswer,
  onNoneOfThese,
  disabled = false,
}: GuidedClarificationProps) {
  const now = useNowMs();
  const [selected, setSelected] = useState<string | null>(null);
  // A new question starts with nothing selected.
  useEffect(() => {
    setSelected(null);
  }, [clarification.clarificationId, clarification.generation]);

  if (step === null || step.stepId !== clarification.coordinate.stepId) {
    return null;
  }

  const warning = expiryWarning(clarification.expiresAt, now);
  const noneLabel = guidedCopy('noneOfThese', { N: step.number });
  const actionsSx = (theme: Theme) => ({ width: '100%', [theme.breakpoints.up('sm')]: { width: 'auto' } });

  const submit = () => {
    if (selected === null) return;
    if (selected === NONE_VALUE) {
      onNoneOfThese(step.stepId);
      return;
    }
    const choice = clarification.choices[Number(selected)];
    if (choice !== undefined) {
      onAnswer(choice.choiceId);
    }
  };

  return (
    <Paper variant="outlined" data-testid="guided-clarification" sx={{ p: 2, minWidth: 0 }}>
      <Stack spacing={1.5}>
        <Typography variant="body2" data-testid="guided-question" sx={{ overflowWrap: 'anywhere' }}>
          {guidedCopy('clarificationQuestion', { N: step.number, '<step text>': step.text })}
        </Typography>
        {warning !== null && (
          <Typography variant="body2" color="warning.main" data-testid="guided-expiry-warning">
            {warning}
          </Typography>
        )}
        <FormControl disabled={disabled} sx={{ minWidth: 0 }}>
          <RadioGroup
            value={selected ?? ''}
            onChange={(event) => setSelected(event.target.value)}
            data-testid="guided-choices"
          >
            {clarification.choices.map((choice, index) => (
              <FormControlLabel
                key={choice.choiceId}
                value={String(index)}
                control={<Radio size="small" />}
                label={<ChoiceLabel choice={choice} />}
                sx={{ alignItems: 'flex-start', mr: 0, '& .MuiFormControlLabel-label': { minWidth: 0 } }}
              />
            ))}
            <FormControlLabel
              value={NONE_VALUE}
              control={<Radio size="small" />}
              label={noneLabel}
              sx={{ mr: 0 }}
            />
          </RadioGroup>
        </FormControl>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} data-testid="guided-question-actions">
          <Button
            variant="contained"
            size="small"
            disabled={disabled || selected === null}
            onClick={submit}
            sx={actionsSx}
          >
            {guidedCopy('continue')}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export default GuidedClarification;
