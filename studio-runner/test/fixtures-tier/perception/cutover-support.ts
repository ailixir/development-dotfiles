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
import type { InvocationControl } from '../../../src/executor/observedReplay.js';
import type { Action, Observation, ObservationFact, ResolvedTarget } from '../../../src/guided/types.js';
import { createBrowserObservationSession } from '../../../src/run/browser.js';
import { observationReadProfile } from '../../../src/run/observationReadProfile.js';
import type { ObservationConfig, ObservationExport, ObservationSession, TargetInvocation, TargetInvocationResult } from '../../../src/run/observationTypes.js';

export type Operation = Action['operation'];

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
    readProfile: observationReadProfile(TEST_DOMAINS),
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

export interface Prepared {
  readonly ref: string;
  readonly resolved: ResolvedTarget;
  readonly exported: ObservationExport;
}

/** Observe, pick the one fact, prepare it for `operation` (learn): the production prepare path. */
export async function prepare(
  opened: Opened,
  role: string,
  name: string,
  operation: Operation,
  authoredLiteral: string | null = null,
  exported?: ObservationExport,
): Promise<Prepared> {
  const observed = exported ?? (await opened.session.observe(undefined, false));
  const [ref] = factOf(observed, role, name);
  const resolved = await opened.session.prepareTarget({
    ref,
    documentId: observed.observation.documentId,
    generation: observed.observation.generation,
    origin: observed.observation.origin,
    operation,
    authoredLiteral,
  });
  return { ref, resolved, exported: observed };
}

/** A control whose fence a test can observe or hook (a page mutation right after the pre-flight, for instance). */
export class TestControl implements InvocationControl {
  phase: InvocationControl['phase'] = 'PREPARING';
  readonly deadlineMs = Date.now() + 120_000;
  readonly signal = new AbortController().signal;
  fenced = 0;
  constructor(private readonly onFence: () => Promise<void> | void = () => undefined) {}
  check(): void {
    if (this.phase === 'POISONED') throw new Error('POISONED');
  }
  /**
   * The journal fence. A test hook may mutate the page here (cover the target, disable it, remove it); the executor awaits
   * the call (targetAction.performOnTarget), so the mutation has landed before the first post-fence Playwright call.
   */
  beginInvocation(): void {
    this.fenced++;
    this.phase = 'INVOKING';
    const pending: unknown = this.onFence();
    return pending as undefined;
  }
  poison(): void {
    this.phase = 'POISONED';
  }
  /** Milliseconds left on the control's own clock (the executor budgets a replay invoke from it). */
  remainingMs(): number {
    return Math.max(0, this.deadlineMs - Date.now());
  }
  reserveObservation(): (bytes: number) => void {
    return () => undefined;
  }
  waitForAdditionalObservation(): Promise<void> {
    return Promise.resolve();
  }
}

export interface InvokeOptions {
  readonly value?: string | null;
  readonly profile?: 'learn' | 'replay';
  readonly readRuleId?: string | null;
  readonly maxValueBytes?: number;
  readonly control?: TestControl;
  readonly bind?: boolean;
}

/** Invokes a prepared target through the session: the one executor of learn and replay. */
export function invoke(opened: Opened, prepared: Prepared, operation: Operation, options: InvokeOptions = {}): Promise<TargetInvocationResult> {
  const request: TargetInvocation = {
    resolved: prepared.resolved,
    operation,
    resolvedValue: options.value ?? null,
    origin: prepared.exported.observation.origin,
    maxValueBytes: options.maxValueBytes ?? 4096,
    readRuleId: options.readRuleId ?? null,
    profile: options.profile ?? 'learn',
    ...(options.bind === false ? {} : { expect: { documentId: prepared.exported.observation.documentId, generation: prepared.exported.observation.generation } }),
  };
  return opened.session.invoke(request, options.control ?? new TestControl());
}

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

/** Waits for `condition` to hold within `timeoutMs` (polling), then returns; throws otherwise. */
export async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 10_000, what = 'condition'): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}
