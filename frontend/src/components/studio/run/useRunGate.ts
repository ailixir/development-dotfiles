import { useCallback, useEffect, useRef, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import type { TestDto } from '@/types/studio/studioTypes';
import { runEnablementFor, type RunEnablement } from './runEnablement';
import { executeRefusalFor, type ExecuteRefusalNarrative } from './executeRefusals';

/**
 * The Run control's one source of truth (story 10.11a, AC-1, AC-2, AC-4).
 *
 * The readiness fact comes from a single `GET /tests/{id}` body and from nothing else: not from
 * the list projection recombined with a detail read, not from a Redux slice, and — the point of
 * the story — not from the client's own opinion of the author's English. Story 10.10 made the same
 * argument for the confirmation body and it is the same argument here: a client that takes apart
 * facts the server returned together is asserting a correspondence the server never promised.
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

export interface RunGateState {
  readonly test: TestDto | null;
  readonly loading: boolean;
  readonly loadError: string | null;
  /** The total, fallback-free enablement for the draft's declared state. */
  readonly enablement: RunEnablement | null;
  readonly canRun: boolean;
  readonly refusal: RunRefusalState | null;
  readonly executeInFlight: boolean;
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

export function useRunGate(
  testId: string | null,
  onAccepted?: (executionId: string) => void,
): RunGateState {
  const [test, setTest] = useState<TestDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<RunRefusalState | null>(null);
  const [executeInFlight, setExecuteInFlight] = useState(false);

  /**
   * Set synchronously, before the first `await`. AC-2 counts requests at the mock server, so the
   * window has to be closed rather than described: a `disabled` prop applied after the second
   * activation has already fired proves nothing about how many requests left the client.
   */
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const accepted = useRef(onAccepted);
  accepted.current = onAccepted;

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
    studioApi
      .getTest(testId)
      .then((body) => {
        if (!current) return;
        setTest(body);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!current) return;
        setTest(null);
        setLoadError(readFailure(error).message || 'Could not read this draft');
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [testId]);

  const enablement = test ? runEnablementFor(test.compileStatus) : null;
  const canRun = enablement?.canRun === true && !executeInFlight;

  const run = useCallback(() => {
    if (inFlight.current) return;
    // The gate, and the whole of it. `compileStatus` is the server's word; there is no second
    // term, and a term about the author's English is what this story removed.
    if (!test || !testId) return;
    if (!runEnablementFor(test.compileStatus).canRun) return;

    inFlight.current = true;
    setExecuteInFlight(true);
    setRefusal(null);

    studioApi
      .executeTest(testId)
      .then((acceptedRun) => {
        inFlight.current = false;
        if (!mounted.current) return;
        setExecuteInFlight(false);
        accepted.current?.(acceptedRun.executionId);
      })
      .catch((error: unknown) => {
        inFlight.current = false;
        if (!mounted.current) return;
        setExecuteInFlight(false);
        const failure = readFailure(error);
        const narrative = executeRefusalFor(failure.status, failure.code);
        setRefusal(
          narrative
            ? { narrative, serverMessage: failure.message, serverCode: failure.code }
            : null,
        );
        if (!narrative) {
          setLoadError(failure.message || 'The run could not be started');
        }
      });
  }, [test, testId]);

  return {
    test,
    loading,
    loadError,
    enablement,
    canRun,
    refusal,
    executeInFlight,
    run,
  };
}
