import { useCallback, useEffect, useRef, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import type { CompileDiagnostics, CompileError, TestDto } from '@/types/studio/studioTypes';
import { runActionFor, runAvailableFor, type RunAction } from './runEnablement';
import { executeRefusalFor, type ExecuteRefusalNarrative } from './executeRefusals';

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

/** How long Run waits for a compile before giving up: the attempt budget plus a sweep interval. */
const COMPILE_WAIT_BUDGET_MS = 330_000;

/** The poll interval while a compile settles. Matches the Code tab's, deliberately. */
const COMPILE_POLL_MS = 600;

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
}

export interface RunGateState {
  readonly test: TestDto | null;
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
 * A fresh key per activation, so Run's own retry cannot start a second run.
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
  const [compileOutcome, setCompileOutcome] = useState<RunCompileOutcome | null>(null);

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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
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
          pollTimer = setTimeout(() => void load(false), COMPILE_POLL_MS);
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

  const action = test ? runActionFor(test.compileStatus) : null;
  const canRun = test !== null && runAvailableFor(test.compileStatus) && phase === 'idle';

  /**
   * Waits for a compile to settle, publishing each body it reads.
   *
   * @param id the draft being prepared
   * @returns the last body read, or null when the wait budget elapsed
   */
  const awaitCompileSettled = useCallback(async (id: string): Promise<TestDto | null> => {
    const deadline = Date.now() + COMPILE_WAIT_BUDGET_MS;
    for (;;) {
      const body = await studioApi.getTest(id);
      if (mounted.current) setTest(body);
      if (body.compileStatus !== 'COMPILING') return body;
      if (Date.now() >= deadline) return null;
      await sleep(COMPILE_POLL_MS);
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

    inFlight.current = true;
    setPhase(runOptions.current?.isDirty === true ? 'saving' : 'compiling');
    setRefusal(null);
    setLoadError(null);
    setCompileOutcome(null);

    const settle = () => {
      inFlight.current = false;
      if (!mounted.current) return;
      setPhase('idle');
      setPreparationMessage(null);
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
        setPreparationMessage('Starting the browser…');
        try {
          const acceptedRun = await studioApi.executeTest(testId, idempotencyKey());
          accepted.current?.(acceptedRun.executionId);
          settle();
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
          setPreparationMessage('Starting the browser…');
          const acceptedRun = await studioApi.executeTest(testId, idempotencyKey());
          accepted.current?.(acceptedRun.executionId);
          settle();
          return;
        }
      } catch (error: unknown) {
        inFlight.current = false;
        if (!mounted.current) return;
        setPhase('idle');
        setPreparationMessage(null);
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
  }, [prepare, test, testId]);

  return {
    test,
    loading,
    loadError,
    action,
    canRun,
    refusal,
    executeInFlight: phase !== 'idle',
    phase,
    preparationMessage,
    compileOutcome,
    run,
  };
}
