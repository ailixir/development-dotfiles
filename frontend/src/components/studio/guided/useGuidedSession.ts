import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import {
  clarifyBodyFor,
  finalizeBodyFrom,
  httpStatusOf,
  newGuidedIdempotencyKey,
  startBodyFrom,
  studioGuidedApi,
  toGuidedStartRefusal,
  USER_CANCEL_BODY,
} from '@/services/api/studioGuidedApi';
import { useAppDispatch, useAppSelector, type RootState } from '@/store';
import {
  clearGuidedSession,
  setGuidedClarification,
  recordGuidedAnsweredStep,
  setGuidedResult,
  setGuidedSession,
  setGuidedSessionView,
} from '@/store/slices/studioSlice';
import {
  guidedSessionStorageKey,
  isGuidedTerminalState,
  type GuidedClarification,
  type GuidedPendingReason,
  type GuidedResult,
  type GuidedSessionPointer,
  type GuidedSessionView,
  type GuidedStartRefusal,
  type GuidedStartRequest,
} from '@/types/studio/studioGuidedTypes';

/**
 * The guided-session hook (STUDIO-OBS-008 AC-2, lane L2b).
 *
 * It follows one guided learning session for a persisted test: `startLearn` posts the start
 * request, then a poll reads the session by `sessionId`, reads the pending question on
 * `AWAITING_CLARIFICATION`, finalizes exactly once on `FINALIZING`, and reads the result after a
 * terminal state. The page mounts it once; components below it take its return value as props.
 *
 * What makes a retry safe (D-1, plan P6):
 *  - the `GuidedSessionPointer` (`sessionStorage`, `checks.studio.guided.v1:<testId>`) holds only
 *    `{testId, sessionId, startKey, finalizeKey, startRequest}`. It is written **before** the start
 *    POST, so a reload or a lost response retries the exact body under the exact key;
 *  - once a `sessionId` is known nothing ever re-POSTs start: reload and reconnect only GET;
 *  - finalize is a promise latch keyed by `sessionId`, shared by every hook instance, so a
 *    StrictMode double mount, a remount and a racing poll send it once. It uses the persisted
 *    `finalizeKey`, so even a reload at `FINALIZING` replays the same call;
 *  - clarify and cancel keys are minted once per logical operation and reused if the same
 *    operation is repeated (an in-memory memo; a reload starts a new operation, which the server
 *    treats as a no-op for a session that has already moved on).
 *
 * HTTP outcomes, each traced to `openapi.yaml`:
 *  - `401` (on a read or on finalize): `pending = REAUTHENTICATION_REQUIRED`, polling stops, the
 *    pointer is kept, and finalize is not resent by the poll (a reload, or `retryFinalize`, sends it once more);
 *  - `403` ("Current CSI/scope entitlement denied"): the pointer and all state are forgotten;
 *  - `503` ("Current authority or Vault unavailable"): `pending = NOT_READY`, polling continues;
 *  - `400`/`409` on a read: `pending = NOT_READY`, polling stops. If no view of the session had
 *    loaded yet (a stored session read after a reload), `unreadable` is true: this hook keeps the
 *    pointer and `startLearn` starts nothing (tech gate L5b F-L5b-3; L5b-F2). The page then reads
 *    readiness once, and calls `clear()` only when that read answers `UNLEARNED` or `NEEDS_RELEARN`
 *    (ruling `w5-unreadable-and-alias.md` §2). A `401` before the first view is the same case;
 *  - `400`/`409` on finalize: `pending = NOT_READY`, the session stays in `FINALIZING`, and finalize
 *    is not sent again;
 *  - `202` on the result: `pending = PUBLICATION_PENDING`, never shown as success;
 *  - a start refused with `400`/`403`/`409`/`429`: `startRefusal` is set, the pointer is dropped
 *    (nothing was written), no session exists and nothing polls.
 * A call that gets no response at all (a network failure) is retried a bounded number of times for
 * start and finalize, and otherwise ignored by the poll.
 */
export interface UseGuidedSessionResult {
  /** The latest session view; `null` before a start or after {@link UseGuidedSessionResult.clear}. */
  view: GuidedSessionView | null;
  /** The result, once the session is terminal or finalizing. Check `publication.status`, never assume success. */
  result: GuidedResult | null;
  /** The pending question while the session is `AWAITING_CLARIFICATION`, else `null`. */
  clarification: GuidedClarification | null;
  /** Step numbers whose question the author answered during this session, ascending (SC008-FIX-24). */
  answeredSteps: readonly number[];
  /** The refusal of the last start (`409` / `429` / …). No session exists and nothing polls. */
  startRefusal: GuidedStartRefusal | null;
  /** Why the session is held without a final answer (re-authentication, not ready, publication pending). */
  pending: GuidedPendingReason | null;
  /**
   * True when the hook follows a stored session whose read was refused (`400`, `409` or `401`)
   * before any view of it loaded. The hook keeps the pointer and starts nothing; the page decides
   * from a fresh readiness read whether to `clear()` it (W5-1).
   */
  unreadable: boolean;
  /**
   * Starts a guided learning session for the test. `input` is the capability's exact
   * `guidedStart.context` plus the optional `baseRevisionId` / `firstLearnStepId` hints. The hook
   * mints and persists the start key and the exact body before the POST, and a lost response
   * retries both unchanged. Resolves when the start was answered or refused (see `startRefusal`
   * and `pending`); rejects only when no response ever arrived, with the pointer kept so a second
   * call (or a reload) retries the same request. A call while a session is still running is ignored.
   */
  startLearn: (input: GuidedStartRequest) => Promise<void>;
  /** Answers the pending question with a server `choiceId`, under a stable clarify key. */
  answer: (choiceId: string) => Promise<void>;
  /** Cancels with `{schemaVersion: 3, reason: 'userRequested'}` under a stable cancel key. */
  cancel: () => Promise<void>;
  /** Forgets the pointer, view, result and question for this test. Sends no request. */
  clear: () => void;
  /**
   * Sends a held finalize once more under the same persisted key and resumes polling. For a
   * session stuck in `FINALIZING` after a `401` (sign in again), a refused finalize or a finalize
   * that got no answer. Does nothing without a followed session.
   */
  retryFinalize: () => void;
}

/** Timing knobs. Tests pass small values; the defaults are for a person watching a run. */
export interface UseGuidedSessionOptions {
  /** Delay between polls of the session. Default 1000 ms. */
  pollIntervalMs?: number;
  /** Delay before retrying a start or finalize that got no response. Default 500 ms. */
  retryDelayMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_RETRY_DELAY_MS = 500;
/** One attempt plus two retries when a start or finalize gets no response. */
const MAX_NO_RESPONSE_ATTEMPTS = 3;
/**
 * A terminal result may still report the recording as `PROCESSING` (`readGuidedResult`), and the
 * client re-reads it until it settles. This bounds that loop so a recording that never settles does
 * not poll forever.
 */
const MAX_RESULT_READS = 60;

// ---------------------------------------------------------------------------
// Pointer (sessionStorage)
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown, max = 256): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

/**
 * The pointer for `testId`, or `null` when there is none or it is not exactly a pointer: the entry
 * holds those five fields and nothing else, so anything with another shape is dropped.
 */
export function readGuidedPointer(testId: string): GuidedSessionPointer | null {
  // An entry in memory exists only because the latest write to storage failed, so it is the newest.
  const unstored = memoryPointers.get(testId);
  if (unstored) return unstored;
  const store = storage();
  if (!store) return null;
  const key = guidedSessionStorageKey(testId);
  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    const entry = parsed as Record<string, unknown>;
    const request = entry.startRequest as Record<string, unknown> | undefined;
    const valid =
      Object.keys(entry).every((field) =>
        ['testId', 'sessionId', 'startKey', 'finalizeKey', 'startRequest'].includes(field),
      ) &&
      entry.testId === testId &&
      (entry.sessionId === null || isNonEmptyString(entry.sessionId)) &&
      isNonEmptyString(entry.startKey) &&
      isNonEmptyString(entry.finalizeKey) &&
      typeof request === 'object' &&
      request !== null &&
      request.testId === testId &&
      isNonEmptyString(request.sourceRevision) &&
      isNonEmptyString(request.configurationRevision) &&
      isNonEmptyString(request.environmentId);
    if (!valid) throw new Error('not a guided pointer');
    return {
      testId,
      sessionId: entry.sessionId as string | null,
      startKey: entry.startKey as string,
      finalizeKey: entry.finalizeKey as string,
      startRequest: startBodyFrom(request as unknown as GuidedStartRequest),
    };
  } catch {
    store.removeItem(key);
    return null;
  }
}

/**
 * The pointer of a test whose `sessionStorage` entry could not be written (storage full, blocked or
 * absent). Finalize needs the persisted key and the exact start body, so without this fallback a
 * session would reach `FINALIZING` and nothing would ever finalize it: AC-2's automatic finalize
 * would fail silently. It holds the same five fields as the stored entry, lives only in this page's
 * memory, and so loses only reload-resume, which is all a blocked storage can cost.
 */
const memoryPointers = new Map<string, GuidedSessionPointer>();

function writeGuidedPointer(pointer: GuidedSessionPointer): void {
  const entry: GuidedSessionPointer = {
    testId: pointer.testId,
    sessionId: pointer.sessionId,
    startKey: pointer.startKey,
    finalizeKey: pointer.finalizeKey,
    startRequest: startBodyFrom(pointer.startRequest),
  };
  const store = storage();
  try {
    if (!store) throw new Error('no sessionStorage');
    store.setItem(guidedSessionStorageKey(pointer.testId), JSON.stringify(entry));
    memoryPointers.delete(pointer.testId);
  } catch {
    // Storage full or blocked: the session still runs and still finalizes; only reload-resume is lost.
    memoryPointers.set(pointer.testId, entry);
  }
}

function removeGuidedPointer(testId: string): void {
  memoryPointers.delete(testId);
  try {
    storage()?.removeItem(guidedSessionStorageKey(testId));
  } catch {
    // Nothing to remove.
  }
}

// ---------------------------------------------------------------------------
// Process-wide latches (shared by every hook instance)
// ---------------------------------------------------------------------------

const startFlights = new Map<string, Promise<GuidedSessionView>>();
const mutationKeys = new Map<string, string>();
const mutationFlights = new Map<string, Promise<unknown>>();

/**
 * What one finalize attempt means for the poll that asked. `reauthenticate`: the server answered
 * `401`, so the poll stops (see {@link ensureFinalized}); anything else lets it carry on.
 */
type FinalizeOutcome = 'continue' | 'reauthenticate';

interface FinalizeLatch {
  promise: Promise<FinalizeOutcome> | null;
  /** Finalize will not be sent again. */
  settled: boolean;
  /** It settled because the server (or the retries) refused it: the session stays in FINALIZING. */
  refused: boolean;
  attempts: number;
}

const finalizeLatches = new Map<string, FinalizeLatch>();

/** Test hook: forgets every latch and memoized key. Production code never calls it. */
export function resetGuidedSessionRuntime(): void {
  startFlights.clear();
  memoryPointers.clear();
  mutationKeys.clear();
  mutationFlights.clear();
  finalizeLatches.clear();
}

function memoizedKey(logicalOperation: string): string {
  let key = mutationKeys.get(logicalOperation);
  if (!key) {
    key = newGuidedIdempotencyKey();
    mutationKeys.set(logicalOperation, key);
  }
  return key;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const sameRequest = (left: GuidedStartRequest, right: GuidedStartRequest): boolean =>
  JSON.stringify(startBodyFrom(left)) === JSON.stringify(startBodyFrom(right));

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

const NO_STEPS: readonly number[] = [];

export function useGuidedSession(
  testId: string | null,
  options?: UseGuidedSessionOptions,
): UseGuidedSessionResult {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const sessionId = useAppSelector((state) =>
    testId ? (state.studio.guidedSessionByTestId[testId] ?? null) : null,
  );
  const view = useAppSelector((state) =>
    sessionId ? (state.studio.guidedSessionViewById[sessionId] ?? null) : null,
  );
  const result = useAppSelector((state) =>
    sessionId ? (state.studio.guidedResultById[sessionId] ?? null) : null,
  );
  const clarification = useAppSelector((state) =>
    sessionId ? (state.studio.guidedClarificationById[sessionId] ?? null) : null,
  );
  const answeredSteps = useAppSelector((state) =>
    sessionId ? (state.studio.guidedAnsweredStepsById[sessionId] ?? NO_STEPS) : NO_STEPS,
  );
  const [startRefusal, setStartRefusal] = useState<GuidedStartRefusal | null>(null);
  const [pending, setPending] = useState<GuidedPendingReason | null>(null);
  /** The followed session whose read was refused before any view of it loaded (F-L5b-3). */
  const [unreadableSessionId, setUnreadableSessionId] = useState<string | null>(null);
  /** Bumped by `retryFinalize`; restarts the poll that a `401` on finalize stopped. */
  const [pollEpoch, setPollEpoch] = useState(0);

  const optionsRef = useRef<UseGuidedSessionOptions | undefined>(options);
  optionsRef.current = options;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const safeSetPending = useCallback((reason: GuidedPendingReason | null) => {
    if (mounted.current) setPending(reason);
  }, []);
  const safeSetRefusal = useCallback((refusal: GuidedStartRefusal | null) => {
    if (mounted.current) setStartRefusal(refusal);
  }, []);
  const safeSetUnreadable = useCallback((forSessionId: string | null) => {
    if (mounted.current) setUnreadableSessionId(forSessionId);
  }, []);

  const retryDelay = (): number => optionsRef.current?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  /** Forgets a session everywhere this hook keeps it. */
  const forget = useCallback(
    (forTestId: string, forSessionId: string | null) => {
      removeGuidedPointer(forTestId);
      if (forSessionId) finalizeLatches.delete(forSessionId);
      dispatch(clearGuidedSession({ testId: forTestId }));
    },
    [dispatch],
  );

  /**
   * One logical start: the exact pointer body and key, retried only when no response arrives. The
   * flight is shared by every caller of the same key and writes the `sessionId` into the pointer
   * itself, so a remount that arrives afterwards finds a session and sends nothing.
   */
  const performStart = useCallback(
    async (pointer: GuidedSessionPointer): Promise<void> => {
      let flight = startFlights.get(pointer.startKey);
      if (!flight) {
        flight = (async () => {
          let attempt = 0;
          for (;;) {
            attempt += 1;
            try {
              const started = await studioGuidedApi.startSession(pointer.startRequest, pointer.startKey);
              writeGuidedPointer({ ...pointer, sessionId: started.session.sessionId });
              return started;
            } catch (error) {
              if (httpStatusOf(error) !== null || attempt >= MAX_NO_RESPONSE_ATTEMPTS) throw error;
              await delay(retryDelay());
            }
          }
        })();
        startFlights.set(pointer.startKey, flight);
        const release = (): void => {
          startFlights.delete(pointer.startKey);
        };
        flight.then(release, release);
      }
      try {
        const started = await flight;
        dispatch(setGuidedSession({ testId: pointer.testId, sessionId: started.session.sessionId }));
        dispatch(setGuidedSessionView(started));
        safeSetPending(null);
      } catch (error) {
        const status = httpStatusOf(error);
        if (status === null) throw error; // no response: pointer kept, the caller may retry
        if (status === 401) {
          safeSetPending('REAUTHENTICATION_REQUIRED');
          return;
        }
        if (status === 503) {
          safeSetPending('NOT_READY');
          return;
        }
        // A definitive refusal: nothing was written, so there is nothing to resume.
        removeGuidedPointer(pointer.testId);
        safeSetRefusal(toGuidedStartRefusal(error));
      }
    },
    // retryDelay reads a ref, so it is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, safeSetPending, safeSetRefusal],
  );

  // Hydrate from the pointer when the test changes: resume a known session, or retry a start whose
  // response was lost with the exact body and key.
  useEffect(() => {
    safeSetPending(null);
    safeSetRefusal(null);
    if (!testId) return;
    const pointer = readGuidedPointer(testId);
    if (!pointer) return;
    if (pointer.sessionId) {
      dispatch(setGuidedSession({ testId, sessionId: pointer.sessionId }));
      return;
    }
    performStart(pointer).catch(() => undefined);
  }, [testId, dispatch, performStart, safeSetPending, safeSetRefusal]);

  // Finalize: sent once per session, whoever asks.
  //
  // A `401` is not retried by the poll. It is the same answer a `401` on a read gets: pending
  // re-authentication, the pointer kept, polling stopped. Every `401` also asks the platform to sign
  // the person in again (`apiClient`), so a poll that resent finalize on each tick while the `401`
  // persisted would be a request and sign-in storm. The latch stays open, so a reload (or a new poll,
  // after the person has signed in) sends finalize once more under the same persisted key.
  const ensureFinalized = useCallback(
    async (forTestId: string, forSessionId: string): Promise<FinalizeOutcome> => {
      let latch = finalizeLatches.get(forSessionId);
      if (!latch) {
        latch = { promise: null, settled: false, refused: false, attempts: 0 };
        finalizeLatches.set(forSessionId, latch);
      }
      if (latch.settled) {
        if (latch.refused) safeSetPending('NOT_READY');
        return 'continue';
      }
      let attempt = latch.promise;
      if (!attempt) {
        const pointer = readGuidedPointer(forTestId);
        if (!pointer) return 'continue';
        const state = latch;
        state.attempts += 1;
        attempt = state.promise = (async (): Promise<FinalizeOutcome> => {
          try {
            await studioGuidedApi.finalize(
              forSessionId,
              finalizeBodyFrom(pointer.startRequest),
              pointer.finalizeKey,
            );
            state.settled = true;
            safeSetPending(null);
            return 'continue';
          } catch (error) {
            const status = httpStatusOf(error);
            if (status === 401) {
              safeSetPending('REAUTHENTICATION_REQUIRED');
              return 'reauthenticate';
            }
            if (status === 503 || status === null) {
              safeSetPending('NOT_READY');
              if (state.attempts >= MAX_NO_RESPONSE_ATTEMPTS) {
                state.settled = true;
                state.refused = true;
              }
            } else {
              safeSetPending('NOT_READY');
              state.settled = true;
              state.refused = true;
            }
            return 'continue';
          } finally {
            state.promise = null;
          }
        })();
      }
      return attempt;
    },
    [safeSetPending],
  );

  // Poll the session while one is known.
  useEffect(() => {
    if (!testId || !sessionId) return undefined;
    const run = { active: true };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resultReads = 0;
    let terminalSeen = false;

    const stopped = (): boolean => !run.active;

    const pollOnce = async (): Promise<'continue' | 'stop'> => {
      try {
        if (!terminalSeen) {
          const next = await studioGuidedApi.readSession(sessionId);
          if (stopped()) return 'stop';
          safeSetUnreadable(null);
          dispatch(setGuidedSessionView(next));
          const state = next.session.state;
          if (state !== 'FINALIZING') safeSetPending(null);
          if (state === 'AWAITING_CLARIFICATION') {
            const question = await studioGuidedApi.readClarification(sessionId);
            if (stopped()) return 'stop';
            dispatch(setGuidedClarification({ sessionId, clarification: question }));
          } else if (store.getState().studio.guidedClarificationById[sessionId]) {
            dispatch(setGuidedClarification({ sessionId, clarification: null }));
          }
          if (state === 'FINALIZING') {
            const finalized = await ensureFinalized(testId, sessionId);
            if (stopped()) return 'stop';
            return finalized === 'reauthenticate' ? 'stop' : 'continue';
          }
          if (!isGuidedTerminalState(state)) return 'continue';
          terminalSeen = true;
        }
        const read = await studioGuidedApi.readResult(sessionId);
        if (stopped()) return 'stop';
        resultReads += 1;
        dispatch(setGuidedResult(read.result));
        safeSetPending(read.status === 'pending' ? 'PUBLICATION_PENDING' : null);
        // A learn that published has no learning recording (its proof is the replay in `result.proof`),
        // so it settles at `final`. A learn that did not publish keeps its recording: wait until that
        // recording leaves `PROCESSING`, so it appears without a reload.
        const settled =
          read.status === 'final' &&
          (read.result.publication.status === 'PUBLISHED' ||
            read.result.evidence.video === null ||
            read.result.evidence.video.status !== 'PROCESSING');
        return settled || resultReads >= MAX_RESULT_READS ? 'stop' : 'continue';
      } catch (error) {
        if (stopped()) return 'stop';
        const status = httpStatusOf(error);
        // A refused read of a session no view of which ever loaded: keep the pointer, start nothing,
        // and let the page say so (F-L5b-3). 403 forgets, 503 and no response keep polling.
        const neverRead = !terminalSeen && !store.getState().studio.guidedSessionViewById[sessionId];
        if (neverRead && status !== null && status !== 403 && status !== 503) {
          safeSetUnreadable(sessionId);
        }
        if (status === 401) {
          safeSetPending('REAUTHENTICATION_REQUIRED');
          return 'stop';
        }
        if (status === 403) {
          forget(testId, sessionId);
          safeSetPending(null);
          return 'stop';
        }
        if (status === 503) {
          safeSetPending('NOT_READY');
          return 'continue';
        }
        if (status === null) return 'continue';
        safeSetPending('NOT_READY');
        return 'stop';
      }
    };

    const loop = async (): Promise<void> => {
      while (!stopped()) {
        if ((await pollOnce()) === 'stop') return;
        if (stopped()) return;
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, optionsRef.current?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
        });
      }
    };
    void loop();

    return () => {
      run.active = false;
      if (timer) clearTimeout(timer);
    };
  }, [testId, sessionId, pollEpoch, dispatch, store, ensureFinalized, forget, safeSetPending, safeSetUnreadable]);

  const retryFinalize = useCallback((): void => {
    if (!sessionId) return;
    finalizeLatches.delete(sessionId);
    safeSetPending(null);
    setPollEpoch((epoch) => epoch + 1);
  }, [sessionId, safeSetPending]);

  const startLearn = useCallback(
    async (input: GuidedStartRequest): Promise<void> => {
      if (!testId) return;
      const body = startBodyFrom(input);
      if (body.testId !== testId) {
        throw new Error('The start request is for another test than the one this hook follows.');
      }
      const studio = store.getState().studio;
      const known = studio.guidedSessionByTestId[testId];
      if (known) {
        const current = studio.guidedSessionViewById[known];
        // Once a sessionId is known nothing re-POSTs start for it.
        if (!current || !isGuidedTerminalState(current.session.state)) return;
        // The session ended: this call is a new logical operation.
        forget(testId, known);
      }
      const existing = readGuidedPointer(testId);
      const pointer: GuidedSessionPointer =
        existing && existing.sessionId === null && sameRequest(existing.startRequest, body)
          ? existing
          : {
              testId,
              sessionId: null,
              startKey: newGuidedIdempotencyKey(),
              finalizeKey: newGuidedIdempotencyKey(),
              startRequest: body,
            };
      writeGuidedPointer(pointer);
      safeSetRefusal(null);
      safeSetPending(null);
      await performStart(pointer);
    },
    [testId, store, forget, performStart, safeSetRefusal, safeSetPending],
  );

  /** One keyed mutation, shared by concurrent callers, with the common HTTP outcomes mapped. */
  const mutate = useCallback(
    async <T,>(logicalOperation: string, send: (key: string) => Promise<T>): Promise<T | null> => {
      let flight = mutationFlights.get(logicalOperation) as Promise<T> | undefined;
      if (!flight) {
        flight = send(memoizedKey(logicalOperation));
        mutationFlights.set(logicalOperation, flight);
        const release = (): void => {
          mutationFlights.delete(logicalOperation);
        };
        flight.then(release, release);
      }
      try {
        return await flight;
      } catch (error) {
        const status = httpStatusOf(error);
        if (status === 401) safeSetPending('REAUTHENTICATION_REQUIRED');
        else if (status === 503) safeSetPending('NOT_READY');
        return null;
      }
    },
    [safeSetPending],
  );

  const answer = useCallback(
    async (choiceId: string): Promise<void> => {
      if (!sessionId) return;
      const question = store.getState().studio.guidedClarificationById[sessionId];
      if (!question) return;
      const logical = `clarify:${sessionId}:${question.clarificationId}:${question.generation}:${choiceId}`;
      const session = await mutate(logical, (key) =>
        studioGuidedApi.clarify(sessionId, clarifyBodyFor(question, choiceId), key),
      );
      if (session) {
        // The question is about the session's active step (P2); remember it for the completion note.
        const stepNumber = store.getState().studio.guidedSessionViewById[sessionId]?.session.progress.activeStep?.number;
        if (stepNumber !== undefined) dispatch(recordGuidedAnsweredStep({ sessionId, stepNumber }));
        dispatch(setGuidedSessionView({ schemaVersion: 3, session, result: null }));
        dispatch(setGuidedClarification({ sessionId, clarification: null }));
        safeSetPending(null);
      }
    },
    [sessionId, store, dispatch, mutate, safeSetPending],
  );

  const cancel = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    const session = await mutate(`cancel:${sessionId}`, (key) =>
      studioGuidedApi.cancel(sessionId, USER_CANCEL_BODY, key),
    );
    if (session) {
      dispatch(setGuidedSessionView({ schemaVersion: 3, session, result: null }));
      dispatch(setGuidedClarification({ sessionId, clarification: null }));
    }
  }, [sessionId, dispatch, mutate]);

  const clear = useCallback((): void => {
    if (!testId) return;
    forget(testId, sessionId);
    safeSetPending(null);
    safeSetRefusal(null);
    safeSetUnreadable(null);
  }, [testId, sessionId, forget, safeSetPending, safeSetRefusal, safeSetUnreadable]);

  const unreadable = unreadableSessionId !== null && unreadableSessionId === sessionId && view === null;

  return { view, result, clarification, answeredSteps, startRefusal, pending, unreadable, startLearn, answer, cancel, clear, retryFinalize };
}

export default useGuidedSession;
