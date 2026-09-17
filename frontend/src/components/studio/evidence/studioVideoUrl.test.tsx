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

async function renderedUrls(base: string): Promise<{ src: string; href: string }> {
  const { React, rtl, VideoEvidencePanel } = await loadWithBase(base);
  const { container } = rtl.render(React.createElement(VideoEvidencePanel, { snapshot: available }));
  const videos = container.querySelectorAll('video');
  expect(videos).toHaveLength(1);
  const anchor = container.querySelector('a[data-testid="video-evidence-download"]');
  expect(anchor).not.toBeNull();
  return { src: videos[0].src, href: (anchor as HTMLAnchorElement).href };
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

describe('AC-6: the URL is the API origin followed by videoPath, verbatim', () => {
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
  });

  it.each(CASES)('$name: the rendered <video src> and download href', async ({ base, expectedOrigin }) => {
    const { src, href } = await renderedUrls(base);
    expect(src).toBe(`${expectedOrigin()}${VIDEO_PATH}`);
    expect(href).toBe(`${expectedOrigin()}${VIDEO_PATH}?download=true`);
    expect(src.match(/\/api\/v1/gu)).toHaveLength(1);
  });

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
  });
});

describe('AC-7: no credential in a query string — playback has no query keys, download has exactly one', () => {
  it.each(CASES)('$name: the constructed URLs’ query key sets', async ({ base }) => {
    const { urls } = await loadWithBase(base);

    const playback = new URL(urls.studioVideoUrl(VIDEO_PATH));
    expect([...playback.searchParams.keys()]).toEqual([]);
    expect(playback.search).toBe('');

    const download = new URL(urls.studioVideoDownloadUrl(VIDEO_PATH));
    expect([...download.searchParams.keys()]).toEqual(['download']);
    expect(download.searchParams.get('download')).toBe('true');
  });

  it.each(CASES)('$name: the rendered URLs’ query key sets', async ({ base }) => {
    const { src, href } = await renderedUrls(base);
    expect([...new URL(src).searchParams.keys()]).toEqual([]);
    const download = new URL(href);
    expect([...download.searchParams.keys()]).toEqual(['download']);
    expect(download.searchParams.get('download')).toBe('true');
  });

  it('the builders take videoPath and nothing else', async () => {
    // The "reads no token, storage or session source" half is a review item (Dev Agent Record).
    const { urls } = await loadWithBase(PATH_ONLY_BASE);
    expect(urls.studioVideoUrl.length).toBe(1);
    expect(urls.studioVideoDownloadUrl.length).toBe(1);
  });
});
