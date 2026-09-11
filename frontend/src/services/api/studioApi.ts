import apiClient from './apiClient';
import type {
  ExecuteAccepted,
  ExecutionPage,
  ExecutionSnapshot,
  TestDto,
  TestPage,
  TestRequest,
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

  getTest: async (id: string): Promise<TestDto> => apiClient.get(`/studio/tests/${id}`),

  createTest: async (payload: TestRequest): Promise<TestDto> =>
    apiClient.post('/studio/tests', payload),

  updateTest: async (id: string, payload: TestRequest): Promise<TestDto> =>
    apiClient.put(`/studio/tests/${id}`, payload),

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

  listExecutions: async (params?: ListExecutionsParams): Promise<ExecutionPage> =>
    apiClient.get('/studio/executions', { params }),

  validateSteps: async (steps: string[]): Promise<ValidateStepsResponse> =>
    apiClient.post('/studio/validate-steps', { steps }),

  validateVariables: async (
    id: string,
    variables: Record<string, unknown>,
  ): Promise<{ valid: boolean; hasVariables: boolean; testId: string }> =>
    apiClient.post(`/studio/tests/${id}/validate-variables`, { variables }),
};

export default studioApi;
