/**
 * STUDIO-OBS-012A — the evidence uploader's and the object stores' failure paths.
 *
 * The happy paths and the bounded-retry arithmetic are asserted in `objectStore.test.ts`,
 * `s3ObjectStore.test.ts` and `manifest.test.ts`. What those leave unexercised are the edges a real
 * deployment meets first: a recording that cannot be opened, an evidence window that is already
 * shut, a filesystem root that cannot be created, a source file that vanished, and mounted
 * credentials that are missing, empty or unreadable. Each case below asserts the outcome the caller
 * sees — the state, the attempt count, the error class and the redacted diagnostic — not a line.
 */
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type * as S3Module from '@aws-sdk/client-s3';

import { NULL_REDACTOR, createRedactor } from '../../src/executor/redaction.js';
import {
  openEvidenceWindow,
  uploadRecording,
  writeResultManifest,
} from '../../src/run/evidenceUpload.js';
import type { EvidenceUploadPorts } from '../../src/run/evidenceUpload.js';
import {
  ObjectStorePutError,
  ObjectStoreUnavailableError,
  createLocalObjectStore,
} from '../../src/run/objectStore.js';
import type { ObjectStoreClient, PutObjectRequest } from '../../src/run/objectStore.js';
import { createS3ObjectStore } from '../../src/run/s3ObjectStore.js';

const sdk = vi.hoisted(() => ({ config: {} as S3ClientConfig }));
vi.mock('@aws-sdk/client-s3', async (original) => ({
  ...(await original<typeof S3Module>()),
  S3Client: class {
    constructor(config: S3ClientConfig) {
      sdk.config = config;
    }
    send = vi.fn();
    destroy = vi.fn();
  },
}));

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function temp(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-faults-'));
  roots.push(root);
  return root;
}

/** A store that records every request it receives and answers with the scripted outcome. */
function scriptedStore(outcomes: (() => Promise<void>)[]): { client: ObjectStoreClient; requests: PutObjectRequest[] } {
  const requests: PutObjectRequest[] = [];
  return {
    requests,
    client: {
      put(request) {
        requests.push(request);
        const next = outcomes.shift();
        return next ? next() : Promise.resolve();
      },
    },
  };
}

function ports(overrides: Partial<EvidenceUploadPorts> & Pick<EvidenceUploadPorts, 'store'>): EvidenceUploadPorts & { readonly clock: { now: number } } {
  const clock = { now: 0 };
  return {
    fileSystem: {
      stat: () => Promise.resolve({ size: 2048 }),
      readFile: () => Promise.reject(new Error('the uploader must never buffer a recording')),
    },
    bounds: { maxAttempts: 3, windowMs: 10_000, backoffMs: 10 },
    now: () => clock.now,
    sleep: (ms) => {
      clock.now += ms;
      return Promise.resolve();
    },
    redactor: NULL_REDACTOR,
    clock,
    ...overrides,
  };
}

describe('uploadRecording — a recording that cannot be opened is FAILED before the store is called', () => {
  it('reports FAILED with zero attempts, carries partial, and redacts the open error', async () => {
    const store = scriptedStore([]);
    const p = ports({
      store: store.client,
      redactor: createRedactor(['tenant-secret']),
      fileSystem: {
        stat: () => Promise.reject(Object.assign(new Error('EACCES: /scratch/tenant-secret/app.webm'), { name: 'PermissionError' })),
        readFile: () => Promise.reject(new Error('never')),
      },
    });
    const outcome = await uploadRecording(p, openEvidenceWindow(p), { videoKey: 'v', path: '/scratch/app.webm', state: 'PENDING', partial: true });
    expect(outcome).toMatchObject({ state: 'FAILED', partial: true, bytes: null, attempts: 0 });
    expect(outcome.error).toMatch(/^The recording could not be opened for upload: PermissionError: /u);
    expect(outcome.error).not.toContain('tenant-secret');
    expect(store.requests).toEqual([]);
  });

  it('describes a thrown non-Error as unknown rather than stringifying it', async () => {
    const store = scriptedStore([]);
    const p = ports({
      store: store.client,
      fileSystem: { stat: () => Promise.reject('opaque-string-from-a-driver' as unknown as Error), readFile: () => Promise.reject(new Error('never')) },
    });
    const outcome = await uploadRecording(p, openEvidenceWindow(p), { videoKey: 'v', path: '/scratch/app.webm', state: 'PENDING', partial: false });
    expect(outcome.error).toBe('The recording could not be opened for upload: unknown');
    expect(outcome.error).not.toContain('opaque-string');
  });
});

describe('the evidence window is a hard bound on attempts', () => {
  it('makes no attempt at all when the window has already closed, and says so', async () => {
    const store = scriptedStore([]);
    const p = ports({ store: store.client });
    const window = openEvidenceWindow(p);
    p.clock.now = window.deadlineAtMs;
    const outcome = await uploadRecording(p, window, { videoKey: 'v', path: '/scratch/app.webm', state: 'PENDING', partial: false });
    expect(outcome).toMatchObject({ state: 'FAILED', attempts: 0, bytes: 2048 });
    expect(outcome.error).toBe('The recording was not stored: Error: The evidence window closed before the object could be written.');
    expect(store.requests).toEqual([]);
  });

  it('reports the last real store error, not the window, when the window closes between attempts', async () => {
    // First attempt fails and its backoff consumes the rest of the window; the loop must stop and
    // name the store's failure, which is what an operator needs, rather than a generic timeout.
    const store = scriptedStore([() => Promise.reject(new ObjectStoreUnavailableError('dial tcp 10.0.0.1:9000'))]);
    const p = ports({ store: store.client, bounds: { maxAttempts: 5, windowMs: 50, backoffMs: 500 } });
    const outcome = await writeResultManifest(p, openEvidenceWindow(p), 'k/result.json', new Uint8Array([1]), 'application/json');
    expect(outcome).toEqual({ ok: false, attempts: 1, error: 'The terminal result manifest was not stored: the object store was unreachable' });
    expect(store.requests).toHaveLength(1);
  });

  it('gives each attempt only the time left in the window as its abort budget', async () => {
    const store = scriptedStore([() => Promise.reject(new ObjectStorePutError('x')), () => Promise.resolve()]);
    const p = ports({ store: store.client, bounds: { maxAttempts: 3, windowMs: 1000, backoffMs: 400 } });
    const outcome = await writeResultManifest(p, openEvidenceWindow(p), 'k', new Uint8Array([1]), 'application/json');
    expect(outcome).toEqual({ ok: true, attempts: 2, error: null });
    // Both requests carried a signal; the second was issued 400 ms into a 1000 ms window.
    expect(store.requests.every((request) => request.signal instanceof AbortSignal)).toBe(true);
    expect(p.clock.now).toBe(400);
  });

  it('describes a thrown non-Error from the store as unknown', async () => {
    const store = scriptedStore([() => Promise.reject('raw' as unknown as Error)]);
    const p = ports({ store: store.client, bounds: { maxAttempts: 1, windowMs: 1000, backoffMs: 1 } });
    const outcome = await writeResultManifest(p, openEvidenceWindow(p), 'k', new Uint8Array([1]), 'application/json');
    expect(outcome).toEqual({ ok: false, attempts: 1, error: 'The terminal result manifest was not stored: unknown' });
  });
});

describe('createLocalObjectStore — failures are typed, and no object appears at the key', () => {
  it('classifies a root that cannot be created as unavailable, not as a refused write', async () => {
    const parent = await temp();
    const blocker = join(parent, 'not-a-directory');
    await writeFile(blocker, 'file');
    const store = createLocalObjectStore({ root: blocker });
    const failure = await store.put({ key: 'run/result.json', body: { kind: 'bytes', data: new Uint8Array([1]) }, contentType: 'application/json' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ObjectStoreUnavailableError);
    expect(failure).not.toBeInstanceOf(ObjectStorePutError);
    expect((failure as Error).message).toBe('The object store root could not be opened for writing.');
  });

  it('classifies a vanished source recording as a refused write and leaves nothing at the key', async () => {
    const root = await temp();
    const store = createLocalObjectStore({ root });
    const failure = await store.put({ key: 'run/video.webm', body: { kind: 'file', path: join(root, 'gone.webm') }, contentType: 'video/webm' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ObjectStorePutError);
    expect((failure as Error).message).toBe('The object at key run/video.webm was not written.');
    expect((await readdir(join(root, 'run'))).filter((name) => name === 'video.webm')).toEqual([]);
  });

  it('honours an already-aborted signal as a refused write', async () => {
    const root = await temp();
    const store = createLocalObjectStore({ root });
    const failure = await store.put({ key: 'k', body: { kind: 'bytes', data: new Uint8Array([1]) }, contentType: 'application/json', signal: AbortSignal.abort() }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ObjectStorePutError);
    expect(await readdir(root)).not.toContain('k');
  });
});

describe('createS3ObjectStore — mounted credentials that cannot be used are reported as unavailable', () => {
  async function provider(files: Record<string, string | null>, layout: 'directory' | 'files' = 'directory') {
    const root = await temp();
    for (const [name, content] of Object.entries(files)) {
      if (content === null) await mkdir(join(root, name));
      else await writeFile(join(root, name), content);
    }
    createS3ObjectStore(
      layout === 'directory'
        ? { bucket: 'b', region: 'us-east-1', requestTimeoutMs: 100, credentialsDirectory: root }
        : { bucket: 'b', region: 'us-east-1', requestTimeoutMs: 100, accessKeyIdFile: join(root, 'accessKeyId'), secretAccessKeyFile: join(root, 'secretAccessKey') },
    );
    const credentials = sdk.config.credentials;
    if (typeof credentials !== 'function') throw new Error('NO_PROVIDER');
    return { root, credentials };
  }

  it.each([
    ['a missing access key file', { secretAccessKey: 'secret' }],
    ['an empty access key', { accessKeyId: '  \n', secretAccessKey: 'secret' }],
    ['an empty secret', { accessKeyId: 'id', secretAccessKey: '' }],
    ['an unreadable session token (a directory)', { accessKeyId: 'id', secretAccessKey: 'secret', sessionToken: null }],
  ] as const)('%s → CredentialsProviderError with no path or key material in it', async (_label, files) => {
    const { root, credentials } = await provider(files);
    const failure = await credentials().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).name).toBe('CredentialsProviderError');
    expect((failure as Error).message).toBe('The mounted object-store credentials are unavailable.');
    expect(JSON.stringify({ message: (failure as Error).message, stack: (failure as Error).stack })).not.toContain(root);
  });

  it('separately mounted key files carry no session token and still refresh', async () => {
    const { credentials } = await provider({ accessKeyId: 'id', secretAccessKey: 'secret', sessionToken: 'ignored' }, 'files');
    const resolved = await credentials();
    expect(resolved).toMatchObject({ accessKeyId: 'id', secretAccessKey: 'secret' });
    expect(resolved).not.toHaveProperty('sessionToken');
    expect(resolved.expiration?.getTime()).toBeGreaterThan(Date.now());
  });
});
