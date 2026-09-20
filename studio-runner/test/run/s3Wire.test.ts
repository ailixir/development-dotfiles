import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createS3ObjectStore } from '../../src/run/s3ObjectStore.js';

describe('real AWS SDK against a local HTTP fixture', () => {
  it('signs streamed PUTs, refreshes mounted credentials, and aborts a stalled upload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-s3-wire-'));
    await writeFile(join(root, 'accessKeyId'), 'test-access-first');
    await writeFile(join(root, 'secretAccessKey'), 'test-secret');
    await writeFile(join(root, 'video.webm'), new Uint8Array([10, 20, 30]));
    const requests: { method: string | undefined; path: string | undefined; authorization: string; bytes: number[] }[] = [];
    let stall = false;
    let arrived: () => void = () => { /* Replaced before upload. */ };
    const stalledRequestReceived = new Promise<void>((resolve) => { arrived = resolve; });
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => { chunks.push(chunk); });
      request.on('end', () => {
        requests.push({ method: request.method, path: request.url,
          authorization: request.headers.authorization ?? '', bytes: [...Buffer.concat(chunks)] });
        if (stall) arrived();
        if (!stall) {
          response.writeHead(200, { ETag: '"fixture"' });
          response.end();
        }
      });
    });
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No fixture port');
    vi.stubEnv('AWS_ENDPOINT_URL_S3', `http://127.0.0.1:${String(address.port)}`);
    const writer = createS3ObjectStore({ bucket: 'evidence', region: 'us-east-1', credentialsDirectory: root, requestTimeoutMs: 2000 });
    try {
      await writer.store.put({ key: 'studio/video.webm', contentType: 'video/webm', body: { kind: 'file', path: join(root, 'video.webm') } });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ method: 'PUT', path: '/evidence/studio/video.webm?x-id=PutObject', bytes: [10, 20, 30] });
      expect(requests[0]?.authorization).toContain('AWS4-HMAC-SHA256 Credential=test-access-first/');
      await writeFile(join(root, 'accessKeyId'), 'test-access-rotated');
      await writer.store.put({ key: 'studio/result.json', contentType: 'application/json', body: { kind: 'bytes', data: new Uint8Array([123, 125]) } });
      expect(requests).toHaveLength(2);
      expect(requests[1]?.authorization).toContain('Credential=test-access-rotated/');
      expect(requests[1]?.bytes).toEqual([123, 125]);
      stall = true;
      const cancellation = new AbortController();
      const failed = expect(writer.store.put({ key: 'studio/stalled', contentType: 'video/webm',
        body: { kind: 'bytes', data: new Uint8Array([10]) }, signal: cancellation.signal }))
        .rejects.toThrow('The S3 object could not be written.');
      await stalledRequestReceived;
      cancellation.abort();
      await failed;
      expect(requests).toHaveLength(3);
    } finally {
      writer.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve(); }); });
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });
});
