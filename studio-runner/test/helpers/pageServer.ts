/**
 * The loopback fixture-page server (AC-18a, AC-19).
 *
 * The four controlled pages are bound to `https://example.com/...` paths ({@link FIXTURE_PAGES});
 * a test reaches *those pages* without reaching that host by rewriting the URLs onto this
 * loopback `node:http` server, which exercises the real navigation path — a real socket, a real
 * response, a real DOM.
 *
 * It binds `127.0.0.1:0` and is reached as `localhost` (a whitelisted domain; an IP literal cannot be
 * one), which Chromium resolves to loopback itself, so there is **no DNS lookup at all** and nothing to
 * resolve outside the machine. That is what makes AC-19's "nothing left the machine" observable by counting
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
  /** Rewrites a fixture-page URL onto this server. */
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
 * Fixture file → the URL it stands for.
 *
 * Ported verbatim from the `pages` block of the deleted artifact-1 reference manifest
 * (`fixtures/reference/manifest.json`, STUDIO-OBS-012A AC-3), which is where these bindings used to
 * be read from.
 */
export const FIXTURE_PAGES: Readonly<Record<string, string>> = {
  'home.html': 'https://example.com/',
  'login.html': 'https://example.com/login',
  'dashboard.html': 'https://example.com/dashboard',
  'forms.html': 'https://example.com/forms',
};

/** Path → fixture file. */
export function routeTable(): Map<string, string> {
  const routes = new Map<string, string>();
  for (const [file, url] of Object.entries(FIXTURE_PAGES)) {
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
      // No caching: two runs must see the same page for the same reason, not because one of them
      // was served from memory (AC-18a's determinism).
      'cache-control': 'no-store',
    });
    response.end(readFileSync(path));
  };

  return new Promise<PageServer>((resolve) => {
    const server: Server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      const baseUrl = `http://localhost:${String(port)}`;
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

/** Pages served by name rather than through {@link FIXTURE_PAGES}. */
function extraPage(pathname: string): string | null {
  const name = pathname.replace(/^\//u, '');
  return name === 'popup.html' || name === 'timeline.html' || name === 'stall.html' ? name : null;
}
