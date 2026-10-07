import React, { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { formatElapsed } from './formatElapsed';

/**
 * How long a compile has been waited on, and — once it is plainly not a quick one — what to expect
 * (VAL-007 G1).
 *
 * A translation takes anywhere from a few seconds to a few minutes, and there is no progress
 * channel for it (SSE is execution-only, §5.5). So the surface says the two things it does know:
 * how long it has been waiting, and that this length of wait is normal.
 *
 * The time is deliberately **not** in a live region: a polite region that changes every second is
 * read out every second. The hint is, and it appears once.
 */

/** When the expectation-setting hint appears. VAL-007 G1: "after ~15s". */
export const COMPILE_HINT_AFTER_MS = 15_000;

export const COMPILE_DURATION_HINT =
  'Translating your steps can take up to a few minutes. This page keeps checking for the result.';

export interface CompileElapsedProps {
  /** When the wait began, as `Date.now()`. Defaults to when this component mounted. */
  readonly startedAt?: number;
  /** Placed before the time, e.g. "Waiting " to read "Waiting 0:42". */
  readonly prefix?: string;
}

export const CompileElapsed: React.FC<CompileElapsedProps> = ({ startedAt, prefix = '' }) => {
  const [origin] = useState(() => startedAt ?? Date.now());
  const from = startedAt ?? origin;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [from]);

  const elapsed = Math.max(0, now - from);

  return (
    <>
      <Typography
        component="span"
        variant="caption"
        color="text.secondary"
        aria-live="off"
        data-testid="compile-elapsed"
        sx={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {`${prefix}${formatElapsed(elapsed)}`}
      </Typography>
      {elapsed >= COMPILE_HINT_AFTER_MS && (
        <Typography
          variant="caption"
          color="text.secondary"
          role="status"
          data-testid="compile-duration-hint"
          sx={{ display: 'block', mt: 0.5 }}
        >
          {COMPILE_DURATION_HINT}
        </Typography>
      )}
    </>
  );
};

export default CompileElapsed;
