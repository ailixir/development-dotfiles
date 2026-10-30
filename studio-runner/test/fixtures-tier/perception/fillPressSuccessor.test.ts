import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { GuidedRuntime } from '../../../src/guided/runtime.js';
import { hash, identity } from '../../../src/guided/contracts.js';
import { launchGuidedBrowser } from '../../../src/run/browser.js';
import type { Action, BridgeBootstrap, BridgeObservation, ExecutionEvidence } from '../../../src/guided/types.js';
import { TEST_DOMAINS } from '../../helpers/allowedDomains.js';
import { dispatch, guidedContext, proposal } from '../../helpers/guided.js';
import { guardDist } from './harness.js';

/**
 * A fill followed by "Press Enter" on a search box that a page script replaces while it is used (Wikipedia's autocomplete component
 * swaps the input for a new one that keeps the value and the focus). The press may inherit the filled field when the field it filled
 * is gone and the element it names holds the focus; it never inherits onto a different element while the filled field is still there.
 */

guardDist();

const SWAPPING = `<main><form action="/result" method="get"><input type="search" name="q" aria-label="Find items" id="legacy"></form></main>
<script>document.addEventListener('input', (event) => {
  const old = event.target; if (old.id !== 'legacy') return;
  const next = document.createElement('input'); next.type = 'search'; next.name = 'q'; next.setAttribute('aria-label', 'Find items'); next.setAttribute('role', 'combobox'); next.value = old.value;
  setTimeout(() => { old.replaceWith(next); next.focus(); }, 50);
});</script>`;
/** The filled field stays in the page and a second field takes the focus. */
const DUPLICATING = `<main><form action="/result" method="get"><input type="search" name="q" aria-label="Find items" id="legacy"></form></main>
<script>document.addEventListener('input', (event) => {
  const old = event.target; if (old.id !== 'legacy') return;
  const next = document.createElement('input'); next.type = 'search'; next.name = 'q'; next.setAttribute('aria-label', 'Find items'); next.setAttribute('role', 'combobox'); next.value = old.value;
  setTimeout(() => { old.after(next); next.focus(); }, 50);
}, { once: true });</script>`;

const resources: (() => Promise<void>)[] = [];
afterEach(async () => { for (const clean of resources.reverse()) await clean(); resources.length = 0; });

async function fillThenPressPrepare(page: string): Promise<{ press: () => Promise<{ state: string }>; location: () => Promise<string> }> {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(req.url?.startsWith('/result') ? '<title>Result</title><main><h1>Result page</h1></main>' : `<title>Start</title>${page}`);
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  resources.push(() => new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); server.closeAllConnections(); }));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('PORT');
  const origin = `http://localhost:${String(address.port)}`;
  const directory = await mkdtemp(join(tmpdir(), 'fill-press-successor-'));
  resources.push(() => rm(directory, { recursive: true, force: true }));
  const context = guidedContext(origin);
  context.sourceStepIds = ['nav', 'read', 'next', 'fill', 'submit'];
  const value = 'Guido van Rossum';
  context.authoredInputs.inputs.push({ inputId: 'literal', sourceStepId: 'fill', kind: 'nonsecretText', value, intendedSlot: 'fill.value',
    provenance: { referenceKind: 'sourceSpan', sourceRevision: context.sourceRevision, stepId: 'fill', startUtf16: 0, endUtf16: value.length, kind: 'nonsecretText', intendedSlot: 'fill.value' } });
  context.authoredInputsHash = hash(context.authoredInputs);
  const messages: { route: string; body: unknown }[] = [];
  let browser: Awaited<ReturnType<typeof launchGuidedBrowser>> | undefined;
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, allowedDomains: TEST_DOMAINS, journalDirectory: directory,
    launch: async (...args) => { browser = await launchGuidedBrowser(...args); return browser; },
    callback: (route, body) => { messages.push({ route, body }); return Promise.resolve(); } });
  resources.push(() => runtime.stop('CANCELLED'));
  await runtime.start();
  let evidence: ExecutionEvidence = (messages[0]?.body as BridgeBootstrap).executionEvidence;
  let current: BridgeObservation['observation'] | null = null;
  const refresh = async (): Promise<BridgeObservation['observation']> => {
    const last = messages.filter(m => m.route === 'observations').at(-1)?.body as BridgeObservation | undefined;
    const refreshed = await runtime.refreshObservation({ ...identity(context), expectedGeneration: last ? last.observation.generation : evidence.generation, focus: { stepText: 'Press Enter', targetIntents: ['Find items'] } }, `fill-press-${String(Math.random())}`);
    current = refreshed.observation;
    evidence = { kind: 'observedDocument', sessionId: context.sessionId, contextId: context.contextId, documentId: current.documentId, generation: current.generation, origin: current.origin, observationHash: hash(current) };
    return current;
  };
  const prepared = async (step: string, operation: Action['operation'], target?: Action['target'], inheritance: unknown = null) => {
    const action = proposal(context, evidence, step, operation, target);
    const preparation = await runtime.prepare({ pressInheritance: inheritance as never, ...identity(context), proposal: action, requestDigest: hash(action), expiresAt: new Date(Date.now() + 20_000).toISOString() });
    return { action, preparation };
  };
  const targetNamed = (name: string): Action['target'] => {
    if (!current) throw new Error('NO_OBSERVATION');
    const found = Object.entries(current.facts).filter(([, fact]) => fact.name === name).at(-1);
    if (!found) throw new Error('NODE_UNAVAILABLE');
    return { kind: 'node', ref: found[0], documentId: current.documentId, generation: current.generation };
  };
  const navigation = await prepared('nav', { kind: 'navigate', destinationInputId: 'input-nav' });
  expect((await runtime.dispatch(dispatch(context, navigation.action, navigation.preparation))).ledger.state).toBe('SUCCEEDED');
  await refresh();
  const fillStep = await prepared('fill', { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'literal' } } as Action['operation'], targetNamed('Find items'));
  const fillRequest = dispatch(context, fillStep.action, fillStep.preparation);
  expect((await runtime.dispatch(fillRequest)).ledger.state).toBe('SUCCEEDED');
  await new Promise(resolve => { setTimeout(resolve, 300); });
  const after = await refresh();
  const inheritance = { kind: 'same-element-press', predecessorAdmissionId: fillRequest.ledger.admission.admissionId, predecessorRequestDigest: fillRequest.ledger.requestDigest,
    predecessorOperationHash: fillRequest.ledger.operationHash, predecessorCoordinate: fillRequest.ledger.coordinate, documentId: after.documentId };
  return {
    press: async () => {
      const pressStep = await prepared('submit', { kind: 'press', key: 'Enter' }, targetNamed('Find items'), inheritance);
      const result = await runtime.dispatch(dispatch(context, pressStep.action, pressStep.preparation));
      return { state: result.ledger.state };
    },
    location: async () => { await new Promise(resolve => { setTimeout(resolve, 800); }); return (browser?.handle as unknown as { page: { url(): string } } | undefined)?.page.url() ?? ''; },
  };
}

describe('press after a fill whose field the page replaced', () => {
  it('admits the press onto the replacement that holds the focus and submits the form', async () => {
    const flow = await fillThenPressPrepare(SWAPPING);
    expect(await flow.press()).toEqual({ state: 'SUCCEEDED' });
    expect(await flow.location()).toContain('/result?q=Guido');
  });

  it('refuses the press when the filled field is still in the page (two different elements)', async () => {
    const flow = await fillThenPressPrepare(DUPLICATING);
    await expect(flow.press()).rejects.toThrow('TARGET_CHANGED');
  });
});
