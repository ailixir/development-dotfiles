import apiClient from './apiClient';
import type { InferenceAccepted, InferenceCompile, InferenceConfirm, InferenceView, InferenceWrite } from '@/types/studio/inferenceTypes';

// Preserve the configured host/prefix and shared auth/interceptors while selecting API version2.
const config = () => {
  const base = apiClient.getBaseURL().replace(/\/$/, '');
  if (!base.endsWith('/v1')) throw new Error('Studio inference needs a versioned API base');
  return { baseURL: `${base.slice(0, -3)}/v2` };
};
export const studioInferenceApi = {
  get: (id: string): Promise<InferenceView> => apiClient.get(`/studio/tests/${id}`, config()),
  create: (body: InferenceWrite): Promise<InferenceView> => apiClient.post('/studio/tests', body, config()),
  update: (id: string, body: InferenceWrite): Promise<InferenceView> => apiClient.put(`/studio/tests/${id}`, body, config()),
  compile: (id: string, body: InferenceCompile): Promise<InferenceAccepted> => apiClient.post(`/studio/tests/${id}/compile`, body, config()),
  confirm: (id: string, body: InferenceConfirm): Promise<InferenceView> => apiClient.post(`/studio/tests/${id}/confirm-compile`, body, config()),
};
