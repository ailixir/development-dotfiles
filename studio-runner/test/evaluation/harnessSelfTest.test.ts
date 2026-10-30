/**
 * STUDIO-OBS-009 AC-7 harness self-test: the run driver against a SCRIPTED public API and the real fixture
 * hosts (corpus pages, plus the existing secret-login and guided-dataflow fixtures hosted in-process).
 * The scripted API plays the part of the system under test; its "model" is the case's own expected outcome or a
 * mutation of it. Every record here is labelled HARNESS_SELF_TEST and is NOT D-C evidence: no model, no provider,
 * no Studio backend was involved.
 */
import { describe, expect, it } from 'vitest';
import {
  runBenchmark, driveIncremental, createPublicApiClient, createStopRule, buildBenchmark, mutateObservation, idealObservation, gateArithmetic, sessionPlan, manifestDigest, validateCorpusManifest, repoRootFrom, sha256Hex, SELF_TEST_LABEL,
  type CorpusManifest, type ExpectedOutcome, type JsonObject, type StudioApiClient, type RunRecord,
} from '../../evaluation/observed-authoring/evaluate.mjs';
import { expectedOf, frozenManifest, readJson, syntheticRuns, reviewedInput, must } from './observedCorpus.js';

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
    readDraft: (id) => Promise.resolve({ id, sourceRevision: 1, configurationRevision: 1 }),
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

interface RevisionRequest { method: string; url: string; body: unknown; authorization: string | null }

/** The real public client with in-memory HTTP replies: transport never calls fetch or opens a host. */
function revisionApi(options: { readResponse?: unknown; updateResponse?: unknown; conflict?: boolean; readUnavailable?: boolean; onRequest?: (method: string) => void } = {}) {
  const requests: RevisionRequest[] = [];
  const client = createPublicApiClient({
    baseUrl: 'http://127.0.0.1/api/v1/studio', token: 'unit-transport-token', csiId: '60406', environmentId: 'dev',
    transport: (url, init) => {
      const method = init.method ?? 'GET';
      if (url.pathname !== '/api/v1/studio/tests/memory' || !['GET', 'PUT'].includes(method)) return Promise.reject(new Error('Unexpected unit request'));
      const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      requests.push({ method, url: url.toString(), body, authorization: new Headers(init.headers).get('authorization') });
      options.onRequest?.(method);
      const status = method === 'GET' && options.readUnavailable ? 503 : method === 'PUT' && options.conflict ? 409 : 200;
      const response = status === 503 ? { code: 'UNAVAILABLE' } : status === 409 ? { error: 'STALE_REVISION' }
        : method === 'GET' ? 'readResponse' in options ? options.readResponse : { id: 'memory', sourceRevision: 7, configurationRevision: 11 }
          : 'updateResponse' in options ? options.updateResponse : { id: 'memory', sourceRevision: 17, configurationRevision: 19 };
      return Promise.resolve(new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } }));
    },
  });
  return { client, requests };
}

/** Group5 uses only memory receipts and scripted/injected replies: no host, fetch, browser, model or backend. */
async function memoryIncremental(options: { stopAfterBase?: boolean; failedBase?: boolean; leakedBase?: boolean; lateLeak?: boolean; unconfirmedSuffixStart?: boolean; missing?: 'baseProposal' | 'suffixProposal' | 'baseInput' | 'suffixOutput'; draftRead?: unknown; draftUpdate?: unknown; draftConflict?: boolean; draftReadUnavailable?: boolean } = {}) {
  const entry = entryOf(manifest, 'incremental-edit-step-4');
  const events: JsonObject[] = []; const order: string[] = []; const finalized = new Set<string>(); let starts = 0;
  const startedDrafts: Parameters<StudioApiClient['startSession']>[0][] = [];
  const revision = revisionApi({
    readResponse: 'draftRead' in options ? options.draftRead : { id: 'memory', sourceRevision: 7, configurationRevision: 11 },
    updateResponse: 'draftUpdate' in options ? options.draftUpdate : { id: 'memory', sourceRevision: 17, configurationRevision: 19, ...(options.lateLeak ? { diagnostics: 'unit-canary-secret' } : {}) },
    conflict: options.draftConflict === true, readUnavailable: options.draftReadUnavailable === true,
    onRequest: (method) => { order.push(method === 'GET' ? 'read-draft' : 'update'); },
  });
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
    readDraft: (id) => revision.client.readDraft(id),
    updateDraft: (id, name, authoring, revisions) => revision.client.updateDraft(id, name, authoring, revisions),
    startSession: (draft) => {
      startedDrafts.push({ ...draft });
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
  const record = stop.record.bind(stop);
  stop.record = (session) => { order.push(`charge-${String(stop.state().sessions + 1)}`); return record(session); };
  const run = await driveIncremental({ manifest, entry, expected: expectedOf(entry), caseFile: readJson(entry.stepText?.path ?? '') as JsonObject,
    client, receipts: { mark: () => events.length, since: (cursor) => ({ actions: events.slice(cursor), views: [] }) }, switchSourceValue: () => { order.push('switch'); },
    vars: {}, mode: 'HARNESS_SELF_TEST', stopRule: stop, ...FAST, secretCanaries: ['unit-canary-secret'],
    extraTexts: options.leakedBase ? () => Promise.resolve({ closedUnit: 'unit-canary-secret' }) : null });
  return { run, starts, stop, order, requests: revision.requests, startedDrafts };
}

describe('group5: pure two-session and missing-charge controls', () => {
  it('sums base10/100/20 plus suffix3/40/5 and charges each real learn once in order', async () => {
    const { run, starts, stop, order } = await memoryIncremental();
    expect(run.usage?.modelProposals).toBe(13); // Defining old semantic RED: suffix-only3.
    expect(run.usage).toEqual({ basis: 'PUBLIC_BUDGET_COUNTERS', modelProposals: 13, inputTokens: 140, outputTokens: 25 });
    expect(starts).toBe(2); expect(stop.state().sessions).toBe(2);
    expect(order).toEqual(['start-1', 'charge-1', 'finalize-m1', 'read-draft', 'switch', 'update', 'start-2', 'charge-2', 'finalize-m2']);
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

describe('FR06-01: current draft revision transport and capture', () => {
  it('FR06-01 sends current numeric PUT tokens after authored fields and retains full successful bodies', async () => {
    const read = { id: 'memory', sourceRevision: 7, configurationRevision: 11, diagnostics: 'read-marker' };
    const written = { id: 'memory', sourceRevision: 17, configurationRevision: 19, diagnostics: 'write-marker' };
    const { client, requests } = revisionApi({ readResponse: read, updateResponse: written });
    expect(await client.readDraft('memory')).toEqual(read);
    expect(await client.updateDraft('memory', 'edited', { request: { authoringSchemaVersion: 2, steps: [], sourceRevision: 500, configurationRevision: 900 } }, { sourceRevision: 7, configurationRevision: 11 })).toEqual(written);
    expect(requests).toEqual([
      { method: 'GET', url: 'http://127.0.0.1/api/v1/studio/tests/memory', body: undefined, authorization: 'Bearer unit-transport-token' },
      { method: 'PUT', url: 'http://127.0.0.1/api/v1/studio/tests/memory', body: { name: 'edited', csiId: '60406', environment: 'dev', authoringSchemaVersion: 2, steps: [], sourceRevision: 7, configurationRevision: 11 }, authorization: 'Bearer unit-transport-token' },
    ]);
  });

  const invalid = [
    { label: 'missing', value: undefined }, { label: 'null', value: null }, { label: 'string', value: '7' },
    { label: 'zero', value: 0 }, { label: 'negative', value: -1 }, { label: 'fraction', value: 1.5 },
    { label: 'unsafe', value: Number.MAX_SAFE_INTEGER + 1 },
  ];
  it.each((['sourceRevision', 'configurationRevision'] as const).flatMap((field) => invalid.map((entry) => ({ field, ...entry }))))(
    'FR06-01 refuses $label $field before PUT without coercing the revision or adding a session', async ({ field, value }) => {
      const direct = revisionApi();
      const revisions = { sourceRevision: 7, configurationRevision: 11 };
      // Model a malformed external JS caller without hiding the boundary behind an any cast.
      Object.defineProperty(revisions, field, { value });
      await expect(direct.client.updateDraft('memory', 'edited', { request: {} }, revisions)).rejects.toThrow('Invalid draft revisions');
      expect(direct.requests).toHaveLength(0);
      const { run, starts, stop, requests } = await memoryIncremental({ draftRead: { id: 'memory', sourceRevision: 7, configurationRevision: 11, [field]: value } });
      expect(requests.map((request) => request.method)).toEqual(['GET']);
      expect(starts).toBe(1); expect(stop.state().sessions).toBe(1);
      expect(run.usage).toMatchObject({ modelProposals: 10, inputTokens: 100, outputTokens: 20 });
      expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false });
      expect(run.oracle).toMatchObject({ correct: false, falseSuccess: false });
    },
  );

  it('FR06-01 preserves the largest safe numeric input without stringifying or rounding it', async () => {
    const { client, requests } = revisionApi();
    await client.updateDraft('memory', 'edited', { request: {} }, { sourceRevision: Number.MAX_SAFE_INTEGER, configurationRevision: Number.MAX_SAFE_INTEGER });
    expect(requests[0]?.body).toMatchObject({ sourceRevision: 9007199254740991, configurationRevision: 9007199254740991 });
  });

  it('FR06-01 fetches after base publication and uses that tuple for PUT and the PUT response for suffix start', async () => {
    const { run, starts, stop, order, requests, startedDrafts } = await memoryIncremental();
    expect(order).toEqual(['start-1', 'charge-1', 'finalize-m1', 'read-draft', 'switch', 'update', 'start-2', 'charge-2', 'finalize-m2']);
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PUT']);
    expect(requests[1]?.body).toMatchObject({ sourceRevision: 7, configurationRevision: 11 });
    expect(startedDrafts).toEqual([{ id: 'memory', sourceRevision: 1, configurationRevision: 1 }, { id: 'memory', sourceRevision: 17, configurationRevision: 19 }]);
    expect(starts).toBe(2); expect(stop.state().sessions).toBe(2);
    expect(run.oracle).toMatchObject({ correct: true, falseSuccess: false });
    expect(run.usage).toMatchObject({ modelProposals: 13, inputTokens: 140, outputTokens: 25 });
  });

  it.each([{ phase: 'GET', puts: 0 }, { phase: 'PUT', puts: 1 }])(
    'FR06-01 refuses a mismatched draft identity from $phase without a suffix or retry', async ({ phase, puts }) => {
      const wrong = { id: 'different-draft', sourceRevision: 7, configurationRevision: 11 };
      const { run, starts, stop, requests } = await memoryIncremental(phase === 'GET' ? { draftRead: wrong } : { draftUpdate: wrong });
      expect(requests.filter((request) => request.method === 'GET')).toHaveLength(1);
      expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(puts);
      expect(starts).toBe(1); expect(stop.state().sessions).toBe(1);
      expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false });
      expect(run.oracle).toMatchObject({ correct: false, falseSuccess: false });
    },
  );

  it('FR06-01 propagates one HTTP409 and records one incomplete base without reloading, retrying or charging twice', async () => {
    const direct = revisionApi({ conflict: true });
    await expect(direct.client.updateDraft('memory', 'edited', { request: {} }, { sourceRevision: 7, configurationRevision: 11 })).rejects.toMatchObject({ status: 409, code: 'STALE_REVISION' });
    expect(direct.requests.map((request) => request.method)).toEqual(['PUT']);
    const { run, starts, stop, requests } = await memoryIncremental({ draftConflict: true });
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PUT']);
    expect(starts).toBe(1); expect(stop.state().sessions).toBe(1);
    expect(run.learnSessions).toHaveLength(1); expect(run.learnSessions?.[0]?.budgetCharge).toMatchObject({ amountUsd: 100 });
    expect(run.usage).toMatchObject({ modelProposals: 10, inputTokens: 100, outputTokens: 20 });
    expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false });
    expect(run.oracle).toEqual({ correct: false, falseSuccess: false, failures: ['incremental-not-completed'] });
  });

  it('FR06-01 stops after an unavailable GET without PUT or a fabricated suffix charge', async () => {
    const { run, starts, stop, requests } = await memoryIncremental({ draftReadUnavailable: true });
    expect(requests.map((request) => request.method)).toEqual(['GET']);
    expect(starts).toBe(1); expect(stop.state().sessions).toBe(1);
    expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false });
    expect(run.usage).toMatchObject({ modelProposals: 10, inputTokens: 100, outputTokens: 20 });
    expect(run.oracle?.correct).toBe(false);
  });

  it('FR06-01 scans a valid current-draft response canary before any suffix and redacts the run record', async () => {
    const { run, starts, stop, requests } = await memoryIncremental({ draftRead: { id: 'memory', sourceRevision: 7, configurationRevision: 11, diagnostics: 'unit-canary-secret' } });
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PUT']);
    expect(starts).toBe(1); expect(stop.state()).toMatchObject({ sessions: 1, stopped: 'STOPPED_HARD_GATE' });
    expect(run.secretOrPiiLeak).toBeGreaterThan(0);
    expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false });
    expect(JSON.stringify(run)).not.toContain('unit-canary-secret');
  });

  it.each([{ phase: 'GET', puts: 0 }, { phase: 'PUT', puts: 1 }])(
    'FR06-01 captures malformed-revision plus canary $phase JSON before rejecting it and preserves the attempted write fact', async ({ phase, puts }) => {
      const malformed = { id: 'memory', sourceRevision: 'not-a-numeric-revision', configurationRevision: 11, diagnostics: 'unit-canary-secret' };
      const { run, starts, stop, requests } = await memoryIncremental(phase === 'GET' ? { draftRead: malformed } : { draftUpdate: malformed });
      expect(requests.filter((request) => request.method === 'GET')).toHaveLength(1);
      expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(puts);
      expect(starts).toBe(1); expect(stop.state()).toMatchObject({ sessions: 1, stopped: 'STOPPED_HARD_GATE' });
      expect(run.learnSessions).toHaveLength(1);
      expect(run.secretOrPiiLeak).toBeGreaterThan(0);
      expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false });
      expect(run.oracle).toMatchObject({ correct: false });
      expect(run.usage).toMatchObject({ modelProposals: 10, inputTokens: 100, outputTokens: 20 });
      expect(JSON.stringify(run)).not.toContain('unit-canary-secret');
    },
  );

  it('FR06-01 treats an unsafe successful PUT response as an attempted write with no suffix or retry', async () => {
    const { run, starts, stop, requests } = await memoryIncremental({ draftUpdate: { id: 'memory', sourceRevision: Number.MAX_SAFE_INTEGER + 1, configurationRevision: 19 } });
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PUT']);
    expect(starts).toBe(1); expect(stop.state().sessions).toBe(1);
    expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false });
    expect(run.oracle).toMatchObject({ correct: false, falseSuccess: false });
  });
});


interface WireOptions {
  failureAt?: 'get' | 'put' | 'start'; failStartNumber?: 1 | 2; response?: (owner: number) => Response | Promise<Response>;
  resultCode?: string;
  echo?: () => string; terminal?: 'SUCCEEDED' | 'FAILED'; onFinalize?: () => void;
}

/** Actual shared public-client identity; every transport request is handled in memory. */
function wireHarness(options: WireOptions = {}) {
  const requests: { method: string; path: string }[] = [];
  const states = new Map<number, { starts: number; finalized: Set<string>; events: JsonObject[] }>();
  const state = (owner: number) => {
    let value = states.get(owner);
    if (value === undefined) { value = { starts: 0, finalized: new Set(), events: [] }; states.set(owner, value); }
    return value;
  };
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  const client = createPublicApiClient({
    baseUrl: 'http://127.0.0.1/api/v1/studio', token: 'unit-wire-token', csiId: '60406', environmentId: 'dev',
    transport: async (url, init) => {
      const method = init.method ?? 'GET'; const path = url.pathname.replace('/api/v1/studio', '');
      requests.push({ method, path });
      const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      const fields: JsonObject = body !== null && typeof body === 'object' ? Object.fromEntries(Object.entries(body)) : {};
      if (path === '/tests' && method === 'POST') {
        const owner = Number(/r([123])$/u.exec(String(fields.name))?.[1] ?? '1');
        state(owner); return json({ id: `wire-${String(owner)}`, sourceRevision: 1, configurationRevision: 1 });
      }
      if (path === '/guided-sessions' && method === 'POST') {
        const owner = Number(String(fields.testId).split('-')[1]); const current = state(owner); current.starts += 1;
        current.events.push({ type: 'receipt.post', body: current.starts === 1 ? 'base-reference-value' : 'fresh-current-session-reference' });
        if (options.failureAt === 'start' && current.starts === (options.failStartNumber ?? 1)) return await options.response?.(owner) ?? json(null);
        return json({ session: { sessionId: `ws-${String(owner)}-${String(current.starts)}`, state: 'PREPARING' } });
      }
      const draft = /^\/tests\/wire-(\d)$/u.exec(path);
      if (draft) {
        const owner = Number(draft[1]);
        if (method === 'GET') return options.failureAt === 'get' ? await options.response?.(owner) ?? json(null) : json({ id: `wire-${String(owner)}`, sourceRevision: 7, configurationRevision: 11 });
        if (method === 'PUT') return options.failureAt === 'put' ? await options.response?.(owner) ?? json(null) : json({ id: `wire-${String(owner)}`, sourceRevision: 17, configurationRevision: 19 });
      }
      const guided = /^\/guided-sessions\/(ws-(\d)-(\d))(?:\/(result|finalize))?$/u.exec(path);
      if (guided) {
        const id = guided[1] ?? ''; const owner = Number(guided[2]); const number = Number(guided[3]); const current = state(owner);
        if (guided[4] === 'finalize') { current.finalized.add(id); options.onFinalize?.(); return json({}); }
        if (guided[4] === 'result') return json({ publication: { status: current.finalized.has(id) ? 'PUBLISHED' : 'PENDING', receipt: current.finalized.has(id) ? { revisionId: 'wire-revision' } : null },
          failure: options.resultCode === undefined ? null : { code: options.resultCode }, explanation: { steps: Array.from({ length: 10 }, (_v, i) => ({ number: i + 1, learnedFromThisRun: i >= 3, reusedFrom: i < 3 ? { revisionId: 'wire-revision', stepId: String(i) } : null })) } });
        return json({ session: { sessionId: id, state: options.terminal ?? 'SUCCEEDED', counters: { modelProposals: number === 1 ? 10 : 3, modelInputTokens: number === 1 ? 100 : 40, modelOutputTokens: number === 1 ? 20 : 5 } }, ...(options.echo ? { diagnostics: options.echo() } : {}) });
      }
      throw new Error('Unexpected in-memory wire route');
    },
  });
  const run = async (owner = 1, canaries: string[] = ['unit-wire-canary'], extraTexts: (() => Promise<Record<string, string>>) | null = null) => {
    const entry = entryOf(manifest, 'incremental-edit-step-4'); const current = state(owner);
    const stop = createStopRule({ allocationUsd: 1_000_000_000, price: { pInPerMTok: 1_000_000, pOutPerMTok: 0 }, reservedCeiling: { input: 1000, output: 1000 } });
    const record = await driveIncremental({ manifest, entry, expected: expectedOf(entry), caseFile: readJson(entry.stepText?.path ?? '') as JsonObject,
      client, rep: owner, receipts: { mark: () => current.events.length, since: (cursor) => ({ actions: current.events.slice(cursor), views: [] }) },
      switchSourceValue: () => undefined, vars: {}, mode: 'HARNESS_SELF_TEST', stopRule: stop, ...FAST, secretCanaries: canaries, extraTexts });
    return { run: record, stop, starts: current.starts };
  };
  return { client, requests, run };
}

function deferred<T>() {
  let release: (value: T) => void = () => { throw new Error('Unit gate not initialized'); };
  const promise = new Promise<T>((resolve) => { release = resolve; });
  return { promise, release };
}

function allLocalUnitManifest() {
  const local = structuredClone(manifest); local.cases = local.cases.filter((entry) => entry.status === 'READY_LOCAL');
  local.gate = { ...local.gate, ...gateArithmetic(local.cases.filter((entry) => entry.class === 'P').length, 3, local.gate.completionThresholdPct) };
  local.sessionPlan = sessionPlan(local); local.manifestSha256 = manifestDigest(local);
  return local;
}

describe('WIRE-OBS18: consumed response coverage without raw retention', () => {
  it.each([
    { label: 'HTTP non2xx JSON', response: () => new Response(JSON.stringify({ code: 'STALE_REVISION', diagnostics: 'unit-wire-canary' }), { status: 409 }) },
    { label: 'malformed JSON', response: () => new Response('{invalid unit-wire-canary') },
    { label: 'over-bound tail', response: () => new Response('x'.repeat(2_000_001) + 'unit-wire-canary') },
  ])('WIRE-OBS18 inspects $label before rejection without suffix or a second base charge', async ({ response }) => {
    const api = wireHarness({ failureAt: 'get', response }); const { run, stop, starts } = await api.run();
    expect(run.secretOrPiiLeak).toBeGreaterThan(0);
    expect(run.details?.canaryObservation?.[0]).toMatchObject({ publicHttp: 'COMPLETE', inspectionConfiguration: 'COMPLETE' });
    expect(run.details?.canaryFindings).toContainEqual(expect.objectContaining({ label: 'publicHttp' }));
    expect(starts).toBe(1); expect(stop.state()).toMatchObject({ sessions: 1, stopped: 'STOPPED_HARD_GATE' });
    expect(api.requests.filter((r) => r.method === 'GET' && r.path === '/tests/wire-1')).toHaveLength(1);
    expect(api.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
    expect(run.incremental).toMatchObject({ logicalStatus: 'INCOMPLETE', suffixStarted: false });
    expect(run.usage).toMatchObject({ modelProposals: 10, inputTokens: 100, outputTokens: 20 });
    expect(JSON.stringify(run)).not.toContain('unit-wire-canary');
  });

  it('WIRE-OBS18 keeps the exact UTF16 size boundary and successful current-draft flow', async () => {
    const seed = JSON.stringify({ id: 'wire-1', sourceRevision: 7, configurationRevision: 11, padding: '' });
    const text = seed.replace('"padding":""', `"padding":"${'x'.repeat(2_000_000 - seed.length)}"`);
    expect(text.length).toBe(2_000_000);
    const api = wireHarness({ failureAt: 'get', response: () => new Response(text) }); const { run, starts, stop } = await api.run();
    expect(starts).toBe(2); expect(stop.state().sessions).toBe(2); expect(run.oracle?.correct).toBe(true);
    expect(run.details?.canaryObservation?.[0]).toMatchObject({ publicHttp: 'COMPLETE', inspectionConfiguration: 'COMPLETE' });
  });

  it.each([
    { body: JSON.stringify({ code: { detail: 'unit-wire-canary' }, error: 'unit-wire-canary' }), message: 'Studio API refused the request', status: 400 },
    { body: '{invalid unit-wire-canary', message: 'Studio API returned invalid JSON', status: 200 },
  ])('WIRE-OBS18 standalone errors keep only fixed diagnostics for $status', async ({ body, message, status }) => {
    const api = wireHarness({ failureAt: 'get', response: () => new Response(body, { status }) });
    try { await api.client.readDraft('wire-1'); throw new Error('Expected unit refusal'); }
    catch (failure) {
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) throw new Error('Expected fixed error');
      expect(failure.message).toBe(message); expect(failure.stack).not.toContain('unit-wire-canary');
      expect(JSON.stringify(failure)).not.toContain('unit-wire-canary'); expect(Object.hasOwn(failure, 'cause')).toBe(false);
    }
  });

  it('WIRE-OBS18 never serializes an unknown successful failure-code value', async () => {
    const api = wireHarness({ terminal: 'FAILED', resultCode: 'unit-wire-canary' }); const { run } = await api.run();
    expect(run.secretOrPiiLeak).toBeGreaterThan(0); expect(run.session?.failureCode).toBeNull();
    expect(JSON.stringify(run)).not.toContain('unit-wire-canary');
  });

  it('WIRE-OBS18 body-read failure stays unknown and sanitizes its error', async () => {
    const api = wireHarness({ failureAt: 'get', response: () => { const response = new Response('unused'); response.text = () => Promise.reject(new Error('unit-wire-canary')); return response; } });
    const { run, starts, stop } = await api.run();
    expect(starts).toBe(1); expect(stop.state().sessions).toBe(1);
    expect(run.details?.canaryObservation?.[0]).toMatchObject({ publicHttp: 'UNAVAILABLE' });
    const report = buildBenchmark({ manifest, runs: [run], mode: 'HARNESS_SELF_TEST' });
    expect(report.canaryObservation).toMatchObject({ complete: false, totalLeakRuns: null, globalWireComplete: null });
    expect(JSON.stringify(run)).not.toContain('unit-wire-canary');
  });

  it('WIRE-OBS18 interruption collects the configured text hook once for the new failed stage', async () => {
    let failed = false; let collections = 0;
    const api = wireHarness({ failureAt: 'get', response: () => { failed = true; return new Response('{}', { status: 409 }); } });
    const { run, stop } = await api.run(1, ['unit-wire-canary'], () => { collections += 1; return Promise.resolve(failed ? { backendLog: 'unit-wire-canary' } : {}); });
    expect(collections).toBe(3); expect(stop.state().sessions).toBe(1);
    expect(run.secretOrPiiLeak).toBeGreaterThan(0); expect(run.details?.canaryFindings).toContainEqual(expect.objectContaining({ label: 'backendLog' }));
    expect(JSON.stringify(run)).not.toContain('unit-wire-canary');
  });

  it('WIRE-OBS18 collector failure keeps prior hits, unknown scope and one existing charge without retry', async () => {
    let collections = 0; const api = wireHarness();
    const { run, stop, starts } = await api.run(1, ['unit-wire-canary'], () => { collections += 1; if (collections > 1) return Promise.reject(new Error('unit-wire-canary')); return Promise.resolve({ backendLog: 'unit-wire-canary' }); });
    expect(collections).toBe(2); expect(starts).toBe(1); expect(stop.state().sessions).toBe(1);
    expect(run.secretOrPiiLeak).toBeGreaterThan(0); expect(run.details?.canaryObservation?.[0]).toMatchObject({ extraTexts: 'UNAVAILABLE' });
    expect(buildBenchmark({ manifest, runs: [run], mode: 'HARNESS_SELF_TEST' }).canaryObservation?.totalLeakRuns).toBeNull();
    expect(JSON.stringify(run)).not.toContain('unit-wire-canary');
  });

  it('WIRE-OBS18 scans valid supplied strings even when another field is invalid', async () => {
    let collections = 0; const api = wireHarness();
    const { run, stop } = await api.run(1, ['unit-wire-canary'], () => {
      collections += 1; const texts: Record<string, string> = { backendLog: 'unit-wire-canary' };
      Object.defineProperty(texts, 'invalid', { enumerable: true, value: 42 }); return Promise.resolve(texts);
    });
    expect(collections).toBe(1); expect(stop.state().sessions).toBe(1); expect(run.secretOrPiiLeak).toBeGreaterThan(0);
    expect(run.details?.canaryObservation?.[0]).toMatchObject({ extraTexts: 'UNAVAILABLE' });
    expect(JSON.stringify(run)).not.toContain('unit-wire-canary');
  });

  it.each([1, 2] as const)('WIRE-OBS18 charges unacknowledged start $0 before latching the hard stop', async (start) => {
    const api = wireHarness({ failureAt: 'start', failStartNumber: start, response: () => new Response('{unit-wire-canary') }); const { run, stop } = await api.run();
    expect(stop.state()).toMatchObject({ sessions: start, stopped: 'STOPPED_HARD_GATE' });
    expect(run.learnSessions).toHaveLength(start - 1); expect(run.learnSessionsComplete).toBe(false);
    expect(run.usage).toMatchObject({ modelProposals: null, inputTokens: null, outputTokens: null });
    if (start === 2) expect(run.incremental?.suffixStarted).toBeUndefined(); else expect(run.incremental?.suffixStarted).toBe(false);
    expect(run.details?.unresolvedSessionCharges).toHaveLength(1); expect(run.secretOrPiiLeak).toBeGreaterThan(0);
    expect(JSON.stringify(run)).not.toContain('unit-wire-canary');
  });

  it('WIRE-OBS18 isolates interleaved drivers sharing one actual public client through cleanup', async () => {
    const enteredA = deferred<undefined>(); const enteredB = deferred<undefined>(); const releaseA = deferred<undefined>(); const releaseB = deferred<undefined>();
    const api = wireHarness({ failureAt: 'get', response: async (owner) => {
      if (owner === 1) { enteredA.release(undefined); await releaseA.promise; return new Response(JSON.stringify({ diagnostic: 'owned-A-canary' }), { status: 409 }); }
      enteredB.release(undefined); await releaseB.promise; return new Response(JSON.stringify({ diagnostic: 'owned-A-canary owned-B-canary' }), { status: 409 });
    } });
    const a = api.run(1, ['owned-A-canary']); const b = api.run(2, ['owned-B-canary']);
    await Promise.all([enteredA.promise, enteredB.promise]); releaseA.release(undefined); const first = await a;
    releaseB.release(undefined); const second = await b;
    expect(first.run.details?.canaryFindings).toContainEqual(expect.objectContaining({ label: 'publicHttp', canarySha256Prefix: sha256Hex('owned-A-canary').slice(0, 12) }));
    expect(second.run.details?.canaryFindings).toContainEqual(expect.objectContaining({ label: 'publicHttp', canarySha256Prefix: sha256Hex('owned-B-canary').slice(0, 12) }));
    expect(second.run.details?.canaryFindings?.some((finding) => finding.canarySha256Prefix === sha256Hex('owned-A-canary').slice(0, 12))).toBe(false);
    expect(JSON.stringify([first.run, second.run])).not.toContain('owned-A-canary'); expect(JSON.stringify([first.run, second.run])).not.toContain('owned-B-canary');
  });

  it('WIRE-OBS18 preserves a mutable generated-client override instead of silently rebinding it away', async () => {
    const api = wireHarness(); let overrides = 0;
    api.client.readDraft = () => { overrides += 1; return Promise.resolve({ id: 'wrong', sourceRevision: 7, configurationRevision: 11 }); };
    const { run, starts } = await api.run(); expect(overrides).toBe(1); expect(starts).toBe(1);
    expect(api.requests.some((request) => request.method === 'GET' && request.path.startsWith('/tests/'))).toBe(false);
    expect(run.details?.canaryObservation?.[0]).toMatchObject({ publicHttp: 'UNOBSERVABLE' });
  });

  it('WIRE-OBS18 preserves an override installed while an observed run is awaiting publication', async () => {
    let change: () => void = () => undefined; let overrides = 0;
    const api = wireHarness({ onFinalize: () => { change(); } });
    change = () => { api.client.readDraft = () => { overrides += 1; return Promise.resolve({ id: 'wrong', sourceRevision: 7, configurationRevision: 11 }); }; };
    const { run } = await api.run(); expect(overrides).toBe(1);
    expect(api.requests.some((request) => request.method === 'GET' && request.path.startsWith('/tests/'))).toBe(false);
    expect(run.details?.canaryObservation?.[0]).toMatchObject({ publicHttp: 'UNOBSERVABLE' });
  });

  it.each([{ label: 'empty', values: [] }, { label: 'empty string', values: [''] }, { label: 'uninspectable', values: ['\ud800'] }])(
    'WIRE-OBS18 marks $label inspection unavailable without a known absence claim', async ({ values }) => {
      const api = wireHarness({ failureAt: 'get', response: () => new Response('{}', { status: 409 }) }); const { run } = await api.run(1, values);
      expect(run.details?.canaryObservation?.[0]).toMatchObject({ inspectionConfiguration: 'UNAVAILABLE' });
      expect(buildBenchmark({ manifest, runs: [run], mode: 'HARNESS_SELF_TEST' }).canaryObservation?.totalLeakRuns).toBeNull();
    },
  );

  it('WIRE-OBS18 keeps known valid hits when another operator entry is invalid', async () => {
    const values = ['unit-wire-canary', 'invalid']; Object.defineProperty(values, '1', { value: 42 });
    const api = wireHarness({ failureAt: 'get', response: () => new Response(JSON.stringify({ diagnostic: 'unit-wire-canary' }), { status: 409 }) }); const { run } = await api.run(1, values);
    expect(run.secretOrPiiLeak).toBeGreaterThan(0); expect(run.details?.canaryObservation?.[0]).toMatchObject({ inspectionConfiguration: 'UNAVAILABLE' });
    expect(JSON.stringify(run)).not.toContain('unit-wire-canary');
  });

  it.each(['missing row', 'unavailable body', 'unavailable configuration', 'earlier excluded attempt'])(
    'WIRE-OBS18 prevents an otherwise passing full population from laundering $0', (variant) => {
      const local = allLocalUnitManifest(); expect(validateCorpusManifest(local, { repoRoot: repoRootFrom() }).errors).toEqual([]);
      const clean = syntheticRuns(local, { mode: 'D_C' });
      const score = (runs: RunRecord[]) => buildBenchmark({ manifest: local, runs, mode: 'D_C', reviewInput: reviewedInput(local, runs) });
      expect(score(clean).gate.verdict).toBe('GATE_PASS');
      const runs = structuredClone(clean); const target = must(runs[0]);
      if (variant === 'missing row') delete target.details?.canaryObservation;
      else if (variant === 'earlier excluded attempt') {
        const prior = structuredClone(target); prior.infrastructureFailure = 'HOST_PORT_COLLISION'; must(prior.details?.canaryObservation?.[0]).publicHttp = 'UNAVAILABLE';
        target.attempt = 2; runs.unshift(prior);
      } else must(target.details?.canaryObservation?.[0])[variant === 'unavailable body' ? 'publicHttp' : 'inspectionConfiguration'] = 'UNAVAILABLE';
      const reported = score(runs); expect(reported.gate.classP.completions).toBeGreaterThanOrEqual(reported.gate.classP.runnableArithmetic.minCompletions);
      expect(reported.gate.verdict).not.toBe('GATE_PASS'); expect(reported.canaryObservation).toMatchObject({ complete: false, totalLeakRuns: null, globalWireComplete: null });
      expect(reported.denominatorLedger.problems).toContainEqual(expect.objectContaining({ code: 'RUN_CANARY_OBSERVATION_UNAVAILABLE' }));
    },
  );

  it.each(['default-generated', 'replacement-list', 'selected-password', 'invalid-operator', 'scalar-operator'])(
    'WIRE-OBS18 binds the actual secret-login password in the real loop with $0 and closes fake hosts', async (variant) => {
      let currentPassword = ''; let fixtureCloses = 0; let pageCloses = 0; const passwords: string[] = [];
      const scalarOperator = 'scalar-operator-unit-canary';
      const api = wireHarness({ terminal: 'FAILED', echo: () => `${currentPassword} ${variant === 'selected-password' ? '' : passwords.at(-2) ?? ''} ${variant === 'scalar-operator' ? scalarOperator : ''}` });
      const hosts: NonNullable<Parameters<typeof runBenchmark>[0]['selfTestHosts']> = {
        startCorpusPages: () => Promise.resolve({ pagesVersion: 'unit', origin: 'http://127.0.0.1:1', fixtureOrigin: () => 'http://127.0.0.1:1', pageKeys: () => [], receipts: () => [], reset: () => undefined, close: () => { pageCloses += 1; return Promise.resolve(); } }),
        hostExistingFixture: (kind, options) => {
          if (kind !== 'secret-login' || typeof options?.password !== 'string') throw new Error('Unexpected unit fixture');
          currentPassword = options.password; passwords.push(currentPassword);
          return Promise.resolve({ origin: 'http://127.0.0.1:1', receipts: { mark: () => 0, since: () => ({ actions: [], views: [] }) }, close: () => { fixtureCloses += 1; return Promise.resolve(); } });
        },
      };
      const operators = ['operator-only']; if (variant === 'invalid-operator') Object.defineProperty(operators, '0', { value: 42 });
      const planted = { d1: 'selected-unit-password' }; const prior = structuredClone(planted);
      const driveOptions = { ...FAST, ...(variant === 'default-generated' ? {} : { secretCanaries: operators }) };
      // Deliberately invalid runtime input while retaining the declared public option type.
      if (variant === 'scalar-operator') Object.defineProperty(driveOptions, 'secretCanaries', { value: scalarOperator });
      const { runs, benchmark } = await runBenchmark({ manifest, mode: 'HARNESS_SELF_TEST', client: api.client, select: ['D1-login-secret-fixture'], selfTestHosts: hosts,
        ...(variant === 'selected-password' ? { plantedSecrets: planted } : {}), driveOptions });
      expect(runs.length).toBeGreaterThan(0); expect(passwords).toHaveLength(runs.length); expect(fixtureCloses).toBe(runs.length); expect(pageCloses).toBe(1);
      expect(runs.every((run) => (run.secretOrPiiLeak ?? 0) > 0)).toBe(true); expect(runs.every((run) => run.learnSessions?.length === 1)).toBe(true);
      for (const password of passwords) expect(JSON.stringify({ runs, benchmark })).not.toContain(password);
      if (variant !== 'selected-password') for (const [index, run] of runs.entries()) {
        for (const earlier of passwords.slice(0, index)) expect(run.details?.canaryFindings?.some((finding) => finding.canarySha256Prefix === sha256Hex(earlier).slice(0, 12))).toBe(false);
      }
      if (variant !== 'selected-password') expect(new Set(passwords).size).toBe(passwords.length); else expect(passwords.every((password) => password === planted.d1)).toBe(true);
      expect(planted).toEqual(prior); expect(benchmark.gate.verdict).toBe('NOT_EVIDENCE'); expect(benchmark.modelCalls.total).toBeNull();
      if (variant === 'invalid-operator' || variant === 'scalar-operator') {
        expect(runs[0]?.details?.canaryObservation?.[0]).toMatchObject({ inspectionConfiguration: 'UNAVAILABLE' });
        expect(benchmark.canaryObservation).toMatchObject({ complete: false, totalLeakRuns: null, globalWireComplete: null });
        expect(benchmark.gate.verdict).not.toBe('GATE_PASS');
      }
      if (variant === 'scalar-operator') {
        expect(runs[0]?.details?.canaryFindings).toContainEqual(expect.objectContaining({ canarySha256Prefix: sha256Hex(must(passwords[0])).slice(0, 12) }));
        expect(runs[0]?.details?.canaryFindings).toContainEqual(expect.objectContaining({ canarySha256Prefix: sha256Hex(scalarOperator).slice(0, 12) }));
        expect(JSON.stringify({ runs, benchmark })).not.toContain(scalarOperator);
      }
    },
  );

  it('WIRE-OBS18 refuses self-test host overrides in D_C before ledger, host or API work', async () => {
    let hosts = 0; const api = wireHarness();
    await expect(runBenchmark({ manifest, mode: 'D_C', client: api.client, selfTestHosts: { startCorpusPages: () => { hosts += 1; return Promise.reject(new Error('Unexpected host')); } } })).rejects.toMatchObject({ code: 'SELF_TEST_HOSTS_FORBIDDEN' });
    expect(hosts).toBe(0); expect(api.requests).toHaveLength(0);
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
