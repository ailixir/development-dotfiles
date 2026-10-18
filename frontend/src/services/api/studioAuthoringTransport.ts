import type { TestDetailDto, TestRequest, TestUpdateRequest } from '@/types/studio/studioTypes';
import apiClient from './apiClient';

/**
 * The one authoring transport (STUDIO-OBS-008 inherited obligation, item b). `getTest`, `createTest`
 * and `updateTest` each have a single signature: the v2 body in, the `TestDetailDto` out. The list
 * projection (`TestDto`) is `listTests`'s and carries no step IDs.
 */

export function getTest(id: string): Promise<TestDetailDto> {
  return apiClient.get(`/studio/tests/${id}`);
}

export function createTest(payload: TestRequest): Promise<TestDetailDto> {
  return apiClient.post('/studio/tests', payload);
}

export function updateTest(id: string, payload: TestUpdateRequest): Promise<TestDetailDto> {
  return apiClient.put(`/studio/tests/${id}`, payload);
}
