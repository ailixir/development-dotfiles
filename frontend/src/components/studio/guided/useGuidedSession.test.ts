import { StrictMode, createElement, type ComponentType, type ReactNode } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import studioReducer from '@/store/slices/studioSlice';
import type { GuidedStartRequest, StudioCapabilities } from '@/types/studio/studioGuidedTypes';
import {
  GUIDED_START_REFUSALS,
  LEARN_SCENARIO,
  endsIn,
  guidedError,
  learnWithQuestion,
  LEARN_PROOF_REFUSED_SCENARIO,
  refusesStart,
} from '@/services/mocks/studio/guidedFixtures';
import {
  UNAUTHENTICATED_REFUSAL,
  failGuidedRequests,
  guidedHandlers,
  setGuidedLatency,
  guidedRequestCount,
  guidedRequestLog,
  guidedSessionsForTest,
  resetGuidedMocks,
  setGuidedScenario,
} from '@/services/mocks/studio/guidedHandlers';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import { capabilityHandlers, resetCapabilityMocks } from '@/services/mocks/studio/capabilityHandlers';
import { draftsByReadiness } from '@/services/mocks/studio/readinessFixtures';
import { guidedSessionStorageKey } from '@/types/studio/studioGuidedTypes';
import {
  readGuidedPointer,
  resetGuidedSessionRuntime,
  useGuidedSession,
  type UseGuidedSessionOptions,
} from './useGuidedSession';
import type { GuidedPendingReason } from '@/types/studio/studioGuidedTypes';

/**
 * AC-2: the guided-session hook. The server is the guided MSW mirror, so every assertion about
 * "how many times" is a count of requests the server actually served (`guidedRequestLog`), not of
 * calls the hook made. The cases the exit criterion names are here: keys on all four mutations
 * (D-1), reload, a lost response, and React StrictMode.
 */

const server = setupServer(...guidedHandlers, ...capabilityHandlers);
const TEST = draftsByReadiness.UNLEARNED;
const FAST: UseGuidedSessionOptions = { pollIntervalMs: 5, retryDelayMs: 5 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  const original = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (args[0] === 'API Error:' || args[0] === 'Server error - check service status') return;
    original(...args);
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  server.resetHandlers();
  resetGuidedMocks();
  resetCapabilityMocks();
  resetGuidedSessionRuntime();
  window.sessionStorage.clear();
});
afterAll(() => server.close());

/** Lets background polls land inside `act`, so their state updates are not reported as stray. */
const idle = (ms: number): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** `Provider` types `children` as a required prop, which `createElement` cannot take as an argument. */
const StoreProvider = Provider as unknown as ComponentType<{
  store: ReturnType<typeof makeStore>;
  children?: ReactNode;
}>;

function makeStore() {
  return configureStore({ reducer: { studio: studioReducer } });
}

function mount(
  testId: string | null = TEST.id,
  options: { strict?: boolean; store?: ReturnType<typeof makeStore>; hook?: UseGuidedSessionOptions } = {},
) {
  const store = options.store ?? makeStore();
  const wrapper = ({ children }: { children: ReactNode }) => {
    const provided = createElement(StoreProvider, { store }, children);
    return options.strict ? createElement(StrictMode, null, provided) : provided;
  };
  const rendered = renderHook(() => useGuidedSession(testId, options.hook ?? FAST), { wrapper });
  return { ...rendered, store };
}

async function context(): Promise<GuidedStartRequest> {
  const response = await fetch(`http://localhost/api/v1/studio/tests/${TEST.id}/capabilities`);
  const body = (await response.json()) as StudioCapabilities;
  if (!body.guidedStart.available) throw new Error('unavailable');
  return body.guidedStart.context;
}

const mutations = () =>
  guidedRequestLog().filter((entry) => ['start', 'clarify', 'cancel', 'finalize'].includes(entry.operation));

const starts = () => guidedRequestLog().filter((entry) => entry.operation === 'start');

const pointer = () => readGuidedPointer(TEST.id);

async function runToSuccess(result: ReturnType<typeof mount>['result']) {
  await waitFor(() => expect(result.current.result?.outcome).toBe('SUCCEEDED'));
}

describe('a learn from start to published', () => {
  it('starts, follows the session, finalizes once, and reads the published result', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    expect(result.current.view?.session.sessionId).toBe(guidedSessionsForTest(TEST.id)[0]);
    await runToSuccess(result);
    expect(result.current.result?.publication.status).toBe('PUBLISHED');
    expect(result.current.pending).toBeNull();
    expect(result.current.startRefusal).toBeNull();
    expect(guidedRequestCount('start')).toBe(1);
    expect(guidedRequestCount('finalize')).toBe(1);
  });

  it('start, clarify and finalize each carried a non-empty, distinct Idempotency-Key (D-1)', async () => {
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE'));
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.clarification).not.toBeNull());
    await act(async () => result.current.answer(result.current.clarification!.choices[0].choiceId));
    await runToSuccess(result);

    const seen = mutations();
    expect(seen.map((entry) => entry.operation).sort()).toEqual(['clarify', 'finalize', 'start']);
    for (const entry of seen) {
      expect(entry.idempotencyKey, entry.operation).toMatch(/^.{1,256}$/u);
    }
    expect(new Set(seen.map((entry) => entry.idempotencyKey)).size).toBe(seen.length);
  });

  it('a cancel carries its own key and ends the session CANCELLED', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.view?.session.state).not.toBe('PREPARING'));
    await act(async () => result.current.cancel());
    await waitFor(() => expect(result.current.result?.outcome).toBe('CANCELLED'));
    const cancels = mutations().filter((entry) => entry.operation === 'cancel');
    expect(cancels).toHaveLength(1);
    expect(cancels[0].idempotencyKey).toBeTruthy();
    expect(result.current.result?.publication.status).toBe('REFUSED');
  });

  it('two answers or two cancels at once send one request each', async () => {
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE'));
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.clarification).not.toBeNull());
    const choice = result.current.clarification!.choices[0].choiceId;
    await act(async () => {
      await Promise.all([result.current.answer(choice), result.current.answer(choice)]);
    });
    expect(guidedRequestCount('clarify')).toBe(1);
    await act(async () => {
      await Promise.all([result.current.cancel(), result.current.cancel()]);
    });
    expect(guidedRequestCount('cancel')).toBe(1);
  });

  it('exposes the pending question, then clears it once answered', async () => {
    setGuidedScenario(learnWithQuestion('SOURCE_CHOICE'));
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.clarification).not.toBeNull());
    expect(result.current.clarification).toMatchObject({ phase: 'source', promptCode: 'CHOOSE_SOURCE' });
    expect(result.current.view?.session.state).toBe('AWAITING_CLARIFICATION');
    await act(async () => result.current.answer(result.current.clarification!.choices[0].choiceId));
    await waitFor(() => expect(result.current.clarification).toBeNull());
    await runToSuccess(result);
  });

  it('a learn that did not publish keeps reading the result while its recording is still PROCESSING', async () => {
    setGuidedScenario(endsIn('FAILED', { video: 'AVAILABLE', videoProcessingReads: 2 }));
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.result?.evidence.video?.status).toBe('AVAILABLE'));
    expect(guidedRequestCount('result')).toBe(3);
    await idle(40);
    expect(guidedRequestCount('result')).toBe(3);
  });

  it('a published learn settles at the first final result: no learning recording to wait for', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    expect(result.current.result?.publication.status).toBe('PUBLISHED');
    expect(result.current.result?.evidence.video).toBeNull();
    expect(result.current.result?.actionTimings).toEqual([]);
    const reads = guidedRequestCount('result');
    await idle(40);
    expect(guidedRequestCount('result')).toBe(reads);
  });

  it('exposes result.proof as null when the proof replay was not accepted', async () => {
    setGuidedScenario(LEARN_PROOF_REFUSED_SCENARIO);
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    expect(result.current.result?.publication.status).toBe('PUBLISHED');
    expect(result.current.result?.proof).toBeNull();
  });

  it('stops polling the session once the result has settled', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    const reads = guidedRequestCount('read');
    await idle(60);
    expect(guidedRequestCount('read')).toBe(reads);
  });

  it('a pending publication is reported as pending, never as a success', async () => {
    setGuidedScenario(endsIn('UNKNOWN_OUTCOME', { failureCode: 'UNKNOWN_OUTCOME', publicationStatus: 'PENDING' }));
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.result?.outcome).toBe('UNKNOWN_OUTCOME'));
    await waitFor(() => expect(result.current.pending).toBe('PUBLICATION_PENDING'));
    expect(result.current.result?.publication).toEqual({ status: 'PENDING', receipt: null });
  });
});

describe('what is persisted', () => {
  it('writes the pointer before the POST, holding only the five fields and no authored text', async () => {
    failGuidedRequests('start', 'network', { times: 3 });
    const { result } = mount();
    const input = await context();
    await act(async () => {
      await expect(result.current.startLearn(input)).rejects.toBeTruthy();
    });
    const raw = window.sessionStorage.getItem(guidedSessionStorageKey(TEST.id)) as string;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['finalizeKey', 'sessionId', 'startKey', 'startRequest', 'testId']);
    expect(stored.sessionId).toBeNull();
    expect(stored.startRequest).toEqual(input);
    for (const step of TEST.steps) expect(raw).not.toContain(step);
    expect(guidedRequestCount('start')).toBe(3);
    // All three attempts used the one key.
    expect(new Set(starts().map((entry) => entry.idempotencyKey))).toEqual(new Set([stored.startKey]));
  });

  it('records the sessionId once the start was answered', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    expect(pointer()?.sessionId).toBe(result.current.view?.session.sessionId);
  });

  it('drops a stored entry that is not exactly a pointer', () => {
    window.sessionStorage.setItem(
      guidedSessionStorageKey(TEST.id),
      JSON.stringify({ testId: TEST.id, sessionId: null, startKey: 'k', finalizeKey: 'f', startRequest: {}, stepText: 'x' }),
    );
    expect(pointer()).toBeNull();
    expect(window.sessionStorage.getItem(guidedSessionStorageKey(TEST.id))).toBeNull();
    window.sessionStorage.setItem(guidedSessionStorageKey(TEST.id), 'not json');
    expect(pointer()).toBeNull();
  });
});

describe('a sessionStorage that cannot be written (tech gate L5b)', () => {
  it('still finalizes: the pointer falls back to memory, so only reload-resume is lost', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    expect(result.current.result?.publication.status).toBe('PUBLISHED');
    expect(guidedRequestCount('start')).toBe(1);
    expect(guidedRequestCount('finalize')).toBe(1);
    expect(window.sessionStorage.getItem(guidedSessionStorageKey(TEST.id))).toBeNull();
  });

  it('a finished session is forgotten from memory too, so a new Run is a new logical start', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    const firstStartKey = starts()[0].idempotencyKey;
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(guidedRequestCount('start')).toBe(2));
    expect(starts()[1].idempotencyKey).not.toBe(firstStartKey);
  });
});

describe('a lost response', () => {
  it('retries the exact body under the same key and finds the session the first attempt created', async () => {
    failGuidedRequests('start', 'network', { afterProcessing: true });
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    expect(guidedRequestCount('start')).toBe(2);
    expect(guidedRequestCount('start', { executedOnly: true })).toBe(1);
    expect(guidedSessionsForTest(TEST.id)).toHaveLength(1);
    expect(new Set(starts().map((entry) => entry.idempotencyKey)).size).toBe(1);
    await runToSuccess(result);
  });

  it('survives a reload when every attempt was lost: the new page retries the same key', async () => {
    failGuidedRequests('start', 'network', { afterProcessing: true, times: 3 });
    const first = mount();
    await act(async () => {
      await expect(first.result.current.startLearn(await context())).rejects.toBeTruthy();
    });
    expect(guidedSessionsForTest(TEST.id)).toHaveLength(1);
    expect(pointer()?.sessionId).toBeNull();
    const key = pointer()?.startKey;
    first.unmount();
    resetGuidedSessionRuntime(); // a reload forgets every in-memory latch

    const second = mount();
    await waitFor(() => expect(second.result.current.view).not.toBeNull());
    expect(guidedRequestCount('start', { executedOnly: true })).toBe(1);
    expect(guidedSessionsForTest(TEST.id)).toHaveLength(1);
    expect(starts().map((entry) => entry.idempotencyKey)).toEqual([key, key, key, key]);
    await runToSuccess(second.result);
  });

  it('a finalize that never arrived is repeated under the same key and publishes once', async () => {
    failGuidedRequests('finalize', 'network');
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    const finalizes = guidedRequestLog().filter((entry) => entry.operation === 'finalize');
    expect(finalizes).toHaveLength(2);
    expect(finalizes[0].idempotencyKey).toBe(finalizes[1].idempotencyKey);
    expect(finalizes.filter((entry) => entry.status === 200)).toHaveLength(1);
    expect(result.current.result?.publication.status).toBe('PUBLISHED');
  });

  it('a finalize processed but unanswered is not sent again: the next read shows the publication', async () => {
    failGuidedRequests('finalize', 'network', { afterProcessing: true });
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    expect(guidedRequestCount('finalize')).toBe(1);
    expect(result.current.result?.publication.status).toBe('PUBLISHED');
  });
});

describe('a reload', () => {
  it('resumes the running session by sessionId and never posts start again', async () => {
    const first = mount();
    await act(async () => first.result.current.startLearn(await context()));
    const sessionId = first.result.current.view?.session.sessionId;
    first.unmount();
    resetGuidedSessionRuntime();

    const second = mount(TEST.id, { store: makeStore() });
    await waitFor(() => expect(second.result.current.view?.session.sessionId).toBe(sessionId));
    await runToSuccess(second.result);
    expect(guidedRequestCount('start')).toBe(1);
    expect(guidedRequestCount('finalize', { executedOnly: true })).toBe(1);
  });

  it('shows the finished result after a reload, from the pointer alone', async () => {
    const first = mount();
    await act(async () => first.result.current.startLearn(await context()));
    await runToSuccess(first.result);
    first.unmount();
    resetGuidedSessionRuntime();

    const second = mount(TEST.id, { store: makeStore() });
    await runToSuccess(second.result);
    expect(second.result.current.result?.publication.status).toBe('PUBLISHED');
    expect(guidedRequestCount('start')).toBe(1);
    expect(guidedRequestCount('finalize')).toBe(1);
  });

  it('a reload at FINALIZING sends finalize under the key the pointer holds', async () => {
    // The first page polls once and is gone; the session is then driven to FINALIZING without it.
    const first = mount(TEST.id, { hook: { pollIntervalMs: 100_000, retryDelayMs: 5 } });
    await act(async () => first.result.current.startLearn(await context()));
    const sessionId = first.result.current.view?.session.sessionId as string;
    const finalizeKey = pointer()?.finalizeKey;
    first.unmount();
    resetGuidedSessionRuntime();
    for (let index = 0; index < 40; index += 1) {
      const body = (await (await fetch(`http://localhost/api/v1/studio/guided-sessions/${sessionId}`)).json()) as {
        session: { state: string };
      };
      if (body.session.state === 'FINALIZING') break;
    }
    expect(guidedRequestCount('finalize')).toBe(0);

    const second = mount(TEST.id, { store: makeStore() });
    await runToSuccess(second.result);
    const finalizes = guidedRequestLog().filter((entry) => entry.operation === 'finalize');
    expect(finalizes.map((entry) => entry.idempotencyKey)).toEqual([finalizeKey]);
    expect(guidedRequestCount('start')).toBe(1);
  });
});

describe('StrictMode and racing instances', () => {
  it('a strict-mode mount runs one learn: one start, one finalize', async () => {
    // Slow server: polls keep arriving while the first start and finalize are still in flight.
    setGuidedLatency('start', 60);
    setGuidedLatency('finalize', 80);
    const { result } = mount(TEST.id, { strict: true });
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    expect(guidedRequestCount('start')).toBe(1);
    expect(guidedRequestCount('finalize')).toBe(1);
    expect(guidedSessionsForTest(TEST.id)).toHaveLength(1);
  });

  it('a strict-mode mount that resumes a lost start posts it once', async () => {
    // A pointer without a sessionId is what a lost response leaves behind.
    const input = await context();
    window.sessionStorage.setItem(
      guidedSessionStorageKey(TEST.id),
      JSON.stringify({ testId: TEST.id, sessionId: null, startKey: 'resume-key', finalizeKey: 'fin-key', startRequest: input }),
    );
    setGuidedLatency('start', 60);
    const { result } = mount(TEST.id, { strict: true });
    await waitFor(() => expect(result.current.view).not.toBeNull());
    expect(guidedRequestCount('start')).toBe(1);
    expect(guidedRequestLog()[0].idempotencyKey).toBe('resume-key');
    await runToSuccess(result);
    expect(guidedRequestCount('finalize')).toBe(1);
  });

  it('two instances following the same session finalize once between them', async () => {
    setGuidedLatency('finalize', 80);
    const store = makeStore();
    const a = mount(TEST.id, { store });
    const b = mount(TEST.id, { store });
    await act(async () => a.result.current.startLearn(await context()));
    await runToSuccess(a.result);
    await runToSuccess(b.result);
    expect(guidedRequestCount('finalize')).toBe(1);
    expect(guidedRequestCount('start')).toBe(1);
  });

  it('startLearn while a session is running is ignored', async () => {
    const { result } = mount();
    const input = await context();
    await act(async () => result.current.startLearn(input));
    await act(async () => result.current.startLearn(input));
    await act(async () => result.current.startLearn(input));
    expect(guidedRequestCount('start')).toBe(1);
  });

  it('a double click while the start is in flight sends one start', async () => {
    setGuidedLatency('start', 60);
    const { result } = mount();
    const input = await context();
    await act(async () => {
      await Promise.all([result.current.startLearn(input), result.current.startLearn(input)]);
    });
    expect(guidedRequestCount('start')).toBe(1);
    expect(guidedSessionsForTest(TEST.id)).toHaveLength(1);
  });
});

describe('refusals and HTTP outcomes', () => {
  it.each([
    ['FIRST_LEARN_STEP_NARROWED' as const, 409, 'FIRST_LEARN_STEP_NARROWED'],
    ['BASE_IDENTITY_INCOMPLETE' as const, 409, 'BASE_IDENTITY_INCOMPLETE'],
    ['RUNTIME_INCOMPATIBLE' as const, 409, 'RUNTIME_INCOMPATIBLE'],
    ['FORBIDDEN_SCOPE' as const, 403, 'ACCESS_DENIED'],
  ])('a start refused with %s sets startRefusal, keeps no pointer and polls nothing', async (name, status, messageCode) => {
    setGuidedScenario(refusesStart(name));
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    expect(result.current.startRefusal).toMatchObject({ httpStatus: status, error: { messageCode } });
    expect(result.current.view).toBeNull();
    expect(pointer()).toBeNull();
    await idle(40);
    expect(guidedRequestCount('read')).toBe(0);
    expect(guidedRequestCount('start')).toBe(1);
  });

  it('a budget refusal carries Retry-After, and a retry is a new logical start', async () => {
    setGuidedScenario(refusesStart('CSI_CONCURRENT_SESSIONS_EXHAUSTED'));
    const { result } = mount();
    const input = await context();
    await act(async () => result.current.startLearn(input));
    expect(result.current.startRefusal).toMatchObject({
      httpStatus: 429,
      retryAfterSeconds: GUIDED_START_REFUSALS.CSI_CONCURRENT_SESSIONS_EXHAUSTED().retryAfterSeconds,
      error: { code: 'BUDGET_EXCEEDED', retryable: true },
    });
    setGuidedScenario(LEARN_SCENARIO);
    await act(async () => result.current.startLearn(input));
    expect(result.current.startRefusal).toBeNull();
    await waitFor(() => expect(result.current.view).not.toBeNull());
    const keys = guidedRequestLog().filter((entry) => entry.operation === 'start').map((entry) => entry.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  it('a platform RATE_LIMITED start is reported by its platform code', async () => {
    setGuidedScenario(refusesStart('RATE_LIMITED'));
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    expect(result.current.startRefusal).toEqual({
      httpStatus: 429,
      error: null,
      platformCode: 'RATE_LIMITED',
      retryAfterSeconds: 5,
    });
  });

  it('a 401 on start is pending re-authentication and keeps the pointer', async () => {
    failGuidedRequests('start', UNAUTHENTICATED_REFUSAL());
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    expect(result.current.pending).toBe('REAUTHENTICATION_REQUIRED');
    expect(result.current.startRefusal).toBeNull();
    expect(pointer()).toMatchObject({ sessionId: null });
  });

  it('a 401 while polling stops polling, keeps the pointer, and is never a success', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    failGuidedRequests('read', UNAUTHENTICATED_REFUSAL(), { times: 100 });
    await waitFor(() => expect(result.current.pending).toBe('REAUTHENTICATION_REQUIRED'));
    const reads = guidedRequestCount('read');
    await idle(40);
    expect(guidedRequestCount('read')).toBe(reads);
    expect(pointer()?.sessionId).toBe(result.current.view?.session.sessionId);
    expect(result.current.result).toBeNull();
  });

  it('a 503 while polling is NOT_READY and the poll recovers', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    // apiClient retries a failed GET twice (200 ms, then 400 ms), so each poll consumes three
    // answers; two polls' worth keeps the outage visible long enough to observe.
    failGuidedRequests('read', GUIDED_START_REFUSALS.UNAVAILABLE(), { times: 6 });
    await waitFor(() => expect(result.current.pending).toBe('NOT_READY'), { timeout: 3000 });
    await waitFor(() => expect(result.current.result?.outcome).toBe('SUCCEEDED'), { timeout: 8000 });
    expect(result.current.pending).toBeNull();
  }, 15000);

  it('a 403 while polling forgets the session and the pointer', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    failGuidedRequests('read', GUIDED_START_REFUSALS.FORBIDDEN_SCOPE(), { times: 100 });
    await waitFor(() => expect(result.current.view).toBeNull());
    expect(pointer()).toBeNull();
    const reads = guidedRequestCount('read');
    await idle(40);
    expect(guidedRequestCount('read')).toBe(reads);
  });

  it('a finalize the server refuses is NOT_READY and is not sent again', async () => {
    failGuidedRequests('finalize', GUIDED_START_REFUSALS.RUNTIME_INCOMPATIBLE(), { times: 100 });
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.pending).toBe('NOT_READY'));
    await idle(60);
    expect(guidedRequestCount('finalize')).toBe(1);
    expect(result.current.view?.session.state).toBe('FINALIZING');
    expect(result.current.pending).toBe('NOT_READY');
    expect(result.current.result?.publication?.status ?? 'NONE').not.toBe('PUBLISHED');
  });

  it('a 401 on finalize is pending re-authentication: finalize is sent once, polling stops, and the pointer is kept (tech gate L5b)', async () => {
    failGuidedRequests('finalize', UNAUTHENTICATED_REFUSAL(), { times: 100 });
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.pending).toBe('REAUTHENTICATION_REQUIRED'));
    // Not one resend per poll: each 401 asks the platform to log in again (apiClient), so a poll that
    // kept resending would be a login storm. The session stays in FINALIZING and is never a success.
    await idle(80);
    expect(guidedRequestCount('finalize')).toBe(1);
    const reads = guidedRequestCount('read');
    await idle(40);
    expect(guidedRequestCount('read')).toBe(reads);
    expect(guidedRequestCount('finalize')).toBe(1);
    expect(result.current.view?.session.state).toBe('FINALIZING');
    expect(result.current.pending).toBe('REAUTHENTICATION_REQUIRED');
    expect(result.current.result?.publication?.status ?? 'NONE').not.toBe('PUBLISHED');
    expect(pointer()?.sessionId).toBe(result.current.view?.session.sessionId);
  });

  it('retryFinalize after a 401 on finalize sends finalize once more under the same key and the session finishes (E2E-012)', async () => {
    failGuidedRequests('finalize', UNAUTHENTICATED_REFUSAL(), { times: 1 });
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await waitFor(() => expect(result.current.pending).toBe('REAUTHENTICATION_REQUIRED'));
    await idle(40);
    expect(guidedRequestCount('finalize')).toBe(1);

    act(() => result.current.retryFinalize());
    await runToSuccess(result);
    expect(guidedRequestCount('finalize')).toBe(2);
    expect(result.current.pending).toBeNull();
  });

  it('after a 401 on finalize, a reload resumes by GET and sends the same finalize key once more (tech gate L5b)', async () => {
    failGuidedRequests('finalize', UNAUTHENTICATED_REFUSAL(), { times: 1 });
    const first = mount();
    await act(async () => first.result.current.startLearn(await context()));
    await waitFor(() => expect(first.result.current.pending).toBe('REAUTHENTICATION_REQUIRED'));
    await idle(40);
    expect(guidedRequestCount('finalize')).toBe(1);
    first.unmount();

    // The reload: memory is gone, the sessionStorage pointer survives, and the person has signed in.
    resetGuidedSessionRuntime();
    const second = mount(TEST.id, { store: makeStore() });
    await runToSuccess(second.result);
    expect(guidedRequestCount('start')).toBe(1);
    const finalizes = guidedRequestLog().filter((entry) => entry.operation === 'finalize');
    expect(finalizes).toHaveLength(2);
    expect(new Set(finalizes.map((entry) => entry.idempotencyKey)).size).toBe(1);
    expect(second.result.current.pending).toBeNull();
  });

  it('a finalize that gets a 503 is retried and then publishes', async () => {
    failGuidedRequests('finalize', GUIDED_START_REFUSALS.UNAVAILABLE(), { times: 2 });
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    await runToSuccess(result);
    expect(guidedRequestCount('finalize')).toBe(3);
    expect(new Set(guidedRequestLog().filter((entry) => entry.operation === 'finalize').map((entry) => entry.idempotencyKey)).size).toBe(1);
    expect(result.current.pending).toBeNull();
  });

  it('refuses a start request for another test', async () => {
    const { result } = mount();
    const input = { ...(await context()), testId: 'b0000000-0000-0000-0000-000000000002' };
    await act(async () => {
      await expect(result.current.startLearn(input)).rejects.toThrow(/another test/u);
    });
    expect(guidedRequestCount('start')).toBe(0);
  });
});

describe('clear and a new run', () => {
  it('clear forgets the session, the pointer and the polling, and sends nothing', async () => {
    const { result } = mount();
    await act(async () => result.current.startLearn(await context()));
    const before = guidedRequestLog().length;
    act(() => result.current.clear());
    expect(result.current.view).toBeNull();
    expect(pointer()).toBeNull();
    await idle(40);
    expect(guidedRequestLog().length).toBeLessThanOrEqual(before + 1); // at most one read already in flight
  });

  it('after a finished session a new startLearn is a new logical operation with new keys', async () => {
    const { result } = mount();
    const input = await context();
    await act(async () => result.current.startLearn(input));
    await runToSuccess(result);
    const first = guidedRequestLog().find((entry) => entry.operation === 'start')?.idempotencyKey;
    await act(async () => result.current.startLearn(input));
    await waitFor(() => expect(guidedRequestCount('start')).toBe(2));
    const keys = guidedRequestLog().filter((entry) => entry.operation === 'start').map((entry) => entry.idempotencyKey);
    expect(keys[0]).toBe(first);
    expect(keys[1]).not.toBe(first);
    expect(guidedSessionsForTest(TEST.id)).toHaveLength(2);
  });

  it('a null test id follows nothing and sends nothing', async () => {
    const { result } = mount(null);
    await act(async () => result.current.startLearn(await context()));
    expect(result.current.view).toBeNull();
    expect(guidedRequestLog()).toEqual([]);
  });
});

describe('unreadable (F-L5b-3; W5-3)', () => {
  const OTHER = draftsByReadiness.READY.id;

  /** A session this tab started and left behind: only its pointer survives, as after a reload. */
  async function startedSession(): Promise<string> {
    const first = mount();
    await act(async () => first.result.current.startLearn(await context()));
    const sessionId = first.result.current.view?.session.sessionId as string;
    first.unmount();
    resetGuidedSessionRuntime();
    return sessionId;
  }

  /** Mounts the hook on a new store, recording `unreadable` and `pending` of every render. */
  function mountRecording(testId: string) {
    const store = makeStore();
    const seen: boolean[] = [];
    const seenPending: Array<GuidedPendingReason | null> = [];
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StoreProvider, { store }, children);
    const rendered = renderHook(
      ({ id }: { id: string }) => {
        const current = useGuidedSession(id, FAST);
        seen.push(current.unreadable);
        seenPending.push(current.pending);
        return current;
      },
      { wrapper, initialProps: { id: testId } },
    );
    return { ...rendered, store, seen, seenPending };
  }

  const CONFLICT = { status: 409, body: guidedError('REVISION_CONFLICT') } as const;
  const FORBIDDEN = { status: 403, body: guidedError('FORBIDDEN_SCOPE', { messageCode: 'ACCESS_DENIED' }) } as const;

  it('H1: a 409 read of a stored session that never loaded is unreadable, keeps the pointer, and is read once', async () => {
    const sessionId = await startedSession();
    const readsBefore = guidedRequestCount('read');
    failGuidedRequests('read', CONFLICT, { times: 100 });
    const { result } = mountRecording(TEST.id);

    await waitFor(() => expect(result.current.unreadable).toBe(true));
    expect(result.current.view).toBeNull();
    expect(result.current.pending).toBe('NOT_READY');
    expect(pointer()?.sessionId).toBe(sessionId);
    await idle(40);
    expect(guidedRequestCount('read') - readsBefore).toBe(1);
  });

  it('H2: a 503 read is not unreadable: it keeps polling, and the view loads once the server answers', async () => {
    await startedSession();
    failGuidedRequests('read', GUIDED_START_REFUSALS.UNAVAILABLE(), { times: 3 });
    const { result, seen, seenPending } = mountRecording(TEST.id);

    await waitFor(() => expect(result.current.view).not.toBeNull());
    expect(seenPending).toContain('NOT_READY');
    expect(seen).not.toContain(true);
    expect(result.current.unreadable).toBe(false);
  });

  it('H3: no response at all is not unreadable either, and the view loads later', async () => {
    await startedSession();
    failGuidedRequests('read', 'network', { times: 3 });
    const { result, seen } = mountRecording(TEST.id);

    await waitFor(() => expect(result.current.view).not.toBeNull());
    expect(seen).not.toContain(true);
    expect(result.current.unreadable).toBe(false);
  });

  it('H4: a 403 forgets the pointer and is never unreadable', async () => {
    await startedSession();
    expect(pointer()).not.toBeNull();
    failGuidedRequests('read', FORBIDDEN, { times: 100 });
    const { result, seen } = mountRecording(TEST.id);

    await waitFor(() => expect(pointer()).toBeNull());
    await idle(30);
    expect(result.current.view).toBeNull();
    expect(seen).not.toContain(true);
    expect(result.current.unreadable).toBe(false);
  });

  it('H5: unreadable is reset by a successful read, and a switch to another test and back does not leave it set', async () => {
    await startedSession();
    failGuidedRequests('read', CONFLICT, { times: 1 });
    const { result, rerender } = mountRecording(TEST.id);

    await waitFor(() => expect(result.current.unreadable).toBe(true));
    rerender({ id: OTHER });
    expect(result.current.unreadable).toBe(false);
    rerender({ id: TEST.id });

    await waitFor(() => expect(result.current.view).not.toBeNull());
    await waitFor(() => expect(result.current.unreadable).toBe(false));
  });

  it('H6: clear() on an unreadable session resets the flag, forgets the pointer, and sends nothing', async () => {
    await startedSession();
    failGuidedRequests('read', CONFLICT, { times: 100 });
    const { result } = mountRecording(TEST.id);
    await waitFor(() => expect(result.current.unreadable).toBe(true));

    const logged = guidedRequestLog().length;
    act(() => result.current.clear());
    expect(result.current.unreadable).toBe(false);
    expect(pointer()).toBeNull();
    expect(result.current.view).toBeNull();
    await idle(40);
    expect(guidedRequestLog().length).toBe(logged);
  });
});

describe('a long model wait (R9)', () => {
  /** Every learn step and the plan call go through a slow model: a learn can sit in one state for minutes. */
  const POLLS = 180;

  it('keeps following a session that stays non-terminal for 180 polls: no timeout, no error, polling never stops', async () => {
    const first = mount();
    await act(async () => first.result.current.startLearn(await context()));
    const started = first.result.current.view!;
    first.unmount();
    resetGuidedSessionRuntime();

    const running = { ...started, session: { ...started.session, state: 'OBSERVING' as const } };
    const readSession = vi.spyOn(studioGuidedApi, 'readSession').mockResolvedValue(running);
    const readResult = vi.spyOn(studioGuidedApi, 'readResult');
    vi.useFakeTimers();
    try {
      // Default poll interval (1 s): 180 polls is three minutes of waiting on one step.
      const { result } = mount(TEST.id, { store: makeStore(), hook: {} });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLLS * 1000);
      });
      expect(readSession.mock.calls.length).toBeGreaterThanOrEqual(POLLS);
      expect(result.current.view?.session.state).toBe('OBSERVING');
      expect(result.current.result).toBeNull();
      expect(result.current.pending).toBeNull();
      expect(result.current.unreadable).toBe(false);
      expect(result.current.startRefusal).toBeNull();
      expect(readResult).not.toHaveBeenCalled();
      expect(pointer()?.sessionId).toBe(started.session.sessionId);

      // Still alive after the long wait: it keeps polling.
      const before = readSession.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(readSession.mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  }, 30000);
});
