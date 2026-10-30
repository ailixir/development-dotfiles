/* eslint-disable no-restricted-syntax -- SPK-07 harness tests (not shipped): dynamic import of repository-owned evaluation modules at constant paths, so no .d.mts declaration files are needed; no artifact content reaches a loader. */
/**
 * SPK-07 workstream A: the Vertex client never writes the bearer token anywhere, enforces its hard caps without touching the
 * network, retries only definite-transient failures twice (2 s, 4 s), and records usage + modelVersion but never bodies.
 * fetch and the gcloud call are injected; no network, no gcloud.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Usage { prompt: number; out: number; thoughts: number; total: number | null }
interface Result { status: number; reply: unknown; rawText: string; usage: Usage | null; modelVersion: string | null; ms: number; error: string | null }
interface Hooks { random?: () => number; fetch?: (url: string, init: { headers: Record<string, string>; body: string }) => Promise<{ status: number; text(): Promise<string> }>; execFile?: () => string; sleep?: (ms: number) => Promise<void>; now?: () => number }
interface Vertex {
  send(body: unknown, options?: { label?: string; maxPromptTokens?: number }): Promise<Result>; _setHooks(hooks?: Hooks): void; counters(): { calls: number; promptTokens: number; dir: string };
  withInlineImages(body: { contents: { parts: unknown[] }[] }, images: { mimeType: string; base64: string }[]): { contents: { parts: unknown[] }[] }; ENDPOINT: string; TOKEN_TTL_MS: number;
}
const vertex = (await import(new URL('../../evaluation/grounding/lib/vertex.mjs', import.meta.url).href)) as Vertex;

const TOKEN = 'ya29.SECRET-TOKEN-do-not-leak-0123456789';
const BODY = { contents: [{ parts: [{ text: 'hello' }], role: 'user' }], generationConfig: { maxOutputTokens: 4096 } };
const ok = (prompt = 100, text = '{"kind":"NEXT_ACTION","status":"COMPLETE"}') => ({ status: 200, text: () => Promise.resolve(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: prompt, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: prompt + 25 }, modelVersion: 'gemini-3.8-flash' })) });
const status = (code: number, message = 'nope', retryAfter?: string) => ({ status: code, headers: { get: (name: string) => (name === 'retry-after' ? (retryAfter ?? null) : null) }, text: () => Promise.resolve(JSON.stringify({ error: { message } })) });

let dir: string; const saved: Record<string, string | undefined> = {};
const ENV = ['SPK07_RUN_ID', 'SPK07_RUNS_DIR', 'SPK07_MAX_CALLS', 'SPK07_MAX_PROMPT_TOKENS_TOTAL', 'SPK07_KEEP_BODIES'];
beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
  dir = mkdtempSync(join(tmpdir(), 'spk07-vertex-'));
  process.env.SPK07_RUNS_DIR = dir; process.env.SPK07_RUN_ID = 'run1'; process.env.SPK07_MAX_CALLS = '50'; process.env.SPK07_MAX_PROMPT_TOKENS_TOTAL = '1000000'; process.env.SPK07_KEEP_BODIES = '';
});
afterEach(() => {
  for (const key of ENV) { const value = saved[key]; if (value === undefined) Reflect.deleteProperty(process.env, key); else process.env[key] = value; }
  vertex._setHooks(); rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks();
});
const filesUnder = (root: string): string[] => readdirSync(root).flatMap(name => { const path = join(root, name); return statSync(path).isDirectory() ? filesUnder(path) : [path]; });
const records = () => readFileSync(join(dir, 'run1', 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);

describe('token hygiene', () => {
  it('sends the bearer token but never prints, logs, records or returns it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const seen: string[] = [];
    vertex._setHooks({ execFile: () => `${TOKEN}\n`, fetch: (_url, init) => { seen.push(init.headers.authorization ?? ''); return Promise.resolve(ok()); } });
    process.env.SPK07_KEEP_BODIES = '1';
    const result = await vertex.send(BODY, { label: 'unit' });
    await vertex.send(BODY, { label: 'unit2' });
    expect(seen).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]); // it IS used on the wire
    const everything = [JSON.stringify(result), ...filesUnder(dir).map(file => readFileSync(file, 'utf8')), JSON.stringify([log.mock.calls, error.mock.calls, warn.mock.calls])].join('\n');
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain('ya29');
    expect(everything).not.toContain('Bearer');
  });

  it('a failing gcloud call yields a closed code, not the tool output', async () => {
    const fetchSpy = vi.fn();
    vertex._setHooks({ execFile: () => { throw new Error(`gcloud said ${TOKEN}`); }, fetch: fetchSpy });
    const result = await vertex.send(BODY);
    expect(result.error).toBe('ADC_TOKEN_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(readFileSync(join(dir, 'run1', 'calls.jsonl'), 'utf8')).not.toContain(TOKEN);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an upstream error body that echoes the token is scrubbed before it is recorded or returned', async () => {
    vertex._setHooks({ execFile: () => TOKEN, fetch: () => Promise.resolve(status(400, `bad credential ${TOKEN}`)) });
    const result = await vertex.send(BODY);
    expect(result.status).toBe(400);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(readFileSync(join(dir, 'run1', 'calls.jsonl'), 'utf8')).not.toContain(TOKEN);
  });

  it('caches the token for ~25 minutes, then asks gcloud again', async () => {
    let clock = 1_000_000; const exec = vi.fn(() => TOKEN);
    vertex._setHooks({ execFile: exec, fetch: () => Promise.resolve(ok()), now: () => clock });
    await vertex.send(BODY); await vertex.send(BODY);
    expect(exec).toHaveBeenCalledTimes(1);
    clock += vertex.TOKEN_TTL_MS + 1;
    await vertex.send(BODY);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe('records', () => {
  it('writes usage and modelVersion per call, never the request body or the reply text; bodies only when asked', async () => {
    vertex._setHooks({ execFile: () => TOKEN, fetch: () => Promise.resolve(ok(321, '{"kind":"NEXT_ACTION","status":"COMPLETE","marker":"REPLY-TEXT-MARKER"}')) });
    const result = await vertex.send({ ...BODY, secretMarker: 'BODY-MARKER' }, { label: 'rec' });
    expect(result.usage).toEqual({ prompt: 321, out: 20, thoughts: 5, total: 346 });
    expect(result.modelVersion).toBe('gemini-3.8-flash');
    expect(result.reply).toMatchObject({ status: 'COMPLETE' });
    expect(result.rawText).not.toContain('thinking'); // thought parts are not part of the reply
    const [record] = records();
    expect(record).toMatchObject({ label: 'rec', status: 200, usage: { prompt: 321 }, modelVersion: 'gemini-3.8-flash', error: null });
    const text = readFileSync(join(dir, 'run1', 'calls.jsonl'), 'utf8');
    expect(text).not.toContain('BODY-MARKER'); expect(text).not.toContain('REPLY-TEXT-MARKER');
    expect(filesUnder(dir).some(file => file.includes('bodies'))).toBe(false);
    process.env.SPK07_KEEP_BODIES = '1';
    await vertex.send({ ...BODY, secretMarker: 'BODY-MARKER' });
    const kept = filesUnder(join(dir, 'run1', 'bodies'));
    expect(kept.length).toBe(1);
    expect(readFileSync(kept[0] ?? '', 'utf8')).toContain('BODY-MARKER');
  });

  it('adds inline image parts for workstream B without mutating the original body', () => {
    const withImage = vertex.withInlineImages(BODY, [{ mimeType: 'image/png', base64: 'AAAA' }]);
    expect(withImage.contents[0]?.parts).toEqual([{ text: 'hello' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }]);
    expect(BODY.contents[0]?.parts.length).toBe(1);
  });
});

describe('hard caps', () => {
  it('SPK07_MAX_CALLS stops further calls without a network request, and holds across processes (counted from calls.jsonl)', async () => {
    process.env.SPK07_MAX_CALLS = '2';
    const fetchSpy = vi.fn(() => Promise.resolve(ok()));
    vertex._setHooks({ execFile: () => TOKEN, fetch: fetchSpy });
    expect((await vertex.send(BODY)).status).toBe(200);
    expect((await vertex.send(BODY)).status).toBe(200);
    const refused = await vertex.send(BODY);
    expect(refused).toMatchObject({ status: 0, error: 'CAP_MAX_CALLS' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vertex._setHooks({ execFile: () => TOKEN, fetch: fetchSpy }); // a new process: state is rebuilt from the run directory
    expect((await vertex.send(BODY)).error).toBe('CAP_MAX_CALLS');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(vertex.counters().calls).toBe(2);
  });

  it('SPK07_MAX_PROMPT_TOKENS_TOTAL stops once the recorded prompt tokens reach the cap', async () => {
    process.env.SPK07_MAX_PROMPT_TOKENS_TOTAL = '1000';
    const fetchSpy = vi.fn(() => Promise.resolve(ok(600)));
    vertex._setHooks({ execFile: () => TOKEN, fetch: fetchSpy });
    expect((await vertex.send(BODY)).status).toBe(200); // 600 < 1000
    expect((await vertex.send(BODY)).status).toBe(200); // 1200 recorded now
    expect((await vertex.send(BODY)).error).toBe('CAP_MAX_PROMPT_TOKENS_TOTAL');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('a per-call prompt cap refuses an oversized body before any request, and flags an over-cap response', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(ok(5000)));
    vertex._setHooks({ execFile: () => TOKEN, fetch: fetchSpy });
    const refused = await vertex.send({ ...BODY, pad: 'x'.repeat(30000) }, { maxPromptTokens: 1000 });
    expect(refused.error).toBe('CAP_PER_CALL_ESTIMATE'); expect(fetchSpy).not.toHaveBeenCalled();
    const sent = await vertex.send(BODY, { maxPromptTokens: 1000 });
    expect(sent.status).toBe(200);
    expect(records().at(-1)).toMatchObject({ overPromptCap: true });
  });

  it('every HTTP attempt counts toward SPK07_MAX_CALLS, retries included', async () => {
    process.env.SPK07_MAX_CALLS = '2';
    const fetchSpy = vi.fn(() => Promise.resolve(status(503)));
    vertex._setHooks({ execFile: () => TOKEN, fetch: fetchSpy, sleep: () => Promise.resolve() });
    const result = await vertex.send(BODY);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.error).toBe('CAP_MAX_CALLS');
  });
});

describe('retries', () => {
  it('retries 429 then 503 with exponential backoff and jitter (harness policy), then succeeds, recording attempts and retriedFor', async () => {
    const sleeps: number[] = [];
    const answers = [status(429), status(503), ok()];
    vertex._setHooks({ execFile: () => TOKEN, random: () => 0.5, fetch: () => Promise.resolve(answers.shift() ?? ok()), sleep: ms => { sleeps.push(ms); return Promise.resolve(); } });
    const result = await vertex.send(BODY);
    expect(result.status).toBe(200);
    expect(sleeps).toEqual([5000, 10000]); // jitter 0.5 -> factor 1.0
    expect(records().map(r => r.status)).toEqual([429, 503, 200]);
    expect(records().map(r => r.attempts)).toEqual([1, 2, 3]);
    expect(records().map(r => r.retriedFor)).toEqual([[], [429], [429, 503]]);
  });

  it('keeps jitter within +-20% and walks the 5/10/20/40/60/60 s schedule, then gives up after six retries (7 calls)', async () => {
    for (const [random, factor] of [[0, 0.8], [1, 1.2]] as const) {
      process.env.SPK07_RUN_ID = `jitter-${String(factor)}`;
      const sleeps: number[] = [];
      const fetchSpy = vi.fn(() => Promise.resolve(status(429)));
      vertex._setHooks({ execFile: () => TOKEN, random: () => random, fetch: fetchSpy, sleep: ms => { sleeps.push(ms); return Promise.resolve(); } });
      const result = await vertex.send(BODY);
      expect(fetchSpy).toHaveBeenCalledTimes(7);
      expect(result.status).toBe(429);
      expect(sleeps).toEqual([5000, 10000, 20000, 40000, 60000, 60000].map(ms => Math.round(ms * factor)));
    }
  });

  it('honours Retry-After (seconds, capped at 120 s) over the schedule', async () => {
    const sleeps: number[] = [];
    const answers = [status(429, 'q', '7'), status(503, 'q', '9999'), ok()];
    vertex._setHooks({ execFile: () => TOKEN, random: () => 0.5, fetch: () => Promise.resolve(answers.shift() ?? ok()), sleep: ms => { sleeps.push(ms); return Promise.resolve(); } });
    expect((await vertex.send(BODY)).status).toBe(200);
    expect(sleeps).toEqual([7000, 120000]);
  });

  it('connection errors keep two retries of 2 s and 4 s, independent of the quota budget', async () => {
    const sleeps: number[] = [];
    const fetchSpy = vi.fn(() => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })));
    vertex._setHooks({ execFile: () => TOKEN, fetch: fetchSpy, sleep: ms => { sleeps.push(ms); return Promise.resolve(); } });
    const result = await vertex.send(BODY);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([2000, 4000]);
    expect(result.error).toBe('CONNECT');
    expect(records().at(-1)).toMatchObject({ attempts: 3, retriedFor: ['CONNECT', 'CONNECT'] });
  });

  it('does not retry anything that is not definitely transient (400, 500, timeout)', async () => {
    let run = 0;
    for (const make of [() => Promise.resolve(status(400)), () => Promise.resolve(status(500)), () => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))]) {
      process.env.SPK07_RUN_ID = `retry-${String(run++)}`;
      const fetchSpy = vi.fn(make);
      vertex._setHooks({ execFile: () => TOKEN, fetch: fetchSpy, sleep: () => Promise.reject(new Error('must not sleep')) });
      await vertex.send(BODY);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }
  });

  it('retries a connection failure', async () => {
    const answers: (() => Promise<{ status: number; text(): Promise<string> }>)[] = [() => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })), () => Promise.resolve(ok())];
    vertex._setHooks({ execFile: () => TOKEN, fetch: () => (answers.shift() ?? (() => Promise.resolve(ok())))(), sleep: () => Promise.resolve() });
    const result = await vertex.send(BODY);
    expect(result.status).toBe(200);
    expect(records().map(r => r.error)).toEqual(['CONNECT', null]);
  });
});
