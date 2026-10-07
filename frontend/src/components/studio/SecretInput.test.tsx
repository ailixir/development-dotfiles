import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import SecretInput from './SecretInput';
import secretsApi from '@/services/api/secretsApi';
import { APP_CONFIG } from '@utils/constants/appConfig';

/**
 * studio-vault-secrets (spec D15, AC-FE-1, AC-FE-2): the picker is scoped to one saved test and
 * stores the secret's NAME as the reference.
 *
 * The list and create routes are `/studio/tests/{id}/secrets`. The list holds names only. A created
 * secret's value goes to the server once, is cleared from the dialog afterwards, and never reaches
 * the browser console, even with `debugMode` on. Nothing is written to localStorage.
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

const server = setupServer(listHandler, createHandler);
server.events.on('request:start', ({ request }) => {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
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
  window.localStorage.clear();
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
