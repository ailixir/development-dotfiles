import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { failedNavigationHttpErrorExecution, failedWithSkippedTailExecution, passedExecution } from '@/services/mocks/studio/executionFixtures';
import { VideoEvidencePanel } from './VideoEvidencePanel';
import { useVideoSeek } from './useVideoSeek';

/** The fixture's failed step ends at (16471 + 14529) ms = 31 s on the recording. */
const FAILURE_SECONDS = 31;

const failed = failedWithSkippedTailExecution;

function video(): HTMLVideoElement {
  return screen.getByTestId('video-evidence-player') as HTMLVideoElement;
}

function playTo(seconds: number) {
  video().currentTime = seconds;
  fireEvent.timeUpdate(video());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the failed step, over the replay video', () => {
  it('is hidden before the failure time, then shows the step and its message and pauses once', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<VideoEvidencePanel snapshot={failed} />);

    playTo(FAILURE_SECONDS - 1);
    expect(screen.queryByTestId('video-failure-overlay')).toBeNull();
    expect(pause).not.toHaveBeenCalled();

    playTo(FAILURE_SECONDS);
    const overlay = screen.getByTestId('video-failure-overlay');
    expect(overlay).toHaveTextContent('Step 3 failed');
    expect(overlay).toHaveTextContent('Timed out waiting for the field "Password"');
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('hides when the user seeks back and does not pause again on a second crossing', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<VideoEvidencePanel snapshot={failed} />);

    playTo(FAILURE_SECONDS + 1);
    expect(pause).toHaveBeenCalledTimes(1);

    video().currentTime = 5;
    fireEvent.seeked(video());
    expect(screen.queryByTestId('video-failure-overlay')).toBeNull();

    playTo(FAILURE_SECONDS + 2);
    expect(screen.getByTestId('video-failure-overlay')).toBeInTheDocument();
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('shows at the end of a recording that stops before the failure time', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<VideoEvidencePanel snapshot={failed} />);
    Object.defineProperty(video(), 'duration', { configurable: true, value: 20 });

    playTo(19);
    expect(screen.queryByTestId('video-failure-overlay')).toBeNull();
    video().currentTime = 20;
    fireEvent.ended(video());
    expect(screen.getByTestId('video-failure-overlay')).toBeInTheDocument();
  });

  it('can be dismissed, and falls back to a fixed line when the step has no message', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const noMessage: ExecutionSnapshot = {
      ...failed,
      stepResults: failed.stepResults.map((step) => (step.status === 'FAIL' ? { ...step, message: null } : step)),
    };
    render(<VideoEvidencePanel snapshot={noMessage} />);
    playTo(FAILURE_SECONDS);
    expect(screen.getByTestId('video-failure-overlay')).toHaveTextContent('This step failed.');
    await userEvent.click(screen.getByTitle('Dismiss'));
    expect(screen.queryByTestId('video-failure-overlay')).toBeNull();
  });

  it('explains a bare failure code in a sentence and still names the code', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const coded: ExecutionSnapshot = {
      ...failed,
      stepResults: failed.stepResults.map((step) => (step.status === 'FAIL' ? { ...step, message: 'ASSERTION_FAILED' } : step)),
    };
    render(<VideoEvidencePanel snapshot={coded} />);
    playTo(FAILURE_SECONDS);
    const overlay = screen.getByTestId('video-failure-overlay');
    expect(overlay).toHaveTextContent('What this step checks for was not on the page.');
    expect(overlay).toHaveTextContent('ASSERTION_FAILED');
  });

  it('explains a main-page HTTP error in a sentence, in red, with no page-errors warning', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<VideoEvidencePanel snapshot={failedNavigationHttpErrorExecution} />);
    playTo(FAILURE_SECONDS);
    const overlay = screen.getByTestId('video-failure-overlay');
    expect(overlay).toHaveTextContent('Step 3 failed');
    expect(overlay).toHaveTextContent('The page this step opened returned an HTTP error (for example 403 Access Denied or 404 Not Found).');
    expect(overlay).toHaveTextContent('NAVIGATION_HTTP_ERROR');
    expect(screen.queryByTestId('passed-with-page-errors')).toBeNull();
  });

  it('never appears for a passing run', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<VideoEvidencePanel snapshot={passedExecution} />);
    playTo(1000);
    expect(screen.queryByTestId('video-failure-overlay')).toBeNull();
    expect(pause).not.toHaveBeenCalled();
  });

  it('keeps the forwarded callback ref working for step seeks', () => {
    function Harness() {
      const { videoRef, seekToOffset } = useVideoSeek();
      return (
        <>
          <VideoEvidencePanel ref={videoRef} snapshot={failed} />
          <button type="button" onClick={() => seekToOffset(9058)}>
            seek
          </button>
        </>
      );
    }
    render(<Harness />);
    act(() => screen.getByText('seek').click());
    expect(video().currentTime).toBe(9.058);
  });
});

describe('the browser console box', () => {
  it('lists only console errors, warnings and page errors, with level and step, collapsed with counts', async () => {
    render(<VideoEvidencePanel snapshot={failed} />);
    const box = screen.getByTestId('console-logs');
    expect(within(box).getByText('Browser console errors (3)')).toBeInTheDocument();
    expect(within(box).getByText('2 errors')).toBeInTheDocument();
    expect(within(box).getByText('1 warning')).toBeInTheDocument();

    await userEvent.click(within(box).getByText('Browser console errors (3)'));
    expect(screen.getByTestId('console-log-line-0')).toHaveTextContent('console.warn: deprecated API');
    expect(screen.getByTestId('console-log-line-0')).toHaveTextContent('WARN');
    expect(screen.getByTestId('console-log-line-1')).toHaveTextContent('Step 3');
    expect(screen.getByTestId('console-log-line-2')).toHaveTextContent('page error: ReferenceError: foo is not defined');
    expect(box).not.toHaveTextContent('Step 3 failed');
  });

  it('leaves console.log and console.info lines out of the box', () => {
    const noisy: ExecutionSnapshot = {
      ...failed,
      logs: [
        ...failed.logs,
        { at: '2026-09-14T10:00:33Z', level: 'INFO', message: 'console.log: login form ready', stepIndex: 1 },
        { at: '2026-09-14T10:00:33Z', level: 'INFO', message: 'console.info: session restored', stepIndex: 1 },
      ],
    };
    render(<VideoEvidencePanel snapshot={noisy} />);
    const box = screen.getByTestId('console-logs');
    expect(within(box).getByText('Browser console errors (3)')).toBeInTheDocument();
    expect(box).not.toHaveTextContent('console.log');
    expect(box).not.toHaveTextContent('console.info');
  });

  it('says so when a finished run captured no console errors or warnings', async () => {
    render(<VideoEvidencePanel snapshot={passedExecution} />);
    const box = screen.getByTestId('console-logs');
    expect(within(box).getByText('Browser console errors (0)')).toBeInTheDocument();
    await userEvent.click(within(box).getByText('Browser console errors (0)'));
    expect(within(box).getByText('No console errors or warnings were captured.')).toBeInTheDocument();
  });

  it('is not part of a guided recording', () => {
    render(
      <VideoEvidencePanel
        guided={{
          sessionId: 's1',
          result: {
            executionId: 'x1',
            evidence: { video: { status: 'AVAILABLE', error: null, expiresAt: null, partial: false } },
          },
        }}
      />,
    );
    expect(screen.queryByTestId('console-logs')).toBeNull();
  });
});
