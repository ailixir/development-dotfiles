import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionSnapshot, VideoEvidence } from '@/types/studio/studioTypes';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import { mockExecutions } from '@/services/mocks/studio/fixtures';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import { VideoEvidencePanel } from './VideoEvidencePanel';
import { GuidedSeekControls, guidedStepResults } from './GuidedSeekControls';
import { useVideoSeek } from './useVideoSeek';
import { VIDEO_EVIDENCE_NARRATIVES, STOPPED_RUN_RECORDING_STATEMENTS } from './videoEvidenceNarratives';

/**
 * STUDIO-OBS-008 lane L5a: the guided recording and its seek (AC-7; D-2, D-10).
 *
 * The guided payload is the landed `contracts/v3/fixtures.json` `recordingResult`: an `AVAILABLE`
 * recording with one `kind: step` and one `kind: action` stamp for each of its two steps. It is the
 * recording of a learning attempt that did not publish (`FAILED`); a published learn has none
 * (`evidence.video` is `null`), and the seek offers nothing for it.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const fixtures = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/studio-observed-authoring/contracts/v3/fixtures.json'), 'utf8'),
);
/** A learn that did not publish: the recording of its learning attempt (`evidence.video` non-null). */
type RecordedResult = Omit<GuidedResult, 'evidence'> & {
  evidence: Omit<GuidedResult['evidence'], 'video'> & { video: VideoEvidence };
};
const recordingResult = (): RecordedResult => structuredClone(fixtures.documents.recordingResult) as RecordedResult;
const SESSION = 'sample-session';
const STEP = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function SeekHarness({ result, onSeek }: { result: RecordedResult; onSeek?: (offsetMs: number) => void }) {
  const { videoRef, seekToOffset } = useVideoSeek();
  return (
    <>
      <VideoEvidencePanel ref={videoRef} guided={{ sessionId: SESSION, result }} />
      <GuidedSeekControls
        result={result}
        onSeek={(offsetMs) => {
          onSeek?.(offsetMs);
          seekToOffset(offsetMs);
        }}
      />
    </>
  );
}

describe('AC-7: the guided recording plays from getGuidedSessionVideo (D-2)', () => {
  it('an AVAILABLE guided recording plays from the guided video route, with no query', () => {
    render(<VideoEvidencePanel guided={{ sessionId: SESSION, result: recordingResult() }} />);
    const player = screen.getByTestId('video-evidence-player') as HTMLVideoElement;
    expect(player.getAttribute('src')).toBe(studioGuidedApi.videoPath(SESSION));
    expect(player.getAttribute('src')).toMatch(/\/api\/v1\/studio\/guided-sessions\/sample-session\/video$/u);
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-evidence-kind', 'guided');
    expect(screen.getByTestId('video-evidence-title')).toHaveTextContent(VIDEO_EVIDENCE_NARRATIVES.AVAILABLE.title);
  });

  it.each(['PROCESSING', 'FAILED', 'UNAVAILABLE', 'EXPIRED'] as const)(
    'a %s guided recording mounts no player and shows the existing narrative (never a fake player)',
    (status) => {
      const result = recordingResult();
      result.evidence.video = { status, error: null, expiresAt: null, partial: false };
      result.actionTimings = [];
      const { container } = render(<VideoEvidencePanel guided={{ sessionId: SESSION, result }} />);
      expect(screen.queryByTestId('video-evidence-player')).toBeNull();
      expect(container.querySelector('[src]')).toBeNull();
      expect(screen.getByTestId('video-evidence-statement')).toHaveTextContent(VIDEO_EVIDENCE_NARRATIVES[status].statement);
    },
  );

  it('a guided recording is not given the replay stopped-run line, which is keyed on a replay errorCode', () => {
    const result = recordingResult();
    result.outcome = 'CANCELLED';
    render(<VideoEvidencePanel guided={{ sessionId: SESSION, result }} />);
    expect(screen.queryByTestId('video-evidence-stopped-run')).toBeNull();
    expect(screen.queryByText(STOPPED_RUN_RECORDING_STATEMENTS.CANCELLED)).toBeNull();
  });

  it('a partial guided recording (KL-015-R1) keeps the existing partial qualifier', () => {
    const result = recordingResult();
    result.evidence.video.partial = true;
    render(<VideoEvidencePanel guided={{ sessionId: SESSION, result }} />);
    expect(screen.getByTestId('video-evidence-partial')).toBeInTheDocument();
  });

  it('D-10 / 015 H9: a replay with no video status shows the unavailable narrative instead of failing', () => {
    const reaped = structuredClone(mockExecutions[0]) as ExecutionSnapshot;
    (reaped.video as { status: unknown }).status = null;
    render(<VideoEvidencePanel snapshot={reaped} />);
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-video-status', 'UNAVAILABLE');
    expect(screen.queryByTestId('video-evidence-player')).toBeNull();
  });
});

describe('AC-7 / D-10: a failed learn shows the replay\'s step list (2026-11-03)', () => {
  it('lists every step like a run: a seek on the passed step, "Watch the recording at this step" on the stopped one', () => {
    render(<GuidedSeekControls result={recordingResult()} onSeek={() => undefined} />);
    expect(screen.getByTestId('execution-steps')).toBeInTheDocument();
    expect(screen.getByTestId('step-text-0')).toHaveTextContent('1. ');
    expect(screen.getByTestId('step-status-0')).toHaveAttribute('data-status', 'PASS');
    expect(screen.getByTestId('step-status-1')).toHaveAttribute('data-status', 'FAIL');
    expect(screen.getByRole('button', { name: 'Seek to step 1' })).toBeEnabled();
    expect(screen.getByTestId('step-duration-0')).toHaveTextContent('740 ms');
    // The stopped step was attempted but has no duration reading: no duration, never "not attempted".
    expect(screen.queryByTestId('step-duration-1')).toBeNull();
    expect(screen.queryByText('not attempted')).toBeNull();
    expect(screen.getByTestId('step-watch-failure-1')).toHaveTextContent('Watch the recording at this step');
    // The stopped step offers the watch control instead of a plain seek, and nothing per action.
    expect(screen.queryByTestId('step-seek-1')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Seek to action/ })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('a seek sets currentTime to the stamp / 1000 through the page\'s useVideoSeek', async () => {
    const onSeek = vi.fn();
    render(<SeekHarness result={recordingResult()} onSeek={onSeek} />);
    const video = screen.getByTestId('video-evidence-player') as HTMLVideoElement;
    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 1' }));
    expect(onSeek).toHaveBeenCalledWith(120);
    expect(video.currentTime).toBe(0.12);
    await userEvent.click(screen.getByTestId('step-watch-failure-1'));
    expect(onSeek).toHaveBeenLastCalledWith(1210);
    expect(video.currentTime).toBe(1.21);
  });

  it('the stopped step without a stamp of its own seeks to the end of the last stamp', async () => {
    const result = recordingResult();
    result.actionTimings = result.actionTimings.filter((timing) => timing.stepId !== STEP(2));
    const onSeek = vi.fn();
    render(<GuidedSeekControls result={result} onSeek={onSeek} />);
    await userEvent.click(screen.getByTestId('step-watch-failure-1'));
    expect(onSeek).toHaveBeenCalledWith(860);
  });

  it('a step with only an action stamp seeks to that action', async () => {
    const result = recordingResult();
    result.explanation.steps[1]!.completed = true;
    result.actionTimings = result.actionTimings.filter(
      (timing) => !(timing.stepId === STEP(2) && timing.kind === 'step') && timing.stepId !== STEP(1),
    );
    const stepTwoAction = result.actionTimings.find((timing) => timing.stepId === STEP(2) && timing.kind === 'action')!;
    const onSeek = vi.fn();
    render(<GuidedSeekControls result={result} onSeek={onSeek} />);
    expect(screen.getByRole('button', { name: 'Seek to step 1: not attempted' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 2' }));
    expect(onSeek).toHaveBeenCalledWith(stepTwoAction.startMs);
  });

  it('a step the run never reached is SKIPPED with a disabled seek named "not attempted"', async () => {
    const result = recordingResult();
    result.explanation.steps.push({
      ...structuredClone(result.explanation.steps[1]!),
      stepId: STEP(3),
      number: 3,
      actions: [],
    });
    const onSeek = vi.fn();
    render(<GuidedSeekControls result={result} onSeek={onSeek} />);
    expect(screen.getByTestId('step-status-2')).toHaveAttribute('data-status', 'SKIPPED');
    const seek = screen.getByRole('button', { name: 'Seek to step 3: not attempted' });
    expect(seek).toBeDisabled();
    await userEvent.click(seek, { pointerEventsCheck: 0 });
    expect(onSeek).not.toHaveBeenCalled();
    expect(screen.queryByTestId('step-watch-failure-2')).toBeNull();
  });

  it('only an AVAILABLE recording offers seeks: the list stays, the controls go', () => {
    const result = recordingResult();
    result.evidence.video.status = 'EXPIRED';
    render(<GuidedSeekControls result={result} onSeek={() => undefined} />);
    expect(screen.getByTestId('execution-steps')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('step-watch-failure-1')).toBeNull();
  });

  it('a published learn has no learning recording, so it offers no seek', () => {
    const published = structuredClone(fixtures.documents.publishedResult) as GuidedResult;
    expect(published.evidence.video).toBeNull();
    render(<GuidedSeekControls result={published} onSeek={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('step-watch-failure-1')).toBeNull();
  });
});

describe('guidedStepResults: a guided result as the replay\'s StepResult list', () => {
  it('maps completed to PASS, the stopped step to FAIL, offsets from the step stamp and duration from it only', () => {
    expect(guidedStepResults(recordingResult())).toEqual([
      { stepIndex: 0, originalText: 'Step 1', status: 'PASS', offsetMs: 120, durationMs: 740, message: null },
      { stepIndex: 1, originalText: 'Step 2', status: 'FAIL', offsetMs: 1210, durationMs: null, message: null },
    ]);
  });

  it('a step the run did not reach is SKIPPED with no offset', () => {
    const result = recordingResult();
    result.explanation.steps.push({ ...structuredClone(result.explanation.steps[1]!), stepId: STEP(3), number: 3, actions: [] });
    const steps = guidedStepResults(result);
    expect(steps[2]).toMatchObject({ stepIndex: 2, status: 'SKIPPED', offsetMs: null, durationMs: null });
  });

  it('prefixReplay and clarificationWait readings are never seek points; an action stamp is the fallback', () => {
    const result = recordingResult();
    result.actionTimings = [
      { kind: 'prefixReplay', stepId: STEP(1), admissionId: null, ordinal: null, startMs: 10, endMs: 20 },
      { kind: 'clarificationWait', stepId: STEP(2), admissionId: null, ordinal: null, startMs: 30, endMs: 40 },
    ];
    expect(guidedStepResults(result).map((step) => step.offsetMs)).toEqual([null, null]);

    result.actionTimings.push({ kind: 'action', stepId: STEP(2), admissionId: 'admission-2', ordinal: 1, startMs: 50, endMs: null });
    const steps = guidedStepResults(result);
    expect(steps.map((step) => step.offsetMs)).toEqual([null, 50]);
    expect(steps.map((step) => step.durationMs)).toEqual([null, null]);
  });

  it('a published learn has no stopped step: every step is PASS or SKIPPED', () => {
    const published = structuredClone(fixtures.documents.publishedResult) as GuidedResult;
    expect(guidedStepResults(published).every((step) => step.status !== 'FAIL')).toBe(true);
  });
});

describe('round 067 D2: a persistent marker of the last seek', () => {
  it('the used step button is outlined with a caption, and there is one marker', async () => {
    const result = recordingResult();
    result.explanation.steps[1]!.completed = true;
    render(<GuidedSeekControls result={result} onSeek={() => undefined} />);
    expect(screen.queryByTestId('step-seek-marker-0')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 2' }));
    expect(screen.getByTestId('step-seek-marker-1')).toHaveTextContent('Jumped to step 2.');
    expect(screen.getByRole('button', { name: 'Seek to step 2' })).toHaveAttribute('data-seek-active', 'true');
    expect(screen.getByRole('button', { name: 'Seek to step 2' })).toHaveClass('MuiButton-outlined');
    expect(screen.getByRole('button', { name: 'Seek to step 1' })).not.toHaveAttribute('data-seek-active');

    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 1' }));
    expect(screen.queryByTestId('step-seek-marker-1')).toBeNull();
    expect(screen.getByTestId('step-seek-marker-0')).toHaveTextContent('Jumped to step 1.');
    expect(screen.getByRole('button', { name: 'Seek to step 2' })).not.toHaveAttribute('data-seek-active');
  });

  it('a new execution (a new recording) starts with no marker, and the marker never touches the video', async () => {
    const onSeek = vi.fn();
    const result = recordingResult();
    const { rerender } = render(<GuidedSeekControls result={result} onSeek={onSeek} />);
    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 1' }));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('step-seek-marker-0')).toBeInTheDocument();
    rerender(<GuidedSeekControls result={{ ...result, executionId: 'another-execution' }} onSeek={onSeek} />);
    expect(screen.queryByTestId('step-seek-marker-0')).toBeNull();
    expect(onSeek).toHaveBeenCalledTimes(1);
  });

  it('a disabled button sets no marker', async () => {
    const result = recordingResult();
    result.explanation.steps[1]!.completed = true;
    result.actionTimings = result.actionTimings.filter((timing) => timing.stepId !== STEP(2));
    render(<GuidedSeekControls result={result} onSeek={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 2: not attempted' }), { pointerEventsCheck: 0 });
    expect(screen.queryByTestId('step-seek-marker-1')).toBeNull();
  });
});
