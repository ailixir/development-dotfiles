import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ObjectStoreUnavailableError, createS3ObjectStore } from '../../src/run/objectStore.js';

const roots: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('Sonic S3 adapter', () => {
  it('streams the exact body to the configured bucket and key through a put-only surface', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-s3-'));
    roots.push(root);
    const accessKey = join(root, 'accessKeyId');
    const secretKey = join(root, 'secretAccessKey');
    const video = join(root, 'video.webm');
    await writeFile(accessKey, 'writer-id\n');
    await writeFile(secretKey, 'writer-secret\n');
    await writeFile(video, new Uint8Array([1, 2, 3, 4]));

    let requestPath = '';
    let authorization = '';
    let contentType = '';
    let body = Buffer.alloc(0);
    const server = createServer((request, response) => {
      requestPath = request.url ?? '';
      authorization = request.headers.authorization ?? '';
      contentType = request.headers['content-type'] ?? '';
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        body = Buffer.concat(chunks);
        response.statusCode = 200;
        response.end();
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    const store = createS3ObjectStore({
      endpoint: `http://127.0.0.1:${String(port)}`,
      region: 'us-east-1',
      bucket: 'evidence',
      forcePathStyle: true,
      accessKeyIdFile: accessKey,
      secretAccessKeyFile: secretKey,
      requestTimeoutMs: 2_000,
    });
    await store.put({
      key: 'studio/60406/run/video.webm',
      body: { kind: 'file', path: video },
      contentType: 'video/webm',
    });

    expect(Object.keys(store)).toEqual(['put']);
    expect(requestPath).toBe('/evidence/studio/60406/run/video.webm?x-id=PutObject');
    expect(contentType).toBe('video/webm');
    expect(authorization).toContain('Credential=writer-id/');
    expect(body).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(requestPath).not.toContain('writer-secret');
  });

  it('aborts a Sonic request at its configured bound', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-s3-timeout-'));
    roots.push(root);
    const accessKey = join(root, 'accessKeyId');
    const secretKey = join(root, 'secretAccessKey');
    await writeFile(accessKey, 'writer-id');
    await writeFile(secretKey, 'writer-secret');
    const server = createServer(() => {
      // Deliberately never answer; the adapter must abort rather than leave an upload alive.
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const store = createS3ObjectStore({
      endpoint: `http://127.0.0.1:${String(port)}`,
      region: 'us-east-1',
      bucket: 'evidence',
      forcePathStyle: true,
      accessKeyIdFile: accessKey,
      secretAccessKeyFile: secretKey,
      requestTimeoutMs: 20,
    });

    await expect(
      store.put({
        key: 'studio/manifest.json',
        body: { kind: 'bytes', data: new TextEncoder().encode('{}') },
        contentType: 'application/json',
      }),
    ).rejects.toBeInstanceOf(ObjectStoreUnavailableError);
  });
});
