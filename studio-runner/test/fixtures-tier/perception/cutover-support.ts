/**
 * Shared support of the WI-4 cut-over tests of the perception tier (ADR-SC-007 WI-4): a loopback page server, the
 * real observation session of the runner over a real Chromium page, ref lookup in a wire observation, and an
 * invocation control whose journal fence a test can hook.
 *
 * Nothing here is production code. The session is the production one (`createBrowserObservationSession`), so a
 * test through this module proves the real prepare -> invoke path, with no dist and no child process.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, Page } from 'playwright';

import { TEST_DOMAINS } from '../../helpers/allowedDomains.js';
import type { Observation, ObservationFact } from '../../../src/guided/types.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Scope } from '../../../src/executor/observedOperations.js';
import { createBrowserObservationSession } from '../../../src/run/browser.js';
import type { BrowserHandle } from '../../../src/run/browserFactory.js';
import { newTally, performStep } from '../../../src/run/observedReplayAdapter.js';
import type { StepOutcome } from '../../../src/run/observedReplayAdapter.js';
import { coordinate, openControl, operation } from '../../helpers/stepFakes.js';
import { playwrightBrowserFactory } from '../preparedBrowser.js';
import type { ObservationConfig, ObservationExport, ObservationSession } from '../../../src/run/observationTypes.js';

export interface Served {
  readonly origin: string;
  /** Every request path the server answered, in order. */
  readonly hits: string[];
  close(): Promise<void>;
}

export type Route = string | ((request: IncomingMessage, response: ServerResponse) => void | Promise<void>);

/** A loopback server reached as `localhost` (a whitelisted domain). A string route is an HTML page. */
export async function serve(routes: Readonly<Record<string, Route>>): Promise<Served> {
  const hits: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    hits.push(path);
    const route = routes[path];
    if (route === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    if (typeof route === 'string') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(route);
      return;
    }
    void Promise.resolve(route(request, response)).catch(() => {
      response.destroy();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://localhost:${String(port)}`,
    hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** An HTML document around a body. */
export const html = (body: string, head = ''): string => `<!doctype html><html><head><title>Operations</title>${head}</head><body>${body}</body></html>`;

export function sessionConfig(over: Partial<ObservationConfig> = {}): ObservationConfig {
  return {
    sessionId: 'cutover-session',
    scopeHash: 'a'.repeat(64),
    allowedDomains: TEST_DOMAINS,
    knownSecrets: [],
    ...over,
  };
}

export interface Opened {
  readonly page: Page;
  readonly session: ObservationSession;
  readonly origin: string;
  close(): Promise<void>;
}

/** A fresh context and page on `path` of the server and the production observation session over it. */
export async function open(browser: Browser, served: Served, path: string, config: Partial<ObservationConfig> = {}): Promise<Opened> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${served.origin}${path}`);
  const session = createBrowserObservationSession(page, sessionConfig(config));
  return {
    page,
    session,
    origin: served.origin,
    close: async () => {
      await session.dispose().catch(() => undefined);
      await context.close();
    },
  };
}

/** [ref, fact] of the one fact with this role and name; throws with the outline when there is not exactly one. */
export function factOf(exported: ObservationExport, role: string, name: string): [string, ObservationFact] {
  const found = Object.entries(exported.observation.facts).filter(([, fact]) => fact.role === role && fact.name === name);
  if (found.length !== 1 || found[0] === undefined) {
    throw new Error(`expected one ${role} "${name}", found ${String(found.length)} in:\n${exported.observation.outline}`);
  }
  return found[0];
}

export const hasFact = (exported: ObservationExport, role: string, name: string): boolean =>
  Object.values(exported.observation.facts).some((fact) => fact.role === role && fact.name === name);

/** The refs the outline shows (`[eN]`), in order. */
export const shownRefs = (observation: Observation): string[] => [...observation.outline.matchAll(/\[(e\d+)\]/gu)].map((match) => match[1] ?? '');

/** The error a promise rejects with (a ClosedActionError for every boundary), or null. */
export async function rejection(work: Promise<unknown>): Promise<Error | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** `{ message, code }` of a rejection, for compact assertions. */
export async function codeOf(work: Promise<unknown>): Promise<string | null> {
  const error = await rejection(work);
  return error === null ? null : error.message;
}

/** One real recorded browser the way the replay child gets it (step api, popup registry, document counter), and the real observation session over it. */
export interface StepRun {
  readonly handle: BrowserHandle;
  readonly session: ObservationSession;
  step(code: string, parts?: { readonly captures?: readonly string[]; readonly inputs?: Readonly<Record<string, string>>; readonly remainingMs?: number; readonly vars?: Readonly<Record<string, string>>; readonly uses?: readonly { readonly kind: 'input' | 'secret' | 'binding'; readonly id: string }[] }): Promise<StepOutcome>;
  dispose(): Promise<void>;
}
const stepScratches: string[] = [];
export async function launchStepRun(allowedDomains: readonly string[] = TEST_DOMAINS): Promise<StepRun> {
  const scratch = await mkdtemp(join(tmpdir(), 'step-run-'));
  stepScratches.push(scratch);
  const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['step'], initialContext: { kind: 'initialBlank' } };
  const handle = await playwrightBrowserFactory.launch({ allowedDomains, browser: 'chromium', viewport: { width: 1280, height: 720 }, recording: { width: 640, height: 480 }, scratchPath: scratch, observedScope: scope });
  const session = handle.createObservationSession?.({ sessionId: 'step-run', scopeHash: '0'.repeat(64), allowedDomains, knownSecrets: [] });
  if (!session || !handle.stepApi) throw new Error('HANDLE');
  const host = handle.stepApi;
  let n = 0;
  return {
    handle, session,
    step: (code, parts = {}) => performStep(host, session, { coordinate: coordinate(`step-${String(n++)}`), operation: operation(code, { ...(parts.captures === undefined ? {} : { captures: [...parts.captures] }), ...(parts.uses === undefined ? {} : { uses: [...parts.uses] }) }), inputs: parts.inputs ?? {}, vars: parts.vars ?? {}, secretIds: [], control: openControl({ remainingMs: parts.remainingMs ?? 20_000 }), tally: newTally(), allowedDomains }),
    dispose: async () => { await session.dispose(); await handle.dispose(); await rm(scratch, { recursive: true, force: true }); },
  };
}

/** Waits for `condition` to hold within `timeoutMs` (polling), then returns; throws otherwise. */
export async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 10_000, what = 'condition'): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}
