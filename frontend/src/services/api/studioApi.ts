import apiClient from './apiClient';
import { createTest, getTest, updateTest } from './studioAuthoringTransport';
import type {
  CompileAccepted,
  ConfirmCompileRequest,
  ExecuteAccepted,
  ExecutionPage,
  ExecutionSnapshot,
  ExecutionListQuery,
  TestDto,
  TestListQuery,
  TestPage,
  Page,
} from '@/types/studio/studioTypes';

/**
 * Studio API client, typed against `docs/specs/studio/openapi.yaml` (story 10.1, AC-15).
 *
 * Every call here speaks the frozen contract. Legacy drafts are converted once, in
 * `@/types/studio/legacyTestIr`, before they reach this module.
 */

/** Kept for existing callers; the full query shape is {@link TestListQuery}. */
export type ListTestsParams = TestListQuery;

/** Kept for existing callers; the full query shape is {@link ExecutionListQuery}. */
export type ListExecutionsParams = ExecutionListQuery;

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

/** Local list search and filters must include records beyond the server's first page. */
async function readAllPages<T>(readPage: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const first = await readPage(0);
  const items = [...first.data];
  for (let page = 1; page < first.totalPages; page += 1) {
    const next = await readPage(page);
    items.push(...next.data);
  }
  return items;
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

  /** Every page, concatenated. Prefer {@link studioApi.listTests} for list screens. */
  listAllTests: async (csiId?: string): Promise<TestDto[]> =>
    dedupeById(
      await readAllPages<TestDto>((page) => studioApi.listTests({ csiId, page, size: 100 })),
      (test) => test.id,
    ),

  getTest,
  createTest,
  updateTest,

  deleteTest: async (id: string): Promise<void> => apiClient.delete(`/studio/tests/${id}`),

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

  /** Every page, concatenated. Prefer {@link studioApi.listExecutions} for list screens. */
  listAllExecutions: async (): Promise<ExecutionSnapshot[]> =>
    dedupeById(
      await readAllPages<ExecutionSnapshot>((page) =>
        studioApi.listExecutions({ page, size: 100 }),
      ),
      (execution) => execution.executionId,
    ),

  /**
   * Enqueues a compile of the draft's current source. The `202` means the attempt was *started*,
   * not that it will succeed: pool saturation and gateway failure surface asynchronously as
   * `compileStatus: STALE` carrying `compileError`, never as a status code here (§4.3).
   *
   * Declared refusals, and nothing else: `400` with one of the four authoring-bound codes, `409`
   * with `TEST_DELETED` or `TEST_QUARANTINED`.
   */
  compileTest: async (id: string): Promise<CompileAccepted> =>
    apiClient.post(`/studio/tests/${id}/compile`, undefined),

  /**
   * Confirms the candidate the caller was looking at. The server's transaction is conditional on
   * all four fields, so the caller must send the four values it read together — not four values
   * recombined from separate reads. A candidate that moved answers `409 STALE_CANDIDATE`.
   */
  confirmCompile: async (id: string, body: ConfirmCompileRequest): Promise<TestDto> =>
    apiClient.post(`/studio/tests/${id}/confirm-compile`, body),

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
