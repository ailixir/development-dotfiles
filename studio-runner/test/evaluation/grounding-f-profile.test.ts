/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules */
/**
 * SPK-07 workstream F: the 4-hour profile (preregistration section 14, entry 6): per-arm reps, A0 derivation, one SOURCE_PLAN per
 * task, the gateway-cap refusal, parallel dispatch under the adaptive limiter, stratified task order, wall-clock stop and the
 * coverage-aware report.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const run = await load('../../evaluation/grounding/run.mjs');
const limiterMod = await load('../../evaluation/grounding/lib/limiter.mjs');
const report = await load('../../evaluation/grounding/report.mjs');
const stats = await load('../../evaluation/grounding/lib/stats.mjs');
const dirs: string[] = [];
const tmp = () => { const dir = mkdtempSync(join(tmpdir(), 'spk07-f-prof-')); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const jsonl = (path: string): any[] => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));

// ---- limiter --------------------------------------------------------------------------------------------------

describe('adaptive in-flight limiter (AIMD)', () => {
  const ok = { status: 200, reply: { a: 1 } };
  const run1 = (limiter: any, result: any) => limiter.run(async () => result);
  it('starts at 6, adds 1 after every 8 consecutive successes up to 20, halves (floor 2) on a 429/503', async () => {
    const limiter = limiterMod.createLimiter({ minHalveIntervalMs: 0 });
    expect(limiter.limit()).toBe(6);
    for (let i = 0; i < 7; i++) await run1(limiter, ok);
    expect(limiter.limit()).toBe(6);
    await run1(limiter, ok);
    expect(limiter.limit()).toBe(7);
    for (let i = 0; i < 8 * 20; i++) await run1(limiter, ok);
    expect(limiter.limit()).toBe(20); // capped
    await run1(limiter, { status: 429, reply: null });
    expect(limiter.limit()).toBe(10);
    await run1(limiter, { status: 503, reply: null });
    expect(limiter.limit()).toBe(5);
    await run1(limiter, { status: 429, reply: null }); await run1(limiter, { status: 429, reply: null });
    expect(limiter.limit()).toBe(2); // floor
    await run1(limiter, { status: 429, reply: null });
    expect(limiter.limit()).toBe(2);
  });
  it('a throttle resets the success streak, and other errors leave the limit alone', async () => {
    const limiter = limiterMod.createLimiter({ minHalveIntervalMs: 0 });
    for (let i = 0; i < 7; i++) await run1(limiter, ok);
    await run1(limiter, { status: 429, reply: null });
    expect(limiter.limit()).toBe(3);
    for (let i = 0; i < 7; i++) await run1(limiter, ok);
    expect(limiter.limit()).toBe(3);
    await run1(limiter, { status: 0, reply: null, error: 'CONNECT' });
    expect(limiter.limit()).toBe(3);
  });
  it('never has more calls in flight than the limit and queues the rest', async () => {
    const limiter = limiterMod.createLimiter({ start: 3, max: 3 });
    let current = 0; let peak = 0;
    const job = () => limiter.run(async () => { current++; peak = Math.max(peak, current); await new Promise(r => setTimeout(r, 5)); current--; return ok; });
    await Promise.all(Array.from({ length: 12 }, job));
    expect(peak).toBe(3);
    expect(limiter.stats()).toMatchObject({ completed: 12, successes: 12, maxInFlight: 3 });
  });
  it('halves once per congestion window when 429s are only visible as retried attempts in calls.jsonl', async () => {
    const dir = tmp();
    const file = join(dir, 'calls.jsonl');
    writeFileSync(file, '');
    let t = 0;
    const events: any[] = [];
    const limiter = limiterMod.createLimiter({ pollThrottles: limiterMod.tailThrottles(file), now: () => t, minHalveIntervalMs: 5000, onChange: (e: any) => events.push(e) });
    writeFileSync(file, `${JSON.stringify({ n: 1, status: 429 })}\n${JSON.stringify({ n: 2, status: 429 })}\n${JSON.stringify({ n: 3, status: 200 })}\n`);
    await run1(limiter, ok);
    expect(limiter.limit()).toBe(3);
    expect(limiter.stats().retriedThrottles).toBe(2);
    t = 2000;
    writeFileSync(file, `${readFileSync(file, 'utf8')}${JSON.stringify({ n: 4, status: 503 })}\n`);
    await run1(limiter, ok);
    expect(limiter.limit()).toBe(3); // inside the 5 s window: no second halving
    t = 9000;
    writeFileSync(file, `${readFileSync(file, 'utf8')}${JSON.stringify({ n: 5, status: 429 })}\n`);
    await run1(limiter, ok);
    expect(limiter.limit()).toBe(2);
    expect(events.map(e => e.limit)).toEqual([3, 2]);
  });
});

describe('separate image lane for S4', () => {
  const ok = { status: 200, reply: { a: 1 } };
  it('routes by the label arm and gives S4 its own AIMD: start 2, max 3, floor 1', async () => {
    expect(['t|0|S4|1|1', 't|0|S3|1|1', 't|-1|SP|1|1', 't|0|A0|1|1'].map(limiterMod.laneOfLabel)).toEqual(['image', 'text', 'text', 'text']);
    const dir = tmp(); const file = join(dir, 'calls.jsonl'); writeFileSync(file, '');
    const events: any[] = [];
    let t = 0;
    const laned = limiterMod.createLanedLimiter({ text: { now: () => t }, image: { now: () => t }, pollThrottles: limiterMod.tailThrottlesByLane(file), onChange: (e: any) => events.push(e) });
    expect([laned.lanes.text.limit(), laned.lanes.image.limit()]).toEqual([6, 2]);
    for (let i = 0; i < 8; i++) await laned.run(async () => ok, 't|0|S4|1|1');
    expect(laned.lanes.image.limit()).toBe(3); // +1 after 8 successes
    for (let i = 0; i < 16; i++) await laned.run(async () => ok, 't|0|S4|1|1');
    expect(laned.lanes.image.limit()).toBe(3); // max 3
    expect(laned.lanes.text.limit()).toBe(6); // the text lane never moved
    // S4 429s seen only in calls.jsonl halve the image lane and leave the text lane alone
    writeFileSync(file, `${JSON.stringify({ status: 429, label: 't|0|S4|1|1' })}\n${JSON.stringify({ status: 429, label: 't|0|S4|2|1' })}\n`);
    await laned.run(async () => ok, 't|0|S3|1|1');
    expect(laned.lanes.text.limit()).toBe(6);
    await laned.run(async () => ok, 't|0|S4|1|1');
    expect(laned.lanes.image.limit()).toBe(1); // floor 1
    // a text 429 halves the text lane only
    t = 100000;
    writeFileSync(file, `${readFileSync(file, 'utf8')}${JSON.stringify({ status: 503, label: 't|0|S1|1|1' })}\n`);
    await laned.run(async () => ok, 't|0|S2|1|1');
    expect([laned.lanes.text.limit(), laned.lanes.image.limit()]).toEqual([3, 1]);
    expect(events.filter(e => e.lane === 'image').map(e => e.limit)).toEqual([3, 1]);
    expect(events.filter(e => e.lane === 'text').map(e => e.limit)).toEqual([3]);
    // a final 429 on an image call halves the image lane, never the text lane
    const before = laned.lanes.text.limit();
    await laned.run(async () => ({ status: 429, reply: null }), 't|0|S4|9|1');
    expect(laned.lanes.text.limit()).toBe(before);
  });
  it('the image lane caps in-flight S4 calls while text calls keep their own capacity', async () => {
    const laned = limiterMod.createLanedLimiter({});
    let imageNow = 0; let imagePeak = 0; let textNow = 0; let textPeak = 0;
    const call = (label: string) => laned.run(async () => { const img = label.includes('|S4|'); if (img) { imageNow++; imagePeak = Math.max(imagePeak, imageNow); } else { textNow++; textPeak = Math.max(textPeak, textNow); }
      await new Promise(r => setTimeout(r, 8)); if (img) imageNow--; else textNow--; return ok; }, label);
    await Promise.all([...Array.from({ length: 6 }, (_, i) => call(`t|0|S4|${i}|1`)), ...Array.from({ length: 12 }, (_, i) => call(`t|0|S3|${i}|1`))]);
    expect(imagePeak).toBe(2);
    expect(textPeak).toBe(6);
  });
});

// ---- profile definitions --------------------------------------------------------------------------------------

describe('profile reps, order and pending units', () => {
  it('per-arm reps: S2/S3 2, A1/S1 1, A0 1 (derived), S4 2 only on the visual strata', () => {
    const t = (stratum: string) => ({ stratum });
    expect(['A0', 'A1', 'S1', 'S2', 'S3'].map(arm => run.profileRepsOf(arm, t('uniqueNav')))).toEqual([1, 1, 1, 2, 2]);
    expect(run.profileRepsOf('S4', t('uniqueNav'))).toBe(0);
    expect(run.profileRepsOf('S4', t('visualOnlyField'))).toBe(2);
    expect(run.profileRepsOf('S4', t('iconOnly'))).toBe(2);
    const task = { id: 't', stratum: 'uniqueNav', steps: [{}, {}] };
    const units = run.pendingUnits({ task, armIds: ['A0', 'A1', 'S1', 'S2', 'S3', 'S4'], reps: 3, repsOf: run.profileRepsOf, rows: new Map() });
    expect(units.filter((u: any) => u.step === 0).map((u: any) => `${u.arm}${u.rep}`).sort()).toEqual(['A01', 'A11', 'S11', 'S21', 'S22', 'S31', 'S32']);
    const visual = run.pendingUnits({ task: { ...task, stratum: 'iconOnly' }, armIds: ['S4', 'S3'], reps: 3, repsOf: run.profileRepsOf, rows: new Map() });
    expect(visual.filter((u: any) => u.step === 0 && u.arm === 'S4')).toHaveLength(2);
  });
  it('orders tasks deterministically, interleaving strata proportionally and sites within a stratum', () => {
    const tasks: any[] = [];
    for (const [stratum, n] of [['a', 20], ['b', 10], ['c', 10]] as const) for (let i = 0; i < n; i++) tasks.push({ id: `${stratum}${i}`, stratum, site: `${stratum}-site${i % 4}` });
    const order = run.orderTasks(tasks, 7);
    expect(order.map((t: any) => t.id)).toEqual(run.orderTasks(tasks, 7).map((t: any) => t.id));
    expect(order.map((t: any) => t.id)).not.toEqual(run.orderTasks(tasks, 8).map((t: any) => t.id));
    expect(order).toHaveLength(40);
    const prefix = order.slice(0, 20);
    const count = (stratum: string) => prefix.filter((t: any) => t.stratum === stratum).length;
    expect([count('a'), count('b'), count('c')]).toEqual([10, 5, 5]);
    const sites = order.filter((t: any) => t.stratum === 'a').slice(0, 4).map((t: any) => t.site);
    expect(new Set(sites).size).toBe(4);
  });
});

describe('normalizedBodyHash', () => {
  const body = (requestId: string, documentId: string, extra = '') => ({ contents: [{ parts: [{ text: JSON.stringify({ kind: 'NEXT_ACTION', requestId, attempt: 1, context: { observation: { documentId, nodes: [1, 2, extra] }, executionEvidence: { documentId, observationHash: documentId } } }) }] }], systemInstruction: { parts: [{ text: 'sys' }] } });
  it('QA-A0: bodies differing only by documentId (top level, every node, evidence), observedAt, observationHash, requestId and random authored-input ids hash equal', () => {
    const mk = (doc: string, input: string, observedAt: string, extra = '') => ({ contents: [{ parts: [{ text: JSON.stringify({ kind: 'NEXT_ACTION', requestId: `translation-${doc}`, attempt: 1, context: {
      observation: { documentId: doc, observedAt, nodes: [{ nodeId: 'node-1-2', documentId: doc, name: 'User' }, { nodeId: 'node-1-3', documentId: doc, name: `Pass${extra}` }] },
      inputs: [{ inputId: input, kind: 'nonsecretText' }], authoredInputsHash: `hash-${input}`, executionEvidence: { documentId: doc, observationHash: `h-${doc}` }, note: `seen in ${doc}` } }) }] }], systemInstruction: { parts: [{ text: 'sys' }] } });
    const a = mk('86a42472-4399-4248-9191-b0034fc3a36b', 'in-1', '2026-10-26T19:07:11.805Z');
    const b = mk('f071c1b0-2e62-4f70-873c-7e91147eca62', 'in-2', '2026-10-26T19:07:11.837Z');
    expect(run.normalizedBodyHash(a)).toBe(run.normalizedBodyHash(b));
    expect(run.normalizedBodyHash(a)).not.toBe(run.normalizedBodyHash(mk('f071c1b0-2e62-4f70-873c-7e91147eca62', 'in-2', '2026-10-26T19:07:11.837Z', '!')));
  });
  it('ignores per-call random ids but not content', () => {
    expect(run.normalizedBodyHash(body('r1', 'd1'))).toBe(run.normalizedBodyHash(body('r2', 'd2')));
    expect(run.normalizedBodyHash(body('r1', 'd1', 'x'))).not.toBe(run.normalizedBodyHash(body('r1', 'd1')));
  });
});

// ---- executeTask in the profile -------------------------------------------------------------------------------

const GT_ID = 100;
function fakeArm(id: string, opts: { emptied?: boolean; pick?: number; tag?: string; bytes?: number; log?: string[] } = {}) {
  const calls = { observe: 0, dispose: 0, build: [] as any[] };
  return { calls, mod: {
    id,
    observe: async () => { calls.observe++; opts.log?.push(`observe:${id}`); await new Promise(r => setTimeout(r, 2)); return { payload: {}, idMap: {}, dispose: async () => { calls.dispose++; }, meta: { bytes: 1000, nodes: 3, ms: 5, admittedUnderProductionLimits: true, gatewayInputAdmitted: true, emptied: Boolean(opts.emptied) } }; },
    buildRequest: ({ attempt, repairCodes, obligations }: any) => { calls.build.push({ attempt, repairCodes, cursor: obligations }); return { contents: [{ parts: [{ text: JSON.stringify({ kind: 'NEXT_ACTION', requestId: `r${Math.random()}`, attempt, context: { arm: opts.tag ?? id, attempt, pad: 'x'.repeat(opts.bytes ?? 0) } }) }] }] }; },
    interpret: async () => ({ status: 'ACTION', pickedId: 'n1', pickedBackendNodeId: opts.pick ?? GT_ID, locator: { kind: 'role', role: 'button', name: 'Go' }, locatorTier: 'role', executable: true, gateCodes: [] }),
  } };
}
function makeEnv(armSpecs: Record<string, any>, extra: any = {}) {
  const runDir = join(tmp(), 'run');
  const store = new run.RunStore(runDir);
  const sent: string[] = [];
  let inflight = 0; let peak = 0; let sendsStarted = 0;
  const log: string[] = armSpecs.__log ?? [];
  delete armSpecs.__log;
  const vertex = { send: async (_b: any, { label }: any) => { sendsStarted++; log.push(`send:${label}`); sent.push(label); inflight++; peak = Math.max(peak, inflight); await new Promise(r => setTimeout(r, 15)); inflight--;
    return { status: 200, reply: { status: 'ACTION', obligations: [{ stepIndex: 0 }, { stepIndex: 1 }] }, usage: { prompt: 100, out: 10, thoughts: 0, total: 110 }, modelVersion: 'fake-1', ms: 15, error: null }; } };
  let plans = 0;
  const requests = {
    makeSession: (task: any) => ({ sessionId: `sess-${plans}`, sourceSteps: task.steps.map((_: any, i: number) => ({ stepId: `s${i}` })) }),
    buildSourcePlanRequest: ({ session }: any) => { plans++; return { body: { contents: [{ parts: [{ text: JSON.stringify({ kind: 'SOURCE_PLAN', requestId: 'p', attempt: 1, context: { sessionId: session.sessionId } }) }] }] }, context: { sessionId: session.sessionId } }; },
    admitPlan: (reply: any) => ({ sourceReferences: [], needs: [], obligations: (reply.obligations ?? []).map((o: any, i: number) => ({ obligationId: `ob${i}`, stepId: `s${o.stepIndex}` })) }),
    stubCursor: () => ({}),
  };
  const env: any = { store, armIds: Object.keys(armSpecs), reps: 3, seed: 7, dry: false, repairJava: false, javaRefusals: new Map(), maxPromptTokens: undefined, freezeOk: true,
    profile: { name: '4h' }, repsOf: run.profileRepsOf, arms: Object.fromEntries(Object.entries(armSpecs).map(([id, spec]: any) => [id, spec.mod])), vertex, requests, observeTimeoutMs: 1000,
    openTask: async () => ({ page: {}, cdp: {}, void: false, renewCdp: async () => undefined, close: async () => undefined }),
    resolveGt: async (_l: any, gt: any) => (gt === null ? { void: false, ids: [], locator: null } : { void: false, ids: [GT_ID], locator: {} }),
    performStep: async () => undefined, ...extra };
  return { env, store, sent, runDir, log, stats: () => ({ peak, plans, sendsStarted }) };
}
const task1 = { id: 'tA', site: 's', url: 'fixture://c01/home', stratum: 'uniqueNav', expect: 'ACTION', steps: [{ text: 'Click "Go"', operation: { kind: 'click' }, gt: { chain: [] } }] };
const chain2 = { ...task1, id: 'tC', steps: [task1.steps[0], { ...task1.steps[0], text: 'Click "Next"' }] };

describe('4-hour profile execution', () => {
  it('runs per-arm reps with ONE SOURCE_PLAN per task, observes every arm before the first model call, and dispatches the step in parallel', async () => {
    const log: string[] = [];
    const e = makeEnv({ __log: log, A1: fakeArm('A1', { log }), S1: fakeArm('S1', { log }), S2: fakeArm('S2', { log }), S3: fakeArm('S3', { log }) });
    await run.executeTask(e.env, task1);
    expect(e.stats().plans).toBe(1);
    expect(e.sent.filter(l => l.includes('|SP|'))).toEqual(['tA|-1|SP|1|1']);
    const rows = jsonl(join(e.runDir, 'steps.jsonl'));
    expect(rows.map((r: any) => `${r.arm}${r.rep}`).sort()).toEqual(['A11', 'S11', 'S21', 'S22', 'S31', 'S32']);
    const firstNext = log.findIndex(l => l.startsWith('send:') && !l.includes('|SP|'));
    expect(log.slice(0, firstNext).filter(l => l.startsWith('observe:'))).toHaveLength(4);
    expect(log.slice(firstNext).some(l => l.startsWith('observe:'))).toBe(false);
    expect(e.stats().peak).toBeGreaterThanOrEqual(6); // all six NEXT_ACTION calls were in flight together
    expect(rows.every((r: any) => r.bodyHash && r.correctAndExecutable)).toBe(true);
    const plan = jsonl(join(e.runDir, 'scoring-input.jsonl')).filter((l: any) => l.kind === 'SOURCE_PLAN');
    expect(plan).toHaveLength(1);
  });
  it('skips S4 outside the visual strata and runs it twice on them', async () => {
    const s4 = fakeArm('S4');
    const e = makeEnv({ S3: fakeArm('S3'), S4: s4 });
    await run.executeTask(e.env, task1);
    expect(s4.calls.observe).toBe(0);
    const e2 = makeEnv({ S3: fakeArm('S3'), S4: fakeArm('S4') });
    await run.executeTask(e2.env, { ...task1, stratum: 'iconOnly' });
    expect(jsonl(join(e2.runDir, 'steps.jsonl')).filter((r: any) => r.arm === 'S4').map((r: any) => r.rep).sort()).toEqual([1, 2]);
  });
  it('A0 is EMPTIED when emptied, derived from A1 when the request bodies are identical, and asks itself only when they differ', async () => {
    const same = makeEnv({ A0: fakeArm('A0', { tag: 'X' }), A1: fakeArm('A1', { tag: 'X' }) });
    await run.executeTask(same.env, task1);
    const rows = jsonl(join(same.runDir, 'steps.jsonl'));
    const a0 = rows.find((r: any) => r.arm === 'A0');
    const a1 = rows.find((r: any) => r.arm === 'A1');
    expect(a0).toMatchObject({ derivedFromA1: true, derivedFromKey: a1.key, outcome: a1.outcome, usage: null, correctAndExecutable: true, key: 'tA|0|A0|1|1' });
    expect(same.sent.filter(l => l.includes('|A0|'))).toHaveLength(0);
    expect(jsonl(join(same.runDir, 'scoring-input.jsonl')).some((l: any) => l.key.includes('|A0|'))).toBe(false);

    const differ = makeEnv({ A0: fakeArm('A0', { tag: 'A0-only' }), A1: fakeArm('A1', { tag: 'X' }) });
    await run.executeTask(differ.env, task1);
    const rows2 = jsonl(join(differ.runDir, 'steps.jsonl'));
    expect(rows2.find((r: any) => r.arm === 'A0')).toMatchObject({ bodyDiffers: true, usage: { prompt: 100 } });
    expect(rows2.find((r: any) => r.arm === 'A0').derivedFromA1).toBeUndefined();
    expect(differ.sent.filter(l => l.includes('|A0|'))).toHaveLength(1);

    const emptied = makeEnv({ A0: fakeArm('A0', { emptied: true }), A1: fakeArm('A1') });
    await run.executeTask(emptied.env, task1);
    expect(jsonl(join(emptied.runDir, 'steps.jsonl')).find((r: any) => r.arm === 'A0')).toMatchObject({ outcome: 'EMPTIED' });
    expect(emptied.sent.filter(l => l.includes('|A0|'))).toHaveLength(0);
  });
  it('A0 cannot derive from an unresolved A1: it is stored as a retryable infrastructure row and resolves on resume', async () => {
    const e = makeEnv({ A0: fakeArm('A0', { tag: 'X' }), A1: fakeArm('A1', { tag: 'X' }) });
    const real = e.env.vertex.send;
    e.env.vertex = { send: async (b: any, o: any) => (o.label.includes('|A1|') ? { status: 429, reply: null, usage: null, ms: 1, error: 'Resource exhausted' } : real(b, o)) };
    await run.executeTask(e.env, task1);
    const first = jsonl(join(e.runDir, 'steps.jsonl'));
    expect(first.find((r: any) => r.arm === 'A0')).toMatchObject({ outcome: 'MODEL_ERROR', infraError: true, error: 'A1_UNRESOLVED_FOR_DERIVATION' });
    e.env.vertex = { send: real };
    e.env.store = new run.RunStore(e.runDir);
    await run.executeTask(e.env, task1);
    const last = new Map(jsonl(join(e.runDir, 'steps.jsonl')).map((r: any) => [r.key, r]));
    expect(last.get('tA|0|A1|1|1')).toMatchObject({ outcome: 'CORRECT' });
    expect(last.get('tA|0|A0|1|1')).toMatchObject({ derivedFromA1: true, outcome: 'CORRECT' });
  });
  it('refuses a request over the 262,144-byte gateway cap without sending it: PRODUCT_REFUSED_GATEWAY_CAP, a failure, not retried', async () => {
    const e = makeEnv({ A1: fakeArm('A1', { bytes: 270000 }), S2: fakeArm('S2') });
    await run.executeTask(e.env, task1);
    const rows = jsonl(join(e.runDir, 'steps.jsonl'));
    const refused = rows.find((r: any) => r.arm === 'A1');
    expect(refused).toMatchObject({ outcome: 'PRODUCT_REFUSED_GATEWAY_CAP', correctAndExecutable: false, confidentWrong: false, usage: null });
    expect(refused.infraError).toBeUndefined();
    expect(e.sent.filter(l => l.includes('|A1|'))).toHaveLength(0);
    expect(run.pendingUnits({ task: task1, armIds: ['A1'], reps: 1, repsOf: run.profileRepsOf, rows: new run.RunStore(e.runDir).rows })).toHaveLength(0);
    expect(rows.filter((r: any) => r.arm === 'S2')).toHaveLength(2);
  });
  it('a wall-clock stop lets the current step finish but starts no further step, and leaves the task resumable', async () => {
    const e = makeEnv({ A1: fakeArm('A1'), S2: fakeArm('S2') });
    const realSend = e.env.vertex.send;
    e.env.vertex = { send: async (b: any, o: any) => { if (o.label.startsWith('tC|0|')) e.env.stopRequested = true; return realSend(b, o); } };
    await run.executeTask(e.env, chain2);
    const rows = jsonl(join(e.runDir, 'steps.jsonl'));
    expect(new Set(rows.map((r: any) => r.step))).toEqual(new Set([0]));
    expect(jsonl(join(e.runDir, 'loads.jsonl'))[0].stopped).toBe(true);
    e.env.stopRequested = false; e.env.vertex = { send: realSend }; e.env.store = new run.RunStore(e.runDir);
    const summary = await run.executeTask(e.env, chain2);
    expect(summary.units).toBe(3); // only the second step's A1 + 2x S2 remain
    expect(new Set(jsonl(join(e.runDir, 'steps.jsonl')).map((r: any) => r.step))).toEqual(new Set([0, 1]));
  });
  it('runTasks starts no new task once a stop is requested', async () => {
    const e = makeEnv({ A1: fakeArm('A1') });
    e.env.stopRequested = true;
    const outcome = await run.runTasks(e.env, [task1, { ...task1, id: 'tB' }], { concurrency: 2 });
    expect(outcome.results).toHaveLength(0);
    expect(outcome.remaining).toBe(2);
  });
  it('parseArgs: --profile 4h defaults to concurrency 4 and a 235 minute wall clock; flags override', () => {
    expect(run.parseArgs(['d', '--profile', '4h'])).toMatchObject({ concurrency: 4, wallMinutes: 235, profile: '4h' });
    expect(run.parseArgs(['d', '--profile', '4h', '--concurrency', '3', '--wall-minutes', '60'])).toMatchObject({ concurrency: 3, wallMinutes: 60 });
    expect(run.parseArgs(['d'])).toMatchObject({ concurrency: 2, wallMinutes: null, profile: null });
    expect(() => run.parseArgs(['d', '--profile', '9h'])).toThrow(/UNKNOWN_PROFILE/);
  });
});

// ---- report ---------------------------------------------------------------------------------------------------

describe('profile report', () => {
  const mk = (extra: any = {}) => {
    const parent = tmp();
    const dir = join(parent, 'run1');
    mkdirSync(dir);
    const planned: any[] = []; const rows: any[] = [];
    const REPS: any = { A0: 1, A1: 1, S1: 1, S2: 2, S3: 2 };
    for (let t = 0; t < (extra.tasks ?? 12); t++) {
      const id = `t${t}`;
      planned.push({ id, stratum: 'uniqueNav', site: 's', steps: 1 });
      if (extra.unfinished?.includes(id)) continue;
      for (const arm of Object.keys(REPS)) for (let rep = 1; rep <= REPS[arm]; rep++) {
        // S3 always right; S2 right in rep 1 only on odd tasks (so 'all reps' differs from 'majority'); A1 wrong on half
        const ok = arm === 'S3' ? true : arm === 'S2' ? (t % 2 === 1 || rep === 1) : arm === 'A1' ? t % 2 === 0 : arm === 'S1' ? true : t % 2 === 0;
        rows.push({ key: `${id}|0|${arm}|${rep}|1`, task: id, step: 0, arm, rep, attempt: 1, expect: 'ACTION', stratum: 'uniqueNav', status: 'ACTION', correctElement: ok, executable: true, correctAndExecutable: ok, confidentWrong: false, gateCodes: [],
          derivedFromA1: arm === 'A0' ? true : undefined, usage: arm === 'A0' ? null : { prompt: 100, out: 1, thoughts: 0, total: 101 }, ms: 5, meta: { bytes: 100, gatewayInputAdmitted: true, translationInputAdmitted: true, admittedUnderProductionLimits: true }, requestBytes: 500 });
      }
    }
    writeFileSync(join(dir, 'steps.jsonl'), `${rows.map(r => JSON.stringify(r)).join('\n')}\n`);
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'r1', seed: 5, profile: '4h', arms: Object.keys(REPS), plannedTasks: planned, freeze: { ok: true, sha256: 'abc' } }));
    return dir;
  };
  it('McNemar unit under the profile = success only if ALL of the arm\'s reps succeed', () => {
    const a = report.analyze(mk());
    const c = a.comparisons.primary; // S3 (2 reps, always right) vs S2 (2 reps: right in both only on odd tasks)
    expect(c.units).toBe(12);
    expect(c.onlyX).toBe(6); // S3 succeeds everywhere, S2 on 6 of 12 under 'all'
    const majority = stats.pairedComparison([{ task: 'a', x: [true, true], y: [true, false] }], { rule: 'majority' });
    expect(majority.both + majority.neither).toBe(0); // strict majority of 2: a tie is not a majority -> y fails
    expect(stats.pairedComparison([{ task: 'a', x: [true, true], y: [true, false] }], { rule: 'all' }).onlyX).toBe(1);
    expect(a.repCounts).toMatchObject({ A1: { maxRep: 1 }, S2: { maxRep: 2 }, S3: { maxRep: 2 }, A0: { maxRep: 1 } });
  });
  it('lists unfinished tasks, excludes their rows, and makes the stages INCOMPLETE when the per-stratum minimum is unmet', () => {
    const full = report.analyze(mk());
    expect(full.coverage).toMatchObject({ plannedTotal: 12, finishedTotal: 12, unfinished: [] });
    expect(full.stages[0].checks.find((c: any) => /finished-task minimum/.test(c.name)).pass).toBe(true);
    const partial = report.analyze(mk({ unfinished: ['t8', 't9', 't10', 't11'] }));
    expect(partial.coverage).toMatchObject({ plannedTotal: 12, finishedTotal: 8, unfinished: ['t8', 't9', 't10', 't11'] });
    expect(partial.perArmStratum.S3.ALL.trials).toBe(16); // 8 finished tasks x 2 reps
    expect(partial.stages[2].checks.find((c: any) => /finished-task minimum/.test(c.name)).pass).toBe(true); // 8 >= min(12, 8)
    const short = report.analyze(mk({ unfinished: ['t5', 't6', 't7', 't8', 't9', 't10', 't11'] }));
    expect(short.coverage.unmetStrata).toEqual(['uniqueNav']);
    expect([0, 1, 2].map(i => short.stages[i].checks.find((c: any) => /finished-task minimum/.test(c.name)).pass)).toEqual([null, null, null]);
    expect(short.stages[3].checks.find((c: any) => /finished-task minimum/.test(c.name)).pass).toBe(true); // no visual tasks planned: nothing to cover
    expect(short.stages[0].verdict).not.toBe('GO');
  });
  it('shows A0 as derived, per-arm rep counts and the unfinished list in the markdown', () => {
    const { markdown } = report.buildReport(mk({ unfinished: ['t11'] }), { verify: false });
    expect(markdown).toContain('A0 (derived from A1');
    expect(markdown).toContain('Unfinished tasks (1): t11');
    expect(markdown).toContain('reps used');
    expect(markdown).toContain('ALL of that arm');
  });
});
