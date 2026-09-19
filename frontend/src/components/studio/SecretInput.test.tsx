import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import SecretInput from './SecretInput';

/**
 * Studio v1, WP5: the secret picker stores references only.
 *
 * It used to copy every secret's metadata, including the value's last four characters, into
 * `localStorage['checks:secrets']` and merge that copy back in on the next load. The list now comes
 * from the secrets API alone, and the component hands its caller an id, never a value.
 */

const created: Array<Record<string, unknown>> = [];
const server = setupServer(
  http.get('*/api/v1/secrets', () =>
    HttpResponse.json({
      data: [{ id: 'sec_1', label: 'Existing', scope: 'project', last4: '1234', createdAt: '2026-09-01T00:00:00Z' }],
    }),
  ),
  http.post('*/api/v1/secrets', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    created.push(body);
    return HttpResponse.json({ id: 'sec_new', label: body.label, scope: body.scope, last4: '9999', createdAt: '2026-09-18T00:00:00Z' }, { status: 201 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  created.length = 0;
  window.localStorage.clear();
});
afterAll(() => server.close());

describe('SecretInput', () => {
  it('creates a secret on the server and passes back only its id, writing nothing to localStorage', async () => {
    window.localStorage.setItem(
      'checks:secrets',
      JSON.stringify([{ id: 'sec_stale', label: 'From the browser', scope: 'user', createdAt: '' }]),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const onChange = vi.fn();
    render(<SecretInput label="Select secret" value={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    await within(listbox).findByText(/Existing/);
    // A stale browser copy is no longer merged into the list.
    expect(within(listbox).queryByText(/From the browser/)).toBeNull();
    await userEvent.click(within(listbox).getByText('+ Create new secret…'));

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Label'), 'Pilot password');
    await userEvent.type(within(dialog).getByLabelText('Value'), 's3cret-value');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ id: 'sec_new' }));
    expect(created).toEqual([{ label: 'Pilot password', scope: 'project', value: 's3cret-value' }]);
    expect(setItem.mock.calls.map(([key]) => key)).not.toContain('checks:secrets');
    expect(JSON.stringify(onChange.mock.calls)).not.toContain('s3cret-value');
  });
});
