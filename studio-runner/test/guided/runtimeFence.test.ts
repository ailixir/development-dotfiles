/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access -- fakes: every real browser method is async; the contract fixtures are read by path. */
/**
 * SC008-E15 (AC7, AC1 mapping): what the server does with the fence and with a lost child, at the runtime level. The browser is the unit tier's
 * in-process stand-in for the child (`inProcessBrowser`); where a case needs the child to die, lie or stall, its `step` is scripted.
 *
 * - the fence handler writes the journal fence first and answers (acks) only after `journal.fence` returned;
 * - a journal that cannot write is a nack: the native call is never made, the fence is never recorded, nothing is retried;
 * - a child lost after the ack leaves a receipt the SERVER builds from its own fence state: OUTCOME_UNKNOWN, fence crossed, no effects;
 * - a child receipt that shows no fence while the server journalled one is discarded: OUTCOME_UNKNOWN;
 * - a dispatch the proxy ended with TIMEOUT is a TIMEOUT receipt before the fence and OUTCOME_UNKNOWN after it.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity } from '../../src/guided/contracts.js';
import type { Action, BridgeDispatch, BridgeObservation, BridgeOrdinaryOutcome, ExecutionEvidence, Observation, RunnerContext } from '../../src/guided/types.js';
import type { GuidedBrowser, GuidedStepHooks, GuidedStepRequest, GuidedStepResult } from '../../src/run/guidedBrowser.js';
import { newTally, receiptFromTally } from '../../src/run/observedReplayAdapter.js';
import { fakeHandle, newRig, operation } from '../helpers/stepFakes.js';
import type { Rig } from '../helpers/stepFakes.js';
import { inProcessBrowser } from '../helpers/guidedStepService.js';

const documents = (JSON.parse(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json', import.meta.url), 'utf8')) as { documents: Record<string, any> }).documents; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T>(value: T): T => structuredClone(value);
const STEP = '00000000-0000-4000-8000-000000000001';
const GOTO = 'await page.goto(inputs["input-destination"]);';
const USES: Action['operation']['uses'][number][] = [{ kind: 'input', id: 'input-destination' }];

/** Scripts the DISPATCH step; a prepare always runs the real step service. */
type Step = (request: GuidedStepRequest, hooks: GuidedStepHooks, real: GuidedBrowser['step']) => Promise<GuidedStepResult>;
interface Harness { readonly runtime: GuidedRuntime; readonly context: RunnerContext; readonly rig: Rig; readonly messages: { route: string; body: unknown }[]; readonly journalFile: string; evidence: ExecutionEvidence }
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function harness(script?: Step): Promise<Harness> {
  const context = clone(documents.context) as RunnerContext & { expiresAt: string; leaseExpiresAt: string };
  context.expiresAt = new Date(Date.now() + 120_000).toISOString();
  context.leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
  const rig = newRig('about:blank');
  const messages: { route: string; body: unknown }[] = [];
  const journal = await mkdtemp(join(tmpdir(), 'runtime-fence-'));
  directories.push(journal);
  let generation = 0;
  (rig.session as { observe: unknown }).observe = async () => {
    generation += 1;
    const observation = { ...clone(documents.observation.observation), generation, documentId: 'document-1' } as Observation;
    return { observation, json: JSON.stringify(observation), bytes: 100, observationHash: hash(observation) };
  };
  const real = inProcessBrowser({
    evidence: clone(documents.bootstrap.executionEvidence) as ExecutionEvidence, observations: rig.session, blankMatches: async () => true,
    close: async () => undefined, terminate: async () => undefined, orderlyClosed: () => true, handle: fakeHandle(rig), allowedDomains: ['*'],
  });
  const browser: GuidedBrowser = script === undefined ? real : { ...real, step: (request, hooks) => request.mode === 'prepare' ? real.step(request, hooks) : script(request, hooks, real.step) };
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, allowedDomains: ['*'], journalDirectory: journal, launch: async () => browser, callback: async (route, body) => { messages.push({ route, body }); } });
  await runtime.start();
  return { runtime, context, rig, messages, journalFile: join(journal, `${hash(context.sessionId)}.journal`), evidence: browser.evidence };
}

function lastEvidence(h: Harness): ExecutionEvidence {
  const sent = h.messages.filter(m => m.route === 'observations').at(-1)?.body as BridgeObservation | undefined;
  if (!sent) return h.evidence;
  const o = sent.observation;
  return { kind: 'observedDocument', sessionId: h.context.sessionId, contextId: h.context.contextId, documentId: o.documentId, generation: o.generation, origin: o.origin, observationHash: hash(o) };
}
function action(h: Harness): Action {
  const evidence = lastEvidence(h);
  return { schemaVersion: 3, sessionId: h.context.sessionId, coordinate: { stepId: STEP, ordinal: 0 }, scopeHash: h.context.scopeHash, generation: evidence.generation, operation: operation(GOTO, { uses: USES }), executionEvidence: evidence, evidenceHash: hash(evidence), authoredInputsHash: h.context.authoredInputsHash, contextRevision: h.context.contextRevision };
}
async function dispatchStep(h: Harness): Promise<BridgeOrdinaryOutcome> {
  const proposal = action(h);
  const prepared = await h.runtime.prepare({ ...identity(h.context), proposal, requestDigest: hash(proposal), expiresAt: new Date(Date.now() + 20_000).toISOString() });
  const e = proposal.executionEvidence;
  const admissionId = `admission-${Math.random().toString(16).slice(2)}`;
  const request = { ...identity(h.context), proposal, preparationId: prepared.preparationId, consumerEdges: [], secrets: [], ledger: {
    schemaVersion: 3, sessionId: h.context.sessionId, coordinate: proposal.coordinate, idempotencyKey: `key-${admissionId}`, requestDigest: hash(proposal), scopeHash: h.context.scopeHash,
    operationHash: hash({ coordinate: proposal.coordinate, origin: e.origin, operation: proposal.operation }), generation: e.generation, documentId: e.documentId, ownerFence: h.context.ownerFence,
    admission: { admissionId, authorizationId: 'authorization-1', admittedAt: new Date().toISOString(), policyDecisionHash: 'b'.repeat(64) }, state: 'DISPATCHING', dispatchCount: 1, outcomeCode: 'PENDING',
    executionEvidence: e, evidenceHash: proposal.evidenceHash, authoredInputsHash: proposal.authoredInputsHash, contextRevision: proposal.contextRevision, preparationId: prepared.preparationId, attemptOrdinal: 0 } } as unknown as BridgeDispatch;
  return h.runtime.dispatch(request);
}
const journalText = (h: Harness): Promise<string> => readFile(h.journalFile, 'utf8').catch(() => '');
const result = (request: GuidedStepRequest, closedCode: GuidedStepResult['receipt']['closedCode']): GuidedStepResult =>
  ({ receipt: receiptFromTally(request.operation, newTally(), closedCode), captured: {}, fenceReached: false, secretUse: {} });

describe('the server side of the fence', () => {
  it('answers the fence only after journal.fence returned: the INVOKING line is on disk when the child is let through', async () => {
    let atAck = '', before = '';
    const h = await harness(async (request, hooks) => {
      before = await journalText(h);
      await hooks.onFence();
      atAck = await journalText(h);
      return result(request, 'CANCELLED');
    });
    await dispatchStep(h);
    expect(before).not.toContain('INVOKING');
    expect(atAck.match(/INVOKING/gu)).toHaveLength(1);
  });

  it('a journal that cannot write is a nack: the native call is never made, no fence is recorded, nothing is retried', async () => {
    const h = await harness();
    (h.runtime as unknown as { journal: { fence: () => never } }).journal.fence = () => { throw new Error('JOURNAL_UNAVAILABLE'); };
    const outcome = await dispatchStep(h);
    expect(h.rig.w.effects).toEqual([]);
    expect(outcome.receipt.fenceCrossed).toBe(false);
    expect(outcome.receipt.effects).toEqual([]);
    expect(await journalText(h)).not.toContain('INVOKING');
    expect(outcome.ledger.state).toBe('FAILED');
  });

  it('a child lost after the ack leaves a receipt the server builds from its own fence state: OUTCOME_UNKNOWN, fence crossed, no effects', async () => {
    const h = await harness(async (_request, hooks) => { await hooks.onFence(); throw new Error('CONTEXT_LOST'); });
    const outcome = await dispatchStep(h);
    expect(outcome.receipt).toMatchObject({ closedCode: 'OUTCOME_UNKNOWN', fenceCrossed: true, effects: [] });
    expect(outcome.ledger).toMatchObject({ state: 'UNKNOWN_OUTCOME', outcomeCode: 'ACK_LOST' });
    expect((await journalText(h)).match(/INVOKING/gu)).toHaveLength(1);
    expect(h.runtime.accepting).toBe(false);
  });

  it('the server journalled a fence but the child receipt shows none (a stop between ack and native): the child receipt is discarded, OUTCOME_UNKNOWN', async () => {
    const h = await harness(async (request, hooks) => { await hooks.onFence(); return { ...result(request, 'CANCELLED'), captured: { 'binding-one': 'discarded' } }; });
    const outcome = await dispatchStep(h);
    expect(outcome.receipt).toMatchObject({ closedCode: 'OUTCOME_UNKNOWN', fenceCrossed: true, effects: [] });
    expect(outcome.ledger.state).toBe('UNKNOWN_OUTCOME');
    expect(outcome.availability).toEqual([]);
  });
});

describe('a dispatch the child did not answer in time (proxy TIMEOUT)', () => {
  it('before the fence it is a TIMEOUT receipt, FAILED/TIMEOUT, and the session ends', async () => {
    const h = await harness(async () => { throw new Error('TIMEOUT'); });
    const outcome = await dispatchStep(h);
    expect(outcome.receipt).toMatchObject({ closedCode: 'TIMEOUT', fenceCrossed: false, effects: [] });
    expect(outcome.ledger).toMatchObject({ state: 'FAILED', outcomeCode: 'TIMEOUT' });
    expect(h.runtime.accepting).toBe(false);
  });

  it('after the fence it is OUTCOME_UNKNOWN', async () => {
    const h = await harness(async (_request, hooks) => { await hooks.onFence(); throw new Error('TIMEOUT'); });
    const outcome = await dispatchStep(h);
    expect(outcome.receipt).toMatchObject({ closedCode: 'OUTCOME_UNKNOWN', fenceCrossed: true, effects: [] });
    expect(outcome.ledger.state).toBe('UNKNOWN_OUTCOME');
  });
});
