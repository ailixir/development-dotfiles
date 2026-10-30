import { http, HttpResponse, type HttpHandler } from 'msw';
import type { TestDto } from '@/types/studio/studioTypes';
import type {
  GuidedStartCapability,
  StudioCapabilities,
} from '@/types/studio/studioGuidedTypes';
import {
  MOCK_EXECUTE_DENIED_CSIS,
  MOCK_READABLE_CSIS,
  STUDIO_FORBIDDEN_BODY,
  mockTests,
} from './fixtures';
import { demoTests } from './demoFixtures';
import { readinessDrafts } from './readinessFixtures';

/**
 * `GET /tests/{id}/capabilities` (`getStudioTestCapabilities`, STUDIO-OBS-008 P1, lane L2b).
 *
 * Mirrors the contract, not the build: there is no global capability route, the persisted test id
 * is the only selector, authorization is decided before anything is looked up (an unknown or
 * deleted id and an unreadable CSI answer the same `403`), a malformed id is `400`, and the answer
 * is `Cache-Control: no-store`. The body validates against `StudioCapabilities` and carries no
 * provider name, path, token or policy detail.
 *
 * What is a mock choice, since the contract leaves it to the server: `guidedStart.context` is
 * built from the draft's current revisions with `environmentId` = the draft's environment label;
 * a draft with no steps is `RUNTIME_INCOMPATIBLE` (ruling D-11, the same
 * refusal the start route gives); a CSI the principal cannot execute on is `FORBIDDEN_SCOPE`.
 * `setGuidedStartCapability` overrides any of it per test.
 *
 * Composition into `handlers.ts` happens at root F1; this module imports nothing from it.
 */

const BASE = '*/api/v1/studio';
const TEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface CapabilityMockEnvironment {
  getTest(id: string): TestDto | undefined;
}

const defaultEnvironment: CapabilityMockEnvironment = {
  getTest: (id) => [...mockTests, ...readinessDrafts, ...demoTests].find((test) => test.id === id),
};

let vaultSecrets = true;
const guidedStartByTest = new Map<string, GuidedStartCapability>();
let requestCount = 0;
let failures: Array<{ response: () => Response; remaining: number }> = [];

/** Whether the deployment is configured with a Vault provider (not a health check). */
export function setVaultSecrets(configured: boolean): void {
  vaultSecrets = configured;
}

/** Forces the `guidedStart` answer for one test. */
export function setGuidedStartCapability(testId: string, capability: GuidedStartCapability): void {
  guidedStartByTest.set(testId, capability);
}

/** Makes the next `times` capability reads fail with `response()` (a `401`, a `503`, `Response.error()`). */
export function failCapabilityReads(response: () => Response, times = 1): void {
  failures.push({ response, remaining: times });
}

/** How many capability reads the mirror has served since the last reset. */
export function capabilityRequestCount(): number {
  return requestCount;
}

export function resetCapabilityMocks(): void {
  vaultSecrets = true;
  guidedStartByTest.clear();
  requestCount = 0;
  failures = [];
}

function guidedStartFor(test: TestDto): GuidedStartCapability {
  const override = guidedStartByTest.get(test.id);
  if (override) return override;
  if (test.steps.length === 0) return { available: false, code: 'RUNTIME_INCOMPATIBLE' };
  if (test.csiId && MOCK_EXECUTE_DENIED_CSIS.has(test.csiId)) {
    return { available: false, code: 'FORBIDDEN_SCOPE' };
  }
  return {
    available: true,
    context: {
      schemaVersion: 3,
      testId: test.id,
      sourceRevision: String(test.sourceRevision),
      configurationRevision: String(test.configurationRevision),
      environmentId: test.environment,
      versions: { contract: 3 },
    },
  };
}

export function createCapabilityHandlers(environment: CapabilityMockEnvironment): HttpHandler[] {
  return [
    http.get(`${BASE}/tests/:id/capabilities`, ({ params }) => {
      requestCount += 1;
      const pending = failures.find((failure) => failure.remaining > 0);
      if (pending) {
        pending.remaining -= 1;
        return pending.response();
      }
      const id = String(params.id);
      if (!TEST_ID.test(id)) {
        return HttpResponse.json(
          { error: 'INVALID_REQUEST', message: 'Malformed test id' },
          { status: 400 },
        );
      }
      const test = environment.getTest(id);
      if (!test || !test.csiId || !MOCK_READABLE_CSIS.includes(test.csiId)) {
        return HttpResponse.json(STUDIO_FORBIDDEN_BODY, { status: 403 });
      }
      const body: StudioCapabilities = { vaultSecrets, guidedStart: guidedStartFor(test) };
      return HttpResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    }),
  ];
}

/** The capability handler over the fixture drafts. Wired into `studioHandlers` at root F1. */
export const capabilityHandlers: HttpHandler[] = createCapabilityHandlers(defaultEnvironment);

export default capabilityHandlers;
