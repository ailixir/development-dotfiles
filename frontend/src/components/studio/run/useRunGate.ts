import { useCallback, useEffect, useRef, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import { studioSchedulesApi } from '@/services/api/studioSchedulesApi';
import type { TestDetailDto } from '@/types/studio/studioTypes';
import type {
  GuidedStartContext,
  GuidedStartRequest,
  GuidedStartUnavailableCode,
} from '@/types/studio/studioGuidedTypes';
import { isStudioCapabilities } from '@/utils/config/studioCapabilities';
import { runAvailableFor, runModeFor, type RunMode } from './runEnablement';
import {
  EXECUTE_FORBIDDEN_NARRATIVE,
  executeRefusalFor,
  type ExecuteRefusalNarrative,
} from './executeRefusals';

/**
 * The Run control's one source of truth (story 10.11a, AC-1, AC-2, AC-4).
 *
 * The readiness fact comes from a single `GET /tests/{id}` body and from nothing else: not from
 * the list projection recombined with a detail read, not from a Redux slice, and — the point of
 * the story — not from the client's own opinion of the author's English. Story 10.10 made the same
 * argument for the saved body and it is the same argument here: a client that takes apart
 * facts the server returned together is asserting a correspondence the server never promised.
 *
 * ## One Run, three modes (STUDIO-OBS-008 AC-2)
 *
 * Run saves the draft if it is dirty and re-reads it. Then the fresh read's readiness decides:
 *  - `READY` replays it through `POST /tests/{id}/execute`, under one key per activation;
 *  - `UNLEARNED` starts a guided learning session with no base and no boundary hint;
 *  - `NEEDS_RELEARN` starts a mixed-mode guided session with `baseRevisionId = confirmedRevisionId`
 *    and `firstLearnStepId = firstChangedStepId`, both as served (D-3), or with the first current
 *    step when `readinessReason` is `BASE_IDENTITY_INCOMPLETE` (D-4). The client never sends a step
 *    positioned after the server's k;
 *  - `LEARNING` keeps Run disabled: a session is already running.
 *
 * A guided start follows plan P6: after the save, a fresh `GET /tests/{id}` and then
 * `GET /tests/{id}/capabilities` (read directly, never from a cached hook answer). The capability's
 * `guidedStart.context` is sent unchanged, and only when its test, revisions and environment agree
 * exactly with the fresh read; `guidedStart.available: false` shows the existing refusal and makes
 * no request. A draft with no steps never starts a session (D-11). The session itself, its keys,
 * polling and the automatic finalize belong to `useGuidedSession`, which the page passes in as
 * `startLearn`. There is no automatic retry anywhere: a refusal is shown as it is.
 *
 * "Learn again from step N" (T0 ruling A1.6) and the explicit first-step learn of a
 * `BASE_IDENTITY_INCOMPLETE` refusal (architect P4) are the same start with a named step, through
 * {@link RunGateState.learnFrom}. Their conditions are re-checked against the fresh read; if they no
 * longer hold, nothing is sent.
 *
 * A refusal is held until the next activation. `POST /tests/{id}/execute` refuses *before any
 * dispatch effect* — no execution row, no ledger row, no browser — so a refused activation leaves
 * the surface exactly as it was, and saying so is the whole content of the narratives.
 */

export interface RunRefusalState {
  /** The wording, chosen by status and — for a `409` — by `error`. Never by the message. */
  readonly narrative: ExecuteRefusalNarrative;
  /** The server's own prose. Shown so it can be quoted; never parsed. */
  readonly serverMessage: string;
  /** The `error` the server sent, or `''`. Shown for an undeclared code, never branched twice. */
  readonly serverCode: string;
}

/** What Run is doing right now. */
export type RunPhase = 'idle' | 'saving' | 'starting';

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
  /**
   * Starts a guided learning session (STUDIO-OBS-008 AC-2): the page's
   * `useGuidedSession(testId).startLearn`. It resolves when the start was answered or refused, and
   * rejects only when no response arrived. Without it, a draft that needs learning cannot be run
   * from this control, and Run stays disabled for it.
   */
  readonly startLearn?: (request: GuidedStartRequest) => Promise<void>;
}

/**
 * Why the client itself sent no guided start (plan P6): the capability said `guidedStart` is
 * unavailable (`FORBIDDEN_SCOPE` or `RUNTIME_INCOMPATIBLE`), its start context disagreed with the
 * fresh read of the test (a save landed in between), or an explicit learn whose conditions no longer
 * hold on the fresh read. None is a session or a state.
 */
export type LearnStartBlock =
  | { readonly kind: 'unavailable'; readonly code: GuidedStartUnavailableCode }
  | { readonly kind: 'mismatch' };

/**
 * An explicit learn from a named step:
 *  - `drift`: "Learn again from step N" after a replay drift (T0 ruling A1.6). Sent only while the
 *    test is `READY`, its confirmed revision is the replayed one (`revisionId`), and the step is in
 *    the current draft;
 *  - `firstStep`: the explicit first-step learn a `BASE_IDENTITY_INCOMPLETE` refusal offers
 *    (architect P4, D-4), from the first current step on the confirmed base.
 */
export type LearnFromRequest =
  | { readonly kind: 'drift'; readonly stepId: string; readonly revisionId: string }
  | { readonly kind: 'firstStep' };

/**
 * Whether the caller may start a run of this test, as far as the server has said (story 10.48).
 * `unknown` while the read is pending or after it failed: the server stays the authority, so only an
 * explicit `denied` disables Run.
 */
export type ExecutePermission = 'allowed' | 'denied' | 'unknown';

export interface RunGateState {
  readonly test: TestDetailDto | null;
  readonly executePermission: ExecutePermission;
  readonly loading: boolean;
  readonly loadError: string | null;
  /** The Run mode for the draft's declared state (`replay`, `learn`, `relearn` or `busy`). */
  readonly mode: RunMode | null;
  readonly canRun: boolean;
  readonly refusal: RunRefusalState | null;
  /** Why the last guided start was not sent by the client. Cleared by the next activation. */
  readonly learnBlock: LearnStartBlock | null;
  /** True for every non-idle phase, so a caller can lock the editor with one flag. */
  readonly executeInFlight: boolean;
  readonly phase: RunPhase;
  readonly preparationMessage: string | null;
  readonly run: () => void;
  /** An explicit learn from a named step. Same save, read, capability and start as Run. */
  readonly learnFrom: (request: LearnFromRequest) => void;
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

/**
 * How long an accepted activation holds the gate closed when the caller never reports the run as
 * running (VAL-039). The caller normally releases it sooner, when the run it showed ends.
 */
export const ACCEPTED_LATCH_MS = 3000;

/**
 * A fresh key per user activation (VAL-039): created once when Run is pressed and sent on that
 * activation's execute.
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

/** The existing fallback wording when a Run could not be started and no narrative applies. */
const START_FAILED = 'The run could not be started';

/** The optional start hints, by mode (D-3, D-4). */
type StartHints = Pick<GuidedStartRequest, 'baseRevisionId' | 'firstLearnStepId'>;

/**
 * `NEEDS_RELEARN`: the base is the confirmed revision and the boundary is the server's first changed
 * step, both as served (D-3); `BASE_IDENTITY_INCOMPLETE` names the first current step instead (D-4).
 * A value the server did not serve is not sent.
 */
function relearnHints(test: TestDetailDto): StartHints {
  const firstLearnStepId =
    test.readinessReason === 'BASE_IDENTITY_INCOMPLETE' ? test.steps[0]?.id : test.firstChangedStepId;
  return {
    ...(test.confirmedRevisionId ? { baseRevisionId: test.confirmedRevisionId } : {}),
    ...(firstLearnStepId ? { firstLearnStepId } : {}),
  };
}

/** The hints for an explicit learn, or `null` when its conditions no longer hold on the fresh read. */
function learnFromHints(test: TestDetailDto, request: LearnFromRequest): StartHints | null {
  if (test.confirmedRevisionId === null) return null;
  if (request.kind === 'firstStep') {
    const first = test.steps[0]?.id;
    return first ? { baseRevisionId: test.confirmedRevisionId, firstLearnStepId: first } : null;
  }
  const holds =
    test.readiness === 'READY' &&
    test.confirmedRevisionId === request.revisionId &&
    test.steps.some((step) => step.id === request.stepId);
  return holds ? { baseRevisionId: test.confirmedRevisionId, firstLearnStepId: request.stepId } : null;
}

/** Plan P6: the capability's start context must agree exactly with the fresh read, or nothing starts. */
function contextMatches(context: GuidedStartContext, test: TestDetailDto): boolean {
  return (
    context.testId === test.id &&
    context.sourceRevision === String(test.sourceRevision) &&
    context.configurationRevision === String(test.configurationRevision) &&
    context.environmentId === test.environment
  );
}

/** What one activation asks for. */
type Activation = { readonly type: 'run' } | { readonly type: 'learnFrom'; readonly request: LearnFromRequest };

export function useRunGate(
  testId: string | null,
  onAccepted?: (executionId: string) => void,
  refreshToken?: string | number,
  options?: RunGateOptions,
): RunGateState {
  const [test, setTest] = useState<TestDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<RunRefusalState | null>(null);
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [preparationMessage, setPreparationMessage] = useState<string | null>(null);
  const [executePermission, setExecutePermission] = useState<ExecutePermission>('unknown');
  const [learnBlock, setLearnBlock] = useState<LearnStartBlock | null>(null);

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
    setLearnBlock(null);
    const load = async (initial: boolean) => {
      try {
        const body = await studioApi.getTest(testId);
        if (!current) return;
        setTest(body);
        setLoading(false);
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

  const mode = test ? runModeFor(test.readiness) : null;
  const canLearn = options?.startLearn !== undefined;
  const canRun =
    test !== null &&
    runAvailableFor(test.readiness) &&
    (mode === 'replay' || canLearn) &&
    phase === 'idle' &&
    executePermission !== 'denied';

  const activate = useCallback((intent: Activation) => {
    if (inFlight.current) return;
    if (!test || !testId) return;
    if (intent.type === 'run' && !runAvailableFor(test.readiness)) return;
    // The server said this caller may not run it: send nothing (story 10.48, AC-10b).
    if (executePermission === 'denied') return;

    inFlight.current = true;
    setPhase(runOptions.current?.isDirty === true ? 'saving' : 'starting');
    setRefusal(null);
    setLoadError(null);
    setLearnBlock(null);

    // One key per user activation, created before anything is awaited (VAL-039).
    const activationKey = idempotencyKey();

    const settle = () => {
      inFlight.current = false;
      if (!mounted.current) return;
      setPhase('idle');
      setPreparationMessage(null);
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
    };

    /**
     * Plan P6: the capability is read after the save and the fresh read, and its exact context is
     * sent with the mode's hints. Every way it can say no ends here with no start request.
     */
    const startGuided = async (body: TestDetailDto, hints: StartHints): Promise<void> => {
      const startLearn = runOptions.current?.startLearn;
      // D-11: a draft with no steps never starts a session; the gate also disables Run for it.
      if (!startLearn || body.steps.length === 0) {
        settle();
        return;
      }
      setPhase('starting');
      setPreparationMessage('Starting the browser…');
      let capabilities: unknown;
      try {
        capabilities = await studioApi.getCapabilities(testId);
      } catch (error: unknown) {
        inFlight.current = false;
        if (!mounted.current) return;
        setPhase('idle');
        setPreparationMessage(null);
        // Unavailable, never simulated. A 403 is the same refusal execute would give.
        const failure = readFailure(error);
        if (failure.status === 403) {
          setRefusal({ narrative: EXECUTE_FORBIDDEN_NARRATIVE, serverMessage: failure.message, serverCode: failure.code });
        } else {
          setLoadError(START_FAILED);
        }
        return;
      }
      if (!isStudioCapabilities(capabilities)) {
        if (mounted.current) setLoadError(START_FAILED);
        settle();
        return;
      }
      if (!capabilities.guidedStart.available) {
        if (mounted.current) setLearnBlock({ kind: 'unavailable', code: capabilities.guidedStart.code });
        settle();
        return;
      }
      const { context } = capabilities.guidedStart;
      if (!contextMatches(context, body)) {
        if (mounted.current) setLearnBlock({ kind: 'mismatch' });
        settle();
        return;
      }
      try {
        await startLearn({ ...context, ...hints });
      } catch {
        // No response ever arrived. The hook keeps its pointer, so the next Run retries the same
        // request under the same key; nothing is retried here.
        if (mounted.current) setLoadError(START_FAILED);
      }
      settle();
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

        // Re-read after the save: the body Run started from may predate it, and a saved edit
        // changes readiness. The fresh read alone decides the mode.
        const body = await studioApi.getTest(testId);
        if (mounted.current) setTest(body);

        if (intent.type === 'learnFrom') {
          const hints = learnFromHints(body, intent.request);
          if (hints === null) {
            // The conditions no longer hold on the fresh read: nothing starts, and the page says so (W5 UX-13).
            if (mounted.current) setLearnBlock({ kind: 'mismatch' });
            settle();
            return;
          }
          await startGuided(body, hints);
          return;
        }

        const freshMode = runModeFor(body.readiness);
        if (freshMode === 'busy') {
          settle();
          return;
        }
        if (freshMode === 'learn') {
          await startGuided(body, {});
          return;
        }
        if (freshMode === 'relearn') {
          await startGuided(body, relearnHints(body));
          return;
        }

        setPhase('starting');
        setPreparationMessage('Starting the browser…');
        const acceptedRun = await studioApi.executeTest(testId, activationKey);
        settleAccepted(acceptedRun.executionId);
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
          setLoadError(failure.message || START_FAILED);
        }
      }
    })();
  }, [executePermission, releaseLatch, test, testId]);

  const run = useCallback(() => activate({ type: 'run' }), [activate]);
  const learnFrom = useCallback(
    (request: LearnFromRequest) => activate({ type: 'learnFrom', request }),
    [activate],
  );

  return {
    test,
    executePermission,
    loading,
    loadError,
    mode,
    canRun,
    refusal,
    learnBlock,
    executeInFlight: phase !== 'idle',
    phase,
    preparationMessage,
    run,
    learnFrom,
  };
}
