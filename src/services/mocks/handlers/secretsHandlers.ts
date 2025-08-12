import { http, HttpResponse, delay } from 'msw';

interface SecretRecord {
  id: string;
  label: string;
  scope: 'project' | 'org' | 'user';
  last4?: string;
  createdAt: string;
  // value is intentionally not returned via API except one-time on create
  value?: string;
}

let mockSecrets: SecretRecord[] = [
  { id: 'sec_abc123', label: 'Trading API Key', scope: 'project', last4: '2f8c', createdAt: new Date().toISOString() },
  { id: 'sec_def456', label: 'Splunk Token', scope: 'org', last4: 'e91a', createdAt: new Date().toISOString() },
];

export const secretsHandlers = [
  // List secrets (metadata only)
  http.get('/secrets', async () => {
    await delay(250);
    return HttpResponse.json({
      data: mockSecrets.map(({ value, ...meta }) => meta),
    });
  }),

  // Create secret (one-time value echo)
  http.post('/secrets', async ({ request }) => {
    await delay(400);
    const { label, scope, value } = (await request.json()) as { label: string; scope: SecretRecord['scope']; value: string };
    const id = `sec_${Math.random().toString(36).slice(2, 8)}`;
    const last4 = value?.slice(-4) ?? undefined;
    const record: SecretRecord = { id, label, scope, last4, createdAt: new Date().toISOString(), value };
    mockSecrets.push(record);
    return HttpResponse.json({ id, label, scope, last4, createdAt: record.createdAt, value }, { status: 201 });
  }),

  // Resolve secret for execution (server-side only; UI should never call this directly)
  http.post('/internal/resolve-secret', async ({ request }) => {
    await delay(120);
    const { id } = (await request.json()) as { id: string };
    const found = mockSecrets.find((s) => s.id === id);
    if (!found) {
      return new HttpResponse(null, { status: 404 });
    }
    // Simulate privileged resolution
    return HttpResponse.json({ id, value: found.value ?? 'REDACTED' });
  }),
];


