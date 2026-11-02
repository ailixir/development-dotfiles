import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { ContentCopy } from '@mui/icons-material';
import type { TestDetailDto } from '@/types/studio/studioTypes';
import { STEP_CODE_COPY } from './stepCodeCopy';
import { stepCodesOf } from './stepCodes';

export type StepCodeViewTest = Pick<
  TestDetailDto,
  'steps' | 'readiness' | 'firstChangedStepId' | 'readinessReason' | 'confirmedRevisionArtifact'
>;

function emptyStateFor(readiness: TestDetailDto['readiness']): string {
  if (readiness === 'RECORDED') return STEP_CODE_COPY.emptyRecorded;
  if (readiness === 'LEARNING') return STEP_CODE_COPY.emptyLearning;
  return STEP_CODE_COPY.emptyOther;
}

function copyToClipboard(text: string): void {
  try {
    void navigator.clipboard?.writeText(text)?.catch(() => undefined);
  } catch {
    // A refused or unavailable clipboard is ignored.
  }
}

/**
 * Read-only Code tab (Proof | Logs | Code): the generated Playwright code of the test's confirmed
 * revision, one block per authored step. Reads only the server's draft, never unsaved editor text.
 * Code is rendered as text, because it can hold page-derived strings.
 */
export function StepCodeView({ test }: { test: StepCodeViewTest }) {
  const stepCodes = stepCodesOf(test.confirmedRevisionArtifact);
  if (stepCodes.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="step-code-empty">
        {emptyStateFor(test.readiness)}
      </Typography>
    );
  }

  const draftIds = test.steps.map((step) => step.id);
  const changedFrom =
    test.readiness === 'NEEDS_RELEARN' && test.firstChangedStepId !== null
      ? draftIds.indexOf(test.firstChangedStepId)
      : -1;

  return (
    <Stack spacing={2} data-testid="step-code-view">
      {test.readiness === 'NEEDS_RELEARN' && test.readinessReason === 'BASE_IDENTITY_INCOMPLETE' && (
        <Typography variant="body2" color="text.secondary" data-testid="step-code-base-note">
          {STEP_CODE_COPY.baseIdentityIncomplete}
        </Typography>
      )}
      {stepCodes.map((entry) => {
        const draftPosition = draftIds.indexOf(entry.stepId);
        const inDraft = draftPosition >= 0;
        const number = inDraft ? draftPosition + 1 : entry.stepIndex + 1;
        const changed = inDraft && changedFrom >= 0 && draftPosition >= changedFrom;
        return (
          <Box key={entry.stepId} data-testid="step-code-block">
            <Typography variant="subtitle2" component="h3">
              Step {number}
            </Typography>
            {inDraft ? (
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {test.steps[draftPosition].text}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {STEP_CODE_COPY.notInDraft}
              </Typography>
            )}
            {changed && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block' }} data-testid="step-code-changed">
                {STEP_CODE_COPY.changed}
              </Typography>
            )}
            <Stack spacing={1} sx={{ mt: 1 }}>
              {entry.codes.map((code, index) => (
                <Box key={index} sx={{ position: 'relative' }}>
                  <Box
                    component="pre"
                    data-testid="step-code"
                    sx={{
                      m: 0,
                      p: 1.5,
                      pr: 5,
                      bgcolor: 'grey.900',
                      color: 'white',
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      overflow: 'auto',
                    }}
                  >
                    {code}
                  </Box>
                  <Tooltip title={STEP_CODE_COPY.copy}>
                    <IconButton
                      size="small"
                      aria-label={`${STEP_CODE_COPY.copy} code for step ${number}`}
                      onClick={() => copyToClipboard(code)}
                      sx={{ position: 'absolute', top: 4, right: 4, color: 'grey.400' }}
                    >
                      <ContentCopy fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

export default StepCodeView;
