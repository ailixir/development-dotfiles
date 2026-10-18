import { Fragment } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import { guidedCopy, stepNumberIn } from './guidedNarratives';

/**
 * "Blocked by login" (STUDIO-OBS-008 AC-4), for the guided result and the replay snapshot alike.
 *
 *  - **One adapter, two sources** (T0 ruling A1.6). {@link loginNoticeFrom} takes
 *    `{stepId, loginStepsPresent}`, the shape both the guided `failure.detail` / `detail` and the
 *    replay `ExecutionSnapshot.replayFailure` carry, and copies those two fields and nothing else.
 *    {@link guidedLoginNotice} and {@link replayLoginNotice} only pick the detail out of each surface.
 *  - **The replay half keys on `replayFailure` alone**, never on `status`, `errorCode`,
 *    `stepResults[].message` or logs (ruling A1.1: "A client never derives it from …").
 *  - **N is the step's 1-based position in the current draft**, by stable ID. If the step is no
 *    longer there, "Go to step N" is omitted, "Open Variables" stays, and the step-less wording
 *    is used (A1.6; AC-4 [2026-10-16]). It is not a new state.
 *  - **Presentational.** The page passes the callbacks; "Go to step N" hands back the stable step ID
 *    and the page moves focus to that editor row (a flow focus move, kept by ADR-SC-006).
 */

/** The value-free login fact, whichever surface it came from. */
export interface LoginNotice {
  readonly stepId: string;
  readonly loginStepsPresent: boolean;
}

/** The one adapter (ruling A1.6): `{stepId, loginStepsPresent}` in, the same two fields out. */
export function loginNoticeFrom(detail: {
  readonly stepId: string;
  readonly loginStepsPresent: boolean;
}): LoginNotice {
  return { stepId: detail.stepId, loginStepsPresent: detail.loginStepsPresent };
}

/**
 * The guided result's login fact: the typed `failure` carrier first, then the top-level `detail`
 * that the contract requires beside `errorCode: LOGIN_REQUIRED`. `null` for every other result.
 */
export function guidedLoginNotice(
  result: Pick<GuidedResult, 'failure' | 'errorCode' | 'detail'>,
): LoginNotice | null {
  if (result.failure?.code === 'LOGIN_REQUIRED') {
    return loginNoticeFrom(result.failure.detail);
  }
  if (result.errorCode === 'LOGIN_REQUIRED' && result.detail !== undefined) {
    return loginNoticeFrom(result.detail);
  }
  return null;
}

/** The replay snapshot's login fact, from `replayFailure` only. `null` for every other snapshot. */
export function replayLoginNotice(snapshot: Pick<ExecutionSnapshot, 'replayFailure'>): LoginNotice | null {
  const failure = snapshot.replayFailure;
  if (failure === null || failure === undefined || failure.code !== 'LOGIN_REQUIRED') {
    return null;
  }
  return loginNoticeFrom(failure);
}

/**
 * The sentence for a notice. `stepNumber: null` is the step-less variant. Exported so the copy can
 * be asserted without rendering.
 */
export function loginNoticeSentences(notice: LoginNotice, stepNumber: number | null): string[] {
  if (stepNumber === null) {
    return [
      guidedCopy(notice.loginStepsPresent ? 'loginStepsFailedStepless' : 'loginNoLoginStepsStepless'),
      guidedCopy('loginStepGone'),
    ];
  }
  return [
    guidedCopy(notice.loginStepsPresent ? 'loginStepsFailed' : 'loginNoLoginSteps', { N: stepNumber }),
  ];
}

/** Renders backtick-delimited spans of a copy string as inline code, everything as text. */
export function InlineCopy({ text }: { readonly text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Box
            key={index}
            component="code"
            sx={{ fontFamily: 'monospace', px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' }}
          >
            {part}
          </Box>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export interface LoginRequiredNoticeProps {
  readonly notice: LoginNotice;
  /** The current draft's stable step IDs, in order. */
  readonly draftStepIds: readonly string[];
  /** "Go to step N": the page focuses that step's editor row. */
  readonly onGoToStep: (stepId: string) => void;
  /** "Open Variables": the page opens its existing saved-inputs dialog. */
  readonly onOpenVariables: () => void;
  readonly disabled?: boolean;
}

export function LoginRequiredNotice({
  notice,
  draftStepIds,
  onGoToStep,
  onOpenVariables,
  disabled = false,
}: LoginRequiredNoticeProps) {
  const stepNumber = stepNumberIn(draftStepIds, notice.stepId);
  const sentences = loginNoticeSentences(notice, stepNumber);

  return (
    <Alert
      severity="warning"
      data-testid="login-required-notice"
      data-variant={notice.loginStepsPresent ? 'login-steps-failed' : 'no-login-steps'}
      data-step-number={stepNumber ?? 'none'}
      sx={{ '& .MuiAlert-message': { width: '100%', minWidth: 0 } }}
    >
      <Stack spacing={1}>
        {sentences.map((sentence) => (
          <Typography key={sentence} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            <InlineCopy text={sentence} />
          </Typography>
        ))}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          data-testid="login-required-actions"
        >
          {stepNumber !== null && (
            <Button
              size="small"
              variant="outlined"
              disabled={disabled}
              onClick={() => onGoToStep(notice.stepId)}
              sx={(theme) => ({ width: '100%', [theme.breakpoints.up('sm')]: { width: 'auto' } })}
            >
              {guidedCopy('goToStep', { N: stepNumber })}
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            disabled={disabled}
            onClick={() => onOpenVariables()}
            sx={(theme) => ({ width: '100%', [theme.breakpoints.up('sm')]: { width: 'auto' } })}
          >
            {guidedCopy('openVariables')}
          </Button>
        </Stack>
      </Stack>
    </Alert>
  );
}

export default LoginRequiredNotice;
