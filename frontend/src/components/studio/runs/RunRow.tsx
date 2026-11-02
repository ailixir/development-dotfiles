import type { MouseEvent } from 'react';
import { Button, TableCell, TableRow, Typography, type SxProps, type Theme } from '@mui/material';
import { hideBelowMd } from '@/components/studio/list/studioListSx';
import { toIsoDateTime } from '@/utils/time';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { RunStatusChip } from './RunStatusChip';
import { formatRunTime, runDurationText, shortRunId } from './runPresentation';

export const RUN_VIEW_DETAILS_LABEL = 'View details';

export interface RunRowProps {
  run: ExecutionSnapshot;
  selected?: boolean;
  onOpenRun: () => void;
}

/** Clicks on the row's own controls keep their meaning; anywhere else opens the run. */
function isFromControl(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target as HTMLElement | null;
  return target?.closest('a, button') != null;
}

/**
 * One replay of a single UI test: the run's time (with its short id as a caption), status, duration and
 * a "View details" action. The whole row opens the run too.
 */
export function RunRow({ run, selected = false, onOpenRun }: RunRowProps) {
  return (
    <TableRow
      hover
      selected={selected}
      data-testid={`run-${run.executionId}`}
      onClick={(event) => {
        if (!isFromControl(event)) onOpenRun();
      }}
      sx={{ cursor: 'pointer' }}
    >
      <TableCell data-column="time">
        <Typography variant="body2" component="time" dateTime={toIsoDateTime(run.acceptedAt)} data-testid="run-time">
          {formatRunTime(run.acceptedAt)}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          component="div"
          data-testid="run-id"
          sx={{ fontFamily: 'monospace' }}
        >
          #{shortRunId(run.executionId)}
        </Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <RunStatusChip status={run.status} errorCode={run.errorCode} />
      </TableCell>
      <TableCell data-column="duration" sx={[{ whiteSpace: 'nowrap' }, hideBelowMd] as SxProps<Theme>}>
        <Typography variant="body2" component="div" data-testid="run-duration" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {runDurationText(run)}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <Button
          size="small"
          data-testid="run-view-details"
          onClick={(event) => {
            event.stopPropagation();
            onOpenRun();
          }}
        >
          {RUN_VIEW_DETAILS_LABEL}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default RunRow;
