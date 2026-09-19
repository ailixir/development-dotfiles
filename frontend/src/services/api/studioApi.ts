import apiClient from './apiClient';
import { createTest, getTest, updateTest } from './studioAuthoringTransport';
import type {
  CompileAccepted,
  ConfirmCompileRequest,
  ExecuteAccepted,
  ExecutionPage,
  ExecutionSnapshot,
  TestDto,
  TestPage,
} from '@/types/studio/studioTypes';

/**
 * Studio API client, typed against `docs/specs/studio/openapi.yaml` (story 10.1, AC-15).
 *
 * Every call here speaks the frozen contract. Legacy drafts are converted once, in
 * `@/types/studio/legacyTestIr`, before they reach this module.
 */

export interface ValidateStepsResponse {
  isValid: boolean;
  results: Array<{ stepIndex: number; isValid: boolean; suggestion: string | null }>;
}

export interface ListTestsParams {
  csiId?: string;
  page?: number;
  size?: number;
}

export interface ListExecutionsParams {
  /** Optional since 10.1: an unfiltered history request is scoped by the caller's CSIs. */
  testId?: string;
  page?: number;
  size?: number;
}

export const studioApi = {
  listTests: async (params?: ListTestsParams): Promise<TestPage> =>
    apiClient.get('/studio/tests', { params }),

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

  listExecutions: async (params?: ListExecutionsParams): Promise<ExecutionPage> =>
    apiClient.get('/studio/executions', { params }),

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

  validateSteps: async (steps: string[]): Promise<ValidateStepsResponse> =>
    apiClient.post('/studio/validate-steps', { steps }),

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
