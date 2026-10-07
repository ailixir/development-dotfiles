import { useEffect, useRef } from 'react';
import type { CompilePollShape } from '@/components/studio/review/compilePollBounds';

/**
 * The list's live-refresh backoff, in the same shape as the compile watch. The first re-read comes
 * soon after a run appears; the ceiling keeps a long run from holding a request slot every second.
 */
export const LIVE_RUNS_POLL_SHAPE: CompilePollShape = {
  firstDelayMs: 2_000,
  backoffFactor: 1.5,
  maxDelayMs: 15_000,
};

export interface LiveRunsRefreshOptions {
  /** True while any visible row is `PENDING` or `RUNNING`. False stops the watch. */
  active: boolean;
  /** One background re-read of the list. */
  refresh: () => Promise<void>;
  shape?: CompilePollShape;
}

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Re-polls the run list with backoff while it shows an active run (story 10.46, AC-3).
 *
 * Paused while the tab is hidden; on return it reads once straight away and starts the backoff
 * over. Stops as soon as no visible row is active, and on unmount.
 */
export function useLiveRunsRefresh({ active, refresh, shape = LIVE_RUNS_POLL_SHAPE }: LiveRunsRefreshOptions): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const { firstDelayMs, backoffFactor, maxDelayMs } = shape;

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = firstDelayMs;

    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (stopped || isDocumentHidden()) return;
      timer = setTimeout(() => {
        void tick();
      }, delay);
    };
    const tick = async () => {
      timer = null;
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        await refreshRef.current();
      } catch {
        // A failed background read is retried on the next tick.
      } finally {
        inFlight = false;
      }
      delay = Math.min(Math.round(delay * backoffFactor), maxDelayMs);
      schedule();
    };
    const onVisibilityChange = () => {
      if (isDocumentHidden()) {
        clear();
        return;
      }
      delay = firstDelayMs;
      if (timer === null && !inFlight) void tick();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopped = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active, firstDelayMs, backoffFactor, maxDelayMs]);
}

export default useLiveRunsRefresh;
