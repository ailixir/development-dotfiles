import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
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

/** The control last used to seek: a step's own button (`actionKey: null`) or one of its actions. */
interface LastSeek {
  readonly stepNumber: number;
  readonly actionKey: string | null;
  readonly actionLabel: string | null;
}

export function GuidedSeekControls({ result, onSeek, recording = UNKNOWN_RECORDING_EXTENT }: GuidedSeekControlsProps) {
  // Round 067 D2: a persistent marker of the last seek. The page mounts this per session, so a new
  // recording starts with none. It never touches the <video>.
  const [lastSeek, setLastSeek] = useState<LastSeek | null>(null);
  const targets = guidedSeekTargets(result);
  if (targets.length === 0) {
    return null;
  }

  const seekButton = (
    key: string,
    label: string,
    offsetMs: number,
    testId: string,
    marker: LastSeek,
  ) => {
    const eligibility = seekEligibility({ offsetMs }, recording);
    const active =
      lastSeek !== null && lastSeek.stepNumber === marker.stepNumber && lastSeek.actionKey === marker.actionKey;
    return (
      <Button
        key={key}
        size="small"
        variant={active ? 'contained' : 'outlined'}
        disabled={!eligibility.seekable}
        data-testid={testId}
        data-seek-active={active ? 'true' : undefined}
        onClick={() => {
          if (eligibility.seekable) {
            setLastSeek(marker);
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
                { stepNumber: target.stepNumber, actionKey: null, actionLabel: null },
              )}
            {target.actions.map((action) =>
              seekButton(
                `${action.admissionId}:${action.ordinal}`,
                guidedCopy('seekToAction', { '<safe label>': action.safeLabel }),
                action.offsetMs,
                'guided-seek-action-button',
                {
                  stepNumber: target.stepNumber,
                  actionKey: `${action.admissionId}:${action.ordinal}`,
                  actionLabel: action.safeLabel,
                },
              ),
            )}
          </Stack>
          {lastSeek !== null && lastSeek.stepNumber === target.stepNumber && (
            <Typography
              variant="caption"
              color="text.secondary"
              data-testid="guided-seek-marker"
              sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}
            >
              {lastSeek.actionLabel === null
                ? guidedCopy('seekMarkerStep', { N: lastSeek.stepNumber })
                : guidedCopy('seekMarkerAction', { N: lastSeek.stepNumber, '<safe label>': lastSeek.actionLabel })}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}

export default GuidedSeekControls;
