import { gotoPage, guidedChildLaunch } from './helpers/guidedLaunch.js';
import type { Launch } from './helpers/guidedLaunch.js';
import { stepOp } from '../helpers/stepCode.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
/**
 * STUDIO-OBS-013 AC-1, AC-2, AC-5, AC-6 (runner half) — the guided learn run is recorded, on real
 * Chromium, through the replay recording pipeline.
 *
 * - The OBS-007 persistent context (pre-written Preferences) is launched as a recorded context and
 *   the webm is finalized by `context.close()` (AR-1 SC-2).
 * - The evidence directory survives the browser's own scratch disposal until the upload attempt,
 *   and is removed after it.
 * - One action timing per dispatched action, IDs and integers only, on the readiness origin.
 * - The observed replay adapter runs on the guided-mode recorded handle (adapter parity).
 * - A recorder-side fault mid-session settles as UNAVAILABLE and the session still terminates.
 * - Zero canary hits in the callback body, the guided manifest and the stored objects.
 * - AR-QA SEC-001 (ar-qa-sec001-oracle-revision.json): no startup-probe (chrome://) frame in the
 *   uploaded video, decoded at full resolution against a bounded app region (A, T1), with a per-run
 *   positive control on the real probe pages (T2). B (first paint at -250..+500 ms of the first
 *   action) is a seek-alignment oracle only, not SEC-001 evidence.
 *
 * `test/fixtures-tier/recording-coverage.test.ts` named by the story was deleted by STUDIO-OBS-012A
 * (artifact-1 replay path), so the guided mode gets this file instead of an extension.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Actual native WebM decoding oracle only; fixed ffmpeg/ffprobe executables, never production execution.
import { execFileSync } from 'node:child_process';
// eslint-disable-next-line no-restricted-imports -- AR-QA SEC-001 T2 positive control only: a plain recorded context showing the real chrome:// probe pages.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, realpath, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import { GuidedLaunchFailure } from '../../src/run/guidedBrowser.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { createGuidedRecorder } from '../../src/guided/evidence.js';
import type { RecordingEvidenceBody } from '../../src/guided/evidence.js';
import { hash, identity, validate } from '../../src/guided/contracts.js';
import type { Action, BridgeBootstrap, BridgeObservation, BridgeOrdinaryOutcome as BridgeOutcome, ExecutionEvidence } from '../../src/guided/types.js';
import type { GuidedRecordingRequest } from '../../src/run/guidedBrowser.js';
import type { ObservationConfig } from '../../src/run/observationTypes.js';
import { createConfiguredObjectStore, evidenceBoundsFrom, NODE_EVIDENCE_FILE_SYSTEM } from '../../src/run/objectStoreFactory.js';
import type { PutObjectRequest } from '../../src/run/objectStore.js';
import { loadEvidenceConfig } from '../../src/server/config.js';
import { GUIDED_RECORDING_DISCLOSURE } from '../../src/run/manifest.js';
import { MIN_PLAYABLE_RECORDING_BYTES, WEBM_MAGIC } from '../../src/run/recording.js';
import { systemOriginSource } from '../../src/run/timeline.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { executeObservedReplay } from '../../src/executor/observedReplay.js';
import type { Execute3, Scope } from '../../src/executor/observedOperations.js';
import { hashObserved, OBSERVED_PROFILE } from '../../src/validator/observedReferencePolicy.js';
import publicationJson from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with { type: 'json' };
import type {PublicationDocument} from '../helpers/publicationFixture.js';
import { startSecretLoginFixture } from '../fixtures/secret-login/server.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';
import {evidencePath} from '../helpers/evidenceOut.js';
// Typed view of the static JSON import: the file exceeds tsserver's 4 MiB non-TS limit, so ESLint's projectService types it as `error`.
const publication=publicationJson as unknown as PublicationDocument;

const CANARY = 'obs013-guided-recording-canary-5c2e';
let fixture: Awaited<ReturnType<typeof startSecretLoginFixture>>;
beforeAll(async () => { fixture = await startSecretLoginFixture(CANARY); });
afterAll(async () => { await fixture.close(); });

async function scan(directory: string): Promise<string[]> {
  const hits: string[] = [];
  if (!existsSync(directory)) return hits;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) hits.push(...await scan(path));
    else if (entry.isFile()) { const bytes = await readFile(path); if ([Buffer.from(CANARY), Buffer.from(CANARY, 'utf16le'), Buffer.from(Buffer.from(CANARY).toString('base64'))].some(value => bytes.includes(value))) hits.push(path); }
  }
  return hits;
}
function webm(bytes: Uint8Array): boolean { return bytes.length >= MIN_PLAYABLE_RECORDING_BYTES && WEBM_MAGIC.every((b, i) => bytes[i] === b); }
/** Blank white, per channel (the replay bootstrap-video oracle's threshold). */
const WHITE = 245;
type Box = [number, number, number, number];
/** Bounding box of the non-white pixels of one rgb24 frame, or null for a blank white frame. */
function boxOf(frame: Uint8Array, width: number): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let p = 0; p * 3 < frame.length; p++) if ((frame[p * 3] ?? 0) < WHITE || (frame[p * 3 + 1] ?? 0) < WHITE || (frame[p * 3 + 2] ?? 0) < WHITE) { const x = p % width, y = Math.floor(p / width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}
/** Non-white pixels of `frame` outside `box`. */
function outsideBox(frame: Uint8Array, width: number, box: Box): number {
  let outside = 0;
  for (let p = 0; p * 3 < frame.length; p++) { const x = p % width, y = Math.floor(p / width); if ((x < box[0] || x > box[2] || y < box[1] || y > box[3]) && ((frame[p * 3] ?? 0) < WHITE || (frame[p * 3 + 1] ?? 0) < WHITE || (frame[p * 3 + 2] ?? 0) < WHITE)) outside++; }
  return outside;
}
/** Solid-colour runs (per-channel tolerance 12) in the busiest row: 1 for white, 2-3 for a solid surface, many for text. */
function maxRowRuns(frame: Uint8Array, width: number): number {
  let most = 0;
  for (let row = 0; row * width * 3 < frame.length; row++) {
    let runs = 1, base = row * width * 3;
    for (let x = 1; x < width; x++) { const o = (row * width + x) * 3; if (Math.abs((frame[o] ?? 0) - (frame[base] ?? 0)) > 12 || Math.abs((frame[o + 1] ?? 0) - (frame[base + 1] ?? 0)) > 12 || Math.abs((frame[o + 2] ?? 0) - (frame[base + 2] ?? 0)) > 12) { runs++; base = o; } }
    most = Math.max(most, runs);
  }
  return most;
}
/** A frame with no glyph or edge content: white, or Chromium's initial solid surface over Playwright's gray pad. */
const CONTENT_FREE_MAX_RUNS = 6;
/** Full-resolution rgb24 decode (no scale filter: area scaling cannot establish frame absence). */
function decodeRgb(video: string, seconds: number): Buffer {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-t', String(seconds), '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { timeout: 60_000, maxBuffer: 1024 * 1024 * 1024 });
}

/**
 * The app's own paint, measured independently of the run under test: a separate recorded guided
 * launch (same Chromium, same recording size) navigates to the login page, and the last decoded
 * frame of that recording is the settled login page.
 */
async function loginReference(size: { width: number; height: number }): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'guided-reference-'));
  try {
    const guided = await launchGuidedBrowser({ sessionId: 'reference', scopeHash: 'd'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] }, 'reference-context', () => undefined, { dir, size, ready: () => undefined });
    try { await gotoPage(guided, fixture.origin + '/login'); await new Promise(r => { setTimeout(r, 500); }); } finally { await guided.close(); }
    const video = await guided.recordedVideo?.(); if (!video) throw new Error('REFERENCE_VIDEO');
    return lastFrame(video, size);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
/**
 * AR-QA SEC-001 T2 positive control: a plain recorded persistent context (same Chromium channel and size)
 * showing the real startup-probe pages, decoded whole. Only counts leave this function: the frames
 * show the local profile path and command line, and the directory is removed in `finally`.
 */
async function probePagesControl(size: { width: number; height: number }, app: Box): Promise<{ frames: number; flaggedFrames: number; maxOutsideApp: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'guided-probe-control-'));
  try {
    // Persistent, like the guided probe: chrome://prefs-internals does not exist off the record.
    const videoDir = join(dir, 'video'), context = await chromium.launchPersistentContext(join(dir, 'profile'), { channel: 'chromium', headless: true, chromiumSandbox: true, args: [], viewport: size, recordVideo: { dir: videoDir, size } });
    let video: string | undefined;
    try {
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto('chrome://version/'); await new Promise(r => { setTimeout(r, 300); });
      await page.goto('chrome://prefs-internals/'); await new Promise(r => { setTimeout(r, 300); });
      await context.close(); video = await page.video()?.path();
    } finally { await context.close().catch(() => undefined); }
    if (!video) throw new Error('CONTROL_VIDEO');
    const pixels = decodeRgb(video, 60), frameBytes = size.width * size.height * 3;
    if (pixels.length % frameBytes !== 0) throw new Error('CONTROL_DECODE');
    let flaggedFrames = 0, maxOutsideApp = 0;
    for (let index = 0; index * frameBytes < pixels.length; index++) {
      const frame = pixels.subarray(index * frameBytes, (index + 1) * frameBytes), outside = outsideBox(frame, size.width, app);
      if (maxRowRuns(frame, size.width) > CONTENT_FREE_MAX_RUNS) { maxOutsideApp = Math.max(maxOutsideApp, outside); if (outside >= 10_000) flaggedFrames++; }
    }
    return { frames: pixels.length / frameBytes, flaggedFrames, maxOutsideApp };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const areaOf = (box: Box): number => (box[2] - box[0] + 1) * (box[3] - box[1] + 1);
/** The final decoded frame (Playwright re-emits the last frame on close, so this is the settled page). */
function lastFrame(video: string, size: { width: number; height: number }): Uint8Array {
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-sseof', '-1', '-i', video, '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { timeout: 60_000, maxBuffer: 1024 * 1024 * 1024 }), frameBytes = size.width * size.height * 3;
  if (pixels.length < frameBytes || pixels.length % frameBytes !== 0) throw new Error('LAST_FRAME_DECODE');
  return pixels.subarray(pixels.length - frameBytes);
}

async function guidedLearnRun(fault: 'none' | 'recorderFileLost' | 'published') {
  const root = await mkdtemp(join(tmpdir(), 'guided-recording-')); const objects = join(root, 'objects'), evidenceRoot = join(root, 'evidence'), journal = join(root, 'journal');
  const settings = loadEvidenceConfig({ STUDIO_RUNNER_OBJECT_STORE_DIR: objects, STUDIO_RUNNER_SCRATCH_DIR: join(root, 'scratch') });
  const configured = createConfiguredObjectStore(settings);
  const ordering: { key: string; fileExists: boolean; scratchGone: boolean }[] = [];
  let scratch: string | undefined; let request: GuidedRecordingRequest | undefined;
  const store = { async put(put: PutObjectRequest) { ordering.push({ key: put.key, fileExists: put.body.kind === 'file' ? existsSync(put.body.path) : true, scratchGone: scratch !== undefined && !existsSync(scratch) }); await configured.store.put(put); } };
  await mkdir(evidenceRoot); await mkdir(journal);
  const recorder = createGuidedRecorder({ store, fileSystem: NODE_EVIDENCE_FILE_SYSTEM, bounds: evidenceBoundsFrom(settings), size: { width: settings.recordingWidth, height: settings.recordingHeight }, calibrationOffsetMs: settings.seekOriginCalibrationMs, originSource: systemOriginSource, now: () => performance.now(), sleep: ms => new Promise(resolve => { setTimeout(resolve, ms); }), evidenceRoot });
  const context = guidedContext(fixture.origin); const destination = context.authoredInputs.inputs[0]; if (!destination || !('value' in destination)) throw new Error('DESTINATION'); destination.value = fixture.origin + '/login';
  context.authoredInputs.inputs.push({ inputId: 'input-pass', sourceStepId: 'fill', kind: 'secretRef', secretId: 'PASS', provenance: { referenceKind: 'configuration', configurationRevision: context.configurationRevision, stepId: 'fill', referenceId: 'reference-pass', referenceName: 'PASS', kind: 'secretRef' } });
  context.authoredInputsHash = hash(context.authoredInputs);
  const messages: { route: string; body: unknown; key?: string }[] = [];
  const launch: Launch = async (config, contextId, onLost, recording, startup) => { request = recording; const browser = await guidedChildLaunch(config, contextId, onLost, recording, startup); scratch = browser.scratchDirectory; return browser; };
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, allowedDomains: TEST_DOMAINS, journalDirectory: journal, launch, recorder, csiId: 'fixture-csi', callback: (route, body, key) => { messages.push({ route, body, ...(key ? { key } : {}) }); return Promise.resolve(); } });
  const outcomes: BridgeOutcome[] = [];
  try {
    await runtime.start();
    let evidence: ExecutionEvidence = (messages.find(m => m.route === 'bootstrap-evidence')?.body as BridgeBootstrap).executionEvidence;
    const latest = () => (messages.filter(m => m.route === 'observations').at(-1)?.body as BridgeObservation).observation;
    const act = async (step: string, operation: Action['operation'], secret?: string) => {
      const p = proposal(context, evidence, step, operation);
      const prepared = await runtime.prepare({ ...identity(context), proposal: p, requestDigest: hash(p), expiresAt: new Date(Date.now() + 10_000).toISOString() });
      const outcome = await runtime.dispatch({ ...dispatch(context, p, prepared), ...(secret ? { secrets: [{ secretId: 'PASS', value: secret, versionId: 'fixture', allowedOrigins: [fixture.origin] }] } : {}) });
      outcomes.push(outcome); const o = latest();
      evidence = { kind: 'observedDocument', sessionId: context.sessionId, contextId: context.contextId, documentId: o.documentId, generation: o.generation, origin: o.origin, observationHash: hash(o) };
      return outcome;
    };
    expect((await act('nav', stepOp('await page.goto(inputs["input-nav"]);', { uses: [{ kind: 'input', id: 'input-nav' }] }))).ledger.state).toBe('SUCCEEDED');
    expect((await act('fill', stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);', { uses: [{ kind: 'secret', id: 'PASS' }] }), CANARY)).ledger.state).toBe('SUCCEEDED');
    if (fault === 'recorderFileLost') {
      // Recorder-side fault, not a store fault: the recorder's file disappears mid-session.
      const files = request ? await readdir(request.dir) : []; expect(files).toHaveLength(1); for (const file of files) await unlink(join(request?.dir ?? '', file));
    }
    if (!Object.values(latest().facts).some(fact => fact.name === 'Sign in')) throw new Error('SIGN_IN');
    expect((await act('submit', stepOp('await page.getByRole("button", { name: "Sign in", exact: true }).click();'))).ledger.state).toBe('SUCCEEDED');
    expect(fixture.receipts().at(-1)).toMatchObject({ accepted: true });
    // OBS-007 profile canary scan with recording on: the live profile and the evidence dir.
    expect(scratch && existsSync(scratch)).toBe(true); expect(await scan(scratch ?? '')).toEqual([]); expect(await scan(evidenceRoot)).toEqual([]);
  } finally { await runtime.stop(fault === 'published' ? 'PUBLISHED' : 'CANCELLED'); }
  // PUBLISHED is a stop reason only: the runner reports no lifecycle for it.
  expect(runtime.active).toBe(false); expect(messages.some(m => m.route === 'lifecycle')).toBe(fault !== 'published');
  await runtime.recordingSettled; configured.close();
  if (process.env.R13_PROBE_REPORT) process.stdout.write(`R13_PROBE ${JSON.stringify({ fault, evidence: messages.filter(m => m.route === 'recording-evidence'), ordering, objects: await Promise.all((await readdir(join(objects, 'studio', 'fixture-csi', 'guided')).catch(() => [])).map(async name => ({ name, bytes: (await readFile(join(objects, 'studio', 'fixture-csi', 'guided', name))).byteLength }))) })}\n`);
  return { root, objects, evidenceRoot, context, messages, outcomes, ordering, request, scratch };
}

describe('guided learn run recording on real Chromium (STUDIO-OBS-013)', () => {
  it('records the persistent context, uploads after browser scratch disposal, and reports one timing per dispatched action', async () => {
    const run = await guidedLearnRun('none');
    try {
      const evidence = run.messages.filter(m => m.route === 'recording-evidence'); expect(evidence).toHaveLength(1);
      const body = evidence[0]?.body as RecordingEvidenceBody; expect(validate('bridge', body, 'recordingEvidence')).toEqual(body);
      expect(evidence[0]?.key).toBe(`rec-${body.recordingId}`);
      expect(body).toMatchObject({ ...identity(run.context), state: 'STORED', partial: false });
      expect(body.timings.map(t => t.admissionId)).toEqual(run.outcomes.map(o => o.ledger.admission.admissionId));
      for (const t of body.timings) { expect(t.kind).toBe('action'); expect(t.startMs).toBeGreaterThanOrEqual(0); expect(t.endMs).not.toBeNull(); expect(t.startMs).toBeLessThan(120_000); }
      const prefix = join(run.objects, 'studio', 'fixture-csi', 'guided', run.context.sessionId);
      expect(webm(await readFile(`${prefix}.webm`))).toBe(true); // SC-2: finalized on context close
      // AR-QA SEC-001: decode the uploaded object, not the evidence-dir file. a0 = the navigate.
      // Playwright's webm starts at the first screencast frame, not at ready(): frame 0 may be the
      // app's own first paint (pts 0 < a0) or Chromium's initial solid surface on the gray pad. So
      // A is stated on content, not on the a0 boundary: every frame of [0, a0 + 1 s] is either
      // content-free (white or a solid surface) or shows only the app, i.e. no non-white pixel
      // outside the app region (the reference login page's and this run's settled final page's
      // boxes, padded 8 px). Startup-probe (chrome://) footage is content outside that region.
      const video = `${prefix}.webm`, a0 = body.timings[0]?.startMs, size = run.request?.size;
      if (a0 === undefined || !size) throw new Error('TIMING');
      const frameBytes = size.width * size.height * 3, loginBox = boxOf(await loginReference(size), size.width), finalBox = boxOf(lastFrame(video, size), size.width);
      if (!loginBox || !finalBox) throw new Error('APP_REFERENCE');
      const app: Box = [Math.max(0, Math.min(loginBox[0], finalBox[0]) - 8), Math.max(0, Math.min(loginBox[1], finalBox[1]) - 8), Math.min(size.width - 1, Math.max(loginBox[2], finalBox[2]) + 8), Math.min(size.height - 1, Math.max(loginBox[3], finalBox[3]) + 8)];
      // T1: the region and both boxes are capped at 10% of the frame. The final box comes from the run
      // under test, so an error or chrome:// page left on screen could otherwise grow the region over
      // the viewport and make A pass vacuously; the cap keeps at least 90% of every frame checked.
      const frameArea = size.width * size.height, appRegionArea = areaOf(app), control = await probePagesControl(size, app);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', video], { encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024 })) as { frames: { best_effort_timestamp_time: string }[] };
      const pts = (index: number): number => Math.round(Number(probe.frames[index]?.best_effort_timestamp_time) * 1000);
      const windowPixels = decodeRgb(video, (a0 + 1000) / 1000);
      const frames = Array.from({ length: Math.floor(windowPixels.length / frameBytes) }, (_, index) => { const frame = windowPixels.subarray(index * frameBytes, (index + 1) * frameBytes), runs = maxRowRuns(frame, size.width); return { index, ms: pts(index), box: boxOf(frame, size.width), maxRowRuns: runs, contentFree: runs <= CONTENT_FREE_MAX_RUNS, outsideApp: outsideBox(frame, size.width, app) }; });
      const firstApp = frames.find(f => !f.contentFree), t1 = firstApp?.ms, offending = frames.filter(f => !f.contentFree && f.outsideApp > 0);
      const facts = { oracle: 'AR-QA SEC-001 A (content) and B (offset); r13/qa-fixes/README.json oracleRevision', decode: 'ffmpeg full-resolution rgb24, no scale filter', frameSize: size, whiteThreshold: WHITE, contentFreeMaxRowRuns: CONTENT_FREE_MAX_RUNS, loginBox, finalBox, appRegion: app, appRegionArea, appRegionAreaRatio: appRegionArea / frameArea, loginBoxAreaRatio: areaOf(loginBox) / frameArea, finalBoxAreaRatio: areaOf(finalBox) / frameArea, positiveControl: control, a0, t1: t1 ?? null, t1MinusA0: t1 === undefined ? null : t1 - a0, firstAppFrameIndex: firstApp?.index ?? null, offendingFrames: offending.map(f => f.index), probedFrames: probe.frames.length, actionTimings: body.timings.map(t => t.startMs), frames };
      await writeFile(evidencePath('STUDIO-OBS-013/r13/sec001-guided-video-oracle.json'), JSON.stringify(facts, null, 2) + '\n');
      expect(windowPixels.length % frameBytes).toBe(0); expect(frames.length).toBeGreaterThan(0); expect(frames.length).toBeLessThanOrEqual(probe.frames.length);
      expect(appRegionArea).toBeLessThanOrEqual(0.10 * frameArea); expect(areaOf(loginBox)).toBeLessThanOrEqual(0.10 * frameArea); expect(areaOf(finalBox)).toBeLessThanOrEqual(0.10 * frameArea);
      // T2: against the same region, the real chrome://version and chrome://prefs-internals pages are flagged.
      expect(control.flaggedFrames).toBeGreaterThanOrEqual(1);
      // A: no frame before a0 + 1 s shows content outside the app's own pages (never startup-probe footage).
      expect(offending.map(f => ({ index: f.index, ms: f.ms, box: f.box, outsideApp: f.outsideApp }))).toEqual([]);
      // B: the app's first paint lands within -250..+500 ms of a0. Seek alignment only, NOT SEC-001
      // evidence: the probe costs 208-341 ms (measured), so B passes with the browser.ts fix reverted
      // and its lower bound does not reliably catch the half-fix (ready() before the probe). The
      // 2026-10-13 claim that it does is retracted (ar-qa-sec001-oracle-revision.json B_correction).
      if (t1 === undefined) throw new Error('NO_FIRST_PAINT');
      expect(t1 - a0).toBeGreaterThanOrEqual(-250); expect(t1 - a0).toBeLessThanOrEqual(500);
      const manifest = JSON.parse(await readFile(`${prefix}.manifest.json`, 'utf8')) as Record<string, unknown>;
      expect(manifest).toMatchObject({ kind: 'guidedRecording', evidenceState: 'STORED', recordingId: body.recordingId, timings: body.timings, disclosure: GUIDED_RECORDING_DISCLOSURE });
      expect(run.ordering[0]).toEqual({ key: `studio/fixture-csi/guided/${run.context.sessionId}.webm`, fileExists: true, scratchGone: true });
      expect(run.request?.dir.startsWith(await realpath(run.evidenceRoot))).toBe(true); expect(run.scratch && run.request?.dir.startsWith(run.scratch)).toBe(false);
      expect(run.request && existsSync(run.request.dir)).toBe(false); expect(run.scratch && existsSync(run.scratch)).toBe(false);
      expect(await scan(run.objects)).toEqual([]);
      for (const value of [CANARY, encodeURIComponent(CANARY), Buffer.from(CANARY).toString('base64')]) expect(JSON.stringify(run.messages)).not.toContain(value);
    } finally { await rm(run.root, { recursive: true, force: true }); }
  });

  it('discards the recording of a learn that published: no object, no manifest, no callback, no local file', async () => {
    const run = await guidedLearnRun('published');
    try {
      expect(run.outcomes.map(o => o.ledger.state)).toEqual(['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED']);
      expect(run.messages.some(m => m.route === 'recording-evidence')).toBe(false);
      expect(await readdir(join(run.objects, 'studio', 'fixture-csi', 'guided')).catch(() => [])).toEqual([]);
      expect(run.request && existsSync(run.request.dir)).toBe(false);
      expect(run.scratch && existsSync(run.scratch)).toBe(false);
      expect(await scan(run.evidenceRoot)).toEqual([]);
    } finally { await rm(run.root, { recursive: true, force: true }); }
  });

  it('settles a recorder-side fault as UNAVAILABLE without a fake video, and the session still terminates', async () => {
    const run = await guidedLearnRun('recorderFileLost');
    try {
      const body = run.messages.filter(m => m.route === 'recording-evidence').at(-1)?.body as RecordingEvidenceBody;
      expect(body).toMatchObject({ state: 'UNAVAILABLE', partial: false, timings: [] });
      const prefix = join(run.objects, 'studio', 'fixture-csi', 'guided', run.context.sessionId);
      expect(existsSync(`${prefix}.webm`)).toBe(false);
      expect(JSON.parse(await readFile(`${prefix}.manifest.json`, 'utf8'))).toMatchObject({ evidenceState: 'UNAVAILABLE', timings: [] });
      expect(run.request && existsSync(run.request.dir)).toBe(false);
    } finally { await rm(run.root, { recursive: true, force: true }); }
  });

  it('REL-001: a launch that fails mid-startup keeps the original error and names the step it failed in', async () => {
    const root = await mkdtemp(join(tmpdir(), 'guided-launch-phase-'));
    try {
      // A symlinked recording directory is refused only after the startup probe page has closed, so the real browser fails inside STARTUP_PAGE.
      const real = join(root, 'real'), link = join(root, 'link'); await mkdir(real); await symlink(real, link);
      const config: ObservationConfig = { sessionId: 'phase', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] };
      const failure = await launchGuidedBrowser(config, 'phase-context', () => undefined, { dir: link, size: { width: 640, height: 360 }, ready: () => undefined }).then(() => null, (error: unknown) => error);
      expect(failure).toBeInstanceOf(GuidedLaunchFailure);
      expect(failure).toMatchObject({ message: 'CONTEXT_LOST', phase: 'STARTUP_PAGE', cause: { message: 'RECORDING_FAILED' } });
      await (failure as GuidedLaunchFailure).close();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('produces no video for an unrecorded guided launch (the webm comes from recordVideo, not from a directory pick)', async () => {
    const guided = await launchGuidedBrowser({ sessionId: 'unrecorded', scopeHash: 'f'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] }, 'unrecorded-context', () => undefined);
    await guided.close(); expect(await guided.recordedVideo?.()).toBeNull();
  });

  it('runs the observed replay adapter on the guided-mode recorded handle (AC-1 parity)', async () => {
    fixture.reset();
    const root = await mkdtemp(join(tmpdir(), 'guided-parity-'));
    const scope: Scope = { ...publication.job.binding.scope, initialContext: { kind: 'initialBlank' } };
    
    let ready = 0;
    const guided = await launchGuidedBrowser({ sessionId: 'parity', scopeHash: 'e'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] }, 'parity-context', () => undefined, { dir: root, size: { width: 1280, height: 720 }, ready: recording => { if (recording) ready++; } });
    const handle = guided.handle; if (!handle) throw new Error('HANDLE');
    const id = (n: number) => '00000000-0000-4000-8000-' + String(300 + n).padStart(12, '0');
    const frame: Execute3 = { kind: 'execute', protocolVersion: 3, mode: 'observed', runId: publication.execute.runId, attemptId: publication.execute.attemptId, profileHash: hashObserved(OBSERVED_PROFILE), configurationHash: 'c'.repeat(64), waitStrategy: 'domcontentloaded', stepTimeoutMs: 5000,
      inputs: [{ inputId: 'nav', stepId: id(1), kind: 'destination', value: fixture.origin + '/login' }, { inputId: 'pass', stepId: id(2), kind: 'secretRef', referenceName: 'PASS' }, { inputId: 'home', stepId: id(4), kind: 'nonsecretText', value: fixture.origin + '/home' }],
      secrets: { PASS: CANARY }, secretOrigins: { PASS: [fixture.origin] }, bindings: [], transfers: [],
      steps: [
        { stepIndex: 0, stepId: id(1), operations: [{ coordinate: { stepId: id(1), ordinal: 0 }, guardId: 'g0', operation: stepOp('await page.goto(inputs["nav"]);', { uses: [{ kind: 'input', id: 'nav' }] }) }] },
        { stepIndex: 1, stepId: id(2), operations: [{ coordinate: { stepId: id(2), ordinal: 0 }, guardId: 'g1', operation: stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);', { uses: [{ kind: 'secret', id: 'PASS' }] }) }] },
        { stepIndex: 2, stepId: id(3), operations: [{ coordinate: { stepId: id(3), ordinal: 0 }, guardId: 'g2', operation: stepOp('await page.getByRole("button", { name: "Sign in", exact: true }).click();') }] },
        { stepIndex: 3, stepId: id(4), operations: [{ coordinate: { stepId: id(4), ordinal: 0 }, guardId: 'g3', operation: stepOp('await expect(page).toHaveURL(inputs["home"]);', { uses: [{ kind: 'input', id: 'home' }] }) }] },
      ],
      guards: [{ guardId: 'g0', origin: null }, { guardId: 'g1', origin: fixture.origin }, { guardId: 'g2', origin: fixture.origin }, { guardId: 'g3', origin: fixture.origin }] };
    const adapter = createObservedReplayAdapter(handle, scope, TEST_DOMAINS, 'guided-parity', () => undefined);
    try {
      expect(ready).toBe(1);
      // AR-QA SEC-001 C: the handle drives the fresh app page, still blank before the first navigation.
      expect((handle.page as { url(): string }).url()).toBe('about:blank');
      const result = await executeObservedReplay(frame, adapter, scope, TEST_DOMAINS, { now: () => performance.now() }, { stepStarted() { return; }, stepFinished() { return; } }, new AbortController().signal);
      expect(result).toMatchObject({ ok: true, errorCode: null, secretUse: { PASS: 'USED' } });
      expect(fixture.receipts().at(-1)).toMatchObject({ accepted: true });
      // AR-QA SEC-001 C: before close, the only file in the recording dir is the app page's video.
      const files = await readdir(root); expect(files).toHaveLength(1);
      const recorded = await guided.recordedVideo?.(); expect(recorded ? basename(recorded) : null).toBe(files[0]);
      await adapter.dispose();
      const video = await handle.close(); expect(video?.startsWith(root)).toBe(true); if (!video) throw new Error('VIDEO');
      expect(webm(await readFile(video))).toBe(true);
      expect(guided.scratchDirectory && existsSync(guided.scratchDirectory)).toBe(false);
    } finally { await handle.dispose(); await rm(root, { recursive: true, force: true }); }
  });
});
