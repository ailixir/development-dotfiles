import apiClient from './apiClient';
import type { TestIR } from '@/types/studio/studioTypes';

export interface ValidateStepsResponse {
  isValid: boolean;
  results: Array<{ stepIndex: number; isValid: boolean; suggestion: string | null }>;
}

export const studioApi = {
  listTests: async (params?: { csiId?: string }) => apiClient.get('/studio/tests', { params }),
  getTest: async (id: string) => apiClient.get(`/studio/tests/${id}`),
  createTest: async (payload: Partial<TestIR> & { name: string; csiId: string }) => apiClient.post('/studio/tests', payload),
  updateTest: async (id: string, payload: Partial<TestIR>) => apiClient.put(`/studio/tests/${id}`, payload),
  deleteTest: async (id: string) => apiClient.delete(`/studio/tests/${id}`),
  executeTest: async (id: string): Promise<{ executionId: string; status: string; message?: string }> => apiClient.post(`/studio/tests/${id}/execute`),
  getExecution: async (id: string) => apiClient.get(`/studio/executions/${id}`),
  validateSteps: async (steps: string[]): Promise<ValidateStepsResponse> => apiClient.post('/studio/validate-steps', { steps }),
  listExecutions: async () => apiClient.get('/studio/executions'),
};

export default studioApi;


