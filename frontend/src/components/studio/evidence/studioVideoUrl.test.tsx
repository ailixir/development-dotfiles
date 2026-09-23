import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockExecutions } from '@/services/mocks/studio/fixtures';

/**
 * Story 10.16a — **AC-6** and **AC-7**, over two configured bases.
 *
 * `APP_CONFIG.apiBaseUrl` is read once, at module load. So each case sets the base the way a build
 * does (`REACT_APP_API_BASE_URL`), resets the module registry and imports the builder, the panel,
 * React and Testing Library fresh — 10.11a AC-20(a)'s method. Each case is asserted twice: on the
 * string the builder constructs, and on the `src`/`href` the rendered panel carries. The second is
 * what catches `src={videoPath}`, the relative path the legacy player used: it passes the
 * path-only base and fails the cross-host one.
 */

const CROSS_HOST_BASE = 'https://api.example.internal/api/v1';
const PATH_ONLY_BASE = '/api/v1';

const available = mockExecutions.find(
  (execution) => execution.video.status === 'AVAILABLE' && execution.videoPath !== null,
)!;
const VIDEO_PATH = available.videoPath!;

const previousBase = process.env.REACT_APP_API_BASE_URL;

/**
 * REL-004: every test that calls `loadWithBase` gets this bound instead of Vitest's 5 s default.
 *
 * After `vi.resetModules()` the first such test imports the panel's whole module graph (MUI
 * included) from scratch. Run alone at load 7–9 that took about 0.5 s. In @qa's full-suite runs
 * it took 1151–3206 ms, and once, at load 17, 5121 ms, which timed out. The row that runs first is
 * the slow one, and under `-t` that can be any row, so every row gets the bound. 30 s is about six
 * times the slowest measured. Only the time allowed changes: no assertion is removed or loosened.
 */
const FRESH_IMPORT_TIMEOUT_MS = 30_000;

afterEach(async () => {
  if (previousBase === undefined) {
    delete process.env.REACT_APP_API_BASE_URL;
  } else {
    process.env.REACT_APP_API_BASE_URL = previousBase;
  }
  const rtl = await import('@testing-library/react');
  rtl.cleanup();
  vi.resetModules();
});

async function loadWithBase(base: string) {
  process.env.REACT_APP_API_BASE_URL = base;
  vi.resetModules();
  const urls = await import('./studioVideoUrl');
  const { APP_CONFIG } = await import('@/utils/constants/appConfig');
  const React = await import('react');
  const rtl = await import('@testing-library/react');
  const { VideoEvidencePanel } = await import('./VideoEvidencePanel');
  return { urls, APP_CONFIG, React, rtl, VideoEvidencePanel };
}

async function renderedUrls(base: string): Promise<{ src: string }> {
  const { React, rtl, VideoEvidencePanel } = await loadWithBase(base);
  const { container } = rtl.render(React.createElement(VideoEvidencePanel, { snapshot: available }));
  const videos = container.querySelectorAll('video');
  expect(videos).toHaveLength(1);
  // The download affordance was retired: the player's own controls offer it, so a second
  // link on the same bytes was one more thing to keep correct for no reader benefit.
  expect(container.querySelector('a[data-testid="video-evidence-download"]')).toBeNull();
  return { src: videos[0].src };
}

const CASES = [
  {
    name: '(i) the default path-only base',
    base: PATH_ONLY_BASE,
    expectedOrigin: () => window.location.origin,
  },
  {
    name: '(ii) an absolute cross-host base',
    base: CROSS_HOST_BASE,
    expectedOrigin: () => 'https://api.example.internal',
  },
] as const;

/**
 * AC-6 names two cases, and these are they. The list is declared apart from `CASES` on purpose.
 *
 * `it.each` rows disappear when they are deleted instead of failing (shape #18). @qa deleted case
 * (ii) from `CASES`, applied the page-origin bug, and every test stayed green: case (ii) is the only
 * row that tells the right origin from the page's. So each row's kind is **derived from its base**,
 * not from its name, and the derived kinds are compared with this list in both directions. The
 * number of rows is checked as well.
 *
 * Do not "simplify" this by deriving the list from `CASES`. That refactor reopens the hole.
 */
const AC6_REQUIRED_KINDS = ['path-only base, page origin', 'absolute base, another host'] as const;

function kindOf(base: string): string {
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//iu.test(base);
  const sameOrigin = new URL(base, window.location.href).origin === window.location.origin;
  if (!absolute && sameOrigin) return 'path-only base, page origin';
  if (absolute && !sameOrigin) return 'absolute base, another host';
  return `unclassified (absolute=${absolute}, sameOrigin=${sameOrigin})`;
}

describe('AC-6: the URL is the API origin followed by videoPath, verbatim', () => {
  it('the case table holds exactly AC-6’s two named cases, judged by their bases (TEST-002)', () => {
    const kinds = CASES.map((row) => kindOf(row.base));
    expect([...new Set(kinds)].sort()).toEqual([...AC6_REQUIRED_KINDS].sort());
    expect(CASES).toHaveLength(AC6_REQUIRED_KINDS.length);
    // A row's expected origin is the origin its base really resolves to. So a row cannot keep a
    // cross-host label while testing the page origin, and it cannot do the opposite either.
    for (const row of CASES) {
      expect(row.expectedOrigin(), row.name).toBe(new URL(row.base, window.location.href).origin);
    }
  });

  it('the fixture path already carries the base, which is what makes concatenation wrong', () => {
    expect(VIDEO_PATH.startsWith(`${PATH_ONLY_BASE}/`)).toBe(true);
    // The two origins differ, so a relative src cannot satisfy both cases.
    expect(window.location.origin).not.toBe('https://api.example.internal');
  });

  it.each(CASES)('$name: the constructed playback URL', async ({ base, expectedOrigin }) => {
    const { urls, APP_CONFIG } = await loadWithBase(base);
    // The configuration really changed; otherwise both cases would test one base.
    expect(APP_CONFIG.apiBaseUrl).toBe(base);

    const url = urls.studioVideoUrl(VIDEO_PATH);
    expect(url).toBe(`${expectedOrigin()}${VIDEO_PATH}`);
    expect(url.match(/\/api\/v1/gu)).toHaveLength(1);
  }, FRESH_IMPORT_TIMEOUT_MS);

  it.each(CASES)('$name: the rendered <video src>', async ({ base, expectedOrigin }) => {
    const { src } = await renderedUrls(base);
    expect(src).toBe(`${expectedOrigin()}${VIDEO_PATH}`);
    expect(src.match(/\/api\/v1/gu)).toHaveLength(1);
  }, FRESH_IMPORT_TIMEOUT_MS);

  it('a videoPath that is not a rooted API path is refused rather than composed', async () => {
    const { urls } = await loadWithBase(PATH_ONLY_BASE);
    for (const bad of [
      'https://storage.example/bucket/key.webm',
      '//storage.example/key.webm',
      'api/v1/studio/executions/x/video',
      '/api/v1/studio/executions/x/video?token=abc',
    ]) {
      expect(() => urls.studioVideoUrl(bad), bad).toThrow(/not a rooted API path/u);
    }
  }, FRESH_IMPORT_TIMEOUT_MS);
});

describe('AC-7: no credential in a query string — the playback URL carries no query at all', () => {
  it.each(CASES)('$name: the constructed URL’s query key set', async ({ base }) => {
    const { urls } = await loadWithBase(base);

    const playback = new URL(urls.studioVideoUrl(VIDEO_PATH));
    expect([...playback.searchParams.keys()]).toEqual([]);
    expect(playback.search).toBe('');
  }, FRESH_IMPORT_TIMEOUT_MS);

  it.each(CASES)('$name: the rendered URL’s query key set', async ({ base }) => {
    const { src } = await renderedUrls(base);
    expect([...new URL(src).searchParams.keys()]).toEqual([]);
  }, FRESH_IMPORT_TIMEOUT_MS);

  it('the builder takes videoPath and nothing else', async () => {
    // The "reads no token, storage or session source" half is a review item (Dev Agent Record).
    const { urls } = await loadWithBase(PATH_ONLY_BASE);
    expect(urls.studioVideoUrl.length).toBe(1);
  }, FRESH_IMPORT_TIMEOUT_MS);
});
