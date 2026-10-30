import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { analyzeResponse, finishMetadata, modelIdFromPath, recorderCount, startRecorder, systemInstructionHash } from './recorder.ts';
import type { RecorderIndexLine } from './recorder.ts';

const SECRET_HEADER = 'Bearer ya29.THIS-HEADER-MUST-NEVER-BE-STORED-1234567890';
const COOKIE = 'session=cookie-value-must-not-be-stored';

async function withUpstream<T>(fn: (upstream: string, seen: { headers: http.IncomingHttpHeaders; body: Buffer }[]) => Promise<T>): Promise<T> {
  const seen: { headers: http.IncomingHttpHeaders; body: Buffer }[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"candidates":[]}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('bodies are recorded byte-identical, headers are forwarded but never stored, the counter counts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-recorder-'));
  try {
    await withUpstream(async (upstream, seen) => {
      const recorder = await startRecorder({ port: 0, upstream, outDir: dir });
      const base = `http://127.0.0.1:${recorder.port}`;
      assert.deepEqual(await recorderCount(base), { count: 0, bodies: 0 }, 'a run with zero requests reports zero, so the zero-bodies guard can fire');
      const bodies = [
        JSON.stringify({ systemInstruction: { parts: [{ text: 'rules' }] }, contents: [{ parts: [{ text: 'page text é' }] }] }),
        JSON.stringify({ systemInstruction: { parts: [{ text: 'rules' }] }, contents: [{ parts: [{ text: 'other' }] }] }),
      ];
      for (const body of bodies) {
        const response = await fetch(`${base}/v1/projects/p/locations/global/publishers/google/models/gemini-3.8-flash:generateContent?alt=x`, {
          method: 'POST',
          headers: { authorization: SECRET_HEADER, cookie: COOKIE, 'content-type': 'application/json' },
          body,
        });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), '{"candidates":[]}');
      }
      assert.deepEqual(await recorderCount(base), { count: 2, bodies: 2 });
      assert.equal(seen.length, 2);
      assert.equal(seen[0]?.headers.authorization, SECRET_HEADER, 'headers are forwarded to the upstream');
      assert.equal(seen[0]?.body.toString('utf8'), bodies[0], 'the body is forwarded unchanged');
      await recorder.close();
    });
    const files = readdirSync(dir).sort();
    assert.deepEqual(files, ['0001.req.json', '0002.req.json', 'requests.jsonl']);
    const stored = [readFileSync(join(dir, '0001.req.json'), 'utf8'), readFileSync(join(dir, '0002.req.json'), 'utf8')];
    assert.ok(stored[0]?.includes('page text é'));
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8');
      assert.ok(!content.includes('THIS-HEADER-MUST-NEVER'), `${file} stores a header value`);
      assert.ok(!content.includes('cookie-value-must-not'), `${file} stores a cookie value`);
    }
    const index = readFileSync(join(dir, 'requests.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as RecorderIndexLine);
    assert.equal(index.length, 2);
    assert.equal(index[0]?.modelId, 'gemini-3.8-flash');
    assert.equal(index[0]?.status, 200);
    assert.equal(index[0]?.bodySha256, createHash('sha256').update(stored[0] ?? '').digest('hex'));
    assert.equal(index[0]?.systemInstructionSha256, index[1]?.systemInstructionSha256, 'the same system instruction hashes the same');
    assert.notEqual(index[0]?.bodySha256, index[1]?.bodySha256);
    assert.ok(index.every((l) => l.durationMs >= 0 && l.path.endsWith(':generateContent') && !l.path.includes('?')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreachable upstream still records the request and answers 502', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-recorder-'));
  try {
    const recorder = await startRecorder({ port: 0, upstream: 'http://127.0.0.1:1', outDir: dir });
    const response = await fetch(`http://127.0.0.1:${recorder.port}/x`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 502);
    assert.deepEqual(await recorderCount(`http://127.0.0.1:${recorder.port}`), { count: 1, bodies: 1 });
    await recorder.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('model id and system-instruction hash extraction', () => {
  assert.equal(modelIdFromPath('/v1/projects/p/locations/l/publishers/google/models/gemini-3.8-flash:streamGenerateContent'), 'gemini-3.8-flash');
  assert.equal(modelIdFromPath('/v1/other'), null);
  assert.equal(systemInstructionHash(Buffer.from('not json')), null);
  assert.equal(systemInstructionHash(Buffer.from('{"contents":[]}')), null);
  const a = systemInstructionHash(Buffer.from('{"system_instruction":{"parts":[{"text":"x"}]}}'));
  assert.match(a ?? '', /^[0-9a-f]{64}$/);
  assert.equal(a, systemInstructionHash(Buffer.from('{"systemInstruction":{"parts":[{"text":"x"}]},"other":1}')));
});

test('keep-alive survives a pause longer than five seconds, and a restart resumes numbering without overwriting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-recorder-'));
  try {
    await withUpstream(async (upstream) => {
      const first = await startRecorder({ port: 0, upstream, outDir: dir });
      assert.ok(first.keepAliveMs >= 60_000, 'idle connections are kept long enough for the browser pauses between model calls');
      const base = `http://127.0.0.1:${first.port}`;
      await fetch(`${base}/a`, { method: 'POST', body: '{"n":1}' });
      await first.close();
      const second = await startRecorder({ port: 0, upstream, outDir: dir });
      await fetch(`http://127.0.0.1:${second.port}/b`, { method: 'POST', body: '{"n":2}' });
      assert.deepEqual(await recorderCount(`http://127.0.0.1:${second.port}`), { count: 2, bodies: 2 });
      await second.close();
    });
    assert.deepEqual(readdirSync(dir).sort(), ['0001.req.json', '0002.req.json', 'requests.jsonl']);
    assert.equal(readFileSync(join(dir, '0001.req.json'), 'utf8'), '{"n":1}');
    assert.equal(readFileSync(join(dir, '0002.req.json'), 'utf8'), '{"n":2}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bounded finish metadata distinguishes provider MAX_TOKENS4096 from token counts, adapter finish and UNKNOWN coverage',()=>{
  const request=Buffer.from(JSON.stringify({generationConfig:{maxOutputTokens:4096}}));
  const response=(reason:string)=>Buffer.from(JSON.stringify({candidates:[{finishReason:reason,content:{parts:[{text:'synthetic response content must never be exported'}]}}],usageMetadata:{candidatesTokenCount:4096,thoughtsTokenCount:1024}}));
  const max=finishMetadata(request,response('MAX_TOKENS'));
  assert.equal(max.reason,'MAX_TOKENS');assert.equal(max.cap,4096);assert.equal(max.coverage,'COMPLETE');assert.equal(max.thoughtTokens,1024);assert.ok(!JSON.stringify(max).includes('synthetic response'));
  assert.equal(finishMetadata(request,response('STOP')).reason,'STOP');
  assert.equal(finishMetadata(request,response('SAFETY')).reason,'OTHER');
  for(const bytes of [Buffer.from('{}'),Buffer.from('malformed'),Buffer.alloc(1024*1024+1)])assert.equal(finishMetadata(request,bytes).coverage,'UNKNOWN');
  assert.equal(finishMetadata(request,response('MAX_TOKENS'),false).coverage,'UNKNOWN');
  assert.equal(finishMetadata(Buffer.from('{}'),response('MAX_TOKENS')).coverage,'UNKNOWN');
  const stream=Buffer.from('data: {"candidates":[{"finishReason":"MAX_TOKENS"}]}\n\ndata: [DONE]\n');
  assert.equal(finishMetadata(request,stream).reason,'MAX_TOKENS');
});

const LIMIT = 1024 * 1024;
const CAP_REQUEST = Buffer.from('{"generationConfig":{"maxOutputTokens":4096}}');
const RESPONSE_SENTINEL = 'synthetic-response-content-never-persist-6c9d';
const HEADER_SENTINEL = 'synthetic-response-header-never-persist-f2a1';
const responseJson = (reason: unknown = 'STOP'): Buffer => Buffer.from(JSON.stringify({
  candidates: [{ finishReason: reason, content: { parts: [{ text: RESPONSE_SENTINEL }] } }],
  usageMetadata: { candidatesTokenCount: 4096, thoughtsTokenCount: 1024 },
}));

test('identity JSON object, array and SSE preserve closed finish metadata and bounded usage', () => {
  const frame = responseJson();
  for (const bytes of [frame, Buffer.from(`[${frame.toString('utf8')}]`), Buffer.from(`data: ${frame.toString('utf8')}\n\ndata: [DONE]\n`)]) {
    const value = analyzeResponse(CAP_REQUEST, bytes, { complete: true, contentType: 'Application/JSON; charset=utf-8' });
    assert.equal(value.finish.reason, 'STOP');
    assert.equal(value.finish.coverage, 'COMPLETE');
    assert.equal(value.finish.candidateTokens, 4096, 'token count does not turn STOP into MAX_TOKENS');
    assert.deepEqual(value.response, { encoding: 'IDENTITY', mime: 'JSON', wireBytes: bytes.length,
      decodedBytes: bytes.length, complete: true, decode: 'IDENTITY', parse: 'COMPLETE' });
  }
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '4096', null]) {
    const wire = Buffer.from(JSON.stringify({ candidates: [{ finishReason: 'STOP' }], usageMetadata: { candidatesTokenCount: value, thoughtsTokenCount: value } }));
    const finish = finishMetadata(CAP_REQUEST, wire);
    assert.equal(finish.candidateTokens, null);
    assert.equal(finish.thoughtTokens, null);
  }
  for (const [contentType, mime] of [['text/event-stream; charset=UTF-8', 'SSE'], ['text/plain', 'OTHER'], ['', 'UNKNOWN']] as const) {
    const result = analyzeResponse(CAP_REQUEST, frame, { complete: true, contentType });
    assert.equal(result.response.mime, mime);
    assert.deepEqual(Object.keys(result.response).sort(), ['complete', 'decode', 'decodedBytes', 'encoding', 'mime', 'parse', 'wireBytes']);
  }
});

test('gzip analysis has hard wire and decoded bounds with closed failure precedence', () => {
  const valid = responseJson('MAX_TOKENS');
  const inspect = (wire: Buffer, options: Partial<Parameters<typeof analyzeResponse>[2]> = {}) =>
    analyzeResponse(CAP_REQUEST, wire, { complete: true, contentEncoding: 'gzip', ...options });
  const atLimit = Buffer.concat([valid, Buffer.alloc(LIMIT - valid.length, 0x20)]);
  const exact = inspect(gzipSync(atLimit));
  assert.equal(exact.finish.reason, 'MAX_TOKENS');
  assert.equal(exact.response.decodedBytes, LIMIT);
  assert.equal(exact.response.parse, 'COMPLETE');
  const overflow = inspect(gzipSync(Buffer.concat([atLimit, Buffer.from(' ')])));
  assert.equal(overflow.response.parse, 'DECODED_LIMIT');
  assert.equal(overflow.response.decode, 'DECODED_LIMIT');
  assert.equal(overflow.response.decodedBytes, null, 'decoder does not claim an unobserved expanded byte count');
  assert.equal(overflow.finish.coverage, 'UNKNOWN');
  const encoded = gzipSync(valid);
  const cases: [Buffer, Partial<Parameters<typeof analyzeResponse>[2]>, string][] = [
    [Buffer.from('malformed gzip'), {}, 'DECODE_ERROR'],
    [encoded.subarray(0, -4), {}, 'DECODE_ERROR'],
    [encoded, { complete: false }, 'RESPONSE_INCOMPLETE'],
    [Buffer.alloc(0), { wireBytes: LIMIT + 1 }, 'WIRE_LIMIT'],
    [Buffer.alloc(LIMIT + 1), {}, 'WIRE_LIMIT'],
    [encoded, { contentEncoding: 'gzip, identity' }, 'UNSUPPORTED_ENCODING'],
    [encoded, { contentEncoding: ['gzip', 'gzip'] }, 'UNSUPPORTED_ENCODING'],
    [encoded, { contentEncoding: HEADER_SENTINEL }, 'UNSUPPORTED_ENCODING'],
    [encoded, { wireBytes: encoded.length + 1 }, 'RESPONSE_INCOMPLETE'],
    [Buffer.alloc(LIMIT + 1), { complete: false, contentEncoding: HEADER_SENTINEL }, 'RESPONSE_INCOMPLETE'],
  ];
  for (const [wire, options, diagnostic] of cases) {
    const result = inspect(wire, options);
    assert.equal(result.response.parse, diagnostic);
    assert.equal(result.finish.reason, 'UNKNOWN');
    assert.equal(result.finish.coverage, 'UNKNOWN');
  }
  const identityAtLimit = analyzeResponse(CAP_REQUEST, atLimit, { complete: true, contentEncoding: ' identity ' });
  assert.equal(identityAtLimit.response.wireBytes, LIMIT);
  assert.equal(identityAtLimit.finish.coverage, 'COMPLETE');
  const gzipAtWireLimit = gzipSync(atLimit, { level: 0 });
  assert.ok(gzipAtWireLimit.length > LIMIT);
  assert.equal(inspect(gzipAtWireLimit).response.parse, 'WIRE_LIMIT', 'compressed input is bounded independently of decoded size');
});

test('finish parsing rejects malformed shape, missing cap and every ambiguous or unknown reason', () => {
  const inspect = (value: unknown, request = CAP_REQUEST) => analyzeResponse(request, Buffer.from(JSON.stringify(value)), { complete: true });
  for (const value of [null, 42, 'text', { candidates: null }, { candidates: {} }, { candidates: [null] }, { usageMetadata: [] }]) {
    assert.equal(inspect(value).response.parse, 'SHAPE_INVALID');
  }
  assert.equal(analyzeResponse(CAP_REQUEST, Buffer.from('not json'), { complete: true }).response.parse, 'PARSE_ERROR');
  assert.equal(analyzeResponse(CAP_REQUEST, Buffer.from([0xff]), { complete: true }).response.parse, 'PARSE_ERROR');
  for (const cap of [undefined, null, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, '4096']) {
    const request = Buffer.from(JSON.stringify({ generationConfig: { maxOutputTokens: cap } }));
    const result = inspect({ candidates: [{ finishReason: 'STOP' }] }, request);
    assert.equal(result.response.parse, 'CAP_MISSING');
    assert.equal(result.finish.coverage, 'UNKNOWN');
  }
  assert.equal(analyzeResponse(Buffer.from('null'), responseJson(), { complete: true }).response.parse, 'CAP_MISSING');
  assert.equal(inspect({}).response.parse, 'FINISH_MISSING');
  for (const reason of [null, 7, {}, RESPONSE_SENTINEL, 'FINISH_REASON_UNSPECIFIED']) {
    const result = inspect({ candidates: [{ finishReason: reason }] });
    assert.equal(result.response.parse, 'FINISH_INVALID');
    assert.equal(result.finish.coverage, 'UNKNOWN');
    assert.equal(inspect({ candidates: [{ finishReason: reason }, { finishReason: 'STOP' }] }).response.parse, 'FINISH_AMBIGUOUS');
  }
  assert.equal(inspect([{ candidates: [{ finishReason: 'STOP' }] }, { candidates: [{ finishReason: 'STOP' }] }]).response.parse, 'FINISH_AMBIGUOUS');
  assert.equal(inspect({ candidates: [{ finishReason: 'SAFETY' }] }).finish.reason, 'OTHER');
  assert.equal(inspect(null, Buffer.from('{}')).response.parse, 'SHAPE_INVALID', 'shape failure precedes missing cap');
});

async function withResponseServer(fn: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (upstream: string) => Promise<void>): Promise<void> {
  const server = http.createServer(fn);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Node http preserves encoded bytes; fetch would transparently decompress gzip and hide a forwarding defect. */
function wireRequest(port: number, onFirstData?: (chunk: Buffer) => void): Promise<{ bytes: Buffer; headers: http.IncomingHttpHeaders; complete: boolean }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/model', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': CAP_REQUEST.length, 'accept-encoding': 'gzip' } }, (res) => {
      const chunks: Buffer[] = [];
      let first = true;
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        if (first) {
          first = false;
          try { onFirstData?.(chunk); }
          catch (error: unknown) { clearTimeout(timeout); req.destroy(); res.destroy(); reject(error); }
        }
      });
      res.on('error', (error) => { clearTimeout(timeout); reject(error); });
      res.on('end', () => { clearTimeout(timeout); resolve({ bytes: Buffer.concat(chunks), headers: res.headers, complete: res.complete }); });
    });
    const timeout = setTimeout(() => req.destroy(new Error('wire fixture request timed out')), 5_000);
    req.on('error', (error) => { clearTimeout(timeout); reject(error); });
    req.end(CAP_REQUEST);
  });
}

test('synthetic gzip forwards identical encoded bytes and headers while only safe metadata reaches files or logs', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-recorder-gzip-'));
  const output: unknown[][] = [];
  for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const) t.mock.method(console, method, (...values: unknown[]) => { output.push(values); });
  try {
    let responseNumber = 0;
    const forwarding: { upstreamEnded: boolean; releaseRemainder?: () => void } = { upstreamEnded: false };
    const forwarded: Buffer[] = [];
    await withResponseServer((req, res) => {
      assert.equal(req.headers['accept-encoding'], 'gzip');
      const encoded = gzipSync(responseJson(responseNumber++ === 0 ? 'STOP' : 'MAX_TOKENS'));
      forwarded.push(encoded);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip', 'x-fixture': HEADER_SENTINEL });
      forwarding.upstreamEnded = false;
      forwarding.releaseRemainder = () => {
        forwarding.upstreamEnded = true;
        delete forwarding.releaseRemainder;
        res.write(encoded.subarray(7, -5));
        res.end(encoded.subarray(-5));
      };
      res.write(encoded.subarray(0, 7));
    }, async (upstream) => {
      const recorder = await startRecorder({ port: 0, upstream, outDir: dir });
      try {
        for (let i = 0; i < 2; i++) {
          let firstChunkObserved = false;
          const received = await wireRequest(recorder.port, (chunk) => {
            assert.equal(forwarding.upstreamEnded, false, 'client receives encoded bytes before upstream ends');
            assert.ok(chunk.length > 0 && chunk.length <= 7);
            assert.deepEqual(chunk, forwarded[i]?.subarray(0, chunk.length));
            assert.ok(forwarding.releaseRemainder, 'only client receipt releases the remaining upstream bytes');
            firstChunkObserved = true;
            forwarding.releaseRemainder();
          });
          assert.equal(firstChunkObserved, true);
          assert.equal(forwarding.upstreamEnded, true);
          assert.deepEqual(received.bytes, forwarded[i]);
          assert.equal(received.complete, true);
          assert.equal(received.headers['content-encoding'], 'gzip');
          assert.equal(received.headers['content-type'], 'application/json; charset=utf-8');
          assert.equal(received.headers['x-fixture'], HEADER_SENTINEL);
        }
      } finally { forwarding.releaseRemainder?.(); await recorder.close(); }
    });
    const lines = readFileSync(join(dir, 'requests.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as RecorderIndexLine);
    assert.deepEqual(lines.map((line) => line.finish?.reason), ['STOP', 'MAX_TOKENS']);
    for (const [i, line] of lines.entries()) {
      assert.equal(line.finish?.coverage, 'COMPLETE');
      assert.equal(line.finish?.cap, 4096);
      assert.deepEqual(line.response, { encoding: 'GZIP', mime: 'JSON', wireBytes: forwarded[i]?.length,
        decodedBytes: responseJson(i === 0 ? 'STOP' : 'MAX_TOKENS').length, complete: true, decode: 'GZIP_OK', parse: 'COMPLETE' });
    }
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), 'utf8');
      assert.ok(!text.includes(RESPONSE_SENTINEL));
      assert.ok(!text.includes(HEADER_SENTINEL));
    }
    assert.equal(output.length, 0, 'response handling emits no console output, including decoder details');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unsupported raw headers and malformed gzip persist only closed enums, never header or error details', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-recorder-invalid-'));
  const output: unknown[][] = [];
  for (const method of ['log', 'warn', 'error'] as const) t.mock.method(console, method, (...values: unknown[]) => { output.push(values); });
  try {
    let n = 0;
    await withResponseServer((_req, res) => {
      const scenario = n++;
      res.writeHead(200, { 'content-type': scenario === 2 ? 'application/json' : HEADER_SENTINEL,
        'content-encoding': scenario === 0 ? HEADER_SENTINEL : scenario === 1 ? 'gzip' : 'identity' });
      res.end(scenario === 2 ? responseJson(RESPONSE_SENTINEL) : RESPONSE_SENTINEL);
    }, async (upstream) => {
      const recorder = await startRecorder({ port: 0, upstream, outDir: dir });
      try { await wireRequest(recorder.port); await wireRequest(recorder.port); await wireRequest(recorder.port); }
      finally { await recorder.close(); }
    });
    const lines = readFileSync(join(dir, 'requests.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as RecorderIndexLine);
    assert.deepEqual(lines.map((line) => line.response?.parse), ['UNSUPPORTED_ENCODING', 'DECODE_ERROR', 'FINISH_INVALID']);
    assert.deepEqual(lines.map((line) => line.response?.encoding), ['UNKNOWN', 'GZIP', 'IDENTITY']);
    assert.deepEqual(lines.map((line) => line.response?.mime), ['UNKNOWN', 'UNKNOWN', 'JSON']);
    assert.ok(lines.every((line) => line.finish?.coverage === 'UNKNOWN'));
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const forbidden of [RESPONSE_SENTINEL, HEADER_SENTINEL, 'incorrect header check', 'Z_DATA_ERROR']) assert.ok(!text.includes(forbidden));
    }
    assert.equal(output.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('aborted upstream records incomplete gzip exactly once without retaining response payload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-recorder-abort-'));
  try {
    await withResponseServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
      res.write(gzipSync(responseJson()).subarray(0, 12));
      setImmediate(() => res.destroy());
    }, async (upstream) => {
      const recorder = await startRecorder({ port: 0, upstream, outDir: dir });
      const req = http.request({ hostname: '127.0.0.1', port: recorder.port, path: '/abort', method: 'POST' });
      // The fixture tears down its downstream socket; recorder forwarding behavior is unchanged.
      req.on('error', () => {});
      req.on('response', (res) => { res.on('error', () => {}); res.resume(); });
      req.end(CAP_REQUEST);
      try {
        for (let i = 0; i < 100; i++) {
          if (readdirSync(dir).includes('requests.jsonl')) break;
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
        const lines = readFileSync(join(dir, 'requests.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as RecorderIndexLine);
        assert.equal(lines.length, 1);
        assert.equal(lines[0]?.finish?.coverage, 'UNKNOWN');
        assert.equal(lines[0]?.response?.complete, false);
        assert.equal(lines[0]?.response?.parse, 'RESPONSE_INCOMPLETE');
        assert.equal(lines[0]?.response?.decodedBytes, null);
      } finally { req.destroy(); await recorder.close(); }
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('historical records remain byte-identical and receive no invented response metadata on restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-recorder-legacy-'));
  const legacy = JSON.stringify({ n: 1, finish: { cap: 4096, reason: 'UNKNOWN', candidateTokens: null, thoughtTokens: null, coverage: 'UNKNOWN' } }) + '\n';
  writeFileSync(join(dir, 'requests.jsonl'), legacy);
  try {
    const recorder = await startRecorder({ port: 0, upstream: 'http://127.0.0.1:1', outDir: dir });
    try { assert.equal(recorder.count(), 1); }
    finally { await recorder.close(); }
    assert.equal(readFileSync(join(dir, 'requests.jsonl'), 'utf8'), legacy);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
