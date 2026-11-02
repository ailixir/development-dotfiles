/**
 * Guided Run presentational components (STUDIO-OBS-008, lane L5a). Props in, callbacks out; the
 * page owns the session, the requests and focus (lane L5b). `useGuidedSession` (lane L2b) is
 * imported from its own module.
 */
export { GuidedRunStatus, guidedRunStatusLines } from './GuidedRunStatus';
export type { GuidedRunStatusProps, GuidedRunStatusLines } from './GuidedRunStatus';
export { GuidedClarification, ChoiceLabel, expiryWarning } from './GuidedClarification';
export type { GuidedClarificationProps } from './GuidedClarification';
export {
  LoginRequiredNotice,
  InlineCopy,
  loginNoticeFrom,
  guidedLoginNotice,
  replayLoginNotice,
  loginNoticeSentences,
} from './LoginRequiredNotice';
export type { LoginNotice, LoginRequiredNoticeProps } from './LoginRequiredNotice';
export {
  GuidedCompletion,
  GuidedStartFeedback,
  guidedCompletionView,
  guidedStartFeedbackView,
  learnedReceiptLines,
} from './GuidedCompletion';
export type {
  GuidedCompletionInput,
  GuidedCompletionProps,
  GuidedCompletionView,
  GuidedStartAction,
  GuidedStartFeedbackInput,
  GuidedStartFeedbackProps,
  GuidedStartFeedbackView,
} from './GuidedCompletion';
export { ReadinessChip, readinessChipLabel } from './ReadinessChip';
export type { ReadinessChipProps } from './ReadinessChip';
export {
  GUIDED_COPY,
  COPY_SOURCE_FILES,
  READY_CHIP_LABEL,
  CANCELLED_NARRATIVE,
  FORBIDDEN_REFUSAL,
  UNDECLARED_REFUSAL,
  copyTokens,
  fillCopy,
  guidedCopy,
  stepNumberIn,
  stepRange,
} from './guidedNarratives';
export type {
  CopyBasis,
  CopySource,
  CopySourceFile,
  CopyValue,
  GuidedCopy,
  GuidedCopyKey,
} from './guidedNarratives';
