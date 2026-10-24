import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import StudioUnavailable, {
  StudioUnavailable as NamedStudioUnavailable,
  TEST_NOT_AVAILABLE_MESSAGE,
  TestNotAvailable,
  isUnavailableTestRead,
} from './StudioUnavailable';

describe('StudioUnavailable', () => {
  it('renders the editor wording', () => {
    render(<StudioUnavailable />);
    expect(screen.getByRole('heading', { name: 'Checks Studio' })).toBeInTheDocument();
    expect(screen.getByText('Checks Studio is not available in this environment.')).toBeInTheDocument();
  });

  it('exports the same component by name and as default', () => {
    expect(NamedStudioUnavailable).toBe(StudioUnavailable);
  });
});

describe('isUnavailableTestRead', () => {
  it('is true for a 403 and a 400 response', () => {
    expect(isUnavailableTestRead({ response: { status: 403 } })).toBe(true);
    expect(isUnavailableTestRead({ response: { status: 400 } })).toBe(true);
  });

  it('is false for other statuses, no response and non-objects', () => {
    expect(isUnavailableTestRead({ response: { status: 500 } })).toBe(false);
    expect(isUnavailableTestRead({ response: { status: 404 } })).toBe(false);
    expect(isUnavailableTestRead(new Error('network'))).toBe(false);
    expect(isUnavailableTestRead({ response: {} })).toBe(false);
    expect(isUnavailableTestRead(null)).toBe(false);
    expect(isUnavailableTestRead(undefined)).toBe(false);
  });
});

describe('TEST_NOT_AVAILABLE_MESSAGE', () => {
  it('is the single message for an unreadable test', () => {
    expect(TEST_NOT_AVAILABLE_MESSAGE).toBe("This UI test doesn't exist or you don't have access");
  });
});

describe('TestNotAvailable', () => {
  const mount = (testId: string) =>
    render(
      <MemoryRouter initialEntries={['/checks/ui-tests/abc']}>
        <Routes>
          <Route path="/checks/ui-tests/:id" element={<TestNotAvailable testId={testId} />} />
          <Route path="/checks/all" element={<div data-testid="all-checks">All checks page</div>} />
        </Routes>
      </MemoryRouter>,
    );

  it('shows a heading, the unchanged message and a Back to All Checks button', () => {
    mount('some-root');
    expect(screen.getByRole('heading', { name: 'UI test not available' })).toBeInTheDocument();
    expect(screen.getByText(TEST_NOT_AVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to All Checks' })).toBeInTheDocument();
  });

  it('puts the given test id on the root, so each screen keeps its own', () => {
    mount('studio-test-unavailable');
    expect(screen.getByTestId('studio-test-unavailable')).toHaveTextContent(TEST_NOT_AVAILABLE_MESSAGE);
  });

  it('goes to /checks/all through the router', async () => {
    mount('some-root');
    await userEvent.click(screen.getByRole('button', { name: 'Back to All Checks' }));
    expect(await screen.findByTestId('all-checks')).toBeInTheDocument();
    expect(screen.queryByText(TEST_NOT_AVAILABLE_MESSAGE)).toBeNull();
  });
});
