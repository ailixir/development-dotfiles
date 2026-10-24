import type { MouseEvent } from 'react';
import { TableCell, TableRow, Tooltip, Typography, type SxProps, type Theme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { hideBelowMd } from '@/components/studio/list/studioListSx';
import { formatAbsoluteTime, formatDuration, formatRelativeTime, toIsoDateTime } from '@/utils/time';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { RunStatusChip } from './RunStatusChip';
import { RunRowMenu } from './RunRowMenu';
import { runDurationText, runQueueWaitMs, shortRunId } from './runPresentation';

export interface RunRowProps {
  run: ExecutionSnapshot;
  /** CSI display name from the registry, when known. */
  csiName?: string | null;
  /** The run's drawer URL (keeps the list's query string). */
  href: string;
  selected?: boolean;
  onOpenRun: () => void;
  onCopyLink: () => void;
}

/** Clicks on the row's own controls keep their meaning; anywhere else opens the run. */
function isFromControl(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target as HTMLElement | null;
  return target?.closest('a, button, [role="menuitem"], [role="menu"]') != null;
}

/** One replay of a single UI test. The run's short id is the row's single link; the trigger sits below it. */
export function RunRow({ run, csiName, href, selected = false, onOpenRun, onCopyLink }: RunRowProps) {
  const runLabel = `#${shortRunId(run.executionId)}`;
  const queueWait = runQueueWaitMs(run);

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
      <TableCell sx={{ maxWidth: 320 }}>
        <Typography
          component={RouterLink}
          to={href}
          variant="subtitle2"
          data-testid="run-link"
          sx={{
            color: 'primary.main',
            fontWeight: 600,
            fontFamily: 'monospace',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {runLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {run.triggerSource === 'SCHEDULED' ? 'Scheduled' : run.triggerSource === 'MANUAL' ? 'Manual' : 'Unknown origin'}
        </Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', width: 140 }}>
        <RunStatusChip status={run.status} errorCode={run.errorCode} />
      </TableCell>
      <TableCell sx={hideBelowMd}>
        {run.csiId ? (
          <Tooltip title={`CSI ${run.csiId}`} describeChild>
            <Typography variant="body2" component="span">{csiName ?? run.csiId}</Typography>
          </Tooltip>
        ) : (
          <Typography variant="body2" color="text.secondary" component="span">—</Typography>
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Tooltip title={formatAbsoluteTime(run.acceptedAt)} placement="top" describeChild>
          <Typography variant="body2" component="time" dateTime={toIsoDateTime(run.acceptedAt)} data-testid="run-requested">
            {formatRelativeTime(run.acceptedAt)}
          </Typography>
        </Tooltip>
      </TableCell>
      <TableCell sx={[{ whiteSpace: 'nowrap' }, hideBelowMd] as SxProps<Theme>}>
        <Typography variant="body2" component="div" data-testid="run-duration" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {runDurationText(run)}
        </Typography>
        {queueWait !== null && (
          <Typography variant="caption" color="text.secondary" component="div" data-testid="run-queue-wait">
            Queued {formatDuration(queueWait)}
          </Typography>
        )}
      </TableCell>
      <TableCell align="right" sx={{ width: 56 }}>
        <RunRowMenu label={`run ${runLabel}`} onOpenRun={onOpenRun} onCopyLink={onCopyLink} />
      </TableCell>
    </TableRow>
  );
}

export default RunRow;
