import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import OnboardingCoach from './OnboardingCoach';

/**
 * STUDIO-UNIFY-001.5, task 5.5 (m3): the coach used to call `scrollIntoView` on mount, which left the
 * editor opened scrolled down on a phone. jsdom has no layout, so the test pins the calls, not the
 * scroll position; the position itself is asserted in the Playwright mobile spec.
 */

const original = Element.prototype.scrollIntoView;
let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

describe('OnboardingCoach scrolling', () => {
  it('does not scroll itself into view when it mounts on step 0', () => {
    render(<OnboardingCoach step={0} onNext={vi.fn()} onDismiss={vi.fn()} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls into view when the step changes after mount', () => {
    const { rerender } = render(<OnboardingCoach step={0} onNext={vi.fn()} onDismiss={vi.fn()} />);
    rerender(<OnboardingCoach step={1} onNext={vi.fn()} onDismiss={vi.fn()} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('scrolls on mount once when the author asked for the guide (revealOnMount)', () => {
    render(<OnboardingCoach step={0} onNext={vi.fn()} onDismiss={vi.fn()} revealOnMount />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
