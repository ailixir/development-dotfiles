import fs from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import Ajv2020 from 'ajv/dist/2020';
import { parse as parseYaml } from 'yaml';
import SecretInput, { CreateSecretDialog } from './SecretInput';
import secretsApi from '@/services/api/secretsApi';
import apiClient from '@/services/api/apiClient';
import { resetSecretsMocks, secretsHandlers, seedSecretNames } from '@/services/mocks/studio/secretsHandlers';
import { APP_CONFIG } from '@utils/constants/appConfig';

/**
 * studio-vault-secrets (spec D15, AC-FE-1, AC-FE-2): the picker is scoped to one saved test and
 * stores the secret's NAME as the reference.
 *
 * The list and create routes are `/studio/tests/{id}/secrets`. The list holds names only. A created
 * secret's value goes to the server once, is cleared from the dialog afterwards, and never reaches
 * the browser console, even with `debugMode` on. Nothing is written to localStorage.
 *
 * STUDIO-OBS-008 L4 (AC-5(c), design I-B6, oracle C-7) adds the MSW mirror `secretsHandlers`: it
 * answers a create with exactly `{name, version, allowedOrigins}`, never stores or echoes the value,
 * and its bodies validate against the `openapi.yaml` schemas. The create dialog is shared with the
 * reference picker and passes on only those three fields.
 */

const TEST_ID = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const SECRETS_ROUTE = '*/api/v1/studio/tests/:id/secrets';

const observed: Array<{ method: string; path: string }> = [];
const created: Array<Record<string, unknown>> = [];

const listHandler = http.get(SECRETS_ROUTE, () =>
  HttpResponse.json({ data: [{ name: 'EXISTING_PW' }] }),
);
const createHandler = http.post(SECRETS_ROUTE, async ({ request }) => {
  const body = (await request.json()) as Record<string, unknown>;
  created.push(body);
  return HttpResponse.json(
    { name: body.name, version: '1', allowedOrigins: body.allowedOrigins },
    { status: 201 },
  );
});
const errorOnCreate = (status: number, error: string) =>
  http.post(SECRETS_ROUTE, async ({ request }) => {
    created.push((await request.json()) as Record<string, unknown>);
    return HttpResponse.json({ error, message: 'refused' }, { status });
  });

const mockedBodies: Array<Promise<string>> = [];

const server = setupServer(listHandler, createHandler);
server.events.on('request:start', ({ request }) => {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
});
server.events.on('response:mocked', ({ response }) => {
  mockedBodies.push(response.clone().text());
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
// No per-keystroke timer: typing speed is not under test, and each delayed keystroke cost a macrotask.
let user: ReturnType<typeof userEvent.setup>;
beforeEach(() => {
  user = userEvent.setup({ delay: null });
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  observed.length = 0;
  created.length = 0;
  mockedBodies.length = 0;
  resetSecretsMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterAll(() => server.close());

async function openCreateDialog() {
  await user.click(screen.getByRole('combobox'));
  const listbox = await screen.findByRole('listbox');
  await within(listbox).findByText('EXISTING_PW');
  await user.click(within(listbox).getByText('+ Create new secret…'));
  return screen.findByRole('dialog');
}

/** Pastes each field (one input event each): the tests check the values, not per-character typing. */
async function fillField(field: HTMLElement, text: string) {
  await user.click(field);
  await user.paste(text);
}

async function fillDialog(dialog: HTMLElement, fields: { name: string; value: string; origins: string }) {
  await fillField(within(dialog).getByLabelText('Name'), fields.name);
  await fillField(within(dialog).getByLabelText('Value'), fields.value);
  await fillField(within(dialog).getByLabelText('Allowed origins'), fields.origins);
}

describe('SecretInput', () => {
  it('is disabled without a test id and sends no request', async () => {
    render(<SecretInput label="Select secret" testId={null} value={null} onChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Save the test before adding secrets')).toBeVisible();
    // Give any stray effect a chance to fire before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(observed).toEqual([]);
  });

  it('shows the caller-supplied hint while disabled', () => {
    render(
      <SecretInput label="Select secret" testId={null} disabledHint="Select a Studio test first" value={null} onChange={vi.fn()} />,
    );
    expect(screen.getByText('Select a Studio test first')).toBeVisible();
  });

  it('lists the names under the test, creates by name, and clears the value afterwards', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const onChange = vi.fn();
    render(<SecretInput label="Select secret" testId={TEST_ID} value={null} onChange={onChange} />);

    const dialog = await openCreateDialog();
    expect(observed).toEqual([{ method: 'GET', path: `/api/v1/studio/tests/${TEST_ID}/secrets` }]);
    expect(within(dialog).queryByLabelText('Label')).toBeNull();
    expect(within(dialog).queryByLabelText('Scope')).toBeNull();

    await fillDialog(dialog, {
      name: 'LOGIN_PW',
      value: 's3cret-value',
      origins: 'https://login.app.example, https://sso.app.example',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ id: 'LOGIN_PW' }));
    expect(created).toEqual([
      {
        name: 'LOGIN_PW',
        value: 's3cret-value',
        allowedOrigins: ['https://login.app.example', 'https://sso.app.example'],
      },
    ]);
    expect(observed.filter((entry) => entry.method === 'POST')).toEqual([
      { method: 'POST', path: `/api/v1/studio/tests/${TEST_ID}/secrets` },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(JSON.stringify(onChange.mock.calls)).not.toContain('s3cret-value');
    expect(setItem).not.toHaveBeenCalled();

    // The value state is gone: reopening the dialog shows empty fields.
    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('LOGIN_PW')).toBeInTheDocument();
    await user.click(within(listbox).getByText('+ Create new secret…'));
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).getByLabelText('Value')).toHaveValue('');
    // Two full dialog round-trips (open, fill, create, close, reopen) are inherent to what this
    // asserts; already delay-free and paste-filled (VAL-002), it still timed out once at 5s under
    // full-suite load (VAL-032).
  }, 15000);

  it('keeps Create disabled until the name, value and origins are all valid', async () => {
    render(<SecretInput label="Select secret" testId={TEST_ID} value={null} onChange={vi.fn()} />);
    const dialog = await openCreateDialog();
    const create = within(dialog).getByRole('button', { name: 'Create' });

    await fillDialog(dialog, { name: 'bad/name', value: 'v', origins: 'https://login.app.example' });
    expect(create).toBeDisabled();
    expect(within(dialog).getByText(/Use 1-64 letters/)).toBeVisible();

    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await fillField(name, '..');
    expect(create).toBeDisabled();

    await user.clear(name);
    await fillField(name, 'LOGIN_PW');
    expect(create).toBeEnabled();

    await user.clear(within(dialog).getByLabelText('Allowed origins'));
    expect(create).toBeDisabled();
    expect(created).toEqual([]);
  });

  it.each([
    [409, 'SECRET_ALREADY_EXISTS', 'A secret with this name already exists for this test.'],
    [503, 'VAULT_NOT_CONFIGURED', 'Vault is not connected for this environment.'],
    [503, 'VAULT_UNAVAILABLE', 'Vault is temporarily unavailable. Try again.'],
    [400, 'INVALID_SECRET_ORIGINS', 'The secret was rejected: check the name, value and origins.'],
  ])('maps a %i %s on create to its message and clears the value', async (status, code, text) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    server.use(errorOnCreate(status, code));
    const onChange = vi.fn();
    render(<SecretInput label="Select secret" testId={TEST_ID} value={null} onChange={onChange} />);
    const dialog = await openCreateDialog();
    await fillDialog(dialog, { name: 'LOGIN_PW', value: 's3cret-value', origins: 'https://login.app.example' });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await within(dialog).findByText(text)).toBeVisible();
    expect(within(dialog).getByLabelText('Value')).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
  });

  it('asks for the list once when Vault is not configured (no retry)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.get(SECRETS_ROUTE, () =>
        HttpResponse.json({ error: 'VAULT_NOT_CONFIGURED', message: 'refused' }, { status: 503 }),
      ),
    );
    render(<SecretInput label="Select secret" testId={TEST_ID} value={null} onChange={vi.fn()} />);

    // apiClient rejects only after its retries, so seeing the message with one request proves none ran.
    expect(await screen.findByText('Vault is not connected for this environment.')).toBeVisible();
    expect(observed.filter((entry) => entry.method === 'GET')).toHaveLength(1);
  });

  describe('the value never reaches the console (F19, NFR-1)', () => {
    const CANARY = 'Canary-7f3a9c1e-value';
    const originalDebugMode = APP_CONFIG.debugMode;

    afterEach(() => {
      (APP_CONFIG as { debugMode: boolean }).debugMode = originalDebugMode;
    });

    /** Every console argument, serialized. Errors keep their own fields; cycles are cut. */
    const serializeCalls = (calls: unknown[][]) => {
      const seen = new WeakSet<object>();
      return JSON.stringify(calls, (_key, value: unknown) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[circular]';
          seen.add(value);
          if (value instanceof Error) return { ...value, message: value.message, stack: value.stack };
        }
        return value;
      });
    };

    it.each([
      [201, null],
      [409, 'SECRET_ALREADY_EXISTS'],
      [503, 'VAULT_NOT_CONFIGURED'],
    ])('on a %i create with debugMode on', async (status, code) => {
      (APP_CONFIG as { debugMode: boolean }).debugMode = true;
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      if (code) server.use(errorOnCreate(status, code));

      render(<SecretInput label="Select secret" testId={TEST_ID} value={null} onChange={vi.fn()} />);
      const dialog = await openCreateDialog();
      await fillDialog(dialog, { name: 'LOGIN_PW', value: CANARY, origins: 'https://login.app.example' });
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(created).toHaveLength(1));
      if (code) {
        await within(dialog).findByRole('alert');
      } else {
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      }

      // The value did travel to the server, and the debug log did run for this request.
      expect(created[0].value).toBe(CANARY);
      expect(log.mock.calls.some(([first]) => String(first).startsWith('API Request: POST'))).toBe(true);
      for (const spy of [log, error, warn]) {
        expect(serializeCalls(spy.mock.calls)).not.toContain(CANARY);
      }
    });

    it('a rejected create keeps no request body on its error', async () => {
      (APP_CONFIG as { debugMode: boolean }).debugMode = true;
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      server.use(errorOnCreate(409, 'SECRET_ALREADY_EXISTS'));

      const failure = await secretsApi
        .createSecret(TEST_ID, { name: 'LOGIN_PW', value: CANARY, allowedOrigins: ['https://login.app.example'] })
        .then(
          () => null,
          (rejected: unknown) => rejected as Error & { response?: { status: number; config?: { data?: unknown } } },
        );

      expect(failure).toBeInstanceOf(Error);
      expect(failure?.message).toBe('SECRET_ALREADY_EXISTS');
      expect(failure?.response?.status).toBe(409);
      expect(failure?.response?.config).toBeDefined();
      expect(failure?.response?.config?.data).toBeUndefined();
      expect(serializeCalls([[failure]])).not.toContain(CANARY);
    });
  });
});

// ---------------------------------------------------------------------------
// STUDIO-OBS-008 L4: the MSW mirror and the shared create dialog
// ---------------------------------------------------------------------------

const SPEC_DIR = path.resolve(__dirname, '../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8')) as {
  components: { schemas: Record<string, unknown> };
};
const ajv = new Ajv2020({ strict: false, allErrors: true });
const contractSchemas = Object.fromEntries(
  ['StudioSecretName', 'StudioSecretList', 'StudioSecret', 'ErrorResponse'].map((name) => [
    name,
    openapi.components.schemas[name],
  ]),
);
const validatorFor = (name: string) =>
  ajv.compile({ $ref: `#/components/schemas/${name}`, components: { schemas: contractSchemas } });
const validStudioSecret = validatorFor('StudioSecret');
const validStudioSecretList = validatorFor('StudioSecretList');
const validErrorResponse = validatorFor('ErrorResponse');

const MIRROR_CANARY = 'Canary-L4-mirror-5c1d0e88-value';
/** The value bound (OBS-007 AC-12; STUDIO-OBS-008 W1 §5): 4096 is accepted, 4097 refused. */
const VALUE_BOUND = 4096;
const VALUE_4096 = `${MIRROR_CANARY}${'x'.repeat(VALUE_BOUND - MIRROR_CANARY.length)}`;
const VALUE_4097 = `${VALUE_4096}x`;
const OTHER_TEST_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

/** Every accessible name currently in the document, hidden elements included. */
const ACCESSIBLE_ROLES = [
  'alert', 'button', 'combobox', 'dialog', 'heading', 'listbox', 'option', 'presentation', 'textbox',
] as const;
function accessibleNames(): string[] {
  const names: string[] = [];
  for (const role of ACCESSIBLE_ROLES) {
    screen.queryAllByRole(role, {
      hidden: true,
      name: (name) => {
        names.push(name);
        return true;
      },
    });
  }
  return names;
}

function expectNoMirrorCanaryOnScreen() {
  expect(document.body.innerHTML).not.toContain(MIRROR_CANARY);
  for (const input of Array.from(document.querySelectorAll('input, textarea'))) {
    expect((input as HTMLInputElement).value).not.toContain(MIRROR_CANARY);
  }
  expect(accessibleNames().join('\n')).not.toContain(MIRROR_CANARY);
  const storage = [window.localStorage, window.sessionStorage]
    .flatMap((store) => Object.keys(store).map((key) => `${key}=${store.getItem(key) ?? ''}`))
    .join('\n');
  expect(storage).not.toContain(MIRROR_CANARY);
}

/** Rejects with apiClient's normalized error: `message` is the code, `response` the answer. */
async function refusalOf(call: Promise<unknown>) {
  return call.then(
    () => {
      throw new Error('expected a refusal');
    },
    (failure: unknown) => failure as Error & { response?: { status: number; data?: unknown } },
  );
}

describe('secretsHandlers (MSW mirror): never echoes the value and matches the contract', () => {
  const secretsPath = (testId: string) => `/studio/tests/${testId}/secrets`;

  beforeEach(() => {
    server.use(...secretsHandlers);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('answers a create with exactly {name, version, allowedOrigins}, normalized, and lists names only', async () => {
    const answer = await secretsApi.createSecret(TEST_ID, {
      name: 'LOGIN_PW',
      value: MIRROR_CANARY,
      allowedOrigins: ['HTTPS://Login.App.Example:443', 'http://sso.app.example:8080/'],
    });

    expect(answer).toEqual({
      name: 'LOGIN_PW',
      version: '1',
      allowedOrigins: ['https://login.app.example', 'http://sso.app.example:8080'],
    });
    expect(Object.keys(answer).sort()).toEqual(['allowedOrigins', 'name', 'version']);
    expect(validStudioSecret(answer), JSON.stringify(validStudioSecret.errors)).toBe(true);

    const list = await secretsApi.listSecrets(TEST_ID);
    expect(list).toEqual({ data: [{ name: 'LOGIN_PW' }] });
    expect(validStudioSecretList(list), JSON.stringify(validStudioSecretList.errors)).toBe(true);
    expect(await secretsApi.listSecrets(OTHER_TEST_ID)).toEqual({ data: [] });

    expect((await Promise.all(mockedBodies)).join('\n')).not.toContain(MIRROR_CANARY);
  });

  it('accepts a value of exactly 4096 characters and refuses 4097 (W1 §5)', async () => {
    expect(VALUE_4096).toHaveLength(4096);
    expect(VALUE_4097).toHaveLength(4097);

    const refused = await refusalOf(
      secretsApi.createSecret(TEST_ID, { name: 'LONG_PW', value: VALUE_4097, allowedOrigins: ['https://login.app.example'] }),
    );
    expect(refused.message).toBe('INVALID_SECRET_VALUE');
    expect(refused.response?.status).toBe(400);
    expect(await secretsApi.listSecrets(TEST_ID)).toEqual({ data: [] });

    const answer = await secretsApi.createSecret(TEST_ID, {
      name: 'LONG_PW',
      value: VALUE_4096,
      allowedOrigins: ['https://login.app.example'],
    });
    expect(answer).toEqual({ name: 'LONG_PW', version: '1', allowedOrigins: ['https://login.app.example'] });
    expect((await Promise.all(mockedBodies)).join('\n')).not.toContain(MIRROR_CANARY);
  });

  it('lists the stored names sorted, one entry each', async () => {
    seedSecretNames(TEST_ID, ['SSO_TOTP_SEED', 'LOGIN_PW']);
    expect(await secretsApi.listSecrets(TEST_ID)).toEqual({ data: [{ name: 'LOGIN_PW' }, { name: 'SSO_TOTP_SEED' }] });
  });

  it.each([
    ['a dot-dot name', 'INVALID_SECRET_NAME', { name: '..', value: MIRROR_CANARY, allowedOrigins: ['https://login.app.example'] }],
    ['a name outside the grammar', 'INVALID_SECRET_NAME', { name: 'LOGIN PW', value: MIRROR_CANARY, allowedOrigins: ['https://login.app.example'] }],
    ['an empty value', 'INVALID_SECRET_VALUE', { name: 'LOGIN_PW', value: '', allowedOrigins: ['https://login.app.example'] }],
    ['a value of 4097 characters', 'INVALID_SECRET_VALUE', { name: 'LOGIN_PW', value: VALUE_4097, allowedOrigins: ['https://login.app.example'] }],
    ['no origin', 'INVALID_SECRET_ORIGINS', { name: 'LOGIN_PW', value: MIRROR_CANARY, allowedOrigins: [] }],
    ['an origin with a path', 'INVALID_SECRET_ORIGINS', { name: 'LOGIN_PW', value: MIRROR_CANARY, allowedOrigins: ['https://login.app.example/sign-in'] }],
    ['an origin with credentials', 'INVALID_SECRET_ORIGINS', { name: 'LOGIN_PW', value: MIRROR_CANARY, allowedOrigins: ['https://user:pw@login.app.example'] }],
    ['a non-http origin', 'INVALID_SECRET_ORIGINS', { name: 'LOGIN_PW', value: MIRROR_CANARY, allowedOrigins: ['ftp://login.app.example'] }],
    ['a duplicate origin', 'INVALID_SECRET_ORIGINS', { name: 'LOGIN_PW', value: MIRROR_CANARY, allowedOrigins: ['https://login.app.example', 'https://LOGIN.app.example:443'] }],
    ['a field the schema does not name', 'INVALID_SECRET_REQUEST', { name: 'LOGIN_PW', value: MIRROR_CANARY, allowedOrigins: ['https://login.app.example'], label: 'x' }],
    ['a missing field', 'INVALID_SECRET_REQUEST', { name: 'LOGIN_PW', value: MIRROR_CANARY }],
    ['a non-string value', 'INVALID_SECRET_REQUEST', { name: 'LOGIN_PW', value: 42, allowedOrigins: ['https://login.app.example'] }],
  ])('refuses %s with 400 %s, stores nothing and quotes no value', async (_label, code, body) => {
    const failure = await refusalOf(apiClient.post(secretsPath(TEST_ID), body, { redactBody: true }));

    expect(failure.message).toBe(code);
    expect(failure.response?.status).toBe(400);
    expect(validErrorResponse(failure.response?.data), JSON.stringify(validErrorResponse.errors)).toBe(true);
    expect(JSON.stringify(failure.response?.data)).not.toContain(MIRROR_CANARY);
    expect(await secretsApi.listSecrets(TEST_ID)).toEqual({ data: [] });
    expect((await Promise.all(mockedBodies)).join('\n')).not.toContain(MIRROR_CANARY);
  });

  it('refuses a second create of the same name with 409 and leaves the first unchanged', async () => {
    await secretsApi.createSecret(TEST_ID, { name: 'LOGIN_PW', value: 'first', allowedOrigins: ['https://login.app.example'] });
    const failure = await refusalOf(
      secretsApi.createSecret(TEST_ID, { name: 'LOGIN_PW', value: MIRROR_CANARY, allowedOrigins: ['https://other.app.example'] }),
    );

    expect(failure.message).toBe('SECRET_ALREADY_EXISTS');
    expect(failure.response?.status).toBe(409);
    expect(validErrorResponse(failure.response?.data)).toBe(true);
    expect(await secretsApi.listSecrets(TEST_ID)).toEqual({ data: [{ name: 'LOGIN_PW' }] });
    expect((await Promise.all(mockedBodies)).join('\n')).not.toContain(MIRROR_CANARY);
  });

  it('SecretInput on the mirror: the value is cleared and shown nowhere, the ID is selected', async () => {
    function Host() {
      const [selected, setSelected] = useState<{ id: string } | null>(null);
      return <SecretInput label="Select secret" testId={TEST_ID} value={selected} onChange={setSelected} />;
    }
    render(<Host />);
    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByText('+ Create new secret…'));
    const dialog = await screen.findByRole('dialog');
    await fillDialog(dialog, { name: 'LOGIN_PW', value: MIRROR_CANARY, origins: 'https://login.app.example' });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('combobox')).toHaveTextContent('LOGIN_PW');
    expectNoMirrorCanaryOnScreen();
    expect((await Promise.all(mockedBodies)).join('\n')).not.toContain(MIRROR_CANARY);
  }, 15000);
});

describe('CreateSecretDialog (shared with the reference picker)', () => {
  it('passes on only {name, version, allowedOrigins}, even if a create answer carried more', async () => {
    server.use(
      http.post(SECRETS_ROUTE, () =>
        HttpResponse.json(
          { name: 'LOGIN_PW', version: '3', allowedOrigins: ['https://login.app.example'], value: MIRROR_CANARY },
          { status: 201 },
        ),
      ),
    );
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<CreateSecretDialog open testId={TEST_ID} onClose={onClose} onCreated={onCreated} />);
    const dialog = screen.getByRole('dialog');
    await fillDialog(dialog, { name: 'LOGIN_PW', value: 'typed-value', origins: 'https://login.app.example' });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith({ name: 'LOGIN_PW', version: '3', allowedOrigins: ['https://login.app.example'] });
    expect(Object.keys(onCreated.mock.calls[0][0] as object).sort()).toEqual(['allowedOrigins', 'name', 'version']);
    expect(JSON.stringify(onCreated.mock.calls)).not.toContain(MIRROR_CANARY);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByLabelText('Value')).toHaveValue('');
  });

  it('caps the value field at 4096 characters and creates a 4096-character secret (W1 §5)', async () => {
    server.use(...secretsHandlers);
    const onCreated = vi.fn();
    render(<CreateSecretDialog open testId={TEST_ID} onClose={vi.fn()} onCreated={onCreated} />);
    const dialog = screen.getByRole('dialog');
    const value = within(dialog).getByLabelText('Value');
    expect(value).toHaveAttribute('maxlength', String(VALUE_BOUND));

    // A 4097th character does not get in.
    await fillField(value, VALUE_4097);
    expect(value).toHaveValue(VALUE_4096);
    await user.clear(value);

    await fillDialog(dialog, { name: 'LONG_PW', value: VALUE_4096, origins: 'https://login.app.example' });
    expect(value).toHaveValue(VALUE_4096);
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ name: 'LONG_PW', version: '1', allowedOrigins: ['https://login.app.example'] }),
    );
    expect(within(dialog).getByLabelText('Value')).toHaveValue('');
  });

  it('keeps Create disabled without a persisted test, and sends nothing', async () => {
    render(<CreateSecretDialog open testId={null} onClose={vi.fn()} onCreated={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    await fillDialog(dialog, { name: 'LOGIN_PW', value: 'typed-value', origins: 'https://login.app.example' });
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(observed).toEqual([]);
  });

  it('does not render the struck secret-fill copy (ruling A2)', () => {
    render(<CreateSecretDialog open testId={TEST_ID} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText(/password box/iu)).toBeNull();
  });
});
