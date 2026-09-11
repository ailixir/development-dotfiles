/**
 * The loopback fixture-page server (AC-18a, AC-19).
 *
 * `fixtures/reference/manifest.json` binds the four controlled pages to `https://example.com/...`
 * URLs. The real adapter has to reach *those pages* without reaching that host, and the story's
 * implementation notes give two ways: rewrite the URLs onto a loopback `node:http` server, or
 * fulfil the requests inside the process. This is the first, and it is the one the notes prefer,
 * because it exercises the real navigation path — a real socket, a real response, a real DOM —
 * and keeps the adapter free of a routing behaviour the validated language does not have.
 *
 * It binds `127.0.0.1:0`, so there is **no DNS lookup at all** and nothing to resolve outside the
 * machine. That is what makes AC-19's "nothing left the machine" observable by counting
 * destinations rather than by arguing about them.
 *
 * `node:http`, as the internal server does (AC-24): this story adds no dependency, and a fixture
 * server is not a reason to start.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { packageRoot } from './corpus.js';
import { loadReferenceManifest } from './reference-manifest.js';

export interface RecordedPageRequest {
  readonly method: string;
  readonly url: string;
  readonly host: string;
}

export interface PageServer {
  readonly baseUrl: string;
  readonly port: number;
  /** Every request the server actually served, in order (AC-19). */
  readonly requests: readonly RecordedPageRequest[];
  /**
   * Rewrites a manifest URL onto this server.
   *
   * The corpus is left untouched: 10.3 pinned it and `SYNTAX_REFERENCE_VERSION` is compared
   * exactly, so editing a fixture to point at loopback would be a runtime-compatibility change
   * dressed up as a test convenience.
   */
  rewrite(url: string): string;
  close(): Promise<void>;
}

const PAGES_DIRECTORY = join(packageRoot, 'fixtures', 'pages');

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

/**
 * Path → fixture file, derived from the manifest rather than restated.
 *
 * A page added to the manifest is served here without a second edit, and a page the manifest no
 * longer names stops being served — which is the direction that matters, because an orphaned
 * route is a page the corpus could reach without any test knowing.
 */
export function routeTable(): Map<string, string> {
  const manifest = loadReferenceManifest();
  const routes = new Map<string, string>();
  for (const [file, url] of Object.entries(manifest.pages)) {
    routes.set(new URL(url).pathname, file);
  }
  return routes;
}

export function startPageServer(): Promise<PageServer> {
  const routes = routeTable();
  const requests: RecordedPageRequest[] = [];

  const handler = (request: IncomingMessage, response: ServerResponse): void => {
    const url = request.url ?? '/';
    requests.push({ method: request.method ?? 'GET', url, host: request.headers.host ?? '' });

    const pathname = new URL(url, 'http://127.0.0.1').pathname;
    const file = routes.get(pathname) ?? extraPage(pathname);
    if (file === null) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not a fixture page');
      return;
    }

    const path = join(PAGES_DIRECTORY, file);
    if (!existsSync(path)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('missing fixture page');
      return;
    }
    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      // No caching: two corpus runs must see the same page for the same reason, not because one
      // of them was served from memory (AC-18a's determinism).
      'cache-control': 'no-store',
    });
    response.end(readFileSync(path));
  };

  return new Promise<PageServer>((resolve) => {
    const server: Server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${String(port)}`;
      resolve({
        baseUrl,
        port,
        requests,
        rewrite(url: string): string {
          const parsed = new URL(url);
          return `${baseUrl}${parsed.pathname}${parsed.search}`;
        },
        close(): Promise<void> {
          return new Promise<void>((done) => {
            server.close(() => {
              done();
            });
          });
        },
      });
    });
  });
}

/**
 * Pages this story adds that the pinned corpus does not reference.
 *
 * `popup.html` drives AC-15 and `timeline.html` drives AC-12a. They are deliberately **not** in
 * `fixtures/reference/manifest.json`: that manifest is the pinned syntax reference, compared
 * exactly by `src/compat`, and adding a page to it would bump `SYNTAX_REFERENCE_VERSION` and make
 * every confirmed artifact incompatible. A test page is not a language change.
 */
function extraPage(pathname: string): string | null {
  const name = pathname.replace(/^\//u, '');
  return name === 'popup.html' || name === 'timeline.html' ? name : null;
}
