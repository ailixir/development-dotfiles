import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import studioApi from './studioApi';
import type { AuthoringTestRequest, AuthoringTestUpdate } from './studioAuthoringTransport';
import { defaultConfiguration, type AuthoringV2Request } from '@/types/studio/studioTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { normalizedSource } from '@/services/mocks/studio/authoringState';

const examples = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../docs/specs/studio/examples/context-authoring-valid.json'),
    'utf8',
  ),
) as { cases: Array<{ name: string; request?: AuthoringV2Request; legacy?: { steps: string[] } }> };

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('Studio authoring v2 transport', () => {
  it('creates, reads and updates the selected draft using returned revision identity', async () => {
    const request = body(valid('exact-literals'));
    const created = await studioApi.createTest(request);
    expect(created.authoringSchemaVersion).toBe(2);
    expect(created.steps).toEqual(normalizedSource(request).steps);

    const read = await studioApi.getTest(created.id, { authoringSchemaVersion: 2 });
    expect(read.steps).toEqual(created.steps);

    const update: AuthoringTestUpdate = {
      ...request,
      globalContext: { entries: [{ kind: 'text', value: '  updated 東京\n  ' }] },
      sourceRevision: created.sourceRevision,
      configurationRevision: created.configurationRevision,
    };
    const saved = await studioApi.updateTest(created.id, update);
    expect(saved.sourceRevision).toBe(created.sourceRevision);
    expect(saved.configurationRevision).toBe(created.configurationRevision + 1);
    expect(saved.globalContext).toEqual(
      normalizedSource({
        authoringSchemaVersion: 2,
        globalContext: update.globalContext,
        steps: update.steps,
      }).globalContext,
    );

    await expect(studioApi.updateTest(created.id, update)).rejects.toThrow('STALE_REVISION');
    const afterStale = await studioApi.getTest(created.id, { authoringSchemaVersion: 2 });
    expect(afterStale.configurationRevision).toBe(saved.configurationRevision);
    expect(afterStale.globalContext).toEqual(saved.globalContext);
  });

  it('round-trips login and protected-page context without resolving the secret', async () => {
    const created = await studioApi.createTest(body(valid('login-then-protected-navigation')));
    const json = JSON.stringify(created.steps);
    expect(json).toContain('secretRef');
    expect(json).not.toContain('resolvedPassword');
    expect(json).toContain('/login');
    expect(json).toContain('/home');
    expect(json).toContain('/reports/protected');
  });

  it('keeps legacy GET non-mutating until the client explicitly saves v2', async () => {
    const legacy = examples.cases.find(({ name }) => name === 'legacy-empty-context')?.legacy;
    if (!legacy) throw new Error('Missing legacy fixture');
    const created = await studioApi.createTest({
      name: 'Legacy', csiId: '60406', environment: 'Production', steps: legacy.steps,
      variables: [], configuration: defaultConfiguration(),
    });
    await expect(
      studioApi.getTest(created.id, { authoringSchemaVersion: 2 }),
    ).rejects.toThrow('LEGACY_AUTHORING');
    expect((await studioApi.getTest(created.id)).steps).toEqual(legacy.steps);
  });
});

function valid(name: string): AuthoringV2Request {
  const request = examples.cases.find((candidate) => candidate.name === name)?.request;
  if (!request) throw new Error(`Missing fixture ${name}`);
  return structuredClone(request);
}

function body(source: AuthoringV2Request): AuthoringTestRequest {
  return {
    ...source,
    name: 'Context authoring',
    csiId: '60406',
    environment: 'Production',
    variables: [],
    configuration: defaultConfiguration(),
  };
}
