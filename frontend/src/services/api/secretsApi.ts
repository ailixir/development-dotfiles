import apiClient from './apiClient';

export interface SecretMetadata {
  id: string;
  label: string;
  scope: 'project' | 'org' | 'user';
  last4: string;
  createdAt: string;
  expiresAt?: string | null;
}

export const secretsApi = {
  async listSecrets(): Promise<{ data: SecretMetadata[] }> {
    return apiClient.get('/secrets');
  },

  async createSecret(label: string, scope: SecretMetadata['scope'], value: string): Promise<SecretMetadata> {
    return apiClient.post('/secrets', { label, scope, value });
  },
};

export default secretsApi;
