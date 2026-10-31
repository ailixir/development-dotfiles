/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access -- fakes: every real browser method is async; the contract fixtures are read by path. */
/**
 * SC008-E6 AC3: the guided runtime for frozen step code. prepare admits the code and runs it up to its first effectful call; dispatch runs the
 * step and answers with a receipt and the ledger outcome derived from it. The browser is a scripted fake (unit tier, no browser); the context and
 * the bridge documents come from the contract fixtures, with their clock moved to now.
 */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { GuidedRuntime, ledgerOutcomeOf, StepRefusal } from '../../src/guided/runtime.js';
import { hash, identity } from '../../src/guided/contracts.js';
import type { Action, BridgeDispatch, BridgeObservation, BridgeOrdinaryOutcome, ExecutionEvidence, Observation, RunnerContext } from '../../src/guided/types.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';
import { FakeLocator, fakeHandle, must, newRig, operation } from '../helpers/stepFakes.js';
import type { Rig } from '../helpers/stepFakes.js';
import { readFileSync } from 'node:fs';

const documents = (JSON.parse(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json', import.meta.url), 'utf8')) as { documents: Record<string, any> }).documents; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T>(value: T): T => structuredClone(value);
const STEP = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'] as const;
const ORIGIN = 'https://orders.example.test';

interface Harness {
  readonly runtime: GuidedRuntime;
  readonly context: RunnerContext;
  readonly rig: Rig;
  readonly messages: { route: string; body: unknown }[];
  readonly journal: string;
  evidence: ExecutionEvidence;
  observed: number;
}
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function harness(rigOverride?: (rig: Rig) => void, withSecret = false, beforeSecretFill?: (value: string) => void): Promise<Harness> {
  const context = clone(documents.context) as RunnerContext & { expiresAt: string; leaseExpiresAt: string };
  if (withSecret) {
    (context.authoredInputs.inputs as unknown[]).push(clone(documents.secretInputs.inputs[0]));
    (context.authoredInputs.inputs.at(-1) as { sourceStepId: string }).sourceStepId = STEP[1];
    (context.authoredInputs.inputs.at(-1) as { provenance: { stepId: string } }).provenance.stepId = STEP[1];
    (context as { authoredInputsHash: string }).authoredInputsHash = hash(context.authoredInputs);
  }
  context.expiresAt = new Date(Date.now() + 120_000).toISOString();
  context.leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
  const rig = newRig('about:blank');
  rigOverride?.(rig);
  const messages: { route: string; body: unknown }[] = [];
  const journal = await mkdtemp(join(tmpdir(), 'step-runtime-'));
  directories.push(journal);
  let generation = 0;
  const h = { observed: 0 } as { observed: number };
  (rig.session as { observe: unknown }).observe = async () => {
    generation += 1; h.observed += 1;
    const observation = { ...clone(documents.observation.observation), generation, documentId: 'document-1' } as Observation;
    return { observation, json: JSON.stringify(observation), bytes: 100, observationHash: hash(observation) };
  };
  const bootstrap: GuidedBrowser = {
    evidence: clone(documents.bootstrap.executionEvidence) as ExecutionEvidence, observations: rig.session, blankMatches: async () => true,
    close: async () => undefined, terminate: async () => undefined, orderlyClosed: () => true, handle: fakeHandle(rig),
  };
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, allowedDomains: ['*'], ...(beforeSecretFill === undefined ? {} : { beforeSecretFill }), journalDirectory: journal, launch: async () => bootstrap, callback: async (route, body) => { messages.push({ route, body }); } });
  await runtime.start();
  const state: Harness = { runtime, context, rig, messages, journal, evidence: bootstrap.evidence, get observed() { return h.observed; } } as Harness;
  return state;
}

/** The evidence the runtime holds after its last observation callback. */
function lastEvidence(h: Harness): ExecutionEvidence {
  const sent = h.messages.filter(m => m.route === 'observations').at(-1)?.body as BridgeObservation | undefined;
  if (!sent) return h.evidence;
  const o = sent.observation;
  return { kind: 'observedDocument', sessionId: h.context.sessionId, contextId: h.context.contextId, documentId: o.documentId, generation: o.generation, origin: o.origin, observationHash: hash(o) };
}

function action(h: Harness, stepIndex: number, code: string, parts: { captures?: string[]; uses?: Action['operation']['uses'][number][] } = {}): Action {
  const evidence = lastEvidence(h);
  return { schemaVersion: 3, sessionId: h.context.sessionId, coordinate: { stepId: STEP[stepIndex] as string, ordinal: 0 }, scopeHash: h.context.scopeHash, generation: evidence.generation, operation: operation(code, parts), executionEvidence: evidence, evidenceHash: hash(evidence), authoredInputsHash: h.context.authoredInputsHash, contextRevision: h.context.contextRevision };
}
function prepareRequest(h: Harness, proposal: Action): unknown {
  return { ...identity(h.context), proposal, requestDigest: hash(proposal), expiresAt: new Date(Date.now() + 20_000).toISOString() };
}
function dispatchRequest(h: Harness, proposal: Action, preparationId: string, consumerEdges: BridgeDispatch['consumerEdges'] = []): BridgeDispatch {
  const admissionId = `admission-${Math.random().toString(16).slice(2)}`;
  const e = proposal.executionEvidence;
  return { ...identity(h.context), proposal, preparationId, consumerEdges, secrets: [], ledger: {
    schemaVersion: 3, sessionId: h.context.sessionId, coordinate: proposal.coordinate, idempotencyKey: `key-${admissionId}`, requestDigest: hash(proposal), scopeHash: h.context.scopeHash,
    operationHash: hash({ coordinate: proposal.coordinate, origin: e.origin, operation: proposal.operation }), generation: e.generation, documentId: e.documentId, ownerFence: h.context.ownerFence,
    admission: { admissionId, authorizationId: 'authorization-1', admittedAt: new Date().toISOString(), policyDecisionHash: 'b'.repeat(64) }, state: 'DISPATCHING', dispatchCount: 1, outcomeCode: 'PENDING',
    executionEvidence: e, evidenceHash: proposal.evidenceHash, authoredInputsHash: proposal.authoredInputsHash, contextRevision: proposal.contextRevision, preparationId, attemptOrdinal: 0 } } as unknown as BridgeDispatch;
}
async function admit(h: Harness, proposal: Action): Promise<string> {
  const prepared = await h.runtime.prepare(prepareRequest(h, proposal));
  return prepared.preparationId;
}
const GOTO = 'await page.goto(inputs["input-destination"]);';

describe('prepare: admit the code, run it to the fence', () => {
  it('admits a step, runs it to its first effectful call with no effect, and leaves the journal without a fence', async () => {
    const h = await harness();
    const preparationId = await admit(h, action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] }));
    expect(preparationId).toBeTruthy();
    expect(h.rig.w.effects).toEqual([]);
    expect(h.rig.session.calls).not.toContain('invalidate');
    expect(await readFile(join(h.journal, `${hash(h.context.sessionId)}.journal`), 'utf8').catch(() => '')).not.toContain('INVOKING');
  });

  it('refuses a step whose code no longer matches its hash, and one that does not parse (with the model line and column), before any browser call', async () => {
    const h = await harness();
    const tampered = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    (tampered.operation as { code: string }).code += ' ';
    await expect(h.runtime.prepare(prepareRequest(h, tampered))).rejects.toMatchObject({ message: 'SOURCE_HASH_MISMATCH' });
    const broken = action(h, 0, 'await page.goto(;', { uses: [{ kind: 'input', id: 'input-destination' }] });
    const failure = await h.runtime.prepare(prepareRequest(h, broken)).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(StepRefusal);
    expect(failure).toMatchObject({ message: 'STEP_SYNTAX', line: expect.any(Number) as unknown, column: expect.any(Number) as unknown });
    expect(h.rig.w.log).toEqual([]);
    expect(h.rig.w.effects).toEqual([]);
  });

  it('refuses a locator with no match before its first effectful call as STEP_PRE_FENCE with the match count and no effect, and accepts the repaired step', async () => {
    const h = await harness();
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    const prepared = await admit(h, first);
    const outcome = await h.runtime.dispatch(dispatchRequest(h, first, prepared));
    expect(outcome.receipt).toMatchObject({ closedCode: null, fenceCrossed: true });
    h.rig.w.matches['#gone'] = 0;
    const failure = await h.runtime.prepare(prepareRequest(h, action(h, 1, "await page.locator('#gone').click();"))).then(() => null, (error: unknown) => error);
    expect(failure).toMatchObject({ message: 'STEP_PRE_FENCE', matchCount: 0, line: null, column: null });
    expect(h.rig.w.effects).toEqual(['goto']);
    h.rig.w.matches['#gone'] = 1;
    await expect(h.runtime.prepare(prepareRequest(h, action(h, 1, "await page.locator('#gone').click();")))).resolves.toBeTruthy();
  });

  it('does not refuse a failing expect at prepare: dispatch runs the step again and records it', async () => {
    const h = await harness();
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    await expect(h.runtime.prepare(prepareRequest(h, action(h, 1, "await expect(page.locator('#t')).toHaveText('x');")))).resolves.toBeTruthy();
  });
});

describe('dispatch: run the step, answer with the receipt', () => {
  it('runs the code once and answers SUCCEEDED/OK with the receipt, no secret use, and the observation that follows it', async () => {
    const h = await harness();
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    const outcome: BridgeOrdinaryOutcome = await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    expect(outcome.ledger).toMatchObject({ state: 'SUCCEEDED', outcomeCode: 'OK' });
    expect(outcome.receipt).toEqual({ closedCode: null, stepHash: hashObserved(first.operation), fenceCrossed: true, effects: [{ method: 'goto', completed: true }], effectsTruncated: false, offscreen: false });
    expect(outcome.secretUse).toEqual({});
    expect(h.rig.w.effects).toEqual(['goto']);
    expect(h.messages.filter(m => m.route === 'outcomes')).toHaveLength(1);
    expect(h.messages.filter(m => m.route === 'observations')).toHaveLength(1);
    expect(h.rig.session.calls).toContain('invalidate');
    const journal = await readFile(join(h.journal, `${hash(h.context.sessionId)}.journal`), 'utf8');
    expect(journal.match(/INVOKING/gu)).toHaveLength(1);
  });

  it('a step whose target vanished after prepare is FAILED/TARGET_CHANGED with no effect, and the session ends', async () => {
    const h = await harness();
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const second = action(h, 1, "await page.locator('#vanishing').click();");
    const preparationId = await admit(h, second);
    h.rig.w.matches['#vanishing'] = 0;
    const outcome = await h.runtime.dispatch(dispatchRequest(h, second, preparationId));
    expect(outcome.ledger).toMatchObject({ state: 'FAILED', outcomeCode: 'TARGET_CHANGED' });
    expect(outcome.receipt).toMatchObject({ closedCode: 'TARGET_DRIFT', fenceCrossed: false, effects: [] });
    expect(h.rig.w.effects).toEqual(['goto']);
    expect(h.runtime.accepting).toBe(false);
  });

  it('a failure after the fence is UNKNOWN_OUTCOME/ACK_LOST and keeps the effect', async () => {
    const h = await harness();
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const second = action(h, 1, "await page.locator('#go').click();");
    const preparationId = await admit(h, second);
    h.rig.w.failClick = true;
    const outcome = await h.runtime.dispatch(dispatchRequest(h, second, preparationId));
    expect(outcome.ledger).toMatchObject({ state: 'UNKNOWN_OUTCOME', outcomeCode: 'ACK_LOST' });
    expect(outcome.receipt).toMatchObject({ closedCode: 'OUTCOME_UNKNOWN', fenceCrossed: true, effects: [{ method: 'click', completed: false }] });
    expect(JSON.stringify(h.messages)).not.toContain('CANARY-TEXT');
  });

  it('a failing expect is FAILED/ASSERTION_FAILED', async () => {
    const h = await harness();
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const second = action(h, 1, "await expect(page.locator('#t')).toHaveText('x');");
    const outcome = await h.runtime.dispatch(dispatchRequest(h, second, await admit(h, second)));
    expect(outcome.ledger).toMatchObject({ state: 'FAILED', outcomeCode: 'ASSERTION_FAILED' });
    expect(outcome.receipt.closedCode).toBe('ASSERTION_FAILED');
  });

  it('commits a captured value (masked, reported as available) and hands it to the step that reads it, under its consumer edge', async () => {
    const h = await harness();
    h.rig.w.text['#price'] = 'CAPTURED-PRICE';
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const second = action(h, 1, "vars['binding-reference'] = await page.locator('#price').innerText();", { captures: ['binding-reference'] });
    const read = await h.runtime.dispatch(dispatchRequest(h, second, await admit(h, second)));
    expect(read.ledger.state).toBe('SUCCEEDED');
    expect(read.availability).toHaveLength(1);
    expect(h.rig.session.captures).toEqual(['CAPTURED-PRICE']);
    expect(JSON.stringify(read)).not.toContain('CAPTURED-PRICE');
    // The backend delivers the producer in the next materialization of the context.
    const available = must(read.availability[0]);
    const producer = { bindingId: 'binding-reference', producerAdmissionId: available.producerAdmissionId, coordinate: second.coordinate, origin: ORIGIN, availability: available };
    await h.runtime.update({ ...clone(h.context), materializationRevision: 2, producers: [producer] });
    const third = action(h, 2, "await page.locator('#f').fill(vars['binding-reference']);", { uses: [{ kind: 'binding', id: 'binding-reference' }] });
    const preparationId = await admit(h, third);
    const request = dispatchRequest(h, third, preparationId);
    const edge = { bindingId: 'binding-reference', producerAdmissionId: available.producerAdmissionId, consumerAdmissionId: request.ledger.admission.admissionId, coordinate: third.coordinate, destinationOrigin: ORIGIN, transferPolicy: 'sameOrigin' as const };
    const used = await h.runtime.dispatch({ ...request, consumerEdges: [edge] });
    expect(used.ledger.state).toBe('SUCCEEDED');
    expect(h.rig.w.log).toContain('fill:CAPTURED-PRICE');
  });

  it('refuses a step that reads a binding without its consumer edge, before any browser call', async () => {
    const h = await harness();
    h.rig.w.text['#price'] = 'CAPTURED-PRICE';
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const second = action(h, 1, "vars['binding-reference'] = await page.locator('#price').innerText();", { captures: ['binding-reference'] });
    const read = await h.runtime.dispatch(dispatchRequest(h, second, await admit(h, second)));
    const available = must(read.availability[0]);
    await h.runtime.update({ ...clone(h.context), materializationRevision: 2, producers: [{ bindingId: 'binding-reference', producerAdmissionId: available.producerAdmissionId, coordinate: second.coordinate, origin: ORIGIN, availability: available }] });
    const third = action(h, 2, "await page.locator('#f').fill(vars['binding-reference']);", { uses: [{ kind: 'binding', id: 'binding-reference' }] });
    const preparationId = await admit(h, third);
    const before = h.rig.w.effects.length;
    await expect(h.runtime.dispatch(dispatchRequest(h, third, preparationId))).rejects.toMatchObject({ message: 'BINDING_DENIED' });
    expect(h.rig.w.effects.length).toBe(before);
  });
});

describe('the first observation after bootstrap', () => {
  const refresh = (h: Harness, expectedGeneration: number): unknown => ({ ...identity(h.context), expectedGeneration, focus: { stepText: '', targetIntents: [] } });
  it('observes the blank document bootstrap left (generation 0) and answers with an observation', async () => {
    const h = await harness();
    expect(h.evidence.kind).toBe('initialBlank');
    expect(h.observed).toBe(0);
    const answer = await h.runtime.refreshObservation(refresh(h, 0), 'first-turn');
    expect(answer.observation.generation).toBe(1);
    expect(h.observed).toBe(1);
    expect(h.messages.filter(m => m.route === 'observations')).toHaveLength(1);
    // The evidence is now the observed document: the same generation 0 is stale, generation 1 is current.
    await expect(h.runtime.refreshObservation(refresh(h, 0), 'again')).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
    await expect(h.runtime.refreshObservation(refresh(h, 1), 'second-turn')).resolves.toBeTruthy();
  });
  it('still refuses a generation that is not the one the runner holds, without observing', async () => {
    const h = await harness();
    await expect(h.runtime.refreshObservation(refresh(h, 3), 'stale')).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
    expect(h.observed).toBe(0);
    expect(h.messages.filter(m => m.route === 'observations')).toHaveLength(0);
  });
});

describe('the dispatch window', () => {
  it('ends a step that outlasts the 12 s window: TIMEOUT before its first effectful call, OUTCOME_UNKNOWN after it, and nothing more reaches the page', async () => {
    const before = await harness();
    const after = await harness();
    for (const h of [before, after]) {
      const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
      await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    }
    // The page decides how long the step waits: nothing at prepare, 30 s at dispatch.
    before.rig.w.text['#delay'] = '0';
    const slowRead = action(before, 1, 'await page.waitForTimeout(Number(await page.locator("#delay").innerText())); await page.locator("#late").click();');
    const slowClick = action(after, 1, 'await page.locator("#early").click(); await page.waitForTimeout(30000); await page.locator("#late").click();');
    const [a, b] = await Promise.all([
      admit(before, slowRead).then(id => { before.rig.w.text['#delay'] = '30000'; return before.runtime.dispatch(dispatchRequest(before, slowRead, id)); }),
      admit(after, slowClick).then(id => after.runtime.dispatch(dispatchRequest(after, slowClick, id))),
    ]);
    expect(a.receipt).toMatchObject({ closedCode: 'TIMEOUT', fenceCrossed: false, effects: [] });
    expect(a.ledger).toMatchObject({ state: 'FAILED', outcomeCode: 'TIMEOUT' });
    expect(b.receipt).toMatchObject({ closedCode: 'OUTCOME_UNKNOWN', fenceCrossed: true });
    expect(b.ledger).toMatchObject({ state: 'UNKNOWN_OUTCOME', outcomeCode: 'ACK_LOST' });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(before.rig.w.effects).toEqual(['goto']);
    expect(after.rig.w.effects).toEqual(['goto', 'click']);
  }, 40_000);
});

describe('secrets', () => {
  it('prepare stops at the secret fill without reading a value; dispatch fills through the trusted path, reports the use, and no byte of the value reaches a sink', async () => {
    const h = await harness(rig => { rig.w.matches['input[type="password" i]'] = 1; }, true);
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const login = action(h, 1, "await page.locator('#pw').fill(secrets['PASS']);", { uses: [{ kind: 'secret', id: 'PASS' }] });
    const preparationId = await admit(h, login);
    expect(h.rig.session.calls).not.toContain('preparePassword');
    expect(h.rig.session.calls).not.toContain('fillPassword');
    const request = dispatchRequest(h, login, preparationId);
    const withSecret = { ...request, secrets: [{ secretId: 'PASS', value: 'CANARY-SECRET-VALUE', versionId: 'version-1', allowedOrigins: [ORIGIN] }] };
    const outcome = await h.runtime.dispatch(withSecret);
    expect(withSecret.secrets).toEqual([]); // the request object no longer holds the value once the dispatch is over
    expect(outcome.receipt.closedCode).toBeNull();
    expect(outcome.ledger).toMatchObject({ state: 'SUCCEEDED', outcomeCode: 'OK' });
    expect(outcome.secretUse).toEqual({ PASS: 'USED' });
    expect(outcome.receipt.effects).toEqual([{ method: 'fill', completed: true }]);
    expect(h.rig.session.calls).toEqual(expect.arrayContaining(['preparePassword', 'fillPassword']));
    expect(JSON.stringify(h.messages)).not.toContain('CANARY-SECRET-VALUE');
    expect(await readFile(join(h.journal, `${hash(h.context.sessionId)}.journal`), 'utf8')).not.toContain('CANARY-SECRET-VALUE');
  });

  // The secret hook (E8) is installed on every performStep of the session: dispatch runs it whole, prepare stops at the fence before it reads anything.
  const loginRequest = async (h: Harness): Promise<{ request: BridgeDispatch; secrets: BridgeDispatch['secrets'] }> => {
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const login = action(h, 1, "await page.locator('#pw').fill(secrets['PASS']);", { uses: [{ kind: 'secret', id: 'PASS' }] });
    return { request: dispatchRequest(h, login, await admit(h, login)), secrets: [{ secretId: 'PASS', value: 'CANARY-SECRET-VALUE', versionId: 'version-1', allowedOrigins: [ORIGIN] }] };
  };
  it('a learning dispatch of a secret fill with two password controls is refused by the hook before any write', async () => {
    const h = await harness(undefined, true);
    const proto = FakeLocator.prototype as { and: unknown };
    const original = proto.and;
    // The fake's and() is the receiver itself; here the intersection with the password selector matches two controls.
    proto.and = function and() { return { count: async () => 2 }; };
    try {
    const { request, secrets } = await loginRequest(h);
    const refused = { ...request, secrets };
    const outcome = await h.runtime.dispatch(refused);
    expect(refused.secrets).toEqual([]); // also on a failed dispatch
    expect(outcome.receipt).toMatchObject({ closedCode: 'POLICY_REFUSED', fenceCrossed: false, effects: [] });
    expect(h.rig.session.calls).not.toContain('fillPassword');
    expect(outcome.secretUse).toEqual({ PASS: 'REFUSED' });
    expect(JSON.stringify(h.messages)).not.toContain('CANARY-SECRET-VALUE');
    } finally { proto.and = original; }
  });
  it('a learning dispatch hands the secret its allowed origins and nothing else reaches the trusted write', async () => {
    const h = await harness(rig => { rig.w.matches['input[type="password" i]'] = 1; }, true);
    const seen: unknown[] = [];
    (h.rig.session as { fillPassword: unknown }).fillPassword = async (_t: unknown, origin: unknown, allowed: unknown) => { seen.push(origin, allowed); };
    const { request, secrets } = await loginRequest(h);
    await h.runtime.dispatch({ ...request, secrets });
    expect(seen).toEqual([ORIGIN, [ORIGIN]]);
  });
  it('the released-canary seam is called with the value only at the hook read, and its error keeps the value out of every sink', async () => {
    const calls: string[] = [];
    const h = await harness(rig => { rig.w.matches['input[type="password" i]'] = 1; }, true, value => { calls.push(value); throw new Error('C6_RELEASED ' + value); });
    const { request, secrets } = await loginRequest(h);
    expect(calls).toEqual([]); // prepare stopped at the fence: nothing read the value
    const outcome = await h.runtime.dispatch({ ...request, secrets });
    expect(calls).toEqual(['CANARY-SECRET-VALUE']);
    expect(outcome.receipt.closedCode).not.toBeNull();
    expect(h.rig.session.calls).not.toContain('fillPassword');
    expect(JSON.stringify(outcome)).not.toContain('CANARY-SECRET-VALUE');
    expect(JSON.stringify(h.messages)).not.toContain('CANARY-SECRET-VALUE');
  });

  it('refuses a dispatch whose secrets are not exactly the ones the step reads', async () => {
    const h = await harness(undefined, true);
    const first = action(h, 0, GOTO, { uses: [{ kind: 'input', id: 'input-destination' }] });
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const login = action(h, 1, "await page.locator('#pw').fill(secrets['PASS']);", { uses: [{ kind: 'secret', id: 'PASS' }] });
    const preparationId = await admit(h, login);
    await expect(h.runtime.dispatch(dispatchRequest(h, login, preparationId))).rejects.toMatchObject({ message: 'INPUT_IDENTITY' });
    expect(h.rig.w.effects).toEqual(['goto']);
  });
});

describe('the ledger outcome a receipt derives', () => {
  it.each([
    [null, 'SUCCEEDED', 'OK'], ['ASSERTION_FAILED', 'FAILED', 'ASSERTION_FAILED'], ['TARGET_DRIFT', 'FAILED', 'TARGET_CHANGED'], ['TIMEOUT', 'FAILED', 'TIMEOUT'], ['CANCELLED', 'FAILED', 'CANCELLED'],
    ['OUTCOME_UNKNOWN', 'UNKNOWN_OUTCOME', 'ACK_LOST'], ['POLICY_REFUSED', 'FAILED', 'POLICY_DENIED'], ['READ_REFUSED', 'FAILED', 'POLICY_DENIED'], ['PASSWORD_CONTROL_READ_REFUSED', 'FAILED', 'POLICY_DENIED'],
    ['REFERENCE_REFUSED', 'FAILED', 'POLICY_DENIED'], ['REFERENCE_MISMATCH', 'FAILED', 'POLICY_DENIED'], ['INVALID_CONTRACT', 'FAILED', 'POLICY_DENIED'], ['INTERNAL_ERROR', 'FAILED', 'POLICY_DENIED'],
    ['PROFILE_MISMATCH', 'FAILED', 'POLICY_DENIED'], ['AUTHORIZATION_EXPIRED', 'FAILED', 'POLICY_DENIED'],
  ] as const)('%s is %s/%s', (code, state, outcomeCode) => {
    expect(ledgerOutcomeOf(code)).toEqual({ state, outcomeCode });
  });
});
