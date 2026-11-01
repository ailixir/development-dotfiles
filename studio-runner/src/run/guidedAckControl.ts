/**
 * The invocation control of one guided dispatch inside the child (SC008-E15, fence-before-effect under an asynchronous ack).
 *
 * The journal fence lives in the server. beginInvocation() asks for it once (`requestFence`, an IPC round trip the child service supplies)
 * and returns that one memoised promise to every caller: concurrent effectful calls, the password write and the secret take-over all wait
 * on the same ack. The phase moves PREPARING -> INVOKING only when the ack arrives; nothing is set when the request is sent.
 *
 * Fail closed: a refused or failed request, an abort or deadline while the ack is pending, and an abort of the parent signal reject the memo.
 * A rejected memo is final: it is never retried and a late ack cannot revive it. The server, not this object, knows whether its journal wrote
 * the fence; it reconciles that from its own state (a nack and an ack lost in flight look the same here).
 *
 * This module imports no Playwright package; it works against the InvocationControl shape alone.
 */
import type { InvocationControl, ReplayError } from '../executor/observedReplay.js';
import { ObservedRefusal } from '../validator/observedReferencePolicy.js';

export interface AckedInvocationControlOptions {
  /** Absolute end of the dispatch window on `now()`'s clock. */
  readonly deadlineMs: number;
  readonly now: () => number;
  /** The session-level cancel (the server's abort notice). */
  readonly signal: AbortSignal;
  /** Sends the one fence request and resolves on the server's ack; rejects on a nack, a malformed or out-of-order frame, or a lost channel. */
  readonly requestFence: () => Promise<void>;
}

export function createAckedInvocationControl(options: AckedInvocationControlOptions): InvocationControl & { abortPending(reason: 'TIMEOUT' | 'CANCELLED'): void } {
  const { deadlineMs, now, signal: parent, requestFence } = options;
  const abort = new AbortController();
  let phase: InvocationControl['phase'] = 'PREPARING';
  let failure: ReplayError | null = null;
  let memo: Promise<void> | undefined;
  /** Set only while the ack is pending: rejects the memo and releases the timer and the listener. */
  let settlePending: ((error: unknown) => void) | undefined;

  /** `cause` is what a pending ack rejects with (the original error of a refused fence); by default the closed refusal. */
  const poisonWith = (reason: 'TIMEOUT' | 'CANCELLED', cause?: unknown): void => {
    if (phase === 'POISONED' || phase === 'FINISHED') return;
    failure = reason === 'TIMEOUT' && phase === 'INVOKING' ? 'OUTCOME_UNKNOWN' : reason;
    phase = 'POISONED';
    abort.abort();
    settlePending?.(cause ?? new ObservedRefusal(failure));
  };
  const poison = (reason: 'TIMEOUT' | 'CANCELLED'): void => { poisonWith(reason); };

  const check = (): void => {
    if (parent.aborted) poison('CANCELLED');
    if (now() >= deadlineMs) poison('TIMEOUT');
    if (failure !== null) throw new ObservedRefusal(failure);
  };

  const refused = (error: unknown): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- passes on the original failure of the fence (or the closed refusal) untouched
    const failed = new Promise<void>((_resolve, reject) => { reject(error); });
    failed.catch(() => undefined); // each caller sees the rejection; this only keeps an unconsumed one from being unhandled
    return failed;
  };

  const beginInvocation = (): Promise<void> => {
    if (memo !== undefined) return memo;
    try {
      check();
    } catch (error) {
      memo = refused(error);
      return memo;
    }
    memo = new Promise<void>((resolve, reject) => {
      const onAbort = (): void => { poison('CANCELLED'); };
      const timer = setTimeout(() => { poison('TIMEOUT'); }, Math.max(1, deadlineMs - now()));
      const release = (): void => {
        settlePending = undefined;
        clearTimeout(timer);
        parent.removeEventListener('abort', onAbort);
      };
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- see refused()
      settlePending = (error: unknown): void => { release(); reject(error); };
      parent.addEventListener('abort', onAbort, { once: true });
      let sent: Promise<void>;
      try {
        sent = requestFence();
      } catch (error) {
        poisonWith('CANCELLED', error);
        return;
      }
      sent.then(
        () => {
          // A late ack after an abort, a deadline or an earlier refusal finds the memo already rejected and the phase poisoned: ignored.
          if (settlePending === undefined || phase !== 'PREPARING') return;
          try {
            check();
          } catch {
            return; // check() poisoned the control, which already rejected the memo
          }
          release();
          phase = 'INVOKING';
          resolve();
        },
        (error: unknown) => {
          if (settlePending === undefined) return;
          // No ack and no retry: the dispatch can no longer cross the fence. The caller still sees the original error (JOURNAL_UNAVAILABLE).
          poisonWith('CANCELLED', error);
        },
      );
    });
    memo.catch(() => undefined);
    return memo;
  };

  return {
    deadlineMs,
    remainingMs: () => Math.max(0, deadlineMs - now()),
    signal: abort.signal,
    get phase() { return phase; },
    check,
    beginInvocation,
    poison,
    abortPending: poison,
  };
}
