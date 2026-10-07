import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import UiTestConfig from './UiTestConfig';

/**
 * studio-vault-secrets (spec D16, AC-FE-3): the wizard gates secrets on the same capability flag as
 * the Studio page, and its picker is scoped to the selected Studio test.
 */

const capabilities = vi.hoisted(() => ({ vaultSecrets: false }));
vi.mock('@/utils/config/studioCapabilities', () => ({ STUDIO_CAPABILITIES: capabilities }));

const TEST_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const observed: Array<{ method: string; path: string }> = [];
const server = setupServer(
  http.get('*/api/v1/studio/tests/:id/secrets', () => HttpResponse.json({ data: [{ name: 'LOGIN_PW' }] })),
);
server.events.on('request:start', ({ request }) => {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  observed.length = 0;
  capabilities.vaultSecrets = false;
});
afterAll(() => server.close());

function renderConfig(formData: Record<string, unknown>) {
  return render(
    <UiTestConfig
      formData={formData}
      onChange={vi.fn()}
      availableTests={[{ id: TEST_ID, name: 'Login flow' }]}
      onValidateVariables={vi.fn()}
    />,
  );
}

describe('UiTestConfig secrets', () => {
  it('offers no Secret type while vaultSecrets is off', async () => {
    renderConfig({ uiTestId: TEST_ID, uiVariables: { USER_ID: { kind: 'plain', value: 'pilot-user' } } });

    const [, kind] = screen.getAllByRole('combobox');
    await userEvent.click(kind);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Plain' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Secret' })).toBeNull();
  });

  it('shows an existing secret row as unavailable while vaultSecrets is off, and sends no request', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderConfig({ uiTestId: TEST_ID, uiVariables: { LOGIN_PW: { kind: 'secret', secretId: 'LOGIN_PW' } } });

    expect(screen.getByText('Vault secrets are unavailable in this alpha.')).toBeVisible();
    expect(screen.queryByLabelText('Select secret')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(observed).toEqual([]);
  });

  it('disables the picker until a Studio test is selected when vaultSecrets is on', async () => {
    capabilities.vaultSecrets = true;
    renderConfig({ uiTestId: '', uiVariables: { LOGIN_PW: { kind: 'secret' } } });

    expect(screen.getByText('Select a Studio test first')).toBeVisible();
    const [, , picker] = screen.getAllByRole('combobox');
    expect(picker).toHaveAttribute('aria-disabled', 'true');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(observed).toEqual([]);
  });

  it('lists the selected Studio test\'s secrets when vaultSecrets is on', async () => {
    capabilities.vaultSecrets = true;
    renderConfig({ uiTestId: TEST_ID, uiVariables: { LOGIN_PW: { kind: 'secret', secretId: 'LOGIN_PW' } } });

    await waitFor(() =>
      expect(observed).toEqual([{ method: 'GET', path: `/api/v1/studio/tests/${TEST_ID}/secrets` }]),
    );
    expect(screen.queryByText('Vault secrets are unavailable in this alpha.')).toBeNull();
  });
});
