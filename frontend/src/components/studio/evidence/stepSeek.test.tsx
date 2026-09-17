import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { TERMINAL_EVIDENCE_SETTLED } from '@/services/mocks/studio/executionScenarios';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import { mockExecutions } from '@/services/mocks/studio/fixtures';
import { ExecutionProgressView, NOT_ATTEMPTED } from '@/components/studio/run';
import { VideoEvidencePanel } from './VideoEvidencePanel';
import { useVideoSeek } from './seekEligibility';

/**
 * Story 10.16a — step seek: AC-8, AC-9, AC-10, and AC-20's keyboard operability.
 *
 * The harness wires `ExecutionProgressView`'s seek controls to the panel's `<video>` through
 * `useVideoSeek`, the hook the page uses. jsdom stores `currentTime` as a plain property, so every
 * assertion reads it back from the element that was actually mounted.
 */

const SENTINEL_SECONDS = 42.5;

function SeekHarness({
  snapshot,
  onSeek,
}: {
  snapshot: ExecutionSnapshot;
  onSeek?: (offsetMs: number) => void;
}) {
  const { videoRef, seekToOffset } = useVideoSeek();
  return (
    <>
      <VideoEvidencePanel ref={videoRef} snapshot={snapshot} />
      <ExecutionProgressView
        snapshot={snapshot}
        onSeekStep={(offsetMs) => {
          onSeek?.(offsetMs);
          seekToOffset(offsetMs);
        }}
      />
    </>
  );
}

function video(): HTMLVideoElement {
  return screen.getByTestId('video-evidence-player') as HTMLVideoElement;
}

/** A FAILED run with an AVAILABLE recording, a FAIL, and a SKIPPED step after it. */
const failedWithSkipped = mockExecutions.find(
  (execution) =>
    execution.video.status === 'AVAILABLE' &&
    execution.stepResults.some((step) => step.status === 'FAIL') &&
    execution.stepResults.some((step) => step.status === 'SKIPPED'),
)!;

describe('AC-8: a step seek sets currentTime to offsetMs / 1000 and nothing else', () => {
  it('the first attempted step, at a non-zero sub-second offset, is not re-based or rounded', async () => {
    const first = TERMINAL_EVIDENCE_SETTLED.stepResults[0];
    // The hazard must be able to occur: non-zero (re-basing shows) and sub-second (rounding shows).
    expect(first.offsetMs).not.toBeNull();
    expect(first.offsetMs).toBeGreaterThan(0);
    expect(first.offsetMs! % 1000).not.toBe(0);

    render(<SeekHarness snapshot={TERMINAL_EVIDENCE_SETTLED} />);
    video().currentTime = SENTINEL_SECONDS;
    await userEvent.click(screen.getByTestId(`step-seek-${first.stepIndex}`));
    expect(video().currentTime).toBe(first.offsetMs! / 1000);
  });

  it('every attempted step seeks to its own offset, in any order', async () => {
    render(<SeekHarness snapshot={TERMINAL_EVIDENCE_SETTLED} />);
    const attempted = TERMINAL_EVIDENCE_SETTLED.stepResults.filter((step) => step.offsetMs !== null);
    expect(attempted.length).toBeGreaterThan(1);
    for (const step of [...attempted].reverse()) {
      await userEvent.click(screen.getByTestId(`step-seek-${step.stepIndex}`));
      expect(video().currentTime).toBe(step.offsetMs! / 1000);
    }
  });

  it('the handler receives the snapshot’s offsetMs exactly', async () => {
    const onSeek = vi.fn();
    render(<SeekHarness snapshot={TERMINAL_EVIDENCE_SETTLED} onSeek={onSeek} />);
    const step = TERMINAL_EVIDENCE_SETTLED.stepResults[1];
    await userEvent.click(screen.getByTestId(`step-seek-${step.stepIndex}`));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(step.offsetMs);
  });
});

describe('AC-9: a step with a null offsetMs offers no working seek', () => {
  it('a SKIPPED step after a FAIL is disabled, named as not attempted, and moves nothing', async () => {
    const failIndex = failedWithSkipped.stepResults.findIndex((step) => step.status === 'FAIL');
    const skipped = failedWithSkipped.stepResults.find(
      (step) => step.status === 'SKIPPED' && step.stepIndex > failIndex,
    )!;
    expect(skipped.offsetMs).toBeNull();

    const onSeek = vi.fn();
    render(<SeekHarness snapshot={failedWithSkipped} onSeek={onSeek} />);
    video().currentTime = SENTINEL_SECONDS;

    const control = screen.getByTestId(`step-seek-${skipped.stepIndex}`);
    expect(control).toBeDisabled();
    expect(control.getAttribute('aria-label')).toContain(NOT_ATTEMPTED);

    await userEvent.click(control, { pointerEventsCheck: 0 });
    control.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onSeek).not.toHaveBeenCalled();
    expect(video().currentTime).toBe(SENTINEL_SECONDS);
  });

  it('never-attempted (PENDING) steps are disabled too', () => {
    const running = mockExecutions.find((execution) =>
      execution.stepResults.some((step) => step.status === 'PENDING' && step.offsetMs === null),
    )!;
    render(<ExecutionProgressView snapshot={running} onSeekStep={() => undefined} />);
    for (const step of running.stepResults.filter((candidate) => candidate.offsetMs === null)) {
      expect(screen.getByTestId(`step-seek-${step.stepIndex}`)).toBeDisabled();
    }
  });
});

describe('AC-10: a wait or assertion step seeks to its recorded start', () => {
  it('the assertion step lands at offsetMs, seconds before offsetMs + durationMs', async () => {
    const assertion = passedExecution.stepResults.find((step) =>
      /^Check that/u.test(step.originalText),
    )!;
    expect(assertion.offsetMs).not.toBeNull();
    expect(assertion.durationMs).not.toBeNull();
    // The hazard occurs on this fixture: start and finish are seconds apart, and the duration is
    // not the start either.
    expect(assertion.durationMs!).toBeGreaterThanOrEqual(2000);
    expect(assertion.durationMs).not.toBe(assertion.offsetMs);

    render(<SeekHarness snapshot={passedExecution} />);
    await userEvent.click(screen.getByTestId(`step-seek-${assertion.stepIndex}`));
    expect(video().currentTime).toBe(assertion.offsetMs! / 1000);
    expect(video().currentTime).not.toBe((assertion.offsetMs! + assertion.durationMs!) / 1000);
    expect(video().currentTime).not.toBe(assertion.durationMs! / 1000);
  });
});

describe('AC-20: seek controls are keyboard-operable and distinctly named per step', () => {
  it('Tab reaches an attempted step’s control, and Enter and Space both seek', async () => {
    render(<SeekHarness snapshot={TERMINAL_EVIDENCE_SETTLED} />);
    const [first, second] = TERMINAL_EVIDENCE_SETTLED.stepResults;
    const target = screen.getByTestId(`step-seek-${second.stepIndex}`);

    let reached = false;
    for (let presses = 0; presses < 20 && !reached; presses += 1) {
      await userEvent.tab();
      reached = document.activeElement === target;
    }
    expect(reached, 'Tab never reached the seek control').toBe(true);

    await userEvent.keyboard('{Enter}');
    expect(video().currentTime).toBe(second.offsetMs! / 1000);

    const firstControl = screen.getByTestId(`step-seek-${first.stepIndex}`);
    firstControl.focus();
    await userEvent.keyboard(' ');
    expect(video().currentTime).toBe(first.offsetMs! / 1000);
  });

  it('a disabled control is out of the tab order', async () => {
    render(<SeekHarness snapshot={failedWithSkipped} />);
    const skipped = failedWithSkipped.stepResults.find((step) => step.offsetMs === null)!;
    const control = screen.getByTestId(`step-seek-${skipped.stepIndex}`);
    for (let presses = 0; presses < 20; presses += 1) {
      await userEvent.tab();
      expect(document.activeElement).not.toBe(control);
    }
  });

  it('every step’s control has its own accessible name', () => {
    render(<SeekHarness snapshot={failedWithSkipped} />);
    const names = failedWithSkipped.stepResults.map(
      (step) => screen.getByTestId(`step-seek-${step.stepIndex}`).getAttribute('aria-label') ?? '',
    );
    expect(names.every((name) => name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('without onSeekStep, ExecutionProgressView renders no seek control at all', () => {
    render(<ExecutionProgressView snapshot={TERMINAL_EVIDENCE_SETTLED} />);
    expect(screen.queryByTestId('step-seek-0')).toBeNull();
  });
});
