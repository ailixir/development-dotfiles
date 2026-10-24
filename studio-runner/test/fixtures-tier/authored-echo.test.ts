import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity } from '../../src/guided/contracts.js';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import type { Action, BridgeBootstrap, BridgeObservation, ExecutionEvidence, Producer } from '../../src/guided/types.js';
import type { ObservationApplicationPolicy } from '../../src/run/observationTypes.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';

const resources: (() => Promise<void>)[] = [];
afterEach(async () => { for (const clean of resources.reverse()) await clean(); resources.length = 0; });
type Slot = 'assert.expected' | 'selectOption.value' | 'fill.value';

async function harness(html: string, value: string, slot: Slot = 'assert.expected', options: { configuration?: boolean; knownSecret?: boolean; secretRef?: boolean; read?: boolean } = {}) {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(req.url === '/reports' ? '<title>Reports</title><h1>Reports</h1>' : req.url === '/destination' ? `<button>${value}</button>` : html);
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  resources.push(() => new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); server.closeAllConnections(); }));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('PORT');
  const origin = `http://127.0.0.1:${String(address.port)}`;
  const directory = await mkdtemp(join(tmpdir(), 'authored-echo-real-'));
  resources.push(() => rm(directory, { recursive: true, force: true }));
  const context = guidedContext(origin);
  context.sourceStepIds = ['nav', 'read', 'next', 'fill', 'submit'];
  context.authoredInputs.inputs.push({ inputId: 'literal', sourceStepId: 'submit', kind: 'nonsecretText', value, intendedSlot: slot,
    provenance: options.configuration ? { referenceKind: 'configuration', configurationRevision: context.configurationRevision, stepId: 'submit', referenceId: 'saved', kind: 'nonsecretText', intendedSlot: slot } : { referenceKind: 'sourceSpan', sourceRevision: context.sourceRevision, stepId: 'submit', startUtf16: 0, endUtf16: value.length, kind: 'nonsecretText', intendedSlot: slot } });
  if (options.configuration) context.authoredInputs.inputs.push({ inputId: 'matching-source', sourceStepId: 'submit', kind: 'nonsecretText', value, intendedSlot: slot, provenance: { referenceKind: 'sourceSpan', sourceRevision: context.sourceRevision, stepId: 'submit', startUtf16: 0, endUtf16: value.length, kind: 'nonsecretText', intendedSlot: slot } });
  if (options.secretRef) context.authoredInputs.inputs.push({ inputId: 'pass', sourceStepId: 'fill', kind: 'secretRef', secretId: 'PASS', intendedSlot: 'fill.value', provenance: { referenceKind: 'configuration', configurationRevision: context.configurationRevision, stepId: 'fill', referenceId: 'pass', referenceName: 'PASS', kind: 'secretRef', intendedSlot: 'fill.value' } });
  context.authoredInputsHash = hash(context.authoredInputs);
  const policy: ObservationApplicationPolicy = { policyRuleId: 'structural', allowStructuralDiscovery: true, readGrants: options.read ? [{ policyRuleId: 'read-field', origin, region: { kind: 'role', role: 'main', name: 'Operations', exact: true }, controlValue: { classification: 'nonsecretApproved', types: ['text'] } }] : [] };
  const messages: { route: string; body: unknown }[] = [];
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, journalDirectory: directory, applicationPolicy: policy,
    launch: (config, ...args) => launchGuidedBrowser({ ...config, knownSecrets: options.knownSecret ? [value] : [] }, ...args),
    callback: (route, body) => { messages.push({ route, body }); return Promise.resolve(); } });
  resources.push(() => runtime.stop('CANCELLED'));
  await runtime.start();
  let evidence: ExecutionEvidence = (messages[0]?.body as BridgeBootstrap).executionEvidence;
  const observation = () => (messages.filter(message => message.route === 'observations').at(-1)?.body as BridgeObservation).observation;
  const act = async (step: string, operation: Action['operation'], target?: Action['target'], secret?: string) => {
    const action = proposal(context, evidence, step, operation, target);
    const preparation = await runtime.prepare({ ...identity(context), proposal: action, requestDigest: hash(action), expiresAt: new Date(Date.now() + 20_000).toISOString() });
    const request = dispatch(context, action, preparation);
    if (secret !== undefined) request.secret = { secretId: 'PASS', value: secret, versionId: 'synthetic-local', allowedOrigins: [origin] };
    const result = await runtime.dispatch(request);
    const observed = observation();
    evidence = { kind: 'observedDocument', sessionId: context.sessionId, contextId: context.contextId, documentId: observed.documentId, generation: observed.generation, origin: observed.origin, observationHash: hash(observed) };
    return { result, request, action };
  };
  const target = (name: string): Action['target'] => {
    const node = observation().nodes.find(node => node.name === name && node.locatorHints.length);
    if (!node?.locatorHints[0]) throw new Error('NODE_UNAVAILABLE');
    return { nodeId: node.nodeId, documentId: node.documentId, generation: node.generation, locator: node.locatorHints[0] };
  };
  const refresh = async () => {
    const envelope = await runtime.refreshObservation({ ...identity(context), expectedGeneration: evidence.generation }, 'authored-echo-proof');
    evidence = { kind: 'observedDocument', sessionId: context.sessionId, contextId: context.contextId, documentId: envelope.observation.documentId, generation: envelope.observation.generation, origin: envelope.observation.origin, observationHash: hash(envelope.observation) };
    return envelope.observation;
  };
  expect((await act('nav', { kind: 'navigate', destinationInputId: 'input-nav' })).result.ledger.state).toBe('SUCCEEDED');
  return { context, runtime, messages, observation, act, target, refresh };
}

describe('AUTHORED-ECHO-01 real guided collector', () => {
  it.each([
    ['Reports link / assertion literal', '<a href="/reports">Reports</a>', 'Reports', 'assert.expected', 'Reports'],
    ['Order confirmed heading / assertion literal', '<h1>Order confirmed</h1>', 'Order confirmed', 'assert.expected', 'Order confirmed'],
    ['London listbox / select literal', '<div role="listbox" aria-label="London">Choose city</div>', 'London', 'selectOption.value', 'London'],
    ['one-character literal', '<button>Batch 10</button>', '1', 'assert.expected', 'Batch 10'],
    ['two-letter literal', '<button>BOOK</button>', 'OK', 'assert.expected', 'BOOK'],
  ] as const)('%s does not withhold structural targets before literal dispatch', async (_name, html, value, slot, expected) => {
    const h = await harness(html, value, slot);
    expect(h.observation().nodes.map(node => node.name)).toContain(expected);
    expect(h.observation().coverage.withheldRegions).toBe(0);
    expect(h.observation().coverage.reason).toBe('complete');
  });

  it('configuration provenance still withholds its matching target despite coincident sourceSpan', async () => {
    const value = 'AE_CONFIG_41';
    const h = await harness(`<button>${value}</button><button>Safe</button>`, value, 'assert.expected', { configuration: true });
    expect(h.observation().nodes.map(node => node.name)).toEqual(['Safe']);
    expect(h.observation().coverage.withheldRegions).toBe(1);
  });

  it('knownSecrets stay strict when the same value is a sourceSpan literal', async () => {
    const value = 'AE_KNOWN_42';
    const h = await harness(`<button>${value}</button><button>Safe</button>`, value, 'assert.expected', { knownSecret: true });
    expect(h.observation().nodes.map(node => node.name)).toEqual(['Safe']);
    expect(h.observation().coverage.withheldRegions).toBe(1);
  });

  it('resolved secretRef stays strict after its password field is removed, including a matching source literal', async () => {
    const value = 'AE_RESOLVED_43';
    const h = await harness('<input type="password"><button id="echo">Safe</button><script>const field=document.querySelector("input");field.addEventListener("change",()=>{document.querySelector("button").textContent=field.value;field.remove();});</script>', value, 'assert.expected', { secretRef: true });
    const before = h.observation();
    const result = await h.act('fill', { kind: 'fill', value: { kind: 'secretRef', sourceInputId: 'pass' } }, { kind: 'passwordControl', documentId: before.documentId, generation: before.generation }, value);
    expect(result.result.ledger.state).toBe('SUCCEEDED');
    expect(h.observation().nodes.some(node => node.name === value)).toBe(false);
    expect(h.observation().coverage.passwordControls).toBe(0);
    expect(h.observation().coverage.withheldRegions).toBe(1);
    expect(JSON.stringify(h.messages)).not.toContain(value);
  });

  it('captured business values stay strict on a later document despite a matching source literal', async () => {
    const value = 'AE_CAPTURED_44';
    const h = await harness(`<main aria-label="Operations"><input aria-label="Business source" value="${value}"></main>`, value, 'assert.expected', { read: true });
    const recipe: Producer['recipe'] = { kind: 'controlValue', classification: 'nonsecretApproved', controlType: 'text', policyRuleId: 'read-field' };
    const read = await h.act('read', { kind: 'read', bindingId: 'binding-one', recipe }, h.target('Business source'));
    expect(read.result.ledger.state).toBe('SUCCEEDED');
    expect(h.observation().coverage.withheldRegions).toBe(0);
    if (!read.result.availability || !read.action.executionEvidence.origin) throw new Error('CAPTURE');
    h.context.producers = [{ bindingId: 'binding-one', producerAdmissionId: read.request.ledger.admission.admissionId, coordinate: read.action.coordinate, origin: read.action.executionEvidence.origin, recipe, availability: read.result.availability }];
    h.context.materializationRevision++; await h.runtime.update(h.context);
    expect((await h.act('next', { kind: 'navigate', destinationInputId: 'input-next' })).result.ledger.state).toBe('SUCCEEDED');
    expect(h.observation().nodes).toHaveLength(0);
    expect(h.observation().coverage.withheldRegions).toBe(1);
    expect(JSON.stringify(h.messages)).not.toContain(value);
  });

  it('joins actual target acquisition and dispatch for Click Reports, then check title is Reports', async () => {
    const h = await harness('<title>Home</title><a href="/reports">Reports</a>', 'Reports');
    expect(h.observation().coverage.withheldRegions).toBe(0);
    expect((await h.act('read', { kind: 'click' }, h.target('Reports'))).result.ledger.state).toBe('SUCCEEDED');
    // Native navigation can complete after click acknowledgement. Refresh within the same runtime.
    await expect.poll(async () => { const observation = await h.refresh(); return observation.nodes.some(node => node.name === 'Reports'); }).toBe(true);
    expect((await h.act('submit', { kind: 'assert', predicate: 'title', expected: { kind: 'authoredLiteral', sourceInputId: 'literal' } })).result.ledger).toMatchObject({ state: 'SUCCEEDED', assertionPassed: true });
    expect(h.observation().coverage.withheldRegions).toBe(0);
  });

  it('keeps newly appended source literals observable while strictly withholding appended configuration', async () => {
    const h = await harness('<button>Reports</button><button>AE_APPEND_45</button>', 'unused');
    const next = structuredClone(h.context); next.contextRevision++; next.materializationRevision++;
    next.authoredInputs.inputs.push(
      { inputId: 'appended-source', sourceStepId: 'submit', kind: 'nonsecretText', value: 'Reports', intendedSlot: 'assert.expected', provenance: { referenceKind: 'sourceSpan', sourceRevision: next.sourceRevision, stepId: 'submit', startUtf16: 0, endUtf16: 7, kind: 'nonsecretText', intendedSlot: 'assert.expected' } },
      { inputId: 'appended-config', sourceStepId: 'submit', kind: 'nonsecretText', value: 'AE_APPEND_45', intendedSlot: 'assert.expected', provenance: { referenceKind: 'configuration', configurationRevision: next.configurationRevision, stepId: 'submit', referenceId: 'saved-appended', kind: 'nonsecretText', intendedSlot: 'assert.expected' } },
    );
    next.authoredInputsHash = hash(next.authoredInputs);
    const ack = await h.runtime.update(next, randomUUID());
    expect(ack.contextRevision).toBe(2);
    Object.assign(h.context, next);
    const observation = await h.refresh();
    expect(observation.nodes.map(node => node.name)).toEqual(['Reports']);
    expect(observation.coverage.withheldRegions).toBe(1);
  });
});
