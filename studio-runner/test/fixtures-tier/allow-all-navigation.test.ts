/**
 * The allow-all option (`STUDIO_RUNNER_ALLOW_ALL_DOMAINS`) in real Chromium: with it on, the guided
 * browser navigates to, observes and hops between hosts that are on no list; with it off the same
 * host is refused. What the option does not open is also pinned: IP literals and userinfo.
 *
 * The "other hosts" are `*.localhost` names: Chromium resolves them to loopback, so the fixture
 * server answers them while no list names them. The list used for the off case is `example.test`.
 */
// eslint-disable-next-line no-restricted-imports -- Real Chromium fixture types; production import remains browser.ts only.
import type { Page } from 'playwright';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ALL_DOMAINS } from '../../src/allowedDomains.js';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';

let server: Server, port = 0;
const hosts: string[] = [];
const OTHER = (): string => `http://shop.other.localhost:${String(port)}`;
const SECOND = (): string => `http://second.localhost:${String(port)}`;

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://x');
    if (url.pathname !== '/favicon.ico') hosts.push(`${(request.headers.host ?? '').split(':')[0] ?? ''}${url.pathname}`);
    const html = (body: string): void => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(body); };
    if (url.pathname === '/app') { html(`<title>App</title><main><a href="${SECOND()}/next">Next</a></main>`); return; }
    if (url.pathname === '/next') { html('<title>Next</title><main><p>Second host</p></main>'); return; }
    response.writeHead(404); response.end();
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('PORT');
  port = address.port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => { server.close(() => { resolve(); }); });
});
afterEach(() => { hosts.length = 0; });

const config = (domains: readonly string[]) => ({ sessionId: 'allow-all', scopeHash: 'a'.repeat(64), allowedDomains: domains, knownSecrets: [] });
const pageOf = (browser: GuidedBrowser): Page => {
  if (browser.handle === undefined) throw new Error('HANDLE');
  return browser.handle.page as unknown as Page;
};

describe('allow-all navigation in the guided browser', () => {
  let guided: GuidedBrowser | undefined;
  afterEach(async () => { await guided?.close().catch(() => undefined); guided = undefined; });

  it('is refused for a host on no list when the option is off, before any request', async () => {
    guided = await launchGuidedBrowser(config(['example.test']), 'context', () => undefined);
    await expect(guided.navigateBlank(`${OTHER()}/app`)).rejects.toThrow('POLICY_DENIED');
    expect(hosts).toEqual([]);
  });

  it('navigates to and observes a host on no list when the option is on, and keeps observing after a hop to a second one', async () => {
    guided = await launchGuidedBrowser(config(ALL_DOMAINS), 'context', () => undefined);
    await guided.navigateBlank(`${OTHER()}/app`);
    const first = await guided.observations.observe();
    expect(first.observation.origin).toBe(OTHER());
    await pageOf(guided).click('a');
    await pageOf(guided).waitForURL(`${SECOND()}/next`);
    const second = await guided.observations.observe();
    expect(second.observation.origin).toBe(SECOND());
    expect(hosts).toEqual(['shop.other.localhost/app', 'second.localhost/next']);
  });

  it('still refuses an IP literal and userinfo', async () => {
    guided = await launchGuidedBrowser(config(ALL_DOMAINS), 'context', () => undefined);
    for (const destination of [`http://127.0.0.1:${String(port)}/app`, `http://user@shop.other.localhost:${String(port)}/app`, 'ftp://example.org/', 'javascript:alert(1)']) {
      await expect(guided.navigateBlank(destination), destination).rejects.toThrow('POLICY_DENIED');
    }
    expect(hosts).toEqual([]);
  });
});
