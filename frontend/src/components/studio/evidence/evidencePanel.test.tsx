import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionSnapshot, VideoStatus } from '@/types/studio/studioTypes';
import { mockExecutions } from '@/services/mocks/studio/fixtures';
import {
  TERMINAL_EVIDENCE_FAILED,
  TERMINAL_EVIDENCE_PROCESSING,
} from '@/services/mocks/studio/executionScenarios';
import {
  cleanlyFlushedTimeoutExecution,
  partialRecordingOnPassedExecution,
} from '@/services/mocks/studio/executionFixtures';
import { VideoEvidencePanel } from './VideoEvidencePanel';
import {
  PARTIAL_RECORDING_QUALIFIER,
  PLAYBACK_FAILED_MESSAGE,
  VIDEO_EVIDENCE_NARRATIVES,
} from './videoEvidenceNarratives';
import {
  MIN_PINNED_VIDEO_PHRASE_LENGTH,
  PINNED_VIDEO_EVIDENCE_FACTS,
} from './pinnedVideoEvidenceFacts';

/**
 * Story 10.16a — the evidence panel: AC-2, AC-3, AC-4, AC-5, AC-12, and AC-20's accessible names.
 *
 * jsdom never loads media, so nothing here counts requests. Every assertion is on the DOM the panel
 * renders, which is where each hazard shows: an element that should not exist, a URL an element
 * should not carry, or a message that should or should not be there.
 */

const VIDEO_ROUTE = /\/executions\/[^/]+\/video/u;

/** One row of `mockExecutions` per state. Reused, not duplicated (AC-14). */
function fixtureWith(status: VideoStatus): ExecutionSnapshot {
  const found = mockExecutions.find((execution) => execution.video.status === status);
  if (!found) {
    throw new Error(`mockExecutions has no ${status} row`);
  }
  return found;
}

const NON_AVAILABLE: readonly VideoStatus[] = ['PROCESSING', 'FAILED', 'UNAVAILABLE', 'EXPIRED'];
const AVAILABLE = fixtureWith('AVAILABLE');

function renderPanel(snapshot: ExecutionSnapshot | null) {
  return render(<VideoEvidencePanel snapshot={snapshot} />);
}

/** Every URL-bearing attribute anywhere in the rendered tree. */
function urlsIn(container: HTMLElement): string[] {
  const values: string[] = [];
  for (const element of Array.from(container.querySelectorAll('*'))) {
    for (const name of ['src', 'href', 'poster', 'data', 'action']) {
      const value = element.getAttribute(name);
      if (value !== null) {
        values.push(value);
      }
    }
  }
  return values;
}

describe('AC-2: PROCESSING, FAILED and UNAVAILABLE are three messages, whatever the outcome', () => {
  it('a terminal outcome whose evidence is PROCESSING renders as still being produced', () => {
    // The hazard: gating the evidence region on the check outcome rather than video.status.
    expect(['PASSED', 'FAILED', 'ERROR']).toContain(TERMINAL_EVIDENCE_PROCESSING.status);
    expect(TERMINAL_EVIDENCE_PROCESSING.video.status).toBe('PROCESSING');

    renderPanel(TERMINAL_EVIDENCE_PROCESSING);
    const region = screen.getByRole('region', { name: VIDEO_EVIDENCE_NARRATIVES.PROCESSING.title });
    expect(within(region).getByTestId('video-evidence-statement')).toHaveTextContent(
      VIDEO_EVIDENCE_NARRATIVES.PROCESSING.statement,
    );
    expect(screen.queryByText(VIDEO_EVIDENCE_NARRATIVES.FAILED.title)).toBeNull();
    expect(screen.queryByText(VIDEO_EVIDENCE_NARRATIVES.UNAVAILABLE.title)).toBeNull();
  });

  it('FAILED and UNAVAILABLE render different titles and reuse video.error verbatim', () => {
    const failed = fixtureWith('FAILED');
    const unavailable = mockExecutions.find(
      (execution) => execution.video.status === 'UNAVAILABLE' && execution.video.error !== null,
    )!;
    expect(failed.video.error).not.toBeNull();

    const first = renderPanel(failed);
    const failedTitle = first.getByTestId('video-evidence-title').textContent;
    expect(first.getByTestId('video-evidence-statement')).toHaveTextContent(failed.video.error!);
    first.unmount();

    const second = renderPanel(unavailable);
    const unavailableTitle = second.getByTestId('video-evidence-title').textContent;
    expect(second.getByTestId('video-evidence-statement')).toHaveTextContent(
      unavailable.video.error!,
    );

    expect(failedTitle).toBe(VIDEO_EVIDENCE_NARRATIVES.FAILED.title);
    expect(unavailableTitle).toBe(VIDEO_EVIDENCE_NARRATIVES.UNAVAILABLE.title);
    expect(failedTitle).not.toBe(unavailableTitle);
  });

  it('FAILED and UNAVAILABLE with a null error each fall back to their own generic statement', () => {
    const cases: Array<[VideoStatus, ExecutionSnapshot]> = [
      ['FAILED', { ...TERMINAL_EVIDENCE_FAILED, video: { ...TERMINAL_EVIDENCE_FAILED.video, error: null } }],
      [
        'UNAVAILABLE',
        mockExecutions.find(
          (execution) => execution.video.status === 'UNAVAILABLE' && execution.video.error === null,
        )!,
      ],
    ];
    const statements: string[] = [];
    for (const [status, snapshot] of cases) {
      const view = renderPanel(snapshot);
      const text = view.getByTestId('video-evidence-statement').textContent ?? '';
      expect(text).toBe(VIDEO_EVIDENCE_NARRATIVES[status].statement);
      statements.push(text);
      view.unmount();
    }
    expect(statements[0]).not.toBe(statements[1]);
  });

  it('the evidence failure fixture keeps its check outcome and still renders as FAILED evidence', () => {
    renderPanel(TERMINAL_EVIDENCE_FAILED);
    expect(
      screen.getByRole('region', { name: VIDEO_EVIDENCE_NARRATIVES.FAILED.title }),
    ).toBeInTheDocument();
  });
});

describe('AC-2: each state says its own fact, checked against an independent pin (TEST-001)', () => {
  /*
   * The assertions above prove that the panel renders *the narrative module's* wording for each
   * state. They cannot prove that the wording is *true*. @qa rewrote PROCESSING to "No recording
   * exists for this run" and everything stayed green. Here, the rendered title and statement are
   * compared with `pinnedVideoEvidenceFacts.ts`, a second copy that nothing derives. The last two
   * tests in this block check that the pin has not been derived after all.
   */
  const ALL_STATES = Object.keys(PINNED_VIDEO_EVIDENCE_FACTS) as VideoStatus[];

  /** Each state as the panel renders it with no server wording, so the generic statement shows. */
  function renderedSlots(status: VideoStatus): { title: string; statement: string } {
    const base = fixtureWith(status);
    const view = renderPanel({ ...base, video: { ...base.video, error: null } });
    const slots = {
      title: view.getByRole('region').getAttribute('aria-label') ?? '',
      statement: view.getByTestId('video-evidence-statement').textContent ?? '',
    };
    expect(view.getByTestId('video-evidence-title')).toHaveTextContent(slots.title);
    view.unmount();
    return slots;
  }

  it('pins exactly the five states the panel narrates, with no phrase short enough to be vacuous', () => {
    expect(new Set(ALL_STATES)).toEqual(new Set(Object.keys(VIDEO_EVIDENCE_NARRATIVES)));
    expect(ALL_STATES).toHaveLength(5);
    for (const status of ALL_STATES) {
      const { titlePhrase, statementPhrase, deniedClaims } = PINNED_VIDEO_EVIDENCE_FACTS[status];
      for (const phrase of [titlePhrase, statementPhrase, ...deniedClaims]) {
        expect(phrase.trim().length, `${status}: "${phrase}"`).toBeGreaterThanOrEqual(
          MIN_PINNED_VIDEO_PHRASE_LENGTH,
        );
      }
      expect(deniedClaims.length, `${status} denies nothing`).toBeGreaterThan(0);
    }
  });

  it.each(ALL_STATES)('%s: the title and the statement each state the pinned fact', (status) => {
    const { title, statement } = renderedSlots(status);
    const pinned = PINNED_VIDEO_EVIDENCE_FACTS[status];
    expect(title.toLowerCase(), `${status} title`).toContain(pinned.titlePhrase.toLowerCase());
    expect(statement.toLowerCase(), `${status} statement`).toContain(
      pinned.statementPhrase.toLowerCase(),
    );
  });

  it.each(ALL_STATES)(
    '%s: neither slot makes a denied claim or another state’s required claim',
    (status) => {
      const { title, statement } = renderedSlots(status);
      const own = PINNED_VIDEO_EVIDENCE_FACTS[status];
      const forbidden = [
        ...own.deniedClaims,
        ...ALL_STATES.filter((other) => other !== status).flatMap((other) => [
          PINNED_VIDEO_EVIDENCE_FACTS[other].titlePhrase,
          PINNED_VIDEO_EVIDENCE_FACTS[other].statementPhrase,
        ]),
      ]
        .map((phrase) => phrase.toLowerCase())
        // A phrase this state is itself required to say is not a claim it can be forbidden.
        .filter(
          (phrase) =>
            phrase !== own.titlePhrase.toLowerCase() && phrase !== own.statementPhrase.toLowerCase(),
        );
      for (const [slot, text] of [
        ['title', title],
        ['statement', statement],
      ] as const) {
        const made = forbidden.filter((phrase) => text.toLowerCase().includes(phrase));
        expect(made, `${status} ${slot} "${text}"`).toEqual([]);
      }
    },
  );

  it('pinnedVideoEvidenceFacts.ts imports neither the narratives, the panel nor the barrel', () => {
    // The twelfth shape: a header comment on the pin is not a guard. This assertion is.
    const specifiers = moduleSpecifiers(fs.readFileSync(PIN_FILE, 'utf8'));
    const derived = specifiers.filter((specifier) =>
      /(^|[./])(videoEvidenceNarratives|VideoEvidencePanel|evidence|index)$/u.test(
        specifier.replace(/\.tsx?$/u, ''),
      ),
    );
    expect(derived, 'the pinned facts are read back out of the module they pin').toEqual([]);
  });

  it('the import scanner sees every specifier form, so its silence means something', () => {
    const planted = [
      "import { VIDEO_EVIDENCE_NARRATIVES } from './videoEvidenceNarratives';",
      'import { VideoEvidencePanel } from "./VideoEvidencePanel";',
      "const mod = await import('./videoEvidenceNarratives.ts');",
      "const n = require('@/components/studio/evidence');",
      'export { VIDEO_EVIDENCE_NARRATIVES } from "./index";',
      "import './videoEvidenceNarratives';",
    ].join('\n');
    const found = moduleSpecifiers(planted);
    expect(found).toHaveLength(6);
    const flagged = found.filter((specifier) =>
      /(^|[./])(videoEvidenceNarratives|VideoEvidencePanel|evidence|index)$/u.test(
        specifier.replace(/\.tsx?$/u, ''),
      ),
    );
    expect(flagged).toHaveLength(6);

    // And it reads the real file: the pin genuinely imports the contract types module.
    expect(moduleSpecifiers(fs.readFileSync(PIN_FILE, 'utf8'))).toEqual([
      '@/types/studio/studioTypes',
    ]);
  });
});

const PIN_FILE = path.join(__dirname, 'pinnedVideoEvidenceFacts.ts');

/**
 * `import`/`export … from`, bare `import '…'`, dynamic `import(…)` and `require(…)`, any quote.
 * The same scanner as `run/refusals.test.tsx` and `review/diagnostics.test.tsx`. It is copied rather
 * than imported, because importing another test file would run that file's tests here.
 */
function moduleSpecifiers(source: string): string[] {
  const patterns = [
    /(?:^|[^\w$])(?:import|export)\s[^;]*?from\s*(['"`])([^'"`]+)\1/gsu,
    /(?:^|[^\w$])import\s*(['"`])([^'"`]+)\1/gu,
    /(?:^|[^\w$])(?:import|require)\s*\(\s*(['"`])([^'"`]+)\1\s*\)/gu,
  ];
  const ordered: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      ordered.push(match[2]);
    }
  }
  return ordered;
}

describe('AC-3: partial is a qualifier on an AVAILABLE recording only, read from video.partial', () => {
  it('(i) a PASSED run whose AVAILABLE recording is partial renders the qualifier', () => {
    expect(partialRecordingOnPassedExecution.status).toBe('PASSED');
    expect(partialRecordingOnPassedExecution.video).toMatchObject({ status: 'AVAILABLE', partial: true });

    renderPanel(partialRecordingOnPassedExecution);
    expect(screen.getByTestId('video-evidence-partial')).toHaveTextContent(PARTIAL_RECORDING_QUALIFIER);
  });

  it('(ii) a TIMEOUT run whose AVAILABLE recording flushed cleanly renders no qualifier', () => {
    expect(cleanlyFlushedTimeoutExecution.status).toBe('ERROR');
    expect(cleanlyFlushedTimeoutExecution.errorCode).toBe('TIMEOUT');
    expect(cleanlyFlushedTimeoutExecution.video).toMatchObject({ status: 'AVAILABLE', partial: false });

    renderPanel(cleanlyFlushedTimeoutExecution);
    expect(screen.getByTestId('video-evidence-player')).toBeInTheDocument();
    expect(screen.queryByTestId('video-evidence-partial')).toBeNull();
    expect(screen.queryByText(PARTIAL_RECORDING_QUALIFIER)).toBeNull();
  });

  it.each(NON_AVAILABLE)('a %s body that says partial: true renders no qualifier', (status) => {
    const base = fixtureWith(status);
    renderPanel({ ...base, video: { ...base.video, partial: true } });
    expect(screen.queryByTestId('video-evidence-partial')).toBeNull();
    expect(screen.queryByText(PARTIAL_RECORDING_QUALIFIER)).toBeNull();
  });
});

describe('AC-4: a <video> and a download exist only for AVAILABLE with a videoPath', () => {
  it.each(NON_AVAILABLE)('%s: no <video>, and nothing in the tree carries the video route', (status) => {
    const { container } = renderPanel(fixtureWith(status));
    expect(container.querySelectorAll('video')).toHaveLength(0);
    expect(container.querySelectorAll('source')).toHaveLength(0);
    expect(urlsIn(container).filter((value) => VIDEO_ROUTE.test(value))).toEqual([]);
    expect(screen.queryByTestId('video-evidence-download')).toBeNull();
  });

  it.each(NON_AVAILABLE)(
    '%s with a (contradictory) videoPath still mounts nothing: the gate is the status, not the path',
    (status) => {
      const base = fixtureWith(status);
      const { container } = renderPanel({ ...base, videoPath: AVAILABLE.videoPath });
      expect(container.querySelectorAll('video')).toHaveLength(0);
      expect(urlsIn(container).filter((value) => VIDEO_ROUTE.test(value))).toEqual([]);
    },
  );

  it('AVAILABLE without a videoPath mounts nothing either', () => {
    const { container } = renderPanel({ ...AVAILABLE, videoPath: null });
    expect(container.querySelectorAll('video')).toHaveLength(0);
    expect(urlsIn(container).filter((value) => VIDEO_ROUTE.test(value))).toEqual([]);
  });

  it('AVAILABLE with a videoPath renders exactly one <video>, whose src is the constructed URL', () => {
    const { container } = renderPanel(AVAILABLE);
    const videos = container.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute('src')).toBe(`${window.location.origin}${AVAILABLE.videoPath}`);
    // No crossOrigin: "anonymous" would strip the ambient session (Dev Notes).
    expect(videos[0].hasAttribute('crossorigin')).toBe(false);
  });

  it('no run on screen renders no <video> and none of the five states', () => {
    const { container } = renderPanel(null);
    expect(container.querySelectorAll('video')).toHaveLength(0);
    for (const narrative of Object.values(VIDEO_EVIDENCE_NARRATIVES)) {
      expect(screen.queryByText(narrative.title)).toBeNull();
    }
  });
});

describe('AC-5 (retired): the panel offers no download of its own', () => {
  it('renders no download affordance, because the player\u2019s own controls are the one way', () => {
    renderPanel(AVAILABLE);
    // A second link on the same bytes, the same route and the same session was one more thing to
    // keep correct for no reader benefit. `?download=true` stays in the API contract; nothing in
    // the UI composes it.
    expect(screen.queryByTestId('video-evidence-download')).toBeNull();
    expect(screen.queryByRole('link', { name: /download/iu })).toBeNull();
    const video = screen.getByTestId('video-evidence-player') as HTMLVideoElement;
    expect(video.controls).toBe(true);
    // Nothing suppresses the browser's own download item in those controls.
    expect(video.getAttribute('controlslist')).toBeNull();
  });
});

describe('AC-12: a media error renders one fixed message, whatever the cause', () => {
  it('(a) the message appears on an error event, and not without one', () => {
    renderPanel(AVAILABLE);
    expect(screen.queryByTestId('video-playback-failed')).toBeNull();
    fireEvent.error(screen.getByTestId('video-evidence-player'));
    expect(screen.getByTestId('video-playback-failed')).toHaveTextContent(PLAYBACK_FAILED_MESSAGE);
  });

  it('(b) the rendered text is byte-identical for MediaError codes 1, 2, 3, 4 and null', () => {
    const rendered: string[] = [];
    for (const error of [{ code: 1 }, { code: 2 }, { code: 3 }, { code: 4 }, null]) {
      const view = renderPanel(AVAILABLE);
      const video = view.getByTestId('video-evidence-player');
      Object.defineProperty(video, 'error', { configurable: true, get: () => error });
      fireEvent.error(video);
      rendered.push(view.getByTestId('video-evidence').textContent ?? '');
      view.unmount();
    }
    expect(rendered[0]).toContain(PLAYBACK_FAILED_MESSAGE);
    expect(new Set(rendered).size).toBe(1);
  });

  it('the message is none of the five state messages', () => {
    for (const narrative of Object.values(VIDEO_EVIDENCE_NARRATIVES)) {
      expect(PLAYBACK_FAILED_MESSAGE).not.toBe(narrative.title);
      expect(PLAYBACK_FAILED_MESSAGE).not.toBe(narrative.statement);
    }
  });
});

describe('AC-20: the evidence region has a distinct accessible name per state', () => {
  it('each of the five states is a region named by its own title', () => {
    const names: string[] = [];
    for (const status of ['AVAILABLE', ...NON_AVAILABLE] as VideoStatus[]) {
      const view = renderPanel(fixtureWith(status));
      const region = view.getByRole('region');
      const name = region.getAttribute('aria-label') ?? '';
      expect(name).toBe(VIDEO_EVIDENCE_NARRATIVES[status].title);
      names.push(name);
      view.unmount();
    }
    expect(new Set(names).size).toBe(5);
  });

  it('the player is reachable by keyboard', () => {
    renderPanel(AVAILABLE);
    const video = screen.getByTestId('video-evidence-player') as HTMLVideoElement;
    // Native controls make the element operable; it must not be removed from the tab order.
    expect(video.controls).toBe(true);
    expect(video.getAttribute('tabindex')).not.toBe('-1');
  });
});

describe('Studio v1 gaps: a recording the API has no store for', () => {
  it('renders the server reason and no player, download or video URL', () => {
    // The shape ExecutionSnapshotMapper publishes when studio.execution.video-store.provider is
    // `none`: the runner recorded the run, but GET …/video could only answer 404.
    const reason = 'Recording unavailable: this deployment has no recording store the API can read.';
    const snapshot: ExecutionSnapshot = {
      ...AVAILABLE,
      video: { status: 'UNAVAILABLE', error: reason, expiresAt: null, partial: false },
      videoPath: null,
    };

    const { container } = renderPanel(snapshot);

    expect(screen.getByTestId('video-evidence-statement')).toHaveTextContent(reason);
    expect(screen.queryByTestId('video-evidence-player')).toBeNull();
    expect(screen.queryByTestId('video-evidence-download')).toBeNull();
    expect(urlsIn(container).filter((url) => VIDEO_ROUTE.test(url))).toEqual([]);
  });
});

describe('round 067 D7: a live Run with no result yet', () => {
  it('snapshot null with runInProgress shows the pending-run line and no empty state or player', () => {
    render(<VideoEvidencePanel snapshot={null} runInProgress />);
    expect(screen.getByTestId('video-evidence-pending-run')).toHaveTextContent(
      'The recording will appear here when this run ends.',
    );
    expect(screen.queryByTestId('video-evidence-empty')).toBeNull();
    expect(screen.queryByTestId('video-evidence-player')).toBeNull();
  });

  it('without the prop the empty state keeps its text', () => {
    render(<VideoEvidencePanel snapshot={null} />);
    expect(screen.getByTestId('video-evidence-empty')).toHaveTextContent(
      'No run is on screen yet, so there is no recording to show.',
    );
    expect(screen.queryByTestId('video-evidence-pending-run')).toBeNull();
  });
});
