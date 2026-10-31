import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash } from '../../src/guided/contracts.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import { guidedContext, sessionStub } from '../helpers/guided.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const clean of cleanups.reverse()) await clean(); cleanups.length = 0; });

function inputs(context: ReturnType<typeof guidedContext>, suffix: string) {
  const kind = 'nonsecretText' as const;
  const sourceStepId = 'next';
  return [
    { inputId: `source-${suffix}`, sourceStepId, kind, value: 'Reports', provenance: { referenceKind: 'sourceSpan' as const, sourceRevision: context.sourceRevision, stepId: sourceStepId, startUtf16: 0, endUtf16: 7, kind } },
    { inputId: `configuration-${suffix}`, sourceStepId, kind, value: `PRIVATE_CONFIG_${suffix}`, provenance: { referenceKind: 'configuration' as const, configurationRevision: context.configurationRevision, stepId: sourceStepId, referenceId: `saved-${suffix}`, kind } },
    { inputId: `secret-${suffix}`, sourceStepId: 'fill', kind: 'secretRef' as const, secretId: randomUUID(), provenance: { referenceKind: 'configuration' as const, configurationRevision: context.configurationRevision, stepId: 'fill', referenceId: `secret-${suffix}`, referenceName: 'PASS', kind: 'secretRef' as const } },
  ];
}

it('AUTHORED-ECHO-01 installs strict configuration values before the first possible dispatch, excluding sourceSpan and secret metadata', async () => {
  const context = guidedContext('https://example.test');
  context.authoredInputs.inputs.push(...inputs(context, 'initial'));
  context.authoredInputsHash = hash(context.authoredInputs);
  const directory = await mkdtemp(join(tmpdir(), 'authored-echo-unit-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  let release: () => void = () => undefined;
  const withholding = new Promise<void>(resolve => { release = resolve; });
  const withhold = vi.fn(() => withholding);
  const blankMatches = vi.fn(() => Promise.resolve(true));
  const callback = vi.fn(() => Promise.resolve());
  const browser: GuidedBrowser = {
    evidence: { kind: 'initialBlank', sessionId: context.sessionId, contextId: context.contextId, creationId: randomUUID(), documentId: randomUUID(), bootstrapId: randomUUID(), url: 'about:blank', origin: null, generation: 0 },
    blankMatches, close: () => Promise.resolve(), terminate: () => Promise.resolve(), orderlyClosed: () => true,
    observations: sessionStub({ withhold, dispose: () => Promise.resolve(), observe: () => Promise.reject(new Error('unused')) }),
  };
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, allowedDomains: TEST_DOMAINS, journalDirectory: directory, launch: () => Promise.resolve(browser), callback });
  cleanups.push(() => runtime.stop('CANCELLED'));
  const starting = runtime.start();
  await expect.poll(() => withhold.mock.calls.length).toBe(1);
  expect(withhold).toHaveBeenCalledWith(['PRIVATE_CONFIG_initial']);
  expect(blankMatches).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
  release(); await starting;
  expect(blankMatches).toHaveBeenCalledOnce();

  const next = structuredClone(context);
  next.contextRevision++; next.materializationRevision++;
  next.authoredInputs.inputs.push(...inputs(next, 'append'));
  next.authoredInputsHash = hash(next.authoredInputs);
  const appended = vi.fn(() => Promise.resolve());
  browser.observations.withhold = appended;
  const deliveryId = randomUUID();
  const acknowledgement = await runtime.update(next, deliveryId);
  expect(appended).toHaveBeenCalledExactlyOnceWith(['PRIVATE_CONFIG_append']);
  expect(acknowledgement).toMatchObject({ deliveryId, contextRevision: 2, contextHash: hash(next) });
  expect(await runtime.update(next, deliveryId)).toEqual(acknowledgement);
  expect(appended).toHaveBeenCalledOnce();
});
