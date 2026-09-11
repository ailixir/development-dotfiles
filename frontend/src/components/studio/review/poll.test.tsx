import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { awaitingDraft, compilingDraft } from '@/services/mocks/studio/compileFixtures';
import { CompileReviewPanel } from './CompileReviewPanel';
import { compilePollSchedule, WATCH_GAVE_UP_MESSAGE } from './compilePollBounds';
import { STUDIO_BASE } from './reviewTestHarness';

/** Story 10.10 AC-23 — the watch stops, and says it stopped rather than that anything failed. */

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
  vi.useRealTimers();
});
afterAll(() => studioMockServer.close());

async function drainSchedule() {
  const delays = compilePollSchedule();
  for (const delay of delays) {
    await vi.advanceTimersByTimeAsync(delay + 1);
  }
  // One more turn than the schedule holds, to prove nothing is left running.
  await vi.advanceTimersByTimeAsync(60_000);
  return delays.length;
}

describe('AC-23: the COMPILING watch is bounded and stops out loud', () => {
  it('stops after a bounded number of reads and reports a give-up, not a failure', async () => {
    let reads = 0;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        return HttpResponse.json(compilingDraft);
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CompileReviewPanel testId={compilingDraft.id} />);
    await screen.findByTestId('compile-state-region');

    const scheduled = await drainSchedule();

    const gaveUp = await screen.findByTestId('watch-gave-up');
    expect(gaveUp.textContent).toBe(WATCH_GAVE_UP_MESSAGE);
    expect(gaveUp.textContent).toMatch(/does not mean anything went wrong/i);
    expect(gaveUp.textContent).not.toMatch(/failed|timeout|timed out|error/i);

    // One first read plus the scheduled ones, and no more.
    expect(reads).toBeLessThanOrEqual(scheduled + 1);
    expect(reads).toBeGreaterThan(1);

    const before = reads;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(reads).toBe(before);
  });

  it('stops the moment the compile reaches a terminal state', async () => {
    let reads = 0;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        return HttpResponse.json(reads < 3 ? compilingDraft : awaitingDraft);
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CompileReviewPanel testId={compilingDraft.id} />);
    await screen.findByTestId('compile-state-region');

    await vi.advanceTimersByTimeAsync(20_000);
    await waitFor(async () => {
      const region = await screen.findByTestId('compile-state-region');
      expect(region.getAttribute('aria-label')).toBe('Waiting for your confirmation');
    });

    const settled = reads;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(reads).toBe(settled);
    expect(screen.queryByTestId('watch-gave-up')).toBeNull();
  });

  it('stops on unmount', async () => {
    let reads = 0;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        return HttpResponse.json(compilingDraft);
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = render(<CompileReviewPanel testId={compilingDraft.id} />);
    await screen.findByTestId('compile-state-region');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads).toBeGreaterThan(1);

    view.unmount();
    const afterUnmount = reads;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(reads).toBe(afterUnmount);
  });

  it('stops when the read is refused rather than hammering a route saying no', async () => {
    let reads = 0;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        return reads === 1
          ? HttpResponse.json(compilingDraft)
          : HttpResponse.json(
              { error: 'TEST_QUARANTINED', message: 'held pending CSI resolution' },
              { status: 409 },
            );
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CompileReviewPanel testId={compilingDraft.id} />);
    await screen.findByTestId('compile-state-region');
    await vi.advanceTimersByTimeAsync(10_000);

    const refused = reads;
    expect(refused).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(reads).toBe(refused);
  });
});
