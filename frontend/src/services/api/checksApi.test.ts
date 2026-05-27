import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the mapper functions directly.
// Since they're module-private, we'll import the module and test through the API surface.
// But first, let's extract and test the mapper logic independently.

// Replicate the mapper logic here for direct testing (same code as in checksApi.ts)
function toBackendConfiguration(type: string, cfg: Record<string, any>): Record<string, any> {
  switch (type) {
    case 'HTTP':
      return {
        type: 'HTTP',
        method: cfg.method ?? 'GET',
        url: cfg.endpoint ?? cfg.url ?? '',
        headers: cfg.headers ?? null,
        body: cfg.body ?? null,
        expectedStatusCode: cfg.expectedStatus ?? cfg.expectedStatusCode ?? 200,
        followRedirects: cfg.followRedirects ?? true,
        timeoutMs: cfg.timeout != null ? cfg.timeout * 1000 : cfg.timeoutMs ?? 5000,
        verifyTls: cfg.validateSSL ?? cfg.verifyTls ?? true,
      };
    case 'TCP':
      return {
        type: 'TCP',
        host: cfg.host ?? '',
        port: cfg.port ?? 0,
        timeoutMs: cfg.timeout != null ? cfg.timeout * 1000 : cfg.timeoutMs ?? 5000,
      };
    default:
      return { type, ...cfg };
  }
}

function toBackendCheckRequest(checkData: Record<string, any>): Record<string, any> {
  const type = checkData.type ?? checkData.configuration?.type ?? 'HTTP';
  return {
    name: checkData.name,
    description: checkData.description ?? '',
    csiId: checkData.csiId,
    environment: checkData.environment ?? 'Production',
    configuration: toBackendConfiguration(type, checkData.configuration ?? {}),
  };
}

describe('toBackendCheckRequest — HTTP', () => {
  it('maps frontend form payload to backend CheckRequest', () => {
    // Exact payload from CreateCheckPage.handleSubmit()
    const frontendPayload = {
      name: 'My HTTP Check',
      description: 'Monitors health endpoint',
      type: 'HTTP',
      csiId: '178672',
      environment: 'Production',
      tags: ['critical'],
      configuration: {
        endpoint: 'https://api.internal.citi.com/health',
        method: 'GET',
        expectedStatus: 200,
        timeout: 30,
        retries: 3,
        validateSSL: true,
        followRedirects: true,
        headers: { 'X-Api-Key': 'test' },
      },
      schedule: { enabled: true, frequency: 'hourly' },
      alerting: { enabled: true, threshold: 3, channels: ['email'] },
    };

    const result = toBackendCheckRequest(frontendPayload);

    // Must match backend CheckRequest(name, description, csiId, environment, configuration)
    expect(result.name).toBe('My HTTP Check');
    expect(result.description).toBe('Monitors health endpoint');
    expect(result.csiId).toBe('178672');
    expect(result.environment).toBe('Production');

    // Must NOT include frontend-only fields
    expect(result).not.toHaveProperty('tags');
    expect(result).not.toHaveProperty('schedule');
    expect(result).not.toHaveProperty('alerting');
    expect(result).not.toHaveProperty('type');

    // Configuration must match backend HttpConfiguration
    const cfg = result.configuration;
    expect(cfg.type).toBe('HTTP');
    expect(cfg.url).toBe('https://api.internal.citi.com/health');
    expect(cfg.method).toBe('GET');
    expect(cfg.expectedStatusCode).toBe(200);
    expect(cfg.timeoutMs).toBe(30000); // 30 seconds → 30000 ms
    expect(cfg.verifyTls).toBe(true);
    expect(cfg.followRedirects).toBe(true);
    expect(cfg.headers).toEqual({ 'X-Api-Key': 'test' });

    // Must NOT include frontend-only config fields
    expect(cfg).not.toHaveProperty('endpoint');
    expect(cfg).not.toHaveProperty('expectedStatus');
    expect(cfg).not.toHaveProperty('timeout');
    expect(cfg).not.toHaveProperty('validateSSL');
    expect(cfg).not.toHaveProperty('retries');
  });

  it('handles backend field names when editing (round-trip)', () => {
    // When editing, the form reads backend response and may pass backend field names
    const editPayload = {
      name: 'Edited Check',
      description: 'Updated',
      type: 'HTTP',
      csiId: '178672',
      environment: 'Production',
      configuration: {
        url: 'https://api.internal.citi.com/health',
        method: 'POST',
        expectedStatusCode: 201,
        timeoutMs: 10000,
        verifyTls: false,
        followRedirects: false,
        headers: {},
        body: '{"test": true}',
      },
    };

    const result = toBackendCheckRequest(editPayload);
    const cfg = result.configuration;
    expect(cfg.type).toBe('HTTP');
    expect(cfg.url).toBe('https://api.internal.citi.com/health');
    expect(cfg.expectedStatusCode).toBe(201);
    // timeoutMs should NOT be multiplied when it's already in ms
    // But cfg.timeout is undefined, so cfg.timeout != null is false, fallback to cfg.timeoutMs
    expect(cfg.timeoutMs).toBe(10000);
    expect(cfg.verifyTls).toBe(false);
    expect(cfg.body).toBe('{"test": true}');
  });

  it('applies defaults for missing optional HTTP fields', () => {
    const minimal = {
      name: 'Minimal',
      type: 'HTTP',
      csiId: '178672',
      configuration: {
        endpoint: 'http://localhost:8080',
      },
    };

    const result = toBackendCheckRequest(minimal);
    const cfg = result.configuration;
    expect(cfg.type).toBe('HTTP');
    expect(cfg.url).toBe('http://localhost:8080');
    expect(cfg.method).toBe('GET');
    expect(cfg.expectedStatusCode).toBe(200);
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.verifyTls).toBe(true);
    expect(cfg.followRedirects).toBe(true);
    expect(cfg.headers).toBeNull();
    expect(cfg.body).toBeNull();
    expect(result.environment).toBe('Production');
    expect(result.description).toBe('');
  });
});

describe('toBackendCheckRequest — TCP', () => {
  it('maps TCP form payload correctly', () => {
    const tcpPayload = {
      name: 'DB Port Check',
      description: 'Check PostgreSQL port',
      type: 'TCP',
      csiId: '285614',
      environment: 'Production',
      configuration: {
        host: 'db.internal.citi.com',
        port: 5432,
        timeout: 10,
      },
    };

    const result = toBackendCheckRequest(tcpPayload);
    const cfg = result.configuration;
    expect(cfg.type).toBe('TCP');
    expect(cfg.host).toBe('db.internal.citi.com');
    expect(cfg.port).toBe(5432);
    expect(cfg.timeoutMs).toBe(10000); // 10 seconds → 10000 ms

    // Must NOT have frontend-only fields
    expect(cfg).not.toHaveProperty('timeout');
  });

  it('defaults TCP timeoutMs when not provided', () => {
    const result = toBackendCheckRequest({
      name: 'TCP',
      type: 'TCP',
      csiId: '178672',
      configuration: { host: 'localhost', port: 80 },
    });
    expect(result.configuration.timeoutMs).toBe(5000);
  });
});

describe('toBackendCheckRequest — type resolution', () => {
  it('reads type from top-level (CreateCheckPage pattern)', () => {
    const result = toBackendCheckRequest({
      name: 'Test',
      type: 'HTTP',
      csiId: '178672',
      configuration: { endpoint: 'http://x' },
    });
    expect(result.configuration.type).toBe('HTTP');
  });

  it('reads type from configuration when top-level missing', () => {
    const result = toBackendCheckRequest({
      name: 'Test',
      csiId: '178672',
      configuration: { type: 'TCP', host: 'x', port: 80 },
    });
    expect(result.configuration.type).toBe('TCP');
  });

  it('defaults to HTTP when no type anywhere', () => {
    const result = toBackendCheckRequest({
      name: 'Test',
      csiId: '178672',
      configuration: { endpoint: 'http://x' },
    });
    expect(result.configuration.type).toBe('HTTP');
  });

  it('passes through unknown types with raw config', () => {
    const result = toBackendCheckRequest({
      name: 'Test',
      type: 'SPLUNK',
      csiId: '178672',
      configuration: { query: 'index=main', timeRange: '15m' },
    });
    expect(result.configuration.type).toBe('SPLUNK');
    expect(result.configuration.query).toBe('index=main');
  });
});

describe('backend contract validation', () => {
  it('produces a payload Jackson can deserialize as CheckRequest', () => {
    const result = toBackendCheckRequest({
      name: 'Contract Test',
      description: 'Verify Jackson compatibility',
      type: 'HTTP',
      csiId: '178672',
      environment: 'Production',
      configuration: {
        endpoint: 'http://localhost:8080/actuator/health',
        method: 'GET',
        expectedStatus: 200,
        timeout: 5,
        validateSSL: true,
        followRedirects: true,
        headers: {},
      },
    });

    // CheckRequest record fields
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('csiId');
    expect(result).toHaveProperty('environment');
    expect(result).toHaveProperty('configuration');

    // HttpConfiguration required fields for Jackson @JsonTypeInfo
    expect(result.configuration).toHaveProperty('type', 'HTTP');
    // HttpConfiguration record fields
    expect(result.configuration).toHaveProperty('method');
    expect(result.configuration).toHaveProperty('url');
    expect(result.configuration).toHaveProperty('expectedStatusCode');
    expect(result.configuration).toHaveProperty('timeoutMs');
    expect(result.configuration).toHaveProperty('verifyTls');
    expect(result.configuration).toHaveProperty('followRedirects');

    // url must be a non-empty string (backend validates)
    expect(typeof result.configuration.url).toBe('string');
    expect(result.configuration.url.length).toBeGreaterThan(0);

    // timeoutMs must be a positive integer
    expect(result.configuration.timeoutMs).toBeGreaterThan(0);
    expect(Number.isInteger(result.configuration.timeoutMs)).toBe(true);
  });

  it('TCP payload matches TcpConfiguration record', () => {
    const result = toBackendCheckRequest({
      name: 'TCP Contract',
      type: 'TCP',
      csiId: '178672',
      environment: 'Production',
      configuration: { host: 'db.internal.citi.com', port: 5432, timeout: 10 },
    });

    expect(result.configuration).toHaveProperty('type', 'TCP');
    expect(result.configuration).toHaveProperty('host');
    expect(result.configuration).toHaveProperty('port');
    expect(result.configuration).toHaveProperty('timeoutMs');
    expect(result.configuration.host.length).toBeGreaterThan(0);
    expect(result.configuration.port).toBeGreaterThan(0);
    expect(result.configuration.port).toBeLessThanOrEqual(65535);
  });
});
