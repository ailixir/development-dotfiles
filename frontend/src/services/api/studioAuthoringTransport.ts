import type {
  AuthoringV2Request,
  AuthoringV2Response,
  TestDto,
  TestRequest,
} from '@/types/studio/studioTypes';

/** Compositions of the canonical draft and authoring contracts; no duplicated wire fields. */
export type AuthoringTestRequest = Omit<TestRequest, 'steps'> & AuthoringV2Request;
export type AuthoringTestUpdate = AuthoringTestRequest &
  Required<Pick<TestDto, 'sourceRevision' | 'configurationRevision'>>;
export type AuthoringTestDto = Omit<TestDto, 'steps'> & AuthoringV2Response;

import apiClient from './apiClient';

export function getTest(id: string): Promise<TestDto>;
export function getTest(id: string, options: { authoringSchemaVersion: 2 }): Promise<AuthoringTestDto>;
export function getTest(id: string, options?: { authoringSchemaVersion: 2 }): Promise<TestDto | AuthoringTestDto> {
  return apiClient.get(`/studio/tests/${id}`, options ? { params: options } : undefined);
}

export function createTest(payload: AuthoringTestRequest): Promise<AuthoringTestDto>;
export function createTest(payload: TestRequest): Promise<TestDto>;
export function createTest(payload: TestRequest | AuthoringTestRequest): Promise<TestDto | AuthoringTestDto> {
  return apiClient.post('/studio/tests', payload);
}

export function updateTest(id: string, payload: AuthoringTestUpdate): Promise<AuthoringTestDto>;
export function updateTest(id: string, payload: TestRequest): Promise<TestDto>;
export function updateTest(id: string, payload: TestRequest | AuthoringTestUpdate): Promise<TestDto | AuthoringTestDto> {
  return apiClient.put(`/studio/tests/${id}`, payload);
}
