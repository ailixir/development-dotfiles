import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import {
  ObjectStorePutError,
  ObjectStoreUnavailableError,
} from '../../src/run/objectStore.js';
import type {
  ObjectBody,
  ObjectStoreClient,
  PutObjectRequest,
} from '../../src/run/objectStore.js';

export interface RecordedPut {
  readonly key: string;
  readonly contentType: string;
  readonly body: ObjectBody;
  readonly bytes: number;
  readonly stored: Uint8Array;
}

export interface FakeObjectStoreOptions {
  readonly failKeys?: readonly string[];
  readonly unavailable?: boolean;
  readonly failFirstAttempts?: number;
  readonly journal?: string[];
  readonly resolveFile?: (path: string) => Promise<Uint8Array>;
}

export interface FakeObjectStore {
  readonly client: ObjectStoreClient;
  readonly puts: readonly RecordedPut[];
  readonly keys: readonly string[];
  readonly attempts: number;
  objectAt(key: string): Uint8Array | undefined;
}

/** Test-only object store with controllable failures and an inspection surface. */
export function createFakeObjectStore(options: FakeObjectStoreOptions = {}): FakeObjectStore {
  const puts: RecordedPut[] = [];
  const objects = new Map<string, Uint8Array>();
  const failKeys = new Set(options.failKeys ?? []);
  let attempts = 0;

  const client: ObjectStoreClient = {
    async put(request: PutObjectRequest): Promise<void> {
      attempts += 1;
      options.journal?.push(`put:${request.key}`);
      if (options.unavailable === true) {
        throw new ObjectStoreUnavailableError('The object store is unreachable.');
      }
      if (failKeys.has(request.key)) {
        throw new ObjectStorePutError(`The object at key ${request.key} was not written.`);
      }
      if (options.failFirstAttempts !== undefined && attempts <= options.failFirstAttempts) {
        throw new ObjectStorePutError(`The object at key ${request.key} was not written.`);
      }
      const stored =
        request.body.kind === 'file' && options.resolveFile !== undefined
          ? await options.resolveFile(request.body.path)
          : await drain(request.body);
      objects.set(request.key, stored);
      puts.push({
        key: request.key,
        contentType: request.contentType,
        body: request.body,
        bytes: stored.length,
        stored,
      });
    },
  };

  return {
    client,
    get puts(): readonly RecordedPut[] {
      return puts;
    },
    get keys(): readonly string[] {
      return [...objects.keys()];
    },
    get attempts(): number {
      return attempts;
    },
    objectAt(key: string): Uint8Array | undefined {
      return objects.get(key);
    },
  };
}

async function drain(body: ObjectBody): Promise<Uint8Array> {
  if (body.kind === 'bytes') return Uint8Array.from(body.data);
  const size = (await stat(body.path)).size;
  const chunks: Buffer[] = [];
  let consumed = 0;
  for await (const chunk of createReadStream(body.path)) {
    const buffer = chunk as Buffer;
    consumed += buffer.length;
    chunks.push(buffer);
  }
  if (consumed !== size) {
    throw new ObjectStorePutError('The streamed body did not match the file size.');
  }
  return Uint8Array.from(Buffer.concat(chunks));
}
