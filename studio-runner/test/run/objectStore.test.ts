/**
 * Story 10.14 AC-2, AC-5, AC-18a — the write-only client, its bounds and its idempotency.
 *
 * Every claim here is decided on a **runtime** observation: the object the module exports, the
 * argument the client actually received, the number of objects on disk, the count of whole-file
 * reads. AC-23 forbids a source-text scan standing alone for any of them, and the precedent is
 * story 10.8's `LOGGER.` scan, whose own gate said *"a log site that built the same string through
 * a local variable named something else would pass"*.
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { NULL_REDACTOR } from '../../src/executor/redaction.js';
import {
  ObjectStorePutError,
  ObjectStoreUnavailableError,
  PERMITTED_OBJECT_STORE_OPERATIONS,
  createLocalObjectStore,
} from '../../src/run/objectStore.js';
import type { ObjectStoreClient } from '../../src/run/objectStore.js';
import { createFakeObjectStore } from '../helpers/fakeObjectStore.js';
import {
  openEvidenceWindow,
  uploadRecording,
  writeResultManifest,
} from '../../src/run/evidenceUpload.js';
import type { EvidenceFileSystem, EvidenceUploadPorts } from '../../src/run/evidenceUpload.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function temp(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'studio-store-'));
  roots.push(root);
  return root;
}

/** Every own and inherited member of an object, excluding `Object.prototype`. */
function runtimeSurface(value: object): string[] {
  const names = new Set<string>();
  let current: object | null = value;
  while (current !== null && current !== Object.prototype) {
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key === 'string' && key !== 'constructor') names.add(key);
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return [...names].sort();
}

// ── AC-2: write-only by construction ─────────────────────────────────────────────────────────

describe('AC-2 — the client is write-only by construction, not by discipline', () => {
  it('exposes exactly the permitted operation set at runtime', async () => {
    const store = createLocalObjectStore({ root: await temp() });

    // Not a scan for the words `get`, `list`, `head` or `delete` in the source — a client that
    // spelled a read `fetchObject` would pass that and fail this.
    expect(runtimeSurface(store)).toEqual([...PERMITTED_OBJECT_STORE_OPERATIONS]);
    expect(PERMITTED_OBJECT_STORE_OPERATIONS).toEqual(['put']);
  });

  it('has no callable member other than put, on either the client or the fake', async () => {
    const clients: ObjectStoreClient[] = [
      createLocalObjectStore({ root: await temp() }),
      createFakeObjectStore().client,
    ];

    for (const client of clients) {
      const callable = runtimeSurface(client).filter(
        (name) => typeof (client as unknown as Record<string, unknown>)[name] === 'function',
      );
      expect(callable).toEqual(['put']);
      for (const forbidden of ['get', 'list', 'head', 'delete', 'read', 'fetch', 'copy']) {
        expect((client as unknown as Record<string, unknown>)[forbidden]).toBeUndefined();
      }
    }
  });

  it('refuses a key that would escape the store root', async () => {
    const store = createLocalObjectStore({ root: await temp() });

    await expect(
      store.put({
        key: '../escaped.webm',
        body: { kind: 'bytes', data: new TextEncoder().encode('x') },
        contentType: 'application/octet-stream',
      }),
    ).rejects.toBeInstanceOf(ObjectStorePutError);
  });
});

// ── AC-18a: the fake's four modes ────────────────────────────────────────────────────────────

describe('AC-18a — the local fake supports the four modes ED-03 requires', () => {
  it('records a successful put, its key, its content type and its bytes', async () => {
    const journal: string[] = [];
    const fake = createFakeObjectStore({ journal });

    await fake.client.put({
      key: 'studio/60001/t/e/a.webm',
      body: { kind: 'bytes', data: new TextEncoder().encode('webm') },
      contentType: 'video/webm',
    });

    expect(fake.keys).toEqual(['studio/60001/t/e/a.webm']);
    expect(fake.puts[0]?.contentType).toBe('video/webm');
    expect(fake.puts[0]?.bytes).toBe(4);
    expect(journal).toEqual(['put:studio/60001/t/e/a.webm']);
  });

  it('distinguishes a put that failed from a store that is unreachable', async () => {
    const refused = createFakeObjectStore({ failKeys: ['k'] });
    const unreachable = createFakeObjectStore({ unavailable: true });

    const put = { key: 'k', body: { kind: 'bytes' as const, data: new Uint8Array(1) }, contentType: 'x' };

    await expect(refused.client.put(put)).rejects.toBeInstanceOf(ObjectStorePutError);
    await expect(unreachable.client.put(put)).rejects.toBeInstanceOf(ObjectStoreUnavailableError);
    // The distinction `FakeResultManifestStore.makeUnavailable` exists to prove on the API side.
    await expect(unreachable.client.put(put)).rejects.not.toBeInstanceOf(ObjectStorePutError);
  });
});

// ── AC-5: bounded, idempotent, and nothing unbounded retained ────────────────────────────────

function counting(size: number): EvidenceFileSystem & { wholeFileReads: number } {
  const port = {
    wholeFileReads: 0,
    stat: (): Promise<{ readonly size: number }> => Promise.resolve({ size }),
    readFile(): Promise<Uint8Array> {
      port.wholeFileReads += 1;
      return Promise.resolve(new Uint8Array(size));
    },
  };
  return port;
}

function ports(
  store: ObjectStoreClient,
  fileSystem: EvidenceFileSystem,
  overrides: Partial<EvidenceUploadPorts> = {},
): EvidenceUploadPorts {
  let clock = 0;
  return {
    store,
    fileSystem,
    bounds: { maxAttempts: 3, windowMs: 10_000, backoffMs: 1 },
    now: () => (clock += 1),
    sleep: () => Promise.resolve(),
    redactor: NULL_REDACTOR,
    ...overrides,
  };
}

describe('AC-5 — bounded, idempotent, and no whole-file buffer', () => {
  it('stops at the attempt bound and reports how many it made', async () => {
    const store = createFakeObjectStore({ failKeys: ['v.webm'] });
    const outcome = await uploadRecording(
      ports(store.client, counting(1024)),
      openEvidenceWindow(ports(store.client, counting(1024))),
      { videoKey: 'v.webm', path: '/scratch/v.webm', state: 'PENDING', partial: true },
    );

    expect(outcome.attempts).toBe(3);
    expect(store.attempts).toBe(3);
    expect(outcome.state).toBe('FAILED');
    // Bounded: one past the bound never happens.
    expect(store.attempts).not.toBeGreaterThan(3);
  });

  it('writes the same key with the same bytes on a retry and leaves exactly one object', async () => {
    const root = await temp();
    const source = join(root, 'page.webm');
    await writeFile(source, Buffer.from('a-real-recording'));
    const store = createLocalObjectStore({ root: join(root, 'bucket') });
    // A store that fails once then succeeds, wrapping the real client so the retry writes for real.
    let attempts = 0;
    const flaky: ObjectStoreClient = {
      put: async (request) => {
        attempts += 1;
        if (attempts === 1) throw new ObjectStorePutError('transient');
        await store.put(request);
      },
    };

    const port = counting(16);
    const outcome = await uploadRecording(
      ports(flaky, port),
      openEvidenceWindow(ports(flaky, port)),
      { videoKey: 'studio/a/b/c/d.webm', path: source, state: 'PENDING', partial: false },
    );

    expect(outcome.state).toBe('STORED');
    expect(outcome.attempts).toBe(2);
    const stored = await readdir(join(root, 'bucket', 'studio', 'a', 'b', 'c'));
    expect(stored).toEqual(['d.webm']);
    expect(await readFile(join(root, 'bucket', 'studio', 'a', 'b', 'c', 'd.webm'), 'utf8')).toBe(
      'a-real-recording',
    );
  });

  it('gives the store a file reference and never a buffer, at the fixture size and at ten times it', async () => {
    for (const size of [64 * 1024, 640 * 1024]) {
      const store = createFakeObjectStore({ resolveFile: () => Promise.resolve(new Uint8Array(size)) });
      const port = counting(size);

      const outcome = await uploadRecording(
        ports(store.client, port),
        openEvidenceWindow(ports(store.client, port)),
        {
        videoKey: 'v.webm',
        path: '/scratch/v.webm',
          state: 'PENDING',
          partial: false,
        },
      );

      expect(outcome.state).toBe('STORED');
      // (i) the argument the client actually received.
      expect(store.puts[0]?.body.kind).toBe('file');
      expect(store.puts[0]?.body).not.toHaveProperty('data');
      // (ii) the same number of whole-file reads — zero — at both sizes.
      expect(port.wholeFileReads).toBe(0);
    }
  });

  it('serializes the manifest once and hands the same array to every attempt', async () => {
    const seen: Uint8Array[] = [];
    let attempts = 0;
    const flaky: ObjectStoreClient = {
      put: (request) => {
        attempts += 1;
        if (request.body.kind === 'bytes') seen.push(request.body.data);
        if (attempts < 3) return Promise.reject(new ObjectStorePutError('transient'));
        return Promise.resolve();
      },
    };
    const bytes = new TextEncoder().encode('{"schemaVersion":1}');

    const port = counting(1);
    const written = await writeResultManifest(
      ports(flaky, port),
      openEvidenceWindow(ports(flaky, port)),
      'm.result.json',
      bytes,
      'application/json',
    );

    expect(written.ok).toBe(true);
    expect(seen).toHaveLength(3);
    // The same array object, not three renderings of the same document.
    for (const observed of seen) expect(observed).toBe(bytes);
  });

  it('closes the phase when the window expires, even with attempts left', async () => {
    const store = createFakeObjectStore({ failKeys: ['v.webm'] });
    let clock = 0;
    const slow: EvidenceUploadPorts = {
      store: store.client,
      fileSystem: counting(16),
      bounds: { maxAttempts: 50, windowMs: 100, backoffMs: 10 },
      // Each reading advances past the whole window after the first attempt.
      now: () => (clock += 60),
      sleep: () => Promise.resolve(),
      redactor: NULL_REDACTOR,
    };
    const window = { deadlineAtMs: 120 };

    const outcome = await uploadRecording(slow, window, {
      videoKey: 'v.webm',
      path: '/scratch/v.webm',
      state: 'PENDING',
      partial: false,
    });

    expect(outcome.state).toBe('FAILED');
    expect(outcome.attempts).toBeLessThan(50);
  });
});
