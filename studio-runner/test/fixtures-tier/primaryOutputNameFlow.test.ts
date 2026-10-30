import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Actual guided browser composition in the native fixtures tier.
import type { Page } from 'playwright';

import { hash, identity } from '../../src/guided/contracts.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import type { Action, BridgeBootstrap, BridgeObservation, ExecutionEvidence, Observation } from '../../src/guided/types.js';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import { readGrantId } from '../../src/run/observationReadProfile.js';
import { LOCAL_DOMAIN, TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';
import { html, serve } from './perception/cutover-support.js';

const VALUE = 'Zephyr Quartz Ninefold 7341';
const OTHER = 'Amber Willow Crescent 9826';
const NAME = 'Order reference';

async function journalContents(directory: string): Promise<string> {
  const parts: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    parts.push(entry.isDirectory() ? await journalContents(path) : await readFile(path, 'utf8'));
  }
  return parts.join('\n');
}

async function workflow(wrongBinding: boolean): Promise<void> {
  const fixture = await serve({ '/workflow': html(`<output aria-label="${NAME}">${VALUE}</output><output aria-label="Other reference">${OTHER}</output><label>Destination<textarea></textarea></label>`) });
  const directory = await mkdtemp(join(tmpdir(), 'primary-output-flow-'));
  const context = guidedContext(fixture.origin);
  context.sourceStepIds = ['nav', 'read', 'wrongread', 'fill', 'assert', 'repeat'];
  const nav = context.authoredInputs.inputs[0];
  if (!nav || nav.kind === 'secretRef') throw new Error('missing navigation fixture');
  nav.value = fixture.origin + '/workflow';
  context.authoredInputs.inputs = [nav];
  context.authoredInputsHash = hash(context.authoredInputs);
  context.allocations = [
    { bindingId: 'binding-one', needId: 'need-one', producerStepId: 'read', consumers: [{ stepId: 'fill', argumentSlot: 'fill.value' }, { stepId: 'assert', argumentSlot: 'assert.expected' }] },
    { bindingId: 'binding-two', needId: 'need-two', producerStepId: 'wrongread', consumers: [{ stepId: 'assert', argumentSlot: 'assert.expected' }] },
  ];
  const messages: { route: string; body: unknown }[] = [];
  let browser: GuidedBrowser | undefined;
  const runtime = new GuidedRuntime(context, {
    workerId: context.workerId, allowedDomains: TEST_DOMAINS, journalDirectory: directory,
    launch: async (...args) => { browser = await launchGuidedBrowser(...args); return browser; },
    callback: (route, body) => { messages.push({ route, body }); return Promise.resolve(); },
  });
  const read = (bindingId: string): Action['operation'] => ({ kind: 'read', bindingId, recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: readGrantId(LOCAL_DOMAIN) } });
  let evidence: ExecutionEvidence;
  const observation = (): Observation => {
    const found = messages.filter((m) => m.route === 'observations').at(-1)?.body as BridgeObservation | undefined;
    if (!found) throw new Error('missing actual observation');
    return found.observation;
  };
  const target = (name: string): Action['target'] => {
    const o = observation();
    const rows = Object.entries(o.facts).filter(([, fact]) => fact.name === name);
    if (rows.length !== 1 || !rows[0]) throw new Error('public source is not uniquely observed');
    return { kind: 'node', ref: rows[0][0], documentId: o.documentId, generation: o.generation };
  };
  const act = async (step: string, operation: Action['operation'], name?: string) => {
    const p = proposal(context, evidence, step, operation, name === undefined ? undefined : target(name));
    const prepared = await runtime.prepare({ pressInheritance: null, ...identity(context), proposal: p, requestDigest: hash(p), expiresAt: new Date(Date.now() + 20_000).toISOString() });
    const request = dispatch(context, p, prepared);
    const bindingId = operation.kind === 'fill' && operation.value.kind === 'binding' ? operation.value.bindingId
      : operation.kind === 'assert' && operation.expected?.kind === 'binding' ? operation.expected.bindingId : null;
    if (bindingId !== null) {
      const producer = context.producers.find((candidate) => candidate.bindingId === bindingId);
      if (!producer) throw new Error('missing runtime producer');
      const edge = { bindingId, producerAdmissionId: producer.producerAdmissionId, consumerAdmissionId: request.ledger.admission.admissionId, coordinate: p.coordinate, argumentSlot: operation.kind === 'fill' ? 'fill.value' as const : 'assert.expected' as const, destinationOrigin: fixture.origin, transferPolicy: 'sameOrigin' as const };
      request.consumerEdges = [edge]; context.consumerEdges.push(edge);
    }
    const result = await runtime.dispatch(request);
    if (operation.kind === 'read' && result.availability) {
      context.producers.push({ bindingId: operation.bindingId, producerAdmissionId: request.ledger.admission.admissionId, coordinate: p.coordinate, origin: fixture.origin, recipe: operation.recipe, availability: result.availability });
    }
    if (result.ledger.state === 'SUCCEEDED' && (operation.kind === 'read' || bindingId !== null)) { context.materializationRevision++; await runtime.update(context); }
    if (runtime.active) {
      const o = observation();
      evidence = { kind: 'observedDocument', sessionId: context.sessionId, contextId: context.contextId, documentId: o.documentId, generation: o.generation, origin: o.origin, observationHash: hash(o) };
    }
    return { result, prepared };
  };
  try {
    await runtime.start();
    evidence = (messages.find((m) => m.route === 'bootstrap-evidence')?.body as BridgeBootstrap).executionEvidence;
    expect((await act('nav', { kind: 'navigate', destinationInputId: nav.inputId })).result.ledger.state).toBe('SUCCEEDED');
    // No manual withhold or direct local-value injection: dispatch captures, inventories and stores this binding.
    const afterCapture = messages.length;
    expect((await act('read', read('binding-one'), NAME)).result.ledger.state).toBe('SUCCEEDED');
    const source = Object.values(observation().facts).find((fact) => fact.name === NAME);
    expect(source).toMatchObject({ role: 'status', name: NAME, evidence: NAME });
    expect(source).not.toHaveProperty('text');
    if (wrongBinding) expect((await act('wrongread', read('binding-two'), 'Other reference')).result.ledger.state).toBe('SUCCEEDED');
    expect((await act('fill', { kind: 'fill', value: { kind: 'binding', bindingId: 'binding-one' } }, 'Destination')).result.ledger.state).toBe('SUCCEEDED');
    const currentBrowser = browser;
    if (!currentBrowser?.handle) throw new Error('missing actual guided browser');
    expect(await (currentBrowser.handle.page as unknown as Page).getByRole('textbox', { name: 'Destination', exact: true }).inputValue()).toBe(VALUE);
    const o = observation();
    const sourceTarget = target(NAME);
    if (sourceTarget.kind !== 'node') throw new Error('missing source target');
    await expect(currentBrowser.observations.prepareTarget({ ref: sourceTarget.ref, documentId: o.documentId, generation: o.generation, origin: o.origin, operation: read('second-read'), authoredLiteral: null })).rejects.toThrow('READ_NOT_ALLOWED');
    const asserted = await act('assert', { kind: 'assert', predicate: 'containsText', expected: { kind: 'binding', bindingId: wrongBinding ? 'binding-two' : 'binding-one' } }, NAME);
    expect(asserted.prepared.target?.identity).toEqual({ role: 'status', name: NAME });
    expect(asserted.result.ledger.state).toBe(wrongBinding ? 'FAILED' : 'SUCCEEDED');
    expect(asserted.result.ledger.assertionPassed).toBe(!wrongBinding);
    if (wrongBinding) expect(asserted.result.ledger.outcomeCode).toBe('ASSERTION_FAILED');
    expect(JSON.stringify(messages.slice(afterCapture))).not.toContain(VALUE);
    // The wrong-value source was public until its own capture; scan its later messages separately.
    expect(await journalContents(directory)).not.toContain(VALUE);
  } finally { await runtime.stop('CANCELLED'); await runtime.recordingSettled; await fixture.close(); await rm(directory, { recursive: true, force: true }); }
}

describe('actual runtime primary source capture', () => {
  it('native capture automatically withholds the value then fills and asserts the same named source', async () => { await workflow(false); });
  it('withheld named source refuses another read and a wrong local expected value fails', async () => { await workflow(true); });
});
