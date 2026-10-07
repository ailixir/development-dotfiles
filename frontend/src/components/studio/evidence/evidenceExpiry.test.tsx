import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { mockExecutions } from '@/services/mocks/studio/fixtures';
import { VideoEvidencePanel } from './VideoEvidencePanel';
import { formatEvidenceInstant } from './formatEvidenceInstant';

/** VAL-035 — the Proof tab shows the expiry in the reader's locale, not as a raw ISO instant. */

const EXPIRES_AT = '2026-11-04T03:48:59.517983Z';
const localized = new Date(EXPIRES_AT).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function withVideo(status: 'AVAILABLE' | 'EXPIRED'): ExecutionSnapshot {
  const found = mockExecutions.find((execution) => execution.video.status === status);
  if (!found) throw new Error(`mockExecutions has no ${status} row`);
  return { ...found, video: { ...found.video, expiresAt: EXPIRES_AT } };
}

describe('VAL-035: evidence expiry', () => {
  it('formats an instant with the locale date and time, without the ISO form', () => {
    expect(formatEvidenceInstant(EXPIRES_AT)).toBe(localized);
    expect(formatEvidenceInstant(EXPIRES_AT)).not.toContain('T03:48');
  });

  it('shows an unparseable value as sent rather than "Invalid Date"', () => {
    expect(formatEvidenceInstant('not-a-date')).toBe('not-a-date');
  });

  it('renders "Available until" and "Expired on" with the formatted instant', () => {
    const { unmount } = render(<VideoEvidencePanel snapshot={withVideo('AVAILABLE')} />);
    expect(screen.getByTestId('video-evidence-expiry')).toHaveTextContent(`Available until ${localized}`);
    expect(screen.getByTestId('video-evidence-expiry').textContent).not.toContain(EXPIRES_AT);
    unmount();

    render(<VideoEvidencePanel snapshot={withVideo('EXPIRED')} />);
    expect(screen.getByTestId('video-evidence-expiry')).toHaveTextContent(`Expired on ${localized}`);
  });
});
