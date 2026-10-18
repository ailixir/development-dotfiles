import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import studioApi from '@/services/api/studioApi';
import { defaultConfiguration, type AuthoringV2Request, type TestRequest } from '@/types/studio/studioTypes';
import { studioMockServer } from './server';
import { resetStudioMocks } from './handlers';
import { MOCK_READABLE_CSIS, mockTests } from './fixtures';

const invalid = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../../docs/specs/studio/examples/context-authoring-invalid.json'),
    'utf8',
  ),
) as { cases: Array<{ name: string; request: AuthoringV2Request; expectedCategories: string[] }> };

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

const STEP = '00000000-0000-4000-8000-000000000401';
const BASE = '/api/v1/studio';

/** A v1 body: no `authoringSchemaVersion`, string steps. The backend refuses it and writes nothing. */
const v1Body = (steps: unknown) => ({
  name: 'Old shape',
  csiId: MOCK_READABLE_CSIS[0],
  environment: 'Production',
  steps,
  variables: [],
  configuration: defaultConfiguration(),
});

async function send(method: 'POST' | 'PUT', path: string, payload: unknown) {
  const response = await fetch(`http://localhost${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: (await response.json()) as { error?: string } };
}

const listedIds = async () => (await studioApi.listTests({ size: 100 })).data.map((test) => test.id);

describe('inherited item d / g1: the MSW routes mirror the v2-only backend', () => {
  it('refuses a v1 create (string steps, no version) with 400 INVALID_AUTHORING and stores nothing', async () => {
    const before = await listedIds();
    const refused = await send('POST', '/tests', v1Body(['Go to "https://www.citi.com"']));
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('INVALID_AUTHORING');
    expect(await listedIds()).toEqual(before);
  });

  it('refuses a v1 body with no version even when its steps are objects', async () => {
    const refused = await send('POST', '/tests', v1Body([{ id: STEP, text: 'Open' }]));
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('INVALID_AUTHORING');
  });

  it('refuses string steps under version 2 as INVALID_AUTHORING', async () => {
    const refused = await send('POST', '/tests', { ...v1Body(['Open']), authoringSchemaVersion: 2 });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('INVALID_AUTHORING');
  });

  it('refuses a v1 save of an existing draft and leaves its revisions and steps untouched', async () => {
    const target = mockTests[0];
    const before = await studioApi.getTest(target.id);
    const refused = await send('PUT', `/tests/${target.id}`, {
      ...v1Body(['Something else']),
      sourceRevision: before.sourceRevision,
      configurationRevision: before.configurationRevision,
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('INVALID_AUTHORING');
    expect(await studioApi.getTest(target.id)).toEqual(before);
  });

  it('answers GET /tests/{id} as the v2 detail, for a fixture and for a draft the mock created', async () => {
    const fixture = await studioApi.getTest(mockTests[0].id);
    expect(fixture.authoringSchemaVersion).toBe(2);
    expect(fixture.steps.map(({ text }) => text)).toEqual(mockTests[0].steps);

    const created = await studioApi.createTest(
      body({ authoringSchemaVersion: 2, steps: [{ id: STEP, text: 'Open' }] }),
    );
    expect(created.steps).toMatchObject([{ id: STEP, text: 'Open' }]);
    expect((await studioApi.getTest(created.id)).steps).toMatchObject([{ id: STEP, text: 'Open' }]);
  });

  it('refuses a read of an id the caller cannot read with 403 STUDIO_FORBIDDEN', async () => {
    await expect(studioApi.getTest('00000000-0000-4000-8000-00000000dead')).rejects.toThrow('STUDIO_FORBIDDEN');
  });

  it('counts a changed step ID as a source change and an unchanged one as none', async () => {
    const created = await studioApi.createTest(
      body({ authoringSchemaVersion: 2, steps: [{ id: STEP, text: 'Open' }] }),
    );
    const revisions = { sourceRevision: created.sourceRevision, configurationRevision: created.configurationRevision };
    const same = await studioApi.updateTest(created.id, {
      ...body({ authoringSchemaVersion: 2, steps: [{ id: STEP, text: 'Open' }] }), ...revisions,
    });
    expect(same.sourceRevision).toBe(created.sourceRevision);
    const renamed = await studioApi.updateTest(created.id, {
      ...body({ authoringSchemaVersion: 2, steps: [{ id: STEP, text: 'Open the page' }] }), ...revisions,
    });
    expect(renamed.sourceRevision).toBe(created.sourceRevision + 1);
  });
});

describe('authoring MSW parity', () => {
  it.each(invalid.cases)('rejects shared invalid fixture $name', async ({ request, expectedCategories }) => {
    try {
      await studioApi.createTest(body(request));
      throw new Error('Expected invalid fixture to be rejected');
    } catch (error) {
      expect(expectedCategories.some((category) => String(error).includes(category))).toBe(true);
    }
  });

  it('refuses cross-CSI evidence without storing a draft', async () => {
    const request: AuthoringV2Request = {
      authoringSchemaVersion: 2,
      steps: [{
        id: '00000000-0000-4000-8000-000000000301', text: 'Open',
        context: { evidenceReferences: [{
          id: '10000000-0000-4000-8000-000000000301', revision: 1, source: 'supplied',
          csiId: '99999', environment: 'Production', route: '/', state: 'landing',
          stepId: '00000000-0000-4000-8000-000000000301',
          capturedAt: '2026-09-18T12:00:00Z', completeness: 'partial', hash: 'a'.repeat(64),
        }] },
      }],
    };
    await expect(studioApi.createTest(body(request))).rejects.toThrow('STUDIO_FORBIDDEN');
  });
});

function body(source: AuthoringV2Request): TestRequest {
  return {
    ...source, name: 'Invalid fixture', csiId: '60406', environment: 'Production',
    variables: [], configuration: defaultConfiguration(),
  };
}
