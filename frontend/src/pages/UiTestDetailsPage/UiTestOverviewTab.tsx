import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { ReadinessChip, readinessChipLabel } from '@/components/studio/guided/ReadinessChip';
import { StudioScheduleSummary } from '@/components/studio/scheduling/StudioScheduleSummary';
import { readinessFor } from '@/components/studio/tests/testListPresentation';
import type { StudioVariable } from '@/types/studio/studioTypes';
import { useUiTestDetailContext } from './useUiTestDetail';

/**
 * The Overview tab of the UI test detail page (spec §8.3; FR-10, NFR-04; AC-11, AC-25): numbered
 * read-only steps, readiness, read-only variables and the schedule summary. It is the index child
 * route of `ui-tests/:id` and reads only the shell's context; it never reads the test itself.
 *
 * Nothing here edits: there are no inputs, buttons or links. A variable shows its name and kind. A
 * secret variable shows only its vault reference name (`secretId`); a plain variable's value is never
 * rendered.
 */

const sectionTitleSx = { mb: 1, fontWeight: 600 } as const;

/** What a variable's right-hand cell says: the vault reference name for a secret, nothing else. */
function variableDetail(variable: StudioVariable): string | null {
  if (variable.kind !== 'secretRef') return null;
  return variable.secretId ? variable.secretId : 'No vault reference';
}

export const UiTestOverviewTab: React.FC = () => {
  const { testId, test } = useUiTestDetailContext();
  const stepIds = test.steps.map((step) => step.id);
  const hasReadinessChip = readinessChipLabel(test, stepIds) !== null;
  const readiness = readinessFor(test.readiness);

  return (
    <Stack spacing={3} data-testid="ui-test-overview">
      <Box component="section" data-testid="ui-test-overview-readiness">
        <Typography variant="subtitle1" component="h2" sx={sectionTitleSx}>Readiness</Typography>
        {hasReadinessChip ? (
          <ReadinessChip test={test} draftStepIds={stepIds} />
        ) : (
          <Chip
            size="small"
            variant="outlined"
            color={test.readiness === 'LEARNING' ? 'info' : 'default'}
            label={readiness.label}
            data-testid="ui-test-overview-readiness-chip"
            data-readiness={test.readiness}
          />
        )}
      </Box>

      <Box component="section" data-testid="ui-test-overview-steps">
        <Typography variant="subtitle1" component="h2" sx={sectionTitleSx}>Steps</Typography>
        {test.steps.length === 0 ? (
          <Typography variant="body2" color="text.secondary">This test has no steps.</Typography>
        ) : (
          <Box component="ol" sx={{ m: 0, pl: 3 }}>
            {test.steps.map((step) => (
              <Typography
                key={step.id}
                component="li"
                variant="body2"
                data-testid="ui-test-overview-step"
                sx={{ py: 0.25, overflowWrap: 'anywhere' }}
              >
                {step.text}
              </Typography>
            ))}
          </Box>
        )}
      </Box>

      <Box component="section" data-testid="ui-test-overview-variables">
        <Typography variant="subtitle1" component="h2" sx={sectionTitleSx}>Variables</Typography>
        {test.variables.length === 0 ? (
          <Typography variant="body2" color="text.secondary">This test declares no variables.</Typography>
        ) : (
          <Stack spacing={1}>
            {test.variables.map((variable) => {
              const detail = variableDetail(variable);
              return (
                <Stack
                  key={variable.name}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  useFlexGap
                  flexWrap="wrap"
                  data-testid="ui-test-overview-variable"
                >
                  <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
                    {variable.name}
                  </Typography>
                  <Chip size="small" variant="outlined" label={variable.kind === 'secretRef' ? 'Secret' : 'Plain'} />
                  {detail !== null && (
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                      Vault reference: {detail}
                    </Typography>
                  )}
                </Stack>
              );
            })}
          </Stack>
        )}
      </Box>

      <Box component="section" data-testid="ui-test-overview-schedule">
        <Typography variant="subtitle1" component="h2" sx={sectionTitleSx}>Schedule</Typography>
        <StudioScheduleSummary
          testId={testId}
          refreshToken={`${test.sourceRevision}:${test.configurationRevision}:${test.confirmedRevisionId ?? ''}`}
        />
      </Box>
    </Stack>
  );
};

export default UiTestOverviewTab;
