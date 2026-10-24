import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StudioUnavailable, {
  StudioUnavailable as NamedStudioUnavailable,
  TEST_NOT_AVAILABLE_MESSAGE,
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
