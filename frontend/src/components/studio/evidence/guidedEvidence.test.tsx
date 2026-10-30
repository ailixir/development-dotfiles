import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionSnapshot, VideoEvidence } from '@/types/studio/studioTypes';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import { mockExecutions } from '@/services/mocks/studio/fixtures';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import { VideoEvidencePanel } from './VideoEvidencePanel';
import { GuidedSeekControls } from './GuidedSeekControls';
import { guidedSeekTargets } from './guidedSeekTargets';
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
  const { videoRef, seekToOffset, recordingDurationMs } = useVideoSeek();
  return (
    <>
      <VideoEvidencePanel ref={videoRef} guided={{ sessionId: SESSION, result }} />
      <GuidedSeekControls
        result={result}
        recording={{ durationMs: recordingDurationMs }}
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

describe('AC-7 / D-10: named per-step and per-action seek, from server stamps only', () => {
  it('visible labels "Seek to step N" and "Seek to action: <safe label>" for the landed stamps', () => {
    render(<GuidedSeekControls result={recordingResult()} onSeek={() => undefined} />);
    for (const name of ['Seek to step 1', 'Seek to action: Open page', 'Seek to step 2', 'Seek to action: Click control']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
  });

  it('a seek sets currentTime to the stamp / 1000 through the page\'s useVideoSeek', async () => {
    const onSeek = vi.fn();
    render(<SeekHarness result={recordingResult()} onSeek={onSeek} />);
    const video = screen.getByTestId('video-evidence-player') as HTMLVideoElement;
    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 2' }));
    expect(onSeek).toHaveBeenCalledWith(1210);
    expect(video.currentTime).toBe(1.21);
    await userEvent.click(screen.getByRole('button', { name: 'Seek to action: Open page' }));
    expect(video.currentTime).toBe(0.12);
  });

  it('no stamp, no button: a step or action the server did not stamp gets nothing synthesized', () => {
    const result = recordingResult();
    result.actionTimings = result.actionTimings.filter(
      (timing) => !(timing.stepId === STEP(2) && timing.kind === 'step') && timing.admissionId !== 'admission-1',
    );
    render(<GuidedSeekControls result={result} onSeek={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Seek to step 2' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Seek to action: Open page' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Seek to step 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seek to action: Click control' })).toBeInTheDocument();
  });

  it('prefixReplay and clarificationWait readings are never seek points; an action joins on admissionId and ordinal', () => {
    const result = recordingResult();
    result.actionTimings = [
      { kind: 'prefixReplay', stepId: STEP(1), admissionId: null, ordinal: null, startMs: 10, endMs: 20 },
      { kind: 'clarificationWait', stepId: STEP(2), admissionId: null, ordinal: null, startMs: 30, endMs: 40 },
      { kind: 'action', stepId: STEP(2), admissionId: 'admission-2', ordinal: 1, startMs: 50, endMs: null },
    ];
    expect(guidedSeekTargets(result)).toEqual([]);
  });

  it('only an AVAILABLE recording offers seeks', () => {
    const result = recordingResult();
    result.evidence.video.status = 'EXPIRED';
    const { container } = render(<GuidedSeekControls result={result} onSeek={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a published learn has no learning recording, so it offers no seek', () => {
    const published = structuredClone(fixtures.documents.publishedResult) as GuidedResult;
    expect(published.evidence.video).toBeNull();
    expect(guidedSeekTargets(published)).toEqual([]);
    const { container } = render(<GuidedSeekControls result={published} onSeek={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a stamp past the known end of the recording is a disabled, still-labelled button', () => {
    render(<GuidedSeekControls result={recordingResult()} recording={{ durationMs: 1000 }} onSeek={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Seek to step 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Seek to step 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Seek to action: Click control' })).toBeDisabled();
  });

  it('narrow layout (AC-8 a): seek buttons stack and fill the width at the base breakpoint', () => {
    render(<GuidedSeekControls result={recordingResult()} onSeek={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Seek to step 1' });
    expect(getComputedStyle(button.parentElement!).flexDirection).toBe('column');
    expect(getComputedStyle(button).width).toBe('100%');
  });
});

describe('round 067 D2: a persistent marker of the last seek', () => {
  it('the used step button is filled with a caption; an action seek replaces it; there is one marker', async () => {
    render(<GuidedSeekControls result={recordingResult()} onSeek={() => undefined} />);
    expect(screen.queryByTestId('guided-seek-marker')).toBeNull();
    const group = screen.getByTestId('guided-seek-step-2');

    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 2' }));
    expect(within(group).getByTestId('guided-seek-marker')).toHaveTextContent('Jumped to step 2.');
    expect(screen.getByRole('button', { name: 'Seek to step 2' })).toHaveAttribute('data-seek-active', 'true');
    expect(screen.getByRole('button', { name: 'Seek to step 2' })).toHaveClass('MuiButton-contained');
    expect(screen.getByRole('button', { name: 'Seek to step 1' })).not.toHaveAttribute('data-seek-active');

    await userEvent.click(screen.getByRole('button', { name: 'Seek to action: Click control' }));
    expect(within(group).getByTestId('guided-seek-marker')).toHaveTextContent('Jumped to step 2, action: Click control.');
    expect(screen.getAllByTestId('guided-seek-marker')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Seek to step 2' })).not.toHaveAttribute('data-seek-active');
    expect(screen.getByRole('button', { name: 'Seek to action: Click control' })).toHaveAttribute('data-seek-active', 'true');
    // The names are unchanged and "Seek to step 2" stays unique.
    expect(screen.getAllByRole('button', { name: 'Seek to step 2' })).toHaveLength(1);
    expect(within(group).getByRole('button', { name: 'Seek to action: Click control' })).toBeInTheDocument();
  });

  it('a new key (a new recording) starts with no marker, and the marker never touches the video', async () => {
    const onSeek = vi.fn();
    const result = recordingResult();
    const { rerender } = render(<GuidedSeekControls key="a" result={result} onSeek={onSeek} />);
    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 1' }));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('guided-seek-marker')).toBeInTheDocument();
    rerender(<GuidedSeekControls key="b" result={result} onSeek={onSeek} />);
    expect(screen.queryByTestId('guided-seek-marker')).toBeNull();
    expect(onSeek).toHaveBeenCalledTimes(1);
  });

  it('a disabled button sets no marker', async () => {
    render(<GuidedSeekControls result={recordingResult()} recording={{ durationMs: 1000 }} onSeek={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Seek to step 2' }), { pointerEventsCheck: 0 });
    expect(screen.queryByTestId('guided-seek-marker')).toBeNull();
  });
});
