import { act, renderHook, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { endsIn } from '@/services/mocks/studio/guidedFixtures';
import {
  SEEDED_FAILED_ATTEMPT_TEST_ID,
  failGuidedRequests,
  guidedHandlers,
  guidedRequestCount,
  guidedRequestLog,
  resetGuidedMocks,
  setGuidedLatency,
  setGuidedScenario,
} from '@/services/mocks/studio/guidedHandlers';
import { draftsByReadiness } from '@/services/mocks/studio/readinessFixtures';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import { useLatestLearningAttempts } from './useLatestLearningAttempts';

/**
 * STUDIO-UNIFY-001.6 AC-04, task 6.16: the hook reads once per id set, aborts a superseded read,
 * swallows a failure into an empty map, sends nothing for no ids, polls nothing and stores nothing.
 * The server is the guided MSW mirror, so "how many reads" is a count of requests it served.
 */

const server = setupServer(...guidedHandlers);
const SEEDED = SEEDED_FAILED_ATTEMPT_TEST_ID;
const UNLEARNED = draftsByReadiness.UNLEARNED;
const READY_TEST = '11111111-1111-1111-1111-111111111111';

const reads = () => guidedRequestCount('latest');
const settle = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(async () => {
  // An aborted read still reaches the mirror, which logs it when its (test-set) latency ends; let
  // it land before the log is cleared, or it is counted in the next test.
  await settle(80);
  server.resetHandlers();
  resetGuidedMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterAll(() => server.close());


describe('useLatestLearningAttempts', () => {
  it('reads once on mount and keys the attempts by test id', async () => {
    const { result } = renderHook(() => useLatestLearningAttempts([SEEDED, READY_TEST]));
    expect(result.current.byTestId.size).toBe(0);
    await waitFor(() => expect(result.current.byTestId.size).toBe(1));
    expect(result.current.byTestId.get(SEEDED)).toMatchObject({ state: 'FAILED', testId: SEEDED });
    expect(result.current.byTestId.has(READY_TEST)).toBe(false);
    await settle(30);
    expect(reads()).toBe(1);
  });

  it('sends no request for no ids', async () => {
    const { result } = renderHook(() => useLatestLearningAttempts([]));
    await settle(30);
    expect(result.current.byTestId.size).toBe(0);
    expect(guidedRequestLog()).toEqual([]);
  });

  it('does not read again for the same ids in a new array or another order', async () => {
    const { result, rerender } = renderHook(({ ids }) => useLatestLearningAttempts(ids), {
      initialProps: { ids: [SEEDED, READY_TEST] },
    });
    await waitFor(() => expect(result.current.byTestId.size).toBe(1));
    rerender({ ids: [READY_TEST, SEEDED, SEEDED] });
    rerender({ ids: [SEEDED, READY_TEST] });
    await settle(30);
    expect(reads()).toBe(1);
  });

  it('reads again when the id set changes, and an answer for ids no longer asked about is not shown', async () => {
    const { result, rerender } = renderHook(({ ids }) => useLatestLearningAttempts(ids), {
      initialProps: { ids: [SEEDED] },
    });
    await waitFor(() => expect(result.current.byTestId.has(SEEDED)).toBe(true));
    rerender({ ids: [READY_TEST] });
    expect(result.current.byTestId.size).toBe(0);
    await waitFor(() => expect(reads()).toBe(2));
    expect(result.current.byTestId.size).toBe(0);
  });

  it('aborts a superseded read: the slow answer for the old ids never lands', async () => {
    setGuidedLatency('latest', 60);
    // A failed session makes the second id's answer distinguishable from the seeded one.
    setGuidedScenario(endsIn('FAILED', { failureCode: 'TARGET_MISMATCH' }));
    const { startSession, readSession } = studioGuidedApi;
    const started = await startSession(
      {
        schemaVersion: 3,
        testId: UNLEARNED.id,
        sourceRevision: String(UNLEARNED.sourceRevision),
        configurationRevision: String(UNLEARNED.configurationRevision),
        environmentId: 'Staging',
        versions: { contract: 3 },
      },
      'superseded-start',
    );
    for (let index = 0; index < 20; index += 1) {
      if ((await readSession(started.session.sessionId)).session.state === 'FAILED') break;
    }
    const { result, rerender } = renderHook(({ ids }) => useLatestLearningAttempts(ids), {
      initialProps: { ids: [SEEDED] },
    });
    rerender({ ids: [UNLEARNED.id] });
    await waitFor(() => expect(result.current.byTestId.has(UNLEARNED.id)).toBe(true));
    await settle(120);
    expect([...result.current.byTestId.keys()]).toEqual([UNLEARNED.id]);
  });

  it('refresh reads again and keeps the earlier answer until the new one arrives', async () => {
    const { result } = renderHook(() => useLatestLearningAttempts([SEEDED]));
    await waitFor(() => expect(result.current.byTestId.has(SEEDED)).toBe(true));
    setGuidedLatency('latest', 60);
    act(() => result.current.refresh());
    expect(result.current.byTestId.has(SEEDED)).toBe(true);
    await waitFor(() => expect(reads()).toBe(2));
    await settle(100);
    expect(result.current.byTestId.has(SEEDED)).toBe(true);
    expect(reads()).toBe(2);
  });

  it('a failed read is an empty map, with a single request and no retry', async () => {
    failGuidedRequests('latest', { status: 500, body: { error: { code: 'BOOM', message: 'Boom' } } }, { times: 5 });
    const { result } = renderHook(() => useLatestLearningAttempts([SEEDED]));
    await waitFor(() => expect(reads()).toBe(1));
    await settle(60);
    expect(result.current.byTestId.size).toBe(0);
    expect(reads()).toBe(1);
  });

  it('a failed refresh drops the earlier answer', async () => {
    const { result } = renderHook(() => useLatestLearningAttempts([SEEDED]));
    await waitFor(() => expect(result.current.byTestId.has(SEEDED)).toBe(true));
    failGuidedRequests('latest', { status: 500, body: { error: { code: 'BOOM', message: 'Boom' } } });
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.byTestId.size).toBe(0));
  });

  it('hands the client an AbortSignal that unmounting aborts', async () => {
    setGuidedLatency('latest', 40);
    const signals: (AbortSignal | undefined)[] = [];
    const original = studioGuidedApi.readLatestAttempts;
    vi.spyOn(studioGuidedApi, 'readLatestAttempts').mockImplementation((ids, options) => {
      signals.push(options?.signal);
      return original(ids, options);
    });
    const { result, unmount } = renderHook(() => useLatestLearningAttempts([SEEDED]));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
    unmount();
    expect(signals[0]?.aborted).toBe(true);
    await settle(100);
    expect(result.current.byTestId.size).toBe(0);
  });

  it('aborts the signal of a superseded read when the id set changes', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const original = studioGuidedApi.readLatestAttempts;
    vi.spyOn(studioGuidedApi, 'readLatestAttempts').mockImplementation((ids, options) => {
      signals.push(options?.signal);
      return original(ids, options);
    });
    const { rerender } = renderHook(({ ids }) => useLatestLearningAttempts(ids), {
      initialProps: { ids: [SEEDED] },
    });
    rerender({ ids: [READY_TEST] });
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('does not poll and does not use browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useLatestLearningAttempts([SEEDED]));
    await waitFor(() => expect(result.current.byTestId.size).toBe(1));
    await settle(200);
    expect(reads()).toBe(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
