import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MswGate } from './MswGate';

/**
 * These cover the one property the gate owes the application in every configuration: it must
 * eventually open. Whether a worker actually intercepts a request is a service-worker behaviour and
 * jsdom has no service workers, so that half is proved against real dev servers in a real browser —
 * see the AC-16 activation evidence in `docs/stories/10.1.story.md`, not here.
 *
 * Vitest defines `process.env.MSW_BUNDLED` as 'false', so this exercises the build-without-mocks
 * branch, which is exactly the one that used to be able to strand the app behind a `null` render.
 */
describe('MswGate', () => {
  const original = process.env.VITE_ENABLE_MSW;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VITE_ENABLE_MSW;
    } else {
      process.env.VITE_ENABLE_MSW = original;
    }
  });

  it('renders children synchronously when the flag is off', () => {
    delete process.env.VITE_ENABLE_MSW;
    render(
      <MswGate>
        <p>studio</p>
      </MswGate>,
    );
    // No await: with the flag off the gate must never delay the first paint.
    expect(screen.getByText('studio')).toBeInTheDocument();
  });

  it('opens even when the flag is on but the build carries no mocks', async () => {
    process.env.VITE_ENABLE_MSW = 'true';
    render(
      <MswGate>
        <p>studio</p>
      </MswGate>,
    );
    await waitFor(() => expect(screen.getByText('studio')).toBeInTheDocument());
  });
});
