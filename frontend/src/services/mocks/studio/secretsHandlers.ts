import { http, HttpResponse } from 'msw';

/**
 * MSW mirror of the two secrets operations (`listTestSecrets`, `createTestSecret`; STUDIO-OBS-008
 * AC-5(b)/(c), plan "L4"). Composed into the studio handler set by L2a at F1; this file is not
 * wired into `handlers.ts` by itself.
 *
 * Never-echo (design I-B6, oracle C-7): the mirror stores a name, a version and the normalized
 * origins per test, and **never the value**. The create answer is exactly `{name, version,
 * allowedOrigins}`, and no refusal message quotes the body.
 *
 * Not mirrored: CSI authorization (`403`) and the malformed-id `400`, which the other studio
 * handlers do not mirror either, and Vault outages (`503`), which a test adds with `server.use`.
 */

const BASE = '*/api/v1/studio';

/** `openapi.yaml` `StudioSecretName.pattern`, with `.` and `..` refused (`CreateStudioSecretRequest.name`). */
const SECRET_NAME = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,64}$/u;
/**
 * `CreateStudioSecretRequest` bounds. The value bound is 4096 (OBS-007 AC-12, `StudioSecretsService`),
 * with the contract corrected to match by STUDIO-OBS-008 W1 §5.
 */
const MAX_VALUE_LENGTH = 4096;
const MAX_ORIGINS = 16;
const MAX_ORIGIN_LENGTH = 512;
const MAX_BODY_BYTES = 64 * 1024;
const BODY_KEYS = ['allowedOrigins', 'name', 'value'];

interface StoredSecret {
  version: string;
  allowedOrigins: string[];
}

/** testId → name → stored entry. Values are never kept. */
const store = new Map<string, Map<string, StoredSecret>>();

export function resetSecretsMocks(): void {
  store.clear();
}

/** Seeds stored names for a test (no value: the mirror never has one). */
export function seedSecretNames(testId: string, names: readonly string[]): void {
  const entries = store.get(testId) ?? new Map<string, StoredSecret>();
  for (const name of names) {
    entries.set(name, { version: '1', allowedOrigins: ['https://login.app.example'] });
  }
  store.set(testId, entries);
}

const refusal = (error: string, message: string, status: number) =>
  HttpResponse.json({ error, message }, { status });

const invalidRequest = () =>
  refusal(
    'INVALID_SECRET_REQUEST',
    'The body must be a JSON object with exactly name, value and allowedOrigins',
    400,
  );

/**
 * `SecretOrigins` normalization: `http`/`https` only, no credentials, path, query or fragment, the
 * scheme and host lowercased and a default port dropped. `null` refuses the entry.
 */
function normalizeOrigin(candidate: string): string | null {
  if (candidate.length === 0 || candidate.length > MAX_ORIGIN_LENGTH || candidate.includes(',')) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.search !== '' || url.hash !== '' || candidate.includes('?') || candidate.includes('#')) return null;
  if (url.pathname !== '/') return null;
  if (url.hostname === '') return null;
  return url.origin;
}

function normalizeOrigins(origins: unknown): string[] | null {
  if (!Array.isArray(origins) || origins.length === 0 || origins.length > MAX_ORIGINS) return null;
  const normalized: string[] = [];
  for (const origin of origins) {
    if (typeof origin !== 'string') return null;
    const value = normalizeOrigin(origin.trim());
    if (value === null || normalized.includes(value)) return null;
    normalized.push(value);
  }
  return normalized;
}

export const secretsHandlers = [
  http.get(`${BASE}/tests/:id/secrets`, ({ params }) => {
    const entries = store.get(String(params.id));
    const names = entries ? [...entries.keys()].sort() : [];
    return HttpResponse.json({ data: names.map((name) => ({ name })) });
  }),

  http.post(`${BASE}/tests/:id/secrets`, async ({ params, request }) => {
    const raw = await request.text();
    if (raw.length === 0 || new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return invalidRequest();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return invalidRequest();
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return invalidRequest();
    const fields = body as Record<string, unknown>;
    const keys = Object.keys(fields).sort();
    if (keys.length !== BODY_KEYS.length || keys.some((key, index) => key !== BODY_KEYS[index])) {
      return invalidRequest();
    }
    if (typeof fields.name !== 'string' || typeof fields.value !== 'string') return invalidRequest();

    if (!SECRET_NAME.test(fields.name)) {
      return refusal(
        'INVALID_SECRET_NAME',
        "name must be 1 to 64 characters of A-Z, a-z, 0-9, '_', '.' or '-', and not '.' or '..'",
        400,
      );
    }
    if (fields.value.length === 0 || fields.value.length > MAX_VALUE_LENGTH) {
      return refusal(
        'INVALID_SECRET_VALUE',
        `value is required and must be at most ${MAX_VALUE_LENGTH} characters`,
        400,
      );
    }
    const allowedOrigins = normalizeOrigins(fields.allowedOrigins);
    if (allowedOrigins === null) {
      return refusal(
        'INVALID_SECRET_ORIGINS',
        'allowedOrigins must be 1 to 16 distinct http or https origins, with no path, query or credentials',
        400,
      );
    }

    const testId = String(params.id);
    const entries = store.get(testId) ?? new Map<string, StoredSecret>();
    if (entries.has(fields.name)) {
      return refusal('SECRET_ALREADY_EXISTS', 'A secret with this name already exists for this test', 409);
    }
    const stored: StoredSecret = { version: '1', allowedOrigins };
    entries.set(fields.name, stored);
    store.set(testId, entries);
    return HttpResponse.json(
      { name: fields.name, version: stored.version, allowedOrigins: [...stored.allowedOrigins] },
      { status: 201 },
    );
  }),
];

export default secretsHandlers;
