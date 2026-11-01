/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access -- fakes: every real browser method is async; the contract fixtures are read by path. */
/**
 * SC008-E6 AC1 (C2): learning and replay are one path. The same frozen step runs through executeObservedReplay and through
 * GuidedRuntime.dispatch against the same scripted page, and the receipts, the page effects and the captured values are equal: a read, an
 * effect, a capture, and a pre-fence miss. Both harnesses are trimmed copies of stepReplay.test.ts and stepRuntime.test.ts.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { executeObservedReplay } from '../../src/executor/observedReplay.js';
import type { Execute3, Scope } from '../../src/executor/observedOperations.js';
import type { StepFinishedEvent, StepReporter } from '../../src/executor/stepReporter.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity } from '../../src/guided/contracts.js';
import type { Action, BridgeDispatch, BridgeObservation, ExecutionEvidence, Observation, RunnerContext } from '../../src/guided/types.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { SecretUseEvidence } from '../../src/run/secretUse.js';
import { hashObserved, OBSERVED_PROFILE } from '../../src/validator/observedReferencePolicy.js';
import { fakeHandle, newRig, operation } from '../helpers/stepFakes.js';
import type { Rig } from '../helpers/stepFakes.js';
import { inProcessBrowser } from '../helpers/guidedStepService.js';

const documents = (JSON.parse(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json', import.meta.url), 'utf8')) as { documents: Record<string, any> }).documents; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T>(value: T): T => structuredClone(value);
const STEP = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'] as const;

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
  const bootstrap: GuidedBrowser = inProcessBrowser({
    evidence: clone(documents.bootstrap.executionEvidence) as ExecutionEvidence, observations: rig.session, blankMatches: async () => true,
    close: async () => undefined, terminate: async () => undefined, orderlyClosed: () => true, handle: fakeHandle(rig),
    allowedDomains: ['*'], ...(beforeSecretFill === undefined ? {} : { beforeSecretFill }),
  });
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, allowedDomains: ['*'], journalDirectory: journal, launch: async () => bootstrap, callback: async (route, body) => { messages.push({ route, body }); } });
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
const ORIGIN = 'https://orders.example.test';
const STEPS = STEP;
const SCOPE: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['step'], initialContext: { kind: 'initialBlank' } };
const UUID = '00000000-0000-4000-8000-0000000000a0';

type Operation = Execute3['steps'][number]['operations'][number]['operation'];
interface Plan { readonly code: string; readonly captures?: string[]; readonly uses?: Operation['uses'][number][]; readonly origin?: string | null }

function execute(plans: readonly Plan[], extra: Partial<Pick<Execute3, 'inputs' | 'secrets' | 'secretOrigins'>> = {}): Execute3 {
  const operations = plans.map((plan, i) => ({ coordinate: { stepId: STEPS[i] as string, ordinal: 0 }, guardId: `g${String(i)}`, operation: operation(plan.code, { ...(plan.captures ? { captures: plan.captures } : {}), ...(plan.uses ? { uses: plan.uses } : {}) }) }));
  const bindings = plans.flatMap((plan, i) => (plan.captures ?? []).map(bindingId => ({ bindingId, producer: { stepId: STEPS[i] as string, ordinal: 0 }, origin: ORIGIN })));
  const transfers = plans.flatMap((plan, i) => (plan.uses ?? []).flatMap(use => use.kind === 'binding' ? [{ bindingId: use.id, producer: bindings.find(b => b.bindingId === use.id)?.producer as { stepId: string; ordinal: number }, consumer: { stepId: STEPS[i] as string, ordinal: 0 }, origin: ORIGIN }] : []));
  return {
    kind: 'execute', protocolVersion: 3, mode: 'observed', runId: UUID, attemptId: UUID, profileHash: hashObserved(OBSERVED_PROFILE), configurationHash: 'c'.repeat(64), waitStrategy: 'domcontentloaded', stepTimeoutMs: 10_000,
    steps: operations.map((operationEntry, stepIndex) => ({ stepIndex, stepId: STEPS[stepIndex] as string, operations: [operationEntry] })),
    guards: plans.map((plan, i) => ({ guardId: `g${String(i)}`, origin: plan.origin === undefined ? (i === 0 ? null : ORIGIN) : plan.origin })),
    bindings, transfers, inputs: extra.inputs ?? [], secrets: extra.secrets ?? {}, secretOrigins: extra.secretOrigins ?? {},
  };
}

async function run(message: Execute3, rig: Rig): Promise<{ result: Awaited<ReturnType<typeof executeObservedReplay>>; finished: StepFinishedEvent[] }> {
  const finished: StepFinishedEvent[] = [];
  const reporter: StepReporter = { stepStarted: () => undefined, stepFinished: event => { finished.push(event); } };
  const adapter = createObservedReplayAdapter(fakeHandle(rig), SCOPE, ['*'], 'run-1', () => undefined);
  const result = await executeObservedReplay(message, adapter, SCOPE, ['*'], { now: () => performance.now() }, reporter, new AbortController().signal, undefined, new SecretUseEvidence([]));
  return { result, finished };
}


const START = "await page.goto('https://orders.example.test/start');";
interface Case { readonly name: string; readonly code: string; readonly captures?: string[]; readonly closedCode: string | null; readonly effects: { method: string; completed: boolean }[] }
const CASES: Case[] = [
  { name: 'a read', code: "await page.locator('#price').innerText();", closedCode: null, effects: [] },
  { name: 'an effect', code: "await page.locator('#go').click();", closedCode: null, effects: [{ method: 'click', completed: true }] },
  { name: 'a capture', code: "vars['binding-reference'] = await page.locator('#price').innerText();", captures: ['binding-reference'], closedCode: null, effects: [] },
  { name: 'a pre-fence miss', code: "await page.locator('#gone').click();", closedCode: 'TARGET_DRIFT', effects: [] },
];
const world = (rig: Rig): void => { rig.w.text['#price'] = '$ 12'; };

describe('one frozen step, two entry points', () => {
  it.each(CASES)('$name: executeObservedReplay and GuidedRuntime.dispatch return the same receipt, the same page effects and the same captured value', async ({ code, captures, closedCode, effects }) => {
    // Replay: step 0 loads the page, step 1 is the step under test.
    const replayRig = newRig('about:blank'); world(replayRig); replayRig.w.matches['#gone'] = 0;
    // A captured value needs a reader in a replay graph; the third step only consumes it and is not compared.
    const reader: Plan[] = captures ? [{ code: "await page.locator('#f').fill(vars['binding-reference']);", uses: [{ kind: 'binding', id: 'binding-reference' }] }] : [];
    const replayed = await run(execute([{ code: START }, { code, ...(captures ? { captures } : {}) }, ...reader]), replayRig);
    const replayReceipt = replayed.finished[1]?.receipt;

    // Learning: the same two steps, each admitted by prepare and run by dispatch.
    const h = await harness(world);
    const first = action(h, 0, START);
    await h.runtime.dispatch(dispatchRequest(h, first, await admit(h, first)));
    const step = action(h, 1, code, captures ? { captures } : {});
    const preparationId = await admit(h, step); // the target is there at prepare (a miss at prepare is STEP_PRE_FENCE, the learning refusal)
    h.rig.w.matches['#gone'] = 0; // and gone at dispatch
    const learning = await h.runtime.dispatch(dispatchRequest(h, step, preparationId));

    expect(replayReceipt).toBeDefined();
    expect(learning.receipt).toEqual(replayReceipt);
    expect(learning.receipt).toMatchObject({ closedCode, effects, stepHash: hashObserved(step.operation) });
    expect(h.rig.session.captures).toEqual(replayRig.session.captures);
    expect(h.rig.w.effects).toEqual(replayRig.w.effects.slice(0, h.rig.w.effects.length));
    expect(learning.availability.length).toBe(captures ? 1 : 0);
    if (captures) expect(h.rig.session.captures).toEqual(['$ 12']);
  });
});
