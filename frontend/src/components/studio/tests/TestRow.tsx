import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Chip, Stack, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import { executionStatusLabel, executionStatusTone } from '@/components/studio/run/executionStatus';
import { hideBelowMd } from '@/components/studio/list/studioListSx';
import type { TestDto } from '@/types/studio/studioTypes';
import { formatAbsoluteTime, formatRelativeTime } from '@/utils/time';
import TestRowMenu from './TestRowMenu';
import { readinessFor, testHref } from './testListPresentation';
import { StudioScheduleSummary } from '@/components/studio/scheduling/StudioScheduleSummary';

export interface TestRowProps {
  test: TestDto;
  /** CSI display name from the registry, when known. */
  csiName?: string | null;
  /** Shared "now" so every row in a render ages from the same instant. */
  now: number;
  actionsDisabled?: boolean;
  onDelete: (test: TestDto) => void;
  onSchedule?: (test: TestDto) => void;
}

/** No last-run revision is exposed yet, so the note lives in the tooltip, not under every run (MNT-002). */
const LAST_RUN_VERSION_NOTE = 'May describe an earlier saved version';

function stepsLabel(count: number): string {
  if (count === 0) return 'No steps yet';
  return count === 1 ? '1 step' : `${count} steps`;
}

const TestRow: React.FC<TestRowProps> = ({ test, csiName, now, actionsDisabled = false, onDelete, onSchedule }) => {
  const href = testHref(test.id);
  const readiness = readinessFor(test.compileStatus);
  const outcome = test.lastRunStatus;

  return (
    <TableRow hover data-testid={`test-row-${test.id}`}>
      <TableCell>
        <Typography
          component={RouterLink}
          to={href}
          variant="subtitle2"
          fontWeight={600}
          sx={{ color: 'primary.main', textDecoration: 'none', overflowWrap: 'anywhere', '&:hover': { textDecoration: 'underline' } }}
        >
          {test.name}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          component="div"
          sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {test.description ? `${test.description} · ` : ''}
          {stepsLabel(test.steps?.length ?? 0)}
        </Typography>
        {onSchedule && <StudioScheduleSummary testId={test.id} refreshToken={`${test.sourceRevision}:${test.configurationRevision}:${test.confirmedRevisionId ?? ''}`} />}
      </TableCell>

      <TableCell sx={hideBelowMd}>
        {test.csiId ? (
          <Tooltip title={`CSI ${test.csiId}`} describeChild>
            <Typography variant="body2" component="span">{csiName ?? test.csiId}</Typography>
          </Tooltip>
        ) : (
          <Typography variant="body2" color="text.secondary">Not available</Typography>
        )}
      </TableCell>

      <TableCell sx={hideBelowMd}>
        <Typography variant="body2" color={test.environment ? 'text.primary' : 'text.secondary'}>
          {test.environment || 'Not specified'}
        </Typography>
      </TableCell>

      <TableCell>
        <Tooltip title={readiness.hint} describeChild>
          <Chip
            size="small"
            label={readiness.label}
            color={readiness.tone}
            data-testid={`readiness-${test.id}`}
          />
        </Tooltip>
      </TableCell>

      <TableCell>
        {outcome ? (
          <Stack spacing={0.25} alignItems="flex-start">
            <Chip
              size="small"
              label={executionStatusLabel(outcome)}
              color={executionStatusTone(outcome)}
              data-testid={`last-run-${test.id}`}
            />
            {test.lastRunAt && (
              <Tooltip
                title={
                  <>
                    {formatAbsoluteTime(test.lastRunAt)}
                    <br />
                    {LAST_RUN_VERSION_NOTE}
                  </>
                }
                describeChild
              >
                <Typography variant="caption" color="text.secondary" component="span" data-testid={`last-run-at-${test.id}`}>
                  {formatRelativeTime(test.lastRunAt, { now })}
                </Typography>
              </Tooltip>
            )}
          </Stack>
        ) : (
          <Chip
            size="small"
            label="Never run"
            data-testid={`last-run-${test.id}`}
          />
        )}
      </TableCell>

      <TableCell sx={hideBelowMd}>
        <Tooltip title={formatAbsoluteTime(test.updatedAt)} describeChild>
          <Typography variant="body2" color="text.secondary" component="span">
            {formatRelativeTime(test.updatedAt, { now })}
          </Typography>
        </Tooltip>
      </TableCell>

      <TableCell align="right" sx={{ width: 56 }}>
        <Box sx={{ display: 'inline-flex' }}>
          <TestRowMenu test={test} href={href} disabled={actionsDisabled} onDelete={() => onDelete(test)} onSchedule={onSchedule ? () => onSchedule(test) : undefined} />
        </Box>
      </TableCell>
    </TableRow>
  );
};

export default TestRow;
