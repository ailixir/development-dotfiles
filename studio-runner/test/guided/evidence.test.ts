import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import fixtures from '../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json' with { type: 'json' };
import timingOrder from '../../../docs/specs/studio-observed-authoring/contracts/v3/timing-order-vectors.json' with { type: 'json' };
import { createGuidedRecorder, guidedRecordingKeys, timingScaleHolds, wireTimings, MAX_RECORDING_CALLBACK_ATTEMPTS } from '../../src/guided/evidence.js';
import type { GuidedRecorderPorts, RecordingEvidenceBody } from '../../src/guided/evidence.js';
import { validate } from '../../src/guided/contracts.js';
import { GUIDED_RECORDING_DISCLOSURE } from '../../src/run/manifest.js';
import { WEBM_MAGIC } from '../../src/run/recording.js';
import type { OriginSource } from '../../src/run/timeline.js';
import type { BridgeIdentity } from '../../src/guided/types.js';
import { createFakeObjectStore } from '../helpers/fakeObjectStore.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.reverse()) await fn(); cleanup.length = 0; });
async function root(): Promise<string> { const p = await mkdtemp(join(tmpdir(), 'guided-evidence-')); cleanup.push(() => rm(p, { recursive: true, force: true })); return p; }

const CANARY = 'obs013-recording-canary-77';
function sessionIdentity(sessionId = 'session-1'): BridgeIdentity {
  return { schemaVersion: 3, sessionId, workerId: 'worker-one', ownerFence: 4, scopeHash: 'a'.repeat(64), contextId: 'context-1', contextRevision: 1, sourceRevision: 'source-1', configurationRevision: 'config-1', versions: { contract: 3 } } as BridgeIdentity;
}
/** A driven monotonic clock: every reading is an explicit value, never a sleep. */
function drivenSource(values: number[]): OriginSource & { calls: number } {
  const source = { calls: 0, monotonicNow: () => { source.calls++; const v = values.shift(); if (v === undefined) throw new Error('CLOCK_EXHAUSTED'); return v; }, wallNow: () => new Date('2026-10-13T00:00:00.000Z') };
  return source;
}
async function harness(options: { origin?: number[]; store?: Parameters<typeof createFakeObjectStore>[0]; ports?: Partial<GuidedRecorderPorts>; csiId?: string | null; sessionId?: string } = {}) {
  const store = createFakeObjectStore(options.store);
  const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
  const source = drivenSource(options.origin ?? [1_000, 1_010.4, 1_020.6, 1_030.2, 1_045.5]);
  const ports: GuidedRecorderPorts = { store: store.client, fileSystem: { stat: async path => ({ size: (await stat(path)).size }), readFile: () => Promise.reject(new Error('whole-file read')) }, bounds: { maxAttempts: 2, windowMs: 10_000, backoffMs: 1 }, size: { width: 1280, height: 720 }, calibrationOffsetMs: 0, originSource: source, now: () => 0, sleep, evidenceRoot: await root(), ...options.ports };
  const recording = await createGuidedRecorder(ports).open({ sessionId: options.sessionId ?? 'session-1', csiId: options.csiId === undefined ? 'CSI-123' : options.csiId, maxSessionSeconds: 600 });
  const calls: { route: string; body: RecordingEvidenceBody; key: string }[] = [];
  const callback = vi.fn((route: 'recording-evidence', body: RecordingEvidenceBody, key: string) => { calls.push({ route, body, key }); return Promise.resolve(); });
  return { store, sleep, source, recording, calls, callback, ports };
}
async function playable(directory: string | null, bytes = 2048): Promise<string> {
  if (!directory) throw new Error('DIRECTORY');
  const path = join(directory, `${randomUUID()}.webm`); const body = Buffer.alloc(bytes, 7); body.set(WEBM_MAGIC, 0); await writeFile(path, body); return path;
}
function text(bytes: Uint8Array | undefined): string { return Buffer.from(bytes ?? new Uint8Array()).toString('utf8'); }

describe('guided recording keys (AR-1 R5 golden vector shared with the backend)', () => {
  it('derives every vector entry and refuses every refused entry', () => {
    for (const entry of fixtures.guidedRecordingKeyVector.derived) expect(guidedRecordingKeys(entry.csiId, entry.sessionId)).toEqual({ videoKey: entry.videoKey, manifestKey: entry.manifestKey });
    for (const entry of fixtures.guidedRecordingKeyVector.refused) expect(guidedRecordingKeys(entry.csiId, entry.sessionId)).toBeNull();
    expect(guidedRecordingKeys(null, 'session-1')).toBeNull(); expect(guidedRecordingKeys(undefined, 'session-1')).toBeNull();
    expect(new RegExp(fixtures.guidedRecordingKeyVector.segmentPattern, 'u').source).toBe('^[A-Za-z0-9_-]{1,256}$');
  });
});

describe('guided session recording lifecycle', () => {
  it('stores the video, writes the manifest, reports STORED with rounded ordered IDs-only timings and removes the directory', async () => {
    const h = await harness();
    const request = h.recording.launchRequest(); if (!request) throw new Error('REQUEST');
    expect(request.size).toEqual({ width: 1280, height: 720 }); expect(request.dir).toBe(h.recording.directory);
    expect(h.recording.launchRequest()).toBeNull(); // one recorded context per session
    expect(h.recording.begin('admission-0', 'nav', 0)).toBeNull(); // no clock before readiness
    request.ready(true); request.ready(true);
    expect(h.source.calls).toBe(1); // the origin is taken once, never re-taken (AR-1 R4)
    const first = h.recording.begin('admission-1', 'nav', 0); first?.end(true);
    const second = h.recording.begin('admission-2', 'fill', 0); second?.end(true); second?.end(false); // UNKNOWN wins
    const video = await playable(h.recording.directory);
    const state = await h.recording.settle({ identity: sessionIdentity(), videoPath: video, orderlyClose: true, callback: h.callback });
    expect(state).toBe('STORED');
    expect(h.store.puts.map(p => [p.key, p.contentType])).toEqual([['studio/CSI-123/guided/session-1.webm', 'video/webm'], ['studio/CSI-123/guided/session-1.manifest.json', 'application/json']]);
    expect(h.store.puts[0]?.body.kind).toBe('file');
    expect(h.calls).toHaveLength(1);
    const call = h.calls[0]; if (!call) throw new Error('CALL');
    expect(call.route).toBe('recording-evidence'); expect(call.key).toBe(`rec-${h.recording.recordingId}`);
    expect(call.body).toEqual({ ...sessionIdentity(), recordingId: h.recording.recordingId, state: 'STORED', partial: false, timings: [
      { kind: 'action', stepId: 'nav', admissionId: 'admission-1', ordinal: 0, startMs: 10, endMs: 21 },
      { kind: 'action', stepId: 'fill', admissionId: 'admission-2', ordinal: 0, startMs: 30, endMs: null },
    ] });
    expect(validate<RecordingEvidenceBody>('bridge', call.body, 'recordingEvidence')).toEqual(call.body);
    const manifest = JSON.parse(text(h.store.objectAt('studio/CSI-123/guided/session-1.manifest.json'))) as Record<string, unknown>;
    expect(Object.keys(manifest)).toEqual(['schemaVersion', 'kind', 'sessionId', 'recordingId', 'workerId', 'ownerFence', 'evidenceState', 'evidencePartial', 'videoKey', 'manifestKey', 'timings', 'disclosure']);
    expect(manifest).toMatchObject({ schemaVersion: 1, kind: 'guidedRecording', evidenceState: 'STORED', evidencePartial: false, timings: call.body.timings, disclosure: GUIDED_RECORDING_DISCLOSURE });
    expect(JSON.stringify(call.body)).not.toMatch(/studio\/|https?:|webm|manifest|[0-9]{4}-[0-9]{2}-[0-9]{2}T/u);
    expect(await stat(h.recording.directory ?? '').then(() => true, () => false)).toBe(false);
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: video, orderlyClose: true, callback: h.callback })).toBe('STORED');
    expect(h.calls).toHaveLength(1); // settles once
    expect(h.recording.begin('admission-3', 'next', 0)).toBeNull(); // nothing stamps after settlement
  });

  it('carries partial=true for a playable recording whose recorder did not close in order', async () => {
    const h = await harness(); const request = h.recording.launchRequest(); request?.ready(true);
    const video = await playable(h.recording.directory);
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: video, orderlyClose: false, callback: h.callback })).toBe('STORED');
    expect(h.calls[0]?.body).toMatchObject({ state: 'STORED', partial: true });
  });

  it.each([
    ['recorder never attached to the page', false, true, 'UNAVAILABLE'],
    ['recorder produced no file', true, false, 'UNAVAILABLE'],
  ] as const)('reports %s as UNAVAILABLE with no video upload and no timings', async (_name, recorded, file, expected) => {
    const h = await harness(); const request = h.recording.launchRequest(); request?.ready(recorded);
    h.recording.begin('admission-1', 'nav', 0)?.end(true);
    const video = file ? await playable(h.recording.directory) : null;
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: video, orderlyClose: true, callback: h.callback })).toBe(expected);
    expect(h.store.puts.map(p => p.key)).toEqual(['studio/CSI-123/guided/session-1.manifest.json']);
    expect(h.calls[0]?.body).toMatchObject({ state: 'UNAVAILABLE', partial: false, timings: [] });
    expect(JSON.parse(text(h.store.objectAt('studio/CSI-123/guided/session-1.manifest.json')))).toMatchObject({ evidenceState: 'UNAVAILABLE', timings: [] });
  });

  it('keeps a recorder-side fault (UNAVAILABLE) apart from a store-side fault (FAILED)', async () => {
    const recorder = await harness(); recorder.recording.launchRequest()?.ready(true);
    const truncated = join(recorder.recording.directory ?? '', 'short.webm'); await writeFile(truncated, Buffer.from(WEBM_MAGIC));
    expect(await recorder.recording.settle({ identity: sessionIdentity(), videoPath: truncated, orderlyClose: true, callback: recorder.callback })).toBe('UNAVAILABLE');
    const store = await harness({ store: { failKeys: ['studio/CSI-123/guided/session-1.webm'] } }); store.recording.launchRequest()?.ready(true);
    store.recording.begin('admission-1', 'nav', 0)?.end(true);
    expect(await store.recording.settle({ identity: sessionIdentity(), videoPath: await playable(store.recording.directory), orderlyClose: false, callback: store.callback })).toBe('FAILED');
    expect(store.calls[0]?.body).toMatchObject({ state: 'FAILED', partial: false, timings: [] });
    expect(store.store.puts.map(p => p.key)).toEqual(['studio/CSI-123/guided/session-1.manifest.json']);
  });

  it.each([null, 'CSI/123'])('fails closed for csiId %s: no recorded context, no upload, UNAVAILABLE callback', async csiId => {
    const h = await harness({ csiId });
    expect(h.recording.keys).toBeNull(); expect(h.recording.directory).toBeNull(); expect(h.recording.launchRequest()).toBeNull();
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: null, orderlyClose: true, callback: h.callback })).toBe('UNAVAILABLE');
    expect(h.store.puts).toEqual([]); expect(h.calls[0]?.body).toMatchObject({ state: 'UNAVAILABLE', partial: false, timings: [] });
  });

  it('reports UNAVAILABLE when the evidence directory cannot be created', async () => {
    const parent = await root(); const file = join(parent, 'not-a-directory'); await writeFile(file, 'x');
    const h = await harness({ ports: { evidenceRoot: file } });
    expect(h.recording.directory).toBeNull(); expect(h.recording.launchRequest()).toBeNull();
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: null, orderlyClose: true, callback: h.callback })).toBe('UNAVAILABLE');
  });

  it('resends the byte-identical body under one key at most three times, then gives up honestly', async () => {
    const h = await harness({ ports: { callbackAttempts: 10, callbackBackoffMs: 5 } });
    const failing = vi.fn<(route: 'recording-evidence', body: RecordingEvidenceBody, key: string) => Promise<void>>(() => Promise.reject(new Error('CALLBACK_DENIED')));
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: null, orderlyClose: true, callback: failing })).toBe('UNAVAILABLE');
    expect(failing).toHaveBeenCalledTimes(MAX_RECORDING_CALLBACK_ATTEMPTS);
    const bodies = failing.mock.calls.map(c => JSON.stringify(c[1])); expect(new Set(bodies).size).toBe(1);
    expect(new Set(failing.mock.calls.map(c => c[2])).size).toBe(1);
    expect(h.sleep.mock.calls.map(c => c[0])).toEqual([5, 10]);
    const retried = await harness(); let attempts = 0;
    const flaky = vi.fn(() => (++attempts < 2 ? Promise.reject(new Error('lost')) : Promise.resolve()));
    await retried.recording.settle({ identity: sessionIdentity(), videoPath: null, orderlyClose: true, callback: flaky });
    expect(flaky).toHaveBeenCalledTimes(2);
    const single = await harness({ ports: { callbackAttempts: 0 } });
    await single.recording.settle({ identity: sessionIdentity(), videoPath: null, orderlyClose: true, callback: failing });
    expect(failing).toHaveBeenCalledTimes(MAX_RECORDING_CALLBACK_ATTEMPTS + 1);
  });

  it('drops the timings, not the video, when a process-origin clock breaks the scale assertion', async () => {
    // The zero is read at process start (0) and the first action is read at process uptime.
    const h = await harness({ origin: [0, 700_000, 700_010] }); h.recording.launchRequest()?.ready(true);
    h.recording.begin('admission-1', 'nav', 0)?.end(true);
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: await playable(h.recording.directory), orderlyClose: true, callback: h.callback })).toBe('STORED');
    expect(h.calls[0]?.body).toMatchObject({ state: 'STORED', timings: [] });
  });

  it('reports UNAVAILABLE (and no canary) when the inspection port throws, and still cleans up', async () => {
    const h = await harness({ ports: { inspect: () => Promise.reject(new Error(CANARY)) } }); h.recording.launchRequest()?.ready(true);
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: null, orderlyClose: true, callback: h.callback })).toBe('UNAVAILABLE');
    expect(h.calls[0]?.body).toMatchObject({ state: 'UNAVAILABLE', timings: [] });
    for (const put of h.store.puts) expect(text(put.stored)).not.toContain(CANARY);
    expect(JSON.stringify(h.calls)).not.toContain(CANARY);
    expect(h.recording.directory && await readdir(h.recording.directory).catch(() => 'gone')).toBe('gone');
  });

  it('stops stamping at the maxActions bound', async () => {
    const origin = [0, ...Array.from({ length: 402 }, (_, i) => i + 1)];
    const h = await harness({ origin }); h.recording.launchRequest()?.ready(true);
    for (let i = 0; i < 200; i++) expect(h.recording.begin(`a-${String(i)}`, 'step', i % 8)).not.toBeNull();
    expect(h.recording.begin('a-200', 'step', 0)).toBeNull();
  });
});

describe('guided session recording discard (a learn that published keeps no recording)', () => {
  it('removes the recording without an upload, a manifest or a callback, and settles once', async () => {
    const h = await harness(); h.recording.launchRequest()?.ready(true);
    h.recording.begin('admission-1', 'nav', 0)?.end(true);
    const video = await playable(h.recording.directory);
    expect(await stat(video).then(() => true, () => false)).toBe(true);
    await h.recording.discard();
    expect(h.store.puts).toEqual([]); expect(h.callback).not.toHaveBeenCalled(); expect(h.calls).toEqual([]);
    expect(await stat(h.recording.directory ?? '').then(() => true, () => false)).toBe(false);
    expect(h.recording.begin('admission-2', 'next', 0)).toBeNull(); // nothing stamps after the discard
    await h.recording.discard(); // a repeat is harmless
    // A settle that follows joins the discard: still nothing leaves the runner.
    await h.recording.settle({ identity: sessionIdentity(), videoPath: video, orderlyClose: true, callback: h.callback });
    expect(h.store.puts).toEqual([]); expect(h.callback).not.toHaveBeenCalled();
  });

  it('discards a recording that has no directory (not recordable) without failing', async () => {
    const h = await harness({ csiId: null });
    await expect(h.recording.discard()).resolves.toBeUndefined();
    expect(h.store.puts).toEqual([]); expect(h.callback).not.toHaveBeenCalled();
  });

  it('cannot take back a recording whose settlement already started: the first of settle and discard wins', async () => {
    const h = await harness(); h.recording.launchRequest()?.ready(true);
    const video = await playable(h.recording.directory);
    const settling = h.recording.settle({ identity: sessionIdentity(), videoPath: video, orderlyClose: true, callback: h.callback });
    await h.recording.discard();
    expect(await settling).toBe('STORED');
    expect(h.store.puts.map(p => p.key)).toContain('studio/CSI-123/guided/session-1.webm');
    expect(h.calls).toHaveLength(1);
  });

  it('treats 409 RECORDING_NOT_RETAINED as the settled answer: one attempt, no backoff, nothing re-sent', async () => {
    const h = await harness({ ports: { callbackBackoffMs: 5 } }); h.recording.launchRequest()?.ready(true);
    const refused = vi.fn<(route: 'recording-evidence', body: RecordingEvidenceBody, key: string) => Promise<void>>(() => Promise.reject(new Error('RECORDING_NOT_RETAINED')));
    const state = await h.recording.settle({ identity: sessionIdentity(), videoPath: await playable(h.recording.directory), orderlyClose: true, callback: refused });
    expect(state).toBe('STORED'); // the runner's own word; the backend wrote no row
    expect(refused).toHaveBeenCalledTimes(1); expect(h.sleep).not.toHaveBeenCalled();
    expect(await stat(h.recording.directory ?? '').then(() => true, () => false)).toBe(false);
  });
});

describe('timing serialization and scale guard', () => {
  it('rounds once and orders by startMs, then ordinal, then stepId code point', () => {
    const r = (admissionId: string, stepId: string, ordinal: number, startMs: number, endMs: number | null) => ({ admissionId, stepId, ordinal, startMs, endMs });
    expect(wireTimings([r('c', 'b', 1, 5.4, 6.5), r('b', 'b', 0, 5.2, null), r('a', 'a', 0, 4.6, 5.49), r('d', 'a', 1, 5.0, 7)]).map(t => [t.admissionId, t.startMs, t.endMs])).toEqual([['a', 5, 5], ['b', 5, null], ['d', 5, 7], ['c', 5, 7]]);
  });
  it.each([
    [[{ kind: 'action' as const, stepId: 's', admissionId: 'a', ordinal: 0, startMs: -1, endMs: null }], false],
    [[{ kind: 'action' as const, stepId: 's', admissionId: 'a', ordinal: 0, startMs: 10, endMs: 9 }], false],
    [[{ kind: 'action' as const, stepId: 's', admissionId: 'a', ordinal: 0, startMs: 600_001, endMs: null }], false],
    [[{ kind: 'action' as const, stepId: 's', admissionId: 'a', ordinal: 0, startMs: 1.5, endMs: null }], false],
    [[{ kind: 'action' as const, stepId: 's', admissionId: 'a', ordinal: 0, startMs: 10, endMs: 600_001 }], false],
    [[{ kind: 'action' as const, stepId: 's', admissionId: 'a', ordinal: 0, startMs: 0, endMs: 600_000 }], true],
  ])('timingScaleHolds %#', (timings, expected) => { expect(timingScaleHolds(timings, 600)).toBe(expected); });
});

/**
 * ARCH015-03 T1 parity with the backend (validation ledger rows 83/84): the same vector file drives
 * `GuidedRecordingTimingsTest`. The runner sends action items only, so its effective order is
 * startMs, ordinal, stepId, admissionId, both identifiers in code point order.
 */
describe('timing tie parity (shared vector with GuidedRecordingTimingsTest)', () => {
  const cases = (row: number) => timingOrder.cases.filter(c => c.ledgerRow === row);
  const utf16 = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  it('distinctAdmissionsWithIdenticalMeasuredKeysRemainDistinct', () => {
    expect(cases(83)).not.toHaveLength(0);
    for (const c of cases(83)) {
      const readings = c.readings.map(r => ({ ...r }));
      expect(wireTimings(readings), c.name).toEqual(c.wire);
      expect(readings, c.name).toEqual(c.readings); // readings are never rewritten
      expect(new Set(c.wire.map(t => t.admissionId)).size).toBe(c.readings.length); // both attempts kept
    }
  });

  it('tieEndSelectionAndUnicodeOrderMatchRunner', () => {
    expect(cases(84)).not.toHaveLength(0);
    for (const c of cases(84)) {
      const wire = wireTimings(c.readings);
      expect(wire, c.name).toEqual(c.wire);
      expect(wireTimings([...c.readings].reverse()), c.name).toEqual(c.wire); // input order is irrelevant
      for (const item of wire) expect(Object.keys(item)).toEqual(['kind', 'stepId', 'admissionId', 'ordinal', 'startMs', 'endMs']);
      // The vector discriminates: a UTF-16 code-unit comparator orders these cases differently.
      if (c.utf16CodeUnitOrder !== null) {
        const legacy = [...c.wire].sort((a, b) => a.startMs - b.startMs || a.ordinal - b.ordinal || utf16(a.stepId, b.stepId) || utf16(a.admissionId, b.admissionId));
        expect(legacy.map(t => t.admissionId)).toEqual(c.utf16CodeUnitOrder);
        expect(c.utf16CodeUnitOrder).not.toEqual(wire.map(t => t.admissionId));
      }
    }
  });

  it('carries an equal-millisecond astral tie through the recording callback and never invents an absent reading', async () => {
    const c = timingOrder.cases.find(x => x.name === 'astralAdmissionTieKeepsAbsentPreNativeReadingAbsent');
    if (!c) throw new Error('VECTOR');
    // Origin 1000, both begins read 1008, end(false) reads nothing: no +1 ms, no re-read.
    const h = await harness({ origin: [1_000, 1_008, 1_008] }); h.recording.launchRequest()?.ready(true);
    for (const r of c.readings) h.recording.begin(r.admissionId, r.stepId, r.ordinal)?.end(false);
    // never-started was dispatched by the ledger but refused before its native effect: no begin().
    expect(await h.recording.settle({ identity: sessionIdentity(), videoPath: await playable(h.recording.directory), orderlyClose: true, callback: h.callback })).toBe('STORED');
    const body = h.calls[0]?.body; if (!body) throw new Error('CALL');
    expect(body.timings).toEqual(c.wire);
    expect(JSON.stringify(body.timings)).not.toContain('never-started');
    expect(validate<RecordingEvidenceBody>('bridge', body, 'recordingEvidence')).toEqual(body);
  });
});
