// @vitest-environment node
import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMswProxy, type MswProxy } from '../../e2e/mswProxy';
import { DEMO_CSIS } from '@/services/mocks/studio/demoFixtures';
import { OTHER_CSI } from '@/services/mocks/studio/fixtures';
import { unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import { normalizePageResponse } from '@/services/api/responseAdapter';
import type { FeaturesResponse } from '@/services/api/featuresApi';
import type { CheckSourcesResponse } from '@/services/api/sourcesApi';
import type { CSI } from '@/types/csi/csiTypes';
import type { GuidedResult, GuidedSessionView, StudioCapabilities } from '@/types/studio/studioGuidedTypes';
import { defaultConfiguration, type TestDraftHeader } from '@/types/studio/studioTypes';

let proxy: MswProxy;

/** Requests use only the isolated loopback server on its OS-assigned port, never the shared preview. */
async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: T }>((resolve, reject) => {
    const request = httpRequest({
      hostname: '127.0.0.1', port: proxy.port, path, method,
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) as T });
        } catch (error) {
          reject(error);
        }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

beforeAll(async () => { proxy = await startMswProxy({ host: '127.0.0.1', port: 0 }); });
beforeEach(async () => { await call('POST', '/__test/scenario', { name: 'default' }); });
afterAll(async () => { await proxy?.close(); });

describe('Node-MSW preview bootstrap through the real proxy', () => {
  it('returns source and feature bodies accepted by the current application APIs', async () => {
    const sources = await call<CheckSourcesResponse>('GET', '/api/v1/checks/sources');
    const features = await call<FeaturesResponse>('GET', '/api/v1/features');
    expect(sources.status).toBe(200);
    expect(features.status).toBe(200);
    expect(sources.body.sources).toEqual([{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }]);
    expect(features.body.sources).toEqual(sources.body.sources);
    expect(features.body.features).toContainEqual({ key: 'STUDIO', enabled: true, label: 'Checks Studio' });
  });

  it('loads the readable registry with current paging and search shapes', async () => {
    const response = await call<unknown>('GET', '/api/v1/csi?page=0&size=20');
    expect(response.status).toBe(200);
    const page = normalizePageResponse<CSI>(response.body);
    expect(page.data.map((csi) => csi.id)).toEqual([...DEMO_CSIS]);
    expect(page.data.map((csi) => csi.id)).not.toContain(OTHER_CSI);
    expect(page).toMatchObject({ page: 1, limit: 20, total: DEMO_CSIS.length });
    expect(page.data.every((csi) => csi.name && csi.businessUnit && csi.owner)).toBe(true);
    const second = await call<unknown>('GET', '/api/v1/csi?page=1&size=2');
    expect(normalizePageResponse<CSI>(second.body).data.map((csi) => csi.id)).toEqual(DEMO_CSIS.slice(2));
    const search = await call<unknown>('GET', `/api/v1/csi?search=${DEMO_CSIS[0]}`);
    expect(normalizePageResponse<CSI>(search.body).data.map((csi) => csi.id)).toEqual([DEMO_CSIS[0]]);
  });

  it('creates a draft under a returned CSI while preserving denial of unreadable systems', async () => {
    const registry = await call<unknown>('GET', '/api/v1/csi');
    const csiId = normalizePageResponse<CSI>(registry.body).data[0].id;
    const body = {
      authoringSchemaVersion: 2, name: 'Synthetic preview creation', csiId,
      environment: 'Development', description: '', steps: [], variables: [], configuration: defaultConfiguration(),
    };
    const created = await call<TestDraftHeader>('POST', '/api/v1/studio/tests', body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: body.name, csiId, environment: body.environment });
    expect((await call('GET', `/api/v1/studio/tests/${created.body.id}`)).status).toBe(200);
    const denied = await call<{ error: string }>('POST', '/api/v1/studio/tests', { ...body, csiId: OTHER_CSI });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('STUDIO_FORBIDDEN');
  });

  it('keeps scenario application and guided handlers active alongside the bootstrap routes', async () => {
    expect((await call('POST', '/__test/scenario', { name: '__proto__' })).status).toBe(400);
    expect((await call('POST', '/__test/scenario', { name: 'guided-login-required-no-login-steps' })).status).toBe(200);
    expect((await call('GET', '/api/v1/csi')).status).toBe(200);
    const capabilities = await call<StudioCapabilities>('GET', `/api/v1/studio/tests/${unlearnedDraft.id}/capabilities`);
    expect(capabilities.status).toBe(200);
    if (!capabilities.body.guidedStart.available) throw new Error('Fixture guided start is unavailable');
    const start = await call<GuidedSessionView>('POST', '/api/v1/studio/guided-sessions', capabilities.body.guidedStart.context, {
      'Idempotency-Key': 'preview-scenario-regression',
    });
    expect(start.status).toBe(202);
    const id = start.body.session.sessionId;
    let state = start.body.session.state;
    for (let index = 0; index < 20 && state !== 'FAILED'; index += 1) {
      const read = await call<GuidedSessionView>('GET', `/api/v1/studio/guided-sessions/${id}`);
      expect(read.status).toBe(200);
      state = read.body.session.state;
    }
    expect(state).toBe('FAILED');
    const result = await call<GuidedResult>('GET', `/api/v1/studio/guided-sessions/${id}/result`);
    expect(result.status).toBe(200);
    expect(result.body.errorCode).toBe('LOGIN_REQUIRED');
  });

  it('still fails unknown routes and unsupported bootstrap methods with 502', async () => {
    for (const [method, path] of [['GET', '/api/v1/preview-unknown'], ['POST', '/api/v1/csi']]) {
      const response = await call<{ error: string }>(method, path);
      expect(response.status).toBe(502);
      expect(response.body.error).toBe('E2E_UNHANDLED_REQUEST');
    }
    const recorded = await call<{ requests: Array<{ handled: boolean; status: number }> }>('GET', '/__test/requests');
    expect(recorded.body.requests).toHaveLength(2);
    expect(recorded.body.requests.every((entry) => !entry.handled && entry.status === 502)).toBe(true);
  });
});
