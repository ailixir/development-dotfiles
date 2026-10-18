import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import studioApi from './studioApi';
import {
  defaultConfiguration,
  type AuthoringV2Request,
  type TestRequest,
  type TestUpdateRequest,
} from '@/types/studio/studioTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { mockTests } from '@/services/mocks/studio/fixtures';
import { normalizedSource } from '@/services/mocks/studio/authoringState';

const examples = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../docs/specs/studio/examples/context-authoring-valid.json'),
    'utf8',
  ),
) as { cases: Array<{ name: string; request?: AuthoringV2Request }> };

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

    const read = await studioApi.getTest(created.id);
    expect(read.authoringSchemaVersion).toBe(2);
    expect(read.steps).toEqual(created.steps);

    const update: TestUpdateRequest = {
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
    const afterStale = await studioApi.getTest(created.id);
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

  it('reads a fixture draft with stable step IDs and the same IDs on every read', async () => {
    const first = await studioApi.getTest(mockTests[0].id);
    const second = await studioApi.getTest(mockTests[0].id);
    expect(first.steps.map(({ text }) => text)).toEqual(mockTests[0].steps);
    expect(first.steps.every(({ id }) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
    expect(new Set(first.steps.map(({ id }) => id)).size).toBe(first.steps.length);
    expect(second.steps).toEqual(first.steps);
  });
});

function valid(name: string): AuthoringV2Request {
  const request = examples.cases.find((candidate) => candidate.name === name)?.request;
  if (!request) throw new Error(`Missing fixture ${name}`);
  return structuredClone(request);
}

function body(source: AuthoringV2Request): TestRequest {
  return {
    ...source,
    name: 'Context authoring',
    csiId: '60406',
    environment: 'Production',
    variables: [],
    configuration: defaultConfiguration(),
  };
}
