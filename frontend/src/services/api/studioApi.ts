import apiClient from './apiClient';
import { createTest, getTest, updateTest } from './studioAuthoringTransport';
import type {
  ExecuteAccepted,
  ExecutionPage,
  ExecutionSnapshot,
  ExecutionListQuery,
  TestListQuery,
  TestPage,
} from '@/types/studio/studioTypes';
import type { StudioCapabilities } from '@/types/studio/studioGuidedTypes';

/**
 * Studio API client, typed against `docs/specs/studio/openapi.yaml` (story 10.1, AC-15).
 *
 * Every call here speaks the one public contract (ADR-SC-005, STUDIO-OBS-012A).
 */

/** Per-request options for the list reads. */
export interface ListRequestOptions {
  /**
   * Aborts the request. `apiClient` normalizes errors, so an aborted call rejects with a plain
   * `Error`: callers should check `signal.aborted` rather than the error's type.
   */
  signal?: AbortSignal;
}

/** Drops `undefined`, `null` and blank-string params so the URL only carries real filters. */
function compactParams(params: object | undefined): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') result[key] = trimmed;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Keeps the first occurrence of each id. The server pages with a stable `id` tie-breaker, so a
 * duplicate within one page should not happen; this is the client half of AC-2 in case it does.
 */
export function dedupeById<T>(items: readonly T[], idOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = idOf(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

export const studioApi = {
  /**
   * One server page of tests (`GET /studio/tests`), filtered, searched and sorted server-side.
   * Returns the backend envelope as-is (`data`, 0-based `page`, `size`, `totalElements`,
   * `totalPages`) with `data` de-duplicated by id.
   */
  listTests: async (params?: TestListQuery, options?: ListRequestOptions): Promise<TestPage> => {
    const page = await apiClient.get<TestPage>('/studio/tests', {
      params: compactParams(params),
      signal: options?.signal,
    });
    return { ...page, data: dedupeById(page.data ?? [], (test) => test.id) };
  },

  getTest,
  createTest,
  updateTest,

  deleteTest: async (id: string): Promise<void> => apiClient.delete(`/studio/tests/${id}`),

  /**
   * `GET /tests/{id}/capabilities` (`getStudioTestCapabilities`, STUDIO-OBS-008 P1): what this
   * deployment can do for one saved test. The persisted test id is the only selector. No retry
   * (`__doNotRetry`): a client treats loading, an error and any non-200 as unavailable and never
   * simulates a value, so the first answer is the one that counts.
   */
  getCapabilities: async (testId: string): Promise<StudioCapabilities> =>
    apiClient.get(`/studio/tests/${encodeURIComponent(testId)}/capabilities`, {
      __doNotRetry: true,
    }),

  /**
   * Accepts an execution. `idempotencyKey` is principal-scoped and durable: retrying with the
   * same key returns the same execution instead of starting a second run, whichever API replica
   * the retry reaches.
   */
  executeTest: async (id: string, idempotencyKey?: string): Promise<ExecuteAccepted> =>
    apiClient.post(
      `/studio/tests/${id}/execute`,
      undefined,
      idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined,
    ),

  /** The same payload the SSE `execution.snapshot` event carries; this is the fallback path. */
  getExecution: async (id: string): Promise<ExecutionSnapshot> =>
    apiClient.get(`/studio/executions/${id}`),

  /**
   * Asks the server to stop a run. `202` carries the execution's current snapshot: the request was
   * accepted, not that the run has ended. The run ends later with `status: ERROR` and
   * `errorCode: CANCELLED`, and that terminal snapshot arrives through the live transport like any
   * other. `409` means the run was already terminal.
   */
  cancelExecution: async (id: string): Promise<ExecutionSnapshot> =>
    apiClient.post(`/studio/executions/${id}/cancel`, undefined),

  /**
   * One server page of runs (`GET /studio/executions`), filtered, searched and sorted server-side.
   * Each item carries `testName` (null for a deleted test). `data` is de-duplicated by
   * `executionId`.
   */
  listExecutions: async (
    params?: ExecutionListQuery,
    options?: ListRequestOptions,
  ): Promise<ExecutionPage> => {
    const page = await apiClient.get<ExecutionPage>('/studio/executions', {
      params: compactParams(params),
      signal: options?.signal,
    });
    return { ...page, data: dedupeById(page.data ?? [], (execution) => execution.executionId) };
  },

  /**
   * `POST /tests/{id}/validate-variables` (`validateTestVariables`): reports how the draft's
   * `<var NAME>` / `<secret ID>` references match its declared variables. Writes nothing.
   */
  validateVariables: async (
    id: string,
    variables: Record<string, unknown>,
  ): Promise<{
    testId: string;
    isValid: boolean;
    valid: boolean;
    hasVariables: boolean;
    /** `undeclared` then `unvalued`; `unused` is informational only. */
    missing: string[];
    undeclared: string[];
    unvalued: string[];
    conflicting: string[];
    unused: string[];
  }> =>
    apiClient.post(`/studio/tests/${id}/validate-variables`, { variables }),
};

export default studioApi;
