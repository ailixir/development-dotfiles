/**
 * STUDIO-OBS-009 AC-7 harness self-test: the run driver against a SCRIPTED public API and the real fixture
 * hosts (corpus pages, plus the existing secret-login and guided-dataflow fixtures hosted in-process).
 * The scripted API plays the part of the system under test; its "model" is the case's own expected outcome or a
 * mutation of it. Every record here is labelled HARNESS_SELF_TEST and is NOT D-C evidence: no model, no provider,
 * no Studio backend was involved.
 */
import { describe, expect, it } from 'vitest';
import {
  runBenchmark, driveIncremental, createStopRule, buildBenchmark, mutateObservation, idealObservation, SELF_TEST_LABEL,
  type CorpusManifest, type ExpectedOutcome, type JsonObject, type StudioApiClient, type RunRecord,
} from '../../evaluation/observed-authoring/evaluate.mjs';
import { expectedOf, frozenManifest, readJson } from './observedCorpus.js';

const manifest = frozenManifest();
const PASSWORD = 'planted-selftest-password-5521';
type Effect = (ctx: { base: string; origin: string; phase: string; value: string }) => Promise<void>;

interface Plan { terminal: string; published: boolean; failureCode?: string; clarification?: boolean; effects: Effect; replayEffects?: Effect; explanation?: JsonObject[]; echoes?: string }

const post = (url: string, body: string, type = 'application/json'): Promise<Response> => fetch(url, { method: 'POST', headers: { 'content-type': type }, body });

/** Performs, against the real fixture host, what a correct (or mutated) system would do for one expected phase. */
function effectsFor(expected: ExpectedOutcome, mutate: 'none' | 'wrongTarget' | 'droppedSubmit' | 'literalSubstitution' = 'none'): Effect {
  return async ({ base, phase }) => {
    let observed = idealObservation(expected, {});
    if (mutate !== 'none') observed = mutateObservation(mutate, observed, expected).observed;
    const spec = observed.receipts.phases[phase];
    if (spec === undefined) return;
    for (const page of phase === 'run' || phase === 'base' ? spec.views : []) await fetch(`${base}/${page}`);
    for (const action of spec.actions) { const { type, ...fields } = action; await post(`${base}/__event`, JSON.stringify({ type, ...fields })); }
  };
}

function scriptedApi(plans: (name: string) => Plan) {
  const log: string[] = [];
  const state = { finalizes: 0, cancels: 0, sessions: 0, replays: 0, starts: [] as JsonObject[] };
  interface Sess { plan: Plan; queue: string[]; terminal: string; origin: string; base: string; value: string; counters: number }
  const sessions = new Map<string, Sess>();
  const drafts = new Map<string, { name: string; origin: string; base: string }>();
  let n = 0;
  const readValue = async (origin: string): Promise<string> => /<output[^>]*>([^<]*)<\/output>/u.exec(await (await fetch(`${origin}/source`)).text())?.[1] ?? '';
  const client: StudioApiClient = {
    createDraft: (name, authoring) => {
      const variables = authoring.request.variables as { kind: string; value?: string }[];
      const url = variables.find((v) => v.kind === 'plain' && typeof v.value === 'string' && v.value.startsWith('http'))?.value ?? '';
      const parsed = url === '' ? new URL('http://127.0.0.1:1/x') : new URL(url);
      const base = `${parsed.origin}${parsed.pathname.split('/').slice(0, -1).join('/')}`;
      drafts.set(`t${String(++n)}`, { name, origin: parsed.origin, base });
      log.push(`createDraft ${name}`);
      return Promise.resolve({ id: `t${String(n)}`, sourceRevision: 1, configurationRevision: 1 });
    },
    updateDraft: (id, name) => { log.push(`updateDraft ${name}`); return Promise.resolve({ id, sourceRevision: 2, configurationRevision: 1 }); },
    startSession: async (draft, extra) => {
      const d = drafts.get(draft.id);
      if (d === undefined) throw new Error('draft');
      state.starts.push(extra ?? {});
      const plan = plans(d.name);
      const id = `s${String(++state.sessions)}`;
      const value = d.name.startsWith('D3') || d.name.includes('incremental') ? await readValue(d.origin) : '';
      const phase = d.name.includes(' edit ') ? 'incremental' : d.name.includes(' base ') ? 'base' : 'run';
      await plan.effects({ base: d.base, origin: d.origin, phase, value });
      sessions.set(id, { plan, queue: ['PREPARING', 'OBSERVING', plan.clarification === true ? 'AWAITING_CLARIFICATION' : plan.terminal], terminal: plan.terminal, origin: d.origin, base: d.base, value, counters: 4 });
      return { session: { sessionId: id, state: 'PREPARING' } };
    },
    readSession: (id) => {
      const s = sessions.get(id);
      if (s === undefined) throw new Error('session');
      const next = s.queue.length > 1 ? s.queue.shift() : s.queue[0];
      return Promise.resolve({ session: { sessionId: id, state: next ?? s.terminal, counters: { modelProposals: s.counters, modelInputTokens: 9000, modelOutputTokens: 800 } } });
    },
    readClarification: (id) => Promise.resolve(sessions.get(id)?.plan.clarification === true && !sessions.get(id)?.queue.includes('CANCELLED') ? { clarificationId: 'q1', generation: 0 } : null),
    clarify: () => Promise.reject(new Error('the case script names no answer; the harness must not answer')),
    cancel: (id) => { state.cancels += 1; const s = sessions.get(id); if (s) { s.queue = ['CANCELLED']; s.terminal = 'CANCELLED'; } return Promise.resolve({}); },
    finalize: () => { state.finalizes += 1; return Promise.resolve({}); },
    readResult: (id) => {
      const s = sessions.get(id);
      return Promise.resolve({
        outcome: s?.terminal, failure: s?.plan.failureCode === undefined ? null : { code: s.plan.failureCode, stepNumber: 2 },
        publication: { status: s?.plan.published === true && state.finalizes > 0 ? 'PUBLISHED' : 'PENDING', receipt: s?.plan.published === true && state.finalizes > 0 ? { revisionId: 'rev-1' } : null },
        explanation: { steps: s?.plan.explanation ?? [] },
        ...(s?.plan.echoes === undefined ? {} : { diagnostics: `login failed for ${s.plan.echoes}` }),
      });
    },
    execute: async (testId) => {
      state.replays += 1;
      const d = drafts.get(testId);
      if (d) { const plan = plans(d.name); await plan.replayEffects?.({ base: d.base, origin: d.origin, phase: 'replay', value: await readValue(d.origin) }); }
      return { executionId: `e${String(state.replays)}` };
    },
    readExecution: () => Promise.resolve({ status: 'PASSED' }),
  };
  return { client, log, state };
}

const idealPlan = (expected: ExpectedOutcome, mutate: Parameters<typeof effectsFor>[1] = 'none'): Plan => ({
  terminal: expected.session.terminal[0] ?? 'SUCCEEDED', published: expected.session.published, ...(expected.session.failureCodes?.[0] === undefined ? {} : { failureCode: expected.session.failureCodes[0] }),
  effects: effectsFor(expected, mutate),
});

/** Group5 uses only memory receipts and a scripted object: no host, fetch, browser, model or backend. */
async function memoryIncremental(options: { stopAfterBase?: boolean; failedBase?: boolean; leakedBase?: boolean; lateLeak?: boolean; unconfirmedSuffixStart?: boolean; missing?: 'baseProposal' | 'suffixProposal' | 'baseInput' | 'suffixOutput' } = {}) {
  const entry = entryOf(manifest, 'incremental-edit-step-4');
  const events: JsonObject[] = []; const order: string[] = []; const finalized = new Set<string>(); let starts = 0;
  const counters: JsonObject[] = [
    { modelProposals: 10, modelInputTokens: 100, modelOutputTokens: 20 },
    { modelProposals: 3, modelInputTokens: 40, modelOutputTokens: 5 },
  ];
  if (options.missing === 'baseProposal') Object.assign(counters[0] ?? {}, { modelProposals: null });
  if (options.missing === 'suffixProposal') Object.assign(counters[1] ?? {}, { modelProposals: null });
  if (options.missing === 'baseInput') Object.assign(counters[0] ?? {}, { modelInputTokens: null });
  if (options.missing === 'suffixOutput') Object.assign(counters[1] ?? {}, { modelOutputTokens: null });
  const client: StudioApiClient = {
    createDraft: () => Promise.resolve({ id: 'memory', sourceRevision: 1, configurationRevision: 1 }),
    updateDraft: () => { order.push('update'); return Promise.resolve({ id: 'memory', sourceRevision: 2, configurationRevision: 1, diagnostics: options.lateLeak ? 'unit-canary-secret' : undefined }); },
    startSession: () => {
      starts += 1; order.push(`start-${String(starts)}`);
      if (starts === 2 && options.unconfirmedSuffixStart) return Promise.reject(new Error('unit start observation unavailable'));
      events.push({ type: 'receipt.post', body: starts === 1 ? 'base-reference-value' : 'fresh-current-session-reference' });
      return Promise.resolve({ session: { sessionId: `m${String(starts)}`, state: 'PREPARING' } });
    },
    readSession: (id) => Promise.resolve({ session: { sessionId: id, state: id === 'm1' && options.failedBase ? 'FAILED' : 'SUCCEEDED', counters: counters[Number(id.slice(1)) - 1] ?? {} } }),
    readResult: (id) => Promise.resolve({ publication: { status: finalized.has(id) ? 'PUBLISHED' : 'PENDING', receipt: finalized.has(id) ? { revisionId: 'memory-revision' } : null },
      failure: options.failedBase && id === 'm1' ? { code: 'BUDGET_EXCEEDED' } : null,
      explanation: { steps: Array.from({ length: 10 }, (_v, i) => ({ number: i + 1, learnedFromThisRun: i >= 3, reusedFrom: i < 3 ? { revisionId: 'memory-revision', stepId: String(i) } : null })) } }),
    finalize: (id) => { finalized.add(id); order.push(`finalize-${id}`); return Promise.resolve({}); },
    readClarification: () => Promise.resolve(null), clarify: () => Promise.reject(new Error('unexpected clarification')), cancel: () => Promise.resolve({}),
    execute: () => Promise.resolve({ executionId: 'unused' }), readExecution: () => Promise.resolve({ status: 'PASSED' }),
  };
  const stop = createStopRule({ allocationUsd: options.stopAfterBase ? 125 : 1_000_000_000, price: { pInPerMTok: 1_000_000, pOutPerMTok: 0 }, reservedCeiling: { input: 1000, output: 1000 } });
  const record = stop.record;
  stop.record = (session) => { order.push(`charge-${String(stop.state().sessions + 1)}`); return record(session); };
  const run = await driveIncremental({ manifest, entry, expected: expectedOf(entry), caseFile: readJson(entry.stepText?.path ?? '') as JsonObject,
    client, receipts: { mark: () => events.length, since: (cursor) => ({ actions: events.slice(cursor), views: [] }) }, switchSourceValue: () => { order.push('switch'); },
    vars: {}, mode: 'HARNESS_SELF_TEST', stopRule: stop, ...FAST, secretCanaries: ['unit-canary-secret'],
    extraTexts: options.leakedBase ? () => Promise.resolve({ closedUnit: 'unit-canary-secret' }) : null });
  return { run, starts, stop, order };
}

describe('group5: pure two-session and missing-charge controls', () => {
  it('sums base10/100/20 plus suffix3/40/5 and charges each real learn once in order', async () => {
    const { run, starts, stop, order } = await memoryIncremental();
    expect(run.usage?.modelProposals).toBe(13); // Defining old semantic RED: suffix-only3.
    expect(run.usage).toEqual({ basis: 'PUBLIC_BUDGET_COUNTERS', modelProposals: 13, inputTokens: 140, outputTokens: 25 });
    expect(starts).toBe(2); expect(stop.state().sessions).toBe(2);
    expect(order).toEqual(['start-1', 'charge-1', 'finalize-m1', 'switch', 'update', 'start-2', 'charge-2', 'finalize-m2']);
    expect(run.learnSessions?.map((session) => session.phase)).toEqual(['base', 'incremental']);
    expect(run.incremental).toMatchObject({ logicalStatus: 'COMPLETE', suffixStarted: true, notCompletedBecause: null });
    expect(run.oracle).toMatchObject({ correct: true, falseSuccess: false });
    const report = buildBenchmark({ manifest, runs: [run], mode: 'HARNESS_SELF_TEST', price: { pInPerMTok: 1, pOutPerMTok: 2 } });
    expect(report.charges.allAttempts).toMatchObject({ logicalAttempts: 1, knownStartedSessions: 2, proposals: { total: 13 }, input: { total: 140 }, output: { total: 25 } });
    expect(report.modelCalls.total).toBeNull(); expect(report.costUsd.total).toBeNull(); expect(report.costUsd.conservativeChargeUsd).toBeCloseTo(0.00019);
  });

  it.each([
    { label: 'budget', options: { stopAfterBase: true }, reason: 'STOPPED_BUDGET_80', terminal: 'SUCCEEDED' },
    { label: 'failed base', options: { failedBase: true }, reason: 'BASE_NOT_SUCCEEDED', terminal: 'FAILED' },
    { label: 'base leak', options: { leakedBase: true }, reason: 'STOPPED_HARD_GATE', terminal: 'SUCCEEDED' },
  ])('starts no suffix after $label, retaining one truthful partial session without a fabricated false pass', async ({ options, reason, terminal }) => {
    const { run, starts, stop } = await memoryIncremental(options);
    expect(starts).toBe(1); // Old budget/leak source starts the suffix; no missing-method RED.
    expect(stop.state().sessions).toBe(1);
    expect(run.usage).toMatchObject({ modelProposals: 10, inputTokens: 100, outputTokens: 20 });
    expect(run.learnSessions).toHaveLength(1); expect(run.learnSessions?.[0]?.session?.terminal).toBe(terminal);
    expect(run.session).toMatchObject({ terminal, published: false });
    expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false, notCompletedBecause: reason });
    expect(run.oracle).toEqual({ correct: false, falseSuccess: false, failures: ['incremental-not-completed'] });
    expect(run.learnSessionsComplete).toBe(true);
    if (reason === 'STOPPED_HARD_GATE') expect(run.secretOrPiiLeak).toBeGreaterThan(0);
    expect(JSON.stringify(run)).not.toContain('unit-canary-secret');
  });

  it('keeps missing base/suffix counters, unknown histories and empty populations incomplete', async () => {
    const empty = buildBenchmark({ manifest, runs: [], mode: 'HARNESS_SELF_TEST' });
    expect(empty.modelCalls.total).toBeNull(); // Old reduction reports0 for no observations.
    expect(empty.charges.allAttempts.proposals).toMatchObject({ total: null, knownSubtotal: 0, complete: false });
    for (const missing of ['baseProposal', 'suffixProposal', 'baseInput', 'suffixOutput'] as const) {
      const { run, stop } = await memoryIncremental({ missing });
      const report = buildBenchmark({ manifest, runs: [run], mode: 'HARNESS_SELF_TEST', price: { pInPerMTok: 1, pOutPerMTok: 2 } });
      expect(stop.state().sessions).toBe(2);
      if (missing.endsWith('Proposal')) expect(report.charges.allAttempts.proposals).toMatchObject({ total: null, knownSubtotal: missing === 'baseProposal' ? 3 : 10, unknownSessions: 1 });
      else expect(report.tokens.complete).toBe(false);
      expect(report.modelCalls.total).toBeNull(); expect(report.costUsd.total).toBeNull(); expect(report.costUsd.conservativeChargeUsd).toBeNull();
      const unknown: RunRecord = { ...structuredClone(run), learnSessionsComplete: false };
      expect(buildBenchmark({ manifest, runs: [unknown], mode: 'HARNESS_SELF_TEST' }).charges.allAttempts.proposals.total).toBeNull();
    }
    const interrupted = await memoryIncremental({ unconfirmedSuffixStart: true });
    expect(interrupted.run.learnSessions).toHaveLength(1);
    expect(interrupted.run.learnSessions?.[0]?.session?.terminal).toBe('SUCCEEDED');
    expect(interrupted.run.learnSessionsComplete).toBe(false);
    expect(interrupted.run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', notCompletedBecause: null });
    expect(interrupted.run.incremental?.suffixStarted).toBeUndefined(); // UNKNOWN, never a false not-started assertion.
    expect(interrupted.run.oracle).toMatchObject({ correct: false, falseSuccess: false });
    expect(interrupted.stop.state().sessions).toBe(2); // One known session plus one conservative potential-start charge.
    const interruptedReport = buildBenchmark({ manifest, runs: [interrupted.run], mode: 'HARNESS_SELF_TEST' });
    expect(interruptedReport.charges.allAttempts.proposals).toMatchObject({ total: null, knownSubtotal: 10 });
    expect(interruptedReport.charges.allAttempts.protectiveStopCharges).toMatchObject({ totalUsd: null, knownSubtotalUsd: 1100, unresolvedPotentialStarts: 1 });
    const { run } = await memoryIncremental();
    const noStart: RunRecord = { ...run, oracle: { correct: false, falseSuccess: false, failures: ['not-started'] }, incremental: { logicalStatus: 'INCOMPLETE', suffixStarted: false, notCompletedBecause: null }, usage: { basis: 'PUBLIC_BUDGET_COUNTERS', modelProposals: 0, inputTokens: 0, outputTokens: 0 }, learnSessions: [], learnSessionsComplete: true };
    delete noStart.session; delete noStart.sessionId;
    expect(buildBenchmark({ manifest, runs: [noStart], mode: 'HARNESS_SELF_TEST' }).charges.allAttempts.proposals.total).toBe(0);
  });

  it('latches a late update leak after the base charge without a suffix or a second charge', async () => {
    const { run, starts, stop } = await memoryIncremental({ lateLeak: true });
    expect(starts).toBe(1);
    expect(stop.state()).toMatchObject({ sessions: 1, stopped: 'STOPPED_HARD_GATE' });
    expect(run.incremental).toMatchObject({ suffixStarted: false, logicalStatus: 'INCOMPLETE' });
    expect(run.secretOrPiiLeak).toBeGreaterThan(0);
    expect(run.details?.stopObservations).toContainEqual({ phase: 'base', reason: 'STOPPED_HARD_GATE' });
    expect(JSON.stringify(run)).not.toContain('unit-canary-secret');
  });
});
const entryOf = (m: CorpusManifest, id: string) => m.cases.find((c) => c.id === id) ?? (() => { throw new Error(id); })();
const FAST = { pollMs: 0, pause: () => Promise.resolve() };

describe('harness self-test: the driver and the oracle against the real fixture hosts (HARNESS_SELF_TEST)', () => {
  it('runs class P cases three times each, finalizes exactly once per completed session, and scores them correct', async () => {
    const ids = ['C03-rf-wiki-search-var', 'C04-account-save', 'C06-forms-fill-save', 'E4-virtualised-list'];
    const api = scriptedApi((name) => idealPlan(expectedOf(entryOf(manifest, name.split(' ')[0] ?? ''))));
    const { runs, benchmark } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: ids, driveOptions: FAST });
    expect(runs).toHaveLength(12);
    expect(runs.every((r) => r.mode === 'HARNESS_SELF_TEST')).toBe(true);
    expect(runs.map((r) => [r.caseId, r.oracle?.failures])).toEqual(runs.map((r) => [r.caseId, []]));
    expect(api.state.finalizes).toBe(12);
    expect(api.state.cancels).toBe(0);
    expect(benchmark.label).toBe(SELF_TEST_LABEL);
    expect(benchmark.gate.verdict).toBe('NOT_EVIDENCE');
  });

  it('stamps every run after the manifest freeze, with the frozen digest and the three accounting fields as 0', async () => {
    const api = scriptedApi((name) => idealPlan(expectedOf(entryOf(manifest, name.split(' ')[0] ?? ''))));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: ['C01-rf-example-url'], driveOptions: FAST });
    for (const run of runs) {
      expect(Date.parse(run.runStartedAt)).toBeGreaterThan(Date.parse(manifest.manifestFrozenAt ?? ''));
      expect(run.manifestSha256).toBe(manifest.manifestSha256);
      expect([run.rs1NonScalarReadGaps, run.authoredEchoUnobservableTargets, run.focusMutationRefusedFills]).toEqual([0, 0, 0]);
      expect(run.usage).toEqual({ basis: 'PUBLIC_BUDGET_COUNTERS', modelProposals: 4, inputTokens: 9000, outputTokens: 800 });
    }
  });

  it('scores a mutated system as incorrect and a false success when it claims SUCCEEDED (wrong target on C04)', async () => {
    const api = scriptedApi((name) => idealPlan(expectedOf(entryOf(manifest, name.split(' ')[0] ?? '')), 'wrongTarget'));
    const { runs, benchmark } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: ['C04-account-save'], driveOptions: FAST });
    expect(runs.every((r) => r.oracle?.correct === false && r.oracle.falseSuccess)).toBe(true);
    expect(benchmark.hardGates.falsePasses).toBe(3);
  });

  it.each(['droppedSubmit', 'literalSubstitution'] as const)('rejects the %s defect on C06 through the receipts, not through the system\'s own PASSED', async (mutation) => {
    const api = scriptedApi((name) => idealPlan(expectedOf(entryOf(manifest, name.split(' ')[0] ?? '')), mutation));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: ['C06-forms-fill-save'], driveOptions: FAST });
    expect(runs.map((r) => r.session?.terminal)).toEqual(['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED']);
    expect(runs.every((r) => r.oracle?.correct === false)).toBe(true);
  });

  it('class F: an honest FAILED at step 2 is correct; the same page scored against a system that PASSES is a false pass', async () => {
    const entry = entryOf(manifest, 'C08-intended-assertion-fail');
    const expected = expectedOf(entry);
    const honest = scriptedApi(() => idealPlan(expected));
    const a = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: honest.client, select: [entry.id], driveOptions: FAST });
    expect(a.runs.every((r) => r.oracle?.correct === true)).toBe(true);
    expect(honest.state.finalizes).toBe(0);
    const liar = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: effectsFor(expected) }));
    const b = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: liar.client, select: [entry.id], driveOptions: FAST });
    expect(b.runs.every((r) => r.oracle?.falseSuccess === true)).toBe(true);
  });

  it('class N with a clarification: counts it, never answers it (the case script names no choice), cancels, and scores the refusal correct', async () => {
    const entry = entryOf(manifest, 'C12-clarify-click-button');
    const expected = expectedOf(entry);
    const api = scriptedApi(() => ({ terminal: 'AWAITING_CLARIFICATION', published: false, clarification: true, effects: effectsFor(expected) }));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: [entry.id], driveOptions: FAST });
    expect(api.state.cancels).toBe(3);
    expect(runs.every((r) => r.session?.clarifications === 1 && r.session.observedStates.includes('AWAITING_CLARIFICATION'))).toBe(true);
    expect(runs.every((r) => r.oracle?.correct === true)).toBe(true);
  });

  it('class N: a system that acts on the Delete button despite the negation is a false pass even when the session then fails', async () => {
    const entry = entryOf(manifest, 'C09-negation-trap');
    const expected = expectedOf(entry);
    const api = scriptedApi(() => ({ terminal: 'FAILED', published: false, failureCode: 'ASSERTION_FAILED', effects: async ({ base }) => { await fetch(`${base}/forms`); await post(`${base}/__event`, JSON.stringify({ type: 'record.delete', id: '1' })); } }));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: [entry.id], driveOptions: FAST });
    expect(expected.session.published).toBe(false);
    expect(runs.every((r) => r.oracle?.correct === false && r.oracle.falseSuccess)).toBe(true);
  });

  it('login with a secretRef on the existing secret-login fixture: the receipt carries accepted only, never the password', async () => {
    const entry = entryOf(manifest, 'D1-login-secret-fixture');
    const api = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: async ({ origin }) => {
      await post(`${origin}/login`, `username=pilot-user&password=${PASSWORD}`, 'application/x-www-form-urlencoded');
    } }));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: [entry.id], plantedSecrets: { c05: 'planted-c05-unused-secret-3141', d1: PASSWORD }, driveOptions: FAST });
    expect(runs).toHaveLength(3);
    expect(runs.every((r) => r.oracle?.correct === true)).toBe(true);
    expect(JSON.stringify(runs)).not.toContain(PASSWORD);
  });

  it('AC-10 local half: a secret echoed in any API response is a leak, counted per run, without the run record carrying the secret', async () => {
    const entry = entryOf(manifest, 'D1-login-secret-fixture');
    const login: Effect = async ({ origin }) => { await post(`${origin}/login`, `username=pilot-user&password=${PASSWORD}`, 'application/x-www-form-urlencoded'); };
    const leaky = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: login, echoes: PASSWORD }));
    const { runs, benchmark } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: leaky.client, select: [entry.id], plantedSecrets: { c05: 'planted-c05-unused-secret-3141', d1: PASSWORD }, driveOptions: FAST });
    expect(runs.every((r) => (r.secretOrPiiLeak ?? 0) > 0)).toBe(true);
    expect(benchmark.hardGates.secretOrPiiLeaks).toBe(3);
    expect(JSON.stringify(runs)).not.toContain(PASSWORD);
    const clean = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: login }));
    const ok = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: clean.client, select: [entry.id], plantedSecrets: { c05: 'planted-c05-unused-secret-3141', d1: PASSWORD }, driveOptions: FAST });
    expect(ok.runs.map((r) => r.secretOrPiiLeak)).toEqual([0, 0, 0]);
  });

  it('scans operator-supplied text outputs (logs, SSE, audit) through the extraTexts hook', async () => {
    const entry = entryOf(manifest, 'D1-login-secret-fixture');
    const login: Effect = async ({ origin }) => { await post(`${origin}/login`, `username=pilot-user&password=${PASSWORD}`, 'application/x-www-form-urlencoded'); };
    const api = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: login }));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: [entry.id], plantedSecrets: { c05: 'planted-c05-unused-secret-3141', d1: PASSWORD }, driveOptions: { ...FAST, extraTexts: () => Promise.resolve({ backendLog: `dispatch body ${PASSWORD}` }) } });
    expect(runs.every((r) => r.secretOrPiiLeak === 1)).toBe(true);
    expect(runs[0]?.details?.canaryFindings).toEqual([expect.objectContaining({ label: 'backendLog' })]);
  });

  it('dataflow protocol on the existing guided-dataflow fixture: one submit, finalize adds none, two replays one each', async () => {
    const entry = entryOf(manifest, 'D3-dataflow-multistep');
    const submit: Effect = async ({ origin, value }) => { await post(`${origin}/receipt`, value, 'text/plain'); };
    const api = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: submit, replayEffects: submit }));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: [entry.id], driveOptions: FAST });
    expect(runs.every((r) => r.oracle?.correct === true)).toBe(true);
    expect(api.state.finalizes).toBe(3);
    expect(api.state.replays).toBe(6);
    const doubleSubmit = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: async (c) => { await submit(c); await submit(c); }, replayEffects: submit }));
    const bad = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: doubleSubmit.client, select: [entry.id], driveOptions: FAST });
    expect(bad.runs.every((r) => r.oracle?.correct === false)).toBe(true);
  });

  it('incremental edit of step 4: base learned and published, source value changed, steps 4..10 learned, 1..3 reused, finalize adds no model call', async () => {
    const entry = entryOf(manifest, 'incremental-edit-step-4');
    const steps = Array.from({ length: 10 }, (_v, i) => ({ number: i + 1, learnedFromThisRun: i >= 3, reusedFrom: i < 3 ? { revisionId: 'rev-1', stepId: String(i) } : null }));
    const submit: Effect = async ({ origin, value }) => { await post(`${origin}/receipt`, value, 'text/plain'); };
    const api = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: submit, explanation: steps }));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: [entry.id], driveOptions: FAST });
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run.oracle).toMatchObject({ correct: true });
      expect(run.incremental).toMatchObject({ prefixLearnedSteps: 0, prefixReusedSteps: 3, finalizeModelCalls: 0, relearnedFromStepNumber: 4, relearnedThroughStepNumber: 10 });
    }
    expect(api.state.starts.filter((s) => s.firstLearnStepId !== undefined)).toHaveLength(3);
    expect(api.state.finalizes).toBe(6);
  });

  it('incremental: a system that relearns the prefix is scored incorrect', async () => {
    const entry = entryOf(manifest, 'incremental-edit-step-4');
    const steps = Array.from({ length: 10 }, (_v, i) => ({ number: i + 1, learnedFromThisRun: true, reusedFrom: null }));
    const submit: Effect = async ({ origin, value }) => { await post(`${origin}/receipt`, value, 'text/plain'); };
    const api = scriptedApi(() => ({ terminal: 'SUCCEEDED', published: true, effects: submit, explanation: steps }));
    const { runs } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: [entry.id], driveOptions: FAST });
    expect(runs.every((r) => r.oracle?.correct === false)).toBe(true);
    expect(runs.every((r) => r.oracle?.failures.includes('incremental-relearned-range') === true || r.oracle?.failures.includes('incremental-prefixReusedSteps') === true)).toBe(true);
  });

  it('skips the two externally blocked cases and says so in the ledger instead of faking a run', async () => {
    const api = scriptedApi((name) => idealPlan(expectedOf(entryOf(manifest, name.split(' ')[0] ?? ''))));
    const { benchmark } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: ['C01-rf-example-url', 'D2-login-staging-real', 'E1-sso-approved-origin'], driveOptions: FAST });
    expect(benchmark.denominatorLedger.blockedUnrunCases).toEqual(['D2-login-staging-real', 'E1-sso-approved-origin']);
    expect(api.log.filter((l) => l.startsWith('createDraft D2') || l.startsWith('createDraft E1'))).toEqual([]);
  });
});
