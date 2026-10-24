import fs from 'node:fs';
import path from 'node:path';
import React, { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextField } from '@mui/material';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { parse as parseYaml } from 'yaml';
import { ReferencePicker, insertAtSelection, type InsertedReference } from '.';
import OnboardingCoach from '@/components/studio/OnboardingCoach';
import { resetSecretsMocks, secretsHandlers, seedSecretNames } from '@/services/mocks/studio/secretsHandlers';
import {
  useStudioCapabilities,
  vaultSecretsEnabled,
  type StudioCapabilitiesState,
} from '@/utils/config/studioCapabilities';
import type { StudioCapabilities } from '@/types/studio/studioGuidedTypes';
import { APP_CONFIG } from '@utils/constants/appConfig';

/**
 * STUDIO-OBS-008 lane L4 (AC-5): the runtime capability hook, the reference insert menu, and the
 * onboarding copy that follows the capability.
 *
 * - Capability off / on / unknown / error: `useStudioCapabilities` and every consumer here.
 * - D-8: a picked secret is inserted as `<secret ID>` with ID the Vault name `listTestSecrets`
 *   returned (or the create answer's name), never an alias.
 * - Never-echo (design I-B6, I-C11; oracles C-7/C-12, UI halves this lane owns): a secret value
 *   created through "New secret…" is absent from the DOM, input values, accessible names, the
 *   insert payload, browser storage, the console (debug log on) and the MSW responses, while the
 *   ID is present.
 * - Ruling A2: the struck secret-fill sentence is rendered nowhere in this lane.
 *
 * The capability payloads are the `getStudioTestCapabilities` examples of `openapi.yaml`, read from
 * the document, not written here.
 */

const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, { get: { responses: Record<string, { content: Record<string, { examples: Record<string, { value: unknown }> }> }> } }>;
};
const capabilityExamples =
  openapi.paths['/tests/{id}/capabilities'].get.responses['200'].content['application/json'].examples;
const CAP_ON = capabilityExamples.vaultAndGuidedStart.value as StudioCapabilities;
const CAP_OFF = capabilityExamples.vaultOffGuidedStartIncompatible.value as StudioCapabilities;
const CAP_ON_FORBIDDEN_SCOPE = capabilityExamples.guidedStartForbiddenScope.value as StudioCapabilities;

/** The examples' own test id. */
const TEST_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TEST_ID = '22222222-2222-4222-8222-222222222222';
const CAPABILITIES_ROUTE = '*/api/v1/studio/tests/:id/capabilities';
const SECRETS_ROUTE = '*/api/v1/studio/tests/:id/secrets';

const CANARY = 'Canary-L4-9b2e7d41-value';
/** T0 ruling A2: struck from 008. */
const STRUCK_SECRET_FILL_COPY = 'Secrets can only be typed into a password box.';

const ON: StudioCapabilitiesState = { status: 'ready', capabilities: CAP_ON };
const OFF: StudioCapabilitiesState = { status: 'ready', capabilities: CAP_OFF };
const UNKNOWN: StudioCapabilitiesState = { status: 'unknown', capabilities: null };
const LOADING: StudioCapabilitiesState = { status: 'loading', capabilities: null };
const UNAVAILABLE: StudioCapabilitiesState = { status: 'unavailable', capabilities: null };

const observed: Array<{ method: string; path: string }> = [];
const mockedBodies: Array<Promise<string>> = [];

const server = setupServer(
  ...secretsHandlers,
  http.get(CAPABILITIES_ROUTE, () => HttpResponse.json(CAP_ON)),
);
server.events.on('request:start', ({ request }) => {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
});
server.events.on('response:mocked', ({ response }) => {
  mockedBodies.push(response.clone().text());
});

const requestsTo = (suffix: string) => observed.filter((entry) => entry.path.endsWith(suffix));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
let user: ReturnType<typeof userEvent.setup>;
beforeEach(() => {
  user = userEvent.setup({ delay: null });
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  resetSecretsMocks();
  observed.length = 0;
  mockedBodies.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterAll(() => server.close());

/** Every accessible name currently in the document, hidden elements included. */
const ACCESSIBLE_ROLES = [
  'alert', 'button', 'combobox', 'dialog', 'group', 'heading', 'listbox', 'menu', 'menuitem',
  'option', 'presentation', 'region', 'status', 'textbox', 'tooltip',
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

function storageText(): string {
  const dump = (storage: Storage) =>
    Object.keys(storage).map((key) => `${key}=${storage.getItem(key) ?? ''}`).join('\n');
  return `${dump(window.localStorage)}\n${dump(window.sessionStorage)}`;
}

/** Every console argument, serialized. Errors keep their own fields; cycles are cut. */
function serializeCalls(calls: unknown[][]): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(calls, (_key, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      if (value instanceof Error) return { ...value, message: value.message, stack: value.stack };
    }
    return value;
  });
}

function expectNoCanaryOnScreen() {
  expect(document.body.innerHTML).not.toContain(CANARY);
  for (const input of Array.from(document.querySelectorAll('input, textarea'))) {
    expect((input as HTMLInputElement).value).not.toContain(CANARY);
  }
  expect(accessibleNames().join('\n')).not.toContain(CANARY);
  expect(storageText()).not.toContain(CANARY);
}

async function openPicker() {
  await user.click(screen.getByRole('button', { name: 'Insert reference' }));
  return screen.findByRole('menu');
}

// ---------------------------------------------------------------------------
// useStudioCapabilities
// ---------------------------------------------------------------------------

describe('useStudioCapabilities (P1: off / on / unknown / error)', () => {
  it('is unknown without a persisted test id and asks nothing', async () => {
    const { result } = renderHook(() => useStudioCapabilities(null));
    expect(result.current).toEqual(UNKNOWN);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(observed).toEqual([]);
    expect(vaultSecretsEnabled(result.current)).toBe(false);
  });

  it('is on for the vaultAndGuidedStart example, read once from the per-test route', async () => {
    const { result } = renderHook(() => useStudioCapabilities(TEST_ID));
    expect(result.current).toEqual(LOADING);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.capabilities).toEqual(CAP_ON);
    expect(vaultSecretsEnabled(result.current)).toBe(true);
    expect(observed).toEqual([{ method: 'GET', path: `/api/v1/studio/tests/${TEST_ID}/capabilities` }]);
  });

  it('is off for the vaultOffGuidedStartIncompatible example', async () => {
    server.use(http.get(CAPABILITIES_ROUTE, () => HttpResponse.json(CAP_OFF)));
    const { result } = renderHook(() => useStudioCapabilities(TEST_ID));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.capabilities?.vaultSecrets).toBe(false);
    expect(vaultSecretsEnabled(result.current)).toBe(false);
  });

  it('keeps vaultSecrets independent of guidedStart (guidedStartForbiddenScope example)', async () => {
    server.use(http.get(CAPABILITIES_ROUTE, () => HttpResponse.json(CAP_ON_FORBIDDEN_SCOPE)));
    const { result } = renderHook(() => useStudioCapabilities(TEST_ID));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(vaultSecretsEnabled(result.current)).toBe(true);
    expect(result.current.capabilities?.guidedStart).toEqual({ available: false, code: 'FORBIDDEN_SCOPE' });
  });

  it.each([
    [401, { error: { code: 'UNAUTHORIZED', message: 'No session' } }],
    [403, { error: 'STUDIO_FORBIDDEN', message: 'refused' }],
    [400, { error: 'INVALID_ID', message: 'refused' }],
    [500, { error: 'INTERNAL', message: 'refused' }],
  ])('is unavailable on a %i, asked once (no retry), and never simulated', async (status, body) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    server.use(http.get(CAPABILITIES_ROUTE, () => HttpResponse.json(body, { status })));
    const { result } = renderHook(() => useStudioCapabilities(TEST_ID));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.capabilities).toBeNull();
    expect(vaultSecretsEnabled(result.current)).toBe(false);
    expect(requestsTo('/capabilities')).toHaveLength(1);
  });

  it('is unavailable on a network error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(http.get(CAPABILITIES_ROUTE, () => HttpResponse.error()));
    const { result } = renderHook(() => useStudioCapabilities(TEST_ID));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(requestsTo('/capabilities')).toHaveLength(1);
  });

  it.each([
    ['a non-boolean vaultSecrets', { vaultSecrets: 'true', guidedStart: { available: false, code: 'RUNTIME_INCOMPATIBLE' } }],
    ['no guidedStart', { vaultSecrets: true }],
    ['an undeclared guidedStart code', { vaultSecrets: true, guidedStart: { available: false, code: 'SOMETHING_ELSE' } }],
    ['an available start without a context', { vaultSecrets: true, guidedStart: { available: true } }],
    ['an empty body', null],
  ])('is unavailable for a 200 with %s', async (_label, body) => {
    server.use(http.get(CAPABILITIES_ROUTE, () => HttpResponse.json(body)));
    const { result } = renderHook(() => useStudioCapabilities(TEST_ID));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(vaultSecretsEnabled(result.current)).toBe(false);
  });

  it('resets on a selection change and never shows the previous test\'s answer for the new one', async () => {
    let releaseOther: () => void = () => undefined;
    const otherGate = new Promise<void>((resolve) => {
      releaseOther = resolve;
    });
    server.use(
      http.get(CAPABILITIES_ROUTE, async ({ params }) => {
        if (params.id === OTHER_TEST_ID) {
          await otherGate;
          return HttpResponse.json(CAP_OFF);
        }
        return HttpResponse.json(CAP_ON);
      }),
    );
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useStudioCapabilities(id), {
      initialProps: { id: TEST_ID as string | null },
    });
    await waitFor(() => expect(vaultSecretsEnabled(result.current)).toBe(true));

    rerender({ id: OTHER_TEST_ID });
    expect(result.current).toEqual(LOADING);
    await act(async () => {
      releaseOther();
      await otherGate;
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(vaultSecretsEnabled(result.current)).toBe(false);

    rerender({ id: null });
    expect(result.current).toEqual(UNKNOWN);
  });

  it('drops a late answer for a test that is no longer selected', async () => {
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    server.use(
      http.get(CAPABILITIES_ROUTE, async ({ params }) => {
        if (params.id === TEST_ID) {
          await firstGate;
          return HttpResponse.json(CAP_ON);
        }
        return HttpResponse.json(CAP_OFF);
      }),
    );
    const { result, rerender } = renderHook(({ id }: { id: string }) => useStudioCapabilities(id), {
      initialProps: { id: TEST_ID },
    });
    rerender({ id: OTHER_TEST_ID });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(vaultSecretsEnabled(result.current)).toBe(false);

    await act(async () => {
      releaseFirst();
      await firstGate;
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(vaultSecretsEnabled(result.current)).toBe(false);
    expect(result.current.capabilities).toEqual(CAP_OFF);
  });
});

// ---------------------------------------------------------------------------
// ReferencePicker
// ---------------------------------------------------------------------------

function renderPicker(props: Partial<React.ComponentProps<typeof ReferencePicker>> = {}) {
  const onInsert = vi.fn<[InsertedReference], void>();
  render(
    <ReferencePicker
      testId={TEST_ID}
      variableNames={['USERNAME', 'CSI_ID']}
      capabilities={ON}
      onInsert={onInsert}
      {...props}
    />,
  );
  return onInsert;
}

describe('ReferencePicker: variables', () => {
  it('inserts <var NAME> for a declared variable', async () => {
    const onInsert = renderPicker({ capabilities: OFF });
    const menu = await openPicker();
    await user.click(within(menu).getByRole('menuitem', { name: /USERNAME/ }));
    expect(onInsert).toHaveBeenCalledWith({ kind: 'var', name: 'USERNAME', token: '<var USERNAME>' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('offers only names the token grammar can carry, once each', async () => {
    renderPicker({ variableNames: ['USERNAME', 'two words', 'USERNAME', '..', 'CSI_ID'], capabilities: OFF });
    const menu = await openPicker();
    const items = within(menu).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items.filter((text) => text?.includes('<var'))).toEqual(['USERNAME<var USERNAME>', 'CSI_ID<var CSI_ID>']);
  });

  it('says so when no variable is declared', async () => {
    renderPicker({ variableNames: [], capabilities: OFF });
    const menu = await openPicker();
    expect(within(menu).getByText('No variables yet. Add one in Variables.')).toBeVisible();
  });
});

describe('ReferencePicker: secrets follow the capability', () => {
  it.each([
    ['off', OFF, TEST_ID, 'Vault is not connected for this environment.'],
    ['unknown (unsaved test)', UNKNOWN, null, 'Save the test before adding secrets'],
    ['loading', LOADING, TEST_ID, 'Checking whether secrets are available for this test…'],
    ['error', UNAVAILABLE, TEST_ID, 'Studio could not confirm that secrets are available for this test, so they are off.'],
  ])('capability %s: says why, offers no secret and no "New secret…", reads nothing', async (_label, capabilities, testId, text) => {
    renderPicker({ capabilities, testId });
    const menu = await openPicker();
    expect(within(menu).getByText(text)).toBeVisible();
    expect(within(menu).queryByText('New secret…')).toBeNull();
    expect(within(menu).queryByText(/<secret /)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requestsTo('/secrets')).toEqual([]);
    expect(screen.queryByText(STRUCK_SECRET_FILL_COPY)).toBeNull();
  });

  it('capability on: lists the Vault names read when the menu opens and inserts <secret ID> by that name (D-8)', async () => {
    seedSecretNames(TEST_ID, ['SSO_TOTP_SEED', 'LOGIN_PW']);
    const onInsert = renderPicker();
    expect(requestsTo('/secrets')).toEqual([]);

    const menu = await openPicker();
    const item = await within(menu).findByRole('menuitem', { name: /LOGIN_PW/ });
    expect(within(item).getByText('<secret LOGIN_PW>')).toBeVisible();
    expect(requestsTo('/secrets')).toEqual([{ method: 'GET', path: `/api/v1/studio/tests/${TEST_ID}/secrets` }]);
    await user.click(item);

    expect(onInsert).toHaveBeenCalledWith({ kind: 'secret', name: 'LOGIN_PW', token: '<secret LOGIN_PW>' });

    // Read again on the next open: the list is never cached.
    await openPicker();
    await waitFor(() => expect(requestsTo('/secrets')).toHaveLength(2));
  });

  it('capability on: says so when the test has no secret yet, and still offers "New secret…"', async () => {
    renderPicker();
    const menu = await openPicker();
    expect(await within(menu).findByText('No secrets stored for this test yet.')).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'New secret…' })).toBeVisible();
  });

  it('shows the first-secret disclaimer from Insert reference and cancels without inserting or storing anything', async () => {
    const onInsert = renderPicker();
    const menu = await openPicker();
    await user.click(within(menu).getByRole('menuitem', { name: 'New secret…' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Before adding your first secret')).toBeVisible();
    expect(within(dialog).queryByLabelText('Name')).toBeNull();
    expect(within(dialog).queryByLabelText('Value')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onInsert).not.toHaveBeenCalled();
    expect(requestsTo('/secrets').every((entry) => entry.method === 'GET')).toBe(true);
  });

  it.each([
    ['VAULT_UNAVAILABLE', 'Vault is temporarily unavailable. Try again.'],
    ['VAULT_NOT_CONFIGURED', 'Vault is not connected for this environment.'],
  ])('capability on but the list answers 503 %s: shows it, once', async (code, text) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(http.get(SECRETS_ROUTE, () => HttpResponse.json({ error: code, message: 'refused' }, { status: 503 })));
    renderPicker();
    const menu = await openPicker();
    expect(await within(menu).findByText(text)).toBeVisible();
    expect(requestsTo('/secrets')).toHaveLength(1);
  });

  it('closes "New secret…" for good when the capability turns off, so it never reopens by itself', async () => {
    const onInsert = vi.fn();
    const { rerender } = render(
      <ReferencePicker testId={TEST_ID} variableNames={[]} capabilities={ON} onInsert={onInsert} />,
    );
    const menu = await openPicker();
    await user.click(within(menu).getByRole('menuitem', { name: 'New secret…' }));
    expect(await screen.findByRole('dialog')).toBeVisible();

    rerender(<ReferencePicker testId={TEST_ID} variableNames={[]} capabilities={OFF} onInsert={onInsert} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    rerender(<ReferencePicker testId={TEST_ID} variableNames={[]} capabilities={ON} onInsert={onInsert} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('inserts at the step\'s selection and keeps the surrounding text', async () => {
    seedSecretNames(TEST_ID, ['LOGIN_PW']);
    function StepEditorHost() {
      const capabilities = useStudioCapabilities(TEST_ID);
      const [text, setText] = useState('Type "" in the "Password" field');
      const inputRef = useRef<HTMLInputElement | null>(null);
      return (
        <>
          <TextField label="Step 1" value={text} onChange={(e) => setText(e.target.value)} inputRef={inputRef} />
          <ReferencePicker
            testId={TEST_ID}
            variableNames={['USERNAME']}
            capabilities={capabilities}
            onInsert={(reference) => {
              const start = inputRef.current?.selectionStart ?? text.length;
              const end = inputRef.current?.selectionEnd ?? start;
              setText(insertAtSelection(text, start, end, reference.token).text);
            }}
          />
        </>
      );
    }
    render(<StepEditorHost />);
    const step = screen.getByLabelText('Step 1') as HTMLInputElement;
    act(() => {
      step.focus();
      step.setSelectionRange(6, 6);
    });

    const menu = await openPicker();
    await user.click(await within(menu).findByRole('menuitem', { name: /LOGIN_PW/ }));
    expect(step).toHaveValue('Type "<secret LOGIN_PW>" in the "Password" field');
  });
});

describe('ReferencePicker: "New secret…" never echoes the value', () => {
  const originalDebugMode = APP_CONFIG.debugMode;
  afterEach(() => {
    (APP_CONFIG as { debugMode: boolean }).debugMode = originalDebugMode;
  });

  async function createThroughPicker(name: string) {
    const menu = await openPicker();
    await within(menu).findByText(/No secrets stored|<secret /);
    await user.click(within(menu).getByRole('menuitem', { name: 'New secret…' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).queryByText('Checking secrets for this test…')).toBeNull());
    const continueButton = within(dialog).queryByRole('button', { name: 'Continue' });
    if (continueButton) await user.click(continueButton);
    const value = within(dialog).getByLabelText('Value');
    expect(value).toHaveAttribute('type', 'password');
    expect(value).toHaveAttribute('autocomplete', 'new-password');
    await user.click(within(dialog).getByLabelText('Name'));
    await user.paste(name);
    await user.click(value);
    await user.paste(CANARY);
    await user.click(within(dialog).getByLabelText('Allowed origins'));
    await user.paste('https://login.app.example');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    return dialog;
  }

  it('on success: inserts the ID, and the value is in no DOM, name, payload, storage, log or response', async () => {
    (APP_CONFIG as { debugMode: boolean }).debugMode = true;
    const consoleSpies = (['log', 'error', 'warn', 'info', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const onInsert = renderPicker();

    await createThroughPicker('NEW_PW');
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith({ kind: 'secret', name: 'NEW_PW', token: '<secret NEW_PW>' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The value went to the server once, and the debug log did run for that request.
    expect(requestsTo('/secrets').filter((entry) => entry.method === 'POST')).toHaveLength(1);
    expect(consoleSpies[0].mock.calls.some(([first]) => String(first).startsWith('API Request: POST'))).toBe(true);

    // Reopen the create dialog, so the screen checks below run with its fields mounted: the value
    // left no state behind.
    const again = await openPicker();
    await user.click(within(again).getByRole('menuitem', { name: 'New secret…' }));
    const reopened = await screen.findByRole('dialog');
    expect(await within(reopened).findByLabelText('Value')).toHaveValue('');
    expect(within(reopened).getByLabelText('Name')).toHaveValue('');
    expect(within(reopened).getByLabelText('Allowed origins')).toHaveValue('');
    expectNoCanaryOnScreen();
    await user.click(within(reopened).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expectNoCanaryOnScreen();
    expect(JSON.stringify(onInsert.mock.calls)).not.toContain(CANARY);
    expect(setItem).not.toHaveBeenCalled();
    for (const spy of consoleSpies) {
      expect(serializeCalls(spy.mock.calls)).not.toContain(CANARY);
    }
    const bodies = await Promise.all(mockedBodies);
    expect(bodies.join('\n')).not.toContain(CANARY);
    const createAnswer = JSON.parse(bodies.find((body) => body.includes('"version"')) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(createAnswer).sort()).toEqual(['allowedOrigins', 'name', 'version']);

    // The ID is present: the next open lists it under its token.
    const menu = await openPicker();
    const item = await within(menu).findByRole('menuitem', { name: /NEW_PW/ });
    expect(within(item).getByText('<secret NEW_PW>')).toBeVisible();
    expectNoCanaryOnScreen();
  }, 15000);

  it('on failure: clears the value, shows why, inserts nothing, and the value is nowhere', async () => {
    (APP_CONFIG as { debugMode: boolean }).debugMode = true;
    const consoleSpies = (['log', 'error', 'warn'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    seedSecretNames(TEST_ID, ['TAKEN_PW']);
    const onInsert = renderPicker();

    const dialog = await createThroughPicker('TAKEN_PW');
    expect(await within(dialog).findByText('A secret with this name already exists for this test.')).toBeVisible();
    expect(within(dialog).getByLabelText('Value')).toHaveValue('');
    expect(onInsert).not.toHaveBeenCalled();

    expectNoCanaryOnScreen();
    for (const spy of consoleSpies) {
      expect(serializeCalls(spy.mock.calls)).not.toContain(CANARY);
    }
    expect((await Promise.all(mockedBodies)).join('\n')).not.toContain(CANARY);
    // The ID is present in the refusal's own form field, as the author typed it.
    expect(within(dialog).getByLabelText('Name')).toHaveValue('TAKEN_PW');
  }, 15000);

  it('passes on only {name, version, allowedOrigins} even if a create answer carried more', async () => {
    server.use(
      http.post(SECRETS_ROUTE, () =>
        HttpResponse.json(
          { name: 'LEAKY_PW', version: '1', allowedOrigins: ['https://login.app.example'], value: CANARY },
          { status: 201 },
        ),
      ),
    );
    const onInsert = renderPicker();
    await createThroughPicker('LEAKY_PW');
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith({ kind: 'secret', name: 'LEAKY_PW', token: '<secret LEAKY_PW>' }),
    );
    expect(JSON.stringify(onInsert.mock.calls)).not.toContain(CANARY);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expectNoCanaryOnScreen();
  }, 15000);
});

// ---------------------------------------------------------------------------
// OnboardingCoach (no test file of its own in the L4 write set)
// ---------------------------------------------------------------------------

describe('OnboardingCoach describes secrets only when the capability is on', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('mentions secret references with the capability on', () => {
    render(<OnboardingCoach step={1} onNext={vi.fn()} onDismiss={vi.fn()} capabilities={ON} />);
    expect(
      screen.getByText('Save keeps your steps, environment, variables, and secure secret references together.'),
    ).toBeVisible();
  });

  it.each([
    ['off', OFF],
    ['unknown', UNKNOWN],
    ['loading', LOADING],
    ['error', UNAVAILABLE],
    ['not passed', undefined],
  ])('does not mention secrets with the capability %s', (_label, capabilities) => {
    render(<OnboardingCoach step={1} onNext={vi.fn()} onDismiss={vi.fn()} capabilities={capabilities} />);
    expect(screen.getByText('Save keeps your steps, environment, and variables together.')).toBeVisible();
    expect(screen.queryByText(/secret/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ruling A2
// ---------------------------------------------------------------------------

describe('ruling A2: the struck secret-fill copy is absent from this lane', () => {
  it('is in no L4 source file', () => {
    const files = [
      'ReferencePicker.tsx',
      'referenceTokens.ts',
      'index.ts',
      '../SecretInput.tsx',
      '../OnboardingCoach.tsx',
      '../templates/quickStartTemplates.ts',
      '../../../utils/config/studioCapabilities.ts',
      '../../../services/mocks/studio/secretsHandlers.ts',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(source, file).not.toContain(STRUCK_SECRET_FILL_COPY);
      expect(source, file).not.toMatch(/typed into a password box/iu);
    }
  });

  it('is not rendered by the picker or its create dialog in any capability state', async () => {
    for (const capabilities of [ON, OFF, UNKNOWN, LOADING, UNAVAILABLE]) {
      const { unmount } = render(
        <ReferencePicker testId={TEST_ID} variableNames={['USERNAME']} capabilities={capabilities} onInsert={vi.fn()} />,
      );
      const menu = await openPicker();
      expect(within(menu).queryByText(/password box/iu)).toBeNull();
      if (capabilities === ON) {
        await user.click(await within(menu).findByRole('menuitem', { name: 'New secret…' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).queryByText(/password box/iu)).toBeNull();
      }
      unmount();
    }
  });
});
