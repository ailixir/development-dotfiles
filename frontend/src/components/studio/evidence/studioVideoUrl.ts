import { APP_CONFIG } from '@/utils/constants/appConfig';

/**
 * The playback URL for `getExecutionVideo` (story 10.16a, AC-6, AC-7).
 *
 * The server publishes `videoPath` **already carrying the `/api/v1` base**
 * (`/api/v1/studio/executions/{id}/video`, asserted in `studioContract.test.ts`). Two plausible
 * constructions are both wrong:
 *
 *  - `` `${apiBaseUrl}${videoPath}` `` doubles the base in every configuration;
 *  - `videoPath` used as a relative `src` resolves against the MFE's own origin, which is the wrong
 *    host whenever `apiBaseUrl` is an absolute URL on another host, as the Helm values deploy it.
 *
 * So the URL is the **origin** of `APP_CONFIG.apiBaseUrl` (resolved against the page when the base
 * is path-only) followed by `videoPath` verbatim. `videoPath`'s segments are never re-composed.
 *
 * This builder takes `videoPath` and nothing else. It reads no token, storage or session source,
 * and adds no query parameter at all (SPK-02: *"must not add token query parameters"*). The
 * request is a native `<video src>`, so the ambient session is what authorizes it (architecture
 * §6.3).
 *
 * There is no download URL. The download affordance was retired at the product owner's request,
 * because the native player's own controls already offer one, and that one fetches this same
 * `src`. The route's `?download=true` contract (`openapi.yaml`) is unchanged; this module simply
 * composes no URL that uses it.
 *
 * A reverse-proxy path prefix on `apiBaseUrl` (e.g. `https://h/prefix/api/v1`) is not supported by a
 * server-published path rooted at `/api/v1`. That is a contract question for @architect (story
 * 10.16, D-3), and this module does not work around it.
 */

/** A server-published path this module can use: rooted, not protocol-relative, no query or fragment. */
const USABLE_VIDEO_PATH = /^\/(?!\/)[^?#]*$/u;

function assertUsableVideoPath(videoPath: string): void {
  if (!USABLE_VIDEO_PATH.test(videoPath)) {
    throw new Error(
      `videoPath "${videoPath}" is not a rooted API path; the contract publishes only ` +
        '/api/v1/studio/executions/{id}/video, and anything else is not composed into a URL.',
    );
  }
}

function apiOrigin(): string {
  return new URL(APP_CONFIG.apiBaseUrl, window.location.href).origin;
}

/** The `<video src>`. No query parameters. */
export function studioVideoUrl(videoPath: string): string {
  assertUsableVideoPath(videoPath);
  return `${apiOrigin()}${videoPath}`;
}
