/**
 * Loopback recording forwarder in front of the model gateway (Vertex), for the release gate.
 *
 * It forwards every request unchanged to the upstream and records, per request, the BODY (never a
 * header) and timing. It also answers GET /__gate/count with the number of requests seen, which the
 * gate uses to prove that manual replays make zero gateway calls. Response bodies are not stored.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

export interface RecorderOptions {
  host?: string;
  port: number;
  /** e.g. https://aiplatform.googleapis.com or a local http server in tests. */
  upstream: string;
  /** Directory receiving NNNN.req.json and requests.jsonl. */
  outDir: string;
}

export interface RecorderIndexLine {
  finish?: FinishMetadata;
  /** Absent on historical records. Never reconstruct it from request metadata. */
  response?: ResponseMetadata;
  n: number;
  startedAt: string;
  durationMs: number;
  status: number;
  modelId: string | null;
  path: string;
  bodySha256: string;
  systemInstructionSha256: string | null;
  bytes: number;
}

export interface Recorder {
  port: number;
  keepAliveMs: number;
  count: () => number;
  close: () => Promise<void>;
}

export function modelIdFromPath(path: string): string | null {
  const m = /\/models\/([^:/?]+):/.exec(path);
  return m === null ? null : (m[1] ?? null);
}

export function systemInstructionHash(body: Buffer): string | null {
  try {
    const parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    const si = parsed.systemInstruction ?? parsed.system_instruction;
    return si === undefined ? null : createHash('sha256').update(JSON.stringify(si)).digest('hex');
  } catch {
    return null;
  }
}

const ANALYSIS_LIMIT = 1024 * 1024;
type ParseDiagnostic = 'COMPLETE' | 'RESPONSE_INCOMPLETE' | 'WIRE_LIMIT' | 'UNSUPPORTED_ENCODING' |
  'DECODED_LIMIT' | 'DECODE_ERROR' | 'PARSE_ERROR' | 'SHAPE_INVALID' | 'CAP_MISSING' |
  'FINISH_MISSING' | 'FINISH_AMBIGUOUS' | 'FINISH_INVALID';
export interface ResponseMetadata {
  encoding: 'IDENTITY' | 'GZIP' | 'UNKNOWN';
  mime: 'JSON' | 'SSE' | 'OTHER' | 'UNKNOWN';
  wireBytes: number;
  decodedBytes: number | null;
  complete: boolean;
  decode: 'IDENTITY' | 'GZIP_OK' | 'SKIPPED' | 'DECODE_ERROR' | 'DECODED_LIMIT';
  parse: ParseDiagnostic;
}
export interface FinishMetadata { cap: number | null; reason: 'STOP'|'MAX_TOKENS'|'OTHER'|'UNKNOWN'; candidateTokens: number | null; thoughtTokens: number | null; coverage: 'COMPLETE'|'UNKNOWN' }

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
// Recognized non-success provider reasons collapse to OTHER; arbitrary provider strings never become evidence.
const OTHER_REASONS = new Set(['SAFETY', 'RECITATION', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII',
  'MALFORMED_FUNCTION_CALL', 'UNEXPECTED_TOOL_CALL', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_OTHER', 'NO_IMAGE']);

function requestCap(request: Buffer): number | null {
  try {
    const req: unknown = JSON.parse(request.toString('utf8'));
    const cap = object(req) && object(req.generationConfig) ? req.generationConfig.maxOutputTokens : undefined;
    return typeof cap === 'number' && Number.isSafeInteger(cap) && cap > 0 ? cap : null;
  } catch { return null; }
}

function encodingCategory(header: unknown): ResponseMetadata['encoding'] {
  if (header === undefined) return 'IDENTITY';
  if (typeof header !== 'string') return 'UNKNOWN';
  const value = header.trim().toLowerCase();
  return value === 'identity' ? 'IDENTITY' : value === 'gzip' ? 'GZIP' : 'UNKNOWN';
}

function mimeCategory(header: unknown): ResponseMetadata['mime'] {
  if (typeof header !== 'string') return 'UNKNOWN';
  const value = header.split(';', 1)[0]?.trim().toLowerCase();
  if (!value || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value)) return 'UNKNOWN';
  return value === 'application/json' ? 'JSON' : value === 'text/event-stream' ? 'SSE' : 'OTHER';
}

/** Analyze a bounded temporary COPY only. No raw headers, bodies or exception text leave this function. */
export function analyzeResponse(request: Buffer, wire: Buffer, options: {
  complete: boolean; wireBytes?: number; contentEncoding?: unknown; contentType?: unknown;
}): { finish: FinishMetadata; response: ResponseMetadata } {
  const finish: FinishMetadata = { cap: requestCap(request), reason: 'UNKNOWN', candidateTokens: null, thoughtTokens: null, coverage: 'UNKNOWN' };
  const response: ResponseMetadata = {
    encoding: encodingCategory(options.contentEncoding), mime: mimeCategory(options.contentType),
    wireBytes: options.wireBytes ?? wire.length, decodedBytes: null, complete: options.complete,
    decode: 'SKIPPED', parse: 'RESPONSE_INCOMPLETE',
  };
  const result = { finish, response };
  const fail = (diagnostic: ParseDiagnostic): typeof result => { response.parse = diagnostic; return result; };
  if (!options.complete) return result;
  if (response.wireBytes > ANALYSIS_LIMIT || wire.length > ANALYSIS_LIMIT) return fail('WIRE_LIMIT');
  // Missing retained bytes must never be interpreted as a complete response.
  if (response.wireBytes !== wire.length) return fail('RESPONSE_INCOMPLETE');
  if (response.encoding === 'UNKNOWN') return fail('UNSUPPORTED_ENCODING');
  let decoded: Buffer | undefined;
  try {
    if (response.encoding === 'GZIP') {
      try {
        decoded = gunzipSync(wire, { maxOutputLength: ANALYSIS_LIMIT });
        response.decode = 'GZIP_OK';
      } catch (error: unknown) {
        const overflow = object(error) && error.code === 'ERR_BUFFER_TOO_LARGE';
        response.decode = overflow ? 'DECODED_LIMIT' : 'DECODE_ERROR';
        return fail(response.decode);
      }
    } else {
      decoded = wire;
      response.decode = 'IDENTITY';
    }
    response.decodedBytes = decoded.length;
    let frames: unknown[];
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
      if (text.trimStart().startsWith('data:')) {
        frames = text.split('\n').filter((line) => line.startsWith('data:') && line.slice(5).trim() !== '[DONE]')
          .map((line) => JSON.parse(line.slice(5)) as unknown);
      } else {
        const data: unknown = JSON.parse(text);
        frames = Array.isArray(data) ? data : [data];
      }
    } catch { return fail('PARSE_ERROR'); }
    let occurrences = 0;
    let reason: FinishMetadata['reason'] = 'UNKNOWN';
    let candidateTokens: number | null = null, thoughtTokens: number | null = null;
    for (const frame of frames) {
      if (!object(frame) || (frame.candidates !== undefined && !Array.isArray(frame.candidates)) ||
          (frame.usageMetadata !== undefined && !object(frame.usageMetadata))) return fail('SHAPE_INVALID');
      for (const candidate of (frame.candidates ?? []) as unknown[]) {
        if (!object(candidate)) return fail('SHAPE_INVALID');
        if (Object.hasOwn(candidate, 'finishReason')) {
          occurrences += 1;
          const value = candidate.finishReason;
          reason = value === 'STOP' ? 'STOP' : value === 'MAX_TOKENS' ? 'MAX_TOKENS' :
            typeof value === 'string' && OTHER_REASONS.has(value) ? 'OTHER' : 'UNKNOWN';
        }
      }
      if (object(frame.usageMetadata)) {
        candidateTokens = numeric(frame.usageMetadata.candidatesTokenCount);
        thoughtTokens = numeric(frame.usageMetadata.thoughtsTokenCount);
      }
    }
    if (finish.cap === null) return fail('CAP_MISSING');
    if (occurrences === 0) return fail('FINISH_MISSING');
    if (occurrences > 1) return fail('FINISH_AMBIGUOUS');
    if (reason === 'UNKNOWN') return fail('FINISH_INVALID');
    Object.assign(finish, { reason, candidateTokens, thoughtTokens, coverage: 'COMPLETE' });
    response.parse = 'COMPLETE';
    return result;
  } finally {
    // Drop analysis references; this is not secure erasure of Node/zlib-managed memory.
    decoded = undefined;
  }
}

export function finishMetadata(request: Buffer, response: Buffer, complete = true): FinishMetadata {
  return analyzeResponse(request, response, { complete }).finish;
}

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'upgrade', 'proxy-authorization', 'proxy-authenticate', 'trailer']);

export function startRecorder(options: RecorderOptions): Promise<Recorder> {
  const upstream = new URL(options.upstream);
  const client = upstream.protocol === 'https:' ? https : http;
  mkdirSync(options.outDir, { recursive: true });
  // Resume numbering after a restart so earlier bodies are never overwritten and the counter stays cumulative.
  const indexFile = join(options.outDir, 'requests.jsonl');
  let seen = existsSync(indexFile) ? readFileSync(indexFile, 'utf8').split('\n').filter((l) => l !== '').length : 0;
  let bodies = seen;
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/__gate/count') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ count: seen, bodies }));
      return;
    }
    const startedMs = Date.now();
    const n = (seen += 1);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = req.url ?? '/';
      const headers: http.OutgoingHttpHeaders = {};
      for (const [k, v] of Object.entries(req.headers)) if (!HOP_BY_HOP.has(k) && k !== 'host') headers[k] = v;
      headers.host = upstream.host;
      headers['content-length'] = String(body.length);
      let recorded=false;
      let responseBytes=0;
      let responseHeaders: http.IncomingHttpHeaders = {};
      const responseChunks:Buffer[]=[];
      const record = (status: number, complete=false): void => {
        if(recorded) return; recorded=true;
        let analysis: ReturnType<typeof analyzeResponse>;
        try {
          analysis = analyzeResponse(body, Buffer.concat(responseChunks), {
            complete, wireBytes: responseBytes,
            contentEncoding: responseHeaders['content-encoding'], contentType: responseHeaders['content-type'],
          });
        } finally {
          responseChunks.length = 0;
          responseHeaders = {};
        }
        const name = `${String(n).padStart(4, '0')}.req.json`;
        writeFileSync(join(options.outDir, name), body);
        bodies += 1;
        const line: RecorderIndexLine = {
          n,
          finish: analysis.finish,
          response: analysis.response,
          startedAt: new Date(startedMs).toISOString(),
          durationMs: Date.now() - startedMs,
          status,
          modelId: modelIdFromPath(path),
          path: path.split('?')[0] ?? path,
          bodySha256: createHash('sha256').update(body).digest('hex'),
          systemInstructionSha256: systemInstructionHash(body),
          bytes: body.length,
        };
        appendFileSync(join(options.outDir, 'requests.jsonl'), `${JSON.stringify(line)}\n`);
      };
      const out = client.request(
        { protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port === '' ? undefined : upstream.port, method: req.method, path, headers },
        (up) => {
          responseHeaders = up.headers;
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.on('data',(chunk:Buffer) => { responseBytes = Math.min(Number.MAX_SAFE_INTEGER, responseBytes + chunk.length); if(!recorded && responseBytes<=ANALYSIS_LIMIT) responseChunks.push(chunk); else responseChunks.length=0; });
          up.pipe(res);
          up.on('end', () => record(up.statusCode ?? 502,up.complete));
          up.on('aborted', () => record(up.statusCode ?? 502));
          up.on('error', () => record(up.statusCode ?? 502));
          up.on('close', () => record(up.statusCode ?? 502));
        },
      );
      out.on('error', () => {
        record(502);
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      out.end(body);
    });
  });
  // Node closes an idle keep-alive connection after 5 s. The backend's HTTP client reuses pooled connections and does not
  // retry, so a model call made after a longer pause (the browser works between calls) failed with TRANSPORT_OTHER before
  // it reached the recorder. Keep idle connections far longer than any pause between two calls of one session.
  server.keepAliveTimeout = 10 * 60_000;
  server.headersTimeout = 10 * 60_000 + 5_000;
  return new Promise((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host ?? '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolveStart({
        port,
        keepAliveMs: server.keepAliveTimeout,
        count: () => seen,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** Reads the counter of a running recorder. */
export async function recorderCount(baseUrl: string): Promise<{ count: number; bodies: number }> {
  const response = await fetch(`${baseUrl}/__gate/count`);
  if (!response.ok) throw new Error(`recorder count answered ${response.status}`);
  const json = (await response.json()) as { count?: unknown; bodies?: unknown };
  if (typeof json.count !== 'number' || typeof json.bodies !== 'number') throw new Error('recorder count has an unexpected shape');
  return { count: json.count, bodies: json.bodies };
}
