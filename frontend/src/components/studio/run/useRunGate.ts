import { useCallback, useEffect, useRef, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import { studioSchedulesApi } from '@/services/api/studioSchedulesApi';
import type { CompileDiagnostics, CompileError, TestDto } from '@/types/studio/studioTypes';
import { runActionFor, runAvailableFor, type RunAction } from './runEnablement';
import { executeRefusalFor, type ExecuteRefusalNarrative } from './executeRefusals';
import {
  COMPILE_WATCH_WINDOW_MS,
  compilePollSchedule,
  RUN_POLL_SHAPE,
} from '../review/compilePollBounds';

/**
 * The Run control's one source of truth (story 10.11a, AC-1, AC-2, AC-4).
 *
 * The readiness fact comes from a single `GET /tests/{id}` body and from nothing else: not from
 * the list projection recombined with a detail read, not from a Redux slice, and — the point of
 * the story — not from the client's own opinion of the author's English. Story 10.10 made the same
 * argument for the saved body and it is the same argument here: a client that takes apart
 * facts the server returned together is asserting a correspondence the server never promised.
 *
 * ## Run is the action that prepares and then runs
 *
 * Saving used to compile in the background, which charged the author for translation work on every
 * keystroke-batch they saved, hid the cost, and — when the compile failed — left the draft `STALE`
 * with no way to ask again, because re-saving identical content is not a change and enqueued
 * nothing. Run now owns that work: save the draft if it is dirty, compile the saved revision if it
 * has no fresh artifact, then execute. One button, and the waiting is visible to the person who
 * asked for it.
 *
 * The server's own gate does not read `compileStatus` — it compares the confirmed revision's
 * revisions and hashes against the draft's. So `READY` is a hint, not a guarantee, and a
 * `409 COMPILE_REQUIRED` is the authority. One compile-then-execute retry answers it; a second
 * refusal is shown, because a client that retries a gate forever is arguing with it.
 *
 * A refusal is held until the next activation. `POST /tests/{id}/execute` refuses *before any
 * dispatch effect* — no execution row, no ledger row, no browser — so a refused activation leaves
 * the surface exactly as it was, and saying so is the whole content of the narratives.
 */

/**
 * How long Run waits for a compile before giving up (VAL-007 G4): the Code tab's watch window,
 * `studio.compile.abandonment.threshold` (300s) plus one `interval-ms` sweep pass (15s) = 315s.
 *
 * Not the attempt budget (240s): the server enforces that, and a compile that outlives it ends as
 * a declared state rather than as a silence. The case Run must outwait is the one where the server
 * itself went quiet — and a `COMPILING` row is swept to `STALE` at most one pass after it crosses
 * the threshold, so by the end of this window the server has answered. Giving up earlier reports
 * "took too long" moments before the answer; waiting longer watches for a transition that has
 * happened. `compileWaitBudget.test.ts` pins it to the window and to the shipped config.
 */
export const COMPILE_WAIT_BUDGET_MS = COMPILE_WATCH_WINDOW_MS;

/**
 * The delays between Run's reads while a compile settles (VAL-007 G3): 600ms, backing off ×1.6 to
 * a 5s ceiling, restarting for every compile. Derived from the same window it is bounded by.
 */
export const RUN_COMPILE_POLL_DELAYS_MS: readonly number[] = compilePollSchedule(
  COMPILE_WAIT_BUDGET_MS,
  RUN_POLL_SHAPE,
);

/** The delay before the read after `attempt` reads, holding at the ceiling once it is reached. */
function runPollDelay(attempt: number): number {
  return RUN_COMPILE_POLL_DELAYS_MS[Math.min(attempt, RUN_COMPILE_POLL_DELAYS_MS.length - 1)];
}

export interface RunRefusalState {
  /** The wording, chosen by status and — for a `409` — by `error`. Never by the message. */
  readonly narrative: ExecuteRefusalNarrative;
  /** The server's own prose. Shown so it can be quoted; never parsed. */
  readonly serverMessage: string;
  /** The `error` the server sent, or `''`. Shown for an undeclared code, never branched twice. */
  readonly serverCode: string;
}

/** Why a compile started by Run did not produce something runnable. */
export type RunCompileOutcome =
  /** The validator refused the proposal. `diagnostics` carries the per-step reasons. */
  | { readonly kind: 'needsRevision'; readonly diagnostics: CompileDiagnostics | null }
  /** The attempt could not be completed — gateway, validator, pool, or budget. */
  | { readonly kind: 'failed'; readonly error: CompileError | null }
  /** A bound was refused before any compile state changed, so the draft is untouched. */
  | { readonly kind: 'refused'; readonly message: string; readonly code: string }
  /** The compile outlived {@link COMPILE_WAIT_BUDGET_MS}. The draft is unchanged. */
  | { readonly kind: 'timedOut' };

/** What Run is doing right now. */
export type RunPhase = 'idle' | 'saving' | 'compiling' | 'starting';

/** What an injected save reported. Run continues only on `saved`. */
export type RunSaveOutcome = 'saved' | 'conflict' | 'error';

export interface RunGateOptions {
  /**
   * Persists the author's unsaved edits. Run calls this first when {@link isDirty}.
   *
   * The page owns saving — it holds the draft, the revisions and the conflict alert — so Run asks
   * it rather than re-implementing a second save with a second idea of the revisions.
   */
  readonly saveBeforeRun?: () => Promise<RunSaveOutcome>;
  /** Whether the editor holds edits the server has not seen. */
  readonly isDirty?: boolean;
  /**
   * Whether the caller shows an accepted run as running (VAL-039). When given, an accepted
   * activation keeps the gate closed until the caller has shown that run and seen it end, so no
   * second activation can slip into the moment between acceptance and the caller's re-render.
   */
  readonly isRunning?: boolean;
}

/**
 * Whether the caller may start a run of this test, as far as the server has said (story 10.48).
 * `unknown` while the read is pending or after it failed: the server stays the authority, so only an
 * explicit `denied` disables Run.
 */
export type ExecutePermission = 'allowed' | 'denied' | 'unknown';

export interface RunGateState {
  readonly test: TestDto | null;
  readonly executePermission: ExecutePermission;
  readonly loading: boolean;
  readonly loadError: string | null;
  /** The total, fallback-free action for the draft's declared state. */
  readonly action: RunAction | null;
  readonly canRun: boolean;
  readonly refusal: RunRefusalState | null;
  /** True for every non-idle phase, so a caller can lock the editor with one flag. */
  readonly executeInFlight: boolean;
  readonly phase: RunPhase;
  readonly preparationMessage: string | null;
  /** `Date.now()` when Run began waiting on the current compile, or null outside that phase. */
  readonly compileStartedAt: number | null;
  /** Set when a Run-started compile did not produce something runnable. */
  readonly compileOutcome: RunCompileOutcome | null;
  readonly run: () => void;
}

interface ApiFailure {
  response?: { status?: number; data?: { error?: string; message?: string } };
  message?: string;
}

function readFailure(error: unknown): { status: number | null; code: string; message: string } {
  const failure = error as ApiFailure;
  return {
    status: failure?.response?.status ?? null,
    // The branch key is `error`. The message is prose and is never parsed (@po, story 10.9).
    code: failure?.response?.data?.error ?? '',
    message: failure?.response?.data?.message ?? failure?.message ?? '',
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * How long an accepted activation holds the gate closed when the caller never reports the run as
 * running (VAL-039). The caller normally releases it sooner, when the run it showed ends.
 */
export const ACCEPTED_LATCH_MS = 3000;

/**
 * A fresh key per user activation (VAL-039): created once when Run is pressed and sent on that
 * activation's execute. Only the compile-then-retry after a `409 COMPILE_REQUIRED` /
 * `RUNTIME_INCOMPATIBLE` takes a key of its own, because the first one was answered with a refusal.
 *
 * The server's `IdempotencyFilter` refuses anything that is not a UUID with
 * `400 INVALID_IDEMPOTENCY_KEY`, so the fallback for environments without `crypto.randomUUID`
 * has to be a well-formed v4 too — a readable `run-<timestamp>` string would turn every run in
 * those environments into a bad request.
 */
function idempotencyKey(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) return fromCrypto;
  const hex = (length: number): string =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variant = ((Math.floor(Math.random() * 4) + 8) % 16).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

export function useRunGate(
  testId: string | null,
  onAccepted?: (executionId: string) => void,
  refreshToken?: string | number,
  options?: RunGateOptions,
): RunGateState {
  const [test, setTest] = useState<TestDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<RunRefusalState | null>(null);
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [preparationMessage, setPreparationMessage] = useState<string | null>(null);
  const [compileStartedAt, setCompileStartedAt] = useState<number | null>(null);
  const [compileOutcome, setCompileOutcome] = useState<RunCompileOutcome | null>(null);
  const [executePermission, setExecutePermission] = useState<ExecutePermission>('unknown');

  /**
   * Set synchronously, before the first `await`. AC-2 counts requests at the mock server, so the
   * window has to be closed rather than described: a `disabled` prop applied after the second
   * activation has already fired proves nothing about how many requests left the client.
   */
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const accepted = useRef(onAccepted);
  accepted.current = onAccepted;
  const runOptions = useRef(options);
  runOptions.current = options;

  /**
   * VAL-039: after acceptance the gate stays closed (`inFlight` held) until the caller has shown
   * the accepted run and seen it end. `accepted` → caller shows it → `running` → it ends → release.
   */
  const acceptedLatch = useRef<'none' | 'accepted' | 'running'>('none');
  const latchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const releaseLatch = useCallback(() => {
    if (latchTimer.current) clearTimeout(latchTimer.current);
    latchTimer.current = undefined;
    if (acceptedLatch.current === 'none') return;
    acceptedLatch.current = 'none';
    inFlight.current = false;
  }, []);
  const callerRunning = options?.isRunning;
  useEffect(() => {
    if (callerRunning === true && acceptedLatch.current === 'accepted') {
      acceptedLatch.current = 'running';
      if (latchTimer.current) clearTimeout(latchTimer.current);
      latchTimer.current = undefined;
    } else if (callerRunning === false && acceptedLatch.current === 'running') {
      releaseLatch();
    }
  }, [callerRunning, releaseLatch]);
  useEffect(() => () => {
    if (latchTimer.current) clearTimeout(latchTimer.current);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let pollAttempt = 0;
    if (!testId) {
      setTest(null);
      setLoading(false);
      return () => {
        current = false;
      };
    }
    setLoading(true);
    setLoadError(null);
    setRefusal(null);
    const load = async (initial: boolean) => {
      try {
        const body = await studioApi.getTest(testId);
        if (!current) return;
        setTest(body);
        setLoading(false);
        if (body.compileStatus === 'COMPILING') {
          pollTimer = setTimeout(() => void load(false), runPollDelay(pollAttempt));
          pollAttempt += 1;
        }
      } catch (error: unknown) {
        if (!current) return;
        if (initial) setTest(null);
        setLoadError(readFailure(error).message || 'Could not read this test');
        setLoading(false);
      }
    };

    void load(true);
    return () => {
      current = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [refreshToken, testId]);

  /*
   * Story 10.48 (ADR-002 O-22): may this caller run the test at all? Read once per selected test.
   *
   * The signal is `GET /tests/{id}/schedule/capabilities` → `canManage`, ruled by @po at
   * validation: no field on the Studio read model says whether the caller may execute, and
   * `canManage` is computed server-side as `canWrite` on the test's CSI whether or not scheduling
   * is enabled. The field is named for scheduling and stands in for execute ONLY while the server's
   * `canExecute == canWrite`, which `StudioServiceExecuteAuthorizationTest` (AC-7a) pins: if execute
   * is ever split from write, that test fails and this read must move to a dedicated field.
   *
   * A failed, pending or absent read is `unknown` and never disables Run. The server answers a
   * refused execute with `403`, which `executeRefusalFor` words.
   */
  useEffect(() => {
    let current = true;
    setExecutePermission('unknown');
    if (!testId) {
      return () => {
        current = false;
      };
    }
    studioSchedulesApi
      .capabilities(testId)
      .then((capabilities) => {
        if (!current || typeof capabilities?.canManage !== 'boolean') return;
        setExecutePermission(capabilities.canManage ? 'allowed' : 'denied');
      })
      .catch(() => {
        // Unknown, not denied: the read is advisory and the server decides on execute.
      });
    return () => {
      current = false;
    };
  }, [testId]);

  const action = test ? runActionFor(test.compileStatus) : null;
  const canRun =
    test !== null &&
    runAvailableFor(test.compileStatus) &&
    phase === 'idle' &&
    executePermission !== 'denied';

  /**
   * Waits for a compile to settle, publishing each body it reads.
   *
   * @param id the draft being prepared
   * @returns the last body read, or null when the wait budget elapsed
   */
  const awaitCompileSettled = useCallback(async (id: string): Promise<TestDto | null> => {
    const deadline = Date.now() + COMPILE_WAIT_BUDGET_MS;
    for (let attempt = 0; ; attempt += 1) {
      const body = await studioApi.getTest(id);
      if (mounted.current) setTest(body);
      if (body.compileStatus !== 'COMPILING') return body;
      // The schedule fits inside the budget; the clock also counts the time the reads took.
      if (attempt >= RUN_COMPILE_POLL_DELAYS_MS.length || Date.now() >= deadline) return null;
      await sleep(RUN_COMPILE_POLL_DELAYS_MS[attempt]);
    }
  }, []);

  /**
   * Brings the saved draft to something the server will dispatch.
   *
   * @param id the draft being prepared
   * @param current the body Run last read
   * @returns the prepared body, or an outcome explaining why there is none
   */
  const prepare = useCallback(
    async (
      id: string,
      current: TestDto,
    ): Promise<{ ready: TestDto } | { outcome: RunCompileOutcome }> => {
      let body = current;
      // The elapsed clock restarts for every compile, including the one a 409 asks for.
      setCompileStartedAt(Date.now());
      if (runActionFor(body.compileStatus) === 'compile') {
        setPhase('compiling');
        setPreparationMessage('Preparing your test…');
        try {
          await studioApi.compileTest(id);
        } catch (error: unknown) {
          const failure = readFailure(error);
          // A 400 is a bound refused before any state changed; a 409 is the lifecycle.
          return {
            outcome: {
              kind: 'refused',
              message: failure.message || 'This test could not be prepared',
              code: failure.code,
            },
          };
        }
      }
      setPhase('compiling');
      setPreparationMessage('Preparing your test…');
      const settled = await awaitCompileSettled(id);
      if (settled === null) return { outcome: { kind: 'timedOut' } };
      body = settled;
      if (body.compileStatus === 'READY') return { ready: body };
      if (body.compileStatus === 'NEEDS_REVISION') {
        return { outcome: { kind: 'needsRevision', diagnostics: body.compileDiagnostics ?? null } };
      }
      return { outcome: { kind: 'failed', error: body.compileError ?? null } };
    },
    [awaitCompileSettled],
  );

  const run = useCallback(() => {
    if (inFlight.current) return;
    if (!test || !testId) return;
    if (!runAvailableFor(test.compileStatus)) return;
    // The server said this caller may not run it: send nothing (story 10.48, AC-10b).
    if (executePermission === 'denied') return;

    inFlight.current = true;
    setPhase(runOptions.current?.isDirty === true ? 'saving' : 'compiling');
    setRefusal(null);
    setLoadError(null);
    setCompileOutcome(null);

    // One key per user activation, created before anything is awaited (VAL-039).
    const activationKey = idempotencyKey();

    const settle = () => {
      inFlight.current = false;
      if (!mounted.current) return;
      setPhase('idle');
      setPreparationMessage(null);
      setCompileStartedAt(null);
    };

    /** Settles an accepted activation, keeping the gate closed while the caller shows the run. */
    const settleAccepted = (executionId: string) => {
      const latched = runOptions.current?.isRunning !== undefined;
      if (latched) {
        acceptedLatch.current = 'accepted';
        latchTimer.current = setTimeout(() => {
          if (acceptedLatch.current === 'accepted') releaseLatch();
        }, ACCEPTED_LATCH_MS);
      }
      accepted.current?.(executionId);
      if (!latched) {
        settle();
        return;
      }
      if (!mounted.current) return;
      setPhase('idle');
      setPreparationMessage(null);
      setCompileStartedAt(null);
    };

    void (async () => {
      try {
        const { saveBeforeRun, isDirty } = runOptions.current ?? {};
        if (isDirty === true && saveBeforeRun) {
          setPreparationMessage('Saving your changes…');
          const saved = await saveBeforeRun();
          if (saved !== 'saved') {
            // The page owns the conflict and error alerts; Run just stops.
            settle();
            return;
          }
        }

        // Re-read after the save: the body Run started from may predate it.
        let body = await studioApi.getTest(testId);
        if (mounted.current) setTest(body);

        let prepared = await prepare(testId, body);
        if ('outcome' in prepared) {
          if (mounted.current) setCompileOutcome(prepared.outcome);
          settle();
          return;
        }
        body = prepared.ready;

        setPhase('starting');
        setCompileStartedAt(null);
        setPreparationMessage('Starting the browser…');
        try {
          const acceptedRun = await studioApi.executeTest(testId, activationKey);
          settleAccepted(acceptedRun.executionId);
          return;
        } catch (error: unknown) {
          const failure = readFailure(error);
          const stale =
            failure.status === 409 &&
            (failure.code === 'COMPILE_REQUIRED' || failure.code === 'RUNTIME_INCOMPATIBLE');
          if (!stale) throw error;

          // The server's gate is the authority: prepare once more, then execute once more.
          const refreshed = await studioApi.getTest(testId);
          if (mounted.current) setTest(refreshed);
          prepared = await prepare(testId, { ...refreshed, compileStatus: 'STALE' });
          if ('outcome' in prepared) {
            if (mounted.current) setCompileOutcome(prepared.outcome);
            settle();
            return;
          }
          setPhase('starting');
          setCompileStartedAt(null);
          setPreparationMessage('Starting the browser…');
          // The first key was answered with a refusal, so the retry carries its own.
          const acceptedRun = await studioApi.executeTest(testId, idempotencyKey());
          settleAccepted(acceptedRun.executionId);
          return;
        }
      } catch (error: unknown) {
        inFlight.current = false;
        if (!mounted.current) return;
        setPhase('idle');
        setPreparationMessage(null);
        setCompileStartedAt(null);
        const failure = readFailure(error);
        const narrative = executeRefusalFor(failure.status, failure.code);
        setRefusal(
          narrative ? { narrative, serverMessage: failure.message, serverCode: failure.code } : null,
        );
        if (!narrative) {
          setLoadError(failure.message || 'The run could not be started');
        }
      }
    })();
  }, [executePermission, prepare, releaseLatch, test, testId]);

  return {
    test,
    executePermission,
    loading,
    loadError,
    action,
    canRun,
    refusal,
    executeInFlight: phase !== 'idle',
    phase,
    preparationMessage,
    compileStartedAt,
    compileOutcome,
    run,
  };
}
