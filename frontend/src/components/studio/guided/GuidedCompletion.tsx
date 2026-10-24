import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material';
import type { AlertColor } from '@mui/material';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import type {
  GuidedResult,
  GuidedStartRefusal,
  GuidedStartUnavailableCode,
} from '@/types/studio/studioGuidedTypes';
import { formatDuration } from '@/utils/time';
import {
  CANCELLED_NARRATIVE,
  FORBIDDEN_REFUSAL,
  UNDECLARED_REFUSAL,
  guidedCopy,
  stepRange,
} from './guidedNarratives';
import { LoginRequiredNotice, guidedLoginNotice, type LoginNotice } from './LoginRequiredNotice';

/**
 * How a guided Run ended, and why a guided start was refused (STUDIO-OBS-008 AC-3, AC-4, AC-6;
 * inherited OBS-014 a, POLICY_NOT_APPROVED; architect P4; T0 rulings A2, A3).
 *
 *  - **Success is the learned receipt, never the outcome alone.** "Completed — learned from this
 *    run." (or the partial "Completed — steps k–n learned again.") is shown only for `SUCCEEDED` with
 *    `publication.status: PUBLISHED`. A `SUCCEEDED` result still pending publication says "Saving
 *    what this run learned…", and one whose publication was refused or conflicted says "Run
 *    completed; steps not ready to repeat." Pending is never shown as success (OBS-006 runbook).
 *  - **k, n and j come from the result** (`relearnedFrom`, D-5, numbered by the result's own
 *    `explanation.steps`, and `progress.stepCount`); only the original boundary of a drifted session
 *    comes from the session's `firstLearnStepId` (architect P2). A step the result does not number is
 *    not guessed, and its sentence is left out.
 *  - **The failure is read from `failure.code`, then `errorCode`**, never from diagnostic text.
 *    `LOGIN_REQUIRED` hands over to `LoginRequiredNotice`. A governed `POLICY_DENIED` gets its own
 *    narrative, which names no cause and is not the secret-fill copy. That copy is struck (ruling
 *    A2), so `INVALID_CONTRACT` gets the generic narrative like every code without its own.
 *  - **`CANCELLED` shows the existing narrative unchanged** (ruling A3; the user-initiated variant
 *    is descoped by the user, 2026-10-17).
 *  - **No Run-again control is rendered by any outcome**, `UNKNOWN_OUTCOME` included: a new Run is
 *    the page's Run control, used deliberately.
 *  - **A refused start is inline feedback, not a state** (P4): no session, no poll, no retry. The
 *    only actions are the ones P4 names, and each is a callback the page owns. `RUNTIME_INCOMPATIBLE`
 *    names no cause and shows the code (W5 UX-01).
 */

// ---------------------------------------------------------------------------------------------
// Terminal result
// ---------------------------------------------------------------------------------------------

export type GuidedCompletionView =
  | { readonly kind: 'succeeded'; readonly lines: readonly string[] }
  | { readonly kind: 'saving'; readonly lines: readonly string[] }
  | { readonly kind: 'notReady'; readonly lines: readonly string[] }
  | { readonly kind: 'unknownOutcome'; readonly lines: readonly string[] }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'expired'; readonly lines: readonly string[] }
  | { readonly kind: 'login'; readonly notice: LoginNotice }
  | { readonly kind: 'policyDenied'; readonly title: string; readonly lines: readonly string[] }
  | { readonly kind: 'failed'; readonly code: string; readonly lines: readonly string[] }
  | { readonly kind: 'failedUnnamed'; readonly code: string | null; readonly lines: readonly string[] };

/**
 * The `SUCCEEDED` + `PUBLISHED` lines: learned, or partial with an optional prefix-drift line.
 *
 * `relearnedFrom.stepId` is the **effective** boundary the session entered (the `BOUNDARY`,
 * `DRIFT` or `EMPTY_PREFIX` switch; `openapi.yaml` `startGuidedSession`), so "steps k–n learned
 * again" numbers what was actually learned. After a prefix drift the result carries
 * `driftSwitchStepId` = j and never the original k (publication fixture
 * `drift-result-cannot-report-original-k`); the original k is the session's `firstLearnStepId`
 * (architect P2). With it, "j…" reads j–(k-1), the window OBS-015 AC-4 marks re-learned; without it,
 * "j…" is filled as the AC writes it.
 */
function succeededLines(result: GuidedResult, firstLearnStepId: string | null): string[] {
  const relearned = result.relearnedFrom;
  if (relearned === null) {
    return [guidedCopy('completedLearned')];
  }
  const numberOf = (stepId: string | null): number | null =>
    stepId === null ? null : (result.explanation.steps.find((step) => step.stepId === stepId)?.number ?? null);
  const k = numberOf(relearned.stepId);
  const n = result.progress.stepCount;
  if (k === null || n < k) {
    return [guidedCopy('completedLearned')];
  }
  // A range of one step is worded as one step, not "steps 5–5" (W5 UX-09).
  const lines = [k === n ? guidedCopy('completedPartialOne', { k }) : guidedCopy('completedPartial', { k, n })];
  const j = numberOf(relearned.driftSwitchStepId ?? null);
  if (j !== null) {
    const initialK = numberOf(firstLearnStepId);
    if (initialK !== null && initialK > j) {
      lines.push(
        initialK - 1 === j
          ? guidedCopy('relearnedAfterPrefixDriftOne', { j })
          : guidedCopy('relearnedAfterPrefixDrift', { 'j…': stepRange(j, initialK - 1) }),
      );
    } else {
      lines.push(guidedCopy('relearnedAfterPrefixDrift', { 'j…': `${j}…` }));
    }
  }
  return lines;
}

const NAMED_FAILURES = {
  ASSERTION_FAILED: 'assertionFailed',
  UNSUPPORTED_SURFACE: 'unsupportedSurface',
  BUDGET_EXCEEDED: 'budgetExceeded',
} as const;

function isNamedFailure(code: string): code is keyof typeof NAMED_FAILURES {
  return Object.prototype.hasOwnProperty.call(NAMED_FAILURES, code);
}

/**
 * The view for a result, or `null` for an outcome that is not terminal (the Run status and the
 * clarification carry those). Exported so every branch can be asserted without rendering.
 */
export function guidedCompletionView(
  result: GuidedResult,
  firstLearnStepId: string | null = null,
): GuidedCompletionView | null {
  switch (result.outcome) {
    case 'SUCCEEDED':
      if (result.publication.status === 'PUBLISHED') {
        return { kind: 'succeeded', lines: succeededLines(result, firstLearnStepId) };
      }
      if (result.publication.status === 'PENDING') {
        return { kind: 'saving', lines: [guidedCopy('finalizing')] };
      }
      return { kind: 'notReady', lines: [guidedCopy('publicationConflict')] };
    case 'PUBLICATION_CONFLICT':
      return { kind: 'notReady', lines: [guidedCopy('publicationConflict')] };
    case 'UNKNOWN_OUTCOME':
      return {
        kind: 'unknownOutcome',
        lines: [guidedCopy('unknownOutcome'), guidedCopy('unknownOutcomeConsequence')],
      };
    case 'CANCELLED':
      return { kind: 'cancelled' };
    case 'EXPIRED':
      return { kind: 'expired', lines: [guidedCopy('expired')] };
    case 'FAILED': {
      const notice = guidedLoginNotice(result);
      if (notice !== null) {
        return { kind: 'login', notice };
      }
      if (result.errorCode === 'POLICY_DENIED') {
        return {
          kind: 'policyDenied',
          title: guidedCopy('governedPolicyDeniedTitle'),
          lines: [guidedCopy('governedPolicyDeniedBody'), guidedCopy('governedPolicyDeniedRemedy')],
        };
      }
      const code = result.failure?.code ?? result.errorCode;
      if (code !== null && isNamedFailure(code)) {
        const lines = [guidedCopy(NAMED_FAILURES[code])];
        if (code === 'BUDGET_EXCEEDED') {
          lines.push(guidedCopy('nothingStartsOnItsOwn'));
        }
        return { kind: 'failed', code, lines };
      }
      // W5 UX-12: no failure and no errorCode. "Shown below" would point at nothing.
      if (code === null || code === undefined) {
        return { kind: 'failedUnnamed', code: null, lines: [guidedCopy('failedNoReason')] };
      }
      return { kind: 'failedUnnamed', code, lines: [guidedCopy('failedUnnamed')] };
    }
    default:
      return null;
  }
}

const SEVERITY: Record<GuidedCompletionView['kind'], AlertColor> = {
  succeeded: 'success',
  saving: 'info',
  notReady: 'warning',
  unknownOutcome: 'warning',
  cancelled: 'info',
  expired: 'warning',
  login: 'warning',
  policyDenied: 'error',
  failed: 'error',
  failedUnnamed: 'error',
};

export type GuidedCompletionInput =
  | {
      readonly kind: 'guided';
      readonly result: GuidedResult;
      /** The session's `firstLearnStepId` (the original k), when the session had one. */
      readonly firstLearnStepId?: string | null;
    }
  /** A replay execution: only its `PASSED` success is worded here; the rest is the run narratives'. */
  | { readonly kind: 'replay'; readonly snapshot: Pick<ExecutionSnapshot, 'status'> };

export interface GuidedCompletionProps {
  readonly input: GuidedCompletionInput;
  /** The current draft's stable step IDs, in order (for the login notice's step N). */
  readonly draftStepIds: readonly string[];
  readonly onGoToStep: (stepId: string) => void;
  readonly onOpenVariables: () => void;
}

function Lines({ lines }: { readonly lines: readonly string[] }) {
  return (
    <Stack spacing={0.5}>
      {lines.map((line) => (
        <Typography key={line} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {line}
        </Typography>
      ))}
    </Stack>
  );
}

const ALERT_SX = { '& .MuiAlert-message': { width: '100%', minWidth: 0 } } as const;

export function GuidedCompletion({
  input,
  draftStepIds,
  onGoToStep,
  onOpenVariables,
}: GuidedCompletionProps) {
  if (input.kind === 'replay') {
    if (input.snapshot.status !== 'PASSED') return null;
    return (
      <Alert severity="success" data-testid="guided-completion" data-kind="replayed" sx={ALERT_SX}>
        <Lines lines={[guidedCopy('completedReplay')]} />
      </Alert>
    );
  }

  const view = guidedCompletionView(input.result, input.firstLearnStepId ?? null);
  if (view === null) return null;

  if (view.kind === 'login') {
    return (
      <Box data-testid="guided-completion" data-kind="login">
        <LoginRequiredNotice
          notice={view.notice}
          draftStepIds={draftStepIds}
          onGoToStep={onGoToStep}
          onOpenVariables={onOpenVariables}
        />
      </Box>
    );
  }

  return (
    <Alert
      severity={SEVERITY[view.kind]}
      data-testid="guided-completion"
      data-kind={view.kind}
      sx={ALERT_SX}
    >
      {view.kind === 'cancelled' ? (
        <>
          <AlertTitle>{CANCELLED_NARRATIVE.title}</AlertTitle>
          <Lines lines={[CANCELLED_NARRATIVE.browserClaim, CANCELLED_NARRATIVE.remedyOwner]} />
        </>
      ) : (
        <>
          {view.kind === 'policyDenied' && <AlertTitle>{view.title}</AlertTitle>}
          <Lines lines={view.lines} />
          {view.kind === 'failedUnnamed' && view.code !== null && (
            <Typography
              variant="caption"
              component="p"
              data-testid="guided-completion-code"
              sx={{ fontFamily: 'monospace', mt: 0.5, overflowWrap: 'anywhere' }}
            >
              {view.code}
            </Typography>
          )}
        </>
      )}
    </Alert>
  );
}

// ---------------------------------------------------------------------------------------------
// Refused start (architect P4; D-3, D-4, D-11; inherited POLICY_NOT_APPROVED)
// ---------------------------------------------------------------------------------------------

export type GuidedStartFeedbackInput =
  /** The start request was refused with an HTTP response. */
  | { readonly kind: 'refusal'; readonly refusal: GuidedStartRefusal }
  /** `getStudioTestCapabilities` said `guidedStart.available: false`; no request was made. */
  | { readonly kind: 'unavailable'; readonly code: GuidedStartUnavailableCode };

export type GuidedStartAction = 'learnFromFirstStep' | 'openVariables';

export interface GuidedStartFeedbackView {
  readonly title: string | null;
  readonly lines: readonly string[];
  /** The code exactly as it arrived, shown as a secondary "Reference" line. */
  readonly code: string | null;
  readonly action: GuidedStartAction | null;
  /**
   * Learning could not start and nothing was started (`RUNTIME_INCOMPATIBLE`). The Run control shows
   * its caption beside Run while this holds (STUDIO-UNIFY-001.5 AC-01).
   */
  readonly unavailable: boolean;
}

const POLICY_MESSAGE_KEYS = {
  GUIDED_POLICY_ABSENT: 'policyAbsent',
  GUIDED_POLICY_UNAPPROVED: 'policyUnapproved',
  GUIDED_POLICY_PENDING_VERSION: 'policyPendingVersion',
} as const;

function isPolicyMessageCode(code: string): code is keyof typeof POLICY_MESSAGE_KEYS {
  return Object.prototype.hasOwnProperty.call(POLICY_MESSAGE_KEYS, code);
}

function narrativeView(narrative: {
  readonly title: string;
  readonly explanation: string;
  readonly whoClearsIt: string;
}): GuidedStartFeedbackView {
  return {
    title: narrative.title,
    lines: [narrative.explanation, narrative.whoClearsIt],
    code: null,
    action: null,
    unavailable: false,
  };
}

function undeclaredView(code: string): GuidedStartFeedbackView {
  return { ...narrativeView(UNDECLARED_REFUSAL), code };
}

/**
 * `RUNTIME_INCOMPATIBLE` (D-11): learning could not start, no cause and no remedy, then the code as
 * it arrived as a "Reference" line (the caption beside Run says what to do next). The replay narrative is not reused: its "Save the test again" is no remedy here (W5 UX-01).
 */
function runtimeIncompatibleView(code: string): GuidedStartFeedbackView {
  return {
    title: null,
    lines: [guidedCopy('guidedStartUnavailable')],
    code,
    action: null,
    unavailable: true,
  };
}

/** The feedback for a refused or unavailable start. Exported so every branch can be asserted. */
export function guidedStartFeedbackView(input: GuidedStartFeedbackInput): GuidedStartFeedbackView {
  if (input.kind === 'unavailable') {
    return input.code === 'FORBIDDEN_SCOPE' ? narrativeView(FORBIDDEN_REFUSAL) : runtimeIncompatibleView(input.code);
  }
  const { httpStatus, error, platformCode, retryAfterSeconds } = input.refusal;
  const plain = (lines: string[], action: GuidedStartAction | null = null): GuidedStartFeedbackView => ({
    title: null,
    lines,
    code: null,
    action,
    unavailable: false,
  });

  if (error !== null) {
    switch (error.code) {
      case 'POLICY_NOT_APPROVED': {
        const lines = [guidedCopy('policyNotApproved')];
        if (isPolicyMessageCode(error.messageCode)) {
          lines.push(guidedCopy(POLICY_MESSAGE_KEYS[error.messageCode]));
        }
        return plain(lines);
      }
      case 'REVISION_CONFLICT':
        return error.messageCode === 'BASE_IDENTITY_INCOMPLETE'
          ? plain([guidedCopy('baseIdentityIncompleteStart')], 'learnFromFirstStep')
          : plain([guidedCopy('revisionNotReady')]);
      case 'MISSING_SOURCE':
        return plain([guidedCopy('referenceMissing')], 'openVariables');
      case 'ORIGIN_NOT_ALLOWED':
        return plain([guidedCopy('originNotAllowed')]);
      case 'RUNTIME_INCOMPATIBLE':
        return runtimeIncompatibleView(
          error.messageCode && error.messageCode !== error.code ? `${error.code} ${error.messageCode}` : error.code,
        );
      case 'FORBIDDEN_SCOPE':
        return narrativeView(FORBIDDEN_REFUSAL);
      case 'BUDGET_EXCEEDED':
        if (!error.retryable) {
          return plain([guidedCopy('budgetSession')]);
        }
        return plain([
          guidedCopy('budgetCsi'),
          ...(retryAfterSeconds !== null
            ? [guidedCopy('budgetRetryAfter', { duration: formatDuration(retryAfterSeconds * 1000) })]
            : []),
          guidedCopy('nothingStartsOnItsOwn'),
        ]);
      default:
        return undeclaredView(error.messageCode ? `${error.code} ${error.messageCode}` : error.code);
    }
  }
  if (httpStatus === 403) {
    return narrativeView(FORBIDDEN_REFUSAL);
  }
  return undeclaredView(platformCode ?? `HTTP ${httpStatus}`);
}

export interface GuidedStartFeedbackProps {
  readonly input: GuidedStartFeedbackInput;
  /** BASE_IDENTITY_INCOMPLETE: the explicit first-step learn P4 offers. Never called on its own. */
  readonly onLearnFromFirstStep: () => void;
  /** MISSING_SOURCE: the page's existing saved-inputs dialog. */
  readonly onOpenVariables: () => void;
  readonly disabled?: boolean;
}

export function GuidedStartFeedback({
  input,
  onLearnFromFirstStep,
  onOpenVariables,
  disabled = false,
}: GuidedStartFeedbackProps) {
  const view = guidedStartFeedbackView(input);
  return (
    <Alert severity="warning" data-testid="guided-start-feedback" sx={ALERT_SX}>
      {view.title !== null && <AlertTitle>{view.title}</AlertTitle>}
      <Lines lines={view.lines} />
      {view.code !== null && (
        <Typography
          variant="caption"
          component="p"
          data-testid="guided-start-feedback-code"
          color="text.secondary"
          sx={{ mt: 0.5, overflowWrap: 'anywhere' }}
        >
          {guidedCopy('referenceLabel')}{' '}
          <Box component="span" sx={{ fontFamily: 'monospace', userSelect: 'all' }}>
            {view.code}
          </Box>
        </Typography>
      )}
      {view.action !== null && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="outlined"
            disabled={disabled}
            onClick={() => (view.action === 'learnFromFirstStep' ? onLearnFromFirstStep() : onOpenVariables())}
            sx={(theme) => ({ width: '100%', [theme.breakpoints.up('sm')]: { width: 'auto' } })}
          >
            {view.action === 'learnFromFirstStep'
              ? guidedCopy('learnAgainFromStep', { N: 1 })
              : guidedCopy('openVariables')}
          </Button>
        </Stack>
      )}
    </Alert>
  );
}

export default GuidedCompletion;
