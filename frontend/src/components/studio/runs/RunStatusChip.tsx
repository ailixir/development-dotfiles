import type { ReactElement } from 'react';
import { Chip, CircularProgress, type ChipProps } from '@mui/material';
import {
  executionStatusLabel,
  executionStatusTone,
} from '@/components/studio/run/executionStatus';

/** Plain chips like the All Checks / All Reports lists; only a live run gets a spinner. */
function statusIcon(status: string): ReactElement | undefined {
  return status === 'RUNNING'
    ? <CircularProgress size={12} thickness={6} color="inherit" sx={{ ml: '6px !important' }} />
    : undefined;
}

export interface RunStatusChipProps {
  status: string;
  errorCode: string | null | undefined;
  size?: ChipProps['size'];
  'data-testid'?: string;
}

/** A run outcome as a labelled chip; the text label means colour is never the only signal (AC-5). Cancelled is its own state. */
export function RunStatusChip({ status, errorCode, size = 'small', 'data-testid': testId = 'run-status' }: RunStatusChipProps) {
  return (
    <Chip
      size={size}
      icon={statusIcon(status)}
      label={executionStatusLabel(status, errorCode)}
      color={executionStatusTone(status, errorCode)}
      data-testid={testId}
    />
  );
}

export default RunStatusChip;
