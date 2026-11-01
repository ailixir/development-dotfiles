/**
 * The test's door into the guided child's page (SC008-E15). Since the browser lives in the child process, a case that used to reach for
 * `guided.handle.page` asks the child instead, over the probe socket `guidedTestChildCore.mjs` listens on. The questions are a closed set of
 * named operations (no code travels), enough for the cases that plant a page state or read a value the product deliberately never exports.
 * Only the test entries of the child have this door.
 */
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ChildPage {
  url(): Promise<string>;
  inputValue(selector: string): Promise<string>;
  count(selector: string): Promise<number>;
  /** True iff every element matching `selector` has an empty value. */
  allEmpty(selector: string): Promise<boolean>;
  remove(selector: string): Promise<void>;
  insertHtml(html: string): Promise<void>;
  /** The page's global variables by name. */
  globals(names: readonly string[]): Promise<Record<string, unknown>>;
  /** Playwright's own error message for a click on `selector` that cannot complete in `timeoutMs`; the empty string when it completes. */
  clickError(selector: string, timeoutMs: number): Promise<string>;
  /** Inserts a copy of the label around `selector` after it, carrying `twinId`: two matches for what was one. */
  duplicateLabelOf(selector: string, twinId: string): Promise<void>;
  close(): void;
}

/** The temporary root the launcher makes the child's private directory in (its default: `TMPDIR`). */
const tmpRoot = (): string => process.env.TMPDIR ?? tmpdir();

/**
 * Connects to the probe of the newest child this process forked that answers, waiting up to `waitMs` for one. A child that was killed leaves its
 * socket file behind until it is removed here, so a refused connection means a dead child and is skipped.
 */
export async function childPage(waitMs = 10_000): Promise<ChildPage> {
  const prefix = `guided-probe-${String(process.pid)}-`;
  const deadline = Date.now() + waitMs;
  let path: string | undefined;
  let socket: Socket | undefined;
  while (socket === undefined) {
    const names = (await readdir(tmpRoot())).filter((name) => name.startsWith(prefix) && name.endsWith('.sock'));
    const dated = await Promise.all(names.map(async (name) => ({ path: join(tmpRoot(), name), at: (await stat(join(tmpRoot(), name)).catch(() => null))?.mtimeMs ?? 0 })));
    for (const candidate of dated.sort((a, b) => b.at - a.at)) {
      const connection = createConnection(candidate.path);
      const live = await new Promise<boolean>((resolve) => { connection.once('connect', () => { resolve(true); }); connection.once('error', () => { resolve(false); }); });
      if (live) { socket = connection; path = candidate.path; break; }
      await rm(candidate.path, { force: true });
    }
    if (socket === undefined) {
      if (Date.now() > deadline) throw new Error('CHILD_PROBE_NOT_FOUND');
      await new Promise<void>((resolve) => { setTimeout(resolve, 50); });
    }
  }
  const probe: Socket = socket;
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let text = '';
  let nextId = 1;
  probe.on('data', (chunk: Buffer) => {
    text += chunk.toString();
    for (let end = text.indexOf('\n'); end >= 0; end = text.indexOf('\n')) {
      const reply = JSON.parse(text.slice(0, end)) as { id: number; ok: boolean; value?: unknown; message?: string };
      text = text.slice(end + 1);
      const entry = waiting.get(reply.id);
      waiting.delete(reply.id);
      if (reply.ok) entry?.resolve(reply.value); else entry?.reject(new Error(reply.message ?? 'CHILD_PROBE_FAILED'));
    }
  });
  probe.on('error', () => undefined);
  probe.on('close', () => { for (const entry of waiting.values()) entry.reject(new Error('CHILD_PROBE_CLOSED')); waiting.clear(); if (path !== undefined) void rm(path, { force: true }); });
  const ask = <T>(request: Record<string, unknown>): Promise<T> => new Promise<T>((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve: (value) => { resolve(value as T); }, reject });
    probe.write(`${JSON.stringify({ id, ...request })}\n`);
  });
  return {
    url: () => ask<string>({ op: 'url' }),
    inputValue: (selector) => ask<string>({ op: 'inputValue', selector }),
    count: (selector) => ask<number>({ op: 'count', selector }),
    allEmpty: (selector) => ask<boolean>({ op: 'allEmpty', selector }),
    remove: async (selector) => { await ask<null>({ op: 'remove', selector }); },
    insertHtml: async (html) => { await ask<null>({ op: 'insertHtml', html }); },
    globals: (names) => ask<Record<string, unknown>>({ op: 'globals', names }),
    clickError: (selector, timeoutMs) => ask<string>({ op: 'clickError', selector, timeoutMs }),
    duplicateLabelOf: async (selector, twinId) => { await ask<null>({ op: 'duplicateLabelOf', selector, twinId }); },
    close: () => { probe.destroy(); },
  };
}
