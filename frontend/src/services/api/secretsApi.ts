import apiClient from './apiClient';

/**
 * Studio secrets are scoped to one saved test and live only in Vault. The server returns names,
 * never values: a list item is `{name}`, and a created secret is `{name, version, allowedOrigins}`.
 */
export interface StudioSecretName {
  name: string;
}

export interface StudioSecret {
  name: string;
  version: string;
  allowedOrigins: string[];
}

export interface CreateStudioSecretRequest {
  name: string;
  value: string;
  allowedOrigins: string[];
}

const testSecretsPath = (testId: string) => `/studio/tests/${encodeURIComponent(testId)}/secrets`;

export const secretsApi = {
  /** Not retried: a 503 (`VAULT_NOT_CONFIGURED`, `VAULT_UNAVAILABLE`) is answered once. */
  async listSecrets(testId: string): Promise<{ data: StudioSecretName[] }> {
    return apiClient.get(testSecretsPath(testId), { __doNotRetry: true });
  },

  /**
   * The body carries the secret value, so the request is `redactBody`: the debug log omits it and a
   * rejected request's error keeps no copy. No `Idempotency-Key` is sent.
   */
  async createSecret(testId: string, request: CreateStudioSecretRequest): Promise<StudioSecret> {
    return apiClient.post(
      testSecretsPath(testId),
      { name: request.name, value: request.value, allowedOrigins: request.allowedOrigins },
      { redactBody: true },
    );
  },
};

export default secretsApi;
