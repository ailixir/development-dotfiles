import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import React, { useState } from 'react';
import csiReducer from '@/store/slices/csiSlice';
import studioApi from '@/services/api/studioApi';
import UiTestCreateForm, { type UiTestFormValues } from './UiTestCreateForm';

/** STUDIO-UNIFY-001.5, task 5.10 (AC-07): the create form names what keeps "Create and open Studio" disabled. */

const NAME_REASON = 'Enter a name to continue.';
const SYSTEM_REASON = 'Choose a system to continue.';
const LENGTH_REASON = 'Shorten the name to 255 characters or fewer.';

const registeredCsi = {
  id: '178672', name: 'Payments', description: '', businessUnit: 'Operations', criticality: 'HIGH', owner: 'owner@example.com',
  tags: [], environment: 'Development', status: 'OPERATIONAL', createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z',
};

function makeStore() {
  const initial = csiReducer(undefined, { type: 'test/init' });
  return configureStore({
    reducer: { csi: csiReducer },
    preloadedState: { csi: { ...initial, data: [registeredCsi] as typeof initial.data, loading: 'succeeded' as const } },
  });
}

/** Hosts the form the way CreateCheckPage does: values are owned by the parent. */
const Host: React.FC<{ initial?: Partial<UiTestFormValues> }> = ({ initial }) => {
  const [values, setValues] = useState<UiTestFormValues>({ name: '', description: '', csiId: '', environment: 'Development', ...initial });
  return (
    <UiTestCreateForm
      values={values}
      onChange={(field, value) => setValues((previous) => ({ ...previous, [field]: value }))}
      onCreated={() => undefined}
    />
  );
};

function renderForm(initial?: Partial<UiTestFormValues>) {
  const user = userEvent.setup({ delay: null });
  render(
    <Provider store={makeStore()}>
      <Host initial={initial} />
    </Provider>,
  );
  return user;
}

const nameField = () => screen.getByRole('textbox', { name: /name/i });
/** The Name field with its helper text (the counter and the too-long sentence). */
const nameFormControl = () => nameField().closest('.MuiFormControl-root') as HTMLElement;
const createButton = () => screen.getByRole('button', { name: /Create and open Studio|Creating/ });
const reason = () => screen.queryByTestId('ui-test-create-reason');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Create UI test form: what is missing (AC-07)', () => {
  it('untouched: both reasons are in the footer, and the Name field is quiet', () => {
    renderForm();

    expect(createButton()).toBeDisabled();
    expect(reason()).toHaveTextContent(`${NAME_REASON} ${SYSTEM_REASON}`);
    expect(within(nameFormControl()).queryByText(NAME_REASON)).toBeNull();
  });

  it('touched: the name reason moves from the footer to the Name helper text, the system reason stays', async () => {
    const user = renderForm();

    await user.click(nameField());
    await user.tab();

    // One reason, one place: the sentence is the field's helper text, beside the counter, and not in the footer.
    expect(within(nameFormControl()).getByText(NAME_REASON)).toBeInTheDocument();
    expect(within(nameFormControl()).getByText('0/255')).toBeInTheDocument();
    expect(reason()).toHaveTextContent(SYSTEM_REASON);
    expect(reason()).not.toHaveTextContent(NAME_REASON);
  });

  it('names only the system when the name is filled in', () => {
    renderForm({ name: 'Checkout journey' });

    expect(reason()).toHaveTextContent(SYSTEM_REASON);
    expect(reason()).not.toHaveTextContent(NAME_REASON);
    expect(createButton()).toBeDisabled();
  });

  it('only the name missing, untouched: the footer says it and the field is quiet', () => {
    renderForm({ csiId: '178672' });

    expect(reason()).toHaveTextContent(NAME_REASON);
    expect(reason()).not.toHaveTextContent(SYSTEM_REASON);
    expect(within(nameFormControl()).queryByText(NAME_REASON)).toBeNull();
    expect(createButton()).toBeDisabled();
  });

  it('only the name missing, touched: the field says it and the footer is gone', async () => {
    const user = renderForm({ csiId: '178672' });

    await user.click(nameField());
    await user.tab();

    expect(within(nameFormControl()).getByText(NAME_REASON)).toBeInTheDocument();
    expect(reason()).toBeNull();
    expect(createButton()).toBeDisabled();
  });

  it('treats a whitespace-only name as missing, in the footer until touched and in the field after', async () => {
    const user = renderForm({ name: '   ', csiId: '178672' });

    expect(reason()).toHaveTextContent(NAME_REASON);
    expect(createButton()).toBeDisabled();
    await user.click(nameField());
    await user.tab();
    expect(within(nameFormControl()).getByText(NAME_REASON)).toBeInTheDocument();
    expect(reason()).toBeNull();
  });

  it('names the length limit in the Name field when the name is too long, with the system chosen', () => {
    renderForm({ name: 'a'.repeat(256), csiId: '178672' });

    // The sentence is the Name field's helper text, beside the counter, not part of the footer reason.
    expect(within(nameFormControl()).getByText(LENGTH_REASON)).toBeInTheDocument();
    expect(within(nameFormControl()).getByText('256/255')).toBeInTheDocument();
    expect(reason()).toBeNull();
    expect(createButton()).toBeDisabled();
  });

  it('a too-long name with no system: the field says the length, the footer says the system', () => {
    renderForm({ name: 'a'.repeat(256) });

    expect(within(nameFormControl()).getByText(LENGTH_REASON)).toBeInTheDocument();
    expect(reason()).toHaveTextContent(SYSTEM_REASON);
    expect(reason()).not.toHaveTextContent(LENGTH_REASON);
  });

  it('the Name field carries no length sentence while the name fits', () => {
    renderForm({ name: 'Checkout journey', csiId: '178672' });

    expect(within(nameFormControl()).queryByText(LENGTH_REASON)).toBeNull();
  });

  it('shows no reason when the button is enabled', () => {
    renderForm({ name: 'Checkout journey', csiId: '178672' });

    expect(createButton()).toBeEnabled();
    expect(reason()).toBeNull();
  });

  it('updates as the user fixes each item, and disappears when the last one is fixed', async () => {
    const user = renderForm();
    expect(reason()).toHaveTextContent(`${NAME_REASON} ${SYSTEM_REASON}`);

    await user.click(nameField());
    await user.paste('Checkout journey');
    expect(reason()).toHaveTextContent(SYSTEM_REASON);
    expect(reason()).not.toHaveTextContent(NAME_REASON);
    expect(within(nameFormControl()).queryByText(NAME_REASON)).toBeNull();

    await user.click(screen.getByRole('combobox', { name: /System \(CSI\)/i }));
    await user.click(await screen.findByRole('option', { name: '178672: Payments' }));
    expect(reason()).toBeNull();
    expect(createButton()).toBeEnabled();
  });

  it('shows no reason while the test is being created', async () => {
    vi.spyOn(studioApi, 'createTest').mockReturnValue(new Promise(() => undefined));
    const user = renderForm({ name: 'Checkout journey', csiId: '178672' });

    await user.click(createButton());

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(reason()).toBeNull();
  });
});

describe('Create UI test form: the name field error state (AC-07)', () => {
  // MUI reflects the error state in aria-invalid; toBeInvalid() would also count the native `required` constraint.
  it('turns red for an empty name only once the field has been left', async () => {
    const user = renderForm();
    const field = () => nameField().closest('.MuiFormControl-root') as HTMLElement;

    expect(nameField()).toHaveAttribute('aria-invalid', 'false');

    await user.click(nameField());
    expect(nameField()).toHaveAttribute('aria-invalid', 'false');

    await user.tab();
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    expect(within(field()).getByText('0/255')).toBeInTheDocument();
  });

  it('turns red for a whitespace-only name after it has been left', async () => {
    const user = renderForm();

    await user.click(nameField());
    await user.paste('   ');
    expect(nameField()).toHaveAttribute('aria-invalid', 'false');

    await user.tab();
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
  });

  it('stays calm for a valid name that has been left', async () => {
    const user = renderForm();

    await user.click(nameField());
    await user.paste('Checkout journey');
    await user.tab();

    expect(nameField()).toHaveAttribute('aria-invalid', 'false');
  });

  it('is red for a too-long name even before it has been left', () => {
    renderForm({ name: 'a'.repeat(256) });

    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
  });
});
