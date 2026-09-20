/**
 * The runner's object store client — **write-only by construction** (story 10.14 AC-2, AC-5,
 * AC-18a; architecture §6.2, §9.2).
 *
 * ## One operation, and the type is the guarantee
 *
 * §6.2: *"Runner writes only this prefix; API/recovery read only. Runner has no Get/List
 * permissions."* That is a deployment fact about credentials (`ED-03`, story 10.18) and it is not
 * the only place it should be true. {@link ObjectStoreClient} exposes exactly one operation —
 * {@link ObjectStoreClient.put} — and no `get`, no `list`, no `head` and no `delete`. A caller
 * cannot read an object through this type, so a credential scope regression cannot be *used* by
 * this process even if it happens.
 *
 * This mirrors {@code ResultManifestStore}'s deliberate three-things-it-cannot-do on the API side,
 * and for the same reason: the narrow surface is the design, not a convention a reviewer enforces.
 *
 * ## The body is a file reference or bytes, never a whole-file buffer
 *
 * A recording is the largest thing this runner ever handles and the terminal path is the moment
 * with the least headroom. {@link ObjectBody} therefore has two shapes, and the video always takes
 * the first:
 *
 * - `{ kind: 'file', path }` — the client streams from the scratch file. Nothing reads it whole.
 * - `{ kind: 'bytes', data }` — for a body that is already a bounded in-memory value, which is the
 *   manifest and nothing else. Its bytes are serialized **once**, the same discipline
 *   `reportClient.deliverTerminal` applies to the `FINAL` body, for the same reason.
 *
 * A retry re-opens the file; it never holds a buffer between attempts (AC-5).
 *
 * ## Unreachable is not "the put failed"
 *
 * {@link ObjectStoreUnavailableError} exists for the same reason `ResultManifestStore.isAvailable`
 * does on the API side: an unreachable store must not be mistaken for a store that answered. Both
 * end the run with evidence `FAILED` and a delivered result (AC-4), but they are different facts
 * and the diagnostic says which one happened.
 */
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

/** What the caller hands the client. Never a `Buffer` of a recording (AC-5). */
export type ObjectBody =
  | {
      readonly kind: 'file';
      /** Absolute path inside the per-run scratch directory. Streamed, never read whole. */
      readonly path: string;
    }
  | {
      readonly kind: 'bytes';
      /** A bounded value serialized once by its producer. */
      readonly data: Uint8Array;
    };

export interface PutObjectRequest {
  /**
   * The key the **job** supplied, echoed.
   *
   * The runner never derives, computes, normalizes or defaults a key (§6.2, AC-1). This type
   * cannot be called with a key the job did not supply because no code path here builds one.
   */
  readonly key: string;
  /** Deadline shared by video and manifest upload. */
  readonly signal?: AbortSignal;
  readonly body: ObjectBody;
  readonly contentType: string;
}

/**
 * The whole surface. There is no read here and there is no way to add one without changing this
 * declaration, which is the point.
 */
export interface ObjectStoreClient {
  put(request: PutObjectRequest): Promise<void>;
}

/** Every operation this client is permitted to expose. Asserted at runtime by AC-2's test. */
export const PERMITTED_OBJECT_STORE_OPERATIONS = ['put'] as const;

/**
 * The store could not be reached at all — as distinct from a store that answered and refused.
 *
 * The distinction is the one `FakeResultManifestStore.makeUnavailable` exists to prove on the API
 * side, and story 10.14 AC-21 asserts it through the real write path.
 */
export class ObjectStoreUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ObjectStoreUnavailableError';
  }
}

/** The store answered and refused the write. */
export class ObjectStorePutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ObjectStorePutError';
  }
}

export interface LocalObjectStoreOptions {
  /**
   * Filesystem root the local compatible store writes under.
   *
   * Local development shares this directory with the API and worker. Remote deployments use
   * the AWS S3 adapter instead. Keep this directory outside disposable runner scratch.
   */
  readonly root: string;
}

/**
 * A local, filesystem-backed, S3-shaped compatible store (`ED-03` fallback).
 *
 * Idempotent by construction: a put writes to a temporary name in the destination directory and
 * renames over the key, so a retry of the same key with the same bytes leaves exactly **one**
 * object and never a suffixed second one (AC-5).
 */
export function createLocalObjectStore(options: LocalObjectStoreOptions): ObjectStoreClient {
  const root = resolve(options.root);

  return {
    async put(request: PutObjectRequest): Promise<void> {
      const target = resolveKey(root, request.key);
      try {
        await mkdir(dirname(target), { recursive: true });
      } catch (error) {
        throw new ObjectStoreUnavailableError(
          'The object store root could not be opened for writing.',
          { cause: error },
        );
      }
      // One fixed temporary name per key, not a random one: a retry reuses it and cannot leave a
      // second object behind if the process dies between the write and the rename.
      const staging = `${target}.partial`;
      try {
        if (request.body.kind === 'bytes') {
          await writeFile(staging, request.body.data, { signal: request.signal });
        } else {
          await pipeline(createReadStream(request.body.path), createWriteStream(staging), { signal: request.signal });
        }
        await rename(staging, target);
      } catch (error) {
        throw new ObjectStorePutError(`The object at key ${request.key} was not written.`, {
          cause: error,
        });
      }
    },
  };
}

/** Resolves a key under the root and refuses one that would escape it. */
function resolveKey(root: string, key: string): string {
  const target = resolve(join(root, key));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new ObjectStorePutError('The object key resolves outside the store root.');
  }
  return target;
}

/** One recorded call on {@link createFakeObjectStore}. */
export interface RecordedPut {
  readonly key: string;
  readonly contentType: string;
  /** The body **as the client received it** — the argument AC-5 (i) is decided on. */
  readonly body: ObjectBody;
  /** Bytes the client actually consumed, counted as they streamed past. */
  readonly bytes: number;
  /** The stored bytes, so AC-6 can assert on what left the process. */
  readonly stored: Uint8Array;
}

export interface FakeObjectStoreOptions {
  /** Keys whose put throws {@link ObjectStorePutError}. */
  readonly failKeys?: readonly string[];
  /** The whole store is unreachable; every put throws {@link ObjectStoreUnavailableError}. */
  readonly unavailable?: boolean;
  /** Fails the first N attempts on any key, then succeeds — for AC-5's retry assertions. */
  readonly failFirstAttempts?: number;
  /** Shared call log, so an ordering test can interleave store calls with other events. */
  readonly journal?: string[];
  /**
   * Resolves a `file` body without touching the filesystem.
   *
   * The unit tier drives fake sessions whose recording path names no real file. Supplying this
   * keeps those tests about the terminal path rather than about temp-file plumbing. When it is
   * absent the fake streams the real file exactly as {@link createLocalObjectStore} does, which is
   * what the ordering, canary and retained-bytes tests use.
   */
  readonly resolveFile?: (path: string) => Promise<Uint8Array>;
}

/**
 * The fake, and the inspection that goes with it.
 *
 * The inspection is deliberately **beside** the client rather than on it. A fake that carried an
 * `objectAt` would be an `ObjectStoreClient` with a read on it, and AC-2's runtime-surface
 * assertion is applied to the fake as well as to the real client — a store double that could be
 * read from would quietly make "write-only by construction" false for every test that used it.
 */
export interface FakeObjectStore {
  /** What production code is handed. One operation, and no way to read anything back. */
  readonly client: ObjectStoreClient;
  readonly puts: readonly RecordedPut[];
  /** Distinct keys that hold an object. AC-5's "exactly one object" is decided on this. */
  readonly keys: readonly string[];
  /** Total number of times {@link ObjectStoreClient.put} was entered, retries included. */
  readonly attempts: number;
  objectAt(key: string): Uint8Array | undefined;
}

/**
 * The local fake `ED-03` requires (AC-18a): a successful put, a failing put, an unreachable store,
 * and a recorded call log.
 *
 * It streams a `file` body exactly as the real client does, so a test that hands it a whole-file
 * buffer is visibly different from one that hands it a path.
 */
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

/** Consumes a body the way the real client does — streaming a file, copying bounded bytes. */
async function drain(body: ObjectBody): Promise<Uint8Array> {
  if (body.kind === 'bytes') {
    return Uint8Array.from(body.data);
  }
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
