import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import studioApi from '@/services/api/studioApi';
import type { AuthoringTestRequest } from '@/services/api/studioAuthoringTransport';
import { defaultConfiguration, type AuthoringV2Request } from '@/types/studio/studioTypes';
import { studioMockServer } from './server';
import { resetStudioMocks } from './handlers';

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

function body(source: AuthoringV2Request): AuthoringTestRequest {
  return {
    ...source, name: 'Invalid fixture', csiId: '60406', environment: 'Production',
    variables: [], configuration: defaultConfiguration(),
  };
}
