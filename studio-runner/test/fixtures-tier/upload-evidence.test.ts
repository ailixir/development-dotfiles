/**
 * Story 10.14 AC-8, AC-9, AC-18a, AC-20 — the evidence path against a **real recording**.
 *
 * The unit tier proves the ordering, the bounds and the failure paths against a session that
 * *reports* a recording. None of that can tell you whether a real webm — tens of kilobytes that
 * Chromium wrote incrementally and flushed on close — actually survives the upload byte for byte,
 * or whether the object at the job's key is the file that was in scratch.
 *
 * So this tier launches pinned Chromium, takes the file it leaves behind, and puts it through the
 * **real** `createLocalObjectStore` — the `ED-03` compatible store, not a fake — into a temporary
 * bucket. What is asserted is the bytes on both sides.
 *
 * The deferred criteria are recorded at the bottom as live skips, each naming the gate that has to
 * move before it can pass. **Skipped, never passed.**
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { NULL_REDACTOR } from '../../src/executor/redaction.js';
import { WEBM_MAGIC } from '../../src/run/recording.js';
import { createLocalObjectStore } from '../../src/run/objectStore.js';
import {
  openEvidenceWindow,
  uploadRecording,
  writeResultManifest,
} from '../../src/run/evidenceUpload.js';
import type { EvidenceUploadPorts } from '../../src/run/evidenceUpload.js';
import {
  RESULT_MANIFEST_CONTENT_TYPE,
  buildResultManifest,
  serializeResultManifest,
} from '../../src/run/manifest.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
import { runReal } from './realRunner.js';

let server: PageServer;
const buckets: string[] = [];

beforeAll(async () => {
  server = await startPageServer();
});

afterAll(async () => {
  await server.close();
});

afterEach(() => {
  for (const bucket of buckets.splice(0)) rmSync(bucket, { recursive: true, force: true });
});

function bucket(): string {
  const root = mkdtempSync(join(tmpdir(), 'studio-bucket-'));
  buckets.push(root);
  return root;
}

function goto(url: string) {
  return { op: 'goto' as const, url: { kind: 'literal' as const, value: url }, options: undefined };
}

/** Ports over the **real** local store, with the filesystem port that counts whole-file reads. */
function realPorts(root: string): EvidenceUploadPorts & { wholeFileReads: () => number } {
  let reads = 0;
  let clock = 0;
  return {
    store: createLocalObjectStore({ root }),
    fileSystem: {
      stat: (path: string) => Promise.resolve({ size: statSync(path).size }),
      readFile: (path: string): Promise<Uint8Array> => {
        reads += 1;
        return Promise.resolve(readFileSync(path));
      },
    },
    bounds: { maxAttempts: 3, windowMs: 15_000, backoffMs: 10 },
    now: () => (clock += 1),
    sleep: () => Promise.resolve(),
    redactor: NULL_REDACTOR,
    wholeFileReads: () => reads,
  };
}

const VIDEO_KEY = 'studio/60001/3b9c/e1/a1.webm';
const MANIFEST_KEY = 'studio/60001/3b9c/e1/a1.result.json';

describe('AC-8, AC-18a — a real Chromium recording through the real local store', () => {
  it('stores the exact bytes at the job’s key and only then reports STORED', async () => {
    const outcome = await runReal({
      steps: [{ stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] }],
    });
    try {
      const path = outcome.result.recording.path;
      expect(path, 'no recording was produced').not.toBeNull();
      expect(outcome.result.recording.state).toBe('PENDING');
      const original = readFileSync(path ?? '');
      expect([...original.subarray(0, 4)]).toEqual([...WEBM_MAGIC]);
      expect(original.length).toBeGreaterThan(1_024);

      const root = bucket();
      const ports = realPorts(root);
      const uploaded = await uploadRecording(ports, openEvidenceWindow(ports), {
        videoKey: VIDEO_KEY,
        path,
        state: outcome.result.recording.state,
        partial: outcome.result.recording.partial,
      });

      // `STORED` is earned: the store acknowledged the write before the word was used.
      expect(uploaded.state).toBe('STORED');
      expect(uploaded.attempts).toBe(1);
      expect(uploaded.bytes).toBe(original.length);

      const stored = readFileSync(join(root, VIDEO_KEY));
      expect(stored.length).toBe(original.length);
      expect(stored.equals(original)).toBe(true);
      // Streamed, at a real recording's size: the uploader read nothing whole.
      expect(ports.wholeFileReads()).toBe(0);
      // One object, at the job's key, with no staging file left behind.
      expect(readdirSync(join(root, 'studio/60001/3b9c/e1'))).toEqual(['a1.webm']);
    } finally {
      outcome.clear();
    }
  }, 180_000);

  it('writes a manifest beside it that names the same evidence disposition', async () => {
    const outcome = await runReal({
      steps: [{ stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] }],
    });
    try {
      const root = bucket();
      const ports = realPorts(root);
      const window = openEvidenceWindow(ports);
      const uploaded = await uploadRecording(ports, window, {
        videoKey: VIDEO_KEY,
        path: outcome.result.recording.path,
        state: outcome.result.recording.state,
        partial: outcome.result.recording.partial,
      });

      const manifest = buildResultManifest({
        executionId: '9f1d5c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
        attemptId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
        revisionId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60',
        artifactHash: 'sha256:abc',
        runnerInstanceId: 'studio-runner-0',
        outcome: { result: 'PASSED', errorCode: null, errorMessage: null },
        browserStartedAt: '2026-09-11T10:00:02.000Z',
        endedAt: '2026-09-11T10:00:09.000Z',
        runtimeVersions: { playwright: '1.63.0' },
        videoKey: VIDEO_KEY,
        manifestKey: MANIFEST_KEY,
        evidenceState: uploaded.state,
        evidencePartial: uploaded.partial,
      });
      const written = await writeResultManifest(
        ports,
        window,
        MANIFEST_KEY,
        serializeResultManifest(manifest, NULL_REDACTOR),
        RESULT_MANIFEST_CONTENT_TYPE,
      );

      expect(written.ok).toBe(true);
      const onDisk = JSON.parse(readFileSync(join(root, MANIFEST_KEY), 'utf8')) as {
        evidenceState: string;
        evidencePartial: boolean;
        videoKey: string;
      };
      expect(onDisk.evidenceState).toBe('STORED');
      expect(onDisk.videoKey).toBe(VIDEO_KEY);
      // The recorder's observation, carried — not recomputed from the object that was just stored.
      expect(onDisk.evidencePartial).toBe(outcome.result.recording.partial);
    } finally {
      outcome.clear();
    }
  }, 180_000);

  it('never uploads a run that produced nothing playable, and never calls it STORED', async () => {
    const root = bucket();
    const ports = realPorts(root);

    const unavailable = await uploadRecording(ports, openEvidenceWindow(ports), {
      videoKey: VIDEO_KEY,
      path: null,
      state: 'UNAVAILABLE',
      partial: false,
    });

    expect(unavailable.state).toBe('UNAVAILABLE');
    expect(unavailable.attempts).toBe(0);
    expect(readdirSync(root)).toEqual([]);
  });
});

// ── Deferred criteria — skipped, not passed ─────────────────────────────────────────────────

describe('deferred criteria — skipped, not passed', () => {
  it.skip('AC-7b — the terminal manifest is declared as a closed schema in the frozen contract (@architect, ADR-002 §12 Class B)', () => {
    // The manifest is a runner-produced body the API deserializes and it is **not** in the
    // contract, while every other such body is (§6.2). @po ruled the classification — Class B, the
    // paradigm case — and left @architect one question: should it be declared, and with what
    // shape? Requested 2026-09-11 with §5.3's five contents as the candidate and this story's
    // widened `ResultManifest` as the proposal. Until that ruling lands, AC-7a's single shared
    // fixture is the mechanism, and its weakness is stated rather than papered over: a fixture is
    // checkable and it is not a contract, and nothing stops a third consumer from guessing.
    //
    // The gate is an @architect ruling recorded in ADR-002. Nothing in this repository can turn
    // this green without it.
  });

  it.skip('AC-18b — real Sonic endpoint, write-only runner credentials scoped to studio/, read-only API credentials (ED-03, story 10.18; integrated 10.19)', () => {
    // The client-side half is proven today: `ObjectStoreClient` has one operation and cannot
    // express a read (AC-2, asserted on the runtime surface). The **credential** half is a
    // deployment fact this story cannot create and does not claim — endpoint, bucket, path-style
    // access, encrypted transport and storage under platform policy.
    //
    // The gate is `ED-03`, owner Platform/SRE, status open.
  });

  it.skip('AC-19b — verified lifecycle configuration on real Sonic: physical deletion, versioning/noncurrent objects, incomplete-upload cleanup (ED-03, story 10.18)', () => {
    // Logical expiry is enforced by the API at `videoExpiresAt` today and is asserted by
    // `EvidenceRetentionTest` and `ExecutionSnapshotMapperTest` — that half needs no bucket.
    //
    // Deletion is **tracked**, not assumed. §6.2 forbids claiming exact-time physical removal
    // before Sonic's behaviour is verified, and nothing in this story's code, tests or docs makes
    // that claim; a reviewer may check by grepping the delivered artefacts for one.
    //
    // The gate is `ED-03`, owner Platform/SRE, status open.
  });

  it.skip('AC-26 (O-14) — promote RunnerEvidence.partial from optional to required in the frozen contract', () => {
    // Three conditions, each checked rather than assumed:
    //
    //   (i)   AC-10 and AC-11 have landed — **satisfied** by this story.
    //   (ii)  the merged runner emits `partial` on every FINAL, `false` included — **satisfied**;
    //         `evidence` is declared non-nullable before the `try` and `sendFinal` takes it
    //         non-optionally, so "absent" is unreachable. Re-read on the tree as merged.
    //   (iii) @architect has ruled that the promotion may land — **NOT satisfied**. §17.5 is a
    //         rationale, not an authorization: it records the edit as O-14 "rather than done now",
    //         §18.4 lists O-14 as open, and §12 requires the architect to rule first, in the ADR.
    //         Requested 2026-09-11, at the start of this story rather than at its gate. No ruling
    //         had landed by the time AC-10 and AC-11 were green.
    //
    // And `FOC-05` orders it regardless: story 10.17's AC-18 asserts `docs/specs/studio/openapi.yaml`
    // byte-unchanged and 10.13's `BASE_SHA256` untouched, and instructs its implementer to *report*
    // a red pin rather than fix one. Landing this first would stall 10.17 on a pin it is forbidden
    // to move. 10.17 had not merged when this story closed.
    //
    // Owner, verbatim from ADR-002 §18.4: "story 10.14 or the first story after it to touch
    // `RunnerEvidence`". Outstanding request dated 2026-09-11.
  });
});
