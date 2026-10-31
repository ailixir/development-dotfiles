import { FIXTURE_ORIGIN, TEST_DOMAINS } from '../helpers/allowedDomains.js';
/**
 * STUDIO-OBS-012A — the observed child's teardown evidence, its tail hold and its stop-frame guard,
 * driven through the production defaults rather than the injected seams.
 *
 * `observedChildRuntime.test.ts` injects `sleep` and lets `close()` resolve `null`, so the real
 * recording inspector (`inspectRecordingFile`) and the real tail-settle timer never run there. The
 * cases below leave both seams unset and assert what the child *reports* about a real file on disk
 * and how long it actually holds the recorder open. Browser-free: the browser factory is the same
 * structural fake the unit tier uses everywhere (AC-25).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import fixtureJson from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with { type: 'json' };
import type {PublicationDocument} from '../helpers/publicationFixture.js';
import { fakeHandle, newRig } from '../helpers/stepFakes.js';
import { TAIL_SETTLE_HOLD_MS, attachChildRuntime } from '../../src/run/childRuntime.js';
import type { ObservedChildMessage } from '../../src/run/protocol.js';
import type { BuildIdentity } from '../../src/executor/observedOperations.js';
import { OBSERVED_SCHEMA_BUNDLE_HASH, hashObserved } from '../../src/validator/observedReferencePolicy.js';
import type { ObservationSession } from '../../src/run/observationTypes.js';
import type { Observation } from '../../src/guided/types.js';
import type { BrowserHandle } from '../../src/run/browserFactory.js';
import { MIN_PLAYABLE_RECORDING_BYTES, WEBM_MAGIC } from '../../src/run/recording.js';
// Typed view of the static JSON import: the file exceeds tsserver's 4 MiB non-TS limit, so ESLint's projectService types it as `error`.
const fixture=fixtureJson as unknown as PublicationDocument;

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

type ResultMessage = Extract<ObservedChildMessage, { kind: 'result' }>;

interface DriverOptions {
  /** What the browser handle's orderly close resolves (the recorder's file path). */
  readonly close: () => Promise<string | null>;
  /** Leave unset to exercise the production tail-settle timer. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** The fixture's admitted launch and execute frames, bound to a structural browser handle. */
function driver(options: DriverOptions) {
  const build: BuildIdentity = { ...fixture.build, schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH };
  const launch = structuredClone(fixture.launch);
  const now = Date.now();
  (launch as { build: BuildIdentity }).build = build;
  (launch.admission.request as { build: BuildIdentity }).build = build;
  (launch.admission as { startDeadlineAt: string }).startDeadlineAt = new Date(now + 5000).toISOString();
  (launch.admission as { runDeadlineAt: string }).runDeadlineAt = new Date(now + 10000).toISOString();
  const execute = structuredClone(fixture.execute);
  const messages: { at: number; message: ObservedChildMessage }[] = [];
  const exits: number[] = [];
  let listener: (value: unknown) => void = () => undefined;
  let clock = 0;
  const observation = structuredClone(fixture.basis.observations[0]?.observation) as Observation | undefined;
  if (!observation) throw new Error('OBSERVATION');
  const rig = newRig(FIXTURE_ORIGIN, {
    observe: () => Promise.resolve({ observation, json: '{}', bytes: 2, observationHash: hashObserved(observation) }),
    withhold: () => Promise.resolve(),
    preparePassword: () => Promise.resolve(),
    fillPassword: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
  });
  rig.w.text.body = 'fresh-value';
  rig.w.matches['input[type="password" i]'] = 0;
  (rig.api as { expect: unknown }).expect = Object.assign(() => new Proxy({}, { get: (_target, key) => (typeof key === 'string' && key !== 'then' ? () => Promise.resolve() : undefined) }), { configure() { return this; } });
  const observations: ObservationSession = rig.session;
  const closedAt: number[] = [];
  const close = vi.fn(() => {
    closedAt.push(performance.now());
    return options.close();
  });
  const dispose = vi.fn(() => Promise.resolve());
  const handle: BrowserHandle = {
    ...fakeHandle(rig),
    observedAppVideoPath: () => Promise.resolve('/unit/app.webm'),
    createObservationSession: () => observations,
    observedBlankMatches: () => Promise.resolve(true),
    observedInitialContextMatches: () => Promise.resolve(true),
    observedHosts: () => [],
    close,
    dispose,
  };
  attachChildRuntime({
    allowedDomains: TEST_DOMAINS,
    channel: {
      onMessage(fn) { listener = fn; },
      send(message) { messages.push({ at: performance.now(), message }); },
      exit(code) { exits.push(code); },
    },
    browsers: { launch: () => Promise.resolve(handle) },
    observedBuild: build,
    publishAppVideoOwner: () => undefined,
    originSource: { monotonicNow: () => ++clock, wallNow: () => new Date() },
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });
  const results = (): ResultMessage[] =>
    messages.map((entry) => entry.message).filter((message): message is ResultMessage => message.kind === 'result');
  return {
    launch,
    execute,
    messages,
    exits,
    close,
    dispose,
    closedAt,
    results,
    send: (value: unknown) => { listener(value); },
    ready: () => messages.some((entry) => entry.message.kind === 'ready'),
  };
}

async function scratchFile(name: string, bytes: Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'child-teardown-'));
  directories.push(directory);
  const path = join(directory, name);
  await writeFile(path, bytes);
  return path;
}

function webm(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(WEBM_MAGIC, 0);
  return bytes;
}

async function runToCompletion(h: ReturnType<typeof driver>): Promise<ResultMessage> {
  h.send(h.launch);
  await vi.waitFor(() => { expect(h.ready()).toBe(true); });
  h.send(h.execute);
  await vi.waitFor(() => { expect(h.exits).toEqual([0]); });
  const [result, ...rest] = h.results();
  expect(rest).toEqual([]);
  if (!result) throw new Error('NO_RESULT');
  return result;
}

describe('the child reports what the recorder actually left on disk', () => {
  it('reports a playable WebM the recorder closed in order as PENDING, whole, with its real size', async () => {
    const path = await scratchFile('app.webm', webm(MIN_PLAYABLE_RECORDING_BYTES + 88));
    const result = await runToCompletion(driver({ close: () => Promise.resolve(path), sleep: () => Promise.resolve() }));
    expect(result.ok).toBe(true);
    expect(result.recording).toEqual({ path, bytes: MIN_PLAYABLE_RECORDING_BYTES + 88, errorCode: null, state: 'PENDING', partial: false });
  });

  it('refuses to call a file without the EBML magic playable, however large it is', async () => {
    const bytes = new Uint8Array(MIN_PLAYABLE_RECORDING_BYTES * 4).fill(0x41);
    const path = await scratchFile('app.webm', bytes);
    const result = await runToCompletion(driver({ close: () => Promise.resolve(path), sleep: () => Promise.resolve() }));
    // The run's own outcome is not rewritten by a bad recording; the evidence says FAILED.
    expect(result.ok).toBe(true);
    expect(result.recording).toMatchObject({ path, bytes: bytes.byteLength, state: 'FAILED', partial: false });
  });

  it('refuses a truncated recording that has the header but fewer bytes than a playable file', async () => {
    const path = await scratchFile('app.webm', webm(MIN_PLAYABLE_RECORDING_BYTES - 1));
    const result = await runToCompletion(driver({ close: () => Promise.resolve(path), sleep: () => Promise.resolve() }));
    expect(result.recording).toMatchObject({ path, bytes: MIN_PLAYABLE_RECORDING_BYTES - 1, state: 'FAILED' });
  });

  it('turns a recorder path that cannot be opened into RECORDING_FAILED, without leaking the path error text', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'child-teardown-'));
    directories.push(directory);
    const missing = join(directory, 'never-written.webm');
    const h = driver({ close: () => Promise.resolve(missing), sleep: () => Promise.resolve() });
    const result = await runToCompletion(h);
    expect(result.recording).toEqual({ path: missing, bytes: null, errorCode: 'RECORDING_FAILED', state: 'FAILED', partial: false });
    // The open failure is classified by error *name*; errno text never reaches the parent.
    expect(JSON.stringify(h.messages)).not.toMatch(/ENOENT|no such file/u);
    expect(h.dispose).not.toHaveBeenCalled();
  });
});

describe('the production tail-settle hold', () => {
  it(`keeps the recorder open for ${String(TAIL_SETTLE_HOLD_MS)} ms after the last step finishes before the orderly close`, async () => {
    const h = driver({ close: () => Promise.resolve(null) });
    await runToCompletion(h);
    const lastStep = h.messages.filter((entry) => entry.message.kind === 'step-finished').at(-1);
    if (!lastStep) throw new Error('NO_STEP_FINISHED');
    expect(h.close).toHaveBeenCalledOnce();
    const held = (h.closedAt[0] ?? Number.NaN) - lastStep.at;
    // Never shorter than the hold (a setTimeout never fires early; 2 ms covers clock rounding).
    expect(held).toBeGreaterThanOrEqual(TAIL_SETTLE_HOLD_MS - 2);
  });

  it('is cut short by an out-of-band stop: the stop closes the recorder without waiting for the hold', async () => {
    const h = driver({ close: () => Promise.resolve(null), sleep: () => new Promise<void>(() => undefined) });
    h.send(h.launch);
    await vi.waitFor(() => { expect(h.ready()).toBe(true); });
    h.send(h.execute);
    await vi.waitFor(() => { expect(h.messages.some((entry) => entry.message.kind === 'step-finished')).toBe(true); });
    // The hold never resolves; only the stop can end this run.
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    expect(h.exits).toEqual([]);
    h.send({ kind: 'stop' });
    await vi.waitFor(() => { expect(h.exits).toEqual([0]); });
    expect(h.results()).toHaveLength(1);
    expect(h.results()[0]).toMatchObject({ ok: false, errorCode: 'CANCELLED' });
    expect(h.close).toHaveBeenCalledOnce();
  });
});

describe('the stop frame is a contract, not a keyword', () => {
  it('ends a ready run as INVALID_CONTRACT when a stop frame carries anything but its kind', async () => {
    const h = driver({ close: () => Promise.resolve(null), sleep: () => Promise.resolve() });
    h.send(h.launch);
    await vi.waitFor(() => { expect(h.ready()).toBe(true); });
    h.send({ kind: 'stop', reason: 'smuggled' });
    await vi.waitFor(() => { expect(h.exits).toEqual([0]); });
    expect(h.results()).toHaveLength(1);
    expect(h.results()[0]).toMatchObject({ ok: false, errorCode: 'INVALID_CONTRACT' });
    expect(h.close).toHaveBeenCalledOnce();
    // A later execute is not run after the stop finished the child.
    h.send(h.execute);
    await Promise.resolve();
    expect(h.messages.some((entry) => entry.message.kind === 'step-started')).toBe(false);
  });

  it('a well-formed stop still ends the same ready run as CANCELLED', async () => {
    const h = driver({ close: () => Promise.resolve(null), sleep: () => Promise.resolve() });
    h.send(h.launch);
    await vi.waitFor(() => { expect(h.ready()).toBe(true); });
    h.send({ kind: 'stop' });
    await vi.waitFor(() => { expect(h.exits).toEqual([0]); });
    expect(h.results()[0]).toMatchObject({ ok: false, errorCode: 'CANCELLED' });
  });
});
