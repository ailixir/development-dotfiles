import fs from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { parse as parseYaml } from 'yaml';
import UiTestConfig from './UiTestConfig';
import { resetSecretsMocks, secretsHandlers, seedSecretNames } from '@/services/mocks/studio/secretsHandlers';
import type { StudioCapabilities } from '@/types/studio/studioGuidedTypes';

/**
 * studio-vault-secrets (spec D16, AC-FE-3), re-pointed by STUDIO-OBS-008 L4 (AC-5(a), P1): the
 * wizard offers secrets from the server's per-test capability (`GET /tests/{id}/capabilities`) for
 * the selected Studio test, not from a build-time switch. Off, unknown (no test selected), loading
 * and error are all unavailable and say why in visible text; the "alpha" copy is gone.
 *
 * The capability payloads are the `getStudioTestCapabilities` examples of `openapi.yaml`; the
 * secrets routes are the L4 MSW mirror.
 */

const SPEC_DIR = path.resolve(__dirname, '../../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, { get: { responses: Record<string, { content: Record<string, { examples: Record<string, { value: unknown }> }> }> } }>;
};
const capabilityExamples =
  openapi.paths['/tests/{id}/capabilities'].get.responses['200'].content['application/json'].examples;
const CAP_ON = capabilityExamples.vaultAndGuidedStart.value as StudioCapabilities;
const CAP_OFF = capabilityExamples.vaultOffGuidedStartIncompatible.value as StudioCapabilities;

const TEST_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER_TEST_ID = '5d6e7f80-9a0b-4c1d-8e2f-3a4b5c6d7e8f';
const CAPABILITIES_ROUTE = '*/api/v1/studio/tests/:id/capabilities';
const CANARY = 'Canary-L4-wizard-3f8a2b61-value';
/** T0 ruling A2: struck from 008. */
const STRUCK_SECRET_FILL_COPY = 'Secrets can only be typed into a password box.';

const OFF_TEXT = 'Vault is not connected for this environment.';
const UNKNOWN_TEXT = 'Select a Studio test first';
const LOADING_TEXT = 'Checking whether secrets are available for this test…';
const ERROR_TEXT = 'Studio could not confirm that secrets are available for this test, so they are off.';

const observed: Array<{ method: string; path: string }> = [];
const server = setupServer(
  ...secretsHandlers,
  http.get(CAPABILITIES_ROUTE, () => HttpResponse.json(CAP_ON)),
);
server.events.on('request:start', ({ request }) => {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
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
});
afterAll(() => server.close());

const capabilityAnswer = (body: StudioCapabilities) =>
  server.use(http.get(CAPABILITIES_ROUTE, () => HttpResponse.json(body)));

/** Keeps the form state the way the wizard page does, and records every change. */
function renderConfig(initial: Record<string, unknown>) {
  const onChange = vi.fn<[string, unknown], void>();
  function Harness() {
    const [formData, setFormData] = useState<Record<string, unknown>>(initial);
    return (
      <UiTestConfig
        formData={formData}
        onChange={(field, value) => {
          onChange(field, value);
          setFormData((previous) => ({ ...previous, [field]: value }));
        }}
        availableTests={[
          { id: TEST_ID, name: 'Login flow' },
          { id: OTHER_TEST_ID, name: 'Status page' },
        ]}
        onValidateVariables={vi.fn()}
      />
    );
  }
  render(<Harness />);
  return onChange;
}

/** The "Type" select of the variable row at `index` (the first combobox is the Studio test). */
const kindSelect = (index: number) => screen.getAllByRole('combobox')[1 + index];

describe('UiTestConfig secrets follow the server capability', () => {
  it('capability off: an existing secret row says Vault is not connected, and no secret is read', async () => {
    capabilityAnswer(CAP_OFF);
    renderConfig({ uiTestId: TEST_ID, uiVariables: { LOGIN_PW: { kind: 'secret', secretId: 'LOGIN_PW' } } });

    expect(await screen.findByText(OFF_TEXT)).toBeVisible();
    expect(screen.queryByLabelText('Select secret')).toBeNull();
    expect(screen.queryByText('Vault secrets are unavailable in this alpha.')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(observed).toEqual([{ method: 'GET', path: `/api/v1/studio/tests/${TEST_ID}/capabilities` }]);
  });

  it('capability off: a plain row offers no Secret type, and the hint names <var> only', async () => {
    capabilityAnswer(CAP_OFF);
    renderConfig({
      uiTestId: TEST_ID,
      uiVariables: { USER_ID: { kind: 'plain', value: 'pilot-user' }, LOGIN_PW: { kind: 'secret' } },
    });
    await screen.findByText(OFF_TEXT);

    await user.click(kindSelect(0));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Plain' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Secret' })).toBeNull();
    expect(screen.getByText('Use in Studio steps as <var NAME>')).toBeVisible();
  });

  it('capability on: offers the Secret type and lists the selected test\'s secrets', async () => {
    seedSecretNames(TEST_ID, ['LOGIN_PW']);
    renderConfig({
      uiTestId: TEST_ID,
      uiVariables: { USER_ID: { kind: 'plain', value: 'pilot-user' }, LOGIN_PW: { kind: 'secret', secretId: 'LOGIN_PW' } },
    });

    await waitFor(() =>
      expect(requestsTo('/secrets')).toEqual([{ method: 'GET', path: `/api/v1/studio/tests/${TEST_ID}/secrets` }]),
    );
    expect(screen.getByLabelText('Select secret')).toHaveTextContent('LOGIN_PW');
    expect(screen.getByText('Use in Studio steps as <var NAME> or <secret SECRET_ID>')).toBeVisible();

    await user.click(kindSelect(0));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Secret' })).toBeInTheDocument();
  });

  it('capability unknown: with no Studio test selected it asks for one and sends nothing', async () => {
    renderConfig({ uiTestId: '', uiVariables: { LOGIN_PW: { kind: 'secret' } } });

    expect(screen.getByText(UNKNOWN_TEXT)).toBeVisible();
    expect(screen.queryByLabelText('Select secret')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(observed).toEqual([]);
  });

  it('capability loading: says it is checking until the answer arrives', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(CAPABILITIES_ROUTE, async () => {
        await gate;
        return HttpResponse.json(CAP_ON);
      }),
    );
    renderConfig({ uiTestId: TEST_ID, uiVariables: { LOGIN_PW: { kind: 'secret' } } });

    expect(screen.getByText(LOADING_TEXT)).toBeVisible();
    expect(screen.queryByLabelText('Select secret')).toBeNull();
    await act(async () => {
      release();
      await gate;
    });
    expect(await screen.findByLabelText('Select secret')).toBeInTheDocument();
    expect(screen.queryByText(LOADING_TEXT)).toBeNull();
  });

  it.each([
    ['403', () => HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'refused' }, { status: 403 })],
    ['500', () => HttpResponse.json({ error: 'INTERNAL', message: 'refused' }, { status: 500 })],
    ['network error', () => HttpResponse.error()],
  ])('capability error (%s): secrets are off, asked once, and no secret is read', async (_label, answer) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    server.use(http.get(CAPABILITIES_ROUTE, answer));
    renderConfig({ uiTestId: TEST_ID, uiVariables: { LOGIN_PW: { kind: 'secret', secretId: 'LOGIN_PW' } } });

    expect(await screen.findByText(ERROR_TEXT)).toBeVisible();
    expect(screen.queryByLabelText('Select secret')).toBeNull();
    expect(requestsTo('/capabilities')).toHaveLength(1);
    expect(requestsTo('/secrets')).toEqual([]);
  });

  it('a different Studio test resets the capability: no picker until that test\'s own answer', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(CAPABILITIES_ROUTE, async ({ params }) => {
        if (params.id === OTHER_TEST_ID) {
          await gate;
          return HttpResponse.json(CAP_OFF);
        }
        return HttpResponse.json(CAP_ON);
      }),
    );
    renderConfig({ uiTestId: TEST_ID, uiVariables: { LOGIN_PW: { kind: 'secret' } } });
    expect(await screen.findByLabelText('Select secret')).toBeInTheDocument();

    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Status page' }));

    expect(await screen.findByText(LOADING_TEXT)).toBeVisible();
    expect(screen.queryByLabelText('Select secret')).toBeNull();
    await act(async () => {
      release();
      await gate;
    });
    expect(await screen.findByText(OFF_TEXT)).toBeVisible();
    expect(screen.queryByLabelText('Select secret')).toBeNull();
  });
});

describe('UiTestConfig secret references (D-8, never-echo)', () => {
  it('writes the picked Vault name as secretId, and None removes it (never null or empty)', async () => {
    seedSecretNames(TEST_ID, ['LOGIN_PW']);
    const onChange = renderConfig({ uiTestId: TEST_ID, uiVariables: { PASSWORD: { kind: 'secret' } } });

    const picker = await screen.findByLabelText('Select secret');
    await waitFor(() => expect(requestsTo('/secrets')).toHaveLength(1));
    await user.click(picker);
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'LOGIN_PW' }));
    expect(onChange).toHaveBeenLastCalledWith('uiVariables', { PASSWORD: { kind: 'secret', secretId: 'LOGIN_PW' } });

    await user.click(screen.getByLabelText('Select secret'));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'None' }));
    const [, cleared] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(cleared).toEqual({ PASSWORD: { kind: 'secret' } });
    expect(Object.keys((cleared as Record<string, object>).PASSWORD)).not.toContain('secretId');
  });

  it('creating a secret from the wizard stores only its ID; the value is in no change, DOM or input', async () => {
    const onChange = renderConfig({ uiTestId: TEST_ID, uiVariables: { PASSWORD: { kind: 'secret' } } });

    await user.click(await screen.findByLabelText('Select secret'));
    await user.click(within(await screen.findByRole('listbox')).getByText('+ Create new secret…'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Name'));
    await user.paste('NEW_PW');
    await user.click(within(dialog).getByLabelText('Value'));
    await user.paste(CANARY);
    await user.click(within(dialog).getByLabelText('Allowed origins'));
    await user.paste('https://login.app.example');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith('uiVariables', { PASSWORD: { kind: 'secret', secretId: 'NEW_PW' } }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(JSON.stringify(onChange.mock.calls)).not.toContain(CANARY);
    expect(document.body.innerHTML).not.toContain(CANARY);
    for (const input of Array.from(document.querySelectorAll('input, textarea'))) {
      expect((input as HTMLInputElement).value).not.toContain(CANARY);
    }
    expect(screen.getByLabelText('Select secret')).toHaveTextContent('NEW_PW');
  }, 15000);

  it('renders neither the alpha copy nor the struck secret-fill copy (ruling A2) in any state', async () => {
    for (const body of [CAP_ON, CAP_OFF]) {
      capabilityAnswer(body);
      const { unmount } = render(
        <UiTestConfig
          formData={{ uiTestId: TEST_ID, uiVariables: { LOGIN_PW: { kind: 'secret' } } }}
          onChange={vi.fn()}
          availableTests={[{ id: TEST_ID, name: 'Login flow' }]}
          onValidateVariables={vi.fn()}
        />,
      );
      await screen.findByText(body.vaultSecrets ? 'Use in Studio steps as <var NAME> or <secret SECRET_ID>' : OFF_TEXT);
      expect(screen.queryByText(STRUCK_SECRET_FILL_COPY)).toBeNull();
      expect(screen.queryByText(/alpha/iu)).toBeNull();
      unmount();
    }
  });
});
