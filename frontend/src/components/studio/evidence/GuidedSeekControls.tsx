import { Box, Button, Stack } from '@mui/material';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import { guidedCopy } from '@/components/studio/guided/guidedNarratives';
import { seekEligibility, UNKNOWN_RECORDING_EXTENT, type RecordingExtent } from './seekEligibility';
import { guidedSeekTargets } from './guidedSeekTargets';

/**
 * Per-step and per-action seek buttons for a guided Run's recording (STUDIO-OBS-008 AC-7, D-10).
 *
 *  - **Visible labels**: "Seek to step N" and "Seek to action: <safe label>" (AC-7; kept by
 *    ADR-SC-006 as visible text). The safe label is the P3 controlled string, rendered as text.
 *  - **No stamp, no button** ({@link guidedSeekTargets}). A stamp past the end of the recording,
 *    once its length is known, is a disabled button rather than a jump to the last frame — the same
 *    rule `seekEligibility` applies to replay steps, reused here unchanged.
 *  - **The seek itself is the page's**: `onSeek(offsetMs)` goes to `useVideoSeek().seekToOffset`,
 *    the one path both recordings use.
 */

export interface GuidedSeekControlsProps {
  readonly result: Pick<GuidedResult, 'evidence' | 'actionTimings' | 'explanation'>;
  readonly onSeek: (offsetMs: number) => void;
  /** `useVideoSeek().recordingDurationMs`, so stamps past the end can be disabled. */
  readonly recording?: RecordingExtent;
}

export function GuidedSeekControls({ result, onSeek, recording = UNKNOWN_RECORDING_EXTENT }: GuidedSeekControlsProps) {
  const targets = guidedSeekTargets(result);
  if (targets.length === 0) {
    return null;
  }

  const seekButton = (key: string, label: string, offsetMs: number, testId: string) => {
    const eligibility = seekEligibility({ offsetMs }, recording);
    return (
      <Button
        key={key}
        size="small"
        variant="outlined"
        disabled={!eligibility.seekable}
        data-testid={testId}
        onClick={() => {
          if (eligibility.seekable) {
            onSeek(eligibility.offsetMs);
          }
        }}
        sx={(theme) => ({
          width: '100%',
          textTransform: 'none',
          overflowWrap: 'anywhere',
          [theme.breakpoints.up('sm')]: { width: 'auto' },
        })}
      >
        {label}
      </Button>
    );
  };

  return (
    <Stack spacing={1} data-testid="guided-seek-controls">
      {targets.map((target) => (
        <Box key={target.stepId} data-testid={`guided-seek-step-${target.stepNumber}`}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {target.stepOffsetMs !== null &&
              seekButton(
                'step',
                guidedCopy('seekToStep', { N: target.stepNumber }),
                target.stepOffsetMs,
                `guided-seek-step-button-${target.stepNumber}`,
              )}
            {target.actions.map((action) =>
              seekButton(
                `${action.admissionId}:${action.ordinal}`,
                guidedCopy('seekToAction', { '<safe label>': action.safeLabel }),
                action.offsetMs,
                'guided-seek-action-button',
              ),
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

export default GuidedSeekControls;
