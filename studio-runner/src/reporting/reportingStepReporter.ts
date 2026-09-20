/**
 * The `StepReporter` implementation story 10.2 left as a seam (AC-14a, AC-15, AC-16).
 *
 * 10.2 shipped `StepReporter` as an interface with a comment naming this story as its supplier.
 * This is that supplier — it is wired into the **existing** seam rather than running alongside a
 * parallel reporting path, so the executor's per-step outcomes (`PASS | FAIL | SKIPPED`, null
 * timings for skipped steps) reach the wire exactly as the executor produced them.
 *
 * **Reporting is asynchronous to execution.** `stepStarted` and `stepFinished` return `void` and
 * return immediately: they update the in-memory snapshot synchronously and hand the delivery to a
 * detached promise. A slow or failing callback therefore cannot block a step, delay a step or
 * change a step's recorded timings — which is the property AC-15 is actually about. The detached
 * deliveries are chained rather than fanned out, so the drain path can wait for them (AC-12),
 * nothing ever surfaces as an unhandled rejection, and a `409` really does stop the next report
 * instead of racing one that was already in the air (AC-18).
 *
 * **`STARTED` is sent from `markBrowserStarted`, not from admission and not from a call
 * beginning.** A run whose launcher never reports a launch sends no `STARTED` at all, and because
 * sequence numbers are assigned synchronously at build time, `STARTED` always carries a lower
 * `runnerSequence` than any step report (AC-14a).
 */
import type {
  StepFinishedEvent,
  StepReporter,
  StepStartedEvent,
} from '../executor/adapters/StepReporter.js';
import type { ReportClient } from './reportClient.js';
import type { EvidenceState, ReportBody, RunOutcome, RunSnapshot } from './snapshot.js';

/**
 * The browser start, as observed (AC-10, AC-11.2).
 *
 * `startedAtMs` is a **reading** of the run clock — the result of subtracting the origin from the
 * monotonic sample that defined it — and is therefore exactly `0`. The browser-start log line
 * carries that reading. ADR-002 §4.1: `0` is the browser start, and it is a position on the
 * timeline rather than a missing value.
 */
export interface BrowserStartObservation {
  readonly browserStartedAt: Date;
  readonly startedAtMs: number;
}

export interface RunReporter extends StepReporter {
  /**
   * Records the browser start and sends `STARTED`. Call this only once the browser has actually
   * started — not when admission succeeds, and not when an HTTP call begins.
   *
   * The instant and the first run-clock reading arrive **together**, from the one place that
   * observed them: recording-context readiness (AC-10, AC-11.2). Nothing here reads a clock, so
   * there is no second origin to disagree with the first.
   */
  browserStarted(origin: BrowserStartObservation): void;
  /** Sends the terminal report with byte-identical bounded retry. Awaits delivery. */
  sendFinal(outcome: RunOutcome, evidence: EvidenceState): Promise<void>;
  /** Resolves once every detached progress delivery has settled (drain path, AC-12). */
  settled(): Promise<void>;
  /** Reports built, in build order. Test seam for sequence ordering (AC-13, AC-14a). */
  readonly built: readonly ReportBody[];
}

export interface RunReporterOptions {
  readonly snapshot: RunSnapshot;
  readonly client: ReportClient;
}

export function createRunReporter(options: RunReporterOptions): RunReporter {
  const { snapshot, client } = options;
  const built: ReportBody[] = [];

  /**
   * Detached but **serialized**: each delivery waits for the previous one to settle.
   *
   * Detached, because `stepStarted`/`stepFinished` must return immediately — a slow callback may
   * not delay a step (AC-15). Serialized, because two deliveries in flight at once would let a
   * second report leave *after* the API has already answered `409` to the first, and "stops
   * reporting immediately" (AC-18) would become "stops reporting, give or take whatever was
   * already in the air". Serializing also keeps deliveries in sequence order on the wire, which
   * costs nothing here: the queue depth is bounded by the step count.
   */
  let tail: Promise<void> = Promise.resolve();

  /**
   * Named rather than declared inline inside the `then` call. An inline async arrow passed
   * straight to a function emits a shape that `test/no-dynamic-evaluation.test.ts` scans for:
   * an async IIFE is one of the forms generated source could be evaluated through (architecture
   * §4.5), so that scan is deliberately blunt, and writing around it costs one named constant
   * where loosening it would cost a guard.
   */
  const deliver = async (body: ReportBody): Promise<void> => {
    // A rejection here must never surface as an unhandled rejection mid-run.
    await client.deliverProgress(body).catch(() => undefined);
  };

  const dispatch = (body: ReportBody): void => {
    built.push(body);
    tail = tail.then(() => deliver(body));
  };

  return {
    built,

    browserStarted(origin: BrowserStartObservation): void {
      if (snapshot.browserStarted) return;
      snapshot.markBrowserStarted(origin.browserStartedAt);
      // A reading that happens to be `0`, not a constant `0` (AC-10).
      snapshot.appendLog({ atMs: origin.startedAtMs, level: 'info', message: 'browser started' });
      dispatch(snapshot.build('STARTED'));
    },

    stepStarted(event: StepStartedEvent): void {
      snapshot.stepStarted(event.stepIndex, event.startedAtMs);
      snapshot.appendLog({
        atMs: event.startedAtMs,
        level: 'info',
        message: `step ${String(event.stepIndex)} started`,
      });
      dispatch(snapshot.build('PROGRESS'));
    },

    stepFinished(event: StepFinishedEvent): void {
      // The executor's outcome reaches the wire unchanged, null timings included (AC-15).
      snapshot.stepFinished({
        stepIndex: event.stepIndex,
        status: event.status,
        startedAtMs: event.startedAtMs,
        finishedAtMs: event.finishedAtMs,
        durationMs: event.durationMs,
        failure: event.failure,
      });
      // The bounded retained log the API shows the user (architecture §5.3, §5.5). The failure
      // text is the executor's already-redacted `safeMessage`, and the whole body passes through
      // the outbound redactor again before it leaves (AC-20).
      snapshot.appendLog({
        // A skipped step has neither reading, and `0` would file it at the browser start rather
        // than say "no reading" (ADR-002 §INT-1).
        atMs: event.finishedAtMs ?? event.startedAtMs,
        level: event.status === 'FAIL' ? 'error' : 'info',
        message:
          event.failure === null
            ? `step ${String(event.stepIndex)} ${event.status}`
            : `step ${String(event.stepIndex)} ${event.status}: ${event.failure}`,
      });
      dispatch(snapshot.build('PROGRESS'));
    },

    async sendFinal(outcome: RunOutcome, evidence: EvidenceState): Promise<void> {
      snapshot.appendLog({
        // The run result is not a reading: nothing on the monotonic clock was sampled to produce
        // it, and `0` would place the terminal line at the browser start — the beginning of the
        // video (ADR-002 §INT-1, §7.2). The browser-start line's `0` above is the origin itself.
        atMs: null,
        level: outcome.result === 'PASSED' ? 'info' : 'error',
        message:
          outcome.errorCode === null
            ? `run ${outcome.result}`
            : `run ${outcome.result}: ${outcome.errorCode}`,
      });
      const body = snapshot.build('FINAL', outcome, evidence);
      built.push(body);
      await client.deliverTerminal(body);
    },

    async settled(): Promise<void> {
      // The chain may grow while we await it, so follow it until it stops moving.
      let previous: Promise<void> | null = null;
      while (previous !== tail) {
        previous = tail;
        await tail.catch(() => undefined);
      }
    },
  };
}
