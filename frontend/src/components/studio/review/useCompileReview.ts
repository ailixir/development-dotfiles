import { useCallback, useEffect, useRef, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import type { TestDto } from '@/types/studio/studioTypes';
import { readArtifactHash, type ArtifactHashResult } from './artifactHash';
import {
  COMPILE_WATCH_WINDOW_MS,
  compilePollSchedule,
  isTerminalCompileStatus,
} from './compilePollBounds';

/**
 * The review surface's one source of truth (story 10.10).
 *
 * **The identity lives in one place.** Everything the confirmation body carries comes from a
 * single `GET /tests/{id}` response held as one immutable value for the duration of the review —
 * not four selectors over a Redux slice, not a re-read per field, not a list entry recombined
 * with a detail entry. ADR-002 §16.3's argument for why the diagnostics need no `sourceRevision`
 * of their own is the same argument: *"a client aligning `steps[i]` to
 * `compileDiagnostics.steps[i]` is aligning two facts that were read together."* That guarantee
 * is the server's and it survives only if the client does not take it apart. A refetch produces a
 * **new** value and an explicitly unconfirmed control, never a partial update of the old one.
 */

export interface ConflictState {
  readonly operation: 'confirm' | 'compile';
  readonly code: string;
  /** Prose from the server. Shown, never branched on (@po ruling on 10.9). */
  readonly message: string;
}

export interface RejectionState {
  readonly code: string;
  readonly message: string;
}

export interface CompileReviewState {
  readonly test: TestDto | null;
  readonly loading: boolean;
  readonly loadError: string | null;
  readonly artifactHash: ArtifactHashResult | null;
  readonly conflict: ConflictState | null;
  readonly rejection: RejectionState | null;
  readonly compileAccepted: boolean;
  readonly confirmInFlight: boolean;
  readonly watchGaveUp: boolean;
  readonly confirm: () => void;
  readonly recompile: () => void;
}

interface ApiFailure {
  response?: { status?: number; data?: { error?: string; message?: string } };
  message?: string;
}

function readFailure(error: unknown): { status: number | null; code: string; message: string } {
  const failure = error as ApiFailure;
  return {
    status: failure?.response?.status ?? null,
    // The branch key is `error`. The message is prose and is never parsed.
    code: failure?.response?.data?.error ?? '',
    message: failure?.response?.data?.message ?? failure?.message ?? '',
  };
}

export function useCompileReview(testId: string): CompileReviewState {
  const [test, setTest] = useState<TestDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [rejection, setRejection] = useState<RejectionState | null>(null);
  const [compileAccepted, setCompileAccepted] = useState(false);
  const [confirmInFlight, setConfirmInFlight] = useState(false);
  const [watchGaveUp, setWatchGaveUp] = useState(false);

  /**
   * Set synchronously, before the first `await`. A `disabled` prop set after the second click has
   * already fired proves nothing — AC-13 counts requests, so this has to close the window rather
   * than describe it.
   */
  const inFlight = useRef(false);
  const mounted = useRef(true);
  /** The exact object the user is looking at. Read as one value, never field by field. */
  const held = useRef<TestDto | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const adopt = useCallback((next: TestDto) => {
    held.current = next;
    setTest(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await studioApi.getTest(testId);
      if (!mounted.current) {
        return;
      }
      adopt(next);
      setLoadError(null);
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setLoadError(readFailure(error).message || 'The draft could not be read.');
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [adopt, testId]);

  useEffect(() => {
    setLoading(true);
    setWatchGaveUp(false);
    void load();
  }, [load]);

  // The bounded COMPILING watch (AC-23). Stops on every terminal compile state, on unmount, and
  // on a refused read. When the window closes it says it stopped looking — never that anything
  // failed.
  const status = test?.compileStatus ?? null;
  useEffect(() => {
    if (status !== 'COMPILING') {
      return undefined;
    }
    const delays = compilePollSchedule(COMPILE_WATCH_WINDOW_MS);
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const tick = async () => {
      if (stopped) {
        return;
      }
      try {
        const next = await studioApi.getTest(testId);
        if (stopped || !mounted.current) {
          return;
        }
        adopt(next);
        if (isTerminalCompileStatus(next.compileStatus)) {
          return;
        }
      } catch (error) {
        // A refused read stops the watch rather than hammering a route that is saying no.
        if (!stopped && mounted.current) {
          setLoadError(readFailure(error).message || 'The draft could not be read.');
        }
        return;
      }
      schedule();
    };

    const schedule = () => {
      if (stopped) {
        return;
      }
      if (index >= delays.length) {
        if (mounted.current) {
          setWatchGaveUp(true);
        }
        return;
      }
      const delay = delays[index];
      index += 1;
      timer = setTimeout(() => void tick(), delay);
    };

    schedule();
    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [adopt, status, testId]);

  const confirm = useCallback(() => {
    // Read the guard and close it in the same synchronous turn as the activation.
    if (inFlight.current) {
      return;
    }
    const current = held.current;
    if (!current || current.compileStatus !== 'AWAITING_CONFIRMATION') {
      return;
    }
    const revisionId = current.currentCandidateRevisionId;
    if (!revisionId) {
      return;
    }
    const hash = readArtifactHash(current);
    if (!hash.available) {
      return;
    }
    inFlight.current = true;
    setConfirmInFlight(true);

    // Exactly the four declared fields, all four out of `current` — the one response the user is
    // looking at. Not re-read, not recombined, not taken from a store another request may have
    // moved underneath.
    const body = {
      revisionId,
      artifactHash: hash.value,
      sourceRevision: current.sourceRevision,
      configurationRevision: current.configurationRevision,
    };

    void (async () => {
      try {
        const confirmed = await studioApi.confirmCompile(testId, body);
        if (mounted.current) {
          adopt(confirmed);
          setConflict(null);
        }
      } catch (error) {
        const failure = readFailure(error);
        if (failure.status === 409) {
          if (mounted.current) {
            setConflict({ operation: 'confirm', code: failure.code, message: failure.message });
          }
          // STALE_CANDIDATE is the caller's to clear: refetch so the reader sees what the draft
          // holds now. Nothing is re-sent — the refreshed candidate is unconfirmed and stays that
          // way until the reader acts again.
          if (failure.code === 'STALE_CANDIDATE') {
            await load();
          }
        } else if (mounted.current) {
          setLoadError(failure.message || 'Confirming did not go through.');
        }
      } finally {
        inFlight.current = false;
        if (mounted.current) {
          setConfirmInFlight(false);
        }
      }
    })();
  }, [adopt, load, testId]);

  const recompile = useCallback(() => {
    setRejection(null);
    setConflict(null);
    void (async () => {
      try {
        await studioApi.compileTest(testId);
        if (mounted.current) {
          setCompileAccepted(true);
        }
        await load();
      } catch (error) {
        const failure = readFailure(error);
        if (!mounted.current) {
          return;
        }
        if (failure.status === 409) {
          setConflict({ operation: 'compile', code: failure.code, message: failure.message });
        } else if (failure.status === 400) {
          setRejection({ code: failure.code, message: failure.message });
        } else {
          setLoadError(failure.message || 'Asking for a translation did not go through.');
        }
      }
    })();
  }, [load, testId]);

  return {
    test,
    loading,
    loadError,
    artifactHash: test ? readArtifactHash(test) : null,
    conflict,
    rejection,
    compileAccepted,
    confirmInFlight,
    watchGaveUp,
    confirm,
    recompile,
  };
}
