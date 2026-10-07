import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { failedWithSkippedTailExecution } from '@/services/mocks/studio/executionFixtures';
import type { ExecutionSnapshot, VideoStatus } from '@/types/studio/studioTypes';
import { ExecutionProgressView, WATCH_FAILURE_LABEL } from './ExecutionProgressView';

/**
 * VAL-025 — a failed step points the author to the recording at that step, and only when there is
 * a recording to watch.
 */

const FAILED_STEP = failedWithSkippedTailExecution.stepResults[2];

function withVideo(status: VideoStatus): ExecutionSnapshot {
  return { ...failedWithSkippedTailExecution, video: { ...failedWithSkippedTailExecution.video, status } };
}

describe('Watch the recording at a failed step', () => {
  it('offers the link on the failed step only, and seeks to that step', async () => {
    expect(FAILED_STEP.status).toBe('FAIL');
    const onSeekStep = vi.fn();
    render(<ExecutionProgressView snapshot={withVideo('AVAILABLE')} onSeekStep={onSeekStep} />);

    const watch = screen.getByRole('button', { name: `${WATCH_FAILURE_LABEL} (step 3)` });
    expect(watch).toHaveTextContent(WATCH_FAILURE_LABEL);
    expect(screen.getAllByText(WATCH_FAILURE_LABEL)).toHaveLength(1);
    expect(screen.queryByTestId('step-seek-2')).toBeNull();
    expect(screen.getByTestId('step-seek-0')).toBeEnabled();
    // The failure message is still shown; the link sits beside it.
    expect(screen.getByTestId('step-message-2')).toHaveTextContent(FAILED_STEP.message!);

    await userEvent.setup({ delay: null }).click(watch);
    expect(onSeekStep).toHaveBeenCalledWith(FAILED_STEP.offsetMs);
  });

  it.each<VideoStatus>(['PROCESSING', 'FAILED', 'UNAVAILABLE', 'EXPIRED'])(
    'offers no link while the recording is %s',
    (status) => {
      render(<ExecutionProgressView snapshot={withVideo(status)} onSeekStep={vi.fn()} />);
      expect(screen.queryByTestId('step-watch-failure-2')).toBeNull();
    },
  );

  it('offers no link when the page has no recording to seek', () => {
    render(<ExecutionProgressView snapshot={withVideo('AVAILABLE')} />);
    expect(screen.queryByTestId('step-watch-failure-2')).toBeNull();
  });
});
