/* global Buffer, structuredClone, AbortSignal */
/* eslint-disable no-restricted-imports -- SPK-07 harness (not shipped): the bearer token can only come from `gcloud auth application-default print-access-token`; no artifact content reaches this process spawn. */
// SPK-07 model client: direct Vertex generateContent, no Studio stack. Screening evidence only.
//
// Contract (INTERFACES.md): send(body, { label, maxPromptTokens }) -> { status, reply, rawText, usage, modelVersion, ms, error }.
//  - The bearer token comes from `gcloud auth application-default print-access-token`, is cached ~25 min in memory, and is
//    NEVER printed, logged, written to a file, or put in an error message.
//  - One record per HTTP attempt is appended to runs/<runId>/calls.jsonl (usage + modelVersion; never the request body and
//    never the reply text). Bodies go to runs/<runId>/bodies/ only when SPK07_KEEP_BODIES=1.
//  - Hard caps: SPK07_MAX_CALLS (HTTP attempts, retries included) and SPK07_MAX_PROMPT_TOKENS_TOTAL, both counted from the
//    run directory's own calls.jsonl so they hold across processes. A refused call makes no network request.
//  - Retries only definite-transient failures. HARNESS POLICY (post-freeze deviation, product retry behaviour unaffected): quota/capacity
//    answers 429 and 503 are retried up to 6 times with exponential backoff + jitter (~5, 10, 20, 40, 60, 60 s), honouring Retry-After
//    when present (capped at 120 s); connection errors keep the product's 2 retries (2 s, 4 s). Every HTTP attempt is one call toward
//    SPK07_MAX_CALLS and one calls.jsonl record, which carries `attempts` (1-based within this send) and `retriedFor` (statuses/codes
//    of the earlier attempts).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENDPOINT = 'https://aiplatform.googleapis.com/v1/projects/epicagentai/locations/global/publishers/google/models/gemini-3.8-flash:generateContent';
export const TOKEN_TTL_MS = 25 * 60_000;
export const DEFAULT_MAX_CALLS = 10;
export const DEFAULT_MAX_PROMPT_TOKENS_TOTAL = 2_000_000;
const DEFAULT_RUNS_DIR = fileURLToPath(new URL('../runs/', import.meta.url));
const REQUEST_TIMEOUT_MS = 180_000;
export const QUOTA_BACKOFF_MS = [5000, 10000, 20000, 40000, 60000, 60000];
export const CONNECT_BACKOFF_MS = [2000, 4000];
export const RETRY_AFTER_CAP_MS = 120_000;
/** Retry-After as a delay in ms (delta-seconds or HTTP-date), or null. */
function retryAfterMs(response, nowMs) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - nowMs;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, RETRY_AFTER_CAP_MS) : null;
}

const hooks = { random: () => Math.random(), fetch: (...args) => globalThis.fetch(...args), execFile: execFileSync, sleep: ms => new Promise(resolve => { setTimeout(resolve, ms); }), now: () => Date.now() };
let token = null; let tokenAt = 0;
let state = null; // { dir, calls, promptTokens } for the current run directory

/** Test seam: replace fetch / execFile / sleep / now. Pass nothing to restore. Also clears the token cache and run state. */
export function _setHooks(overrides = {}) {
  hooks.random = overrides.random ?? (() => Math.random());
  hooks.fetch = overrides.fetch ?? ((...args) => globalThis.fetch(...args));
  hooks.execFile = overrides.execFile ?? execFileSync;
  hooks.sleep = overrides.sleep ?? (ms => new Promise(resolve => { setTimeout(resolve, ms); }));
  hooks.now = overrides.now ?? (() => Date.now());
  token = null; tokenAt = 0; state = null;
}

export function runDirectory() {
  const runId = process.env.SPK07_RUN_ID ?? 'adhoc';
  if (!/^[A-Za-z0-9._-]{1,80}$/u.test(runId)) throw new Error('SPK07_RUN_ID_INVALID');
  return join(process.env.SPK07_RUNS_DIR ?? DEFAULT_RUNS_DIR, runId);
}

function integerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name}_INVALID`);
  return value;
}

function loadState() {
  const dir = runDirectory();
  if (state?.dir === dir) return state;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'calls.jsonl');
  let calls = 0; let promptTokens = 0;
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try { const record = JSON.parse(line); calls++; promptTokens += record.usage?.prompt ?? 0; } catch { calls++; }
    }
  }
  state = { dir, calls, promptTokens };
  return state;
}

function accessToken() {
  if (token && hooks.now() - tokenAt < TOKEN_TTL_MS) return token;
  try {
    const out = hooks.execFile('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    token = String(out).trim();
  } catch { throw new Error('ADC_TOKEN_UNAVAILABLE'); }
  if (!token) throw new Error('ADC_TOKEN_UNAVAILABLE');
  tokenAt = hooks.now();
  return token;
}

/** Remove the bearer token from any string before it can reach a record or a caller. */
function scrub(text) {
  if (typeof text !== 'string') return text;
  return token ? text.split(token).join('[redacted]') : text;
}

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'EPIPE']);
function isConnectionError(error) {
  if (!error || error.name === 'TimeoutError' || error.name === 'AbortError') return false; // a timeout may have been processed: not definite
  const code = error.cause?.code ?? error.code;
  return TRANSIENT_CODES.has(code) || (error instanceof TypeError && /fetch failed/iu.test(String(error.message)));
}

/** Append `inlineData` image parts to the single user content (workstream B). Returns a new body. */
export function withInlineImages(body, images) {
  const copy = structuredClone(body);
  for (const image of images ?? []) copy.contents[0].parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  return copy;
}

function usageOf(json) {
  const meta = json?.usageMetadata;
  if (!meta) return null;
  return { prompt: (meta.promptTokenCount ?? 0) + (meta.toolUsePromptTokenCount ?? 0), out: meta.candidatesTokenCount ?? 0, thoughts: meta.thoughtsTokenCount ?? 0, total: meta.totalTokenCount ?? null };
}

/**
 * @param {object} body full Vertex request body
 * @param {{ label?: string, maxPromptTokens?: number }} [options]
 */
export async function send(body, { label = '', maxPromptTokens } = {}) {
  const run = loadState();
  const maxCalls = integerEnv('SPK07_MAX_CALLS', DEFAULT_MAX_CALLS);
  const maxTotal = integerEnv('SPK07_MAX_PROMPT_TOKENS_TOTAL', DEFAULT_MAX_PROMPT_TOKENS_TOTAL);
  const payload = JSON.stringify(body);
  const requestBytes = Buffer.byteLength(payload, 'utf8');
  const refuse = (error) => ({ status: 0, reply: null, rawText: '', usage: null, modelVersion: null, ms: 0, error });
  // Conservative per-call estimate (3 bytes per token on JSON-heavy prompts). Real usage is checked after the response.
  if (maxPromptTokens !== undefined && Math.ceil(requestBytes / 3) > maxPromptTokens) return refuse('CAP_PER_CALL_ESTIMATE');
  let quotaRetries = 0; let connectRetries = 0; const retriedFor = [];
  for (let httpAttempt = 1; ; httpAttempt++) {
    if (run.calls >= maxCalls) return refuse('CAP_MAX_CALLS');
    if (run.promptTokens >= maxTotal) return refuse('CAP_MAX_PROMPT_TOKENS_TOTAL');
    const n = ++run.calls; // reserved synchronously so concurrent callers cannot overshoot the cap
    const started = hooks.now();
    let status = 0; let text = ''; let failure = null; let connection = false; let retryAfter = null;
    try {
      const response = await hooks.fetch(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${accessToken()}`, 'content-type': 'application/json' }, body: payload, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      status = response.status; text = await response.text(); retryAfter = retryAfterMs(response, hooks.now());
    } catch (error) {
      if (error instanceof Error && error.message === 'ADC_TOKEN_UNAVAILABLE') failure = 'ADC_TOKEN_UNAVAILABLE';
      else { connection = isConnectionError(error); failure = connection ? 'CONNECT' : (error?.name === 'TimeoutError' ? 'TIMEOUT' : 'TRANSPORT'); }
    }
    const ms = hooks.now() - started;
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    const rawText = (json?.candidates?.[0]?.content?.parts ?? []).filter(part => part && part.thought !== true).map(part => part.text ?? '').join('');
    let reply = null; if (rawText) { try { reply = JSON.parse(rawText); } catch { /* leave null */ } }
    const usage = usageOf(json);
    run.promptTokens += usage?.prompt ?? 0;
    const error = failure ?? (status !== 200 ? scrub(String(json?.error?.message ?? text).slice(0, 200)) || `HTTP_${status}` : null);
    const modelVersion = json?.modelVersion ?? null;
    const record = { n, ts: new Date(hooks.now()).toISOString(), label, httpAttempt, attempts: httpAttempt, retriedFor: [...retriedFor], status, ms, requestBytes, usage, modelVersion, finishReason: json?.candidates?.[0]?.finishReason ?? null,
      overPromptCap: maxPromptTokens !== undefined && usage ? usage.prompt > maxPromptTokens : false, error };
    appendFileSync(join(run.dir, 'calls.jsonl'), `${JSON.stringify(record)}\n`);
    if (process.env.SPK07_KEEP_BODIES === '1') { mkdirSync(join(run.dir, 'bodies'), { recursive: true }); writeFileSync(join(run.dir, 'bodies', `${n}.json`), payload); }
    if ((status === 429 || status === 503) && quotaRetries < QUOTA_BACKOFF_MS.length) {
      const base = QUOTA_BACKOFF_MS[quotaRetries++];
      retriedFor.push(status);
      await hooks.sleep(retryAfter ?? Math.round(base * (0.8 + 0.4 * hooks.random())));
      continue;
    }
    if (status === 0 && connection && connectRetries < CONNECT_BACKOFF_MS.length) { retriedFor.push('CONNECT'); await hooks.sleep(CONNECT_BACKOFF_MS[connectRetries++]); continue; }
    return { status, reply, rawText, usage, modelVersion, ms, error };
  }
}

/** Current counters for the run directory (for reports and tests). */
export function counters() { const run = loadState(); return { calls: run.calls, promptTokens: run.promptTokens, dir: run.dir }; }
