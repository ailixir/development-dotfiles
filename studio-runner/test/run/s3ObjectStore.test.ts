import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type * as S3Module from '@aws-sdk/client-s3';
import { createS3ObjectStore } from '../../src/run/s3ObjectStore.js';
import { loadConfig } from '../../src/server/config.js';

const sdk = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn(), config: {} as S3ClientConfig }));
vi.mock('@aws-sdk/client-s3', async (original) => ({
  ...await original<typeof S3Module>(),
  S3Client: class {
    constructor(config: S3ClientConfig) { sdk.config = config; }
    send = sdk.send;
    destroy = sdk.destroy;
  },
}));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  vi.clearAllMocks();
});
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'studio-s3-'));
  directories.push(path);
  return path;
}
const environment = {
  STUDIO_RUNNER_SERVICE_IDENTITY: 'test-runner',
  STUDIO_RUNNER_CALLBACK_IDENTITY: 'test-api',
  STUDIO_RUNNER_CALLBACK_BASE_URL: 'http://localhost:8080',
};

describe('configured object storage', () => {
  it('rejects overlapping filesystem and scratch paths in either direction', () => {
    for (const [scratch, objects] of [['/tmp/run', '/tmp/run/objects'], ['/tmp/run/scratch', '/tmp/run'], ['/tmp/run', '/tmp/run']]) {
      expect(() => loadConfig({ ...environment, STUDIO_RUNNER_SCRATCH_DIR: scratch, STUDIO_RUNNER_OBJECT_STORE_DIR: objects })).toThrow('disjoint');
    }
    expect(loadConfig(environment).objectStoreProvider).toBe('filesystem');
  });
  it('S3 requires bucket and region and never falls back to filesystem', () => {
    expect(() => loadConfig({ ...environment, STUDIO_RUNNER_OBJECT_STORE_PROVIDER: 's3' })).toThrow('S3 requires');
    expect(() => loadConfig({ ...environment, STUDIO_RUNNER_OBJECT_STORE_PROVIDER: 'typo' })).toThrow('filesystem or s3');
    expect(loadConfig({ ...environment, STUDIO_RUNNER_OBJECT_STORE_PROVIDER: 's3',
      STUDIO_RUNNER_OBJECT_STORE_BUCKET: 'evidence', STUDIO_RUNNER_OBJECT_STORE_REGION: 'us-east-1' }).objectStoreProvider).toBe('s3');
  });
  it('streams files and writes manifests under the exact supplied keys with retries owned by the uploader', async () => {
    const path = join(await directory(), 'video.webm');
    await writeFile(path, new Uint8Array([10, 20, 30]));
    const bodies: number[][] = [];
    sdk.send.mockImplementation(async (command: PutObjectCommand) => {
      const body = command.input.Body;
      if (body instanceof Readable) {
        const chunks: number[] = [];
        for await (const chunk of body) chunks.push(...(chunk as Buffer));
        bodies.push(chunks);
      } else if (body instanceof Uint8Array) bodies.push([...body]);
    });
    const { store, close } = createS3ObjectStore({ bucket: 'evidence', region: 'us-east-1', requestTimeoutMs: 500 });
    const signal = AbortSignal.timeout(500);
    await store.put({ key: 'studio/video', body: { kind: 'file', path }, contentType: 'video/webm', signal });
    await store.put({ key: 'studio/result.json', body: { kind: 'bytes', data: new Uint8Array([123, 125]) }, contentType: 'application/json' });
    expect(bodies).toEqual([[10, 20, 30], [123, 125]]);
    const command = sdk.send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'evidence', Key: 'studio/video', ContentLength: 3, ContentType: 'video/webm' });
    expect(sdk.send.mock.calls[0]?.[1]).toEqual({ abortSignal: signal });
    expect(sdk.config.maxAttempts).toBe(1);
    expect(Object.keys(store)).toEqual(['put']);
    close();
    expect(sdk.destroy).toHaveBeenCalledOnce();
  });
  it('reads mounted credentials including rotation and an optional session token', async () => {
    const root = await directory();
    await writeFile(join(root, 'accessKeyId'), 'first');
    await writeFile(join(root, 'secretAccessKey'), 'secret');
    createS3ObjectStore({ bucket: 'evidence', region: 'us-east-1', requestTimeoutMs: 500, credentialsDirectory: root });
    const provider = sdk.config.credentials;
    if (typeof provider !== 'function') throw new Error('No mounted credential provider');
    const first = await provider();
    expect(first).toMatchObject({ accessKeyId: 'first', secretAccessKey: 'secret' });
    expect(first.expiration).toBeInstanceOf(Date);
    await writeFile(join(root, 'accessKeyId'), 'second');
    await writeFile(join(root, 'sessionToken'), 'session');
    expect(await provider()).toMatchObject({ accessKeyId: 'second', secretAccessKey: 'secret', sessionToken: 'session' });
    expect(await readFile(join(root, 'accessKeyId'), 'utf8')).toBe('second');
  });
  it('a missing video fails without an unhandled stream error', async () => {
    const { store } = createS3ObjectStore({ bucket: 'evidence', region: 'us-east-1', requestTimeoutMs: 500 });
    await expect(store.put({ key: 'studio/video', body: { kind: 'file', path: join(await directory(), 'missing.webm') }, contentType: 'video/webm' }))
      .rejects.toThrow('The S3 object could not be written.');
    expect(sdk.send).not.toHaveBeenCalled();
  });
  it('storage errors do not expose credentials or endpoint details', async () => {
    sdk.send.mockRejectedValue(new Error('secret credential endpoint detail'));
    const { store } = createS3ObjectStore({ bucket: 'evidence', region: 'us-east-1', requestTimeoutMs: 500 });
    await expect(store.put({ key: 'studio/result.json', body: { kind: 'bytes', data: new Uint8Array([123, 125]) }, contentType: 'application/json' }))
      .rejects.toThrow('The S3 object could not be written.');
  });
});
